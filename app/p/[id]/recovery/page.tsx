"use client";

import { use, useState } from "react";
import Link from "next/link";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { submitRecoverySchema, type SubmitRecoveryInput } from "@/lib/validation/schemas";
import { submitRecovery, readStatus } from "@/lib/contract/registryAdapter";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { isDeployed, FAILOVER_REGISTRY_ADDRESS } from "@/lib/contract/addresses";

export default function RecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: string }>();
  const [form, setForm] = useState<Omit<SubmitRecoveryInput, "projectId">>({
    newReleaseUrl: "",
    newFrontendUrl: "",
    recoveryDescription: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = submitRecoverySchema.safeParse({ ...form, projectId: id });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;

    await run({
      submit: () =>
        submitRecovery(
          wallet.address as `0x${string}`,
          wallet.provider!,
          id,
          parsed.data.newReleaseUrl,
          parsed.data.newFrontendUrl || null,
          parsed.data.recoveryDescription,
        ),
      waitForFinality: async () => ({ status: "FINALIZED" }),
      readExecutionResult: async () => ({ status: await readStatus(id) }),
      rereadAndValidate: async () => (await readStatus(id)) === "RECOVERY_PENDING",
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-8">
      <Link href={`/p/${id}`} className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        ← Back to dossier
      </Link>
      <h1 className="font-condensed text-3xl font-bold uppercase">Submit Recovery Release</h1>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        The project owner cannot self-unpause. Submitting a recovery release moves the project to
        RECOVERY_PENDING; only a fresh leader/validator consensus check (run_recovery_check) can
        move it to RECOVERED and then SAFE. The old, compromised release URL stays in history —
        it is never overwritten.
      </p>

      {!liveDeployed && (
        <div className="checksum-plate p-4 border-caution-amber/50">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            No live deployment configured — this form is fully wired but write submission will
            report an error until the registry is deployed.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="New Recovery Release URL" error={errors.newReleaseUrl}>
          <input
            value={form.newReleaseUrl}
            onChange={(e) => setForm((f) => ({ ...f, newReleaseUrl: e.target.value }))}
            className="input"
            placeholder="https://github.com/org/app/releases/v2-recovery"
          />
        </Field>
        <Field label="New Frontend URL (optional)" error={errors.newFrontendUrl}>
          <input
            value={form.newFrontendUrl}
            onChange={(e) => setForm((f) => ({ ...f, newFrontendUrl: e.target.value }))}
            className="input"
            placeholder="leave blank to keep the existing frontend URL"
          />
        </Field>
        <Field label="Recovery Description" error={errors.recoveryDescription}>
          <textarea
            value={form.recoveryDescription}
            onChange={(e) => setForm((f) => ({ ...f, recoveryDescription: e.target.value }))}
            className="input min-h-28"
            placeholder="Rotated compromised deploy keys, rebuilt from a clean, audited source tree."
          />
        </Field>

        <NetworkGuard>
          <button
            type="submit"
            className="font-mono-label text-xs uppercase px-4 py-3 bg-caution-amber text-panel-black font-semibold"
          >
            Submit Recovery
          </button>
        </NetworkGuard>
      </form>

      <TxLifecyclePanel state={state} />

      <style jsx global>{`
        .input {
          width: 100%;
          background: var(--color-panel-raised);
          border: 1px solid rgba(232, 236, 232, 0.15);
          padding: 0.65rem 0.75rem;
          color: var(--color-cockpit-white);
          font-family: var(--font-mono);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono-label text-[11px] uppercase text-cockpit-white/60">{label}</span>
      {children}
      {error && <span className="block text-emergency-red text-xs">{error}</span>}
    </label>
  );
}
