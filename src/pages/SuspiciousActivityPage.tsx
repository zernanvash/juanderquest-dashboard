import { useCallback, useEffect, useState } from 'react';
import { Play, RefreshCw, ShieldOff } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { EmptyState, PageError, PageHeader, PageLoading } from '../components/PageState';
import { ReasonActionModal } from '../components/ReasonActionModal';
import { Link } from '../router';
import { describeError } from '../utils/errors';
import {
  describeRiskFlag,
  formatShortDateTime,
  RISK_RULE_LABELS,
  type ResolvedEntities,
} from '../utils/riskSummary';

export interface RiskFlagRow {
  id: string;
  user_id: string;
  user: {
    id: string;
    display_name: string;
    handle: string | null;
    masked_email: string;
    role: string;
    suspended_at: string | null;
  };
  rule: string;
  severity: 'low' | 'medium' | 'high';
  evidence: Record<string, unknown>;
  status: 'open' | 'dismissed' | 'actioned';
  review_note: string | null;
  created_at: string;
}

const RULE_KEYS = Object.keys(RISK_RULE_LABELS);

export function SuspiciousActivityPage() {
  const { profile } = useAuth();
  const isDeveloper = profile?.role === 'admin' && profile?.admin_scope === 'developer';

  const [status, setStatus] = useState<'open' | 'dismissed' | 'actioned' | 'all'>('open');
  const [rule, setRule] = useState('');
  const [includeTest, setIncludeTest] = useState(false);

  const [flags, setFlags] = useState<RiskFlagRow[]>([]);
  const [summary30d, setSummary30d] = useState<Record<string, number>>({});
  const [entities, setEntities] = useState<ResolvedEntities>({ spots: {}, quests: {}, campaigns: {}, users: {} });
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [modalState, setModalState] = useState<
    | { kind: 'dismiss'; flag: RiskFlagRow }
    | { kind: 'actioned'; flag: RiskFlagRow }
    | { kind: 'suspend'; flag: RiskFlagRow }
    | null
  >(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(
    async (cursor?: string | null, signal?: AbortSignal) => {
      if (!cursor) setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ status, limit: '25' });
        if (rule) params.set('rule', rule);
        if (includeTest) params.set('include_test', '1');
        if (cursor) params.set('cursor', cursor);

        const res = await apiFetch<{
          items: RiskFlagRow[];
          next_cursor: string | null;
          has_more: boolean;
          summary_30d: Record<string, number>;
          resolved_entities: ResolvedEntities;
        }>(`/admin/risk/flags?${params.toString()}`, { signal });

        setFlags((prev) => (cursor ? [...prev, ...(res.items ?? [])] : (res.items ?? [])));
        setSummary30d(res.summary_30d ?? {});
        if (res.resolved_entities) {
          setEntities((prev) =>
            cursor
              ? {
                  spots: { ...prev.spots, ...res.resolved_entities.spots },
                  quests: { ...prev.quests, ...res.resolved_entities.quests },
                  campaigns: { ...prev.campaigns, ...res.resolved_entities.campaigns },
                  users: { ...prev.users, ...res.resolved_entities.users },
                }
              : res.resolved_entities,
          );
        }
        setNextCursor(res.next_cursor ?? null);
        setHasMore(Boolean(res.has_more));
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(describeError(cause, 'Unable to load suspicious activity flags.'));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [status, rule, includeTest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(null, controller.signal);
    return () => controller.abort();
  }, [load]);

  const runScan = async () => {
    setScanning(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch<{ total_flagged: number }>('/admin/risk/scan', { method: 'POST', body: {} });
      setNotice(`Scan finished. Rules matched ${res.total_flagged} candidate signal(s).`);
      await load(null);
    } catch (cause) {
      setError(describeError(cause, 'Risk scan failed.'));
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async (reason: string) => {
    if (!modalState) return;
    setModalBusy(true);
    setModalError('');
    setNotice('');
    try {
      if (modalState.kind === 'suspend') {
        await apiFetch(`/admin/users/${encodeURIComponent(modalState.flag.user_id)}/suspend`, {
          method: 'POST',
          body: { reason },
        });
        await apiFetch(`/admin/risk/flags/${encodeURIComponent(modalState.flag.id)}/review`, {
          method: 'POST',
          body: { status: 'actioned', note: reason },
        });
        setNotice(`Suspended ${modalState.flag.user.display_name} and marked flag actioned.`);
      } else {
        const nextStatus = modalState.kind === 'dismiss' ? 'dismissed' : 'actioned';
        await apiFetch(`/admin/risk/flags/${encodeURIComponent(modalState.flag.id)}/review`, {
          method: 'POST',
          body: { status: nextStatus, note: reason },
        });
        setNotice(`Flag marked ${nextStatus}.`);
      }
      setModalState(null);
      await load(null);
    } catch (cause) {
      setModalError(describeError(cause, 'Could not complete action.'));
    } finally {
      setModalBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suspicious activity"
        description="Automated anomaly queue across stamps, points, GPS velocity, failures, rejected proofs, reports and vote bursts."
        actions={
          <div className="action-cluster">
            {!isDeveloper ? (
              <button type="button" className="button button-approve" disabled={scanning} onClick={() => void runScan()}>
                <Play size={14} /> {scanning ? 'Scanning…' : 'Run scan now'}
              </button>
            ) : (
              <span className="status-pill status-pending">Read-only (developer)</span>
            )}
            <button type="button" className="button button-secondary" onClick={() => void load(null)}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        }
      />

      {notice ? (
        <div className="status-banner status-banner-success" role="status">
          {notice}
        </div>
      ) : null}

      <section className="stitch-panel panel-section">
        <h3>30-day flags by rule</h3>
        <div className="metric-grid">
          {RULE_KEYS.map((key) => (
            <div className="metric-card" key={key}>
              <span>{RISK_RULE_LABELS[key]}</span>
              <strong>{summary30d[key] ?? 0}</strong>
            </div>
          ))}
        </div>

        <div className="plan117-toolbar">
          <label className="plan117-filter-field">
            <span>Status</span>
            <select
              aria-label="Flag status filter"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'open' | 'dismissed' | 'actioned' | 'all')}
            >
              <option value="open">Open</option>
              <option value="dismissed">Dismissed</option>
              <option value="actioned">Actioned</option>
              <option value="all">All</option>
            </select>
          </label>
          <label className="plan117-filter-field">
            <span>Rule</span>
            <select aria-label="Rule filter" value={rule} onChange={(e) => setRule(e.target.value)}>
              <option value="">All rules</option>
              {RULE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {RISK_RULE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
            Include test data
          </label>
        </div>
      </section>

      {error ? <PageError message={error} onRetry={() => void load(null)} /> : null}

      {loading ? (
        <PageLoading label="Loading suspicious activity queue…" />
      ) : flags.length === 0 ? (
        <EmptyState title="No flags in queue" detail="Adjust filters or run a manual scan." />
      ) : (
        <section className="stitch-panel panel-section">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Severity</th>
                  <th>User</th>
                  <th>Signal & evidence</th>
                  <th>Detected</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <span className={`status-pill status-${f.severity === 'high' ? 'rejected' : 'pending'}`}>
                        {f.severity.toUpperCase()}
                      </span>
                      <div className="plan117-subtext">{RISK_RULE_LABELS[f.rule] ?? f.rule}</div>
                    </td>
                    <td>
                      <Link to={`/users/${encodeURIComponent(f.user.id)}`} className="plan117-user-link">
                        {f.user.display_name}
                      </Link>
                      <div className="plan117-subtext">{f.user.masked_email}</div>
                      {f.user.suspended_at ? <span className="status-pill status-rejected">SUSPENDED</span> : null}
                    </td>
                    <td>
                      <div>{describeRiskFlag(f.rule, f.evidence, entities)}</div>
                      {f.review_note ? <small>Review note: {f.review_note}</small> : null}
                    </td>
                    <td>{formatShortDateTime(f.created_at)}</td>
                    <td>
                      <div className="action-cluster">
                        <Link to={`/users/${encodeURIComponent(f.user.id)}`} className="button button-secondary">
                          Open user
                        </Link>
                        {!isDeveloper && f.status === 'open' ? (
                          <>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                setModalError('');
                                setModalState({ kind: 'dismiss', flag: f });
                              }}
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              className="button button-approve"
                              onClick={() => {
                                setModalError('');
                                setModalState({ kind: 'actioned', flag: f });
                              }}
                            >
                              Mark actioned
                            </button>
                            {!f.user.suspended_at && f.user.role !== 'admin' ? (
                              <button
                                type="button"
                                className="button button-danger"
                                onClick={() => {
                                  setModalError('');
                                  setModalState({ kind: 'suspend', flag: f });
                                }}
                              >
                                <ShieldOff size={14} /> Suspend
                              </button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore ? (
            <div className="plan117-load-more">
              <button type="button" className="button button-secondary" onClick={() => void load(nextCursor)}>
                Load more
              </button>
            </div>
          ) : null}
        </section>
      )}

      <ReasonActionModal
        open={modalState !== null}
        title={
          modalState?.kind === 'suspend'
            ? `Suspend ${modalState.flag.user.display_name}`
            : modalState?.kind === 'dismiss'
              ? 'Dismiss flag'
              : 'Mark flag actioned'
        }
        description={
          modalState?.kind === 'suspend'
            ? 'Suspends the user, revokes sessions, disables push devices, and marks this flag actioned.'
            : 'Record why this anomaly flag is being closed in the admin audit log.'
        }
        confirmLabel={
          modalState?.kind === 'suspend' ? 'Confirm suspend' : modalState?.kind === 'dismiss' ? 'Dismiss flag' : 'Mark actioned'
        }
        danger={modalState?.kind === 'suspend'}
        busy={modalBusy}
        error={modalError}
        onCancel={() => {
          if (!modalBusy) setModalState(null);
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
