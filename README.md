# Failover

**A public-frontend and release-integrity emergency gate for autonomous apps, built on GenLayer.**

Projects seal their official frontend URL, release/repository URL, and incident/status
URL on-chain. Anyone may permissionlessly trigger a safety check (no bounty). GenLayer
leader and validator nodes independently fetch and evaluate those three public sources
and produce a structured, schema-validated finding. The finding is mapped
deterministically to a project status. A separate execution contract, `FailoverGate`,
reads that status and refuses high-risk actions while a project is not `SAFE` /
`RECOVERED`.

Failover is a software-integrity circuit breaker, not a transaction-exploit monitor. See
`docs/SECURITY.md` for exactly what it does and does not claim.

## Why GenLayer

If a single centralized operator decided "this frontend is compromised," that operator
becomes the trust bottleneck the product exists to remove, and it could be bribed,
compromised, or simply wrong with no recourse. Failover instead requires GenLayer
leader + validator consensus, with validators independently re-fetching all three
sources and re-deriving the classification, before any project is marked restricted or
recovered. `FailoverGate.execute_high_risk` reads that consensus-backed state directly
and refuses to execute when it is not safe — a real, consequential, contract-enforced
gate, not a cosmetic score.

## Architecture at a glance

```
FailoverRegistry (Intelligent Contract)     FailoverGate (Intelligent Contract)
  - project registration / activation   <----  registry_address (immutable binding)
  - permissionless run_safety_check()          project_id       (immutable binding)
  - leader/validator consensus check           execute_high_risk() -> requires
  - deterministic finding -> status map          registry.is_safe(project_id) == true
  - recovery flow (owner cannot self-override)  execute_low_risk() -> always allowed
  - append-only check history                   replay-protected action receipts
        ^
        | reads (is_safe / get_status)
        |
Next.js 16 / React 19 frontend (app/, components/, lib/)
  - wallet context, tx lifecycle, contract adapters, network guard, URL/schema validation
```

Contracts are the sole source of truth. The frontend never decides safety status itself.

## Repository layout

```
app/                  Next.js App Router routes (landing, projects, new, p/[id], gate/[id], incidents)
components/           Project-specific UI (status annunciators, interlock switch, evidence cards, tx panel)
contracts/            FailoverRegistry.py, FailoverGate.py (stable Studionet v0.2.18 runtime)
lib/genlayer/         Network module (canonical 61999 config), client, explorer helpers
lib/contract/         Registry/gate adapters, shared types, BigInt-safe GEN helpers, tx lifecycle
lib/wallet/           Wallet context/provider, EIP-1193 types
lib/validation/       URL hardening, Zod form schemas
lib/fixtures/         Canonical static demo fixtures (SAFE -> RESTRICTED -> RECOVERY_PENDING -> SAFE)
tests/contract/       Python unit + protocol tests (no live network)
tests/frontend/       Vitest unit tests (wallet, tx lifecycle)
scripts/              contract_static_checks.py, check-network.ts, deploy.ts, live-studionet-smoke.ts
docs/                 ARCHITECTURE, CONSENSUS, SECURITY, CONTRACT_SURFACE, DEPLOYMENT, REVIEWER_DEMO
.github/workflows/    CI (install, lint, typecheck, tests, build, py_compile, contract static checks)
```

## Network

Canonical target only:

```
Network:  GenLayer Studionet
Chain ID: 61999
RPC:      https://studio.genlayer.com/api
Explorer: https://explorer-studio.genlayer.com
Currency: GEN
```

`lib/genlayer/network.ts` is the single source of truth for these values, and
`scripts/check-network.ts` / `lib/genlayer/network.test.ts` assert the app never
resolves to chain 61997, Studio-dev, or a localnet.

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

Other commands:

```bash
npm run lint            # eslint
npm run typecheck       # tsc --noEmit
npm test                # vitest (frontend unit tests)
npm run build           # production Next.js build
npm run check:network   # verify effective network resolves to canonical Studionet

python3 -m py_compile contracts/*.py         # contract syntax check
python3 -m pytest tests/contract/ -v         # contract unit + protocol tests
python3 scripts/contract_static_checks.py    # Depends-hash / stable-runtime / no-secret preflight
```

## Deployment status

**Live on GenLayer Studionet (chain 61999).** `FailoverRegistry` and `FailoverGate`
are both deployed and bound to the project `failover-demo`; the production frontend
at https://failover-black.vercel.app is configured with the live addresses. See
`docs/DEPLOYMENT.md` for the exact commit, source hashes, deployment transactions,
live write evidence, and known limitations.

## Reviewer walkthrough

`docs/REVIEWER_DEMO.md` walks the full lifecycle (`SAFE -> RESTRICTED ->
RECOVERY_PENDING -> SAFE`) using the canonical static demo fixtures in
`lib/fixtures/demoProject.ts`, without requiring a live GenLayer node or funded wallet.

## Further reading

- `docs/ARCHITECTURE.md` — contracts, data flow, frontend layering
- `docs/CONSENSUS.md` — the leader/validator protocol and abstention rules
- `docs/SECURITY.md` — precise claims and non-claims, threat model
- `docs/CONTRACT_SURFACE.md` — full method-by-method contract interface
- `docs/DEPLOYMENT.md` — exact deployment steps and evidence format
- `docs/REVIEWER_DEMO.md` — concrete reviewer walkthrough
