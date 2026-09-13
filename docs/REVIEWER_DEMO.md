# Reviewer demo walkthrough

This walkthrough uses the canonical static demo fixtures in
`lib/fixtures/demoProject.ts` (project id `orbit-wallet`, a fictional wallet app) so a
reviewer can see the full `SAFE -> RESTRICTED -> RECOVERY_PENDING -> SAFE` lifecycle
without a live GenLayer node, a funded wallet, or live external network calls. Every
fixture mirrors the exact JSON shapes and deterministic finding->status mapping the
real `FailoverRegistry` contract computes (`docs/CONTRACT_SURFACE.md`,
`docs/CONSENSUS.md`) — it is a faithful stand-in, not invented behavior.

Start the app:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Stage 1 — SAFE

Visit:

```
http://localhost:3000/p/orbit-wallet?stage=SAFE
```

You should see:
- Status annunciator: **SAFE**.
- Source plate listing the three sealed sources: `app.orbitwallet.app` (frontend),
  `github.com/orbit-wallet/app/releases/v2.3.0` (release), `status.orbitwallet.app`
  (incident).
- History showing one `CHECK` record with `CLEAN_FINDING`: frontend excerpt
  `"Orbit Wallet v2.3 — official deposit contract 0x9f1c...4e2a"`, release excerpt
  confirming the tag matches the deployed build, incident excerpt `"All systems
  operational."`.

Open the gate:

```
http://localhost:3000/gate/orbit-wallet?stage=SAFE
```

`is_gate_open()` reads as open — a high-risk action would be permitted because
`registry.is_safe("orbit-wallet")` is `true` while status is `SAFE`.

## Stage 2 — RESTRICTED (compromise detected)

```
http://localhost:3000/p/orbit-wallet?stage=RESTRICTED
```

The fixture (`COMPROMISED_FINDING`) shows:
- `frontend_identity: MISMATCH`, `expected_address_relation: MISMATCH` — the frontend
  excerpt shows a deposit address rewritten to
  `0xATTACKER0000...dead`, which does not match the project's declared expected
  address.
- `release_relation: UNRELATED` — the release tag no longer corresponds to what the
  frontend currently serves.
- Deterministic mapping: `COMPROMISED -> RESTRICTED` (`map_finding_to_status`), so
  status flips to **RESTRICTED** — this is not a human judgment call, it's the pure
  function every reviewer can re-run against `tests/contract/test_helpers.py::
  test_map_finding_to_status_compromised_and_impersonated_restrict`.

Check the gate now:

```
http://localhost:3000/gate/orbit-wallet?stage=RESTRICTED
```

`is_gate_open()` reads closed. In a live deployment, `FailoverGate.execute_high_risk`
would raise `"gate refused: project is not currently SAFE/RECOVERED"` for this project
— the exact behavior asserted by
`tests/contract/test_gate_protocol.py::test_restricted_refuses_high_risk_action`. Note
that `execute_low_risk` remains callable even in this state (policy separation, not a
blanket pause) — see `tests/contract/test_gate_protocol.py::
test_low_risk_action_allowed_while_restricted`.

## Stage 3 — RECOVERY_PENDING

```
http://localhost:3000/p/orbit-wallet?stage=RECOVERY_PENDING
```

History now includes a `RECOVERY_SUBMITTED` record: the owner submitted a genuinely new
release, `v2.4.0-recovery` (rotated deploy keys, rebuilt from clean source) —
`submit_recovery` on the real contract would reject resubmitting the exact same
`v2.3.0` release URL that was implicated, so this new version is required, not
optional. `version` increments from 1 to 2. Status is **RECOVERY_PENDING**, not yet
SAFE — the owner cannot self-declare recovery; a fresh independent consensus check
(`run_recovery_check`) is still required.

Visit `/p/orbit-wallet/recovery?stage=RECOVERY_PENDING` (or the in-page "Submit
Recovery" control) to see the recovery submission UI that would call
`submitRecovery(...)` on a live deployment.

## Stage 4 — RECOVERED / back to SAFE

```
http://localhost:3000/p/orbit-wallet?stage=RECOVERED_TO_SAFE
```

`RECOVERED_FINDING` shows the frontend restored to the original expected address, the
release relation `CURRENT` again, and the incident channel now `RESOLVED` (`"RESOLVED:
frontend has been restored and verified."`). History shows the full sequence:
`CHECK (SAFE) -> CHECK (RESTRICTED) -> RECOVERY_SUBMITTED -> RECOVERY_CHECK (RECOVERED)
-> PROMOTED_SAFE` — nothing in that history is ever overwritten or deleted, matching
the append-only guarantee tested by
`tests/contract/test_registry_protocol.py::test_history_is_immutable_append_only`.

Recheck the gate:

```
http://localhost:3000/gate/orbit-wallet?stage=RECOVERED_TO_SAFE
```

`is_gate_open()` reads open again — high-risk execution is restored only after this
full verified path, not by an owner toggle.

## Other routes worth a look

- `/` — landing page and the aviation fail-safe hero interlock.
- `/projects` — public project listing.
- `/new` — registration form (`RegisterProjectArgs`, client-side Zod validation mirrors
  `validate_public_url`/length bounds before ever reaching the contract).
- `/incidents` — cross-project incident history view.
- `/p/orbit-wallet/check` — the "check chamber," showing what a live
  `run_safety_check` transaction's lifecycle panel (`AWAITING_SIGNATURE -> ... ->
  STATE_REREAD`) looks like.

## Why this demo is not a fabrication

Every value in `lib/fixtures/demoProject.ts` — the finding enums, the status
transitions, the history record shapes — is typed against
`lib/contract/types.ts`, which mirrors the contract's real JSON output field-for-field,
and the transitions match the pure, independently unit-tested
`map_finding_to_status` function in `contracts/FailoverRegistry.py`. No live contract
has been deployed (see `docs/DEPLOYMENT.md`), and the app is explicit about that: once
real contract addresses are configured in `lib/contract/addresses.ts`, the same pages
read live state instead of fixtures.
