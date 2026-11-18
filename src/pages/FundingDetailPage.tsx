import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Flag, Lock, PauseCircle, PlayCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { Link } from '../router';
import { downloadCsv } from '../utils/csv';
import { describeError } from '../utils/errors';

interface TreasuryData {
  plan_id: string;
  target_points: number;
  committed_points: number;
  available_points: number;
  held_points: number;
  paid_reward_points: number;
  paid_fee_points: number;
  refunded_points: number;
  live_holds_count: number;
  live_holds_points: number;
  reconciliation: {
    ok: boolean;
    mismatches: number;
    contributions: Array<{
      id: string;
      funder_kind: string;
      funder_name: string;
      committed_points: number;
      remaining_points: number;
      held_points: number;
      paid_reward_points: number;
      paid_fee_points: number;
      refunded_points: number;
      accounted_points: number;
      ok: boolean;
    }>;
  };
}

interface PlanTx {
  transaction_group_id: string;
  type: string;
  points: number;
  amount_mjdq: number;
  from_account: string;
  to_account: string;
  reference_type: string;
  reference_id: string;
  actor_id: string;
  created_at: string;
}

const TX_TYPES = [
  '',
  'quest_fund_lock',
  'quest_fund_hold',
  'quest_reward_paid',
  'quest_fee',
  'quest_fund_release',
  'quest_fund_refund',
];

export function FundingDetailPage({ planId }: { planId: string }) {
  const [plan, setPlan] = useState<any>(null);
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [txs, setTxs] = useState<PlanTx[]>([]);
  const [txType, setTxType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [extendEndsAt, setExtendEndsAt] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [flagNote, setFlagNote] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const txUrl = `/admin/funding-plans/${encodeURIComponent(planId)}/transactions${txType ? `?type=${encodeURIComponent(txType)}` : ''}`;
      const [planRes, treasuryRes, txRes] = await Promise.all([
        apiFetch<any>(`/admin/funding-plans/${encodeURIComponent(planId)}`, { signal }),
        apiFetch<TreasuryData>(`/admin/funding-plans/${encodeURIComponent(planId)}/treasury`, { signal }),
        apiFetch<{ items: PlanTx[] }>(txUrl, { signal }),
      ]);
      setPlan(planRes);
      setTreasury(treasuryRes);
      setTxs(txRes.items ?? []);
      if (planRes?.ends_at && !extendEndsAt) {
        const dt = new Date(new Date(planRes.ends_at).getTime() + 7 * 86_400_000);
        setExtendEndsAt(dt.toISOString().slice(0, 16));
      }
      if (planRes?.admin_flag_note && !flagNote) {
        setFlagNote(String(planRes.admin_flag_note));
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(describeError(cause, 'Unable to load funding plan detail.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [planId, txType]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const runAction = async (key: string, path: string, body: Record<string, unknown>, msg: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await apiFetch(path, {
        method: 'POST',
        body: { ...body, idempotency_key: crypto.randomUUID() },
      });
      setNotice(msg);
      setActionReason('');
      await load();
    } catch (cause) {
      setError(describeError(cause, 'Action failed.'));
    } finally {
      setBusy('');
    }
  };

  const segments = useMemo(() => {
    if (!treasury || treasury.committed_points <= 0) return [];
    const total = treasury.committed_points;
    const raw = [
      { key: 'available', label: 'Available', points: treasury.available_points, color: '#2d6a4f' },
      { key: 'held', label: 'Held', points: treasury.held_points, color: '#ffb703' },
      { key: 'paid', label: 'Paid rewards', points: treasury.paid_reward_points, color: '#3f6653' },
      { key: 'fees', label: 'Paid fees', points: treasury.paid_fee_points, color: '#582f0e' },
      { key: 'refunded', label: 'Refunded', points: treasury.refunded_points, color: '#837560' },
    ];
    return raw.map((s) => ({ ...s, pct: Math.max(0, Math.round((s.points / total) * 1000) / 10) }));
  }, [treasury]);

  const exportTransactionsCsv = () => {
    downloadCsv(
      `funding-plan-${planId}-transactions.csv`,
      ['Time', 'Type', 'Points', 'mJDQ', 'From account', 'To account', 'Ledger group', 'Reference'],
      txs.map((t) => [
        t.created_at,
        t.type,
        t.points,
        t.amount_mjdq,
        t.from_account,
        t.to_account,
        t.transaction_group_id,
        `${t.reference_type}:${t.reference_id}`,
      ]),
    );
  };

  const isHoldStuck = (hold: any) =>
    hold.status === 'held' && new Date(hold.expires_at).getTime() <= Date.now();

  return (
    <div>
      <div className="section-heading-row" style={{ marginBottom: 12 }}>
        <Link to="/economy/funding" className="button button-secondary">
          <ArrowLeft size={15} /> Back to funding list
        </Link>
        <button type="button" className="button button-secondary" onClick={() => void load()} disabled={loading || !!busy}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      <PageHeader
        title={plan ? `${plan.quest_title || plan.quest_id} · Round ${plan.round_number}` : `Funding plan ${planId}`}
        description="Complete plan treasury, contribution conservation, ledger movements, traveler holds, and sponsor deal conditions."
      />

      {error && (
        <div className="load-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && <div className="status-banner status-banner-success" role="status">{notice}</div>}

      {loading && !plan ? (
        <p className="loading-panel">Loading plan details…</p>
      ) : plan ? (
        <>
          <section className="stitch-panel panel-section" aria-label="Plan summary">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title">Plan metadata</h2>
                <p className="section-description">
                  Quest: <Link to={`/quests?q=${encodeURIComponent(plan.quest_id)}`}>{plan.quest_title || plan.quest_id}</Link>
                  {' · '}Creator: {plan.creator_display_name || plan.created_by}
                </p>
              </div>
              <div className="row-badges">
                <span className="pill">{plan.status}</span>
                <span className="pill">{plan.mode}</span>
                {plan.is_test && <span className="pill pill-warn">TEST</span>}
                {plan.holds_paused && <span className="pill pill-danger">Holds paused</span>}
                {plan.admin_flagged && <span className="pill pill-danger">Flagged for review</span>}
              </div>
            </div>
            <div className="metric-grid">
              <div className="metric-card"><span>Window</span><strong>{new Date(plan.starts_at).toLocaleDateString()} — {new Date(plan.ends_at).toLocaleDateString()}</strong></div>
              <div className="metric-card"><span>Reward / fee</span><strong>{plan.reward_points} / {plan.fee_points} pts</strong></div>
              <div className="metric-card"><span>Planned completions</span><strong>{plan.planned_completions}</strong></div>
              <div className="metric-card"><span>Target pool</span><strong>{plan.target_points} pts</strong></div>
            </div>
            {plan.admin_flagged && plan.admin_flag_note && (
              <div className="status-banner status-banner-danger" role="status">
                <strong>Review flag:</strong> <span>{plan.admin_flag_note}</span>
              </div>
            )}
            {plan.holds_paused && plan.holds_paused_reason && (
              <div className="status-banner" role="status">
                <strong>Holds paused:</strong> <span>{plan.holds_paused_reason}</span>
              </div>
            )}
          </section>

          {treasury && (
            <section className="stitch-panel panel-section" aria-label="Quest treasury">
              <h2 className="section-title">Quest treasury</h2>
              <div className="metric-grid">
                <div className="metric-card"><span>Target</span><strong>{treasury.target_points} pts</strong></div>
                <div className="metric-card"><span>Committed</span><strong>{treasury.committed_points} pts</strong></div>
                <div className="metric-card"><span>Available</span><strong>{treasury.available_points} pts</strong></div>
                <div className="metric-card"><span>Held ({treasury.live_holds_count} live)</span><strong>{treasury.held_points} pts</strong></div>
                <div className="metric-card"><span>Paid rewards</span><strong>{treasury.paid_reward_points} pts</strong></div>
                <div className="metric-card"><span>Paid fees</span><strong>{treasury.paid_fee_points} pts</strong></div>
                <div className="metric-card"><span>Refunded</span><strong>{treasury.refunded_points} pts</strong></div>
              </div>

              {segments.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="stacked-bar" role="img" aria-label="Treasury allocation bar">
                    {segments.map((seg) =>
                      seg.points > 0 ? (
                        <div
                          key={seg.key}
                          className="stacked-bar-segment"
                          style={{ width: `${seg.pct}%`, background: seg.color }}
                          title={`${seg.label}: ${seg.points} pts (${seg.pct}%)`}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="stacked-legend">
                    {segments.map((seg) => (
                      <span key={seg.key} className="stacked-legend-item">
                        <i style={{ background: seg.color }} /> {seg.label}: {seg.points} pts
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className={`status-banner ${treasury.reconciliation.ok ? 'status-banner-success' : 'status-banner-danger'}`} role="status">
                <strong>{treasury.reconciliation.ok ? 'Plan reconciliation clean' : 'Plan reconciliation mismatch'}</strong>
                <span>{treasury.reconciliation.mismatches} contribution mismatch(es) · committed = remaining + held + paid + fees + refunded</span>
              </div>
            </section>
          )}

          <section className="stitch-panel panel-section" aria-label="Admin controls">
            <h2 className="section-title"><ShieldAlert size={18} /> Plan controls</h2>
            <p className="section-description">Every action requires an idempotency key and writes to the admin and governance audit logs.</p>
            <div className="settings-grid">
              <label className="settings-field">
                Reason / note (min 5 chars for pause/flag)
                <input value={actionReason} maxLength={500} onChange={(e) => setActionReason(e.target.value)} placeholder="Describe reason for action" />
              </label>
              {['active', 'scheduled'].includes(plan.status) && (
                <label className="settings-field">
                  New end date/time
                  <input type="datetime-local" value={extendEndsAt} onChange={(e) => setExtendEndsAt(e.target.value)} />
                </label>
              )}
              <label className="settings-field">
                Review flag note (min 5 chars)
                <input value={flagNote} maxLength={500} onChange={(e) => setFlagNote(e.target.value)} placeholder="Audit note for flagging/unflagging" />
              </label>
            </div>
            <div className="action-cluster">
              {['active', 'closing'].includes(plan.status) && (
                <button
                  type="button"
                  className="button button-danger"
                  disabled={!!busy}
                  onClick={() => {
                    if (window.confirm('Close this funding round? Active holds remain honored.')) {
                      void runAction('close', `/admin/funding-plans/${encodeURIComponent(plan.id)}/close`, {}, 'Funding round closed.');
                    }
                  }}
                >
                  <Lock size={14} /> Close round
                </button>
              )}
              {['active', 'scheduled'].includes(plan.status) && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!!busy || !extendEndsAt}
                  onClick={() =>
                    void runAction(
                      'extend',
                      `/admin/funding-plans/${encodeURIComponent(plan.id)}/extend`,
                      { ends_at: new Date(extendEndsAt).toISOString(), ...(actionReason.trim() ? { reason: actionReason.trim() } : {}) },
                      'Funding round end date extended.',
                    )
                  }
                >
                  Extend end date
                </button>
              )}
              {['draft', 'pending_sponsors', 'scheduled'].includes(plan.status) && (
                <button
                  type="button"
                  className="button button-danger"
                  disabled={!!busy}
                  onClick={() => {
                    if (window.confirm('Cancel this round and refund locked demo points to funders?')) {
                      void runAction(
                        'cancel',
                        `/admin/funding-plans/${encodeURIComponent(plan.id)}/cancel`,
                        actionReason.trim() ? { reason: actionReason.trim() } : {},
                        'Funding round cancelled and unused points refunded.',
                      );
                    }
                  }}
                >
                  Cancel round & refund
                </button>
              )}
              {['active', 'closing', 'scheduled', 'pending_sponsors'].includes(plan.status) && !plan.holds_paused && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={!!busy || actionReason.trim().length < 5}
                  onClick={() =>
                    void runAction(
                      'pause-holds',
                      `/admin/funding-plans/${encodeURIComponent(plan.id)}/pause-holds`,
                      { reason: actionReason.trim() },
                      'New reward holds paused for this plan.',
                    )
                  }
                >
                  <PauseCircle size={14} /> Pause new holds
                </button>
              )}
              {plan.holds_paused && (
                <button
                  type="button"
                  className="button button-approve"
                  disabled={!!busy}
                  onClick={() =>
                    void runAction(
                      'resume-holds',
                      `/admin/funding-plans/${encodeURIComponent(plan.id)}/resume-holds`,
                      actionReason.trim() ? { reason: actionReason.trim() } : {},
                      'New reward holds resumed.',
                    )
                  }
                >
                  <PlayCircle size={14} /> Resume holds
                </button>
              )}
              <button
                type="button"
                className="button button-secondary"
                disabled={!!busy || flagNote.trim().length < 5}
                onClick={() =>
                  void runAction(
                    'flag',
                    `/admin/funding-plans/${encodeURIComponent(plan.id)}/flag`,
                    { flagged: !plan.admin_flagged, note: flagNote.trim() },
                    plan.admin_flagged ? 'Review flag cleared.' : 'Plan flagged for review.',
                  )
                }
              >
                <Flag size={14} /> {plan.admin_flagged ? 'Clear review flag' : 'Flag for review'}
              </button>
            </div>
          </section>

          <section className="stitch-panel panel-section" aria-label="Contributions">
            <h2 className="section-title">Contributions ({plan.contributions?.length ?? 0})</h2>
            {(plan.contributions ?? []).length === 0 ? (
              <p className="empty-state">No contributions recorded yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Funder</th>
                      <th>Role</th>
                      <th>Committed</th>
                      <th>Remaining</th>
                      <th>Held</th>
                      <th>Paid (reward / fee)</th>
                      <th>Refunded</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.contributions.map((c: any) => (
                      <tr key={c.id}>
                        <td>{c.funder_name}</td>
                        <td>{c.funder_kind}</td>
                        <td>{c.committed_points} pts</td>
                        <td>{c.remaining_points} pts</td>
                        <td>{c.held_points} pts</td>
                        <td>{c.paid_reward_points} / {c.paid_fee_points} pts</td>
                        <td>{c.refunded_points} pts</td>
                        <td>{new Date(c.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Ledger transactions">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title">Transactions ledger ({txs.length})</h2>
                <p className="section-description">Every point movement for this plan from the double-entry ledger.</p>
              </div>
              <div className="action-cluster">
                <select aria-label="Filter transaction type" value={txType} onChange={(e) => setTxType(e.target.value)}>
                  {TX_TYPES.map((t) => (
                    <option key={t || 'all'} value={t}>
                      {t ? t : 'All movement types'}
                    </option>
                  ))}
                </select>
                <button type="button" className="button button-secondary" onClick={exportTransactionsCsv} disabled={txs.length === 0}>
                  <Download size={14} /> Export CSV
                </button>
              </div>
            </div>
            {txs.length === 0 ? (
              <p className="empty-state">No ledger movements match this filter.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>From → To</th>
                      <th>Ledger group</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((tx) => (
                      <tr key={tx.transaction_group_id}>
                        <td>{new Date(tx.created_at).toLocaleString()}</td>
                        <td><code>{tx.type}</code></td>
                        <td>{tx.points} pts</td>
                        <td><code>{tx.from_account}</code> → <code>{tx.to_account}</code></td>
                        <td><code>{tx.transaction_group_id}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Reward holds">
            <h2 className="section-title">Traveler holds ({plan.holds?.length ?? 0})</h2>
            {(plan.holds ?? []).length === 0 ? (
              <p className="empty-state">No holds created for this round.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Traveler</th>
                      <th>Submission</th>
                      <th>Status</th>
                      <th>Held at</th>
                      <th>Expires</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.holds.map((h: any) => (
                      <tr key={h.id}>
                        <td>{h.traveler_label || h.user_id}</td>
                        <td>{h.submission_id ? <Link to={`/submissions?q=${encodeURIComponent(h.submission_id)}`}>{h.submission_id}</Link> : '—'}</td>
                        <td>{h.status}{h.release_reason ? <small>{h.release_reason}</small> : null}</td>
                        <td>{new Date(h.created_at).toLocaleString()}</td>
                        <td>{new Date(h.expires_at).toLocaleString()}</td>
                        <td>
                          {isHoldStuck(h) ? (
                            <button
                              type="button"
                              className="button button-secondary"
                              disabled={!!busy}
                              onClick={() =>
                                void runAction(
                                  `release-${h.id}`,
                                  `/admin/funding-holds/${encodeURIComponent(h.id)}/release`,
                                  actionReason.trim() ? { reason: actionReason.trim() } : {},
                                  'Expired hold released back to the plan.',
                                )
                              }
                            >
                              Release stuck hold
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Sponsorships">
            <h2 className="section-title">Merchant sponsorships ({plan.sponsorships?.length ?? 0})</h2>
            {(plan.sponsorships ?? []).length === 0 ? (
              <p className="empty-state">No sponsorships on this round.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th>Terms</th>
                      <th>Status</th>
                      <th>Conditions</th>
                      <th>Counter history</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.sponsorships.map((s: any) => {
                      const hasOverride = Array.isArray(s.accepted_with_unmet) && s.accepted_with_unmet.length > 0;
                      return (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.merchant_name || s.merchant_id}</strong>
                            {s.sponsoring_suspended && <small className="text-danger">Sponsoring suspended</small>}
                          </td>
                          <td>
                            {s.points} pts · {s.voucher_qty} vouchers{s.promo ? ' · promo' : ''}
                          </td>
                          <td>
                            <span className="pill">{s.status}</span>
                            {hasOverride && (
                              <span className="pill pill-danger" title="Merchant accepted with unmet deal conditions">
                                Accepted with unmet ({s.accepted_with_unmet.length})
                              </span>
                            )}
                          </td>
                          <td>
                            {Array.isArray(s.conditions) && s.conditions.length > 0 ? (
                              <ul className="compact-list">
                                {s.conditions.map((c: any, idx: number) => (
                                  <li key={`${s.id}-cond-${idx}`}>
                                    <strong>{c.type}</strong>: {c.met === true ? 'met' : c.met === 'unknown' ? 'unknown' : 'unmet'} ({c.detail})
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              'None'
                            )}
                          </td>
                          <td>
                            {s.counter_points != null || s.counter_message ? (
                              <span>
                                {s.counter_points ?? s.points} pts · {s.counter_voucher_qty ?? s.voucher_qty} vouchers
                                {s.counter_message ? <small>{s.counter_message}</small> : null}
                              </span>
                            ) : (
                              'No counter'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
