import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Gift, RefreshCw, Search } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

// Owner 2026-11-18: "build the give mjdq feature in dashboard (for beta testing, simulated points for now)
// but still reflects as transactions so its on the blockchain".

type Traveler = { id: string; display_name: string | null; handle: string | null; email: string; balance: number; is_test: boolean; role: string };
type Grant = {
  id: string;
  user: { id: string; display_name: string | null; handle: string | null };
  admin: { id: string; display_name: string | null };
  points: number;
  reason: string;
  balance_after: number;
  is_test: boolean;
  created_at: string;
  anchor: { fingerprint: string; status: string; tx_hash: string | null; explorer_url: string | null; last_error: string | null };
};

const ANCHOR_LABEL: Record<string, string> = {
  not_anchored: 'Not anchored (no issuer wallet)',
  queued: 'Queued for Amoy',
  submitted: 'Sent, waiting for a block',
  included: 'In a block, confirming',
  finalized: 'On-chain (final)',
  failed: 'Anchor failed',
};

const who = (u: { display_name: string | null; handle: string | null }) =>
  `${u.display_name ?? 'Traveler'}${u.handle ? ` (@${u.handle})` : ''}`;

export function GiveMjdqPage() {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Traveler[] | null>(null);
  const [target, setTarget] = useState<Traveler | null>(null);
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [grants, setGrants] = useState<Grant[]>([]);
  const [limits, setLimits] = useState({ max: 1000, daily: 5000 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const data = await apiFetch<{ items: Grant[]; max_points: number; daily_cap: number }>('/admin/point-grants?limit=50', { signal });
      setGrants(data.items ?? []);
      setLimits({ max: data.max_points ?? 1000, daily: data.daily_cap ?? 5000 });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(describeError(cause, 'Unable to load grants.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const lookup = async () => {
    setError('');
    setNotice('');
    setTarget(null);
    try {
      const data = await apiFetch<{ users: Traveler[] }>(`/admin/point-grants/lookup?q=${encodeURIComponent(query.trim())}`);
      setFound(data.users ?? []);
      if (data.users?.length === 1) setTarget(data.users[0]);
    } catch (cause) {
      setError(describeError(cause, 'Lookup failed.'));
    }
  };

  const amount = Number(points);
  const valid = target !== null && Number.isSafeInteger(amount) && amount >= 1 && amount <= limits.max && reason.trim().length >= 3;

  const give = async () => {
    if (!valid || !target) return;
    if (!window.confirm(`Give ${amount} mJDQ to ${who(target)}? This is recorded in the ledger and anchored on Polygon Amoy.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await apiFetch<{ grant: Grant }>('/admin/point-grants', {
        method: 'POST',
        body: { user_id: target.id, points: amount, reason: reason.trim(), idempotency_key: crypto.randomUUID() },
      });
      setNotice(`Gave ${amount} mJDQ to ${who(target)}. New balance: ${data.grant.balance_after} mJDQ. The Amoy anchor is queued.`);
      setTarget({ ...target, balance: data.grant.balance_after });
      setPoints('');
      setReason('');
      await load();
    } catch (cause) {
      setError(describeError(cause, 'The grant failed.'));
    } finally {
      setBusy(false);
    }
  };

  return <div>
    <PageHeader title="Give mJDQ" description={`Simulated beta points for travelers. Each grant is a balanced ledger transaction with an audit record, and is anchored on Polygon Amoy (testnet). Up to ${limits.max} per grant and ${limits.daily} per admin per day.`} />
    {error && <div className="load-error" role="alert">{error}</div>}
    {notice && <div className="status-banner status-banner-success" role="status">{notice}</div>}

    <section className="stitch-panel panel-section" aria-label="Give mJDQ form">
      <h2 className="section-title"><Gift size={18} /> Give</h2>
      <form className="form-row" onSubmit={(event) => { event.preventDefault(); void lookup(); }}>
        <label>Traveler email or @handle
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="name@example.com or @handle" />
        </label>
        <button type="submit" className="button button-secondary" disabled={query.trim().length < 3}><Search size={15} /> Find</button>
      </form>
      {found && found.length === 0 && <p>No traveler with that exact email or handle.</p>}
      {found && found.length > 1 && <label>Pick the traveler
        <select value={target?.id ?? ''} onChange={(event) => setTarget(found.find((u) => u.id === event.target.value) ?? null)}>
          <option value="">Choose…</option>
          {found.map((u) => <option key={u.id} value={u.id}>{who(u)} · {u.email}</option>)}
        </select>
      </label>}
      {target && <>
        <div className="metric-grid">
          <div className="metric-card"><span>Traveler</span><strong>{who(target)}</strong></div>
          <div className="metric-card"><span>Current balance</span><strong>{target.balance} mJDQ</strong></div>
          {target.is_test && <div className="metric-card"><span>Account</span><strong>Test account</strong></div>}
        </div>
        <label>Amount (mJDQ)
          <input type="number" min={1} max={limits.max} value={points} onChange={(event) => setPoints(event.target.value)} />
        </label>
        <label>Reason (shown in the audit log)
          <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Beta tester thank-you" />
        </label>
        <button type="button" className="button" disabled={!valid || busy} onClick={() => void give()}>Give {Number.isSafeInteger(amount) && amount > 0 ? amount : ''} mJDQ</button>
      </>}
    </section>

    <section className="stitch-panel panel-section" aria-label="Recent grants">
      <div className="section-heading-row">
        <h2 className="section-title">Recent grants</h2>
        <button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button>
      </div>
      {loading ? <p className="loading-panel">Loading grants…</p> : grants.length === 0 ? <p>No grants yet.</p> :
        <table className="data-table">
          <thead><tr><th>When</th><th>Traveler</th><th>mJDQ</th><th>Reason</th><th>By</th><th>On-chain</th></tr></thead>
          <tbody>{grants.map((g) => <tr key={g.id}>
            <td>{new Date(g.created_at).toLocaleString()}</td>
            <td>{who(g.user)}{g.is_test ? ' · test' : ''}</td>
            <td>+{g.points} (→ {g.balance_after})</td>
            <td>{g.reason}</td>
            <td>{g.admin.display_name ?? g.admin.id}</td>
            <td>
              {ANCHOR_LABEL[g.anchor.status] ?? g.anchor.status}
              {g.anchor.explorer_url && <> · <a href={g.anchor.explorer_url} target="_blank" rel="noreferrer">Polygonscan <ExternalLink size={12} /></a></>}
              {g.anchor.last_error && <div className="muted">{g.anchor.last_error}</div>}
            </td>
          </tr>)}</tbody>
        </table>}
    </section>
  </div>;
}
