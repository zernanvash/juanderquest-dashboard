import { useCallback, useEffect, useState } from 'react';
import { Bell, Download, RefreshCw, Save, Smartphone } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { PrintReport } from '../components/PrintReport';
import { downloadCsv } from '../utils/csv';
import { describeError } from '../utils/errors';

interface MobileAppOverview {
  observed_at: string;
  version: {
    version_name: string;
    version_code: number;
    build_number: number;
    commit_hash: string;
    changelog: string;
    download_url: string;
    published_at: string;
  };
  devices: {
    total_registered: number;
    active_7d: number;
    active_30d: number;
    latest_build: number;
    on_latest_count: number;
    on_latest_pct: number;
    by_build: Array<{ app_build: number; devices: number; active_7d: number; active_30d: number }>;
  };
  push_7d: {
    by_category: Array<{ category: string; sent: number; failed: number; skipped: number; total: number }>;
    totals: { sent: number; failed: number; skipped: number };
  };
  notification_preferences: {
    total_profiles: number;
    rates: {
      overtaken_pct: number;
      friend_activity_pct: number;
      social_pct: number;
      weekly_recap_pct: number;
      quiet_hours_pct: number;
    };
  };
  settings: {
    revision: number;
    app_min_supported_build: number;
    app_announcement_text: string;
    app_announcement_severity: 'info' | 'warning';
    app_announcement_until: string;
  };
}

export function MobileAppPage() {
  const [data, setData] = useState<MobileAppOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [minBuild, setMinBuild] = useState('1');
  const [bannerText, setBannerText] = useState('');
  const [bannerSeverity, setBannerSeverity] = useState<'info' | 'warning'>('info');
  const [bannerUntil, setBannerUntil] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<MobileAppOverview>('/admin/mobile-app/overview', { signal });
      setData(res);
      setMinBuild(String(res.settings.app_min_supported_build ?? 1));
      setBannerText(res.settings.app_announcement_text ?? '');
      setBannerSeverity(res.settings.app_announcement_severity === 'warning' ? 'warning' : 'info');
      setBannerUntil(res.settings.app_announcement_until ?? '');
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(describeError(cause, 'Unable to load mobile app management telemetry.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const parsedMinBuild = Number(minBuild);
  const validForm =
    data !== null &&
    Number.isInteger(parsedMinBuild) &&
    parsedMinBuild >= 1 &&
    bannerText.trim().length <= 140;

  const saveControls = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!data || !validForm) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await apiFetch('/admin/settings', {
        method: 'PUT',
        body: {
          expected_revision: data.settings.revision,
          reason: reason.trim() || 'Mobile app release floor & announcement update',
          changes: {
            app_min_supported_build: parsedMinBuild,
            app_announcement_text: bannerText.trim(),
            app_announcement_severity: bannerSeverity,
            app_announcement_until: bannerUntil.trim(),
          },
        },
      });
      setReason('');
      setNotice('Mobile app version floor and announcement banner saved and audited.');
      await load();
    } catch (cause) {
      setError(describeError(cause, 'Unable to update mobile app controls.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mobile app management"
        description="Aggregate APK adoption, device build breakdown, push health, and audited release controls. Individual devices or travelers are never identified."
        actions={
          <PrintReport
            title="Mobile app management report"
            onExportCsv={
              data
                ? () =>
                    downloadCsv(
                      'mobile-app-builds.csv',
                      ['App build', 'Registered devices', 'Active 7d', 'Active 30d'],
                      data.devices.by_build.map((b) => [b.app_build, b.devices, b.active_7d, b.active_30d]),
                    )
                : undefined
            }
            csvLabel="Export builds CSV"
          />
        }
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}
      {notice ? <div className="status-banner status-banner-success" role="status">{notice}</div> : null}

      {loading ? (
        <div className="stitch-panel loading-panel">Loading mobile app overview…</div>
      ) : !data ? null : (
        <>
          <section className="stitch-panel panel-section" aria-label="Released APK version">
            <div className="section-heading-row">
              <div>
                <h2 className="section-title"><Smartphone size={18} /> Latest released build</h2>
                <p className="section-description">
                  Published {new Date(data.version.published_at).toLocaleString()} · Commit <code>{data.version.commit_hash}</code>
                </p>
              </div>
              <div className="action-cluster">
                <a href={data.version.download_url} target="_blank" rel="noreferrer" className="button button-secondary">
                  <Download size={14} /> APK link
                </a>
                <button type="button" className="button button-secondary" onClick={() => void load()}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>
            <div className="metric-grid">
              <div className="metric-card"><span>Version name</span><strong>{data.version.version_name}</strong></div>
              <div className="metric-card"><span>Build / code</span><strong>{data.version.build_number} (v{data.version.version_code})</strong></div>
              <div className="metric-card"><span>Active devices</span><strong>{data.devices.total_registered}</strong></div>
              <div className="metric-card"><span>Active (7d / 30d)</span><strong>{data.devices.active_7d} / {data.devices.active_30d}</strong></div>
              <div className="metric-card"><span>On latest build</span><strong>{data.devices.on_latest_pct}% ({data.devices.on_latest_count})</strong></div>
            </div>
            <p className="destination-meta" style={{ marginTop: 10 }}>
              Changelog: {data.version.changelog}
            </p>
          </section>

          <section className="stitch-panel panel-section" aria-label="Devices by app build">
            <h2 className="section-title">Devices by build</h2>
            {data.devices.by_build.length === 0 ? (
              <p className="empty-state">No registered active Android devices yet.</p>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Build number</th>
                      <th>Registered devices</th>
                      <th>Active 7 days</th>
                      <th>Active 30 days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.devices.by_build.map((b) => (
                      <tr key={b.app_build}>
                        <td>Build {b.app_build}{b.app_build >= data.devices.latest_build ? ' (latest)' : ''}</td>
                        <td>{b.devices}</td>
                        <td>{b.active_7d}</td>
                        <td>{b.active_30d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Push deliveries and opt-ins">
            <h2 className="section-title"><Bell size={18} /> Push notifications (last 7 days)</h2>
            <div className="metric-grid">
              <div className="metric-card"><span>Sent</span><strong>{data.push_7d.totals.sent}</strong></div>
              <div className="metric-card"><span>Failed</span><strong>{data.push_7d.totals.failed}</strong></div>
              <div className="metric-card"><span>Skipped (quiet/cap)</span><strong>{data.push_7d.totals.skipped}</strong></div>
              <div className="metric-card"><span>Notification profiles</span><strong>{data.notification_preferences.total_profiles}</strong></div>
            </div>
            {data.push_7d.by_category.length > 0 ? (
              <div className="table-scroll" style={{ marginTop: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Sent</th>
                      <th>Failed</th>
                      <th>Skipped</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.push_7d.by_category.map((row) => (
                      <tr key={row.category}>
                        <td>{row.category.replace(/_/g, ' ')}</td>
                        <td>{row.sent}</td>
                        <td>{row.failed}</td>
                        <td>{row.skipped}</td>
                        <td>{row.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <p className="destination-meta" style={{ marginTop: 10 }}>
              Opt-in rates ({data.notification_preferences.total_profiles} profiles): Overtaken {data.notification_preferences.rates.overtaken_pct}% · Friend activity {data.notification_preferences.rates.friend_activity_pct}% · Social {data.notification_preferences.rates.social_pct}% · Weekly recap {data.notification_preferences.rates.weekly_recap_pct}% · Quiet hours enabled {data.notification_preferences.rates.quiet_hours_pct}%
            </p>
          </section>

          <section className="stitch-panel panel-section" aria-label="Release floor and in-app banner">
            <h2 className="section-title"><Save size={18} /> Minimum supported build & announcement banner</h2>
            <p className="section-description">
              Values below are returned publicly by <code>GET /api/v1/app/version</code> as <code>min_supported_build</code> and <code>announcement</code>. Broadcast push remains deferred until owner rules are defined.
            </p>
            <form onSubmit={(e) => void saveControls(e)} className="settings-grid">
              <label className="settings-field">
                Minimum supported build
                <input
                  type="number"
                  min={1}
                  max={999999}
                  value={minBuild}
                  onChange={(e) => setMinBuild(e.target.value)}
                />
              </label>
              <label className="settings-field">
                Announcement severity
                <select value={bannerSeverity} onChange={(e) => setBannerSeverity(e.target.value === 'warning' ? 'warning' : 'info')}>
                  <option value="info">info</option>
                  <option value="warning">warning</option>
                </select>
              </label>
              <label className="settings-field">
                Announcement text (max 140 chars, leave blank to clear)
                <input
                  value={bannerText}
                  maxLength={140}
                  onChange={(e) => setBannerText(e.target.value)}
                  placeholder="Scheduled maintenance window tonight at 11 PM PHT"
                />
              </label>
              <label className="settings-field">
                Announcement expires at (optional ISO timestamp)
                <input
                  value={bannerUntil}
                  maxLength={40}
                  onChange={(e) => setBannerUntil(e.target.value)}
                  placeholder="2026-12-01T15:00:00Z"
                />
              </label>
              <label className="settings-field">
                Audit note (optional)
                <input
                  value={reason}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason for raising min build or posting banner"
                />
              </label>
              <div className="form-actions">
                <button type="submit" className="button-approve" disabled={saving || !validForm}>
                  {saving ? 'Saving…' : 'Save mobile controls'}
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
