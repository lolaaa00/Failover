"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { StatusAnnunciator } from "@/components/status/StatusAnnunciator";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { createFinalityStep } from "@/lib/contract/finality";
import { submitRecoverySchema, type SubmitRecoveryInput } from "@/lib/validation/schemas";
import {
  readStatus,
  submitMarkRecoveredSafe,
  submitRecovery,
  submitRunRecoveryCheck,
} from "@/lib/contract/registryAdapter";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { isDeployed, FAILOVER_REGISTRY_ADDRESS } from "@/lib/contract/addresses";
import type { ProjectStatus } from "@/lib/contract/types";

export default function RecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const liveDeployed = isDeployed(FAILOVER_REGISTRY_ADDRESS);
  const [status, setStatus] = useState<ProjectStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function refreshStatus() {
    if (!liveDeployed) return;
    try {
      setStatus(await readStatus(id));
      setStatusError(null);
    } catch (err) {
      setStatusError((err as Error)?.message ?? "Failed to read project status");
    }
  }

  useEffect(() => {
    // Fetching authoritative on-chain project status on mount -- an
    // external-system read, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, liveDeployed]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-8">
      <Link href={`/p/${id}`} className="font-mono-label text-xs uppercase text-cockpit-white/50 underline">
        ← Back to dossier
      </Link>
      <h1 className="font-condensed text-3xl font-bold uppercase">Recovery</h1>
      <p className="text-cockpit-white/60 text-sm max-w-xl">
        The project owner cannot self-unpause. Submitting a recovery release moves the project to
        RECOVERY_PENDING; only a fresh, permissionless leader/validator consensus check
        (run_recovery_check) can move it to RECOVERED, and only then does a separate promotion move it
        to SAFE. The old, compromised release URL stays in history — it is never overwritten.
      </p>

      {!liveDeployed && (
        <div className="checksum-plate p-4 border-caution-amber/50">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            No live deployment configured — this page is fully wired but reads/writes will report an
            error until the registry is deployed.
          </p>
        </div>
      )}

      {liveDeployed && (
        <>
          <div className="flex items-center gap-3">
            <span className="font-mono-label text-[11px] uppercase text-cockpit-white/40">
              Current status
            </span>
            {status ? <StatusAnnunciator status={status} /> : <span className="text-cockpit-white/40 text-sm">Reading…</span>}
          </div>
          {statusError && <p className="text-emergency-red font-mono-label text-xs">{statusError}</p>}

          {status === "RESTRICTED" && (
            <SubmitRecoveryForm projectId={id} onSubmitted={refreshStatus} />
          )}
          {status === "RECOVERY_PENDING" && (
            <RunRecoveryCheckPanel projectId={id} onChecked={refreshStatus} />
          )}
          {status === "RECOVERED" && (
            <PromoteToSafePanel projectId={id} onPromoted={refreshStatus} />
          )}
          {status && !["RESTRICTED", "RECOVERY_PENDING", "RECOVERED"].includes(status) && (
            <div className="checksum-plate p-5 space-y-2">
              <p className="text-sm text-cockpit-white/60">
                No recovery action is available from status <span className="text-cockpit-white">{status}</span>.
                Recovery only starts once a check moves the project to RESTRICTED.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function SubmitRecoveryForm({ projectId, onSubmitted }: { projectId: string; onSubmitted: () => void }) {
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: string }>();
  const [form, setForm] = useState<Omit<SubmitRecoveryInput, "projectId">>({
    newReleaseUrl: "",
    newFrontendUrl: "",
    recoveryDescription: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = submitRecoverySchema.safeParse({ ...form, projectId });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;

    const finality = createFinalityStep();
    await run({
      submit: () =>
        submitRecovery(
          wallet.address as `0x${string}`,
          wallet.provider!,
          projectId,
          parsed.data.newReleaseUrl,
          parsed.data.newFrontendUrl || null,
          parsed.data.recoveryDescription,
        ),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        // submit_recovery is deterministic (RESTRICTED/RECOVERY_PENDING ->
        // RECOVERY_PENDING, or it reverts), so the real postcondition check
        // happens in rereadAndValidate -- no need for an extra read here.
        return { status: "ok" as const };
      },
      rereadAndValidate: async () => {
        const next = await readStatus(projectId);
        const ok = next === "RECOVERY_PENDING";
        if (ok) onSubmitted();
        return ok;
      },
    });
  }

  return (
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
    </form>
  );
}

export function RunRecoveryCheckPanel({ projectId, onChecked }: { projectId: string; onChecked: () => void }) {
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: string }>();

  async function handleRun() {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    const finality = createFinalityStep();
    await run({
      submit: () => submitRunRecoveryCheck(wallet.address as `0x${string}`, wallet.provider!, projectId),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        return { status: await readStatus(projectId) };
      },
      rereadAndValidate: async (result) => {
        const next = await readStatus(projectId);
        onChecked();
        return next === result.status;
      },
    });
  }

  return (
    <div className="checksum-plate p-5 space-y-4">
      <p className="font-mono-label text-xs uppercase text-avionics-blue">Recovery Pending Consensus</p>
      <p className="text-sm text-cockpit-white/60">
        Anyone may permissionlessly trigger a fresh leader/validator re-check of the recovery release.
        The owner cannot set the outcome directly — only a passing consensus check moves the project to
        RECOVERED.
      </p>
      <NetworkGuard>
        <button
          onClick={() => void handleRun()}
          className="font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
        >
          Run Recovery Check
        </button>
      </NetworkGuard>
      <TxLifecyclePanel state={state} />
    </div>
  );
}

export function PromoteToSafePanel({ projectId, onPromoted }: { projectId: string; onPromoted: () => void }) {
  const wallet = useWallet();
  const { state, run } = useTxLifecycle<{ status: string }>();

  async function handlePromote() {
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;
    const finality = createFinalityStep();
    await run({
      submit: () => submitMarkRecoveredSafe(wallet.address as `0x${string}`, wallet.provider!, projectId),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        return { status: "SAFE" as const };
      },
      rereadAndValidate: async () => {
        // mark_recovered_safe is deterministic (RECOVERED -> SAFE, or it
        // reverts) once it doesn't revert, so assert that exact
        // postcondition rather than comparing two back-to-back reads to
        // each other -- a stale RPC replica that still shows RECOVERED on
        // both reads would otherwise "match" and falsely report success.
        const next = await readStatus(projectId);
        onPromoted();
        return next === "SAFE";
      },
    });
  }

  return (
    <div className="checksum-plate p-5 space-y-4 border-safe-green/50">
      <p className="font-mono-label text-xs uppercase text-safe-green">Recovered — Consensus Confirmed</p>
      <p className="text-sm text-cockpit-white/60">
        The recovery release has already passed a fresh leader/validator consensus check. This
        permissionless promotion performs no new judgement — it only reflects the already-confirmed
        RECOVERED state back to full SAFE operating status.
      </p>
      <NetworkGuard>
        <button
          onClick={() => void handlePromote()}
          className="font-mono-label text-xs uppercase px-4 py-3 bg-safe-green text-panel-black font-semibold"
        >
          Promote To SAFE
        </button>
      </NetworkGuard>
      <TxLifecyclePanel state={state} />
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
