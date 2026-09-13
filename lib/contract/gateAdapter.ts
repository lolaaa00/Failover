import { createReadClient, createWriteClient } from "@/lib/genlayer/client";
import { FAILOVER_GATE_ADDRESS, isDeployed } from "./addresses";
import type { Eip1193Provider } from "@/lib/wallet/types";

function requireDeployed(): `0x${string}` {
  if (!isDeployed(FAILOVER_GATE_ADDRESS)) {
    throw new Error(
      "FailoverGate is not yet deployed (no funded Studionet signer in this environment). " +
        "Set NEXT_PUBLIC_FAILOVER_GATE_ADDRESS once deployed. See docs/DEPLOYMENT.md.",
    );
  }
  return FAILOVER_GATE_ADDRESS;
}

export async function readIsGateOpen(): Promise<boolean> {
  const address = requireDeployed();
  const client = createReadClient();
  return (await client.readContract({ address, functionName: "is_gate_open", args: [] })) as boolean;
}

export async function readGateCounts(): Promise<{
  high_risk_executed: number;
  low_risk_executed: number;
  refused: number;
}> {
  const address = requireDeployed();
  const client = createReadClient();
  const raw = (await client.readContract({ address, functionName: "get_counts", args: [] })) as string;
  return JSON.parse(raw);
}

export async function readGateReceipts(): Promise<unknown[]> {
  const address = requireDeployed();
  const client = createReadClient();
  return (await client.readContract({ address, functionName: "get_receipts", args: [] })) as unknown[];
}

export async function submitExecuteHighRisk(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  actionHash: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({ address, functionName: "execute_high_risk", value: 0n,
    args: [actionHash] });
  return tx as unknown as string;
}

export async function submitExecuteLowRisk(
  walletAddress: `0x${string}`,
  provider: Eip1193Provider,
  actionHash: string,
): Promise<string> {
  const address = requireDeployed();
  const client = createWriteClient(walletAddress, provider);
  const tx = await client.writeContract({ address, functionName: "execute_low_risk", value: 0n,
    args: [actionHash] });
  return tx as unknown as string;
}
