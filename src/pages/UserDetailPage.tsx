import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, LogOut, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { EmptyState, PageError, PageHeader, PageLoading } from '../components/PageState';
import { ReasonActionModal } from '../components/ReasonActionModal';
import { Link } from '../router';
import { describeError } from '../utils/errors';
import { describeRiskFlag, formatShortDateTime, type ResolvedEntities } from '../utils/riskSummary';

type TabKey = 'overview' | 'balances' | 'badges' | 'activity' | 'flags' | 'audit';

interface UserDetailPayload {
  profile: {
    id: string;
    display_name: string;
    handle: string | null;
    email: string;
    role: string;
    admin_scope: string | null;
    home_municipality: string | null;
    suspended_at: string | null;
    suspended_reason: string | null;
    suspended_by: string | null;
    created_at: string;
    last_active_at: string | null;
    session_epoch: number;
    sign_in_methods: { providers: string[]; has_password: boolean };
    area_assignments: Array<{
      id: string;
      area_id: string;
      area_name: string;
      powers: string[];
      granted_at: string;
      revoked_at: string | null;
    }>;
  };
  balances: {
    points: number;
    stamps: number;
    explorer_xp: number;
    civic_xp: number;
    scout_reputation: number;
  };
  stamp_ledger: Array<{
    id: string | number;
    delta: number;
    source: string;
    reason: string | null;
    created_at: string;
  }>;
  points_ledger: Array<{
    id: string;
    type: string;
    points_delta: number;
    reason: string | null;
    created_at: string;
  }>;
  badge_awards: Array<{
    id: string;
    title: string;
    track: string;
    season: string;
    awarded_at: string;
    revoked_at: string | null;
  }>;
  quest_attempts: Array<{
    id: string;
    quest_title: string | null;
    status: string;
    verified_steps: number;
    required_steps: number;
    created_at: string;
  }>;
  submissions: Array<{
    id: string;
    quest_title: string | null;
    status: string;
    rejection_reason: string | null;
    created_at: string;
  }>;
  reports_filed: Array<{ kind: string; target_id: string; reason: string; status: string; created_at: string }>;
  reports_received: Array<{ kind: string; target_id: string; reason: string; status: string; created_at: string }>;
  risk_flags: Array<{
    id: string;
    rule: string;
    severity: string;
    status: string;
    evidence: Record<string, unknown>;
    created_at: string;
    review_note: string | null;
  }>;
  resolved_entities: ResolvedEntities;
  admin_log: Array<{
    id: string;
    actor_name: string | null;
    actor_id: string;
    action: string;
    before: unknown;
    after: unknown;
    created_at: string;
  }>;
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'balances', label: 'Balances & ledger' },
  { key: 'badges', label: 'Badges' },
  { key: 'activity', label: 'Activity' },
  { key: 'flags', label: 'Flags' },
  { key: 'audit', label: 'Admin log' },
];

export function UserDetailPage({ userId }: { userId: string }) {
  const { profile } = useAuth();
  const isDeveloper = profile?.role === 'admin' && profile?.admin_scope === 'developer';

  const [tab, setTab] = useState<TabKey>('overview');
  const [data, setData] = useState<UserDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalAction, setModalAction] = useState<'suspend' | 'unsuspend' | 'sign-out' | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch<UserDetailPayload>(`/admin/users/${encodeURIComponent(userId)}`, { signal });
        setData(res);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(describeError(cause, 'Unable to load user profile.'));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const submitAction = async (reason: string) => {
    if (!modalAction || !data) return;
    setModalBusy(true);
    setModalError('');
    setNotice('');
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(data.profile.id)}/${modalAction}`, {
        method: 'POST',
        body: { reason },
      });
      setNotice(
        modalAction === 'suspend'
          ? 'Account suspended, active sessions revoked, and push devices disabled.'
          : modalAction === 'unsuspend'
            ? 'Account suspension lifted.'
            : 'All active sessions invalidated.',
      );
      setModalAction(null);
      await load();
    } catch (cause) {
      setModalError(describeError(cause, 'Action failed.'));
    } finally {
      setModalBusy(false);
    }
  };

  if (loading) return <PageLoading label="Loading user account…" />;
  if (error) return <PageError message={error} onRetry={() => void load()} />;
  if (!data) return <EmptyState title="User not found" />;

  const u = data.profile;
  const canModerate = !isDeveloper;
  const isAdminAccount = u.role === 'admin' || u.id === profile?.id;

  return (
    <div>
      <PageHeader
        title={u.display_name}
        description={`${u.handle ? `@${u.handle.replace(/^@/, '')} · ` : ''}${u.email} · Role: ${u.role}${u.admin_scope ? ` (${u.admin_scope})` : ''}`}
        actions={
          <div className="action-cluster">
            <Link to="/users" className="button button-secondary">
              <ArrowLeft size={14} /> All users
            </Link>
            {canModerate ? (
              <>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setModalError('');
                    setModalAction('sign-out');
                  }}
                >
                  <LogOut size={14} /> Sign out
                </button>
                {u.suspended_at ? (
                  <button
                    type="button"
                    className="button button-approve"
                    onClick={() => {
                      setModalError('');
                      setModalAction('unsuspend');
                    }}
                  >
                    <ShieldCheck size={14} /> Unsuspend
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={isAdminAccount}
                    title={isAdminAccount ? 'Administrators and your own account cannot be suspended here.' : undefined}
                    onClick={() => {
                      setModalError('');
                      setModalAction('suspend');
                    }}
                  >
                    <ShieldOff size={14} /> Suspend
                  </button>
                )}
              </>
            ) : (
              <span className="status-pill status-pending">Read-only (developer)</span>
            )}
          </div>
        }
      />

      {u.suspended_at ? (
        <div className="status-banner status-banner-danger" role="status">
          <ShieldAlert size={16} />
          <strong>SUSPENDED</strong>
          <span>
            Since {formatShortDateTime(u.suspended_at)} — {u.suspended_reason ?? 'No reason recorded'}
          </span>
        </div>
      ) : null}

      {notice ? (
        <div className="status-banner status-banner-success" role="status">
          {notice}
        </div>
      ) : null}

      <div className="filter-row" role="tablist" aria-label="User detail sections">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`filter-chip ${tab === item.key ? 'is-active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
            {item.key === 'flags' && data.risk_flags.length > 0 ? ` (${data.risk_flags.length})` : ''}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <section className="stitch-panel panel-section">
          <div className="metric-grid">
            <div className="metric-card">
              <span>Full email (audited)</span>
              <strong>{u.email}</strong>
            </div>
            <div className="metric-card">
              <span>Sign-in methods</span>
              <strong>
                {[...(u.sign_in_methods.providers ?? []), u.sign_in_methods.has_password ? 'password' : '']
                  .filter(Boolean)
                  .join(', ') || 'None'}
              </strong>
            </div>
            <div className="metric-card">
              <span>Home town</span>
              <strong>{u.home_municipality ?? 'Unset'}</strong>
            </div>
            <div className="metric-card">
              <span>Last active</span>
              <strong>{formatShortDateTime(u.last_active_at)}</strong>
            </div>
          </div>
          <h3>Area assignments</h3>
          {u.area_assignments.length === 0 ? (
            <p className="plan117-subtext">
              No area assignments. Manage LGU assignments in <Link to="/area-admins">Area admins</Link>.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Area</th>
                    <th>Powers</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {u.area_assignments.map((a) => (
                    <tr key={a.id}>
                      <td>{a.area_name}</td>
                      <td>{a.powers.join(', ')}</td>
                      <td>{a.revoked_at ? `Revoked ${formatShortDateTime(a.revoked_at)}` : 'Active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'balances' ? (
        <section className="stitch-panel panel-section">
          <div className="metric-grid">
            <div className="metric-card">
              <span>Points (mJDQ)</span>
              <strong>{data.balances.points.toLocaleString()}</strong>
            </div>
            <div className="metric-card">
              <span>Passport stamps</span>
              <strong>{data.balances.stamps.toLocaleString()}</strong>
            </div>
            <div className="metric-card">
              <span>Explorer XP</span>
              <strong>{data.balances.explorer_xp.toLocaleString()}</strong>
            </div>
            <div className="metric-card">
              <span>Civic XP</span>
              <strong>{data.balances.civic_xp.toLocaleString()}</strong>
            </div>
          </div>

          <h3>Points ledger (last 20)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Delta (mJDQ)</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.points_ledger.map((row) => (
                  <tr key={row.id}>
                    <td>{row.type}</td>
                    <td>{row.points_delta > 0 ? `+${row.points_delta}` : row.points_delta}</td>
                    <td>{row.reason ?? '—'}</td>
                    <td>{formatShortDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="plan117-mt">Stamp ledger (last 20)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Delta</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.stamp_ledger.map((row) => (
                  <tr key={String(row.id)}>
                    <td>{row.source}</td>
                    <td>{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                    <td>{row.reason ?? '—'}</td>
                    <td>{formatShortDateTime(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'badges' ? (
        <section className="stitch-panel panel-section">
          {data.badge_awards.length === 0 ? (
            <EmptyState title="No badges earned yet" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Badge</th>
                    <th>Track</th>
                    <th>Season</th>
                    <th>Awarded</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.badge_awards.map((b) => (
                    <tr key={b.id}>
                      <td>{b.title}</td>
                      <td>{b.track}</td>
                      <td>{b.season}</td>
                      <td>{formatShortDateTime(b.awarded_at)}</td>
                      <td>{b.revoked_at ? 'Revoked' : 'Active'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="stitch-panel panel-section">
          <h3>Quest attempts (last 20)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quest</th>
                  <th>Status</th>
                  <th>Steps</th>
                  <th>Started</th>
                </tr>
              </thead>
              <tbody>
                {data.quest_attempts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.quest_title ?? a.id}</td>
                    <td>{a.status}</td>
                    <td>
                      {a.verified_steps}/{a.required_steps}
                    </td>
                    <td>{formatShortDateTime(a.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="plan117-mt">Proof submissions (last 20)</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Quest</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {data.submissions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.quest_title ?? s.id}</td>
                    <td>{s.status}</td>
                    <td>{s.rejection_reason ?? '—'}</td>
                    <td>{formatShortDateTime(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="plan117-mt">Reports filed ({data.reports_filed.length}) & received ({data.reports_received.length})</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Direction</th>
                  <th>Kind</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...data.reports_filed.map((r) => ({ ...r, dir: 'Filed' })),
                  ...data.reports_received.map((r) => ({ ...r, dir: 'Received' })),
                ].map((r, idx) => (
                  <tr key={`${r.dir}-${r.target_id}-${idx}`}>
                    <td>{r.dir}</td>
                    <td>{r.kind}</td>
                    <td>{r.reason}</td>
                    <td>{r.status}</td>
                    <td>{formatShortDateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'flags' ? (
        <section className="stitch-panel panel-section">
          {data.risk_flags.length === 0 ? (
            <EmptyState title="No suspicious-activity flags" detail="This user has no recorded risk flags." />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Summary</th>
                    <th>Status</th>
                    <th>Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {data.risk_flags.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span className={`status-pill status-${f.severity === 'high' ? 'rejected' : 'pending'}`}>
                          {f.severity.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div>{describeRiskFlag(f.rule, f.evidence, data.resolved_entities)}</div>
                        {f.review_note ? <small>Review note: {f.review_note}</small> : null}
                      </td>
                      <td>{f.status}</td>
                      <td>{formatShortDateTime(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'audit' ? (
        <section className="stitch-panel panel-section">
          {data.admin_log.length === 0 ? (
            <EmptyState title="No admin actions logged yet" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Actor</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {data.admin_log.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.action}</td>
                      <td>{entry.actor_name ?? entry.actor_id}</td>
                      <td>{formatShortDateTime(entry.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <ReasonActionModal
        open={modalAction !== null}
        title={
          modalAction === 'suspend'
            ? `Suspend ${u.display_name}`
            : modalAction === 'unsuspend'
              ? `Unsuspend ${u.display_name}`
              : `Sign out ${u.display_name}`
        }
        description={
          modalAction === 'suspend'
            ? 'Immediately blocks sign-in and authenticated API requests, invalidates existing tokens, and disables push devices.'
            : modalAction === 'unsuspend'
              ? 'Clears suspension so the traveler can sign in again.'
              : 'Increments session_epoch so all existing bearer tokens and cookies expire immediately.'
        }
        confirmLabel={
          modalAction === 'suspend' ? 'Confirm suspend' : modalAction === 'unsuspend' ? 'Confirm unsuspend' : 'Confirm sign out'
        }
        danger={modalAction === 'suspend'}
        busy={modalBusy}
        error={modalError}
        onCancel={() => {
          if (!modalBusy) setModalAction(null);
        }}
        onConfirm={submitAction}
      />
    </div>
  );
}
