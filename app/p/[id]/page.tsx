import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { EvidenceCard } from "@/components/status/EvidenceCard";
import { ActivateProjectButton } from "@/components/project/ActivateProjectButton";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "@/lib/contract/addresses";
import { readHistory, readProject } from "@/lib/contract/registryAdapter";
import { NETWORK_CONFIG } from "@/lib/genlayer/network";
import type { CheckHistoryRecord, StructuredFinding } from "@/lib/contract/types";

const CHAIN_ID = process.env.NEXT_PUBLIC_FAILOVER_CHAIN_ID ?? "61999";

export default async function ProjectDossierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  if (!liveDeployed) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
        <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-2">
          <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
            Live Dossier Unavailable
          </p>
          <p className="font-mono-label text-[11px] text-cockpit-white/60">
            Chain: {NETWORK_CONFIG.chainId} | Registry: not configured
          </p>
        </div>
        <p className="text-cockpit-white/40 text-sm">
          `/p/{id}` is a live-only dossier and will not fall back to fixtures.
          <br />
          Visit <Link href="/demo" className="text-avionics-blue underline">the demo</Link> for the
          fixture walkthrough.
        </p>
      </div>
    );
  }

  let project: Awaited<ReturnType<typeof readProject>>;
  let history: CheckHistoryRecord[];
  try {
    project = await readProject(id);
    history = (await readHistory(id)) as CheckHistoryRecord[];
  } catch (err) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
        <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
          <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Mode</p>
          <p className="font-mono-label text-[11px] text-cockpit-white/60">
            Chain: {CHAIN_ID} | Registry: {FAILOVER_REGISTRY_ADDRESS}
          </p>
        </div>
        <p className="font-mono-label text-xs text-cockpit-white/60">
          Project <span className="text-cockpit-white">{id}</span> was not returned by the canonical
          Studionet registry.
        </p>
        <p className="text-cockpit-white/40 text-sm break-words">
          {(err as Error)?.message ?? "Live registry read failed."}
        </p>
        <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
          Open fixture demo
        </Link>
      </div>
    );
  }

  const latestFindingRecord = [...history].reverse().find((h) => "finding" in h) as
    | (typeof history)[number] & { finding: StructuredFinding }
    | undefined;
  const latestFinding = latestFindingRecord?.finding;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
      <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
        <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Studionet Dossier</p>
        <p className="font-mono-label text-[11px] text-cockpit-white/60">
          Chain: {CHAIN_ID} | RPC: {NETWORK_CONFIG.rpcUrl} | Registry: {FAILOVER_REGISTRY_ADDRESS}
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

      {project.status === "DRAFT" && <ActivateProjectButton projectId={id} owner={project.owner} />}

      <div className="flex flex-wrap gap-3">
        {project.status !== "DRAFT" && project.status !== "RETIRED" && (
          <Link
            href={`/p/${id}/check`}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-avionics-blue text-avionics-blue"
          >
            Open Check Chamber
          </Link>
        )}
        {(project.status === "RESTRICTED" ||
          project.status === "RECOVERY_PENDING" ||
          project.status === "RECOVERED") && (
          <Link
            href={`/p/${id}/recovery`}
            className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
          >
            {project.status === "RECOVERED" ? "Promote To Safe" : "Recovery"}
          </Link>
        )}
        <Link
          href={`/gate/${id}`}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20"
        >
          Open Live Execution Gate
        </Link>
      </div>

      {latestFinding && (
        <div className="space-y-3">
          <h2 className="font-condensed text-xl font-semibold uppercase">Latest Finding</h2>
          <EvidenceCard finding={latestFinding} />
          {latestFinding.evaluated_sources && (
            <div className="checksum-plate p-4 font-mono-label text-[11px] text-cockpit-white/60 space-y-2">
              <p className="uppercase text-cockpit-white/40">Evaluated Source Commitments</p>
              {latestFinding.evaluated_sources.map((source) => (
                <p key={source.source} className="break-all">
                  {source.source}: {source.evaluated_sha256} ({source.evaluated_length} bytes,
                  {source.available ? " available" : " unavailable"})
                </p>
              ))}
              {latestFinding.evidence_digest && <p className="break-all">evidence: {latestFinding.evidence_digest}</p>}
            </div>
          )}
        </div>
      )}
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
