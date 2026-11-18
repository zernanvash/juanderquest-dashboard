import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthError } from './api/client';

const poolId = 'lab-economy-pool';

type PoolSummary = {
  allocated_minor: string; available_minor: string; reserved_minor: string;
  paid_minor: string; returned_minor: string; reservation_counts: Record<string, number>;
};
type QueueItem = { status: string; count: number; oldest_age_seconds: string };
type Reconciliation = { pilotAccountDrift: unknown[]; unbalancedLegacyGroups: unknown[] };
type Appeal = { id: string; reservation_id: string; original_reviewer_id: string; amount_minor: string };
type Purchase = { transaction_id: string; cosmetic_id: string; amount_minor: string; refunded_at: string | null };

export function EconomyLabOverview({ token, onUnauthorized }: { token?: string | null; onUnauthorized?: () => void }) {
  const [summary, setSummary] = useState<PoolSummary | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reconciliation, setReconciliation] = useState<Reconciliation | null>(null);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [decisionReason, setDecisionReason] = useState('Independent fictional lab review decision.');
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const paths = [
        `/api/v1/admin/economy/pools/${poolId}/summary`,
        '/api/v1/admin/economy/queue',
        '/api/v1/admin/economy/reconciliation',
        '/api/v1/admin/economy/appeals',
        '/api/v1/admin/economy/cosmetic-purchases',
      ];
      const results = await Promise.all(paths.map(async path => {
        try {
          return await apiFetch(path, { token, cache: 'no-store' });
        } catch (cause) {
          if (isAuthError(cause)) { onUnauthorized?.(); throw new Error('Administrator authorization expired.'); }
          throw cause;
        }
      }));
      setSummary(results[0] as PoolSummary);
      setQueue(results[1] as QueueItem[]);
      setReconciliation(results[2] as Reconciliation);
      setAppeals(results[3] as Appeal[]);
      setPurchases(results[4] as Purchase[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Local economy observation unavailable.');
    } finally { setLoading(false); }
  }, [token, onUnauthorized]);

  useEffect(() => { void refresh(); }, [refresh]);

  const conserved = summary &&
    BigInt(summary.allocated_minor) === BigInt(summary.available_minor) + BigInt(summary.reserved_minor) +
    BigInt(summary.paid_minor) + BigInt(summary.returned_minor);

  async function decide(path: string, body: Record<string, string>, idempotencyKey?: string): Promise<boolean> {
    if (decisionReason.trim().length < 10) { setError('A decision reason of at least 10 characters is required.'); return false; }
    setActionBusy(true); setError(''); setNotice('');
    try {
      const result = await apiFetch<{ transactionId?: string; submission?: { id?: string }; id?: string }>(path, {
        method: 'POST',
        token,
        headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : undefined,
        body,
      });
      setNotice(`Committed local simulation receipt ${result?.transactionId || result?.submission?.id || result?.id || ''}.`);
      await refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Decision unavailable.'); return false; }
    finally { setActionBusy(false); }
  }

  return <section className="stitch-panel page-stack" style={{ padding: 24 }}>
    <div>
      <h2>Local simulated economy — operator observation</h2>
      <p>Fictional Explorer Coins only. Read-only telemetry; proof approval remains in the independent moderation queue.</p>
    </div>
    <div>
      <button type="button" className="button button-secondary" onClick={() => void refresh()} disabled={loading}>Refresh durable observation</button>
    </div>
    {loading && <p role="status">Reading isolated PostgreSQL state…</p>}
    {error && <p role="alert" className="load-error">{error}</p>}
    {notice && <p role="status" className="status-banner status-banner-success">{notice}</p>}
    {!loading && summary && <>
      <h3>Pool conservation: {conserved ? 'PASS' : 'FAIL'}</h3>
      <p>Allocated {summary.allocated_minor} = available {summary.available_minor} + reserved {summary.reserved_minor} + paid {summary.paid_minor} + returned {summary.returned_minor}.</p>
      <p>Reservation states: {Object.entries(summary.reservation_counts).map(([status, count]) => `${status} ${count}`).join(', ') || 'none'}.</p>
      <h3>Review queue age</h3>
      {queue.length ? <ul>{queue.map(item => <li key={item.status}>{item.status}: {item.count} items; oldest {item.oldest_age_seconds} seconds</li>)}</ul>
        : <p>No submitted or appealed reservations.</p>}
      <h3>Read-only reconciliation</h3>
      <p>Explorer Coin account drift: {reconciliation?.pilotAccountDrift.length ?? 'unavailable'}; unbalanced legacy groups: {reconciliation?.unbalancedLegacyGroups.length ?? 'unavailable'}.</p>
      <p>This observation does not authorize public utility, mJDQ conversion, or any chain transaction.</p>
      <section className="page-stack" style={{ borderTop:'1px solid #d5c4ac', marginTop:20, paddingTop:16 }}>
        <h3>Separate simulation decisions</h3>
        <p>These controls call existing guarded admin routes. A different reviewer must decide an appeal; this panel cannot bypass that rule.</p>
        <label htmlFor="lab-decision-reason" className="field-label">Decision reason
          <input id="lab-decision-reason" className="settings-input" value={decisionReason} onChange={event => setDecisionReason(event.target.value)}
            style={{ display:'block', width:'100%', maxWidth:550, minHeight:44, marginTop:6, padding:'8px 12px', border:'1px solid #d5c4ac', borderRadius:8, background:'#fff' }} />
        </label>
        <h4>Pending appeals</h4>
        {appeals.length ? <ul className="stamps-list">{appeals.map(item => <li key={item.id} className="stamps-list-item">
          <span>Appeal {item.id} · {item.amount_minor} simulated coins · original reviewer {item.original_reviewer_id}.</span>
          <div className="report-action-buttons">
            <button type="button" className="button button-approve" disabled={actionBusy} onClick={() => void decide(`/api/v1/admin/economy/appeals/${encodeURIComponent(item.id)}/approve`, { reason:decisionReason })}>Approve independent appeal</button>
            <button type="button" className="button button-reject" disabled={actionBusy} onClick={() => void decide(`/api/v1/admin/economy/appeals/${encodeURIComponent(item.id)}/reject`, { reason:decisionReason })}>Reject independent appeal</button>
          </div>
        </li>)}</ul> : <p>No pending appeals.</p>}
        <h4>Recent optional cosmetic purchases</h4>
        {purchases.length ? <ul className="stamps-list">{purchases.map(item => <li key={item.transaction_id} className="stamps-list-item">
          <span>{item.cosmetic_id} · {item.amount_minor} simulated coins · receipt {item.transaction_id}</span>
          {item.refunded_at ? <span>corrected/refunded</span> : <button type="button" className="button button-secondary" disabled={actionBusy} onClick={() => {
            const keyName = `jdq-economy-lab-refund:${item.transaction_id}`;
            let key = localStorage.getItem(keyName);
            if (!key) { key = crypto.randomUUID(); localStorage.setItem(keyName, key); }
            void decide('/api/v1/admin/economy/refunds',
              { original_transaction_id:item.transaction_id, reason:decisionReason }, key).then(success => {
                if (success) localStorage.removeItem(keyName);
              });
          }}>Issue simulated correction</button>}
        </li>)}</ul> : <p>No cosmetic purchases.</p>}
      </section>
    </>}
  </section>;
}
