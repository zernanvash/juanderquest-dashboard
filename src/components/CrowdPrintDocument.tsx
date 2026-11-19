import { Fragment } from 'react';

export interface CrowdPrintSnapshot {
  scopeLabel: string;
  provinceLabel: string;
  municipalityLabel: string;
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  onsiteHours: number;
  generatedAt: string;
  generatedBy: string;
  overview: any;
  heatmap: any[];
  suggestions: any[];
  spotDetail?: any | null;
}

function numericOrZero(val: number | '<3' | undefined | null): number {
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  return val === '<3' ? 1 : 0;
}

function displayMetric(val: number | '<3' | undefined | null): string {
  if (val === '<3') return '<3';
  if (typeof val === 'number' && Number.isFinite(val)) return val.toLocaleString();
  return '0';
}

export function CrowdPrintDocument({ snapshot }: { snapshot: CrowdPrintSnapshot | null }) {
  if (!snapshot) return null;

  const activeData = snapshot.spotDetail || snapshot.overview;
  if (!activeData || !activeData.kpis) return null;

  const kpis = activeData.kpis;
  const timeseries: any[] = activeData.timeseries ?? [];
  const heatmap: any[] = snapshot.heatmap ?? [];
  const destinations: any[] = snapshot.overview?.top_destinations ?? [];
  const areaBreakdown = snapshot.overview?.area_breakdown;
  const areaItems: any[] = areaBreakdown?.items ?? [];
  const categoryBreakdown: any[] = snapshot.overview?.category_breakdown ?? [];
  const alerts: any[] = activeData.peak_capacity_alerts ?? [];
  const suggestions: any[] = snapshot.suggestions ?? [];

  const maxBucket = Math.max(
    1,
    ...timeseries.map((row) => Math.max(numericOrZero(row.verified_visits), numericOrZero(row.interactions))),
  );
  const maxHeat = Math.max(1, ...heatmap.map((c) => numericOrZero(c.count)));
  const maxCatVisits = Math.max(1, ...categoryBreakdown.map((c) => numericOrZero(c.verified_visits)));

  // Group destinations alphabetically by municipality for clean Page 3+ ledger.
  const groupedDestinations = (() => {
    const groups = new Map<
      string,
      {
        municipality: string;
        province: string;
        rows: any[];
        visits: number;
        interactions: number;
        onsite: number;
        hasMasked: boolean;
      }
    >();
    const sorted = [...destinations].sort(
      (a, b) =>
        String(a.municipality || '').localeCompare(String(b.municipality || '')) ||
        numericOrZero(b.verified_visits) - numericOrZero(a.verified_visits) ||
        String(a.name || '').localeCompare(String(b.name || '')),
    );
    for (const d of sorted) {
      const muni = String(d.municipality || 'Unspecified municipality');
      const g = groups.get(muni) ?? {
        municipality: muni,
        province: String(d.province_name || snapshot.provinceLabel || ''),
        rows: [],
        visits: 0,
        interactions: 0,
        onsite: 0,
        hasMasked: false,
      };
      g.rows.push(d);
      if (d.verified_visits === '<3' || d.interactions === '<3' || d.on_site_now === '<3') {
        g.hasMasked = true;
      }
      g.visits += numericOrZero(d.verified_visits);
      g.interactions += numericOrZero(d.interactions);
      g.onsite += numericOrZero(d.on_site_now);
      groups.set(muni, g);
    }
    return [...groups.values()];
  })();

  const dowRows = [0, 1, 2, 3, 4, 5, 6];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const busySpotCount = destinations.filter((d) => d.crowd_status === 'estimated_busy').length;

  return (
    <article className="crowd-print-doc" aria-label="Printable crowd monitoring report">
      {/* PAGE 1 — EXECUTIVE OVERVIEW */}
      <section className="crowd-print-page crowd-print-page-overview" aria-label="Print Page 1 Overview">
        <header className="crowd-print-header">
          <div className="print-header-brand">
            <img src="/logo.png" alt="JuanderQuest" className="print-logo" />
            <div>
              <p className="print-record-kicker">JuanderQuest — official crowd monitoring record</p>
              <h1 className="print-report-title">Crowd Monitoring Report — {snapshot.scopeLabel}</h1>
            </div>
          </div>
          <div className="print-header-meta">
            <span>
              <strong>Period (PHT):</strong> {snapshot.from} to {snapshot.to}
            </span>
            <span>
              <strong>Granularity:</strong> {snapshot.granularity}
            </span>
            <span>
              <strong>On-site window:</strong> {snapshot.onsiteHours} h
            </span>
            <span>
              <strong>Generated:</strong> {snapshot.generatedAt}
            </span>
            <span>
              <strong>Prepared by:</strong> {snapshot.generatedBy}
            </span>
          </div>
          <div className="print-header-filters">
            <span>
              <strong>Scope:</strong> {snapshot.scopeLabel}
              {activeData.privacy_masked ? ' · Privacy mask active (<3 counts hidden)' : ''}
            </span>
            <span>
              <strong>Report structure:</strong> Page 1 Overview · Page 2 Graphs · Page 3+ Organized Numbers
            </span>
          </div>
        </header>

        <h2 className="crowd-print-section-title">1. Executive Overview</h2>

        <div className="crowd-print-kpi-grid">
          <div className="crowd-print-kpi">
            <span>Unique visitors</span>
            <strong>{displayMetric(kpis.unique_visitors)}</strong>
            <small>Prev Δ: {activeData.previous_period?.delta_pct?.unique_visitors ?? 0}%</small>
          </div>
          <div className="crowd-print-kpi">
            <span>Verified visits</span>
            <strong>{displayMetric(kpis.verified_visits)}</strong>
            <small>Prev Δ: {activeData.previous_period?.delta_pct?.verified_visits ?? 0}%</small>
          </div>
          <div className="crowd-print-kpi">
            <span>On-site now ({snapshot.onsiteHours}h)</span>
            <strong>{displayMetric(kpis.on_site_now)}</strong>
            <small>Trail check-ins: {displayMetric(kpis.trail_checkins)}</small>
          </div>
          <div className="crowd-print-kpi">
            <span>Interactions</span>
            <strong>{displayMetric(kpis.interactions)}</strong>
            <small>
              Plan to go: {displayMetric(kpis.planning_to_go)} · Prev Δ:{' '}
              {activeData.previous_period?.delta_pct?.interactions ?? 0}%
            </small>
          </div>
          <div className="crowd-print-kpi">
            <span>Proof submissions</span>
            <strong>
              {displayMetric(kpis.proofs?.approved)} / {displayMetric(kpis.proofs?.pending)} /{' '}
              {displayMetric(kpis.proofs?.rejected)}
            </strong>
            <small>Approved / Pending / Rejected</small>
          </div>
          <div className="crowd-print-kpi">
            <span>Peak hour / busiest day</span>
            <strong>
              {kpis.busiest_hour !== null ? `${String(kpis.busiest_hour).padStart(2, '0')}:00` : '—'} ·{' '}
              {kpis.busiest_day || '—'}
            </strong>
            <small>Avg dwell: {activeData.average_dwell_minutes ?? 0} min</small>
          </div>
        </div>

        <div className="crowd-print-kpi-grid crowd-print-kpi-grid-3">
          <div className="crowd-print-kpi">
            <span>New vs returning visitors</span>
            <strong>
              {displayMetric(activeData.new_vs_returning?.new_visitors)} /{' '}
              {displayMetric(activeData.new_vs_returning?.returning_visitors)}
            </strong>
            <small>First-time vs repeat explorers in window</small>
          </div>
          <div className="crowd-print-kpi">
            <span>Locals vs outside visitors</span>
            <strong>
              {displayMetric(activeData.locals_vs_visitors?.locals)} /{' '}
              {displayMetric(activeData.locals_vs_visitors?.visitors)}
            </strong>
            <small>Unknown home town: {displayMetric(activeData.locals_vs_visitors?.unknown)}</small>
          </div>
          <div className="crowd-print-kpi">
            <span>Conversion funnel</span>
            <strong>
              {displayMetric(activeData.conversion_funnel?.views)} →{' '}
              {displayMetric(activeData.conversion_funnel?.directions)} →{' '}
              {displayMetric(activeData.conversion_funnel?.verified_visits)}
            </strong>
            <small>
              View→Dir {activeData.conversion_funnel?.view_to_directions_pct ?? 0}% · View→Visit{' '}
              {activeData.conversion_funnel?.view_to_visit_pct ?? 0}%
            </small>
          </div>
        </div>

        <div className="crowd-print-summary-box">
          <h3>Operational summary &amp; highlights</h3>
          <ul>
            <li>
              <strong>Destinations in scope:</strong> {destinations.length} tracked (
              {groupedDestinations.length} municipalities/cities, {busySpotCount} currently flagged busy).
            </li>
            <li>
              <strong>Peak capacity alerts:</strong> {alerts.length} Manila-hour threshold crossings in period.
            </li>
            <li>
              <strong>Active crowd suggestions ({suggestions.length}):</strong>{' '}
              {suggestions.length === 0
                ? 'None active for this area.'
                : suggestions
                    .slice(0, 4)
                    .map((s) => `${s.spot_name} (${s.rule_label})`)
                    .join('; ')}
              {suggestions.length > 4 ? ` … +${suggestions.length - 4} more on Page 3+` : ''}
            </li>
          </ul>
        </div>
      </section>

      {/* PAGE 2 — GRAPHS & VISUAL ANALYTICS */}
      <section className="crowd-print-page crowd-print-page-graphs" aria-label="Print Page 2 Graphs">
        <div className="crowd-print-running-head">
          <span>JuanderQuest Crowd Monitoring · {snapshot.scopeLabel}</span>
          <span>
            {snapshot.from} to {snapshot.to}
          </span>
        </div>

        <h2 className="crowd-print-section-title">2. Graphs &amp; Visual Analytics</h2>

        <div className="crowd-print-panel">
          <h3>
            Visits &amp; interactions trend ({snapshot.granularity}) ·{' '}
            <span className="crowd-print-legend">
              <i className="crowd-print-swatch crowd-print-swatch-primary" /> Verified visits
              <i className="crowd-print-swatch crowd-print-swatch-secondary" /> Interactions
            </span>
          </h3>
          {timeseries.length === 0 ? (
            <p className="empty-state">No time-series activity recorded in this window.</p>
          ) : (
            <div className="bar-chart crowd-print-chart">
              {timeseries.slice(0, 31).map((row) => {
                const v = numericOrZero(row.verified_visits);
                const inter = numericOrZero(row.interactions);
                return (
                  <div key={row.bucket} className="bar-row">
                    <span className="bar-label">{row.bucket}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill bar-fill-primary"
                        style={{ width: `${Math.round((v / maxBucket) * 100)}%` }}
                      />
                      <div
                        className="bar-fill bar-fill-secondary"
                        style={{ width: `${Math.round((inter / maxBucket) * 100)}%` }}
                      />
                    </div>
                    <span className="bar-value">
                      {displayMetric(row.verified_visits)}v · {displayMetric(row.interactions)}i
                    </span>
                  </div>
                );
              })}
              {timeseries.length > 31 ? (
                <p className="section-description">
                  Showing first 31 chart buckets here; all {timeseries.length} buckets are listed numerically on Page 3+.
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="crowd-print-panel">
          <h3>Manila hour × day-of-week heatmap (PHT)</h3>
          <table className="heatmap-table crowd-print-heatmap">
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
                      const raw = cell?.count ?? 0;
                      const num = numericOrZero(raw);
                      const alpha = num === 0 ? 0.04 : Math.min(0.9, 0.16 + (num / maxHeat) * 0.74);
                      return (
                        <td
                          key={h}
                          style={{
                            backgroundColor: `rgba(45, 106, 79, ${alpha})`,
                            color: alpha > 0.5 ? '#ffffff' : '#1b1c1a',
                          }}
                        >
                          {raw === 0 ? '' : raw}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {categoryBreakdown.length > 0 ? (
          <div className="crowd-print-panel">
            <h3>Category traffic comparison</h3>
            <div className="bar-chart crowd-print-chart">
              {categoryBreakdown.map((c) => {
                const v = numericOrZero(c.verified_visits);
                return (
                  <div key={c.category} className="bar-row">
                    <span className="bar-label">{c.category}</span>
                    <div className="bar-track">
                      <div
                        className="bar-fill bar-fill-primary"
                        style={{ width: `${Math.round((v / maxCatVisits) * 100)}%` }}
                      />
                    </div>
                    <span className="bar-value">
                      {displayMetric(c.verified_visits)} visits ({c.spots} spots)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>

      {/* PAGE 3+ — ORGANIZED NUMBERS */}
      <section className="crowd-print-page crowd-print-page-numbers" aria-label="Print Page 3+ Organized Numbers">
        <div className="crowd-print-running-head">
          <span>JuanderQuest Crowd Monitoring · {snapshot.scopeLabel}</span>
          <span>
            {snapshot.from} to {snapshot.to}
          </span>
        </div>

        <h2 className="crowd-print-section-title">3. Organized Numerical Tables</h2>

        {!snapshot.spotDetail && areaItems.length > 0 ? (
          <div className="crowd-print-table-block">
            <h3>
              3.1 Traffic by {areaBreakdown?.level === 'province' ? 'province' : 'municipality / city'} (
              {areaItems.length})
            </h3>
            <table className="data-table crowd-print-table">
              <thead>
                <tr>
                  <th>{areaBreakdown?.level === 'province' ? 'Province' : 'Municipality / City'}</th>
                  {areaBreakdown?.level !== 'province' ? <th>Province</th> : null}
                  <th>Spots</th>
                  <th>Busy now</th>
                  <th>Unique visitors</th>
                  <th>Verified visits</th>
                  <th>Interactions</th>
                  <th>On-site now</th>
                </tr>
              </thead>
              <tbody>
                {areaItems.map((item) => (
                  <tr key={item.area_key}>
                    <td>
                      <strong>{item.area_name}</strong>
                    </td>
                    {areaBreakdown?.level !== 'province' ? <td>{item.province_name}</td> : null}
                    <td>{item.spots}</td>
                    <td>{item.busy_spots}</td>
                    <td>{displayMetric(item.unique_visitors)}</td>
                    <td>{displayMetric(item.verified_visits)}</td>
                    <td>{displayMetric(item.interactions)}</td>
                    <td>{displayMetric(item.on_site_now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!snapshot.spotDetail && categoryBreakdown.length > 0 ? (
          <div className="crowd-print-table-block">
            <h3>3.2 Category breakdown</h3>
            <table className="data-table crowd-print-table">
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
                {categoryBreakdown.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td>{c.spots}</td>
                    <td>{displayMetric(c.verified_visits)}</td>
                    <td>{displayMetric(c.interactions)}</td>
                    <td>{displayMetric(c.on_site_now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {snapshot.spotDetail ? (
          <div className="crowd-print-table-block">
            <h3>3.3 Destination crowd status timeline</h3>
            <table className="data-table crowd-print-table">
              <thead>
                <tr>
                  <th>Manila day</th>
                  <th>Pressure score</th>
                  <th>Busy threshold</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(snapshot.spotDetail.crowd_status_timeline ?? []).map((r: any) => (
                  <tr key={r.bucket}>
                    <td>{r.bucket}</td>
                    <td>{r.pressure_score}</td>
                    <td>{r.threshold}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="crowd-print-table-block">
            <h3>3.3 Destinations ledger grouped by municipality ({destinations.length})</h3>
            {groupedDestinations.length === 0 ? (
              <p className="empty-state">No destinations in selected geographic scope.</p>
            ) : (
              <table className="data-table crowd-print-table">
                <thead>
                  <tr>
                    <th>Destination</th>
                    <th>Category</th>
                    <th>Status (Band)</th>
                    <th>Pressure</th>
                    <th>Visits</th>
                    <th>Unique</th>
                    <th>On-site</th>
                    <th>Inter.</th>
                    <th>Plan</th>
                    <th>Trails</th>
                    <th>Dwell (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedDestinations.map((grp) => (
                    <Fragment key={`grp-${grp.municipality}`}>
                      <tr className="crowd-print-group-row">
                        <td colSpan={4}>
                          <strong>{grp.municipality}</strong>
                          {grp.province ? ` · ${grp.province}` : ''} ({grp.rows.length} spots)
                        </td>
                        <td>
                          <strong>{grp.hasMasked ? `${grp.visits}+` : grp.visits}</strong>
                        </td>
                        <td>—</td>
                        <td>
                          <strong>{grp.hasMasked ? `${grp.onsite}+` : grp.onsite}</strong>
                        </td>
                        <td>
                          <strong>{grp.hasMasked ? `${grp.interactions}+` : grp.interactions}</strong>
                        </td>
                        <td colSpan={3} />
                      </tr>
                      {grp.rows.map((d) => (
                        <tr key={d.spot_id}>
                          <td>
                            {d.name}
                            {d.recommendation_suppressed ? ' [SUPPRESSED]' : ''}
                          </td>
                          <td>{d.category}</td>
                          <td>
                            {d.crowd_status} ({d.crowd_capacity_band})
                          </td>
                          <td>{d.pressure_score}</td>
                          <td>{displayMetric(d.verified_visits)}</td>
                          <td>{displayMetric(d.unique_visitors)}</td>
                          <td>{displayMetric(d.on_site_now)}</td>
                          <td>{displayMetric(d.interactions)}</td>
                          <td>{displayMetric(d.planning_to_go)}</td>
                          <td>{displayMetric(d.trail_checkins)}</td>
                          <td>{d.dwell_minutes}</td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="crowd-print-table-block">
          <h3>3.4 Time-series numerical breakdown ({timeseries.length} buckets)</h3>
          <table className="data-table crowd-print-table">
            <thead>
              <tr>
                <th>Bucket</th>
                <th>Verified visits</th>
                <th>Unique visitors</th>
                <th>Interactions</th>
                <th>Plan to go</th>
                <th>Trail check-ins</th>
                <th>Proofs</th>
              </tr>
            </thead>
            <tbody>
              {timeseries.map((row) => (
                <tr key={row.bucket}>
                  <td>{row.bucket}</td>
                  <td>{displayMetric(row.verified_visits)}</td>
                  <td>{displayMetric(row.unique_visitors)}</td>
                  <td>{displayMetric(row.interactions)}</td>
                  <td>{displayMetric(row.planning_to_go)}</td>
                  <td>{displayMetric(row.trail_checkins)}</td>
                  <td>{displayMetric(row.proofs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {alerts.length > 0 || suggestions.length > 0 ? (
          <div className="crowd-print-table-block">
            <h3>3.5 Peak capacity alerts &amp; crowd-control suggestions</h3>
            {alerts.length > 0 ? (
              <table className="data-table crowd-print-table" style={{ marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th>Destination</th>
                    <th>Manila hour</th>
                    <th>Pressure</th>
                    <th>Band (threshold)</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((a, i) => (
                    <tr key={`${a.spot_id}-${a.hour_bucket}-${i}`}>
                      <td>{a.spot_name}</td>
                      <td>{a.hour_bucket}</td>
                      <td>{a.pressure_score}</td>
                      <td>
                        {a.capacity_band} (≥ {a.threshold})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            {suggestions.length > 0 ? (
              <table className="data-table crowd-print-table">
                <thead>
                  <tr>
                    <th>Destination</th>
                    <th>Municipality</th>
                    <th>Rule</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {suggestions.map((s) => (
                    <tr key={`${s.spot_id}:${s.suggestion_key}`}>
                      <td>{s.spot_name}</td>
                      <td>{s.municipality}</td>
                      <td>{s.rule_label}</td>
                      <td>{s.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}
      </section>
    </article>
  );
}
