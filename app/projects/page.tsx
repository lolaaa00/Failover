import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { demoProjectForStage, DEMO_PROJECT_ID } from "@/lib/fixtures/demoProject";

export default function ProjectsPage() {
  const demo = demoProjectForStage("SAFE");

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="font-condensed text-3xl font-bold uppercase">Registered Projects</h1>
        <Link href="/new" className="font-mono-label text-xs uppercase underline text-avionics-blue">
          + Register
        </Link>
      </div>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        No project is deployed to a live Studionet address in this build (no funded signer was
        available). The demo project below is a fully wired canonical fixture — walk its full
        lifecycle from the project dossier.
      </p>
      <ul className="space-y-3">
        <li>
          <Link
            href={`/p/${demo.project_id}`}
            className="checksum-plate p-5 flex items-center justify-between hover:border-avionics-blue/60 transition-colors block"
          >
            <div>
              <p className="font-condensed text-xl font-semibold">{demo.name}</p>
              <p className="font-mono-label text-[11px] text-cockpit-white/40">{demo.project_id}</p>
            </div>
            <StatusAnnunciator status={demo.status} size="sm" />
          </Link>
        </li>
      </ul>
      <p className="font-mono-label text-[11px] uppercase text-cockpit-white/30">
        Demo project id: {DEMO_PROJECT_ID}
      </p>
    </div>
  );
}
