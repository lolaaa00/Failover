# Deployment

## Frontend deployment

| Field | Value |
|-------|-------|
| Platform | Vercel |
| Production URL | https://failover-black.vercel.app |
| Alias | https://failover-lolaas-projects.vercel.app |
| Build | Vercel deployment `dpl_B2cgZXb5rEf9pY5EnzZ8uZ7W7DZn` |
| Mode | Demo/fixture mode (no contract addresses configured yet) |
| Chain | Will target chain 61999 once contracts are deployed |
| Demo route | https://failover-black.vercel.app/demo |

The frontend runs in **demo mode** until contract addresses are set. In demo mode an amber banner is shown on all `/p/[id]` and `/gate/[id]` pages; the `/demo` route provides the full SAFE → RESTRICTED → RECOVERY\_PENDING → SAFE walkthrough using canonical fixtures. Once real contract addresses are set via `NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS` and `NEXT_PUBLIC_FAILOVER_GATE_ADDRESS` in the Vercel dashboard, the frontend switches to live mode automatically.

## Contract deployment status: NOT deployed

**No funded Studionet signer has been used yet.** Neither
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

## Live deployment record

```
Date:                            2026-09-14
Git SHA:                         b24ad1fc14bff719397da553605bbd6bc1385d21
FailoverRegistry.py SHA-256:     a1e2b173caa44d0fe8fc819490d6921ab4f8e3ebe7e6e42d13d11bcde72741fe
FailoverGate.py SHA-256:         01111f446848735328e0c589d4418c6d90294f1e8b0a064fd0f42a4c846e2d8f
Network:                         GenLayer Studionet (chain 61999)
RPC:                             https://studio.genlayer.com/api
Public deployer address:         0x778D1663f9D5b338aBaD5C62899830AD3520a32F

FailoverRegistry deployment tx:  0xcbfbc9667325f6f583dfb40568dcd717c53b4c314111972ddcb4f4acfa535c16
FailoverRegistry address:        0x2A858500C75fC3880BB87CCd2C30Fd4c1AdE0A1a
FailoverGate deployment tx:      0x86aa30a20e872e1390d614181aeaa3caa79d4d63910d2ed9430e203a2e3c0c34
FailoverGate address:            0xD6fAA5b4EfA47393F92eA71787528C86F4bb736f
Bound project_id:                failover-demo

Consensus (both txs):            status=7 (FINALIZED), result=6 (SUCCESS)
Validator votes (both):          5/5 agree
Execution result (both):         SUCCESS (GenVM return, no error)

Explorer (registry):  https://explorer-studio.genlayer.com/address/0x2A858500C75fC3880BB87CCd2C30Fd4c1AdE0A1a
Explorer (gate):      https://explorer-studio.genlayer.com/address/0xD6fAA5b4EfA47393F92eA71787528C86F4bb736f
Explorer (registry tx): https://explorer-studio.genlayer.com/tx/0xcbfbc9667325f6f583dfb40568dcd717c53b4c314111972ddcb4f4acfa535c16
Explorer (gate tx):     https://explorer-studio.genlayer.com/tx/0x86aa30a20e872e1390d614181aeaa3caa79d4d63910d2ed9430e203a2e3c0c34
```

## Frontend env vars (set in Vercel dashboard)

```
NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS=0x2A858500C75fC3880BB87CCd2C30Fd4c1AdE0A1a
NEXT_PUBLIC_FAILOVER_GATE_ADDRESS=0xD6fAA5b4EfA47393F92eA71787528C86F4bb736f
```
