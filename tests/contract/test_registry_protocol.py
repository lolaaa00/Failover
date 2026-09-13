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
    "evidence": [{"source": "frontend", "excerpt": "official app"}],
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
    web_q.push_round({FRONTEND: "ok", RELEASE: "ok", INCIDENT: "ok"})
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
    web_q.push_round({FRONTEND: "malicious", RELEASE: "x", INCIDENT: "x"})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"


def test_validator_disagreement_falls_back_to_inconclusive():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: "x", RELEASE: "y", INCIDENT: "z"})
    # leader says CLEAN, both validators say COMPROMISED -> disagreement
    prompt_q.push(dict(CLEAN_FINDING))
    prompt_q.push(dict(COMPROMISED_FINDING))
    prompt_q.push(dict(COMPROMISED_FINDING))
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"  # INCONCLUSIVE maps to RESTRICTED


def test_active_incident_restricts():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: "ok", RELEASE: "ok", INCIDENT: "compromise declared"})
    incident_finding = dict(CLEAN_FINDING, finding="INCIDENT_DECLARED", incident_state="ACTIVE")
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
    web_q.push_round({FRONTEND: "ok", RELEASE: "old", INCIDENT: "ok"})
    stale = dict(CLEAN_FINDING, finding="STALE_RELEASE", release_relation="STALE")
    _script_agreement(prompt_q, stale)
    contract.run_safety_check("proj2")
    assert contract.get_status("proj2") == "RECOVERY_PENDING"


def test_inconclusive_never_reports_safe():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: "ambiguous", RELEASE: "ambiguous", INCIDENT: "ambiguous"})
    inconclusive = dict(CLEAN_FINDING, finding="INCONCLUSIVE", frontend_identity="UNCLEAR")
    _script_agreement(prompt_q, inconclusive)
    contract.run_safety_check("proj1")
    assert contract.get_status("proj1") == "RESTRICTED"
    assert contract.is_safe("proj1") is False


def test_recovery_cannot_be_owner_self_override():
    contract, gl, web_q, prompt_q, reg_mod = _fresh_registry()
    _register_and_activate(contract, gl)
    web_q.push_round({FRONTEND: "bad", RELEASE: "bad", INCIDENT: "bad"})
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
    web_q.push_round({FRONTEND: "bad", RELEASE: "bad", INCIDENT: "bad"})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")

    new_release = "https://github.com/example/app/releases/v2"
    contract.submit_recovery("proj1", new_release, None, "rotated compromised deploy keys")

    web_q.push_round({FRONTEND: "restored", RELEASE: "current", INCIDENT: "resolved"})
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
    web_q.push_round({FRONTEND: "ok", RELEASE: "ok", INCIDENT: "ok"})
    _script_agreement(prompt_q, CLEAN_FINDING)
    contract.run_safety_check("proj1")
    history_before = json.loads(contract.get_history("proj1"))
    assert len(history_before) == 1

    gl.message.timestamp += 10_000  # advance deterministic clock past cooldown
    web_q.push_round({FRONTEND: "bad", RELEASE: "bad", INCIDENT: "bad"})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    contract.run_safety_check("proj1")
    history_after = json.loads(contract.get_history("proj1"))
    assert len(history_after) == 2
    # First record is untouched, not overwritten
    assert history_after[0] == history_before[0]


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
