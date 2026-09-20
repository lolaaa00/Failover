import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "@/lib/contract/addresses";
import { readProject, readProjectIds } from "@/lib/contract/registryAdapter";
import { NETWORK_CONFIG } from "@/lib/genlayer/network";
import type { ProjectRecord } from "@/lib/contract/types";

const CHAIN_ID = process.env.NEXT_PUBLIC_FAILOVER_CHAIN_ID ?? "61999";

/**
 * Live registry listing. This route reads `list_project_ids` +
 * `get_project` straight from the deployed FailoverRegistry -- it must
 * NEVER silently fall back to lib/fixtures/demoProject.ts. If the registry
 * is not deployed or a read fails, show a visible fail-closed error state
 * instead; the fixture-driven walkthrough lives only under /demo.
 */
export default async function ProjectsPage() {
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  if (!liveDeployed) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-8">
        <Header />
        <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-2">
          <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
            Live Registry Unavailable
          </p>
          <p className="font-mono-label text-[11px] text-cockpit-white/60">
            Chain: {NETWORK_CONFIG.chainId} | Registry: not configured
          </p>
          <p className="text-sm text-cockpit-white/60">
            `/projects` is a live-only listing and will not fall back to fixtures. Configure
            NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS to enable it.
          </p>
        </div>
        <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
          Open fixture demo
        </Link>
      </div>
    );
  }

  let projects: ProjectRecord[];
  try {
    const ids = await readProjectIds();
    projects = await Promise.all(ids.map((id) => readProject(id)));
  } catch (err) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-8">
        <Header />
        <div className="checksum-plate p-4 border-emergency-red/70 bg-emergency-red/10 space-y-2" role="alert">
          <p className="font-mono-label text-xs uppercase text-emergency-red font-bold">
            Registry Read Failed — Refusing To Show Stale Or Fixture Data
          </p>
          <p className="text-sm text-cockpit-white/60 break-words">
            {(err as Error)?.message ?? "Failed to read project list from the canonical Studionet registry."}
          </p>
        </div>
        <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
          Open fixture demo instead
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 space-y-8">
      <Header />
      <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
        <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Studionet Registry</p>
        <p className="font-mono-label text-[11px] text-cockpit-white/60">
          Chain: {CHAIN_ID} | Registry: {FAILOVER_REGISTRY_ADDRESS}
        </p>
      </div>

      {projects.length === 0 ? (
        <p className="text-cockpit-white/40 text-sm">No projects are registered on-chain yet.</p>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => (
            <li key={project.project_id}>
              <Link
                href={`/p/${project.project_id}`}
                className="checksum-plate p-5 flex items-center justify-between hover:border-avionics-blue/60 transition-colors block"
              >
                <div>
                  <p className="font-condensed text-xl font-semibold">{project.name}</p>
                  <p className="font-mono-label text-[11px] text-cockpit-white/40">{project.project_id}</p>
                </div>
                <StatusAnnunciator status={project.status} size="sm" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center justify-between">
      <h1 className="font-condensed text-3xl font-bold uppercase">Registered Projects</h1>
      <Link href="/new" className="font-mono-label text-xs uppercase underline text-avionics-blue">
        + Register
      </Link>
    </div>
  );
}
