import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { apiFetch } from '../api/client';
import { EmptyState, PageError, PageHeader, PageLoading } from '../components/PageState';
import { Link } from '../router';
import { describeError } from '../utils/errors';
import { formatShortDateTime } from '../utils/riskSummary';

interface MonitorData {
  window: { days: number; from: string; to: string };
  totals: {
    points_issued: number;
    points_spent: number;
    stamps_issued: number;
    stamps_spent: number;
    explorer_xp_awarded: number;
    badges_awarded: number;
    badges_revoked: number;
    admin_point_grants_count: number;
    admin_point_grants_sum: number;
  };
  daily_series: Array<{
    date: string;
    points_issued: number;
    points_spent: number;
    stamps_issued: number;
    stamps_spent: number;
    explorer_xp_awarded: number;
    badges_awarded: number;
    badges_revoked: number;
    admin_point_grants_count: number;
    admin_point_grants_sum: number;
  }>;
  top_earners: {
    points: Array<{ user_id: string; display_name: string; handle: string | null; amount: number }>;
    stamps: Array<{ user_id: string; display_name: string; handle: string | null; amount: number }>;
    xp: Array<{ user_id: string; display_name: string; handle: string | null; amount: number }>;
  };
  issuance_by_source: {
    points: Array<{ source: string; issued: number; count: number }>;
    stamps: Array<{ source: string; issued: number; count: number }>;
  };
}

interface LedgerRow {
  id: string;
  user_id: string;
  display_name: string;
  delta: number | null;
  award: string | null;
  source: string;
  reason: string | null;
  created_at: string;
}

interface BadgeDefRow {
  id: string;
  title: string;
  track: string;
  category: string;
  threshold: number;
  award_count: number;
  revoked_count: number;
  minted_on_chain_count: number;
  last_awarded_at: string | null;
}

function CurrencyLineChart({
  title,
  values,
  color,
}: {
  title: string;
  values: Array<{ date: string; value: number }>;
  color: string;
}) {
  const geometry = useMemo(() => {
    if (!values.length) return null;
    const width = 420;
    const height = 140;
    const padX = 20;
    const padY = 18;
    const maxVal = Math.max(...values.map((v) => v.value), 1);
    const pts = values.map((v, idx) => {
      const x = values.length === 1 ? width / 2 : padX + (idx / (values.length - 1)) * (width - padX * 2);
      const y = height - padY - (v.value / maxVal) * (height - padY * 2);
      return { x, y, ...v };
    });
    const path = pts.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`, '');
    return { pts, path, width, height, maxVal };
  }, [values]);

  return (
    <div className="stitch-card plan117-chart-card">
      <div className="plan117-chart-head">
        <strong>{title}</strong>
        <span>Peak {geometry?.maxVal.toLocaleString() ?? 0}</span>
      </div>
      {geometry ? (
        <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} className="plan117-svg-chart" role="img" aria-label={title}>
          <path d={geometry.path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
          {geometry.pts.map((p) => (
            <circle key={p.date} cx={p.x} cy={p.y} r="3" fill={color}>
              <title>
                {p.date}: {p.value}
              </title>
            </circle>
          ))}
        </svg>
      ) : (
        <p className="plan117-subtext">No events in window.</p>
      )}
    </div>
  );
}

export function TokensBadgesPage() {
  const [tab, setTab] = useState<'overview' | 'badges'>('overview');
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [includeTest, setIncludeTest] = useState(false);

  const [monitor, setMonitor] = useState<MonitorData | null>(null);
  const [badges, setBadges] = useState<BadgeDefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ledger explorer state
  const [kind, setKind] = useState<'points' | 'stamps' | 'xp' | 'badges'>('points');
  const [ledgerSource, setLedgerSource] = useState('');
  const [ledgerUser, setLedgerUser] = useState('');
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerCursor, setLedgerCursor] = useState<string | null>(null);
  const [ledgerHasMore, setLedgerHasMore] = useState(false);

  const loadMonitorAndBadges = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const testParam = includeTest ? '&include_test=1' : '';
        const [monRes, badgeRes] = await Promise.all([
          apiFetch<MonitorData>(`/admin/economy/monitor?days=${days}${testParam}`, { signal }),
          apiFetch<{ items: BadgeDefRow[] }>(`/admin/badges${includeTest ? '?include_test=1' : ''}`, { signal }),
        ]);
        setMonitor(monRes);
        setBadges(badgeRes.items ?? []);
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(describeError(cause, 'Unable to load economy monitor.'));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [days, includeTest],
  );

  const loadLedger = useCallback(
    async (cursor?: string | null, signal?: AbortSignal) => {
      try {
        const params = new URLSearchParams({ kind, limit: '25' });
        if (includeTest) params.set('include_test', '1');
        if (ledgerSource.trim()) params.set('source', ledgerSource.trim());
        if (ledgerUser.trim()) params.set('user_id', ledgerUser.trim());
        if (cursor) params.set('cursor', cursor);
        const res = await apiFetch<{ items: LedgerRow[]; next_cursor: string | null; has_more: boolean }>(
          `/admin/economy/ledger?${params.toString()}`,
          { signal },
        );
        setLedgerRows((prev) => (cursor ? [...prev, ...(res.items ?? [])] : (res.items ?? [])));
        setLedgerCursor(res.next_cursor ?? null);
        setLedgerHasMore(Boolean(res.has_more));
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(describeError(cause, 'Unable to load ledger.'));
        }
      }
    },
    [kind, includeTest, ledgerSource, ledgerUser],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadMonitorAndBadges(controller.signal);
    return () => controller.abort();
  }, [loadMonitorAndBadges]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLedger(null, controller.signal);
    return () => controller.abort();
  }, [loadLedger]);

  return (
    <div>
      <PageHeader
        title="Tokens & badges"
        description="Read-only ledger totals, Manila-day issuance series, top earners, badge definitions and searchable transactions."
        actions={
          <div className="action-cluster">
            <select aria-label="Window days" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 30 | 90)}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <label className="checkbox-inline">
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
              Include test data
            </label>
            <button type="button" className="button button-secondary" onClick={() => void loadMonitorAndBadges()}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        }
      />

      <div className="filter-row" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={`filter-chip ${tab === 'overview' ? 'is-active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Overview & ledger
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'badges'}
          className={`filter-chip ${tab === 'badges' ? 'is-active' : ''}`}
          onClick={() => setTab('badges')}
        >
          Badges ({badges.length})
        </button>
      </div>

      {error ? <PageError message={error} onRetry={() => void loadMonitorAndBadges()} /> : null}

      {loading ? (
        <PageLoading label="Loading token and badge telemetry…" />
      ) : tab === 'badges' ? (
        <section className="stitch-panel panel-section">
          {badges.length === 0 ? (
            <EmptyState title="No badge definitions" />
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Badge</th>
                    <th>Track</th>
                    <th>Category</th>
                    <th>Threshold</th>
                    <th>Awarded</th>
                    <th>Revoked</th>
                    <th>Minted on chain</th>
                    <th>Last awarded</th>
                  </tr>
                </thead>
                <tbody>
                  {badges.map((b) => (
                    <tr key={b.id}>
                      <td>{b.title}</td>
                      <td>{b.track}</td>
                      <td>{b.category}</td>
                      <td>{b.threshold}</td>
                      <td>{b.award_count}</td>
                      <td>{b.revoked_count}</td>
                      <td>{b.minted_on_chain_count}</td>
                      <td>{formatShortDateTime(b.last_awarded_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : monitor ? (
        <>
          <section className="stitch-panel panel-section">
            <div className="metric-grid">
              <div className="metric-card">
                <span>Points issued / spent</span>
                <strong>
                  {monitor.totals.points_issued.toLocaleString()} / {monitor.totals.points_spent.toLocaleString()}
                </strong>
              </div>
              <div className="metric-card">
                <span>Stamps issued / spent</span>
                <strong>
                  {monitor.totals.stamps_issued.toLocaleString()} / {monitor.totals.stamps_spent.toLocaleString()}
                </strong>
              </div>
              <div className="metric-card">
                <span>Explorer XP awarded</span>
                <strong>{monitor.totals.explorer_xp_awarded.toLocaleString()}</strong>
              </div>
              <div className="metric-card">
                <span>Badges awarded / revoked</span>
                <strong>
                  {monitor.totals.badges_awarded} / {monitor.totals.badges_revoked}
                </strong>
              </div>
              <div className="metric-card">
                <span>Admin point grants</span>
                <strong>
                  {monitor.totals.admin_point_grants_count} ({monitor.totals.admin_point_grants_sum.toLocaleString()} mJDQ)
                </strong>
              </div>
            </div>

            <div className="plan117-charts-grid">
              <CurrencyLineChart
                title="Points issued (mJDQ / day)"
                color="#2d6a4f"
                values={monitor.daily_series.map((d) => ({ date: d.date, value: d.points_issued }))}
              />
              <CurrencyLineChart
                title="Stamps issued (/ day)"
                color="#b45309"
                values={monitor.daily_series.map((d) => ({ date: d.date, value: d.stamps_issued }))}
              />
              <CurrencyLineChart
                title="Explorer XP awarded (/ day)"
                color="#1d4ed8"
                values={monitor.daily_series.map((d) => ({ date: d.date, value: d.explorer_xp_awarded }))}
              />
              <CurrencyLineChart
                title="Badges awarded (/ day)"
                color="#582f0e"
                values={monitor.daily_series.map((d) => ({ date: d.date, value: d.badges_awarded }))}
              />
            </div>
          </section>

          <section className="stitch-panel panel-section">
            <div className="plan117-split-grid">
              <div>
                <h3>Top points earners</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.top_earners.points.map((r) => (
                        <tr key={r.user_id}>
                          <td>
                            <Link to={`/users/${encodeURIComponent(r.user_id)}`}>{r.display_name}</Link>
                          </td>
                          <td>{r.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3>Top stamp earners</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Stamps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.top_earners.stamps.map((r) => (
                        <tr key={r.user_id}>
                          <td>
                            <Link to={`/users/${encodeURIComponent(r.user_id)}`}>{r.display_name}</Link>
                          </td>
                          <td>{r.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3>Top Explorer XP earners</h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>XP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monitor.top_earners.xp.map((r) => (
                        <tr key={r.user_id}>
                          <td>
                            <Link to={`/users/${encodeURIComponent(r.user_id)}`}>{r.display_name}</Link>
                          </td>
                          <td>{r.amount.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <section className="stitch-panel panel-section">
            <h3>Issuance by source</h3>
            <div className="plan117-split-grid">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Points source</th>
                      <th>Issued</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.issuance_by_source.points.map((s) => (
                      <tr key={s.source}>
                        <td>{s.source}</td>
                        <td>{s.issued.toLocaleString()}</td>
                        <td>{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Stamp source</th>
                      <th>Issued</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitor.issuance_by_source.stamps.map((s) => (
                      <tr key={s.source}>
                        <td>{s.source}</td>
                        <td>{s.issued.toLocaleString()}</td>
                        <td>{s.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="stitch-panel panel-section">
            <div className="section-heading-row">
              <h3>Ledger</h3>
              <div className="action-cluster">
                <select
                  aria-label="Ledger kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as 'points' | 'stamps' | 'xp' | 'badges')}
                >
                  <option value="points">Points</option>
                  <option value="stamps">Stamps</option>
                  <option value="xp">Explorer XP</option>
                  <option value="badges">Badges</option>
                </select>
                <input
                  type="text"
                  aria-label="Filter by source"
                  placeholder="Source…"
                  value={ledgerSource}
                  onChange={(e) => setLedgerSource(e.target.value)}
                />
                <input
                  type="text"
                  aria-label="Filter by user ID"
                  placeholder="User ID…"
                  value={ledgerUser}
                  onChange={(e) => setLedgerUser(e.target.value)}
                />
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Amount / Award</th>
                    <th>Source</th>
                    <th>Reason</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/users/${encodeURIComponent(row.user_id)}`}>{row.display_name}</Link>
                      </td>
                      <td>{row.award ?? (row.delta !== null && row.delta > 0 ? `+${row.delta}` : row.delta)}</td>
                      <td>{row.source}</td>
                      <td>{row.reason ?? '—'}</td>
                      <td>{formatShortDateTime(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {ledgerHasMore ? (
              <div className="plan117-load-more">
                <button type="button" className="button button-secondary" onClick={() => void loadLedger(ledgerCursor)}>
                  Load more
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
