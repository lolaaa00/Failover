# Deployment

## Current status: NOT deployed

**No funded Studionet signer is available in this build environment.** Neither
`FailoverRegistry` nor `FailoverGate` has been deployed to chain 61999. No address, no
transaction hash, and no deployment record anywhere in this repository should be read
as evidence of a live deployment — none exists yet. `lib/contract/addresses.ts` has no
real addresses configured, and every adapter call (`registryAdapter.ts`,
`gateAdapter.ts`) throws a clear "not yet deployed" error until real addresses are set,
by design, rather than silently falling back to fixture data.

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

## Exact deployment steps (once a funded signer is available)

1. **Never commit a private key.** Set it only as an environment variable at
   invocation time:

   ```bash
   export FAILOVER_DEPLOYER_PRIVATE_KEY=0x...   # funded Studionet account, in-memory only
   ```

2. Run the preflight + deployment script:

   ```bash
   npx tsx scripts/deploy.ts
   ```

   `scripts/deploy.ts`:
   - prints the effective network config and runs `assertCanonicalNetwork` — aborts if
     it does not resolve to chain 61999 / `https://studio.genlayer.com/api`;
   - computes and prints the SHA-256 of `contracts/FailoverRegistry.py` and
     `contracts/FailoverGate.py`, plus the current `git rev-parse HEAD`, so the exact
     reviewed source being deployed is unambiguous and reproducible;
   - exits early (without deploying anything) if no `FAILOVER_DEPLOYER_PRIVATE_KEY` is
     set — this is the current state of this environment;
   - once a key is present, deploys `FailoverRegistry.py` via `genlayer-js` 1.1.8's
     `createClient({ chain: studionet, account })` and prints the deployment tx.

3. Register and activate at least one project on the deployed `FailoverRegistry`
   (via the frontend `/new` flow or a direct contract call), noting the chosen
   `project_id`.

4. Deploy `FailoverGate.py` with constructor args `(registry_address, project_id)`
   bound to the values from steps 2–3. (`scripts/deploy.ts` intentionally stops after
   Registry deployment and prints this as the next manual step, rather than guessing a
   `project_id` on the operator's behalf.)

5. Wait for consensus finality on both deployment transactions (see
   `lib/contract/txLifecycle.ts` for the exact lifecycle states: `AWAITING_SIGNATURE ->
   SUBMITTED -> CONSENSUS_RUNNING -> FINALIZED -> EXECUTION_CONFIRMED -> STATE_REREAD`).

6. Re-read both contracts (`get_status`, `is_gate_open`, etc.) to confirm they are live
   and callable, and set `NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS` /
   `NEXT_PUBLIC_FAILOVER_GATE_ADDRESS` (see `.env.example`) so the frontend adapters in
   `lib/contract/addresses.ts` resolve to them.

7. Optionally exercise `scripts/live-studionet-smoke.ts` against the live deployment —
   this requires a funded signer and real network access and is **not** run in CI by
   default (opt-in only, per generic rule section 18).

## Required deployment record (to be filled in and committed only once real)

When a real deployment is performed, append a record here with every field actually
produced — never fabricated or approximated:

```
Git SHA:                    <git rev-parse HEAD at deploy time>
FailoverRegistry.py SHA-256: <sha256>
FailoverGate.py SHA-256:     <sha256>
Network:                     GenLayer Studionet (chain 61999)
Public signer address:       <0x... deployer address, never the private key>
FailoverRegistry deployment tx:  <tx hash>
FailoverRegistry address:        <0x...>
FailoverGate deployment tx:      <tx hash>
FailoverGate address:            <0x...>
Bound project_id:                <id used to construct FailoverGate>
Final consensus status (both txs): <e.g. FINALIZED>
Actual execution result:          <e.g. success / revert reason>
Key lifecycle txs exercised:      <register_project / activate_project / run_safety_check tx hashes>
Explorer links:                   https://explorer-studio.genlayer.com/tx/<hash> (one per tx above)
Final readbacks:                  <get_status(...) / is_gate_open() output at time of writing>
```

No entry has been added to this section because no deployment has occurred.
