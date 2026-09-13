import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { EvidenceCard } from "@/components/status/EvidenceCard";
import { demoProjectForStage, demoHistoryForStage, type DemoStage } from "@/lib/fixtures/demoProject";

function parseStage(value: string | undefined): DemoStage {
  const valid: DemoStage[] = ["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"];
  return valid.includes(value as DemoStage) ? (value as DemoStage) : "SAFE";
}

export default async function ProjectDossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { id } = await params;
  const { stage: stageParam } = await searchParams;
  const stage = parseStage(stageParam);
  const project = demoProjectForStage(stage);
  const history = demoHistoryForStage(stage);
  const latestFindingRecord = [...history].reverse().find((h) => "finding" in h) as
    | (typeof history)[number] & { finding: import("@/lib/contract/types").StructuredFinding }
    | undefined;
  const latestFinding = latestFindingRecord?.finding;

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 space-y-10">
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
