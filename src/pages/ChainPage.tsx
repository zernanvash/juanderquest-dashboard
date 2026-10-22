import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, HelpCircle, History, MinusCircle, PauseCircle, PlayCircle, Plus, RefreshCw,
  Server, ShieldAlert, ShieldCheck, Wallet as WalletIcon,
} from 'lucide-react';
import { PageHeader } from '../components/PageState';
import { BadgeMintingPanel } from '../components/BadgeMintingPanel';
import { describeError } from '../utils/errors';
import {
  createChainWallet, getChainAudit, getChainOverview, updateChainWallet,
  type ChainAuditRow, type ChainContract, type ChainOverview, type ChainRoleRow, type ChainWallet, type ChainWalletRole,
} from '../api/chain';
import { describeAction, sendAdminAction, type ChainAction } from '../chain/browserWallet';

const ROLE_LABEL: Record<ChainWalletRole, string> = {
  admin: 'Admin',
  signer: 'Claim signer',
  badge_issuer: 'Badge issuer',
  recovery_admin: 'Recovery admin',
  treasury: 'Treasury',
};
const CONTRACT_LABEL = { token: 'Test token (tJDQ)', distributor: 'Reward distributor', badge: 'Badge (tJDB)' } as const;

const ROLE_NAME: Record<string, string> = {
  DEFAULT_ADMIN_ROLE: 'Admin',
  MINTER_ROLE: 'Minter',
  SIGNER_ROLE: 'Claim signer',
  ISSUER_ROLE: 'Badge issuer',
};
const AUDIT_PREVIEW = 8;

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const roleName = (role: string) => ROLE_NAME[role] ?? humanize(role.replace(/_ROLE$/, ''));

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function auditTone(action: string): string {
  if (/unpause|grant|created/i.test(action)) return 'is-good';
  if (/revoke|pause|deactivat/i.test(action)) return 'is-bad';
  return '';
}

/** True when revoking this admin would leave the contract with no admin at all. */
export function isLastAdmin(contract: ChainContract, row: ChainRoleRow): boolean {
  if (row.role !== 'DEFAULT_ADMIN_ROLE' || row.onChain !== true) return false;
  return contract.roles.filter((r) => r.role === 'DEFAULT_ADMIN_ROLE' && r.onChain === true).length <= 1;
}

interface WalletGroup {
  address: string;
  rows: ChainWallet[];
  primary: ChainWallet;
}

/** One card per address: the owner's wallet is both recovery admin and treasury. */
export function groupWallets(wallets: ChainWallet[]): WalletGroup[] {
  const groups = new Map<string, WalletGroup>();
  for (const w of wallets) {
    const g = groups.get(w.address);
    if (!g) groups.set(w.address, { address: w.address, rows: [w], primary: w });
    else {
      g.rows.push(w);
      if (w.needsGas && !g.primary.needsGas) g.primary = w;
    }
  }
  return [...groups.values()];
}

interface PendingAction {
  action: ChainAction;
  summary: string;
  warning?: string;
}

export function ChainPage() {
  const [overview, setOverview] = useState<ChainOverview | null>(null);
  const [audit, setAudit] = useState<ChainAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [topUp, setTopUp] = useState<ChainWallet | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ChainWallet | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [txState, setTxState] = useState<{ status: 'sending' | 'waiting' | 'done' | 'failed'; hash?: string; message?: string } | null>(null);
  const [copied, setCopied] = useState('');
  const [showAllAudit, setShowAllAudit] = useState(false);

  const load = useCallback(async (refresh = false, signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const [o, a] = await Promise.all([getChainOverview(refresh, signal), getChainAudit(signal)]);
      setOverview(o);
      setAudit(a);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Chain wallets could not be loaded.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  const labelFor = useMemo(() => {
    const map = new Map<string, string>();
    overview?.wallets.forEach((w) => map.set(w.address, w.label));
    overview?.contracts.forEach((c) => map.set(c.address, CONTRACT_LABEL[c.name]));
    return (address: string | null) => (address ? map.get(address.toLowerCase()) ?? shortAddress(address) : '—');
  }, [overview]);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };

  const ask = (contract: ChainContract, row: ChainRoleRow | null, kind: ChainAction['kind']) => {
    const contractLabel = CONTRACT_LABEL[contract.name];
    if (kind === 'pause' || kind === 'unpause') {
      setPending({ action: { kind, contract: contract.address }, summary: describeAction({ kind, contract: contract.address }, { contract: contractLabel }) });
      return;
    }
    if (!row) return;
    const action: ChainAction = { kind, contract: contract.address, roleHash: row.roleHash, account: row.account };
    const isServerAdmin = overview?.wallets.some((w) => w.address === row.account && w.role === 'admin');
    setPending({
      action,
      summary: describeAction(action, { contract: contractLabel, role: row.role, account: `${row.label} (${shortAddress(row.account)})` }),
      warning: kind === 'revoke' && isServerAdmin && row.role === 'DEFAULT_ADMIN_ROLE'
        ? 'This removes the server admin. Server-side admin operations on this contract will stop working.'
        : undefined,
    });
  };

  const confirm = async () => {
    if (!pending) return;
    const { action } = pending;
    setPending(null);
    setTxState({ status: 'sending' });
    try {
      const sent = await sendAdminAction(action);
      setTxState({ status: 'waiting', hash: sent.hash });
      const ok = await sent.wait();
      setTxState({ status: ok ? 'done' : 'failed', hash: sent.hash, message: ok ? undefined : 'The transaction reverted on-chain.' });
      if (ok) void load(true);
    } catch (cause) {
      setTxState({ status: 'failed', message: describeError(cause, 'The wallet action was not sent.') });
    }
  };

  const explorer = overview?.chain.explorer ?? 'https://amoy.polygonscan.com';
  const busy = txState?.status === 'sending' || txState?.status === 'waiting';

  return (
    <div className="chain-page">
      <PageHeader
        title="Wallets & contracts"
        description="Project wallets, balances and on-chain permissions on the test network. Private keys are never stored or shown here; admin actions are signed by your own browser wallet."
        actions={
          <>
            <button type="button" className="button-muted" onClick={() => setAdding(true)}>
              <Plus size={14} aria-hidden="true" /> Add wallet
            </button>
            <button type="button" className="button-muted" onClick={() => void load(true)} disabled={loading}>
              <RefreshCw size={14} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </>
        }
      />

      {error ? (
        <div className="load-error" role="alert">{error} <button type="button" onClick={() => void load(true)}>Retry</button></div>
      ) : null}

      {txState ? (
        <div className={`chain-tx-banner ${txState.status === 'failed' ? 'is-bad' : txState.status === 'done' ? 'is-good' : ''}`} role="status">
          {txState.status === 'sending' && 'Confirm the transaction in your wallet…'}
          {txState.status === 'waiting' && 'Transaction sent. Waiting for confirmation…'}
          {txState.status === 'done' && 'Confirmed on-chain.'}
          {txState.status === 'failed' && (txState.message ?? 'Failed.')}
          {txState.hash ? (
            <a href={`${explorer}/tx/${txState.hash}`} target="_blank" rel="noreferrer"> View transaction <ExternalLink size={12} aria-hidden="true" /></a>
          ) : null}
          {!busy ? <button type="button" onClick={() => setTxState(null)} aria-label="Dismiss">×</button> : null}
        </div>
      ) : null}

      {overview ? (
        <>
          <ChainSummary overview={overview} busy={busy} onPause={(c, kind) => ask(c, null, kind)} />

          <section className="chain-section" aria-label="Wallets">
            <div className="chain-section-head">
              <h2 className="chain-section-title"><WalletIcon size={18} aria-hidden="true" /> Wallets</h2>
              <p className="chain-section-sub">Server keys pay gas for automatic actions. Personal wallets are recovery admins and only sign from MetaMask.</p>
            </div>
            <div className="chain-wallet-grid">
              {groupWallets(overview.wallets).map((group) => (
                <WalletCard key={group.address} group={group} currency={overview.chain.currency} copied={copied === group.address}
                  onCopy={() => void copy(group.address)} onTopUp={setTopUp} onEdit={setEditing} />
              ))}
            </div>
          </section>

          <section className="chain-section" aria-label="Contract permissions">
            <div className="chain-section-head">
              <h2 className="chain-section-title"><ShieldCheck size={18} aria-hidden="true" /> Contract permissions</h2>
              <p className="chain-section-sub">What each wallet may do on each contract, read live from the chain and compared with the registry.</p>
            </div>
            <div className="chain-contract-grid">
              {overview.contracts.map((c) => <ContractCard key={c.address} contract={c} busy={busy} onAsk={ask} />)}
            </div>
          </section>

          <BadgeMintingPanel />

          <section className="chain-section" aria-label="Audit log">
            <div className="chain-section-head">
              <h2 className="chain-section-title"><History size={18} aria-hidden="true" /> Audit log</h2>
              <p className="chain-section-sub">Registry edits and confirmed on-chain role changes, newest first.</p>
            </div>
            {audit.length === 0 ? <p className="chain-empty">No changes recorded yet.</p> : (
              <div className="chain-panel">
                <div className="chain-table-wrap">
                  <table className="chain-table">
                    <thead><tr><th>When</th><th>Event</th><th>Wallet</th><th>Contract</th><th>By</th><th>Tx</th></tr></thead>
                    <tbody>
                      {(showAllAudit ? audit : audit.slice(0, AUDIT_PREVIEW)).map((a) => (
                        <tr key={a.id}>
                          <td className="chain-nowrap chain-muted">{formatWhen(a.createdAt)}</td>
                          <td className="chain-nowrap">
                            <span className={`chain-chip ${auditTone(a.action)}`}>{humanize(a.action)}</span>
                            {a.source === 'registry' ? <span className="chain-muted"> registry</span> : null}
                          </td>
                          <td>{labelFor(a.walletAddress)}</td>
                          <td>{labelFor(a.contractAddress)}</td>
                          <td className="chain-muted">{a.actorName ?? labelFor(a.actorAddress)}</td>
                          <td className="chain-nowrap">
                            {a.txExplorerUrl ? <a className="chain-mono" href={a.txExplorerUrl} target="_blank" rel="noreferrer">{shortAddress(a.txHash ?? '')}</a> : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {audit.length > AUDIT_PREVIEW ? (
                  <button type="button" className="chain-link-button" onClick={() => setShowAllAudit((v) => !v)}>
                    {showAllAudit ? 'Show fewer' : `Show all ${audit.length} entries`}
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </>
      ) : loading ? <div className="stitch-panel loading-panel">Reading wallets and contracts…</div> : null}

      {pending ? (
        <div className="modal-backdrop">
          <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="chain-confirm-title">
            <h3 id="chain-confirm-title" className="chain-modal-title">Confirm in your wallet</h3>
            <p className="modal-description">{pending.summary}</p>
            {pending.warning ? <p className="modal-description bad-text" role="alert">{pending.warning}</p> : null}
            <p className="modal-description">Your browser wallet (MetaMask) will ask you to sign on Polygon Amoy. It must be one of the recovery-admin wallets.</p>
            <div className="modal-actions">
              <button type="button" className="button-muted" onClick={() => setPending(null)}>Cancel</button>
              <button type="button" className="button-approve" onClick={() => void confirm()}>Open wallet</button>
            </div>
          </div>
        </div>
      ) : null}

      {topUp ? <TopUpDialog wallet={topUp} currency={overview?.chain.currency ?? 'POL'} onClose={() => setTopUp(null)} /> : null}
      {adding ? <WalletForm chainId={overview?.chain.id ?? 80002} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); void load(true); }} /> : null}
      {editing ? <WalletEdit wallet={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(true); }} /> : null}
    </div>
  );
}

function ChainSummary({ overview, busy, onPause }: {
  overview: ChainOverview;
  busy: boolean;
  onPause: (contract: ChainContract, kind: 'pause' | 'unpause') => void;
}) {
  const walletCount = groupWallets(overview.wallets).length;
  const low = overview.wallets.filter((w) => w.low).length;
  const roles = overview.contracts.flatMap((c) => c.roles);
  const drift = roles.filter((r) => r.drift).length;
  const unknown = roles.filter((r) => r.onChain === null).length;
  const distributor = overview.contracts.find((c) => c.name === 'distributor');
  const paused = distributor?.paused ?? null;
  return (
    <div className="chain-summary" data-testid="chain-status">
      <div className="chain-stat">
        <span className="chain-stat-label">Network</span>
        <strong className="chain-stat-value">{overview.chain.name}</strong>
        <span className={`chain-stat-note ${overview.chain.rpcHealthy ? 'is-good' : 'is-bad'}`} role="status">
          <span className="chain-dot" aria-hidden="true" />
          {overview.chain.rpcHealthy ? `RPC ok · block ${overview.chain.latestBlock?.toLocaleString()}` : 'RPC unreachable'}
        </span>
      </div>
      <div className="chain-stat">
        <span className="chain-stat-label">Wallets</span>
        <strong className="chain-stat-value">{walletCount}</strong>
        <span className={`chain-stat-note ${low ? 'is-bad' : 'is-good'}`}>
          <span className="chain-dot" aria-hidden="true" />
          {low ? `${low} low on gas` : 'All funded'}
        </span>
      </div>
      <div className="chain-stat">
        <span className="chain-stat-label">Permissions</span>
        <strong className="chain-stat-value">{drift ? `${drift} drift` : 'As expected'}</strong>
        <span className={`chain-stat-note ${drift ? 'is-bad' : unknown ? 'is-warn' : 'is-good'}`}>
          <span className="chain-dot" aria-hidden="true" />
          {unknown ? `${unknown} could not be read` : `${roles.length} checks on ${overview.contracts.length} contracts`}
        </span>
      </div>
      <div className="chain-stat">
        <span className="chain-stat-label">Reward claims</span>
        <strong className="chain-stat-value">{paused === null ? 'Unknown' : paused ? 'Paused' : 'Running'}</strong>
        {distributor && paused !== null ? (
          paused
            ? <button type="button" className="chain-small-button is-good" disabled={busy} onClick={() => onPause(distributor, 'unpause')}><PlayCircle size={14} aria-hidden="true" /> Unpause</button>
            : <button type="button" className="chain-small-button is-ghost-bad" disabled={busy} onClick={() => onPause(distributor, 'pause')}><PauseCircle size={14} aria-hidden="true" /> Pause</button>
        ) : <span className="chain-stat-note">Fetched {new Date(overview.fetchedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function WalletCard({ group, currency, copied, onCopy, onTopUp, onEdit }: {
  group: WalletGroup;
  currency: string;
  copied: boolean;
  onCopy: () => void;
  onTopUp: (w: ChainWallet) => void;
  onEdit: (w: ChainWallet) => void;
}) {
  const w = group.primary;
  const server = w.custody === 'server';
  const several = group.rows.length > 1;
  return (
    <article className={`chain-wallet ${w.low ? 'is-low' : ''}`} data-testid={`wallet-${group.address}`}>
      <header className="chain-wallet-head">
        <span className={`chain-avatar ${server ? 'is-server' : 'is-personal'}`} aria-hidden="true">
          {server ? <Server size={16} /> : <WalletIcon size={16} />}
        </span>
        <div className="chain-wallet-name">
          <strong>{w.label}</strong>
          <span>{w.ownerName ?? (server ? 'Held by the API server' : 'Personal wallet')}</span>
        </div>
      </header>
      <div className="chain-chips">
        {group.rows.map((r) => <span key={r.id} className="chain-chip">{ROLE_LABEL[r.role]}</span>)}
        <span className={`chain-chip ${server ? 'is-warn' : 'is-good'}`}>{server ? 'Server key' : 'Personal wallet'}</span>
      </div>
      <div className="chain-balance">
        <span className="chain-balance-value">{w.balancePol === null ? '—' : Number(w.balancePol).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
        <span className="chain-balance-unit">{currency}</span>
        {w.low ? <span className="chain-chip is-bad">Low</span> : null}
      </div>
      <p className="chain-wallet-note">
        {w.needsGas ? `Alert below ${Number(w.lowBalancePol ?? 0)} ${currency}` : 'No gas needed'}
      </p>
      <div className="chain-address-row">
        <a className="chain-mono" href={w.explorerUrl} target="_blank" rel="noreferrer" title={group.address}>
          {shortAddress(group.address)} <ExternalLink size={11} aria-hidden="true" />
        </a>
        <button type="button" className="chain-icon-button" onClick={onCopy} aria-label={`Copy ${w.label} address`}>
          <Copy size={13} aria-hidden="true" />
        </button>
        {copied ? <span className="chain-muted">Copied</span> : null}
      </div>
      <footer className="chain-wallet-actions">
        {w.needsGas ? <button type="button" className="chain-small-button is-primary" onClick={() => onTopUp(w)}>Top up</button> : null}
        {group.rows.map((r) => (
          <button key={r.id} type="button" className="chain-small-button" onClick={() => onEdit(r)}>
            {several ? `Edit ${ROLE_LABEL[r.role].toLowerCase()}` : 'Edit'}
          </button>
        ))}
      </footer>
    </article>
  );
}

function RoleState({ row }: { row: ChainRoleRow }) {
  if (row.onChain === null) return <span className="chain-state is-warn"><HelpCircle size={14} aria-hidden="true" /> Unknown</span>;
  if (row.drift) {
    return <span className="chain-state is-bad"><AlertTriangle size={14} aria-hidden="true" /> {row.expected ? 'Missing' : 'Unexpected'}</span>;
  }
  return row.onChain
    ? <span className="chain-state is-good"><CheckCircle2 size={14} aria-hidden="true" /> Held</span>
    : <span className="chain-state"><MinusCircle size={14} aria-hidden="true" /> Not held</span>;
}

function ContractCard({ contract: c, busy, onAsk }: {
  contract: ChainContract;
  busy: boolean;
  onAsk: (contract: ChainContract, row: ChainRoleRow | null, kind: ChainAction['kind']) => void;
}) {
  const driftCount = c.roles.filter((r) => r.drift).length;
  const byRole = new Map<string, ChainRoleRow[]>();
  c.roles.forEach((r) => byRole.set(r.role, [...(byRole.get(r.role) ?? []), r]));
  return (
    <article className="chain-contract-card" aria-label={CONTRACT_LABEL[c.name]}>
      <header className="chain-contract-head">
        <div>
          <h3>{CONTRACT_LABEL[c.name]}</h3>
          <a className="chain-mono" href={c.explorerUrl} target="_blank" rel="noreferrer" title={c.address}>
            {shortAddress(c.address)} <ExternalLink size={11} aria-hidden="true" />
          </a>
        </div>
        {driftCount > 0
          ? <span className="chain-chip is-bad" data-testid={`drift-${c.name}`}><ShieldAlert size={12} aria-hidden="true" /> {driftCount} drift</span>
          : <span className="chain-chip is-good"><ShieldCheck size={12} aria-hidden="true" /> Roles as expected</span>}
      </header>
      {[...byRole.entries()].map(([role, rows]) => (
        <div key={role} className="chain-role-group">
          <h4>{roleName(role)}</h4>
          <ul>
            {rows.map((r) => {
              const last = isLastAdmin(c, r);
              return (
                <li key={`${r.role}-${r.account}`} className={r.drift ? 'is-drift' : undefined}>
                  <div className="chain-role-account">
                    <span>{r.label}</span>
                    <small className="chain-mono">{shortAddress(r.account)}{r.expected ? '' : ' · should not hold'}</small>
                  </div>
                  <RoleState row={r} />
                  <div className="chain-role-action">
                    {r.onChain === false && r.expected ? (
                      <button type="button" className="chain-small-button is-good" disabled={busy} onClick={() => onAsk(c, r, 'grant')}>Grant</button>
                    ) : null}
                    {r.onChain === true ? (
                      <button type="button" className="chain-small-button is-ghost-bad" disabled={busy || last}
                        title={last ? 'This is the last admin of the contract; it cannot be removed.' : undefined}
                        onClick={() => onAsk(c, r, 'revoke')}>Revoke</button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </article>
  );
}

function TopUpDialog({ wallet, currency, onClose }: { wallet: ChainWallet; currency: string; onClose: () => void }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(wallet.address, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
  }, [wallet.address]);
  return (
    <div className="modal-backdrop">
      <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="topup-title">
        <h3 id="topup-title" className="chain-modal-title">Top up {wallet.label}</h3>
        <p className="modal-description">Send {currency} on <strong>Polygon Amoy</strong> from the treasury wallet to:</p>
        {qr ? <img className="chain-qr" src={qr} alt={`QR code for ${wallet.address}`} /> : null}
        <p className="chain-full-address" data-testid="topup-address">{wallet.address}</p>
        <div className="modal-actions"><button type="button" className="button-muted" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

function WalletForm({ chainId, onClose, onSaved }: { chainId: number; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ address: '', label: '', role: 'recovery_admin' as ChainWalletRole, custody: 'personal' as 'server' | 'personal', owner_name: '', low_balance_pol: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^0x[0-9a-fA-F]{40}$/.test(form.address.trim())) { setError('Enter a 0x… wallet address (42 characters).'); return; }
    setSaving(true);
    setError('');
    try {
      await createChainWallet({
        chain_id: chainId, address: form.address.trim(), label: form.label.trim(), role: form.role, custody: form.custody,
        ...(form.owner_name.trim() ? { owner_name: form.owner_name.trim() } : {}),
        ...(form.low_balance_pol.trim() ? { low_balance_pol: Number(form.low_balance_pol) } : {}),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
      onSaved();
    } catch (cause) {
      setError(describeError(cause, 'The wallet was not saved.'));
      setSaving(false);
    }
  };
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="modal-backdrop">
      <form className="stitch-panel modal-panel chain-form" role="dialog" aria-modal="true" aria-labelledby="add-wallet-title" onSubmit={(e) => void submit(e)}>
        <h3 id="add-wallet-title" className="chain-modal-title">Add a wallet to the registry</h3>
        <p className="modal-description">Public address only. Never paste a private key or seed phrase here.</p>
        <label>Address<input name="address" value={form.address} onChange={set('address')} placeholder="0x…" autoComplete="off" required /></label>
        <label>Label<input name="label" value={form.label} onChange={set('label')} maxLength={80} required /></label>
        <div className="chain-form-row">
          <label>Role<select name="role" value={form.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label>Custody<select name="custody" value={form.custody} onChange={set('custody')}><option value="personal">Personal wallet</option><option value="server">Server key</option></select></label>
        </div>
        <div className="chain-form-row">
          <label>Owner<input name="owner_name" value={form.owner_name} onChange={set('owner_name')} maxLength={80} /></label>
          <label>Alert below (POL)<input name="low_balance_pol" type="number" min="0" step="0.1" value={form.low_balance_pol} onChange={set('low_balance_pol')} /></label>
        </div>
        <label>Notes<input name="notes" value={form.notes} onChange={set('notes')} maxLength={500} /></label>
        {error ? <p className="bad-text" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button-muted" onClick={onClose}>Cancel</button>
          <button type="submit" className="button-approve" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}

function WalletEdit({ wallet, onClose, onSaved }: { wallet: ChainWallet; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(wallet.label);
  const [threshold, setThreshold] = useState(wallet.lowBalancePol ? String(Number(wallet.lowBalancePol)) : '');
  const [active, setActive] = useState(wallet.active);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await updateChainWallet(wallet.id, { label: label.trim(), low_balance_pol: threshold.trim() ? Number(threshold) : null, active });
      onSaved();
    } catch (cause) {
      setError(describeError(cause, 'The change was not saved.'));
    }
  };
  return (
    <div className="modal-backdrop">
      <form className="stitch-panel modal-panel chain-form" role="dialog" aria-modal="true" aria-labelledby="edit-wallet-title" onSubmit={(e) => void submit(e)}>
        <h3 id="edit-wallet-title" className="chain-modal-title">Edit {wallet.label}</h3>
        <p className="modal-description">Address, role and custody can't change. To replace a wallet, deactivate it and add the new one.</p>
        <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required /></label>
        <label>Alert below (POL)<input type="number" min="0" step="0.1" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <label className="chain-checkbox"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        {error ? <p className="bad-text" role="alert">{error}</p> : null}
        <div className="modal-actions">
          <button type="button" className="button-muted" onClick={onClose}>Cancel</button>
          <button type="submit" className="button-approve">Save</button>
        </div>
      </form>
    </div>
  );
}
