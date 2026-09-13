import type { StructuredFinding } from "@/lib/contract/types";

const SOURCE_LABEL: Record<string, string> = {
  frontend: "Frontend",
  release: "Release",
  incident: "Incident",
};

export function EvidenceCard({ finding }: { finding: StructuredFinding }) {
  return (
    <div className="checksum-plate p-5 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono-label text-[11px] uppercase">
        <Field label="Frontend Identity" value={finding.frontend_identity} />
        <Field label="Release Relation" value={finding.release_relation} />
        <Field label="Incident State" value={finding.incident_state} />
        <Field label="Expected Address" value={finding.expected_address_relation} />
      </div>
      <div>
        <p className="font-mono-label text-[11px] uppercase text-cockpit-white/50 mb-1">Reason</p>
        <p className="text-sm text-cockpit-white/90">{finding.reason}</p>
      </div>
      {finding.evidence.length > 0 && (
        <div>
          <p className="font-mono-label text-[11px] uppercase text-cockpit-white/50 mb-2">Grounded Evidence</p>
          <ul className="space-y-2">
            {finding.evidence.map((item, i) => (
              <li key={i} className="border-l-2 border-avionics-blue/60 pl-3">
                <span className="font-mono-label text-[10px] uppercase text-avionics-blue">
                  {SOURCE_LABEL[item.source] ?? item.source}
                </span>
                <p className="text-sm text-cockpit-white/80 italic">&ldquo;{item.excerpt}&rdquo;</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-cockpit-white/40">{label}</p>
      <p className="text-cockpit-white">{value}</p>
    </div>
  );
}
