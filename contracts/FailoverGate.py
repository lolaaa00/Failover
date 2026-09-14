# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
FailoverGate — GenLayer Intelligent Contract (Studionet v0.2.18 stable runtime)

Demo consumer contract proving real on-chain consequence of FailoverRegistry
state. Reads registry.is_safe(project_id) and refuses execute_high_risk()
while the linked project is not safe. A low-risk action remains callable
regardless of registry status, demonstrating deliberate policy separation
rather than a blanket kill switch. Action hashes are replay-protected.
"""

from genlayer import *
import json

MAX_ACTION_HASH_LENGTH = 128


def is_valid_action_hash(action_hash: str) -> bool:
    if not isinstance(action_hash, str):
        return False
    if not (8 <= len(action_hash) <= MAX_ACTION_HASH_LENGTH):
        return False
    allowed = set("0123456789abcdefABCDEFxX")
    return all(c in allowed for c in action_hash)


@gl.contract_interface
class IFailoverRegistry:
    def is_safe(self, project_id: str) -> bool: ...
    def get_status(self, project_id: str) -> str: ...


class FailoverGate(gl.Contract):
    """One gate instance is bound to exactly one (registry, project_id) pair
    at construction time. Binding is immutable — a gate cannot be silently
    re-pointed at a different registry/project after deployment."""

    registry_address: Address
    project_id: str

    # action_hash -> True once executed (replay protection)
    executed_high_risk: TreeMap[str, bool]
    executed_low_risk: TreeMap[str, bool]

    high_risk_count: u256
    low_risk_count: u256
    refused_count: u256

    # append-only receipts, JSON-encoded, for on-chain auditability
    receipts: DynArray[str]

    def __init__(self, registry_address: Address, project_id: str):
        if not project_id:
            raise Exception("project_id required")
        self.registry_address = registry_address
        self.project_id = project_id
        self.high_risk_count = u256(0)
        self.low_risk_count = u256(0)
        self.refused_count = u256(0)

    def _registry(self) -> IFailoverRegistry:
        return IFailoverRegistry(self.registry_address)

    def _record(self, kind: str, action_hash: str, outcome: str) -> None:
        self.receipts.append(
            json.dumps(
                {
                    "kind": kind,
                    "action_hash": action_hash,
                    "outcome": outcome,
                    "at": int(gl.message.timestamp),
                    "caller": str(gl.message.sender_address),
                }
            )
        )

    @gl.public.write
    def execute_high_risk(self, action_hash: str) -> str:
        """Requires registry.is_safe(project_id) == True. Refuses otherwise.
        Idempotent per action_hash — a second call with the same hash is
        rejected as a replay regardless of registry status.

        When not safe, raises immediately with NO state mutation.
        Callers that want to durably record refusals should call
        try_execute_high_risk_or_record_refusal() instead.
        """
        if not is_valid_action_hash(action_hash):
            raise Exception("invalid action_hash")
        if self.executed_high_risk.get(action_hash, False):
            raise Exception("action_hash already executed (replay rejected)")

        safe = self._registry().is_safe(args=[self.project_id])
        if not safe:
            # No state mutation before raise — writes would be lost on revert.
            raise Exception("gate refused: project is not currently SAFE/RECOVERED")

        self.executed_high_risk[action_hash] = True
        self.high_risk_count = u256(int(self.high_risk_count) + 1)
        self._record("high_risk", action_hash, "EXECUTED")
        return "EXECUTED"

    @gl.public.write
    def try_execute_high_risk_or_record_refusal(self, action_hash: str) -> str:
        """Combined method that either executes (if safe) or records a refusal
        durably (if not safe) — never raises. This is the method to use when
        callers want a durable audit trail of both executed and refused actions.

        Returns "EXECUTED" or "REFUSED".
        """
        if not is_valid_action_hash(action_hash):
            raise Exception("invalid action_hash")
        if self.executed_high_risk.get(action_hash, False):
            raise Exception("action_hash already executed (replay rejected)")

        safe = self._registry().is_safe(args=[self.project_id])
        if not safe:
            # Write refusal durably — this path does NOT raise, so writes persist.
            self.refused_count = u256(int(self.refused_count) + 1)
            self._record("high_risk", action_hash, "REFUSED_NOT_SAFE")
            return "REFUSED"

        self.executed_high_risk[action_hash] = True
        self.high_risk_count = u256(int(self.high_risk_count) + 1)
        self._record("high_risk", action_hash, "EXECUTED")
        return "EXECUTED"

    @gl.public.write
    def execute_low_risk(self, action_hash: str) -> str:
        """Low-risk actions are allowed regardless of registry restriction
        status — this demonstrates the policy separation required by the
        spec (a blanket pause is not the design; only high-risk actions are
        gated on integrity status)."""
        if not is_valid_action_hash(action_hash):
            raise Exception("invalid action_hash")
        if self.executed_low_risk.get(action_hash, False):
            raise Exception("action_hash already executed (replay rejected)")

        self.executed_low_risk[action_hash] = True
        self.low_risk_count = u256(int(self.low_risk_count) + 1)
        self._record("low_risk", action_hash, "EXECUTED")
        return "EXECUTED"

    @gl.public.view
    def is_gate_open(self) -> bool:
        return self._registry().is_safe(args=[self.project_id])

    @gl.public.view
    def get_linked_project(self) -> str:
        return self.project_id

    @gl.public.view
    def get_registry_address(self) -> str:
        return str(self.registry_address)

    @gl.public.view
    def get_counts(self) -> str:
        return json.dumps(
            {
                "high_risk_executed": int(self.high_risk_count),
                "low_risk_executed": int(self.low_risk_count),
                "refused": int(self.refused_count),
            }
        )

    @gl.public.view
    def get_receipts(self) -> list:
        return list(self.receipts)

    @gl.public.view
    def was_high_risk_executed(self, action_hash: str) -> bool:
        return bool(self.executed_high_risk.get(action_hash, False))
