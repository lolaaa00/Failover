# Security model — what Failover claims and does not claim

## What Failover IS

A consensus-backed circuit breaker over the **declared public integrity surfaces** of a
registered project: its official frontend URL, its canonical release/repository URL,
and its official incident/status URL. When GenLayer leader and validator nodes
independently agree those surfaces are materially inconsistent with the project's
declared identity, or that an official incident notice is active, the project's status
flips to a restricted state, and `FailoverGate.execute_high_risk` refuses to execute
for as long as that state holds. Recovery to `SAFE` requires a new release version and a
fresh independent consensus check — the owner cannot self-declare recovery.

## What Failover explicitly does NOT claim

- **Not perfect hack detection.** A consensus of LLM-driven evaluators reading public
  web content is not equivalent to a security audit, a formal verification, or a
  guarantee that no compromise exists. It can miss subtle or well-disguised
  impersonation, and it can occasionally be wrong about a genuine change.
- **Not malware scanning.** Failover never downloads, executes, or analyzes binaries or
  release artifacts. It reads bounded, text-normalized excerpts of publicly served
  content and reasons about identity/consistency, not code-level integrity.
- **Not guaranteed safety.** A `SAFE` status means "the last consensus check found the
  declared sources mutually consistent with no active incident" — it is a point-in-time
  attestation, not an ongoing guarantee, and it is only as good as the freshness of the
  last `run_safety_check` relative to the sealed `check_cooldown_seconds`.
- **Not a chain-level pause.** Failover cannot pause Ethereum, another chain, or any
  contract it does not itself gate. It can only gate execution paths that explicitly
  call `registry.is_safe(project_id)`, such as `FailoverGate`.
- **Not a bounty system.** Checks are permissionless but unrewarded by design (spec
  section 3) — this is deliberate, to remove any economic incentive to manufacture
  false emergencies, but it also means there is no guarantee anyone will promptly
  trigger a check after a real compromise; the check must actually be called.

## Precise claims

- **Consensus-backed interpretation** of the three sealed sources, with validators
  independently re-fetching and re-deriving their own classification rather than
  trusting the leader (see `docs/CONSENSUS.md`).
- **Fail-safe gate state**: `INCONCLUSIVE`, `UNAVAILABLE`, and validator disagreement
  all resolve to a non-safe status (`RESTRICTED`, or the sealed
  `unavailable_policy`/`stale_release_policy` alternative), never to `SAFE`. A source
  merely failing to load can never by itself produce `COMPROMISED`
  (`_derive_candidate`'s defensive downgrade, tested by
  `test_source_unavailable_is_not_falsely_compromised`).
- **Verified recovery path**: recovery requires a genuinely new release version (the
  contract rejects resubmitting the existing release URL), and a fresh leader/validator
  consensus that independently confirms identity restoration, incident resolution, and
  release currency before `RECOVERED`/`SAFE` is reachable. History is append-only and
  immutable — a past emergency is never erased.

## Threat model

In scope:

- Official frontend hijacked / DNS or deploy-pipeline compromise resulting in a
  materially different served page.
- Frontend serving a different destination wallet/address than the project's declared
  expected address/action descriptor.
- A fake or absent emergency banner where an official incident channel has, in fact,
  declared an active compromise.
- A release/repository page that no longer materially corresponds to what the frontend
  serves (stale or unrelated release).
- An owner attempting to quietly resubmit the same compromised release URL to
  self-clear a restriction (explicitly rejected by `submit_recovery`).
- URL-based tricks: credential-embedded URLs, identity-affecting fragments,
  localhost/private targets, over-length URLs — rejected at `validate_public_url`
  before any fetch happens.
- Prompt injection via fetched page content — the classification prompt frames all
  fetched content as untrusted data and instructs the model never to follow embedded
  instructions, reveal hidden prompts, or authorize value transfer because the data
  says so.

Out of scope (see "does NOT claim" above):

- Binary/artifact-level malware analysis.
- Guaranteeing detection of a sufficiently sophisticated, well-disguised impersonation
  that presents materially consistent public content.
- Any chain or contract that does not itself call `registry.is_safe(project_id)`.
- Timeliness — Failover reacts only when someone calls `run_safety_check`, subject to
  the sealed cooldown; it does not poll or monitor continuously on its own.

## Value safety

Neither `FailoverRegistry` nor `FailoverGate` in the canonical demo custodies native
GEN value — both contracts are called with `value: 0n` from the frontend adapters.
`FailoverGate` accounting (`high_risk_count`, `low_risk_count`, `refused_count`,
per-`action_hash` replay flags) is exact-count bookkeeping, not a balance, so the
value-conservation invariants in the generic build rules (section 8) are satisfied
trivially by having no value flow in this canonical deployment. A production deployment
that wired GEN-denominated stakes through `FailoverGate` would need to extend this
accounting explicitly; that extension is out of scope for the canonical demo.
