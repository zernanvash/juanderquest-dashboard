import { useCallback, useEffect, useState } from 'react';

const poolId = 'lab-economy-pool';

type PoolSummary = {
  allocated_minor: string; available_minor: string; reserved_minor: string;
  paid_minor: string; returned_minor: string; reservation_counts: Record<string, number>;
};
type QueueItem = { status: string; count: number; oldest_age_seconds: string };
type Reconciliation = { pilotAccountDrift: unknown[]; unbalancedLegacyGroups: unknown[] };
type Appeal = { id: string; reservation_id: string; original_reviewer_id: string; amount_minor: string };
type Purchase = { transaction_id: string; cosmetic_id: string; amount_minor: string; refunded_at: string | null };

export function EconomyLabOverview({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
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
        const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (response.status === 401 || response.status === 403) { onUnauthorized(); throw new Error('Administrator authorization expired.'); }
        if (!response.ok) throw new Error(`Local economy observation unavailable (${response.status}).`);
        const payload = await response.json();
        if (!payload.success) throw new Error('Local economy observation unavailable.');
        return payload.data;
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
      const response = await fetch(path, { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {}) },
        body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error?.code || `Decision failed (${response.status}).`);
      setNotice(`Committed local simulation receipt ${payload.data?.transactionId || payload.data?.submission?.id || payload.data?.id || ''}.`);
      await refresh();
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Decision unavailable.'); return false; }
    finally { setActionBusy(false); }
  }

  return <section className="stitch-panel" style={{ padding: 24 }}>
    <h2>Local simulated economy — operator observation</h2>
    <p>Fictional Explorer Coins only. Read-only telemetry; proof approval remains in the independent moderation queue.</p>
    <button type="button" onClick={() => void refresh()} disabled={loading}>Refresh durable observation</button>
    {loading && <p role="status">Reading isolated PostgreSQL state…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
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
      <section style={{ borderTop:'1px solid #d5c4ac', marginTop:20, paddingTop:16 }}>
        <h3>Separate simulation decisions</h3>
        <p>These controls call existing guarded admin routes. A different reviewer must decide an appeal; this panel cannot bypass that rule.</p>
        <label htmlFor="lab-decision-reason">Decision reason</label>
        <input id="lab-decision-reason" value={decisionReason} onChange={event => setDecisionReason(event.target.value)}
          style={{ display:'block', width:'100%', maxWidth:550, minHeight:44, marginBottom:12 }} />
        <h4>Pending appeals</h4>
        {appeals.length ? <ul>{appeals.map(item => <li key={item.id} style={{ marginBottom:12 }}>
          Appeal {item.id} · {item.amount_minor} simulated coins · original reviewer {item.original_reviewer_id}.
          <div style={{ display:'flex', gap:8 }}>
            <button disabled={actionBusy} onClick={() => void decide(`/api/v1/admin/economy/appeals/${encodeURIComponent(item.id)}/approve`, { reason:decisionReason })}>Approve independent appeal</button>
            <button disabled={actionBusy} onClick={() => void decide(`/api/v1/admin/economy/appeals/${encodeURIComponent(item.id)}/reject`, { reason:decisionReason })}>Reject independent appeal</button>
          </div>
        </li>)}</ul> : <p>No pending appeals.</p>}
        <h4>Recent optional cosmetic purchases</h4>
        {purchases.length ? <ul>{purchases.map(item => <li key={item.transaction_id} style={{ marginBottom:12 }}>
          {item.cosmetic_id} · {item.amount_minor} simulated coins · receipt {item.transaction_id}
          {item.refunded_at ? ' · corrected/refunded' : <button disabled={actionBusy} onClick={() => {
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
