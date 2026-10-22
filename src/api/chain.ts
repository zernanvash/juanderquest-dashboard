import { apiFetch } from './client';

export type ChainWalletRole = 'admin' | 'signer' | 'badge_issuer' | 'recovery_admin' | 'treasury';
export type ChainRoleName = 'DEFAULT_ADMIN_ROLE' | 'MINTER_ROLE' | 'SIGNER_ROLE' | 'ISSUER_ROLE';

export interface ChainWallet {
  id: string;
  address: string;
  label: string;
  role: ChainWalletRole;
  custody: 'server' | 'personal';
  ownerName: string | null;
  balancePol: string | null;
  nonce: number | null;
  lowBalancePol: string | null;
  needsGas: boolean;
  low: boolean;
  active: boolean;
  notes: string | null;
  explorerUrl: string;
}

export interface ChainRoleRow {
  role: ChainRoleName;
  roleHash: string;
  account: string;
  label: string;
  expected: boolean;
  onChain: boolean | null;
  drift: boolean;
}

export interface ChainContract {
  name: 'token' | 'distributor' | 'badge';
  address: string;
  explorerUrl: string;
  paused: boolean | null;
  roles: ChainRoleRow[];
}

export interface ChainOverview {
  chain: { id: number; name: string; currency: string; explorer: string; rpcHealthy: boolean; latestBlock: number | null };
  wallets: ChainWallet[];
  contracts: ChainContract[];
  fetchedAt: string;
  cacheSeconds: number;
}

export interface ChainAuditRow {
  id: string;
  source: 'registry' | 'onchain';
  action: string;
  actorName: string | null;
  actorAddress: string | null;
  walletAddress: string | null;
  contractAddress: string | null;
  roleHash: string | null;
  txHash: string | null;
  blockNumber: number | null;
  createdAt: string;
  txExplorerUrl: string | null;
}

export interface NewChainWallet {
  chain_id: number;
  address: string;
  label: string;
  role: ChainWalletRole;
  custody: 'server' | 'personal';
  owner_name?: string;
  low_balance_pol?: number;
  needs_gas?: boolean;
  notes?: string;
}

export type ChainWalletPatch = Partial<{
  label: string;
  owner_name: string | null;
  low_balance_pol: number | null;
  needs_gas: boolean;
  active: boolean;
  notes: string | null;
}>;

export const getChainOverview = (refresh = false, signal?: AbortSignal) =>
  apiFetch<ChainOverview>(`/admin/chain/overview${refresh ? '?refresh=1' : ''}`, { signal });

export const getChainAudit = (signal?: AbortSignal) =>
  apiFetch<ChainAuditRow[]>('/admin/chain/audit?limit=50', { signal });

export const createChainWallet = (body: NewChainWallet) =>
  apiFetch<{ id: string; address: string }>('/admin/chain/wallets', { method: 'POST', body });

export const updateChainWallet = (id: string, body: ChainWalletPatch) =>
  apiFetch<{ id: string }>(`/admin/chain/wallets/${encodeURIComponent(id)}`, { method: 'PATCH', body });

// Plan 50 — soulbound badge minting queue.
export interface BadgeMintRow {
  id: string;
  status: 'queued' | 'submitted' | 'included' | 'finalized' | 'unknown' | 'failed' | 'reverted' | 'replaced';
  title: string;
  traveler: string;
  recipient: string;
  tokenId: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  txUrl: string | null;
  tokenUrl: string | null;
}

export interface BadgeMinting {
  minter: { enabled: boolean; ready: boolean; error: string | null };
  counts: { waitingForWallet: number; queued: number; minting: number; onChain: number; failed: number };
  recent: BadgeMintRow[];
}

export const getBadgeMinting = (signal?: AbortSignal) =>
  apiFetch<BadgeMinting>('/admin/chain/badges', { signal });

export const retryBadgeMint = (id: string) =>
  apiFetch<{ id: string; status: string }>(`/admin/chain/badges/${encodeURIComponent(id)}/retry`, { method: 'POST' });

export type BadgeLedgerState = 'pending_wallet' | 'queued' | 'minting' | 'on_chain' | 'failed' | 'revoked';

export interface BadgeLedgerEntry {
  awardId: string;
  title: string;
  track: string;
  awardedAt: string;
  traveler: { id: string; name: string; handle: string | null };
  wallet: string | null;
  state: BadgeLedgerState;
  commandId: string | null;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  tokenId: string | null;
  txUrl: string | null;
  tokenUrl: string | null;
}

export interface BadgeLedger {
  totals: Record<BadgeLedgerState, number>;
  total: number;
  entries: BadgeLedgerEntry[];
}

export const getBadgeLedger = (params: { state?: BadgeLedgerState | ''; q?: string } = {}, signal?: AbortSignal) => {
  const search = new URLSearchParams();
  if (params.state) search.set('state', params.state);
  if (params.q?.trim()) search.set('q', params.q.trim());
  const qs = search.toString();
  return apiFetch<BadgeLedger>(`/admin/chain/badges/ledger${qs ? `?${qs}` : ''}`, { signal });
};
