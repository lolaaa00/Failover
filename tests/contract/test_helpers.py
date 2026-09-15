"""Pure-python unit tests for FailoverRegistry helper functions.

These do not require a GenVM runtime: they import the contract module with
a fake `genlayer` package installed (see fakes.py) purely so
`from genlayer import *` resolves, then exercise the free functions that
contain no gl.* runtime calls.

Run with: python3 -m pytest failover/tests/contract/test_helpers.py -q
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "contracts"))

from fakes import make_fake_genlayer_module, reset_genlayer_fake  # noqa: E402


def _load_registry_module():
    reset_genlayer_fake()
    make_fake_genlayer_module()
    return importlib.import_module("FailoverRegistry")


reg = _load_registry_module()


def test_canonicalize_url_strips_trailing_slash_and_default_port():
    assert reg.canonicalize_url("https://Example.com:443/path/") == "https://example.com/path"
    assert reg.canonicalize_url("https://example.com") == "https://example.com/"


def test_validate_public_url_rejects_http():
    try:
        reg.validate_public_url("http://example.com")
        assert False, "expected rejection"
    except ValueError:
        pass


def test_validate_public_url_rejects_localhost_and_private_ips():
    for bad in [
        "https://localhost/app",
        "https://127.0.0.1/app",
        "https://127.0.0.2/app",
        "https://10.0.0.5/app",
        "https://172.16.0.5/app",
        "https://192.168.1.5/app",
        "https://169.254.1.1/app",
        "https://8.8.8.8/app",
    ]:
        try:
            reg.validate_public_url(bad)
            assert False, f"expected rejection for {bad}"
        except ValueError:
            pass


def test_validate_public_url_rejects_credentials_and_fragment():
    try:
        reg.validate_public_url("https://user:pass@example.com/")
        assert False
    except ValueError:
        pass
    try:
        reg.validate_public_url("https://example.com/path#frag")
        assert False
    except ValueError:
        pass


def test_validate_public_url_rejects_bad_host_and_port_edges():
    for bad in [
        "https://example.com:80/app",
        "https://example.com:8443/app",
        "https://bad_host.example.com/app",
        "https://-bad.example.com/app",
        "https://bad-.example.com/app",
        "https://example..com/app",
    ]:
        try:
            reg.validate_public_url(bad)
            assert False, f"expected rejection for {bad}"
        except ValueError:
            pass


def test_validate_public_url_rejects_over_length():
    long_url = "https://example.com/" + ("a" * 600)
    try:
        reg.validate_public_url(long_url)
        assert False
    except ValueError:
        pass


def test_validate_public_url_accepts_good_url():
    assert reg.validate_public_url("https://example.com/status") == "https://example.com/status"


def test_canonical_domain_groups_same_host():
    a = reg.canonical_domain("https://example.com/a")
    b = reg.canonical_domain("https://example.com/b")
    assert a == b == "example.com"


def test_validate_finding_shape_rejects_missing_keys():
    assert reg.validate_finding_shape({"finding": "CLEAN"}) is False


def test_validate_finding_shape_rejects_bad_enum():
    candidate = {
        "finding": "NOT_A_FINDING",
        "frontend_identity": "MATCH",
        "release_relation": "CURRENT",
        "incident_state": "NONE",
        "expected_address_relation": "MATCH",
        "evidence": [],
        "reason": "x",
    }
    assert reg.validate_finding_shape(candidate) is False


def _good_candidate(**overrides):
    base = {
        "finding": "CLEAN",
        "frontend_identity": "MATCH",
        "release_relation": "CURRENT",
        "incident_state": "NONE",
        "expected_address_relation": "MATCH",
        "evidence": [
            {"source": "frontend", "excerpt": "official app"},
            {"source": "release", "excerpt": "current release"},
            {"source": "incident", "excerpt": "no incidents"},
        ],
        "reason": "looks fine",
    }
    base.update(overrides)
    return base


def test_validate_finding_shape_accepts_good_shape():
    assert reg.validate_finding_shape(_good_candidate()) is True


def test_validate_finding_shape_rejects_too_many_evidence_items():
    ev = [{"source": "frontend", "excerpt": "x"} for _ in range(20)]
    assert reg.validate_finding_shape(_good_candidate(evidence=ev)) is False


def test_material_fields_match_true_for_identical():
    a = _good_candidate()
    b = _good_candidate(reason="different prose but same material fields")
    assert reg.material_fields_match(a, b) is True


def test_material_fields_match_rejects_changed_or_extra_evidence():
    a = _good_candidate()
    b = _good_candidate(
        evidence=[
            {"source": "frontend", "excerpt": "official app"},
            {"source": "release", "excerpt": "different release"},
            {"source": "incident", "excerpt": "no incidents"},
        ]
    )
    assert reg.material_fields_match(a, b) is False
    c = _good_candidate(evidence=_good_candidate()["evidence"] + [{"source": "frontend", "excerpt": "extra"}])
    assert reg.material_fields_match(a, c) is False


def test_material_fields_match_false_for_disagreement():
    a = _good_candidate()
    b = _good_candidate(finding="COMPROMISED")
    assert reg.material_fields_match(a, b) is False


def test_material_fields_match_requires_grounded_excerpt_unless_unavailable():
    a = _good_candidate(evidence=[])
    b = _good_candidate(evidence=[])
    assert reg.material_fields_match(a, b) is False
    a2 = _good_candidate(finding="UNAVAILABLE", frontend_identity="UNCLEAR",
                          release_relation="UNCLEAR", incident_state="UNCLEAR",
                          expected_address_relation="UNCLEAR", evidence=[])
    b2 = _good_candidate(finding="UNAVAILABLE", frontend_identity="UNCLEAR",
                          release_relation="UNCLEAR", incident_state="UNCLEAR",
                          expected_address_relation="UNCLEAR", evidence=[])
    assert reg.material_fields_match(a2, b2) is True


def test_map_finding_to_status_clean_is_safe():
    assert reg.map_finding_to_status("CLEAN", "NONE") == "SAFE"


def test_map_finding_to_status_clean_dict_requires_full_evidence():
    """The dict-aware CLEAN branch is not on the contract's live call path
    for a CLEAN finding (_safe_status_from_finding never delegates CLEAN to
    this function), but it is documented and unit-tested as a complete,
    dict-aware mapping in its own right -- it must not silently accept a
    CLEAN finding with incomplete source evidence just because this
    function, unlike _safe_status_from_finding, was exercised in isolation."""
    assert reg.map_finding_to_status(_good_candidate()) == "SAFE"
    assert (
        reg.map_finding_to_status(
            _good_candidate(evidence=[{"source": "frontend", "excerpt": "official app"}])
        )
        == "RESTRICTED"
    )


def test_safe_status_requires_required_evidence_and_address_policy():
    required_project = {
        "expected_address": "0xabc",
        "stale_release_policy": "RESTRICTED",
        "unavailable_policy": "RESTRICTED",
    }
    optional_project = dict(required_project, expected_address="")
    assert reg._safe_status_from_finding(required_project, _good_candidate()) == "SAFE"
    assert reg._safe_status_from_finding(
        required_project,
        _good_candidate(expected_address_relation="NOT_VISIBLE"),
    ) == "RESTRICTED"
    assert reg._safe_status_from_finding(
        optional_project,
        _good_candidate(expected_address_relation="NOT_VISIBLE"),
    ) == "SAFE"
    assert reg._safe_status_from_finding(
        required_project,
        _good_candidate(evidence=[{"source": "frontend", "excerpt": "official app"}]),
    ) == "RESTRICTED"


def test_map_finding_to_status_compromised_and_impersonated_restrict():
    assert reg.map_finding_to_status("COMPROMISED", "NONE") == "RESTRICTED"
    assert reg.map_finding_to_status("IMPERSONATED", "NONE") == "RESTRICTED"


def test_map_finding_to_status_incident_active_vs_resolved():
    assert reg.map_finding_to_status("INCIDENT_DECLARED", "ACTIVE") == "RESTRICTED"
    assert reg.map_finding_to_status("INCIDENT_DECLARED", "RESOLVED") == "RECOVERY_PENDING"


def test_map_finding_to_status_stale_release_follows_sealed_policy():
    assert reg.map_finding_to_status("STALE_RELEASE", "NONE", "RECOVERY_PENDING") == "RECOVERY_PENDING"
    assert reg.map_finding_to_status("STALE_RELEASE", "NONE", "RESTRICTED") == "RESTRICTED"


def test_map_finding_to_status_inconclusive_never_safe():
    assert reg.map_finding_to_status("INCONCLUSIVE", "NONE") == "RESTRICTED"


def test_map_finding_to_status_unavailable_follows_sealed_policy():
    assert reg.map_finding_to_status("UNAVAILABLE", "NONE", "RESTRICTED", "RECOVERY_PENDING") == "RECOVERY_PENDING"
    assert reg.map_finding_to_status("UNAVAILABLE", "NONE", "RESTRICTED", "RESTRICTED") == "RESTRICTED"


def test_is_status_safe():
    assert reg.is_status_safe("SAFE") is True
    assert reg.is_status_safe("RECOVERED") is True
    assert reg.is_status_safe("RESTRICTED") is False
    assert reg.is_status_safe("RECOVERY_PENDING") is False


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
    print(f"\n{'ALL PASSED' if fails == 0 else str(fails) + ' FAILED'}")
    sys.exit(1 if fails else 0)
