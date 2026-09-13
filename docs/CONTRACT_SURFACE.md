# Contract surface

Runtime target for both contracts: stable Studionet v0.2.18
(`# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }`).
Enforced by `scripts/contract_static_checks.py` in CI.

## `FailoverRegistry`

### Writes

| Method | Auth | Notes |
|---|---|---|
| `register_project(project_id, name, frontend_url, release_url, incident_url, expected_address, check_cooldown_seconds, stale_release_policy, unavailable_policy)` | anyone (becomes owner) | Fails if `project_id` exists, name/URL bounds violated, cooldown below sealed minimum (300s), policy not in `{RESTRICTED, RECOVERY_PENDING}`, URLs not distinct across roles, or any URL previously used by this project. |
| `update_draft(project_id, name=None, frontend_url=None, release_url=None, incident_url=None, expected_address=None)` | owner only | Only while `status == DRAFT`. |
| `activate_project(project_id)` | owner only | `DRAFT -> SAFE`; freezes sources from this point. |
| `retire_project(project_id)` | owner only | Any non-`DRAFT`, non-`RETIRED` status `-> RETIRED`. |
| `run_safety_check(project_id)` | **anyone**, no bounty | Rejects if status is `DRAFT`/`RETIRED` or cooldown has not elapsed. Runs leader/validator consensus (see `docs/CONSENSUS.md`), deterministically maps the finding to a new status, appends an immutable history record. |
| `submit_recovery(project_id, new_release_url, new_frontend_url, recovery_description)` | owner only | Only from `RESTRICTED`/`RECOVERY_PENDING`. `new_release_url` must differ from the current one (owner cannot resubmit the implicated release). Bumps `version`, sets status to `RECOVERY_PENDING`, appends history — never overwrites prior URLs. |
| `run_recovery_check(project_id)` | **anyone**, no bounty | Only from `RECOVERY_PENDING`. Fresh leader/validator consensus; `RECOVERED` only if finding is `CLEAN` with identity restored, release current, incident none/resolved, address match/not-visible. Otherwise stays `RECOVERY_PENDING`. |
| `mark_recovered_safe(project_id)` | anyone | Only from `RECOVERED`; performs no new judgement, just promotes an already-confirmed state to `SAFE`. |

### Views

| Method | Returns |
|---|---|
| `get_status(project_id) -> str` | Current `ProjectStatus`. |
| `is_safe(project_id) -> bool` | `True` iff status is `SAFE` or `RECOVERED`; `False` (never raises) for an unknown `project_id`. |
| `get_project(project_id) -> str` | Full project record, JSON-encoded. |
| `get_history(project_id) -> str` | JSON array of every check/recovery record, oldest first, append-only. |
| `list_project_ids() -> list[str]` | All registered project ids. |
| `get_last_check_at(project_id) -> int` | Unix seconds of the last check, or 0. |

### Statuses

`DRAFT, SAFE, CHECKING, RESTRICTED, RECOVERY_PENDING, RECOVERED, RETIRED`

### Findings

`CLEAN, COMPROMISED, IMPERSONATED, STALE_RELEASE, INCIDENT_DECLARED, INCONCLUSIVE, UNAVAILABLE`

### Structured finding schema

```json
{
  "finding": "CLEAN|COMPROMISED|IMPERSONATED|STALE_RELEASE|INCIDENT_DECLARED|INCONCLUSIVE|UNAVAILABLE",
  "frontend_identity": "MATCH|MISMATCH|UNCLEAR",
  "release_relation": "CURRENT|STALE|UNRELATED|UNCLEAR",
  "incident_state": "NONE|ACTIVE|RESOLVED|UNCLEAR",
  "expected_address_relation": "MATCH|MISMATCH|NOT_VISIBLE|UNCLEAR",
  "evidence": [{ "source": "frontend|release|incident", "excerpt": "verbatim, <=600 chars" }],
  "reason": "<=2000 chars"
}
```

Validated by the pure function `validate_finding_shape` (`contracts/FailoverRegistry.py`),
unit-tested in `tests/contract/test_helpers.py`.

### Deterministic status mapping (`map_finding_to_status`)

```
CLEAN                       -> SAFE
COMPROMISED                 -> RESTRICTED
IMPERSONATED                -> RESTRICTED
INCIDENT_DECLARED (ACTIVE)  -> RESTRICTED
INCIDENT_DECLARED (other)   -> RECOVERY_PENDING
STALE_RELEASE                -> sealed stale_release_policy (RESTRICTED | RECOVERY_PENDING)
INCONCLUSIVE                 -> RESTRICTED (never SAFE)
UNAVAILABLE                  -> sealed unavailable_policy (RESTRICTED | RECOVERY_PENDING)
```

A project already in `RECOVERY_PENDING` that a plain `run_safety_check` would otherwise
move to `SAFE` is deliberately kept at `RECOVERY_PENDING` — only `run_recovery_check` can
graduate a project out of recovery.

## `FailoverGate`

Constructor: `__init__(registry_address: Address, project_id: str)` — immutable binding,
no method may change it.

### Writes

| Method | Notes |
|---|---|
| `execute_high_risk(action_hash) -> str` | Validates `action_hash` shape (8–128 hex chars). Rejects replay if already executed. Calls `registry.is_safe(project_id)`; raises `"gate refused: project is not currently SAFE/RECOVERED"` and records a `REFUSED_NOT_SAFE` receipt if not safe. Otherwise marks executed, increments `high_risk_count`, records an `EXECUTED` receipt, returns `"EXECUTED"`. |
| `execute_low_risk(action_hash) -> str` | Same hash validation/replay protection, but never checks registry status — always allowed. |

### Views

| Method | Returns |
|---|---|
| `is_gate_open() -> bool` | Live `registry.is_safe(project_id)`. |
| `get_linked_project() -> str` | Bound `project_id`. |
| `get_registry_address() -> str` | Bound registry address. |
| `get_counts() -> str` | `{"high_risk_executed", "low_risk_executed", "refused"}` JSON. |
| `get_receipts() -> list[str]` | All append-only JSON receipts (`kind`, `action_hash`, `outcome`, `at`, `caller`). |
| `was_high_risk_executed(action_hash) -> bool` | Replay-check helper. |

## Frontend adapters (1:1 with the above)

`lib/contract/registryAdapter.ts` and `lib/contract/gateAdapter.ts` expose one
TypeScript function per contract method above (`readProject`, `readStatus`,
`readIsSafe`, `readHistory`, `readProjectIds`, `submitRegisterProject`,
`submitActivateProject`, `submitRunSafetyCheck`, `submitRecovery`,
`submitRunRecoveryCheck`; `readIsGateOpen`, `readGateCounts`, `readGateReceipts`,
`submitExecuteHighRisk`, `submitExecuteLowRisk`). No business logic is duplicated
client-side beyond JSON (de)serialization — the contract is the sole source of truth.
