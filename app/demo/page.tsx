/**
 * /demo — Explicit DEMO mode route.
 *
 * Presents the full lifecycle walkthrough using static fixture data.
 * Clearly labeled DEMO throughout so reviewers and users never mistake
 * fixture content for live on-chain data.
 */
import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { EvidenceCard } from "@/components/status/EvidenceCard";
import { demoProjectForStage, demoHistoryForStage, type DemoStage } from "@/lib/fixtures/demoProject";

function parseStage(value: string | undefined): DemoStage {
  const valid: DemoStage[] = ["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"];
  return valid.includes(value as DemoStage) ? (value as DemoStage) : "SAFE";
}

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
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
      {/* Always-visible DEMO banner */}
      <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-1">
        <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
          ⚠ DEMO MODE — Fixture data only. No live contract interaction. Actions are simulated.
        </p>
        <p className="font-mono-label text-[11px] text-cockpit-white/50">
          This walkthrough uses canonical fixtures from <code>lib/fixtures/demoProject.ts</code>.
          All data is static and deterministic — no GenLayer node required.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono-label text-[11px] text-caution-amber uppercase">Demo Project</p>
          <h1 className="font-condensed text-3xl font-bold uppercase">{project.name}</h1>
        </div>
        <StatusAnnunciator status={project.status} size="lg" />
      </div>

      <div className="space-y-3">
        <h2 className="font-condensed text-xl font-semibold uppercase">
          [DEMO] Lifecycle Stage: {stage.replace(/_/g, " ")}
        </h2>
        <div className="flex flex-wrap gap-2 font-mono-label text-[11px] uppercase">
          {(["SAFE", "RESTRICTED", "RECOVERY_PENDING", "RECOVERED_TO_SAFE"] as DemoStage[]).map((s) => (
            <Link
              key={s}
              href={`/demo?stage=${s}`}
              className={`px-3 py-2 border ${stage === s ? "border-caution-amber text-caution-amber" : "border-white/15 text-cockpit-white/50"}`}
            >
              {s.replace(/_/g, " ")}
            </Link>
          ))}
        </div>
      </div>

      {latestFinding && (
        <div className="space-y-3">
          <h2 className="font-condensed text-xl font-semibold uppercase">[DEMO] Latest Finding</h2>
          <EvidenceCard finding={latestFinding} />
        </div>
      )}

      <div className="checksum-plate p-5 grid sm:grid-cols-3 gap-4 font-mono-label text-xs">
        <SourceBlock label="Frontend URL (fixture)" url={project.frontend_url} />
        <SourceBlock label="Release URL (fixture)" url={project.release_url} />
        <SourceBlock label="Incident URL (fixture)" url={project.incident_url} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/demo/gate?stage=${stage}`}
          className="font-mono-label text-xs uppercase px-4 py-3 border border-caution-amber text-caution-amber"
        >
          [DEMO] Open Gate Walkthrough
        </Link>
        <Link
          href="/"
          className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20 text-cockpit-white/50"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}

function SourceBlock({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <p className="text-caution-amber/60 uppercase text-[10px]">{label}</p>
      <span className="text-cockpit-white/50 break-all">{url}</span>
    </div>
  );
}
