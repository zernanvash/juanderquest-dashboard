import { useCallback, useEffect, useState } from 'react';
import { Activity, PackageCheck, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { SystemStatus } from '../types';

const FLAG_LABELS: Record<string, string> = {
  progression_enabled: 'Progression',
  juanchoice_enabled: 'JuanChoice',
  juanchoice_writes_enabled: 'JuanChoice voting writes',
  juanchoice_promotion_enabled: 'JuanChoice promotion',
  marketplace_enabled: 'Marketplace',
  guest_login_enabled: 'Guest login',
  alpha_wallet_simulation_enabled: 'Alpha wallet simulation',
  demo_login_allowed: 'Demo login',
};

export function SystemStatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<SystemStatus>('/admin/system/status', { signal });
      setStatus(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Service status could not be loaded.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const tone = status?.service.ready ? (status.service.degraded ? 'status-pending' : 'status-approved') : 'status-rejected';

  return (
    <div>
      <PageHeader
        title="Service health"
        description="Read-only observation of effective service, release and runtime state. Deployment-owned values cannot be edited in the browser; secrets are never returned."
        actions={
          <button type="button" className="button-muted" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      {status ? (
        <>
          <p className="overview-timestamp" role="status">
            Observed at {new Date(status.observed_at).toLocaleString()} · readiness checked at{' '}
            {new Date(status.service.checked_at).toLocaleString()}
          </p>

          <div className="status-grid">
            <section className="stitch-panel status-card" aria-label="Service readiness">
              <h2 className="settings-section-title">
                <Server size={15} aria-hidden="true" /> Service readiness
              </h2>
              <p className={`status-pill ${tone} status-value`}>{status.service.status.replace(/_/g, ' ')}</p>
              <ul className="status-dependency-list">
                {Object.entries(status.service.dependencies).map(([name, dependency]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <span className={`${dependency.status === 'up' ? 'good-text' : dependency.status === 'degraded' ? 'warn-text' : 'bad-text'} status-dependency`}>
                      {dependency.status} · {dependency.latency_ms}ms{dependency.required ? ' · required' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="stitch-panel status-card" aria-label="Mobile release">
              <h2 className="settings-section-title">
                <PackageCheck size={15} aria-hidden="true" /> Mobile release ({status.release.channel})
              </h2>
              <div className="merchant-detail-grid">
                <div><span>Version</span><strong>{status.release.version_name}</strong></div>
                <div><span>Version code</span><strong>{status.release.version_code}</strong></div>
                <div><span>Commit</span><strong>{status.release.commit_hash}</strong></div>
                <div><span>Published</span><strong>{new Date(status.release.published_at).toLocaleDateString()}</strong></div>
                <div><span>Update policy</span><strong>{status.release.update_policy}</strong></div>
                <div><span>Min supported code</span><strong>{status.release.min_supported_version_code}</strong></div>
              </div>
            </section>

            <section className="stitch-panel status-card" aria-label="Runtime">
              <h2 className="settings-section-title">
                <Activity size={15} aria-hidden="true" /> Runtime
              </h2>
              <div className="merchant-detail-grid">
                <div><span>Environment</span><strong>{status.runtime.node_env}</strong></div>
                <div><span>Wallet auth mode</span><strong>{status.runtime.wallet_auth_mode}</strong></div>
                <div><span>Spot photo storage</span><strong>{status.runtime.spot_photo_storage}</strong></div>
                <div>
                  <span>Migration ledger</span>
                  <strong>
                    {status.runtime.migration_ledger.applied === null
                      ? `unavailable (of ${status.runtime.migration_ledger.total})`
                      : `${status.runtime.migration_ledger.applied}/${status.runtime.migration_ledger.total}${status.runtime.migration_ledger.up_to_date ? ' · up to date' : ' · behind'}`}
                  </strong>
                </div>
              </div>
            </section>

            <section className="stitch-panel status-card" aria-label="Effective feature flags">
              <h2 className="settings-section-title">
                <ShieldCheck size={15} aria-hidden="true" /> Effective feature flags
              </h2>
              <div className="flag-grid">
                {Object.entries(status.feature_flags).map(([flag, enabled]) => (
                  <div key={flag} className={`flag-chip ${enabled ? 'is-on' : 'is-off'}`}>
                    <span>{FLAG_LABELS[flag] ?? flag.replace(/_/g, ' ')}</span>
                    <strong>{enabled ? 'on' : 'off'}</strong>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <p className="page-footnote">{status.deployment_note}</p>
        </>
      ) : loading ? (
        <div className="stitch-panel loading-panel">Reading effective service state…</div>
      ) : null}
    </div>
  );
}
