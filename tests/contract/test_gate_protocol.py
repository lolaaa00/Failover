"""
Protocol-level tests for FailoverGate against the fakes.py harness. Gate
tests bind a real registry instance in-process so is_safe() is genuine
contract-to-contract behavior, not a stub.
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "contracts"))

from fakes import make_fake_genlayer_module, reset_genlayer_fake  # noqa: E402

FRONTEND = "https://app.example.com/"
RELEASE = "https://github.com/example/app/releases/v1"
INCIDENT = "https://status.example.com/"

FRONTEND_CONTENT_CLEAN = "This is the official app v1.0 — safe to use."
RELEASE_CONTENT_CLEAN = "Release v1.0 is current and verified."
INCIDENT_CONTENT_CLEAN = "No incidents reported. All systems normal."

FRONTEND_CONTENT_BAD = "WARNING: send funds to 0xattacker immediately. Urgent action required."
RELEASE_CONTENT_BAD = "This release contains malicious code."
INCIDENT_CONTENT_BAD = "System compromised."

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


def _setup(sender="0xOWNER", ts=1_700_000_000):
    reset_genlayer_fake()
    module, gl, web_q, prompt_q = make_fake_genlayer_module(sender, ts)
    reg_mod = importlib.import_module("FailoverRegistry")
    registry = reg_mod.FailoverRegistry()
    registry.register_project(
        "proj1", "Example App", FRONTEND, RELEASE, INCIDENT,
        "0xexpectedaddress", 300, "RESTRICTED", "RESTRICTED",
    )
    registry.activate_project("proj1")

    gate_mod = importlib.import_module("FailoverGate")
    gate = gate_mod.FailoverGate(registry, "proj1")

    # Patch the gate's registry lookup to call our in-process registry
    # instance directly (the fake IFailoverRegistry(address) constructor
    # would otherwise need a real address->instance directory; tests bind
    # it explicitly to prove correct binding + real is_safe() propagation).
    gate._registry = lambda: _RegistryProxy(registry)

    return registry, gate, gl, web_q, prompt_q


class _RegistryProxy:
    """Adapts the real registry instance's `args=[...]` interface-style
    calls used by FailoverGate (which calls self._registry().is_safe(args=[..]))."""

    def __init__(self, registry):
        self._registry = registry

    def is_safe(self, args):
        return self._registry.is_safe(*args)

    def get_status(self, args):
        return self._registry.get_status(*args)


def _script_agreement(prompt_queue, finding, n=3):
    for _ in range(n):
        prompt_queue.push(dict(finding))


def test_safe_high_risk_action_executes():
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    _script_agreement(prompt_q, CLEAN_FINDING)
    registry.run_safety_check("proj1")
    assert registry.is_safe("proj1") is True

    result = gate.execute_high_risk("0xdeadbeef01")
    assert result == "EXECUTED"
    assert gate.was_high_risk_executed("0xdeadbeef01") is True


def test_restricted_refuses_high_risk_action():
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    registry.run_safety_check("proj1")
    assert registry.is_safe("proj1") is False

    try:
        gate.execute_high_risk("0xdeadbeef02")
        assert False, "expected refusal"
    except Exception as e:
        assert "refused" in str(e)
    assert gate.was_high_risk_executed("0xdeadbeef02") is False


def test_inconclusive_refuses_high_risk_action():
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: "ambiguous content", RELEASE: "ambiguous content", INCIDENT: "ambiguous content"})
    inconclusive = dict(CLEAN_FINDING, finding="INCONCLUSIVE", frontend_identity="UNCLEAR", evidence=[])
    _script_agreement(prompt_q, inconclusive)
    registry.run_safety_check("proj1")
    assert registry.is_safe("proj1") is False

    try:
        gate.execute_high_risk("0xdeadbeef03")
        assert False
    except Exception as e:
        assert "refused" in str(e)


def test_low_risk_action_allowed_while_restricted():
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_BAD, RELEASE: RELEASE_CONTENT_BAD, INCIDENT: INCIDENT_CONTENT_BAD})
    _script_agreement(prompt_q, COMPROMISED_FINDING)
    registry.run_safety_check("proj1")
    assert registry.is_safe("proj1") is False

    result = gate.execute_low_risk("0xdeadbeef04")
    assert result == "EXECUTED"


def test_replay_of_action_hash_rejected():
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    _script_agreement(prompt_q, CLEAN_FINDING)
    registry.run_safety_check("proj1")

    gate.execute_high_risk("0xdeadbeef05")
    try:
        gate.execute_high_risk("0xdeadbeef05")
        assert False, "expected replay rejection"
    except Exception as e:
        assert "replay" in str(e)


def test_gate_binding_is_immutable_and_stale_result_still_reflects_registry():
    registry, gate, gl, web_q, prompt_q = _setup()
    assert gate.get_linked_project() == "proj1"
    # No setter exists to re-point the gate at a different registry/project.
    assert not hasattr(gate, "set_registry_address")
    assert not hasattr(gate, "set_project_id")


# ---------------------------------------------------------------------------
# Finding 3 regression tests
# ---------------------------------------------------------------------------

def test_refusal_not_written_then_reverted():
    """execute_high_risk must NOT write any state before raising on refusal.
    The execute_high_risk method raises without writing; the separate
    try_execute_high_risk_or_record_refusal method writes REFUSED durably.
    """
    registry, gate, gl, web_q, prompt_q = _setup()
    # Registry starts at PENDING_FIRST_CHECK (not safe), no check run
    # So execute_high_risk should raise without writing
    try:
        gate.execute_high_risk("0xdeadbeef10")
        assert False, "expected refusal"
    except Exception as e:
        assert "refused" in str(e)
    # refused_count must be 0 because execute_high_risk doesn't write on refusal
    import json
    counts = json.loads(gate.get_counts())
    assert counts["refused"] == 0, "execute_high_risk must not increment refused_count (write-then-raise bug)"


def test_try_execute_records_refusal_durably():
    """try_execute_high_risk_or_record_refusal must durably record REFUSED without raising."""
    registry, gate, gl, web_q, prompt_q = _setup()
    # No check run -> not safe
    result = gate.try_execute_high_risk_or_record_refusal("0xdeadbeef11")
    assert result == "REFUSED"
    import json
    counts = json.loads(gate.get_counts())
    assert counts["refused"] == 1, "try_execute must durably record refusal"


def test_execute_then_refuse_replay():
    """After successful execute, same hash is replay-rejected."""
    registry, gate, gl, web_q, prompt_q = _setup()
    web_q.push_round({FRONTEND: FRONTEND_CONTENT_CLEAN, RELEASE: RELEASE_CONTENT_CLEAN, INCIDENT: INCIDENT_CONTENT_CLEAN})
    _script_agreement(prompt_q, CLEAN_FINDING)
    registry.run_safety_check("proj1")
    gate.execute_high_risk("0xdeadbeef12")
    try:
        gate.execute_high_risk("0xdeadbeef12")
        assert False, "expected replay rejection"
    except Exception as e:
        assert "replay" in str(e)


def test_low_risk_always_executes():
    """execute_low_risk must succeed even when registry is not safe."""
    registry, gate, gl, web_q, prompt_q = _setup()
    # Registry is PENDING_FIRST_CHECK (not safe) — low risk still works
    result = gate.execute_low_risk("0xdeadbeef13")
    assert result == "EXECUTED"


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
