"use client";

import { motion } from "framer-motion";

/**
 * The hero motif: a guarded switch that physically flips to RESTRICTED
 * when a release/frontend interlock mismatches. Purely decorative/SVG —
 * no external logo assets, no shield iconography.
 */
export function InterlockSwitch({ restricted }: { restricted: boolean }) {
  return (
    <div className="checksum-plate p-6 w-full max-w-sm" aria-hidden="true">
      <div className="flex items-center justify-between font-mono-label text-[10px] uppercase text-cockpit-white/50 mb-4">
        <span>Interlock</span>
        <span>{restricted ? "TRIPPED" : "ENGAGED"}</span>
      </div>
      <div className="relative h-28 border border-white/10 interlock-rail flex items-center justify-center">
        <motion.div
          initial={false}
          animate={{
            x: restricted ? -34 : 34,
            backgroundColor: restricted ? "#E5484D" : "#46C878",
          }}
          transition={{ type: "spring", stiffness: 220, damping: 20 }}
          className="h-14 w-14 rounded-sm shadow-lg"
        />
        <div className="absolute left-6 top-1/2 -translate-y-1/2 h-1 w-8 bg-white/15" />
        <div className="absolute right-6 top-1/2 -translate-y-1/2 h-1 w-8 bg-white/15" />
      </div>
      <div className="mt-3 flex justify-between font-mono-label text-[10px] uppercase text-cockpit-white/40">
        <span>SAFE</span>
        <span>RESTRICTED</span>
      </div>
    </div>
  );
}
