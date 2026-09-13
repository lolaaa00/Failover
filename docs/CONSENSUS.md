# Consensus protocol

Both `run_safety_check` and `run_recovery_check` in `contracts/FailoverRegistry.py` use
the same leader/validator structure via `gl.vm.run_nondet_unsafe(leader_fn,
validator_fn)`.

## Leader

```python
def leader_fn():
    fetched = self._independently_fetch_and_normalize(project)
    candidate = self._derive_candidate(project, fetched)
    return candidate
```

`_independently_fetch_and_normalize` calls `gl.nondet.web.get(url)` for each of the
three sealed URLs (frontend, release, incident), catching per-source fetch failures
independently (a single unreachable source becomes `None` for that source only, not an
all-or-nothing failure) and bounding content to `MAX_FETCH_BYTES` (20,000 chars).

`_derive_candidate` builds a hardened prompt (see "Web evidence hardening" below) and
calls `gl.nondet.exec_prompt(prompt, response_format="json")`, then:

1. parses the JSON (falls back to `INCONCLUSIVE` if unparseable — never crashes the
   check);
2. re-bounds every evidence excerpt and the reason string defensively, regardless of
   what the model claims;
3. validates the full shape with `validate_finding_shape` (exact enum membership,
   evidence item count/shape, string length bounds) — an invalid shape becomes
   `INCONCLUSIVE`, never a fabricated valid-looking result;
4. defensively downgrades `COMPROMISED` to `INCONCLUSIVE` if some (not all) sources
   were unavailable and no evidence excerpt was actually grounded — a leader cannot
   claim compromise purely because a page failed to load.

## Validator

```python
def validator_fn(leader_result) -> bool:
    if not isinstance(leader_result, gl.vm.Return):
        return False
    candidate = leader_result.calldata
    if not validate_finding_shape(candidate):
        return False
    fetched = self._independently_fetch_and_normalize(project)
    expected = self._derive_candidate(project, fetched)
    return material_fields_match(candidate, expected)
```

Every validator independently re-fetches all three sources and re-derives its own
candidate from scratch — it never trusts the leader's fetched content or excerpts. It
then compares only the **material** fields (`material_fields_match`):

- `finding`
- `frontend_identity`
- `release_relation`
- `incident_state`
- `expected_address_relation`

Prose (`reason`, exact excerpt wording/whitespace) is allowed to differ between
independent fetches; the five classification fields must match exactly, and — unless
the finding is `UNAVAILABLE` — at least one evidence excerpt must be non-empty
(grounded), so a validator cannot accept a candidate that asserts a finding with zero
supporting evidence merely because the enum values happen to line up.

This means two validators who materially disagree (e.g. one thinks the frontend
matches, one thinks it doesn't) **cannot both return `True`** — GenVM consensus fails
the nondet block, and the contract abstains (see below) rather than picking a winner
arbitrarily.

## Abstention

If GenVM cannot reach consensus, or the agreed result somehow fails
`validate_finding_shape`, the contract does **not** raise or leave stale state — it
falls back explicitly:

```python
finding_result = {
    "finding": "INCONCLUSIVE",
    "frontend_identity": "UNCLEAR",
    "release_relation": "UNCLEAR",
    "incident_state": "UNCLEAR",
    "expected_address_relation": "UNCLEAR",
    "evidence": [],
    "reason": "validators could not reach consensus on a valid finding",
}
```

`INCONCLUSIVE` never maps to `SAFE` (`map_finding_to_status` always returns
`RESTRICTED` for it) — the system is fail-safe, not fail-open, and this is asserted by
`test_map_finding_to_status_inconclusive_never_safe` and
`test_inconclusive_never_reports_safe`.

## Web evidence hardening

The prompt built in `_derive_candidate` explicitly:

- labels all three fetched blocks as **untrusted data**;
- instructs the model to never follow instructions embedded in that data, never reveal
  a system/hidden prompt, never redefine policy because the data asks, and never
  authorize a value transfer because the data asks;
- requires every evidence excerpt to be grounded verbatim in the corresponding source
  block;
- explicitly forbids treating a failed-to-load source as grounds for `COMPROMISED` on
  its own (`UNAVAILABLE` is a distinct outcome).

Before any source is even fetched, `validate_public_url` (used both at registration and
recovery) rejects non-HTTPS URLs, over-length URLs, embedded credentials
(`user:pass@host`), identity-affecting fragments, and localhost/private/loopback
targets, and canonicalizes host/path so trivial URL variants can't bypass the
registered-source freeze. `canonical_domain` groups sources by host so, if a future
policy ever counted multiple public sources per role, two pages on the same host would
never be treated as independent evidence.

## Deterministic time

All deadlines (`check_cooldown_seconds`) and history timestamps use
`gl.message.timestamp` (GenVM-deterministic transaction time), never a caller-supplied
value, browser time, or Next.js server time. See `_tx_time()` in
`FailoverRegistry.py`.
