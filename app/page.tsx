"use client";

import Link from "next/link";
import { useState } from "react";
import { InterlockSwitch } from "@/components/status/InterlockSwitch";

export default function LandingPage() {
  const [restricted, setRestricted] = useState(false);

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 space-y-24">
      <section className="grid md:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <p className="font-mono-label text-xs uppercase text-avionics-blue">
            Public-frontend &amp; release-integrity circuit breaker
          </p>
          <h1 className="font-condensed text-4xl md:text-5xl font-bold leading-[1.05] uppercase">
            When the public surface drifts, high-risk actions stop.
          </h1>
          <p className="text-cockpit-white/70 max-w-lg">
            Projects seal their official frontend, release, and incident sources on GenLayer.
            Anyone can permissionlessly trigger a safety check — no bounty. Independent validator
            nodes fetch and evaluate the live sources and reach consensus on whether the surface is
            still trustworthy. A downstream execution gate reads that verdict directly and refuses
            high-risk actions while a project is restricted.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/projects"
              className="font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
            >
              View Projects
            </Link>
            <Link
              href="/new"
              className="font-mono-label text-xs uppercase px-4 py-3 border border-white/20 hover:border-white/50"
            >
              Register a Project
            </Link>
          </div>
        </div>
        <div className="flex flex-col items-center gap-4">
          <InterlockSwitch restricted={restricted} />
          <button
            onClick={() => setRestricted((r) => !r)}
            className="font-mono-label text-[10px] uppercase text-cockpit-white/40 underline"
          >
            simulate finding flip
          </button>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        {[
          {
            title: "Permissionless checks, no bounty",
            body: "Anyone can trigger a safety check. Checkers earn nothing — this prevents bounty farming on emergency state.",
          },
          {
            title: "Consensus, not a single fetch",
            body: "A leader independently fetches and classifies evidence; validators independently re-derive the same material fields before consensus is reached.",
          },
          {
            title: "Real on-chain consequence",
            body: "FailoverGate reads registry.is_safe(project_id) and actually refuses execute_high_risk() while restricted — low-risk actions stay available.",
          },
        ].map((card) => (
          <div key={card.title} className="checksum-plate p-6 space-y-2">
            <h3 className="font-condensed uppercase font-semibold text-lg">{card.title}</h3>
            <p className="text-sm text-cockpit-white/70">{card.body}</p>
          </div>
        ))}
      </section>

      <section className="checksum-plate p-8 space-y-4">
        <p className="font-mono-label text-xs uppercase text-cockpit-white/50">Precise security language</p>
        <p className="text-cockpit-white/80 max-w-3xl">
          Failover does not claim perfect hack detection, malware scanning, or guaranteed safety. It
          provides a consensus-backed interpretation of declared public integrity surfaces, a
          fail-safe gate state, and a verified recovery path that requires fresh consensus rather
          than an owner-controlled unpause.
        </p>
      </section>
    </div>
  );
}
