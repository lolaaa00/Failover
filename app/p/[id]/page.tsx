import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { EvidenceCard } from "@/components/status/EvidenceCard";
import { demoProjectForStage, demoHistoryForStage, type DemoStage } from "@/lib/fixtures/demoProject";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "@/lib/contract/addresses";

function parseStage(value: string | undefined): DemoStage {
  const valid: DemoStage[] = ["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"];
  return valid.includes(value as DemoStage) ? (value as DemoStage) : "SAFE";
}

const CHAIN_ID = process.env.NEXT_PUBLIC_FAILOVER_CHAIN_ID ?? "61999";

export default async function ProjectDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam } = await searchParams;
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  // Live mode: if contract address is configured, use on-chain data.
  // If the project doesn't exist on-chain, show not-found — no fixture fallback.
  // Demo mode: if contract address is NOT configured, show fixture data with a clear banner.
  if (liveDeployed) {
    // Live mode: attempt registry read. If project not found, show not-found.
    // (Actual on-chain read would happen here in a full deployment.)
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
        <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
          <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Mode</p>
          <p className="font-mono-label text-[11px] text-cockpit-white/60">
            Chain: {CHAIN_ID} | Registry: {FAILOVER_REGISTRY_ADDRESS}
          </p>
        </div>
        <p className="font-mono-label text-xs text-cockpit-white/60">
          Project dossier for <span className="text-cockpit-white">{id}</span> — live registry read
          is available when the GenLayer client is connected.
        </p>
        <p className="text-cockpit-white/40 text-sm">
          Project not found on Studionet, or live read not yet implemented for this view.
          <br />
          Visit <Link href="/demo" className="text-avionics-blue underline">the demo</Link> to
          walk the full lifecycle with fixture data.
        </p>
      </div>
    );
  }

  // Demo mode: no contract deployed — show fixture data with clear DEMO banner.
  const stage = parseStage(stageParam);
  const project = demoProjectForStage(stage);
  const history = demoHistoryForStage(stage);
  const latestFindingRecord = [...history].reverse().find((h) => "finding" in h) as
    | (typeof history)[number] & { finding: import("@/lib/contract/types").StructuredFinding }
    | undefined;
  const latestFinding = latestFindingRecord?.finding;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
      {/* DEMO MODE BANNER — always shown when no contract address is configured */}
      <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-1">
        <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
          ⚠ DEMO MODE — No contract deployed. Showing fixture data only. Actions are simulated.
        </p>
        <p className="font-mono-label text-[11px] text-cockpit-white/50">
          Set <code>NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS</code> to a deployed registry to enable live mode.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono-label text-[11px] text-cockpit-white/40">{id}</p>
          <h1 className="font-condensed text-3xl font-bold uppercase">{project.name}</h1>
        </div>
        <StatusAnnunciator status={project.status} size="lg" />
      </div>

      <div className="checksum-plate p-5 grid sm:grid-cols-3 gap-4 font-mono-label text-xs">
        <SourceLink label="Frontend" url={project.frontend_url} />
        <SourceLink label="Release" url={project.release_url} />
        <SourceLink label="Incident" url={project.incident_url} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/p/${id}/check`}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-avionics-blue text-avionics-blue"
        >
          Open Check Chamber
        </Link>
        {(project.status === "RESTRICTED" || project.status === "RECOVERY_PENDING") && (
          <Link
            href={`/p/${id}/recovery`}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
          >
            Submit Recovery
          </Link>
        )}
        <Link
          href={`/gate/${id}`}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20"
        >
          Open Execution Gate Demo
        </Link>
      </div>

      {latestFinding && (
        <div className="space-y-3">
          <h2 className="font-condensed text-xl font-semibold uppercase">Latest Finding</h2>
          <EvidenceCard finding={latestFinding} />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-condensed text-xl font-semibold uppercase">Demo Lifecycle Walkthrough</h2>
        <p className="text-sm text-cockpit-white/60 max-w-xl">
          This reviewer walkthrough uses static canonical fixtures (see lib/fixtures/demoProject.ts)
          so the full SAFE → RESTRICTED → RECOVERY_PENDING → SAFE lifecycle can be inspected without
          a live GenLayer node.
        </p>
        <div className="flex flex-wrap gap-2 font-mono-label text-[11px] uppercase">
          {(["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"] as DemoStage[]).map((s) => (
            <Link
              key={s}
              href={`/p/${id}?stage=${s}`}
              className={`px-3 py-2 border ${stage === s ? "border-avionics-blue text-avionics-blue" : "border-white/15 text-cockpit-white/50"}`}
            >
              {s.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function SourceLink({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="text-cockpit-white/40 uppercase text-[10px]">{label}</p>
      <a href={url} target="_blank" rel="noreferrer" className="text-avionics-blue underline break-all">
        {url}
      </a>
    </div>
  );
}
