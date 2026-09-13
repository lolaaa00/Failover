import { createReadClient, createWriteClient } from "@/lib/genlayer/client";
import { FAILOVER_REGISTRY_ADDRESS, isDeployed } from "./addresses";
import type { Eip1193Provider } from "@/lib/wallet/types";
import type { ProjectRecord, ProjectStatus, SafetyFinding } from "./types";

/**
 * Thin adapter over the FailoverRegistry Intelligent Contract. Every method
 * here maps 1:1 onto a contract method in contracts/FailoverRegistry.py --
 * no business logic is duplicated here beyond JSON (de)serialization,
 * because the contract is the single source of truth.
 */

function requireDeployed(): `0x${string}` {
  if (!isDeployed(FAILOVER_REGISTRY_ADDRESS)) {
    throw new Error(
      "FailoverRegistry is not yet deployed (no funded Studionet signer in this environment). " +
        "Set NEXT_PUBLIC_FAILOVER_REGISTRY_ADDRESS once deployed. See docs/DEPLOYMENT.md.",
    );
  }
  return FAILOVER_REGISTRY_ADDRESS;
}

export async function readProject(projectId: string): Promise<ProjectRecord> {
  const address = requireDeployed();
  const client = createReadClient();
  const raw = (await client.readContract({
    address,
    functionName: "get_project",
    args: [projectId],
  })) as string;
  return JSON.parse(raw) as ProjectRecord;
}

export async function readStatus(projectId: string): Promise<ProjectStatus> {
  const address = requireDeployed();
  const client = createReadClient();
  return (await client.readContract({
    address,
    functionName: "get_status",
    args: [projectId],
  })) as ProjectStatus;
}

export async function readIsSafe(projectId: string): Promise<boolean> {
  const address = requireDeployed();
  const client = createReadClient();
  return (await client.readContract({
    address,
    functionName: "is_safe",
    args: [projectId],
  })) as boolean;
}

export async function readHistory(projectId: string): Promise<unknown[]> {
  const address = requireDeployed();
  const client = createReadClient();
  const raw = (await client.readContract({
    address,
    functionName: "get_history",
    args: [projectId],
  })) as string;
  return JSON.parse(raw) as unknown[];
}

export async function readProjectIds(): Promise<string[]> {
  const address = requireDeployed();
  const client = createReadClient();
  return (await client.readContract({
    address,
    functionName: "list_project_ids",
    args: [],
  })) as string[];
}

export interface RegisterProjectArgs {
  projectId: string;
  name: string;
  frontendUrl: string;
  releaseUrl: string;
  incidentUrl: string;
  expectedAddress: string;
  checkCooldownSeconds: number;
  staleReleasePolicy: string;
  unavailablePolicy: string;
}

export async function submitRegisterProject(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  args: RegisterProjectArgs,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({
    address,
    functionName: "register_project",
    args: [
      args.projectId,
      args.name,
      args.frontendUrl,
      args.releaseUrl,
      args.incidentUrl,
      args.expectedAddress,
      args.checkCooldownSeconds,
      args.staleReleasePolicy,
      args.unavailablePolicy,
    ],
  });
  return tx as unknown as string;
}

export async function submitActivateProject(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  projectId: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({
    address,
    functionName: "activate_project",
    args: [projectId],
  });
  return tx as unknown as string;
}

export async function submitRunSafetyCheck(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  projectId: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({
    address,
    functionName: "run_safety_check",
    args: [projectId],
  });
  return tx as unknown as string;
}

export async function submitRecovery(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  projectId: string,
  newReleaseUrl: string,
  newFrontendUrl: string | null,
  recoveryDescription: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({
    address,
    functionName: "submit_recovery",
    args: [projectId, newReleaseUrl, newFrontendUrl, recoveryDescription],
  });
  return tx as unknown as string;
}

export async function submitRunRecoveryCheck(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  projectId: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({
    address,
    functionName: "run_recovery_check",
    args: [projectId],
  });
  return tx as unknown as string;
}

export type { ProjectRecord, ProjectStatus, SafetyFinding };
