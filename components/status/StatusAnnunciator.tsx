import type { ProjectStatus } from "@/lib/contract/types";

const STATUS_META: Record<ProjectStatus, { label: string; color: string; description: string }> = {
  DRAFT: { label: "DRAFT", color: "text-cockpit-white/50 border-cockpit-white/30", description: "Not yet activated" },
  PENDING_FIRST_CHECK: {
    label: "PENDING FIRST CHECK",
    color: "text-caution-amber border-caution-amber",
    description: "Gate closed until first consensus",
  },
  SAFE: { label: "SAFE", color: "text-safe-green border-safe-green", description: "Consensus-confirmed clean" },
  CHECKING: { label: "CHECKING", color: "text-avionics-blue border-avionics-blue", description: "Consensus in progress" },
  RESTRICTED: { label: "RESTRICTED", color: "text-emergency-red border-emergency-red", description: "High-risk actions gated" },
  RECOVERY_PENDING: {
    label: "RECOVERY PENDING",
    color: "text-caution-amber border-caution-amber",
    description: "Awaiting recovery re-check",
  },
  RECOVERED: { label: "RECOVERED", color: "text-safe-green border-safe-green", description: "Recovery confirmed" },
  RETIRED: { label: "RETIRED", color: "text-cockpit-white/40 border-cockpit-white/20", description: "No longer monitored" },
};

export function StatusAnnunciator({ status, size = "md" }: { status: ProjectStatus; size?: "sm" | "md" | "lg" }) {
  const meta = STATUS_META[status];
  const sizeClasses = size === "lg" ? "text-2xl px-5 py-3" : size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-2";
  return (
    <div
      role="status"
      aria-label={`Project status: ${meta.label}`}
      className={`inline-flex flex-col items-start border font-mono-label uppercase ${meta.color} ${sizeClasses} checksum-plate`}
    >
      <span className="tracking-widest">{meta.label}</span>
      {size !== "sm" && <span className="text-[10px] normal-case text-cockpit-white/50 mt-0.5">{meta.description}</span>}
    </div>
  );
}
