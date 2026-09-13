import { STUDIONET_EXPLORER_URL } from "./network";

export function explorerTxUrl(txHash: string): string {
  return `${STUDIONET_EXPLORER_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${STUDIONET_EXPLORER_URL}/address/${address}`;
}
