import { demoHistoryForStage, DEMO_PROJECT_ID } from "@/lib/fixtures/demoProject";
import type { CheckHistoryRecord } from "@/lib/contract/types";

const TYPE_LABEL: Record<string, string> = {
  CHECK: "Safety Check",
  RECOVERY_SUBMITTED: "Recovery Submitted",
  RECOVERY_CHECK: "Recovery Check",
  PROMOTED_SAFE: "Promoted to SAFE",
};

export default function IncidentsPage() {
  const history = demoHistoryForStage("RECOVERED_TO_SAFE");

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <h1 className="font-condensed text-3xl font-bold uppercase">Incident History</h1>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        Check history is append-only on-chain — records are never overwritten, even across
        recovery. This view shows the full canonical demo timeline for {DEMO_PROJECT_ID}.
      </p>
      <ol className="space-y-4 border-l border-white/10 pl-6">
        {history.map((record, i) => (
          <HistoryItem key={i} record={record} />
        ))}
      </ol>
    </div>
  );
}

function HistoryItem({ record }: { record: CheckHistoryRecord }) {
  return (
    <li className="relative checksum-plate p-4">
      <span className="absolute -left-[29px] top-5 h-2.5 w-2.5 rounded-full bg-avionics-blue" aria-hidden />
      <p className="font-mono-label text-[11px] uppercase text-avionics-blue">
        {TYPE_LABEL[record.type] ?? record.type}
      </p>
      <p className="font-mono-label text-[10px] text-cockpit-white/40 mb-2">
        {new Date(record.at * 1000).toISOString()}
      </p>
      {"finding" in record && record.finding !== undefined && (
        <p className="text-sm text-cockpit-white/80">
          Finding: <span className="font-semibold">{(record.finding as { finding: string }).finding}</span>
        </p>
      )}
      {"description" in record && typeof record.description === "string" && (
        <p className="text-sm text-cockpit-white/70 italic">&ldquo;{record.description}&rdquo;</p>
      )}
      {"new_status" in record && (
        <p className="text-sm text-cockpit-white/70">
          {String(record.previous_status)} → <span className="font-semibold">{String(record.new_status)}</span>
        </p>
      )}
    </li>
  );
}
