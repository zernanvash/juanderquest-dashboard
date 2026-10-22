import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, RefreshCw, ShieldAlert, Store } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

type Plan = { id: string; quest_id: string; round_number: number; mode: string; status: string; reward_points: number; fee_points: number; planned_completions: number; target_points: number; starts_at: string; ends_at: string; committed_points: number; live_holds: number; is_test: boolean };
type PlanDetail = Record<string, any>;
type Merchant = { id: string; name: string; status: string; is_published: boolean };
type Credit = { id: string; merchant_id: string; merchant_name: string; source: string; points: number | string; reversible_points?: number | string; reference: string; ledger_group_id: string; reverses_credit_id?: string | null; created_at: string };

export function FundingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<PlanDetail | null>(null);
  const [treasury, setTreasury] = useState<any>(null);
  const [credits, setCredits] = useState<Credit[]>([]);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [adjustment, setAdjustment] = useState('');
  const [reason, setReason] = useState('');
  const [reversesCreditId, setReversesCreditId] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [overview, funds, creditRows, merchantRows] = await Promise.all([
        apiFetch<{ items: Plan[] }>('/admin/quest-funding', { signal }),
        apiFetch<any>('/admin/treasury', { signal }),
        apiFetch<{ items: Credit[] }>('/admin/merchant-point-credits?limit=200', { signal }),
        apiFetch<Merchant[]>('/admin/merchants', { signal }),
      ]);
      setPlans(overview.items ?? []);
      setTreasury(funds);
      setCredits(creditRows.items ?? []);
      setMerchants(merchantRows ?? []);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(describeError(cause, 'Unable to load funded quest operations.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const inspect = async (plan: Plan) => {
    setBusy(plan.id);
    setError('');
    try { setSelected(await apiFetch<PlanDetail>(`/admin/funding-plans/${encodeURIComponent(plan.id)}`)); }
    catch (cause) { setError(describeError(cause, 'Funding plan detail unavailable.')); }
    finally { setBusy(''); }
  };

  const close = async (plan: Plan) => {
    if (!window.confirm('Close this round? Active reward reservations will still be honored.')) return;
    setBusy(plan.id);
    setError('');
    try {
      await apiFetch(`/admin/funding-plans/${encodeURIComponent(plan.id)}/close`, { method: 'POST', body: { idempotency_key: crypto.randomUUID() } });
      setNotice('Funding round closed. Existing traveler holds remain honored.');
      await load();
      setSelected(null);
    } catch (cause) { setError(describeError(cause, 'Could not close funding plan.')); }
    finally { setBusy(''); }
  };

  const submitAdjustment = async () => {
    const amount = Number(adjustment);
    if (!merchantId || !Number.isSafeInteger(amount) || amount === 0 || reason.trim().length < 10 || (amount < 0 && !reversesCreditId)) return;
    setBusy('merchant-adjustment');
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/merchants/${encodeURIComponent(merchantId)}/points`, {
        method: 'POST',
        body: {
          points: amount,
          reason: reason.trim(),
          ...(amount < 0 ? { reverses_credit_id: reversesCreditId } : {}),
          idempotency_key: crypto.randomUUID(),
        },
      });
      setAdjustment('');
      setReason('');
      setReversesCreditId('');
      setNotice(amount > 0 ? 'Audited simulated merchant points granted.' : 'Audited merchant credit correction recorded.');
      await load();
    } catch (cause) { setError(describeError(cause, 'Merchant point adjustment failed.')); }
    finally { setBusy(''); }
  };

  const selectedMerchantCredits = useMemo(() => {
    const rows = credits.filter(row => row.merchant_id === merchantId);
    return rows.filter(row => Number(row.points) > 0)
      .map(row => ({ ...row, reversible: Number(row.reversible_points ?? row.points) }))
      .filter(row => row.reversible > 0);
  }, [credits, merchantId]);
  const amount = Number(adjustment);
  const filtered = plans.filter(plan => !status || plan.status === status);

  return <div>
    <PageHeader title="Quest funding & merchant points" description="Monitor simulated point funding and make reasoned, auditable merchant adjustments. No real payment or blockchain transfer occurs." />
    {error && <div className="load-error" role="alert">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
    {notice && <div className="status-banner status-banner-success" role="status">{notice}</div>}

    <section className="stitch-panel panel-section" aria-label="Funding reconciliation">
      <div className="section-heading-row"><div><h2 className="section-title"><Coins size={18} /> Treasury and reconciliation</h2><p className="section-description">Checks plan conservation, point account balances against ledger, and balanced ledger groups.</p></div><button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} /> Refresh</button></div>
      {loading ? <p className="loading-panel">Loading funding operations…</p> : treasury ? <><div className="metric-grid">{(treasury.accounts ?? []).map((account: any) => <div className="metric-card" key={account.id}><span>{account.is_test ? 'Test ' : 'Platform '}{account.kind}</span><strong>{account.balance_points} points</strong></div>)}</div><div className={`status-banner ${treasury.reconciliation?.ok ? 'status-banner-success' : 'status-banner-danger'}`} role="status"><strong>{treasury.reconciliation?.ok ? 'Reconciliation clean' : 'Reconciliation mismatch detected'}</strong><span>Plans {treasury.reconciliation?.plans?.mismatches ?? 0} · Accounts {treasury.reconciliation?.point_accounts?.mismatches ?? 0} · Ledger groups {treasury.reconciliation?.ledger_groups?.mismatches ?? 0}</span></div>{treasury.reconciliation?.ok === false && <pre className="code-panel">{JSON.stringify(treasury.reconciliation, null, 2)}</pre>}</> : <p>Funding metrics unavailable.</p>}
    </section>

    <section className="stitch-panel panel-section"><div className="section-heading-row"><div><h2 className="section-title"><Store size={18} /> Funding rounds</h2><p className="section-description">Inspect funded and historical rounds. Test records are clearly marked.</p></div><label className="field-label">Status<select value={status} onChange={event => setStatus(event.target.value)}><option value="">All</option>{['draft', 'pending_sponsors', 'scheduled', 'active', 'closing', 'closed', 'expired', 'cancelled'].map(value => <option key={value}>{value}</option>)}</select></label></div>
      {loading ? <p>Loading plans…</p> : filtered.length === 0 ? <p className="empty-state">No funding plans found.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Quest / round</th><th>State</th><th>Model</th><th>Funding</th><th>Reservations</th><th>Window</th><th>Actions</th></tr></thead><tbody>{filtered.map(plan => <tr key={plan.id}><td><strong>{plan.quest_id}</strong><small>Round {plan.round_number}{plan.is_test ? ' · TEST' : ''}</small></td><td>{plan.status}</td><td>{plan.mode}</td><td>{plan.committed_points} / {plan.target_points} pts</td><td>{plan.live_holds} live</td><td>{new Date(plan.starts_at).toLocaleDateString()} — {new Date(plan.ends_at).toLocaleDateString()}</td><td><button className="button button-secondary" disabled={!!busy} onClick={() => void inspect(plan)}>Inspect</button>{['active', 'scheduled'].includes(plan.status) && <button className="button button-danger" disabled={!!busy} onClick={() => void close(plan)}>Close</button>}</td></tr>)}</tbody></table></div>}
      {selected && <div className="detail-drawer"><div className="section-heading-row"><h3>Plan {selected.id}</h3><button onClick={() => setSelected(null)} aria-label="Close detail">×</button></div><pre className="code-panel">{JSON.stringify(selected, null, 2)}</pre></div>}
    </section>

    <section className="stitch-panel panel-section" aria-label="Admin merchant point adjustments">
      <h2 className="section-title"><Store size={18} /> Audited merchant point adjustment</h2>
      <p className="section-description">Positive amounts grant simulated points. Negative amounts must reverse a specific prior credit and cannot create a negative balance. Every adjustment is written to the ledger.</p>
      <div className="settings-grid">
        <label className="settings-field">Merchant<select value={merchantId} onChange={event => { setMerchantId(event.target.value); setReversesCreditId(''); }}><option value="">Select merchant</option>{merchants.filter(merchant => merchant.status === 'active').map(merchant => <option value={merchant.id} key={merchant.id}>{merchant.name}{merchant.is_published ? '' : ' · unpublished'}</option>)}</select></label>
        <label className="settings-field">Signed points<input type="number" step="1" value={adjustment} onChange={event => setAdjustment(event.target.value)} placeholder="e.g. 250 or -100" /></label>
        {amount < 0 && <label className="settings-field">Original credit to reverse<select value={reversesCreditId} onChange={event => setReversesCreditId(event.target.value)}><option value="">Select an unreversed credit</option>{selectedMerchantCredits.map(credit => <option value={credit.id} key={credit.id}>{credit.source.replace(/_/g, ' ')} · {credit.reversible} pts remaining · {credit.reference}</option>)}</select></label>}
        <label className="settings-field">Reason (minimum 10 characters)<input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} placeholder="Describe the correction or grant" /></label>
      </div>
      <button type="button" className="button-approve" disabled={!!busy || !merchantId || !Number.isSafeInteger(amount) || amount === 0 || reason.trim().length < 10 || (amount < 0 && !reversesCreditId)} onClick={() => void submitAdjustment()}>{busy === 'merchant-adjustment' ? 'Recording…' : amount < 0 ? 'Record correction' : 'Grant simulated points'}</button>
    </section>

    <section className="stitch-panel panel-section"><h2 className="section-title"><Store size={18} /> Recent merchant point credits</h2>{credits.length === 0 ? <p className="empty-state" style={{ marginTop: 14 }}>No merchant point credits yet.</p> : <div className="table-scroll" style={{ marginTop: 14 }}><table className="data-table"><thead><tr><th>Merchant</th><th>Source</th><th>Amount</th><th>Ledger group</th><th>Time</th></tr></thead><tbody>{credits.map(row => <tr key={row.id}><td>{row.merchant_name}</td><td>{row.source}</td><td>{row.points} pts</td><td><code>{row.ledger_group_id}</code></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table></div>}</section>
    <p className="page-footnote"><ShieldAlert size={14} /> A close action stops new attempts; existing traveler holds remain payable. Corrections are tied to an original credit, fully audited, and cannot reduce merchant balance below zero.</p>
  </div>;
}
