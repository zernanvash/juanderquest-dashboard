import React, { useEffect, useState, useMemo } from 'react';
import { BarChart3, TrendingUp, Users, MousePointerClick, Eye, Compass, Calendar, ArrowUpRight } from 'lucide-react';

interface Summary {
  days: number;
  totalViews: number;
  uniqueSessions: number;
  ctaClicks: number;
  topPages: { path: string; views: number }[];
  topCtas: { label: string; clicks: number }[];
  daily: { date: string; views: number; sessions: number }[];
}

export function WebAnalyticsDashboard({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/v1/admin/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          onUnauthorized();
          return;
        }
        const body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.error?.message || 'Unable to load analytics.');
        setData(body.data);
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') {
          setError(reason instanceof Error ? reason.message : 'Unable to load analytics.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [days, token, onUnauthorized]);

  // SVG Chart Geometry calculations
  const chartData = useMemo(() => {
    if (!data || !data.daily || data.daily.length === 0) return null;
    const items = data.daily;
    const maxVal = Math.max(...items.map((d) => Math.max(d.views, d.sessions)), 10);
    const chartWidth = 700;
    const chartHeight = 220;
    const padX = 40;
    const padY = 30;
    const plotW = chartWidth - padX * 2;
    const plotH = chartHeight - padY * 2;

    const points = items.map((d, i) => {
      const x = items.length === 1 ? chartWidth / 2 : padX + (i / (items.length - 1)) * plotW;
      const yViews = chartHeight - padY - (d.views / maxVal) * plotH;
      const ySessions = chartHeight - padY - (d.sessions / maxVal) * plotH;
      return { x, yViews, ySessions, ...d };
    });

    // Generate SVG path strings
    const viewsLine = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.yViews.toFixed(1)}`, '');
    const viewsArea = `${viewsLine} L ${points[points.length - 1].x.toFixed(1)} ${chartHeight - padY} L ${points[0].x.toFixed(1)} ${chartHeight - padY} Z`;
    const sessionsLine = points.reduce((acc, p, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.ySessions.toFixed(1)}`, '');

    return { points, maxVal, chartWidth, chartHeight, padX, padY, plotH, viewsLine, viewsArea, sessionsLine };
  }, [data]);

  const conversionRate = useMemo(() => {
    if (!data || data.uniqueSessions === 0) return 0;
    return Number(((data.ctaClicks / data.uniqueSessions) * 100).toFixed(1));
  }, [data]);

  const maxPageViews = useMemo(() => {
    if (!data || !data.topPages.length) return 1;
    return Math.max(...data.topPages.map((p) => p.views), 1);
  }, [data]);

  const maxCtaClicks = useMemo(() => {
    if (!data || !data.topCtas.length) return 1;
    return Math.max(...data.topCtas.map((c) => c.clicks), 1);
  }, [data]);

  return (
    <section aria-labelledby="analytics-heading">
      {/* Header and Filter Selector */}
      <div className="analytics-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h2 id="analytics-heading" style={{ fontSize: '24px', fontWeight: 800, color: '#582F0E', margin: 0 }}>
            Traveler Web Analytics
          </h2>
          <p style={{ fontSize: '13px', color: '#514532', margin: '4px 0 0 0' }}>
            First-party aggregate usage metrics across <code style={{ color: '#2D6A4F', background: '#D8F3DC', padding: '2px 6px', borderRadius: '4px' }}>juanderquest.app</code>.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '13px', fontWeight: 700, color: '#582F0E', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Calendar size={16} />
            Reporting window:
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                marginLeft: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #D5C4AC',
                background: '#FFFFFF',
                color: '#582F0E',
                fontWeight: 700,
                fontSize: '13px',
              }}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
        </div>
      </div>

      {error && <div className="load-error" role="alert">{error}</div>}

      {loading ? (
        <div className="stitch-panel loading-panel" aria-live="polite" style={{ padding: '40px', textAlign: 'center' }}>
          Loading visual analytics…
        </div>
      ) : !data ? null : (
        <>
          {/* Top Level Visual KPI Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* Total Page Views */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: '#D8F3DC',
                  color: '#2D6A4F',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Eye size={24} />
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Total Page Views
                </span>
                <strong style={{ fontSize: '24px', fontWeight: 800, color: '#582F0E' }}>
                  {data.totalViews.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Unique Sessions */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: '#FEF3C7',
                  color: '#7D5800',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Users size={24} />
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Unique Travelers
                </span>
                <strong style={{ fontSize: '24px', fontWeight: 800, color: '#582F0E' }}>
                  {data.uniqueSessions.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Total CTA Clicks */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: '#E0E7FF',
                  color: '#4338CA',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <MousePointerClick size={24} />
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Action Intent Clicks
                </span>
                <strong style={{ fontSize: '24px', fontWeight: 800, color: '#582F0E' }}>
                  {data.ctaClicks.toLocaleString()}
                </strong>
              </div>
            </div>

            {/* Conversion Rate Ring */}
            <div
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '16px',
                padding: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: '#FCE7F3',
                  color: '#BE185D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <TrendingUp size={24} />
              </div>
              <div>
                <span style={{ fontSize: '11px', color: '#837560', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Intent Conversion
                </span>
                <strong style={{ fontSize: '24px', fontWeight: 800, color: '#582F0E' }}>
                  {conversionRate}%
                </strong>
              </div>
            </div>
          </div>

          {/* Interactive SVG Daily Activity Area Chart */}
          <article
            style={{
              background: '#FFFFFF',
              border: '1px solid #E3DFD5',
              borderRadius: '20px',
              padding: '24px',
              marginBottom: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#582F0E', margin: 0 }}>
                  Daily Activity Timeline
                </h3>
                <p style={{ fontSize: '12px', color: '#837560', margin: '2px 0 0 0' }}>
                  Trend comparison of Page Views vs Unique Sessions over the reporting window.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '16px', fontSize: '12px', fontWeight: 700 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2D6A4F' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#2D6A4F' }} />
                  Page Views
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#FFB703' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#FFB703' }} />
                  Unique Sessions
                </span>
              </div>
            </div>

            {chartData && (
              <div style={{ position: 'relative', width: '100%', overflowX: 'auto' }}>
                <svg
                  viewBox={`0 0 ${chartData.chartWidth} ${chartData.chartHeight}`}
                  style={{ width: '100%', height: 'auto', minWidth: '500px', display: 'block' }}
                >
                  <defs>
                    <linearGradient id="viewsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2D6A4F" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2D6A4F" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                    const y = chartData.chartHeight - chartData.padY - pct * chartData.plotH;
                    const val = Math.round(pct * chartData.maxVal);
                    return (
                      <g key={idx}>
                        <line x1={chartData.padX} y1={y} x2={chartData.chartWidth - chartData.padX} y2={y} stroke="#F0EFEA" strokeWidth="1" />
                        <text x={chartData.padX - 8} y={y + 3} fontSize="9" fill="#9CA3AF" textAnchor="end">{val}</text>
                      </g>
                    );
                  })}

                  {/* Views Area Fill */}
                  <path d={chartData.viewsArea} fill="url(#viewsAreaGrad)" />

                  {/* Views Line */}
                  <path d={chartData.viewsLine} fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Sessions Line */}
                  <path d={chartData.sessionsLine} fill="none" stroke="#FFB703" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                  {/* Data Points */}
                  {chartData.points.map((p, i) => {
                    const isHovered = hoveredIndex === i;
                    return (
                      <g
                        key={i}
                        onMouseEnter={() => setHoveredIndex(i)}
                        onMouseLeave={() => setHoveredIndex(null)}
                        style={{ cursor: 'pointer' }}
                      >
                        {/* Hover vertical guide */}
                        {isHovered && (
                          <line
                            x1={p.x}
                            y1={chartData.padY}
                            x2={p.x}
                            y2={chartData.chartHeight - chartData.padY}
                            stroke="#582F0E"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                          />
                        )}
                        {/* Views Circle */}
                        <circle
                          cx={p.x}
                          cy={p.yViews}
                          r={isHovered ? 5.5 : 3.5}
                          fill="#FFFFFF"
                          stroke="#2D6A4F"
                          strokeWidth="2.5"
                        />
                        {/* Sessions Circle */}
                        <circle
                          cx={p.x}
                          cy={p.ySessions}
                          r={isHovered ? 5 : 3}
                          fill="#FFFFFF"
                          stroke="#FFB703"
                          strokeWidth="2"
                        />
                      </g>
                    );
                  })}
                </svg>

                {/* Floating Tooltip Card on Hover */}
                {hoveredIndex !== null && chartData.points[hoveredIndex] && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      left: `min(calc(${chartData.points[hoveredIndex].x / chartData.chartWidth * 100}% - 70px), 80%)`,
                      background: 'rgba(27, 28, 26, 0.92)',
                      color: '#FFFFFF',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      pointerEvents: 'none',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.25)',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ fontWeight: 800, marginBottom: '4px', color: '#FFB703' }}>
                      {chartData.points[hoveredIndex].date}
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <span>Views: <strong style={{ color: '#48C71D' }}>{chartData.points[hoveredIndex].views}</strong></span>
                      <span>Sessions: <strong style={{ color: '#FFB703' }}>{chartData.points[hoveredIndex].sessions}</strong></span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </article>

          {/* Visual Distribution Graphs for Top Pages and Top CTAs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '24px',
              marginBottom: '24px',
            }}
          >
            {/* Top Visited Pages Horizontal Bar Chart */}
            <article
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#582F0E', margin: 0 }}>
                  Top Pages by Views
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#2D6A4F', background: '#D8F3DC', padding: '3px 8px', borderRadius: '6px' }}>
                  Traffic Share
                </span>
              </div>

              {data.topPages.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#837560' }}>No page views recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {data.topPages.map((item, index) => {
                    const widthPct = Math.round((item.views / maxPageViews) * 100);
                    return (
                      <div key={item.path}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: '#582F0E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', background: '#FAF9F5', border: '1px solid #D5C4AC', padding: '1px 5px', borderRadius: '4px', color: '#837560' }}>
                              #{index + 1}
                            </span>
                            <code>{item.path}</code>
                          </span>
                          <span style={{ fontWeight: 800, color: '#2D6A4F' }}>
                            {item.views.toLocaleString()} views
                          </span>
                        </div>
                        <div style={{ height: '8px', width: '100%', background: '#F0EFEA', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${widthPct}%`,
                              background: '#2D6A4F',
                              borderRadius: '4px',
                              transition: 'width 0.4s ease-out',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>

            {/* Top Calls to Action (CTAs) Horizontal Bar Chart */}
            <article
              style={{
                background: '#FFFFFF',
                border: '1px solid #E3DFD5',
                borderRadius: '20px',
                padding: '24px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#582F0E', margin: 0 }}>
                  Top Calls to Action
                </h3>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#7D5800', background: '#FEF3C7', padding: '3px 8px', borderRadius: '6px' }}>
                  Conversion Actions
                </span>
              </div>

              {data.topCtas.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#837560' }}>No CTA clicks recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {data.topCtas.map((item, index) => {
                    const widthPct = Math.round((item.clicks / maxCtaClicks) * 100);
                    return (
                      <div key={item.label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: 700, color: '#582F0E', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '10px', background: '#FAF9F5', border: '1px solid #D5C4AC', padding: '1px 5px', borderRadius: '4px', color: '#837560' }}>
                              #{index + 1}
                            </span>
                            <span>{item.label.replace(/_/g, ' ')}</span>
                          </span>
                          <span style={{ fontWeight: 800, color: '#7D5800' }}>
                            {item.clicks.toLocaleString()} clicks
                          </span>
                        </div>
                        <div style={{ height: '8px', width: '100%', background: '#F0EFEA', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${widthPct}%`,
                              background: '#FFB703',
                              borderRadius: '4px',
                              transition: 'width 0.4s ease-out',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
