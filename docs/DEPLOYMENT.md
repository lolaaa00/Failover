# Deployment

This document is the single current source of truth for the live deployment. All
earlier deployment records in this file (and the git history before commit
`bdae43d`) describe superseded or broken deployments and must not be treated as
current.

## Canonical network (required for any deployment)

```
Network:  GenLayer Studionet
Chain ID: 61999
RPC:      https://studio.genlayer.com/api
Explorer: https://explorer-studio.genlayer.com
Currency: GEN
```

Verify this resolves correctly before any funded action:

```bash
npm run check:network
```

## Live deployment record (current, verified)

```
Deployed source commit:          437ba0c6ed86eabb72c589e8bcd96356a63d18e5  (FailoverRegistry.py)
Deployed source commit:          bdae43d055ae9945c25b913c22637a465b13a7a9  (FailoverGate.py)
Repository HEAD at time of writing this record: bdae43d055ae9945c25b913c22637a465b13a7a9
FailoverRegistry.py SHA-256:     035f71984f113bdc24185ad1c60bdb64d3b77dec3d11c3eedeecb8a294e5980f
FailoverGate.py SHA-256:         c6cf508e7c4749c4a639461fd2f5d3788a7299b02db4596f9cb81b2f657ce72c
Network:                         GenLayer Studionet (chain 61999)
RPC:                             https://studio.genlayer.com/api
Public deployer address:         0x778D1663f9D5b338aBaD5C62899830AD3520a32F

FailoverRegistry deployment tx:  0xdae95f7a0df61d76dbcffd0fa9a7ff59a87a4d5b44c367737aa5851dbd93f30e
FailoverRegistry address:        0x151DdC0cafb8eC893dF09CA4bC5c7aC0cF6D3AAE
FailoverGate deployment tx:      0xf5912e95f668444fe47353ca3b539db64f4062d9fae3a0d7020ba6d182c6a3e5
FailoverGate address:            0x9b1fc3A519f175A13024562FB6995326046D732c
Bound project_id:                failover-demo (confirmed via FailoverGate.get_linked_project())
Bound registry (from Gate):      0x151DdC0cafb8eC893dF09CA4bC5c7aC0cF6D3AAE (confirmed via FailoverGate.get_registry_address())

Consensus (both txs):            status=7 (FINALIZED), result=6 (MAJORITY_AGREE)
Validator votes:                 Registry 5/5 agree; Gate 5/5 agree
Execution result (both):         SUCCESS (GenVM return, no error)

Explorer (registry):    https://explorer-studio.genlayer.com/address/0x151DdC0cafb8eC893dF09CA4bC5c7aC0cF6D3AAE
Explorer (gate):        https://explorer-studio.genlayer.com/address/0x9b1fc3A519f175A13024562FB6995326046D732c
Explorer (registry tx): https://explorer-studio.genlayer.com/tx/0xdae95f7a0df61d76dbcffd0fa9a7ff59a87a4d5b44c367737aa5851dbd93f30e
Explorer (gate tx):     https://explorer-studio.genlayer.com/tx/0xf5912e95f668444fe47353ca3b539db64f4062d9fae3a0d7020ba6d182c6a3e5
```

**Registry/Gate were deployed from two different commits** because a second,
previously-undiscovered live-only bug in `FailoverGate.py` was found and fixed
*after* the Registry was already deployed and registered. The Registry source has
not changed since its deployment (`git log` shows no commits touching
`contracts/FailoverRegistry.py` after `437ba0c`); its SHA-256 above matches the
current file exactly. The Gate was redeployed three times during this session as
successive live-only bugs were found; the address and tx above are the final,
verified-working deployment from commit `bdae43d`.

## Registered project state

```
Project ID:       failover-demo
Status sequence observed live:
  register_project -> DRAFT                    (confirmed via get_status)
  activate_project  -> PENDING_FIRST_CHECK      (confirmed via get_status)
  run_safety_check  -> PENDING_FIRST_CHECK      (MAJORITY_DISAGREE; validators did not
                                                  reach consensus on a single finding for
                                                  the registered frontend/release/incident
                                                  URLs, so the project correctly remained
                                                  not-safe rather than being incorrectly
                                                  promoted to SAFE)
Current is_safe(): false
```

The project has not yet reached a SAFE state because the safety check's independent
validators did not converge on the same finding for the currently-registered evidence
URLs (`https://failover-black.vercel.app/`, the GitHub repo, and `/incidents`). This is
the contract's fail-closed design working correctly, not a bug: **no SAFE state was
fabricated or claimed.** Re-running `run_safety_check` against more consistently
classifiable evidence sources is an operator action, not a code change.

## Live Gate write evidence

Exercised directly against the final Gate (`0x9b1fc3A519f175A13024562FB6995326046D732c`):

```
execute_low_risk(unique_hash)                          -> EXECUTED (SUCCESS), durable receipt recorded
try_execute_high_risk_or_record_refusal(unique_hash)    -> REFUSED (SUCCESS), durable REFUSED_NOT_SAFE receipt recorded
  tx: 0x0b8f2cabb9265435eec7381d0512403354a895e9c95ebe82400fe214c5a6c9bb
  receipt: {"kind":"high_risk","action_hash":"0x1a0b4af9e5bdeadbee1","outcome":"REFUSED_NOT_SAFE",
            "at":1789737805,"caller":"0x778D1663f9D5b338aBaD5C62899830AD3520a32F"}
execute_low_risk(same_hash) replay                     -> rejected (leader raised "action_hash already
                                                            executed (replay rejected)"), no duplicate receipt
is_gate_open() (plain read)                             -> false (matches Registry's is_safe() for the
                                                            bound project, confirming the Gate reads live
                                                            Registry state rather than local/cached data)
```

Because `is_safe()` never resolved true during this session (see above), a live
`execute_high_risk` (the allow-path) and a subsequent `try_execute_high_risk_or_record_refusal`
EXECUTED-path receipt were **not** exercised — only the refuse-path and low-risk-path were,
since those are the paths reachable from the project's actual current state. Demonstrating
the allow-path live requires either a differently-scripted safety check that reaches
consensus, or `mark_recovered_safe` after a full recovery cycle; both are operator actions
against the current live deployment, not code changes, and are not claimed as done here.

## Findings fixed during this remediation, ranked by severity

1. **P0 (fixed, `bdae43d`) — `FailoverGate` cross-contract calls used the wrong GenVM
   API and reverted on every real invocation.** `self._registry().is_safe(args=[...])`
   called the `_ContractAt` proxy's method name directly; the real GenVM runtime only
   exposes view methods through `proxy.view().method(*args)` (confirmed against the
   `genlayer.gl.genvm_contracts` SDK source). This broke `is_gate_open()`,
   `execute_high_risk()`, and `try_execute_high_risk_or_record_refusal()` on every
   real Studionet call — the latter, despite being documented to "never raise," was
   reverting and recording no receipt. Fixed in all three call sites; verified live
   (see "Live Gate write evidence" above).
2. **P0 (fixed, `23b7be5`) — `FailoverGate._record()` called `gl.message.timestamp`**,
   a field the real Studionet `MessageType` does not expose (only
   `contract_address`/`sender_address`/`origin_address`/`value`/`chain_id`). This is
   the same bug already fixed once in `FailoverRegistry._tx_time()` earlier in this
   remediation; it had not been ported to `FailoverGate.py`. Every gate write reverted
   before recording a receipt. Fixed with a `tx_time()` helper mirroring
   `FailoverRegistry._tx_time()`, parsing `gl.message_raw["datetime"]`.
3. **P0 (fixed, `da1caf3`) — frontend execution-failure detection silently accepted
   reverted writes as success.** `assertExecutionSucceeded()` checked
   `receipt.txExecutionResultName`, a field genlayer-js's own types document but which
   real Studionet `fullTransaction: true` receipts leave `undefined` even for a
   genuine revert (confirmed against the real reverted `register_project` receipt from
   finding #2's predecessor bug). The only reliably-populated field is
   `consensus_data.leader_receipt[].execution_result`. Fixed to check both shapes, and
   to extract the error message from `genvm_result.stderr`/`error_description` when
   the documented `.error` field is absent (which it always was on real receipts).
4. **P1 (fixed, `c60956c`, from the prior remediation pass in this session) —
   `FailoverGate.__init__` assigned a deploy-time constructor string directly to an
   `Address`-typed storage field**, reverting with `AttributeError: 'str' object has
   no attribute 'as_bytes'`. Fixed by wrapping with `Address(...)` when a string is
   received.
5. **Deployment/source-parity claim in prior documentation was false.** This file
   previously listed a "current deployment" commit (`b24ad1f...`) that is not present
   in the public repository, and separately claimed contracts were "NOT deployed"
   while a since-superseded live deployment existed. Both statements are corrected
   above with the actual current deployed commit, hashes, and addresses.

Findings explicitly **not** addressed in this pass (see Limitations below): expanded
frontend integration test matrix, a live incident-history page backed by Registry
data, and an explicit-opt-in operator write mode for `live-studionet-smoke.ts`.

## Exact deployment steps (for a future redeploy)

1. **Never commit a private key.** Set it only as an environment variable at
   invocation time, in your own terminal — never paste it into any chat or log that
   leaves your machine:

   ```bash
   export FAILOVER_DEPLOYER_PRIVATE_KEY=0x...   # funded Studionet account, in-memory only
   ```

2. Run the preflight + Registry deployment script:

   ```bash
   npx tsx scripts/deploy.ts
   ```

   Prints the effective network config, aborts if it does not resolve to chain
   61999 / `https://studio.genlayer.com/api`, computes and prints the SHA-256 of both
   contract files plus `git rev-parse HEAD`, deploys `FailoverRegistry.py`, waits for
   FINALIZED, registers and activates `DEMO_PROJECT_ID` (default `failover-demo`),
   and confirms each state transition via an authoritative re-read.

3. Deploy `FailoverGate.py` bound to the Registry address and project ID from step 2:

   ```bash
   REGISTRY_ADDRESS=<from step 2> DEMO_PROJECT_ID=failover-demo npx tsx scripts/deploy-gate.ts
   ```

   Waits for FINALIZED and confirms the binding via `get_linked_project()` /
   `get_registry_address()` before printing success.

4. Set `NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS` / `NEXT_PUBLIC_FAILOVER_GATE_ADDRESS`
   in the Vercel dashboard (Production scope) to the addresses from steps 2–3, then
   redeploy production (`npx vercel deploy --prod`).

5. Optionally exercise `scripts/live-studionet-smoke.ts` (read-only; requires
   `FAILOVER_LIVE_SIGNER_KEY` set to any truthy value as an opt-in flag — the script
   never actually signs with it).

## Frontend env vars (set in Vercel dashboard, Production scope)

```
NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS=0x151DdC0cafb8eC893dF09CA4bC5c7aC0cF6D3AAE
NEXT_PUBLIC_FAILOVER_GATE_ADDRESS=0x9b1fc3A519f175A13024562FB6995326046D732c
```

Production URL: https://failover-black.vercel.app

## Known limitations (honest, as of this writing)

- **`live-studionet-smoke.ts` is read-only**, despite its name suggesting an
  end-to-end exercise. It verifies the deployed addresses resolve, the Gate's binding
  matches the Registry, and current status/is_safe values — it does not itself submit
  any write. A separate, explicitly-gated write-mode smoke script (requiring an
  operator-supplied signer, refusing non-Studionet networks, and never printing or
  persisting the key) was requested but not built in this pass.
- **`/incidents` and `/projects` still render the static `orbit-wallet` fixture**, not
  live Registry data. They are not mislabeled as live, but they also do not yet load
  real project histories when a Registry is configured. Building a live
  `/incidents/[id]` page backed by `get_history()` is scoped but not implemented here.
- **The frontend integration test suite was not expanded** to cover the full matrix
  requested (consensus-failure-during-activation, finalized-execution-revert,
  live-history-rendering, etc.) — only the regression tests directly proving the three
  P0 fixes above were added (`tests/contract/test_gate_protocol.py`,
  `tests/frontend/finality.test.ts`).
- **The live safety check never reached SAFE during this session** (`MAJORITY_DISAGREE`
  on the first run). The allow-path (`execute_high_risk` succeeding, or
  `try_execute_high_risk_or_record_refusal` recording `EXECUTED`) was therefore not
  exercised live — only the refuse-path and low-risk path were. This is disclosed
  rather than fabricated.
