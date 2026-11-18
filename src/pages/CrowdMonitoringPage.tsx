import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, Download, Flame, RefreshCw, Users } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageState';
import { useRouter } from '../router';
import { downloadCsv } from '../utils/csv';
import { describeError } from '../utils/errors';

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type SortField = 'verified_visits' | 'on_site_now' | 'interactions' | 'pressure_score' | 'dwell_minutes' | 'name';

function manilaYmd(offsetDays = 0): string {
  const target = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

function numericOrZero(val: number | '<3' | undefined): number {
  return typeof val === 'number' ? val : val === '<3' ? 1 : 0;
}

export function CrowdMonitoringPage() {
  const { scope } = useAuth();
  const { query, navigate } = useRouter();
  const isPlatform = Boolean(scope?.platform);

  const [preset, setPreset] = useState<Preset>(() => (query.get('range') as Preset) || 'month');
  const [from, setFrom] = useState<string>(() => query.get('from') || manilaYmd(-29));
  const [to, setTo] = useState<string>(() => query.get('to') || manilaYmd(0));
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>(
    () => (query.get('granularity') as 'day' | 'week' | 'month') || 'day',
  );
  const [municipality, setMunicipality] = useState(() => query.get('municipality') || '');
  const [category, setCategory] = useState(() => query.get('category') || '');
  const [search, setSearch] = useState(() => query.get('q') || '');
  const [onsiteHours, setOnsiteHours] = useState(() => Number(query.get('onsite_hours') || 2) || 2);
  const [includeTest, setIncludeTest] = useState(() => isPlatform && query.get('include_test') === 'true');
  const [selectedSpotId, setSelectedSpotId] = useState<string>(() => query.get('spot') || '');
  const [sortField, setSortField] = useState<SortField>('verified_visits');
  const [sortAsc, setSortAsc] = useState(false);

  const [overview, setOverview] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [spotDetail, setSpotDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const applyPreset = (next: Preset) => {
    setPreset(next);
    const today = manilaYmd(0);
    if (next === 'day') {
      setFrom(today);
      setTo(today);
      setGranularity('day');
    } else if (next === 'week') {
      setFrom(manilaYmd(-6));
      setTo(today);
      setGranularity('day');
    } else if (next === 'month') {
      setFrom(manilaYmd(-29));
      setTo(today);
      setGranularity('day');
    } else if (next === 'year') {
      setFrom(manilaYmd(-364));
      setTo(today);
      setGranularity('month');
    }
  };

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('range', preset);
    params.set('from', from);
    params.set('to', to);
    params.set('granularity', granularity);
    if (municipality) params.set('municipality', municipality);
    if (category) params.set('category', category);
    if (search.trim()) params.set('q', search.trim());
    if (onsiteHours !== 2) params.set('onsite_hours', String(onsiteHours));
    if (isPlatform && includeTest) params.set('include_test', 'true');
    if (selectedSpotId) params.set('spot', selectedSpotId);
    navigate(`/insights/crowd?${params.toString()}`, { replace: true });
  }, [preset, from, to, granularity, municipality, category, search, onsiteHours, includeTest, selectedSpotId, isPlatform]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      from,
      to,
      granularity,
      onsite_hours: String(onsiteHours),
    });
    if (municipality) params.set('municipality', municipality);
    if (category) params.set('category', category);
    if (search.trim()) params.set('q', search.trim());
    if (isPlatform && includeTest) params.set('include_test', 'true');
    return params.toString();
  }, [from, to, granularity, municipality, category, search, onsiteHours, isPlatform, includeTest]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      if (selectedSpotId) {
        const detail = await apiFetch<any>(`/admin/crowd/spots/${encodeURIComponent(selectedSpotId)}?${queryString}`, {
          signal,
        });
        setSpotDetail(detail);
        setHeatmap(detail?.heatmap ?? []);
      } else {
        setSpotDetail(null);
        const [ov, hm] = await Promise.all([
          apiFetch<any>(`/admin/crowd/overview?${queryString}`, { signal }),
          apiFetch<{ cells: any[] }>(`/admin/crowd/heatmap?${queryString}`, { signal }),
        ]);
        setOverview(ov);
        setHeatmap(hm?.cells ?? []);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(describeError(cause, 'Unable to load crowd monitoring analytics.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [queryString, selectedSpotId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeData = spotDetail || overview;
  const kpis = activeData?.kpis;
  const timeseries: any[] = activeData?.timeseries ?? [];
  const topDestinations: any[] = overview?.top_destinations ?? [];

  const sortedDestinations = useMemo(() => {
    const copy = [...topDestinations];
    copy.sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = numericOrZero(a[sortField]);
      const bv = numericOrZero(b[sortField]);
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [topDestinations, sortField, sortAsc]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortAsc((prev) => !prev);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const maxBucketVisits = useMemo(
    () => Math.max(1, ...timeseries.map((b) => Math.max(numericOrZero(b.verified_visits), numericOrZero(b.interactions)))),
    [timeseries],
  );
  const maxHeat = useMemo(() => Math.max(1, ...heatmap.map((c) => numericOrZero(c.count))), [heatmap]);

  const exportCsv = () => {
    if (spotDetail) {
      downloadCsv(
        `crowd-spot-${selectedSpotId}-${from}-to-${to}.csv`,
        ['Bucket', 'Verified visits', 'Unique visitors', 'Interactions', 'Planning to go', 'Trail check-ins', 'Proofs'],
        timeseries.map((b) => [
          b.bucket,
          b.verified_visits,
          b.unique_visitors,
          b.interactions,
          b.planning_to_go,
          b.trail_checkins,
          b.proofs,
        ]),
      );
      return;
    }
    downloadCsv(
      `crowd-overview-${from}-to-${to}.csv`,
      [
        'Destination',
        'Municipality',
        'Category',
        'Capacity band',
        'Crowd status',
        'Pressure score',
        'Verified visits',
        'Unique visitors',
        'On-site now',
        'Interactions',
        'Planning to go',
        'Trail check-ins',
        'Avg dwell (min)',
      ],
      sortedDestinations.map((d) => [
        d.name,
        d.municipality,
        d.category,
        d.crowd_capacity_band,
        d.crowd_status,
        d.pressure_score,
        d.verified_visits,
        d.unique_visitors,
        d.on_site_now,
        d.interactions,
        d.planning_to_go,
        d.trail_checkins,
        d.dwell_minutes,
      ]),
    );
  };

  const dowRows = [0, 1, 2, 3, 4, 5, 6];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div>
      <PageHeader
        title={spotDetail ? `Crowd monitoring · ${spotDetail.spot?.name || selectedSpotId}` : 'Crowd monitoring'}
        description="Aggregate traffic, on-site activity, conversion funnel, dwell proxy, and Manila-time capacity peaks. Individual travelers are never identified."
      />

      <section className="stitch-panel panel-section" aria-label="Crowd filters">
        <div className="section-heading-row">
          <div className="filter-row">
            {(['day', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                className={`filter-chip ${preset === p ? 'is-active' : ''}`}
                onClick={() => applyPreset(p)}
              >
                {p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'Custom'}
              </button>
            ))}
          </div>
          <div className="action-cluster">
            {selectedSpotId && (
              <button type="button" className="button button-secondary" onClick={() => setSelectedSpotId('')}>
                <ArrowLeft size={14} /> All destinations
              </button>
            )}
            <button type="button" className="button button-secondary" onClick={exportCsv} disabled={!activeData}>
              <Download size={14} /> Export CSV
            </button>
            <button type="button" className="button button-secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        <div className="settings-grid" style={{ marginTop: 12 }}>
          <label className="settings-field">
            From (Manila date)
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPreset('custom');
                setFrom(e.target.value);
              }}
            />
          </label>
          <label className="settings-field">
            To (Manila date)
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPreset('custom');
                setTo(e.target.value);
              }}
            />
          </label>
          <label className="settings-field">
            Bucket granularity
            <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
            </select>
          </label>
          <label className="settings-field">
            On-site window (hours)
            <select value={onsiteHours} onChange={(e) => setOnsiteHours(Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((h) => (
                <option key={h} value={h}>
                  Last {h} h
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            Municipality
            <select value={municipality} onChange={(e) => setMunicipality(e.target.value)}>
              <option value="">All municipalities</option>
              {(overview?.filter_options?.municipalities ?? []).map((m: string) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {(overview?.filter_options?.categories ?? []).map((c: string) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="settings-field">
            Destination search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by spot or town…" />
          </label>
          {isPlatform && (
            <label className="checkbox-inline" style={{ alignSelf: 'end', paddingBottom: 8 }}>
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
              Include test data
            </label>
          )}
        </div>
      </section>

      {error && (
        <div className="load-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {loading && !activeData ? (
        <p className="loading-panel">Loading crowd monitoring metrics…</p>
      ) : activeData && kpis ? (
        <>
          {activeData.privacy_masked && (
            <div className="status-banner" role="status">
              <strong>Area privacy protection active:</strong>
              <span>Buckets with 1–2 visitors are masked as &lt;3.</span>
            </div>
          )}

          <section className="stitch-panel panel-section" aria-label="Crowd KPIs">
            <div className="metric-grid">
              <div className="metric-card">
                <span>Unique visitors</span>
                <strong>{kpis.unique_visitors}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.unique_visitors ?? 0}%</small>
              </div>
              <div className="metric-card">
                <span>Verified visits</span>
                <strong>{kpis.verified_visits}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.verified_visits ?? 0}%</small>
              </div>
              <div className="metric-card">
                <span>Currently on site ({onsiteHours}h)</span>
                <strong>{kpis.on_site_now}</strong>
                <small>Trail check-ins: {kpis.trail_checkins}</small>
              </div>
              <div className="metric-card">
                <span>Interactions</span>
                <strong>{kpis.interactions}</strong>
                <small>Planning to go: {kpis.planning_to_go}</small>
              </div>
              <div className="metric-card">
                <span>Proofs (App / Pend / Rej)</span>
                <strong>{kpis.proofs.approved} / {kpis.proofs.pending} / {kpis.proofs.rejected}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.interactions ?? 0}% interactions</small>
              </div>
              <div className="metric-card">
                <span>Busiest hour / day</span>
                <strong>{kpis.busiest_hour !== null ? `${String(kpis.busiest_hour).padStart(2, '0')}:00` : '—'} · {kpis.busiest_day || '—'}</strong>
                <small>Avg dwell proxy: {activeData.average_dwell_minutes ?? 0} min</small>
              </div>
            </div>

            <div className="metric-grid" style={{ marginTop: 12 }}>
              <div className="metric-card">
                <span>New vs returning</span>
                <strong>{activeData.new_vs_returning?.new_visitors ?? 0} / {activeData.new_vs_returning?.returning_visitors ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span>Locals vs visitors</span>
                <strong>{activeData.locals_vs_visitors?.locals ?? 0} / {activeData.locals_vs_visitors?.visitors ?? 0}</strong>
                <small>Unknown town: {activeData.locals_vs_visitors?.unknown ?? 0}</small>
              </div>
              <div className="metric-card">
                <span>Conversion funnel</span>
                <strong>{activeData.conversion_funnel?.views ?? 0} → {activeData.conversion_funnel?.directions ?? 0} → {activeData.conversion_funnel?.verified_visits ?? 0}</strong>
                <small>View→Dir {activeData.conversion_funnel?.view_to_directions_pct ?? 0}% · View→Visit {activeData.conversion_funnel?.view_to_visit_pct ?? 0}%</small>
              </div>
            </div>
          </section>

          {(activeData.peak_capacity_alerts ?? []).length > 0 && (
            <section className="stitch-panel panel-section" aria-label="Peak capacity alerts">
              <h2 className="section-title"><Flame size={18} /> Peak capacity alerts ({activeData.peak_capacity_alerts.length})</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Destination</th>
                      <th>Manila hour</th>
                      <th>Pressure score</th>
                      <th>Capacity band (threshold)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.peak_capacity_alerts.slice(0, 15).map((a: any, i: number) => (
                      <tr key={`${a.spot_id}-${a.hour_bucket}-${i}`}>
                        <td>{a.spot_name}</td>
                        <td>{a.hour_bucket}</td>
                        <td><strong>{a.pressure_score}</strong></td>
                        <td>{a.capacity_band} (≥ {a.threshold})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="stitch-panel panel-section" aria-label="Traffic over time">
            <h2 className="section-title"><Activity size={18} /> Visits &amp; interactions ({granularity})</h2>
            {timeseries.length === 0 ? (
              <p className="empty-state">No activity recorded in this window.</p>
            ) : (
              <div className="bar-chart">
                {timeseries.map((row) => {
                  const v = numericOrZero(row.verified_visits);
                  const inter = numericOrZero(row.interactions);
                  return (
                    <div key={row.bucket} className="bar-row">
                      <span className="bar-label">{row.bucket}</span>
                      <div className="bar-track">
                        <div className="bar-fill bar-fill-primary" style={{ width: `${Math.round((v / maxBucketVisits) * 100)}%` }} title={`Visits: ${row.verified_visits}`} />
                        <div className="bar-fill bar-fill-secondary" style={{ width: `${Math.round((inter / maxBucketVisits) * 100)}%` }} title={`Interactions: ${row.interactions}`} />
                      </div>
                      <span className="bar-value">{row.verified_visits}v · {row.interactions}i</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Hour by day heatmap">
            <h2 className="section-title"><Users size={18} /> Manila hour × day-of-week heatmap</h2>
            <div className="table-scroll">
              <table className="heatmap-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    {hours.map((h) => (
                      <th key={h}>{String(h).padStart(2, '0')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dowRows.map((dow) => {
                    const rowCells = heatmap.filter((c) => c.dow === dow);
                    const label = rowCells[0]?.day_label ?? String(dow);
                    return (
                      <tr key={dow}>
                        <th>{label}</th>
                        {hours.map((h) => {
                          const cell = rowCells.find((c) => c.hour === h);
                          const val = cell?.count ?? 0;
                          const alpha = val === 0 ? 0.04 : Math.min(0.9, 0.16 + (numericOrZero(val) / maxHeat) * 0.74);
                          return (
                            <td
                              key={h}
                              style={{ backgroundColor: `rgba(45, 106, 79, ${alpha})`, color: alpha > 0.5 ? '#fff' : '#1b1c1a' }}
                              title={`${label} ${String(h).padStart(2, '0')}:00 — ${val}`}
                            >
                              {val === 0 ? '' : val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {spotDetail ? (
            <section className="stitch-panel panel-section" aria-label="Crowd status timeline">
              <h2 className="section-title">Crowd status timeline</h2>
              {(spotDetail.crowd_status_timeline ?? []).length === 0 ? (
                <p className="empty-state">No pressure timeline rows in this range.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Manila day</th>
                        <th>Pressure score</th>
                        <th>Busy threshold</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spotDetail.crowd_status_timeline.map((r: any) => (
                        <tr key={r.bucket}>
                          <td>{r.bucket}</td>
                          <td>{r.pressure_score}</td>
                          <td>{r.threshold}</td>
                          <td><span className={`pill ${r.status === 'estimated_busy' ? 'pill-danger' : r.status === 'moderate' ? 'pill-warn' : 'pill-success'}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <>
              <section className="stitch-panel panel-section" aria-label="Category breakdown">
                <h2 className="section-title">Category breakdown</h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Destinations</th>
                        <th>Verified visits</th>
                        <th>Interactions</th>
                        <th>On-site now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview?.category_breakdown ?? []).map((c: any) => (
                        <tr key={c.category}>
                          <td>{c.category}</td>
                          <td>{c.spots}</td>
                          <td>{c.verified_visits}</td>
                          <td>{c.interactions}</td>
                          <td>{c.on_site_now}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="stitch-panel panel-section" aria-label="Top destinations">
                <h2 className="section-title">Destinations traffic ({sortedDestinations.length})</h2>
                <p className="section-description">Click any destination row to drill down into its crowd timeline and funnel.</p>
                {sortedDestinations.length === 0 ? (
                  <p className="empty-state">No destinations match the current filters.</p>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('name')}>Destination</button></th>
                          <th>Crowd now</th>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('pressure_score')}>Pressure</button></th>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('verified_visits')}>Verified visits</button></th>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('on_site_now')}>On-site now</button></th>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('interactions')}>Interactions</button></th>
                          <th>Plan to go</th>
                          <th>Trail check-ins</th>
                          <th><button type="button" className="sort-header" onClick={() => toggleSort('dwell_minutes')}>Dwell (min)</button></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedDestinations.map((d) => (
                          <tr key={d.spot_id} onClick={() => setSelectedSpotId(d.spot_id)} style={{ cursor: 'pointer' }}>
                            <td>
                              <strong>{d.name}</strong>
                              <small>{d.municipality} · {d.category}{d.recommendation_suppressed ? ' · SUPPRESSED' : ''}</small>
                            </td>
                            <td>
                              <span className={`pill ${d.crowd_status === 'estimated_busy' ? 'pill-danger' : d.crowd_status === 'moderate' ? 'pill-warn' : ''}`}>
                                {d.crowd_status}
                              </span>
                              <small>{d.crowd_capacity_band} ({d.crowd_confidence})</small>
                            </td>
                            <td>{d.pressure_score}</td>
                            <td>{d.verified_visits}</td>
                            <td>{d.on_site_now}</td>
                            <td>{d.interactions}</td>
                            <td>{d.planning_to_go}</td>
                            <td>{d.trail_checkins}</td>
                            <td>{d.dwell_minutes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
