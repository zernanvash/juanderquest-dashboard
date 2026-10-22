import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink, Link2, PauseCircle, PlayCircle, Plus, RefreshCw, ShieldAlert, Wallet } from 'lucide-react';
import { PageHeader } from '../components/PageState';
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

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** True when revoking this admin would leave the contract with no admin at all. */
export function isLastAdmin(contract: ChainContract, row: ChainRoleRow): boolean {
  if (row.role !== 'DEFAULT_ADMIN_ROLE' || row.onChain !== true) return false;
  return contract.roles.filter((r) => r.role === 'DEFAULT_ADMIN_ROLE' && r.onChain === true).length <= 1;
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
    <div>
      <PageHeader
        title="Wallets & contracts"
        description="Project wallets, balances and on-chain roles on the test network. Private keys are never stored or shown here; admin actions are signed by your own browser wallet."
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
          <p className="overview-timestamp" role="status" data-testid="chain-status">
            {overview.chain.name} (chain {overview.chain.id}) ·{' '}
            <span className={`status-pill ${overview.chain.rpcHealthy ? 'status-approved' : 'status-rejected'}`}>
              {overview.chain.rpcHealthy ? `RPC ok · block ${overview.chain.latestBlock?.toLocaleString()}` : 'RPC unreachable'}
            </span>{' '}
            · fetched {new Date(overview.fetchedAt).toLocaleTimeString()}
          </p>

          <section className="stitch-panel" aria-label="Wallets">
            <h2 className="section-title"><Wallet size={18} aria-hidden="true" /> Wallets</h2>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr><th>Wallet</th><th>Role</th><th>Custody</th><th>Address</th><th>Balance</th><th>Alert below</th><th /></tr>
                </thead>
                <tbody>
                  {overview.wallets.map((w) => (
                    <tr key={w.id} data-testid={`wallet-${w.role}-${w.address}`}>
                      <td><strong>{w.label}</strong>{w.ownerName ? <small>{w.ownerName}</small> : null}</td>
                      <td>{ROLE_LABEL[w.role]}</td>
                      <td><span className={`status-pill ${w.custody === 'server' ? 'status-pending' : 'status-approved'}`}>{w.custody === 'server' ? 'Server key' : 'Personal wallet'}</span></td>
                      <td className="chain-address">
                        <a href={w.explorerUrl} target="_blank" rel="noreferrer">{shortAddress(w.address)}</a>
                        <button type="button" className="icon-button" onClick={() => void copy(w.address)} aria-label={`Copy ${w.label} address`}>
                          <Copy size={12} aria-hidden="true" />
                        </button>
                        {copied === w.address ? <small>Copied</small> : null}
                      </td>
                      <td className={w.low ? 'bad-text' : undefined}>
                        {w.balancePol === null ? '—' : `${Number(w.balancePol).toFixed(4)} ${overview.chain.currency}`}
                        {w.low ? <span className="status-pill status-rejected chain-low">Low</span> : null}
                        {!w.needsGas ? <small>No gas needed</small> : null}
                      </td>
                      <td>{w.needsGas && w.lowBalancePol ? `${Number(w.lowBalancePol)} ${overview.chain.currency}` : '—'}</td>
                      <td className="chain-row-actions">
                        {w.needsGas ? <button type="button" className="button-muted" onClick={() => setTopUp(w)}>Top up</button> : null}
                        <button type="button" className="button-muted" onClick={() => setEditing(w)}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {overview.contracts.map((c) => {
            const driftCount = c.roles.filter((r) => r.drift).length;
            return (
              <section key={c.address} className="stitch-panel chain-contract" aria-label={CONTRACT_LABEL[c.name]}>
                <div className="section-heading-row">
                  <h2 className="section-title"><Link2 size={18} aria-hidden="true" /> {CONTRACT_LABEL[c.name]}</h2>
                  <div className="chain-row-actions">
                    {driftCount > 0 ? <span className="status-pill status-rejected" data-testid={`drift-${c.name}`}><ShieldAlert size={12} aria-hidden="true" /> {driftCount} drift</span> : <span className="status-pill status-approved">Roles as expected</span>}
                    {c.name === 'distributor' && c.paused !== null ? (
                      c.paused
                        ? <button type="button" className="button-approve" disabled={busy} onClick={() => ask(c, null, 'unpause')}><PlayCircle size={14} aria-hidden="true" /> Unpause</button>
                        : <button type="button" className="button-danger" disabled={busy} onClick={() => ask(c, null, 'pause')}><PauseCircle size={14} aria-hidden="true" /> Pause</button>
                    ) : null}
                  </div>
                </div>
                <p className="chain-contract-address">
                  <a href={c.explorerUrl} target="_blank" rel="noreferrer">{c.address}</a>
                  {c.name === 'distributor' && c.paused !== null ? ` · ${c.paused ? 'Paused' : 'Running'}` : ''}
                </p>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead><tr><th>Role</th><th>Account</th><th>Should have it</th><th>On-chain</th><th /></tr></thead>
                    <tbody>
                      {c.roles.map((r) => {
                        const last = isLastAdmin(c, r);
                        return (
                          <tr key={`${r.role}-${r.account}`} className={r.drift ? 'chain-drift-row' : undefined}>
                            <td>{r.role.replace(/_/g, ' ')}</td>
                            <td>{r.label} <small>{shortAddress(r.account)}</small></td>
                            <td>{r.expected ? 'Yes' : 'No'}</td>
                            <td>
                              {r.onChain === null ? <span className="status-pill status-pending">Unknown</span>
                                : r.onChain ? 'Yes' : 'No'}
                              {r.drift ? <span className="status-pill status-rejected chain-low">Drift</span> : null}
                            </td>
                            <td className="chain-row-actions">
                              {r.onChain === false && r.expected ? (
                                <button type="button" className="button-approve" disabled={busy} onClick={() => ask(c, r, 'grant')}>Grant</button>
                              ) : null}
                              {r.onChain === true ? (
                                <button type="button" className="button-reject" disabled={busy || last}
                                  title={last ? 'This is the last admin of the contract; it cannot be removed.' : undefined}
                                  onClick={() => ask(c, r, 'revoke')}>Revoke</button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <section className="stitch-panel" aria-label="Audit log">
            <h2 className="section-title">Audit log</h2>
            {audit.length === 0 ? <p className="empty-state">No changes recorded yet.</p> : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>When</th><th>Source</th><th>Action</th><th>By</th><th>Wallet</th><th>Contract</th><th>Tx</th></tr></thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id}>
                        <td>{new Date(a.createdAt).toLocaleString()}</td>
                        <td>{a.source === 'onchain' ? 'On-chain' : 'Registry'}</td>
                        <td>{a.action.replace(/_/g, ' ')}</td>
                        <td>{a.actorName ?? labelFor(a.actorAddress)}</td>
                        <td>{labelFor(a.walletAddress)}</td>
                        <td>{labelFor(a.contractAddress)}</td>
                        <td>{a.txExplorerUrl ? <a href={a.txExplorerUrl} target="_blank" rel="noreferrer">{shortAddress(a.txHash ?? '')}</a> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : loading ? <div className="stitch-panel loading-panel">Reading wallets and contracts…</div> : null}

      {pending ? (
        <div className="modal-backdrop">
          <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="chain-confirm-title">
            <h3 id="chain-confirm-title" className="section-title">Confirm in your wallet</h3>
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

function TopUpDialog({ wallet, currency, onClose }: { wallet: ChainWallet; currency: string; onClose: () => void }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(wallet.address, { margin: 1, width: 200 }).then(setQr).catch(() => setQr(''));
  }, [wallet.address]);
  return (
    <div className="modal-backdrop">
      <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="topup-title">
        <h3 id="topup-title" className="section-title">Top up {wallet.label}</h3>
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
        <h3 id="add-wallet-title" className="section-title">Add a wallet to the registry</h3>
        <p className="modal-description">Public address only. Never paste a private key or seed phrase here.</p>
        <label>Address<input name="address" value={form.address} onChange={set('address')} placeholder="0x…" autoComplete="off" required /></label>
        <label>Label<input name="label" value={form.label} onChange={set('label')} maxLength={80} required /></label>
        <label>Role<select name="role" value={form.role} onChange={set('role')}>{Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>Custody<select name="custody" value={form.custody} onChange={set('custody')}><option value="personal">Personal wallet</option><option value="server">Server key</option></select></label>
        <label>Owner<input name="owner_name" value={form.owner_name} onChange={set('owner_name')} maxLength={80} /></label>
        <label>Alert below (POL)<input name="low_balance_pol" type="number" min="0" step="0.1" value={form.low_balance_pol} onChange={set('low_balance_pol')} /></label>
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
        <h3 id="edit-wallet-title" className="section-title">Edit {wallet.label}</h3>
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
