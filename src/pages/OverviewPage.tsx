import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ClipboardCheck, Compass, Flag, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api/client';
import { Link } from '../router';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Spot, SpotReport, Submission } from '../types';

interface PendingAffiliateProjection {
  id: string;
  status: string;
}

interface ReadinessReport {
  status: 'ready' | 'degraded' | 'not_ready';
  ready: boolean;
  degraded: boolean;
  timestamp: string;
  dependencies: Record<string, { status: 'up' | 'down' | 'degraded'; latency_ms: number }>;
}

interface OverviewData {
  pendingSubmissions: number | null;
  destinationsNeedingAttention: number | null;
  affiliateQueue: number | null;
  openReports: number | null;
  errors: string[];
}

const AWAITING_AFFILIATE = new Set(['received', 'in_review', 'needs_changes']);

export function OverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const errors: string[] = [];
    const [submissions, spots, affiliates, reports, health] = await Promise.allSettled([
      apiFetch<Submission[]>('/admin/submissions?status=pending', { signal }),
      apiFetch<Spot[]>('/admin/spots', { signal }),
      apiFetch<PendingAffiliateProjection[]>('/admin/affiliate/applications', { signal }),
      apiFetch<SpotReport[]>('/admin/spot-reports', { signal }),
      fetch('/api/v1/ready', { signal }).then(async (response) => {
        const payload = (await response.json()) as ReadinessReport;
        return payload;
      }),
    ]);

    const countOf = <T,>(result: PromiseSettledResult<T[]>, label: string, filter?: (item: T) => boolean): number | null => {
      if (result.status === 'fulfilled') {
        return filter ? result.value.filter(filter).length : result.value.length;
      }
      errors.push(`${label} could not be loaded: ${describeError(result.reason)}`);
      return null;
    };

    const next: OverviewData = {
      pendingSubmissions: countOf(submissions, 'Pending submissions'),
      destinationsNeedingAttention: countOf(spots, 'Destinations', (spot) => spot.status !== 'published' || Boolean(spot.recommendation_suppressed)),
      affiliateQueue: countOf(affiliates, 'Affiliate applications', (application) => AWAITING_AFFILIATE.has(application.status)),
      openReports: countOf(reports, 'Destination reports', (report) => report.status === 'pending'),
      errors,
    };

    if (!signal?.aborted) {
      setData(next);
      if (health.status === 'fulfilled') {
        setReadiness(health.value);
        setReadinessError('');
      } else {
        setReadiness(null);
        setReadinessError(describeError(health.reason, 'Service readiness could not be checked.'));
      }
      setLastUpdated(new Date().toLocaleTimeString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const readinessTone = readiness ? (readiness.ready ? (readiness.degraded ? 'warn-text' : 'good-text') : 'bad-text') : 'warn-text';

  return (
    <div>
      <PageHeader
        title="Operations overview"
        description="Pending work queues and observable service state. Counts are fetched from the live API; unavailable sources are reported instead of assumed."
        actions={
          <button type="button" className="button-muted" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        }
      />

      {data?.errors.length ? (
        <div className="load-error" role="alert">
          {data.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <div className="overview-grid">
        <Link to="/submissions" className="stitch-card overview-card">
          <span className="overview-card-icon overview-icon-pending">
            <ClipboardCheck size={18} aria-hidden="true" />
          </span>
          <p className="overview-card-label">Pending proof submissions</p>
          <p className="overview-card-value">{loading && data === null ? '…' : data?.pendingSubmissions ?? 'Unavailable'}</p>
          <p className="overview-card-hint">Open the proof review queue</p>
        </Link>

        <Link to="/destinations" className="stitch-card overview-card">
          <span className="overview-card-icon overview-icon-review">
            <Compass size={18} aria-hidden="true" />
          </span>
          <p className="overview-card-label">Destinations needing attention</p>
          <p className="overview-card-value">{loading && data === null ? '…' : data?.destinationsNeedingAttention ?? 'Unavailable'}</p>
          <p className="overview-card-hint">Unpublished or recommendation-suppressed destinations</p>
        </Link>

        <Link to="/partners/affiliates" className="stitch-card overview-card">
          <span className="overview-card-icon overview-icon-affiliate">
            <Building2 size={18} aria-hidden="true" />
          </span>
          <p className="overview-card-label">Affiliate applications awaiting decision</p>
          <p className="overview-card-value">{loading && data === null ? '…' : data?.affiliateQueue ?? 'Unavailable'}</p>
          <p className="overview-card-hint">Received, in review or needing applicant changes</p>
        </Link>

        <Link to="/spot-reports" className="stitch-card overview-card">
          <span className="overview-card-icon overview-icon-report">
            <Flag size={18} aria-hidden="true" />
          </span>
          <p className="overview-card-label">Pending destination reports</p>
          <p className="overview-card-value">{loading && data === null ? '…' : data?.openReports ?? 'Unavailable'}</p>
          <p className="overview-card-hint">Read-only until a resolution policy exists</p>
        </Link>

        <div className="stitch-card overview-card">
          <span className={`overview-card-icon ${readiness?.ready ? 'overview-icon-ok' : 'overview-icon-warn'}`}>
            {readinessError || !readiness?.ready ? <AlertTriangle size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          </span>
          <p className="overview-card-label">API service</p>
          <p className={`overview-card-value ${readinessTone}`}>
            {readinessError ? 'Unreachable' : readiness ? readiness.status.replace(/_/g, ' ') : 'Checking…'}
          </p>
          <p className="overview-card-hint">
            {readiness
              ? Object.entries(readiness.dependencies)
                  .map(([name, dependency]) => `${name}: ${dependency.status}`)
                  .join(' · ')
              : readinessError || 'Readiness probe'}
          </p>
        </div>
      </div>

      <p className="overview-timestamp" role="status">
        {loading ? 'Refreshing live counts…' : lastUpdated ? `Counts observed at ${lastUpdated}.` : ''}
      </p>
    </div>
  );
}
