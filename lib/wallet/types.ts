export type WalletStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "WRONG_NETWORK"
  | "SWITCHING_NETWORK"
  | "SIGNATURE_REJECTED"
  | "RPC_ERROR"
  | "PROVIDER_DISCONNECTED";

export interface WalletState {
  status: WalletStatus;
  address: `0x${string}` | null;
  chainId: number | null;
  error: string | null;
}

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
