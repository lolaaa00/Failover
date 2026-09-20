import Link from "next/link";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "@/lib/contract/addresses";
import { readHistory, readProjectIds } from "@/lib/contract/registryAdapter";
import { NETWORK_CONFIG } from "@/lib/genlayer/network";
import type { CheckHistoryRecord } from "@/lib/contract/types";

const CHAIN_ID = process.env.NEXT_PUBLIC_FAILOVER_CHAIN_ID ?? "61999";

const TYPE_LABEL: Record<string, string> = {
  CHECK: "Safety Check",
  RECOVERY_SUBMITTED: "Recovery Submitted",
  RECOVERY_CHECK: "Recovery Check",
  PROMOTED_SAFE: "Promoted to SAFE",
  TRUNCATED: "History Truncated",
};

type IncidentRecord = CheckHistoryRecord & { project_id: string };

/**
 * Live incident timeline across every registered project. Reads
 * `list_project_ids` + `get_history` straight from the deployed
 * FailoverRegistry -- append-only, never overwritten on-chain. This route
 * must NEVER silently fall back to lib/fixtures/demoProject.ts; on a read
 * failure it shows a visible fail-closed error instead. The fixture
 * walkthrough lives only under /demo.
 */
export default async function IncidentsPage() {
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  if (!liveDeployed) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
        <h1 className="font-condensed text-3xl font-bold uppercase">Incident History</h1>
        <div className="checksum-plate p-4 border-caution-amber/70 bg-caution-amber/10 space-y-2">
          <p className="font-mono-label text-xs uppercase text-caution-amber font-bold">
            Live History Unavailable
          </p>
          <p className="font-mono-label text-[11px] text-cockpit-white/60">
            Chain: {NETWORK_CONFIG.chainId} | Registry: not configured
          </p>
          <p className="text-sm text-cockpit-white/60">
            `/incidents` is a live-only timeline and will not fall back to fixtures. Configure
            NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS to enable it.
          </p>
        </div>
        <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
          Open fixture demo
        </Link>
      </div>
    );
  }

  let records: IncidentRecord[];
  try {
    const ids = await readProjectIds();
    const perProject = await Promise.all(
      ids.map(async (id) => {
        const history = (await readHistory(id)) as CheckHistoryRecord[];
        return history.map((record) => ({ ...record, project_id: id }));
      }),
    );
    records = perProject.flat().sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  } catch (err) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
        <h1 className="font-condensed text-3xl font-bold uppercase">Incident History</h1>
        <div className="checksum-plate p-4 border-emergency-red/70 bg-emergency-red/10 space-y-2" role="alert">
          <p className="font-mono-label text-xs uppercase text-emergency-red font-bold">
            History Read Failed — Refusing To Show Stale Or Fixture Data
          </p>
          <p className="text-sm text-cockpit-white/60 break-words">
            {(err as Error)?.message ?? "Failed to read check history from the canonical Studionet registry."}
          </p>
        </div>
        <Link href="/demo" className="font-mono-label text-xs uppercase text-avionics-blue underline">
          Open fixture demo instead
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 space-y-8">
      <h1 className="font-condensed text-3xl font-bold uppercase">Incident History</h1>
      <div className="checksum-plate p-4 border-avionics-blue/50 space-y-2">
        <p className="font-mono-label text-xs uppercase text-avionics-blue">Live Studionet Registry</p>
        <p className="font-mono-label text-[11px] text-cockpit-white/60">
          Chain: {CHAIN_ID} | Registry: {FAILOVER_REGISTRY_ADDRESS}
        </p>
      </div>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        Check history is append-only on-chain — records are never overwritten, even across
        recovery. This view merges the canonical history of every registered project.
      </p>
      {records.length === 0 ? (
        <p className="text-cockpit-white/40 text-sm">No history recorded on-chain yet.</p>
      ) : (
        <ol className="space-y-4 border-l border-white/10 pl-6">
          {records.map((record, i) => (
            <HistoryItem key={i} record={record} />
          ))}
        </ol>
      )}
    </div>
  );
}

function HistoryItem({ record }: { record: IncidentRecord }) {
  return (
    <li className="relative checksum-plate p-4">
      <span className="absolute -left-[29px] top-5 h-2.5 w-2.5 rounded-full bg-avionics-blue" aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono-label text-[11px] uppercase text-avionics-blue">
          {TYPE_LABEL[record.type] ?? record.type}
        </p>
        <Link
          href={`/p/${record.project_id}`}
          className="font-mono-label text-[10px] uppercase text-cockpit-white/40 underline"
        >
          {record.project_id}
        </Link>
      </div>
      <p className="font-mono-label text-[10px] text-cockpit-white/40 mb-2">
        {record.at ? new Date(record.at * 1000).toISOString() : "unknown time"}
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
