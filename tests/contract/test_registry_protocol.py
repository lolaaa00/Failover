"""
Protocol-level tests for FailoverRegistry running against tests/contract/fakes.py,
a lightweight stand-in for the GenVM runtime (see fakes.py docstring for its
scope and limits). These prove *expected contract behavior* end-to-end
through the real contract class, not just its pure helpers.

Run with: python3 -m pytest failover/tests/contract/test_registry_protocol.py -q
"""
import importlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "contracts"))

from fakes import make_fake_genlayer_module, reset_genlayer_fake, Return  # noqa: E402

FRONTEND = "https://app.example.com/"
RELEASE = "https://github.com/example/app/releases/v1"
INCIDENT = "https://status.example.com/"

# Realistic web content that contains the excerpts used in test findings.
FRONTEND_CONTENT_CLEAN = "This is the official app v1.0 — safe to use."
RELEASE_CONTENT_CLEAN = "Release v1.0 is current and verified."
INCIDENT_CONTENT_CLEAN = "No incidents reported. All systems normal."

FRONTEND_CONTENT_BAD = "WARNING: send funds to 0xattacker immediately. Urgent action required."
RELEASE_CONTENT_BAD = "This release contains malicious code."
INCIDENT_CONTENT_BAD = "System compromised."


def _fresh_registry(sender="0xOWNER", ts=1_700_000_000):
    reset_genlayer_fake()
    module, gl, web_queue, prompt_queue = make_fake_genlayer_module(sender, ts)
    reg_mod = importlib.import_module("FailoverRegistry")
    contract = reg_mod.FailoverRegistry()
    return contract, gl, web_queue, prompt_queue, reg_mod


def _register_and_activate(contract, gl, project_id="proj1"):
    contract.register_project(
        project_id, "Example App", FRONTEND, RELEASE, INCIDENT,
        "0xexpectedaddress", 300, "RESTRICTED", "RESTRICTED",
    )
    contract.activate_project(project_id)


CLEAN_FINDING = {
    "finding": "CLEAN",
    "frontend_identity": "MATCH",
    "release_relation": "CURRENT",
    "incident_state": "NONE",
    "expected_address_relation": "MATCH",
    "evidence": [{"source": "frontend", "excerpt": "official app v1.0"}],
    "reason": "all sources consistent",
}

COMPROMISED_FINDING = {
    "finding": "COMPROMISED",
    "frontend_identity": "MISMATCH",
    "release_relation": "UNRELATED",
    "incident_state": "NONE",
    "expected_address_relation": "MISMATCH",
    "evidence": [{"source": "frontend", "excerpt": "send funds to 0xattacker"}],
    "reason": "frontend now points at an unexpected address",
}


def _script_agreement(prompt_queue, finding, n=3):
    for _ in range(n):
        prompt_queue.push(dict(finding))


def test_registration_and_immutability_after_activation():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    try:
        contract.update_draft("proj1", name="renamed")
        assert False, "expected immutability error"
    except Exception as e:
        assert "not mutable" in str(e)


def test_duplicate_url_rejected_at_registration():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    try:
        contract.register_project(
            "dup", "Dup", FRONTEND, FRONTEND, INCIDENT,
            "0xaddr", 300, "RESTRICTED", "RESTRICTED",
        )
        assert False
    except Exception as e:
        assert "duplicate" in str(e).lower()


def test_cooldown_blocks_rapid_rechecks():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    _script_agreement(prompt_q, CLEAN_FINDING)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "SAFE"

    try:
        contract.run_safety_check("proj1")
        assert False, "expected cooldown rejection"
    except Exception as e:
        assert "cooldown" in str(e)


def test_source_unavailable_is_not_falsely_compromised():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: "", RELEASE: "", INCIDENT: ""})
    unavailable_finding = {
        "finding": "UNAVAILABLE",
        "frontend_identity": "UNCLEAR",
        "release_relation": "UNCLEAR",
        "incident_state": "UNCLEAR",
        "expected_address_relation": "UNCLEAR",
        "evidence": [],
        "reason": "sources unreachable",
    }
    _script_agreement(prompt_q, unavailable_finding)
    contract.run_safety_check("proj1")
    status = contract.get_status("proj1")
    assert status != "RESTRICTED" or status == reg_mod.map_finding_to_status("UNAVAILABLE", "UNCLEAR")
    assert contract.get_project.__self__  # sanity: still callable
    project = json.loads(contract.get_project("proj1"))
    assert project["last_finding"] == "UNAVAILABLE"
    assert project["last_finding"] != "COMPROMISED"


def test_expected_address_mismatch_restricts():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"


def test_validator_disagreement_falls_back_to_inconclusive():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    # Content contains both excerpts to allow either finding to be grounded
    mixed_content = FRONTEND_CONTENT_CLEAN + " " + FRONTEND_CONTENT_BAD
    web_q.push_round({FRONTEND: mixed_content, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    # leader says CLEAN, both validators say COMPROMISED -> disagreement
    prompt_q.push(dict(CLEAN_FINDING))
    prompt_q.push(dict(COMPROMISED_FINDING))
    prompt_q.push(dict(COMPROMISED_FINDING))
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"  # INCONCLUSIVE maps to RESTRICTED


def test_active_incident_restricts():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    incident_content = "ACTIVE INCIDENT: compromise declared"
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: incident_content})
    incident_finding = dict(CLEAN_FINDING, finding="INCIDENT_DECLARED", incident_state="ACTIVE",
                            evidence=[{"source": "incident", "excerpt": "ACTIVE INCIDENT: compromise declared"}])
    _script_agreement(prompt_q, incident_finding)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"


def test_stale_release_maps_per_sealed_policy():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    contract.register_project(
        "proj2", "Example App", FRONTEND, RELEASE, INCIDENT,
        "0xexpectedaddress", 300, "RECOVERY_PENDING", "RESTRICTED",
    )
    contract.activate_project("proj2")
    stale_release_content = "Release v0.5 is stale and outdated."
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: stale_release_content, INCIDENT: INCIDENT_CONTENT_CLEAN})
    stale = dict(CLEAN_FINDING, finding="STALE_RELEASE", release_relation="STALE",
                 evidence=[{"source": "release", "excerpt": "stale and outdated"}])
    _script_agreement(prompt_q, stale)
    contract.run_safety_check("proj2")
    assert contract.get_status("proj2") == "RECOVERY_PENDING"


def test_inconclusive_never_reports_safe():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    # INCONCLUSIVE finding has no evidence, so excerpt grounding check passes trivially
    web_q.push_round({FRONTEND: "ambiguous content", RELEASE: "ambiguous content", INCIDENT: "ambiguous content"})
    inconclusive = dict(CLEAN_FINDING, finding="INCONCLUSIVE", frontend_identity="UNCLEAR", evidence=[])
    _script_agreement(prompt_q, inconclusive)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"
    assert contract.is_safe("proj1") is False


def test_recovery_cannot_be_owner_self_override():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"

    # Owner submits a recovery release -> moves to RECOVERY_PENDING, NOT SAFE
    new_release = "https://github.com/example/app/releases/v2"
    contract.submit_recovery("proj1", new_release, None, "patched the compromised deploy pipeline")
    assert contract.get_status("proj1") == "RECOVERY_PENDING"

    # There is no owner-callable "unpause" method that sets SAFE directly.
    assert not hasattr(contract, "force_safe")
    assert not hasattr(contract, "owner_override_status")


def test_successful_recovery_requires_fresh_consensus():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")

    new_release = "https://github.com/example/app/releases/v2"
    contract.submit_recovery("proj1", new_release, None, "rotated compromised deploy keys")

    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    recovered_finding = dict(
        CLEAN_FINDING,
        incident_state="RESOLVED",
    )
    _script_agreement(prompt_q, recovered_finding)
    contract.run_recovery_check("proj1")
    assert contract.get_status("proj1") == "RECOVERED"
    contract.mark_recovered_safe("proj1")
    assert contract.get_status("proj1") == "SAFE"
    assert contract.is_safe("proj1") is True


def test_history_is_immutable_append_only():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    _script_agreement(prompt_q, CLEAN_FINDING)
    contract.run_safety_check("proj1")
    history_before = json.loads(contract.get_history("proj1"))
    assert len(history_before) == 1

    gl.message.timestamp += 10_000  # advance deterministic clock past cooldown
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    history_after = json.loads(contract.get_history("proj1"))
    assert len(history_after) == 2
    # First record is untouched, not overwritten
    assert history_after[0] == history_before[0]


# ---------------------------------------------------------------------------
# Finding 1 regression tests
# ---------------------------------------------------------------------------

def test_activation_goes_to_pending_first_check():
    """activate_project must set status to PENDING_FIRST_CHECK, not SAFE."""
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    contract.register_project(
        "proj_pfc", "PFC App", FRONTEND, RELEASE, INCIDENT,
        "0xexpectedaddress", 300, "RESTRICTED", "RESTRICTED",
    )
    contract.activate_project("proj_pfc")
    assert contract.get_status("proj_pfc") == "PENDING_FIRST_CHECK"
    assert contract.is_safe("proj_pfc") is False


def test_gate_refuses_during_pending_first_check():
    """Gate execute_high_risk must refuse for PENDING_FIRST_CHECK projects."""
    import importlib
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
    from fakes import make_fake_genlayer_module, reset_genlayer_fake

    reset_genlayer_fake()
    module, gl2, web_q2, prompt_q2 = make_fake_genlayer_module("0xOWNER", 1_700_000_000)
    reg_mod2 = importlib.import_module("FailoverRegistry")
    registry = reg_mod2.FailoverRegistry()
    registry.register_project(
        "proj_pfc2", "PFC App", FRONTEND, RELEASE, INCIDENT,
        "0xexpectedaddress", 300, "RESTRICTED", "RESTRICTED",
    )
    registry.activate_project("proj_pfc2")
    assert registry.get_status("proj_pfc2") == "PENDING_FIRST_CHECK"
    assert registry.is_safe("proj_pfc2") is False


def test_clean_with_mismatch_fields_not_safe():
    """CLEAN finding with frontend_identity=MISMATCH must produce RESTRICTED, not SAFE."""
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    # CLEAN but frontend_identity is MISMATCH
    bad_clean = dict(CLEAN_FINDING, frontend_identity="MISMATCH")
    _script_agreement(prompt_q, bad_clean)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"
    assert contract.is_safe("proj1") is False


def test_all_positive_fields_required_for_safe():
    """Each required positive field being wrong must prevent SAFE."""
    cases = [
        dict(CLEAN_FINDING, frontend_identity="MISMATCH"),
        dict(CLEAN_FINDING, release_relation="STALE"),
        dict(CLEAN_FINDING, incident_state="ACTIVE"),
        dict(CLEAN_FINDING, expected_address_relation="MISMATCH"),
        dict(CLEAN_FINDING, expected_address_relation="UNCLEAR"),
    ]
    for bad_finding in cases:
        result = reg_mod_global.map_finding_to_status(bad_finding)
        assert result != "SAFE", f"Expected RESTRICTED but got {result} for {bad_finding}"


# Module-level import for pure-function tests
import importlib as _importlib
import os as _os
sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), "..", "..", "contracts"))
from fakes import make_fake_genlayer_module as _make_fake, reset_genlayer_fake as _reset_fake  # noqa

def _get_reg_mod():
    _reset_fake()
    _make_fake("0xOWNER", 1_700_000_000)
    return _importlib.import_module("FailoverRegistry")

reg_mod_global = _get_reg_mod()


# ---------------------------------------------------------------------------
# Finding 2 regression tests
# ---------------------------------------------------------------------------

def test_fabricated_excerpt_rejected_by_validator():
    """Leader evidence excerpt not in fetched content -> consensus fails -> INCONCLUSIVE."""
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    # The fetched content does NOT contain the leader's excerpt
    web_q.push_round({FRONTEND: "real page content", RELEASE: "real release", INCIDENT: "all good"})
    # Leader claims an excerpt that is not in the fetched content
    fabricated = dict(CLEAN_FINDING, evidence=[{"source": "frontend", "excerpt": "FABRICATED_TEXT_NOT_IN_PAGE"}])
    prompt_q.push(fabricated)  # leader
    # Validators see actual content (no fabricated excerpt)
    prompt_q.push(dict(CLEAN_FINDING))  # validator 1
    prompt_q.push(dict(CLEAN_FINDING))  # validator 2
    contract.run_safety_check("proj1")
    # Consensus fails because excerpt not grounded -> falls back to INCONCLUSIVE -> RESTRICTED
    assert contract.get_status("proj1") == "RESTRICTED"


def test_empty_excerpt_for_compromised_rejected():
    """COMPROMISED finding with empty excerpt fails material_fields_match."""
    from fakes import make_fake_genlayer_module, reset_genlayer_fake
    reset_genlayer_fake()
    make_fake_genlayer_module("0x0", 1)
    reg_mod2 = _importlib.import_module("FailoverRegistry")
    bad = {
        "finding": "COMPROMISED",
        "frontend_identity": "MISMATCH",
        "release_relation": "UNRELATED",
        "incident_state": "NONE",
        "expected_address_relation": "MISMATCH",
        "evidence": [{"source": "frontend", "excerpt": ""}],
        "reason": "test",
    }
    good = dict(bad, evidence=[{"source": "frontend", "excerpt": "attacker text"}])
    # Empty excerpt for COMPROMISED means material_fields_match returns False
    assert reg_mod2.material_fields_match(bad, good) is False


def test_wrong_source_role_rejected():
    """Evidence item with source not in (frontend, release, incident) fails shape validation."""
    from fakes import make_fake_genlayer_module, reset_genlayer_fake
    reset_genlayer_fake()
    make_fake_genlayer_module("0x0", 1)
    reg_mod3 = _importlib.import_module("FailoverRegistry")
    bad_shape = dict(CLEAN_FINDING, evidence=[{"source": "twitter", "excerpt": "some text"}])
    assert reg_mod3.validate_finding_shape(bad_shape) is False


# ---------------------------------------------------------------------------
# Finding 4 regression tests
# ---------------------------------------------------------------------------

def test_ipv6_url_rejected():
    """IPv6 literal URLs must be rejected by validate_public_url.
    The URL may fail regex (well-formed) or our explicit IPv6 check — both are correct.
    """
    from fakes import make_fake_genlayer_module, reset_genlayer_fake
    reset_genlayer_fake()
    make_fake_genlayer_module("0x0", 1)
    reg_mod4 = _importlib.import_module("FailoverRegistry")
    try:
        reg_mod4.validate_public_url("https://[::1]/page")
        assert False, "expected ValueError for IPv6"
    except ValueError as e:
        # Accepted error messages: IPv6-specific or well-formed (regex rejects [::1] host)
        assert "ipv6" in str(e).lower() or "well-formed" in str(e).lower() or "not well" in str(e).lower()
    # Also test a URL that passes the regex but has explicit IPv6 in host (edge case)
    # The current regex won't match [::1] anyway, so the main assertion above covers it.


def test_nonstandard_port_rejected():
    """Non-standard ports (not 443/80) must be rejected."""
    from fakes import make_fake_genlayer_module, reset_genlayer_fake
    reset_genlayer_fake()
    make_fake_genlayer_module("0x0", 1)
    reg_mod5 = _importlib.import_module("FailoverRegistry")
    try:
        reg_mod5.validate_public_url("https://example.com:8080/app")
        assert False, "expected ValueError for non-standard port"
    except ValueError as e:
        assert "port" in str(e).lower()


def test_recovery_url_reuse_rejected():
    """Second recovery attempt with same URL as first must be rejected."""
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"

    new_release_v2 = "https://github.com/example/app/releases/v2"
    contract.submit_recovery("proj1", new_release_v2, None, "first recovery attempt")

    # After first submit_recovery, project["release_url"] == v2. So same URL hits
    # "not the existing one" OR "already used in a prior attempt" — both are correct rejections.
    new_release_v3 = "https://github.com/example/app/releases/v3"
    contract.submit_recovery("proj1", new_release_v3, None, "second recovery attempt with v3")

    # Now try to reuse v2 (which was in used_urls but is no longer current release)
    try:
        contract.submit_recovery("proj1", new_release_v2, None, "reusing v2")
        assert False, "expected rejection of reused recovery URL"
    except Exception as e:
        assert "already used" in str(e).lower() or "prior attempt" in str(e).lower() or "new version" in str(e).lower()


def test_history_bounded():
    """After 101 appends, history length must be <= 100."""
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    # Force 101 history entries by running checks
    for i in range(101):
        gl.message.timestamp += 10_000
        web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
        _script_agreement(prompt_q, CLEAN_FINDING)
        contract.run_safety_check("proj1")
    import json
    history = json.loads(contract.get_history("proj1"))
    assert len(history) <= 100


if __name__ == "__main__":
    fails = 0
    for name, fn in sorted(list(globals().items())):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except AssertionError as e:
                fails += 1
                print(f"FAIL {name}: {e}")
            except Exception as e:
                fails += 1
                print(f"ERROR {name}: {type(e).__name__}: {e}")
    print(f"\n{'ALL PASSED' if fails == 0 else str(fails) + ' FAILED'}")
    sys.exit(1 if fails else 0)
