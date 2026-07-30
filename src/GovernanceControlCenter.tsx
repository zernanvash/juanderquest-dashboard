import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle2, Clock3, Coins, FileCheck2,
  History, LockKeyhole, PauseCircle, PlayCircle, RefreshCw, Scale, ShieldCheck,
  Store, Users, Vote, WalletCards, XCircle,
} from 'lucide-react';

type GovernanceState =
  | 'draft' | 'screening' | 'voting' | 'approved' | 'rejected' | 'expired'
  | 'scheduled' | 'active' | 'feedback' | 'payout_pending' | 'disputed'
  | 'completed' | 'cancelled';

interface Recipient {
  display_name: string;
  role: string;
  duty: string;
  share_bps: number;
}

interface Proposal {
  id: string;
  title: string;
  location_name: string;
  category: string;
  description: string;
  submitted_by: string;
  state: GovernanceState;
  recipients: Recipient[];
  organizer_bond_mjdq: number;
  bond_status: string;
  eligible_voter_snapshot: number;
  quorum_required: number;
  yes_votes: number;
  no_votes: number;
  votes: number;
  vote_fee_mjdq: number;
  escrow_mjdq: number;
  voting_closes_at?: string;
  quest_starts_at?: string;
  quest_ends_at?: string;
  feedback_eligible_snapshot: number;
  feedback_quorum_required: number;
  approve_feedback: number;
  disapprove_feedback: number;
  feedback_escrow_mjdq: number;
  screening_reason?: string;
  evidence_reference?: string;
  created_at: string;
}

interface Controls {
  pause_votes: boolean;
  pause_payouts: boolean;
  pause_vouchers: boolean;
  pause_all_financial: boolean;
  updated_by: string;
  updated_at: string;
}

interface Overview {
  states: Record<string, number>;
  screening_backlog: number;
  active_votes: number;
  active_quests: number;
  feedback_rounds: number;
  disputed: number;
  payout_pending: number;
  configuration: Record<string, string | number>;
  controls: Controls;
  alerts: Array<{ severity: 'critical' | 'warning' | 'info'; code: string; message: string }>;
}

interface Tokenomics {
  total_issued_mjdq: number;
  circulating_mjdq: number;
  burned_mjdq: number;
  locked_bonds_mjdq: number;
  escrow_mjdq: number;
  treasury_mjdq: number;
  merchant_held_mjdq: number;
  rewards_distributed_mjdq: number;
  payouts_distributed_mjdq: number;
  reconciliation_difference_mjdq: number;
  governance_fee_volume_mjdq: number;
  burn_rate_percent: number;
  top_balances: Array<{ user_id: string; display_name: string; balance_mjdq: number }>;
}

interface LedgerEntry {
  id: string;
  transaction_group_id: string;
  type: string;
  account: string;
  amount_mjdq: number;
  reference_id: string;
  actor_id: string;
  created_at: string;
}

interface AuditEvent {
  id: string;
  action: string;
  actor_id: string;
  subject_id: string;
  reason?: string;
  evidence_reference?: string;
  created_at: string;
}

interface Props {
  token: string;
  onUnauthorized: () => void;
}

const API_BASE = '/api/v1';
const jdq = (mjdq = 0) => `${(mjdq / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 })} JDQ`;
const percent = (value: number) => `${Math.round(value * 100)}%`;
const when = (value?: string) => value ? new Date(value).toLocaleString() : 'Not scheduled';

const stateColor: Record<string, string> = {
  screening: '#7d5800', voting: '#1d4ed8', active: '#2d6a4f', feedback: '#7c3aed',
  disputed: '#bc4749', rejected: '#bc4749', expired: '#837560', completed: '#2d6a4f',
  payout_pending: '#b45309', scheduled: '#0369a1', draft: '#514532',
};

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid rgba(213,196,172,.55)', borderRadius: 14, padding: 18,
};

export function GovernanceControlCenter({ token, onUnauthorized }: Props) {
  const [section, setSection] = useState<'overview' | 'proposals' | 'tokenomics' | 'ledger' | 'audit' | 'controls'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tokenomics, setTokenomics] = useState<Tokenomics | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [selected, setSelected] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ledgerFilter, setLedgerFilter] = useState('');

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (response.status === 401 || response.status === 403) {
      onUnauthorized();
      throw new Error('Administrator session expired.');
    }
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error?.message || 'Governance request failed.');
    return payload.data;
  }, [token, onUnauthorized]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [nextOverview, nextTokenomics, nextProposals, nextLedger, nextAudit] = await Promise.all([
        request('/admin/governance/overview'),
        request('/admin/tokenomics/analytics'),
        request('/admin/governance/proposals'),
        request('/admin/tokenomics/ledger'),
        request('/admin/governance/audit'),
      ]);
      setOverview(nextOverview);
      setTokenomics(nextTokenomics);
      setProposals(nextProposals);
      setLedger(nextLedger);
      setAudit(nextAudit);
      if (selected) setSelected(nextProposals.find((proposal: Proposal) => proposal.id === selected.id) || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load governance controls.');
    } finally {
      setLoading(false);
    }
  }, [request, selected?.id]);

  useEffect(() => { void refresh(); }, [request]);

  const screen = async (proposal: Proposal, decision: 'approve' | 'reject') => {
    const reason = window.prompt(decision === 'approve'
      ? 'Screening conclusion (required):'
      : 'Public rejection reason (required):');
    if (!reason) return;
    const evidence = window.prompt('Evidence or review reference (required):');
    if (!evidence) return;
    try {
      await request(`/admin/governance/proposals/${proposal.id}/screen`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason, evidence_reference: evidence, checklist_complete: decision === 'approve' }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screening action failed.');
    }
  };

  const transition = async (proposal: Proposal, action: string, force = false) => {
    if (!window.confirm(`Confirm ${action.replace(/_/g, ' ')} for "${proposal.title}"? This action is audited.`)) return;
    try {
      await request(`/admin/governance/proposals/${proposal.id}/transition`, {
        method: 'POST', body: JSON.stringify({ action, force }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lifecycle action failed.');
    }
  };

  const toggleControl = async (key: keyof Pick<Controls, 'pause_votes' | 'pause_payouts' | 'pause_vouchers' | 'pause_all_financial'>) => {
    if (!overview) return;
    const nextValue = !overview.controls[key];
    const reason = window.prompt(`Reason for ${nextValue ? 'enabling' : 'clearing'} ${key.replace(/_/g, ' ')}:`);
    if (!reason) return;
    try {
      await request('/admin/governance/controls', {
        method: 'PUT', body: JSON.stringify({ [key]: nextValue, reason }),
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Control update failed.');
    }
  };

  const filteredLedger = useMemo(() => {
    const query = ledgerFilter.toLowerCase().trim();
    if (!query) return ledger;
    return ledger.filter((entry) => [entry.type, entry.account, entry.reference_id, entry.transaction_group_id].some((value) => value.toLowerCase().includes(query)));
  }, [ledger, ledgerFilter]);

  if (loading && !overview) return <div style={card}>Loading governance control center…</div>;

  const nav = [
    ['overview', BarChart3, 'Overview'],
    ['proposals', Vote, 'Proposals'],
    ['tokenomics', Coins, 'Tokenomics'],
    ['ledger', WalletCards, 'Ledger'],
    ['audit', History, 'Audit'],
    ['controls', ShieldCheck, 'Risk Controls'],
  ] as const;

  return (
    <div>
      <div style={{ ...card, marginBottom: 16, background: '#fff8e6', borderColor: '#ffb703' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6b4b00', fontWeight: 800 }}>
              <ShieldCheck size={20} /> Governance & JDQ Control Center
            </div>
            <p style={{ fontSize: 12, color: '#514532', marginTop: 5, maxWidth: 760 }}>
              Off-chain prototype ledger. Values below are simulated JDQ—not blockchain balances. Every financial control and decision is audited.
            </p>
          </div>
          <button onClick={() => void refresh()} disabled={loading} className="gov-button secondary">
            <RefreshCw size={15} /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="gov-alert critical"><AlertTriangle size={17} /> {error}</div>}

      <div className="gov-nav">
        {nav.map(([id, Icon, label]) => (
          <button key={id} onClick={() => setSection(id)} className={`gov-nav-button ${section === id ? 'active' : ''}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {section === 'overview' && overview && tokenomics && (
        <>
          <InsightStrip overview={overview} tokenomics={tokenomics} />
          <div className="gov-metric-grid">
            <Metric icon={FileCheck2} label="Awaiting screening" value={overview.screening_backlog} tone="#7d5800" />
            <Metric icon={Vote} label="Active votes" value={overview.active_votes} tone="#1d4ed8" />
            <Metric icon={Activity} label="Active quests" value={overview.active_quests} tone="#2d6a4f" />
            <Metric icon={Scale} label="Disputes / payout queue" value={overview.disputed + overview.payout_pending} tone="#bc4749" />
            <Metric icon={Coins} label="Governance escrow" value={jdq(tokenomics.escrow_mjdq)} tone="#7c3aed" />
            <Metric icon={LockKeyhole} label="Locked bonds" value={jdq(tokenomics.locked_bonds_mjdq)} tone="#b45309" />
          </div>
          <div className="gov-two-column">
            <section style={card}>
              <h3 className="gov-section-title"><BarChart3 size={18} /> Lifecycle funnel</h3>
              <p className="gov-chart-caption">Where Community Quest proposals currently sit in the governance process.</p>
              <LifecycleBars states={overview.states} />
            </section>
            <section style={card}>
              <h3 className="gov-section-title"><AlertTriangle size={18} /> Active alerts</h3>
              {overview.alerts.map((alert) => (
                <div key={alert.code} className={`gov-alert ${alert.severity}`}>
                  {alert.severity === 'info' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                  <div><strong>{alert.code.replace(/_/g, ' ')}</strong><div>{alert.message}</div></div>
                </div>
              ))}
            </section>
          </div>
          <section style={{ ...card, marginTop: 16 }}>
            <h3 className="gov-section-title"><Clock3 size={18} /> Governance parameters</h3>
            <div className="gov-config-grid">
              {Object.entries(overview.configuration).map(([key, value]) => (
                <div key={key}><span>{key.replace(/_/g, ' ')}</span><strong>{String(value)}</strong></div>
              ))}
            </div>
          </section>
        </>
      )}

      {section === 'proposals' && (
        <div className="gov-proposal-layout">
          <section>
            <div className="gov-proposal-grid">
              {proposals.map((proposal) => {
                const turnout = proposal.eligible_voter_snapshot ? proposal.votes / proposal.eligible_voter_snapshot : 0;
                return (
                  <article key={proposal.id} className={`gov-proposal-card ${selected?.id === proposal.id ? 'selected' : ''}`} onClick={() => setSelected(proposal)}>
                    <div className="gov-card-top">
                      <span className="gov-state" style={{ color: stateColor[proposal.state] }}>{proposal.state.replace(/_/g, ' ')}</span>
                      <span>{proposal.category.replace(/_/g, ' ')}</span>
                    </div>
                    <h3>{proposal.title}</h3>
                    <p>{proposal.location_name}</p>
                    <div className="gov-vote-bar"><span style={{ width: `${Math.min(100, turnout * 100)}%` }} /></div>
                    <div className="gov-card-stats">
                      <span>{proposal.votes}/{proposal.quorum_required} quorum</span>
                      <span>{proposal.yes_votes} yes · {proposal.no_votes} no</span>
                    </div>
                    <div className="gov-card-stats">
                      <span>Pool {jdq(proposal.escrow_mjdq + proposal.feedback_escrow_mjdq)}</span>
                      <span>Bond {proposal.bond_status.replace(/_/g, ' ')}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
          <aside style={card}>
            {!selected ? <p style={{ color: '#837560' }}>Select a proposal to inspect all governance terms and actions.</p> : (
              <ProposalInspector proposal={selected} onScreen={screen} onTransition={transition} />
            )}
          </aside>
        </div>
      )}

      {section === 'tokenomics' && tokenomics && (
        <>
          <div className="gov-metric-grid">
            <Metric icon={Coins} label="Total issued" value={jdq(tokenomics.total_issued_mjdq)} tone="#7d5800" />
            <Metric icon={Users} label="Circulating" value={jdq(tokenomics.circulating_mjdq)} tone="#2d6a4f" />
            <Metric icon={Activity} label="Burned" value={jdq(tokenomics.burned_mjdq)} tone="#bc4749" />
            <Metric icon={LockKeyhole} label="Bonds + escrow" value={jdq(tokenomics.locked_bonds_mjdq + tokenomics.escrow_mjdq)} tone="#7c3aed" />
            <Metric icon={WalletCards} label="Community treasury" value={jdq(tokenomics.treasury_mjdq)} tone="#0369a1" />
            <Metric icon={Scale} label="Reconciliation difference" value={jdq(tokenomics.reconciliation_difference_mjdq)} tone={tokenomics.reconciliation_difference_mjdq === 0 ? '#2d6a4f' : '#bc4749'} />
          </div>
          <div className="gov-two-column">
            <TokenAllocationChart tokenomics={tokenomics} />
            <LedgerActivityChart ledger={ledger} />
          </div>
          <div className="gov-two-column gov-chart-row">
            <ComparisonBars
              title="JDQ movement comparison"
              subtitle="Cumulative movement by purpose. These are operational totals, not market performance."
              values={[
                { label: 'Governance fees', value: tokenomics.governance_fee_volume_mjdq, color: '#7c3aed' },
                { label: 'Quest rewards', value: tokenomics.rewards_distributed_mjdq, color: '#2d6a4f' },
                { label: 'Organizer payouts', value: tokenomics.payouts_distributed_mjdq, color: '#0369a1' },
                { label: 'Burned', value: tokenomics.burned_mjdq, color: '#bc4749' },
                { label: 'Merchant held', value: tokenomics.merchant_held_mjdq, color: '#b45309' },
              ]}
            />
            <ComparisonBars
              title="Largest wallet balances"
              subtitle="Relative concentration among the highest current balances."
              values={tokenomics.top_balances.map((balance) => ({
                label: balance.display_name,
                value: balance.balance_mjdq,
                color: '#3f6653',
              }))}
              emptyLabel="No wallet balances available."
            />
          </div>
          <section style={{ ...card, marginTop: 16 }}>
            <h3 className="gov-section-title"><Store size={18} /> Merchant and voucher exposure</h3>
            <p className="gov-muted">Merchant-held JDQ, sponsorship, voucher liabilities, redemptions, and exceptions appear here when verified merchant records are connected. Sponsorship never changes voting power.</p>
            <div className="gov-config-grid">
              <div><span>Merchant-held balance</span><strong>{jdq(tokenomics.merchant_held_mjdq)}</strong></div>
              <div><span>Active sponsorship liability</span><strong>{jdq(0)}</strong></div>
              <div><span>Voucher redemption liability</span><strong>{jdq(0)}</strong></div>
              <div><span>Exception queue</span><strong>0</strong></div>
            </div>
          </section>
        </>
      )}

      {section === 'ledger' && (
        <section style={card}>
          <h3 className="gov-section-title"><WalletCards size={18} /> Append-only JDQ ledger</h3>
          <input className="gov-input" value={ledgerFilter} onChange={(event) => setLedgerFilter(event.target.value)} placeholder="Filter by type, account, proposal, or transaction group…" />
          <div className="gov-table-wrap">
            <table className="gov-table">
              <thead><tr><th>Time</th><th>Type</th><th>Account</th><th>Amount</th><th>Reference</th><th>Transaction group</th></tr></thead>
              <tbody>{filteredLedger.map((entry) => (
                <tr key={entry.id}>
                  <td>{when(entry.created_at)}</td><td>{entry.type}</td><td className="mono">{entry.account}</td>
                  <td style={{ color: entry.amount_mjdq < 0 ? '#bc4749' : '#2d6a4f', fontWeight: 700 }}>{jdq(entry.amount_mjdq)}</td>
                  <td className="mono">{entry.reference_id}</td><td className="mono">{entry.transaction_group_id}</td>
                </tr>
              ))}</tbody>
            </table>
            {!filteredLedger.length && <p className="gov-empty">No ledger entries match this filter.</p>}
          </div>
        </section>
      )}

      {section === 'audit' && (
        <section style={card}>
          <h3 className="gov-section-title"><History size={18} /> Immutable administrative audit stream</h3>
          <div className="gov-audit-list">
            {audit.map((event) => (
              <div key={event.id} className="gov-audit-event">
                <div><strong>{event.action.replace(/\./g, ' › ')}</strong><span>{when(event.created_at)}</span></div>
                <p>Subject: <span className="mono">{event.subject_id}</span> · Actor: <span className="mono">{event.actor_id}</span></p>
                {event.reason && <p>Reason: {event.reason}</p>}
                {event.evidence_reference && <p>Evidence: {event.evidence_reference}</p>}
              </div>
            ))}
            {!audit.length && <p className="gov-empty">No governance actions recorded yet.</p>}
          </div>
        </section>
      )}

      {section === 'controls' && overview && (
        <div className="gov-two-column">
          <section style={card}>
            <h3 className="gov-section-title"><ShieldCheck size={18} /> Emergency pause controls</h3>
            <p className="gov-muted">Every change requires a reason and is added to the audit stream. These prototype controls are single-admin; production requires two-person approval for high-value actions.</p>
            {(['pause_votes', 'pause_payouts', 'pause_vouchers', 'pause_all_financial'] as const).map((key) => (
              <div key={key} className="gov-control-row">
                <div><strong>{key.replace(/_/g, ' ')}</strong><span>{overview.controls[key] ? 'Paused' : 'Operating'}</span></div>
                <button className={`gov-button ${overview.controls[key] ? 'success' : 'danger'}`} onClick={() => void toggleControl(key)}>
                  {overview.controls[key] ? <PlayCircle size={15} /> : <PauseCircle size={15} />}
                  {overview.controls[key] ? 'Resume' : 'Pause'}
                </button>
              </div>
            ))}
          </section>
          <section style={card}>
            <h3 className="gov-section-title"><AlertTriangle size={18} /> Control boundaries</h3>
            <DataRow label="Last control update" value={when(overview.controls.updated_at)} />
            <DataRow label="Updated by" value={overview.controls.updated_by} />
            <DataRow label="Two-person approvals" value="Required before production" />
            <DataRow label="Direct balance editing" value="Forbidden" />
            <DataRow label="Ledger corrections" value="Paired entries only" />
            <DataRow label="Blockchain settlement" value="Not active" />
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: React.ReactNode; tone: string }) {
  return <div style={card} className="gov-metric"><div style={{ background: `${tone}18`, color: tone }}><Icon size={19} /></div><span>{label}</span><strong>{value}</strong></div>;
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="gov-data-row"><span>{label}</span><strong>{value}</strong></div>;
}

function InsightStrip({ overview, tokenomics }: { overview: Overview; tokenomics: Tokenomics }) {
  const healthy = tokenomics.reconciliation_difference_mjdq === 0 && overview.alerts.every((alert) => alert.severity !== 'critical');
  const openWork = overview.screening_backlog + overview.active_votes + overview.disputed + overview.payout_pending;
  return (
    <div className={`gov-insight-strip ${healthy ? 'healthy' : 'attention'}`}>
      <div className="gov-insight-icon">{healthy ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}</div>
      <div>
        <strong>{healthy ? 'Ledger reconciled and controls healthy' : 'Administrative attention required'}</strong>
        <p>
          {openWork
            ? `${openWork} governance item${openWork === 1 ? '' : 's'} currently need screening, voting, dispute, or payout attention.`
            : 'No governance items currently require administrator intervention.'}
        </p>
      </div>
      <span className="gov-insight-badge">{healthy ? 'Balanced' : 'Review now'}</span>
    </div>
  );
}

function LifecycleBars({ states }: { states: Record<string, number> }) {
  const entries = Object.entries(states).filter(([, count]) => count > 0);
  const max = Math.max(1, ...entries.map(([, count]) => count));
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!entries.length) return <p className="gov-empty">No proposals have entered the lifecycle yet.</p>;
  return (
    <div className="gov-bar-list">
      {entries.map(([state, count], index) => (
        <div className="gov-bar-item" key={state}>
          <div className="gov-bar-label">
            <span className="gov-state" style={{ color: stateColor[state] || '#514532' }}>{state.replace(/_/g, ' ')}</span>
            <strong>{count}<small>{total ? ` · ${Math.round((count / total) * 100)}%` : ''}</small></strong>
          </div>
          <div className="gov-bar-track">
            <span
              className="gov-bar-fill"
              style={{
                width: `${Math.max(5, (count / max) * 100)}%`,
                background: stateColor[state] || '#837560',
                animationDelay: `${index * 70}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TokenAllocationChart({ tokenomics }: { tokenomics: Tokenomics }) {
  const segments = [
    { label: 'Circulating', value: tokenomics.circulating_mjdq, color: '#2d6a4f' },
    { label: 'Burned', value: tokenomics.burned_mjdq, color: '#bc4749' },
    { label: 'Locked bonds', value: tokenomics.locked_bonds_mjdq, color: '#b45309' },
    { label: 'Escrow', value: tokenomics.escrow_mjdq, color: '#7c3aed' },
    { label: 'Treasury', value: tokenomics.treasury_mjdq, color: '#0369a1' },
  ];
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  let cursor = 0;
  const gradient = total
    ? segments.map((segment) => {
        const start = cursor;
        cursor += (Math.max(0, segment.value) / total) * 100;
        return `${segment.color} ${start}% ${cursor}%`;
      }).join(', ')
    : '#e9e8e4 0 100%';
  return (
    <section style={card} className="gov-chart-card">
      <h3 className="gov-section-title"><Coins size={18} /> JDQ supply allocation</h3>
      <p className="gov-chart-caption">How issued JDQ is currently allocated or removed from circulation.</p>
      <div className="gov-donut-layout">
        <div className="gov-donut" style={{ background: `conic-gradient(${gradient})` }} role="img" aria-label="JDQ supply allocation donut chart">
          <div><strong>{jdq(tokenomics.total_issued_mjdq)}</strong><span>Total issued</span></div>
        </div>
        <div className="gov-chart-legend">
          {segments.map((segment) => (
            <div key={segment.label}>
              <i style={{ background: segment.color }} />
              <span>{segment.label}</span>
              <strong>{jdq(segment.value)}</strong>
              <small>{total ? `${Math.round((segment.value / total) * 100)}%` : '0%'}</small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonBars({
  title, subtitle, values, emptyLabel = 'No activity recorded yet.',
}: {
  title: string;
  subtitle: string;
  values: Array<{ label: string; value: number; color: string }>;
  emptyLabel?: string;
}) {
  const max = Math.max(0, ...values.map((item) => Math.abs(item.value)));
  return (
    <section style={card} className="gov-chart-card">
      <h3 className="gov-section-title"><BarChart3 size={18} /> {title}</h3>
      <p className="gov-chart-caption">{subtitle}</p>
      {!values.length && <p className="gov-empty">{emptyLabel}</p>}
      <div className="gov-bar-list">
        {values.map((item, index) => (
          <div className="gov-bar-item" key={item.label}>
            <div className="gov-bar-label"><span>{item.label}</span><strong>{jdq(item.value)}</strong></div>
            <div className="gov-bar-track">
              <span
                className="gov-bar-fill"
                style={{
                  width: `${max ? Math.max(item.value ? 3 : 0, (Math.abs(item.value) / max) * 100) : 0}%`,
                  background: item.color,
                  animationDelay: `${index * 70}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LedgerActivityChart({ ledger }: { ledger: LedgerEntry[] }) {
  const daily = useMemo(() => {
    const grouped = new Map<string, { volume: number; count: number }>();
    ledger.forEach((entry) => {
      const key = new Date(entry.created_at).toISOString().slice(0, 10);
      const current = grouped.get(key) || { volume: 0, count: 0 };
      current.volume += Math.abs(entry.amount_mjdq);
      current.count += 1;
      grouped.set(key, current);
    });
    return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-7)
      .map(([date, value]) => ({ date, ...value }));
  }, [ledger]);
  const max = Math.max(1, ...daily.map((day) => day.volume));
  const points = daily.map((day, index) => {
    const x = daily.length === 1 ? 250 : 24 + (index / (daily.length - 1)) * 452;
    const y = 132 - (day.volume / max) * 100;
    return { ...day, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = points.length ? `24,140 ${line} 476,140` : '';
  const volume = daily.reduce((sum, day) => sum + day.volume, 0);
  const count = daily.reduce((sum, day) => sum + day.count, 0);
  return (
    <section style={card} className="gov-chart-card">
      <div className="gov-chart-heading">
        <div>
          <h3 className="gov-section-title"><Activity size={18} /> Recent ledger activity</h3>
          <p className="gov-chart-caption">Absolute JDQ movement per active day, from the append-only ledger.</p>
        </div>
        <div className="gov-chart-summary"><strong>{jdq(volume)}</strong><span>{count} entries</span></div>
      </div>
      {points.length ? (
        <>
          <svg className="gov-area-chart" viewBox="0 0 500 160" role="img" aria-label="Recent JDQ ledger volume area chart">
            <defs>
              <linearGradient id="ledgerArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffb703" stopOpacity=".4" />
                <stop offset="100%" stopColor="#ffb703" stopOpacity=".02" />
              </linearGradient>
            </defs>
            <line x1="24" y1="140" x2="476" y2="140" className="gov-chart-axis" />
            <polygon points={area} fill="url(#ledgerArea)" className="gov-area-fill" />
            <polyline points={line} className="gov-area-line" />
            {points.map((point) => <circle key={point.date} cx={point.x} cy={point.y} r="4" className="gov-area-point"><title>{point.date}: {jdq(point.volume)} across {point.count} entries</title></circle>)}
          </svg>
          <div className="gov-chart-dates">
            <span>{new Date(points[0].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span>{new Date(points[points.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
          </div>
        </>
      ) : <p className="gov-empty">Ledger activity will appear after the first JDQ transaction.</p>}
    </section>
  );
}

function ProposalInspector({
  proposal, onScreen, onTransition,
}: {
  proposal: Proposal;
  onScreen: (proposal: Proposal, decision: 'approve' | 'reject') => void;
  onTransition: (proposal: Proposal, action: string, force?: boolean) => void;
}) {
  const turnout = proposal.eligible_voter_snapshot ? proposal.votes / proposal.eligible_voter_snapshot : 0;
  return (
    <div>
      <div className="gov-card-top"><span className="gov-state" style={{ color: stateColor[proposal.state] }}>{proposal.state}</span><span className="mono">{proposal.id}</span></div>
      <h2 style={{ color: '#582f0e', fontSize: 20, margin: '10px 0 5px' }}>{proposal.title}</h2>
      <p className="gov-muted">{proposal.description}</p>
      <div style={{ marginTop: 16 }}>
        <DataRow label="Organizer" value={proposal.submitted_by} />
        <DataRow label="Location" value={proposal.location_name} />
        <DataRow label="Vote closes" value={when(proposal.voting_closes_at)} />
        <DataRow label="Quest period" value={`${when(proposal.quest_starts_at)} — ${when(proposal.quest_ends_at)}`} />
        <DataRow label="Eligible snapshot" value={proposal.eligible_voter_snapshot} />
        <DataRow label="Quorum" value={`${proposal.votes}/${proposal.quorum_required} (${percent(turnout)})`} />
        <DataRow label="Result" value={`${proposal.yes_votes} yes · ${proposal.no_votes} no`} />
        <DataRow label="Vote fee" value={jdq(proposal.vote_fee_mjdq)} />
        <DataRow label="Escrow" value={jdq(proposal.escrow_mjdq + proposal.feedback_escrow_mjdq)} />
        <DataRow label="Organizer bond" value={`${jdq(proposal.organizer_bond_mjdq)} · ${proposal.bond_status}`} />
      </div>
      <h4 className="gov-subtitle">Locked payout recipients</h4>
      {proposal.recipients.map((recipient) => (
        <div key={`${recipient.display_name}-${recipient.role}`} className="gov-recipient">
          <div><strong>{recipient.display_name}</strong><span>{recipient.role} · {(recipient.share_bps / 100).toFixed(2)}%</span></div>
          <p>{recipient.duty}</p>
        </div>
      ))}
      {(proposal.screening_reason || proposal.evidence_reference) && <>
        <h4 className="gov-subtitle">Screening record</h4>
        <p className="gov-muted">{proposal.screening_reason}</p>
        <p className="gov-muted">Evidence: {proposal.evidence_reference}</p>
      </>}
      <div className="gov-actions">
        {proposal.state === 'screening' && <>
          <button className="gov-button success" onClick={() => onScreen(proposal, 'approve')}><CheckCircle2 size={15} /> Approve screening</button>
          <button className="gov-button danger" onClick={() => onScreen(proposal, 'reject')}><XCircle size={15} /> Reject</button>
        </>}
        {proposal.state === 'voting' && <button className="gov-button secondary" onClick={() => onTransition(proposal, 'close_voting', true)}><Clock3 size={15} /> Close vote (prototype)</button>}
        {proposal.state === 'approved' && <button className="gov-button success" onClick={() => onTransition(proposal, 'schedule')}><Clock3 size={15} /> Schedule quest</button>}
        {proposal.state === 'scheduled' && <button className="gov-button success" onClick={() => onTransition(proposal, 'activate')}><PlayCircle size={15} /> Activate quest</button>}
        {proposal.state === 'active' && <button className="gov-button secondary" onClick={() => onTransition(proposal, 'open_feedback')}><Vote size={15} /> Open feedback</button>}
        {proposal.state === 'feedback' && <>
          <button className="gov-button secondary" onClick={() => onTransition(proposal, 'close_feedback', true)}><Clock3 size={15} /> Close feedback (prototype)</button>
          <button className="gov-button danger" onClick={() => onTransition(proposal, 'mark_disputed')}><Scale size={15} /> Escalate dispute</button>
        </>}
        {proposal.state === 'payout_pending' && <button className="gov-button success" onClick={() => onTransition(proposal, 'finalize_payout')}><Coins size={15} /> Release locked payout</button>}
      </div>
    </div>
  );
}
