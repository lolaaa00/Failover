"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet, isWriteReady } from "@/lib/wallet/WalletProvider";
import { NetworkGuard } from "@/components/wallet/NetworkGuard";
import { TxLifecyclePanel } from "@/components/tx/TxLifecyclePanel";
import { useTxLifecycle } from "@/lib/contract/txLifecycle";
import { createFinalityStep } from "@/lib/contract/finality";
import { registerProjectSchema, type RegisterProjectInput } from "@/lib/validation/schemas";
import { submitRegisterProject, readProject } from "@/lib/contract/registryAdapter";
import { isDeployed, FAILOVER_REGISTRY_ADDRESS } from "@/lib/contract/addresses";

const EMPTY: RegisterProjectInput = {
  projectId: "",
  name: "",
  frontendUrl: "",
  releaseUrl: "",
  incidentUrl: "",
  expectedAddress: "",
  checkCooldownSeconds: 300,
  staleReleasePolicy: "RESTRICTED",
  unavailablePolicy: "RESTRICTED",
};

export default function RegisterProjectPage() {
  const wallet = useWallet();
  const [form, setForm] = useState<RegisterProjectInput>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [registeredProjectId, setRegisteredProjectId] = useState<string | null>(null);
  const { state, run } = useTxLifecycle<{ status: "ok" }>();

  function update<K extends keyof RegisterProjectInput>(key: K, value: RegisterProjectInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerProjectSchema.safeParse(form);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    if (!isWriteReady(wallet) || !wallet.address || !wallet.provider) return;

    setRegisteredProjectId(null);
    const finality = createFinalityStep();
    await run({
      submit: () =>
        submitRegisterProject(wallet.address as `0x${string}`, wallet.provider!, {
          projectId: parsed.data.projectId,
          name: parsed.data.name,
          frontendUrl: parsed.data.frontendUrl,
          releaseUrl: parsed.data.releaseUrl,
          incidentUrl: parsed.data.incidentUrl,
          expectedAddress: parsed.data.expectedAddress,
          checkCooldownSeconds: parsed.data.checkCooldownSeconds,
          staleReleasePolicy: parsed.data.staleReleasePolicy,
          unavailablePolicy: parsed.data.unavailablePolicy,
        }),
      waitForFinality: finality.waitForFinality,
      readExecutionResult: async () => {
        finality.assertExecutionSucceeded();
        return { status: "ok" as const };
      },
      rereadAndValidate: async () => {
        const project = await readProject(parsed.data.projectId);
        const ok = project.status === "DRAFT";
        if (ok) setRegisteredProjectId(parsed.data.projectId);
        return ok;
      },
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 space-y-8">
      <h1 className="font-condensed text-3xl font-bold uppercase">Register a Project</h1>
      <p className="text-cockpit-white/60 text-sm">
        Fields are frozen after activation. Only a recovery release can change the release/frontend
        URLs after that point — see docs/SECURITY.md.
      </p>

      {!isDeployed(FAILOVER_REGISTRY_ADDRESS) && (
        <div className="checksum-plate p-4 border-caution-amber/50">
          <p className="font-mono-label text-xs uppercase text-caution-amber">
            FailoverRegistry has no live Studionet address configured in this build (no funded
            deployer signer was available). This form is fully wired for a real submission but will
            report an error until NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS is set post-deployment.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Field label="Project ID (lowercase, hyphenated)" error={fieldErrors.projectId}>
          <input
            value={form.projectId}
            onChange={(e) => update("projectId", e.target.value)}
            className="input"
            placeholder="orbit-wallet"
          />
        </Field>
        <Field label="Project Name" error={fieldErrors.name}>
          <input value={form.name} onChange={(e) => update("name", e.target.value)} className="input" />
        </Field>
        <Field label="Official Frontend URL" error={fieldErrors.frontendUrl}>
          <input
            value={form.frontendUrl}
            onChange={(e) => update("frontendUrl", e.target.value)}
            className="input"
            placeholder="https://app.example.com/"
          />
        </Field>
        <Field label="Canonical Release/Repository URL" error={fieldErrors.releaseUrl}>
          <input
            value={form.releaseUrl}
            onChange={(e) => update("releaseUrl", e.target.value)}
            className="input"
            placeholder="https://github.com/org/app/releases/v1"
          />
        </Field>
        <Field label="Official Incident/Status URL" error={fieldErrors.incidentUrl}>
          <input
            value={form.incidentUrl}
            onChange={(e) => update("incidentUrl", e.target.value)}
            className="input"
            placeholder="https://status.example.com/"
          />
        </Field>
        <Field label="Expected Address / Action Descriptor (optional)" error={fieldErrors.expectedAddress}>
          <input
            value={form.expectedAddress}
            onChange={(e) => update("expectedAddress", e.target.value)}
            className="input"
            placeholder="0x… official deposit contract"
          />
        </Field>
        <Field label="Check Cooldown (seconds, min 300)" error={fieldErrors.checkCooldownSeconds}>
          <input
            type="number"
            min={300}
            value={form.checkCooldownSeconds}
            onChange={(e) => update("checkCooldownSeconds", Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Stale-Release Policy">
          <select
            value={form.staleReleasePolicy}
            onChange={(e) => update("staleReleasePolicy", e.target.value as RegisterProjectInput["staleReleasePolicy"])}
            className="input"
          >
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="RECOVERY_PENDING">RECOVERY_PENDING</option>
          </select>
        </Field>
        <Field label="Unavailable-Sources Policy">
          <select
            value={form.unavailablePolicy}
            onChange={(e) => update("unavailablePolicy", e.target.value as RegisterProjectInput["unavailablePolicy"])}
            className="input"
          >
            <option value="RESTRICTED">RESTRICTED</option>
            <option value="RECOVERY_PENDING">RECOVERY_PENDING</option>
          </select>
        </Field>

        <NetworkGuard>
          <button
            type="submit"
            className="font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
          >
            Register Project (DRAFT)
          </button>
        </NetworkGuard>
      </form>

      <TxLifecyclePanel state={state} />

      {state.phase === "STATE_REREAD" && registeredProjectId && (
        <div className="checksum-plate p-5 border-avionics-blue/50 space-y-3">
          <p className="font-mono-label text-xs uppercase text-avionics-blue">Registered — status DRAFT</p>
          <p className="text-sm text-cockpit-white/60">
            The project is registered but the gate stays closed until it is activated. Activation is a
            separate owner-signed write (spec section 4) so URLs can be reviewed once more before the
            fields freeze.
          </p>
          <Link
            href={`/p/${registeredProjectId}`}
            className="inline-block font-mono-label text-xs uppercase px-4 py-3 bg-avionics-blue text-panel-black font-semibold"
          >
            Open dossier to activate →
          </Link>
        </div>
      )}

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
        .input:focus {
          border-color: var(--color-avionics-blue);
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
