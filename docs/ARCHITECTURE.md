# Architecture

## Contracts

### `contracts/FailoverRegistry.py`

The semantic safety authority. One instance tracks any number of registered
projects, each keyed by a caller-chosen `project_id`.

Storage (all bounded, primitive-typed `TreeMap`/`DynArray`/`u256`, no unbounded
Python objects held directly in contract state):

- `projects: TreeMap[str, str]` — project record, JSON-encoded
- `check_history: TreeMap[str, str]` — append-only JSON array of check/recovery records per project
- `used_urls: TreeMap[str, str]` — JSON array of every canonicalized URL ever assigned to a project (across versions), used to permanently reject reuse
- `last_check_at: TreeMap[str, u256]` — last check timestamp per project (GenVM-deterministic tx time)
- `owner_of: TreeMap[str, Address]`
- `project_ids_index: DynArray[str]`

Lifecycle methods: `register_project`, `update_draft` (DRAFT only),
`activate_project`, `retire_project`, `run_safety_check` (permissionless),
`submit_recovery` (owner-only, but does not itself change status to SAFE),
`run_recovery_check` (permissionless, consensus-gated), `mark_recovered_safe`.

Views: `get_status`, `is_safe`, `get_project`, `get_history`, `list_project_ids`,
`get_last_check_at`.

### `contracts/FailoverGate.py`

A demo execution/consumer contract that proves the registry's state has a real,
enforced consequence. One `FailoverGate` instance is bound at construction time to
exactly one `(registry_address, project_id)` pair — that binding is immutable for the
life of the contract (no method exists to repoint it).

- `execute_high_risk(action_hash)` calls `registry.is_safe(project_id)` via the typed
  `@gl.contract_interface` binding (`IFailoverRegistry`) and raises unless it is `true`.
  Replay-protected per `action_hash` regardless of registry status.
- `execute_low_risk(action_hash)` is always callable, independent of registry status —
  this demonstrates the required policy separation (Failover gates high-risk actions
  only; it is not a blanket kill switch).
- Every attempt (executed or refused) is recorded as an append-only JSON receipt via
  `_record`, and refusals increment `refused_count` for observability.

Both contracts declare `# { "Depends": "py-genlayer:1jb45aa8..." }` pinning the stable
v0.2.18 Studionet runtime, and use only `gl.Contract`, `@gl.public.view`,
`@gl.public.write`, `@gl.contract_interface`, `gl.vm.run_nondet_unsafe`,
`gl.nondet.web.get`, `gl.nondet.exec_prompt`. `scripts/contract_static_checks.py`
enforces this at CI time (denylist of v0.3-only syntax, Depends-hash match, no embedded
secrets).

## Data flow

1. An owner registers a project (`DRAFT`) with three sealed HTTPS URLs (frontend,
   release, incident) and an expected address/action descriptor. URLs are validated by
   `validate_public_url` (HTTPS-only, length-bounded, no credentials/fragment, no
   localhost/private targets, canonicalized) and deduplicated per-role and
   historically.
2. `activate_project` moves it to `SAFE` and freezes the registered sources — from this
   point `update_draft` is rejected; changing a source requires the recovery flow, which
   preserves history rather than overwriting it.
3. Anyone calls `run_safety_check(project_id)` (subject to a sealed cooldown). The
   contract runs a leader/validator nondeterministic block (`gl.vm.run_nondet_unsafe`)
   that independently fetches all three sources, classifies them via
   `gl.nondet.exec_prompt` into the structured finding schema, and validates the shape.
   See `docs/CONSENSUS.md` for the full protocol.
4. The finding is mapped deterministically (`map_finding_to_status`, a pure function,
   unit-tested in isolation) to a new project status, and the record is appended to
   `check_history` (never overwritten).
5. `FailoverGate.execute_high_risk` reads `is_safe(project_id)` live on every call — so
   the moment a project flips to `RESTRICTED`, the very next high-risk call is refused,
   with no separate "propagate the pause" step.
6. Recovery: the owner calls `submit_recovery` with a *new* release URL (and optionally
   a new frontend URL) — the contract explicitly rejects resubmitting the exact same
   release URL, so an owner cannot "click unpause." This moves the project to
   `RECOVERY_PENDING` and bumps `version`. Anyone can then call `run_recovery_check`,
   which requires a fresh independent leader/validator consensus confirming the
   incident is resolved/absent, identity is restored, and the release is current before
   the project can reach `RECOVERED` and then `SAFE`.

## Frontend layering

- `lib/genlayer/network.ts` — single source of truth for chain id / RPC / explorer;
  `assertCanonicalNetwork` is used both by `scripts/check-network.ts` (CI) and before
  any funded write.
- `lib/genlayer/client.ts` — `createReadClient()` (unsigned/ephemeral, for public
  reads) and `createWriteClient(walletAddress, provider)` (wraps the user's injected
  EIP-1193 provider; never a backend signer).
- `lib/wallet/WalletProvider.tsx` — connect/disconnect, account/chain change,
  provider-disconnect, wrong-network handling; writes are gated on chain === 61999.
- `lib/contract/registryAdapter.ts` / `gateAdapter.ts` — one function per contract
  method, 1:1, no duplicated business logic; each throws a clear "not yet deployed" error
  keyed off `lib/contract/addresses.ts` until real addresses are configured.
- `lib/contract/txLifecycle.ts` — the `AWAITING_SIGNATURE -> SUBMITTED ->
  CONSENSUS_RUNNING -> FINALIZED -> EXECUTION_CONFIRMED -> STATE_REREAD` state machine
  and its failure states (`USER_REJECTED`, `WRONG_NETWORK`, `RPC_ERROR`,
  `CONSENSUS_FAILURE`, `EXECUTION_ERROR`, `STATE_MISMATCH`); every successful write
  re-reads authoritative contract state before the UI reports success.
- `lib/validation/urls.ts` / `schemas.ts` — the same URL-hardening rules the contract
  enforces are checked client-side first (defense in depth, better UX), then re-checked
  authoritatively by the contract.
- `lib/fixtures/demoProject.ts` — canonical static demo data (see
  `docs/REVIEWER_DEMO.md`) mirroring exact contract JSON shapes, used only for the
  reviewer walkthrough, never as a substitute for a real contract read once one is
  configured.

## No centralized backend

There is no database, no backend signer, no cron authority, and no off-chain
adjudicator. `contracts/FailoverRegistry.py` is the only place a project's safety
status is ever decided. The Next.js server is used purely for build/static delivery.
