import { BrowserProvider, Contract, getAddress, parseUnits, type Eip1193Provider } from 'ethers';

/**
 * Admin actions on the JuanDerQuest test contracts are signed by the signed-in
 * admin's OWN browser wallet (MetaMask) — the server never signs them.
 */
export const AMOY = {
  chainId: 80002,
  chainIdHex: '0x13882',
  params: {
    chainId: '0x13882',
    chainName: 'Polygon Amoy',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com', 'https://polygon-amoy.drpc.org'],
    blockExplorerUrls: ['https://amoy.polygonscan.com'],
  },
} as const;

/** Amoy validators reject tips below 25 gwei. */
const MIN_PRIORITY_FEE = parseUnits('30', 'gwei');

const ABI = [
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  'function pause()',
  'function unpause()',
];

export const DEFAULT_ADMIN_ROLE = '0x' + '0'.repeat(64);

export type ChainAction =
  | { kind: 'grant' | 'revoke'; contract: string; roleHash: string; account: string }
  | { kind: 'pause' | 'unpause'; contract: string };

export class WalletActionError extends Error {}

type Injected = Eip1193Provider & { request(args: { method: string; params?: unknown[] }): Promise<unknown> };

let injectedOverride: Injected | null | undefined;
/** Tests pass a fake EIP-1193 provider; undefined restores window.ethereum. */
export function setInjectedWalletForTests(provider: Injected | null | undefined) {
  injectedOverride = provider;
}

function injected(): Injected {
  const provider = injectedOverride !== undefined
    ? injectedOverride
    : (globalThis as unknown as { ethereum?: Injected }).ethereum ?? null;
  if (!provider) throw new WalletActionError('No browser wallet found. Install MetaMask to sign admin actions.');
  return provider;
}

/** Connect, switch (or add) Polygon Amoy, and return the connected address. */
export async function connectOnAmoy(): Promise<{ provider: BrowserProvider; address: string }> {
  const raw = injected();
  const accounts = await raw.request({ method: 'eth_requestAccounts' }) as string[];
  if (!accounts?.length) throw new WalletActionError('The wallet did not share an account.');
  const chainId = String(await raw.request({ method: 'eth_chainId' })).toLowerCase();
  if (chainId !== AMOY.chainIdHex) {
    try {
      await raw.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: AMOY.chainIdHex }] });
    } catch (err) {
      if ((err as { code?: number })?.code !== 4902) throw new WalletActionError('Switch the wallet to Polygon Amoy to continue.');
      await raw.request({ method: 'wallet_addEthereumChain', params: [AMOY.params] });
    }
  }
  return { provider: new BrowserProvider(raw, AMOY.chainId), address: getAddress(accounts[0]) };
}

export function describeAction(action: ChainAction, labels: { contract: string; role?: string; account?: string }): string {
  switch (action.kind) {
    case 'grant': return `Give ${labels.role} on the ${labels.contract} contract to ${labels.account}.`;
    case 'revoke': return `Remove ${labels.role} on the ${labels.contract} contract from ${labels.account}.`;
    case 'pause': return 'Pause the reward distributor: no token claims will go through until it is unpaused.';
    case 'unpause': return 'Unpause the reward distributor: token claims resume.';
  }
}

/** Sends the action from the connected wallet after checking it is an admin of that contract. */
export async function sendAdminAction(action: ChainAction): Promise<{ hash: string; wait: () => Promise<boolean> }> {
  const { provider, address } = await connectOnAmoy();
  const signer = await provider.getSigner(address);
  const contract = new Contract(action.contract, ABI, signer);
  const isAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, address) as boolean;
  if (!isAdmin) {
    throw new WalletActionError(`${address} is not an admin of this contract. Connect your recovery-admin wallet.`);
  }
  const overrides = { maxPriorityFeePerGas: MIN_PRIORITY_FEE };
  const tx = action.kind === 'grant'
    ? await contract.grantRole(action.roleHash, action.account, overrides)
    : action.kind === 'revoke'
      ? await contract.revokeRole(action.roleHash, action.account, overrides)
      : action.kind === 'pause'
        ? await contract.pause(overrides)
        : await contract.unpause(overrides);
  return {
    hash: tx.hash as string,
    wait: async () => {
      const receipt = await tx.wait();
      return receipt?.status === 1;
    },
  };
}
