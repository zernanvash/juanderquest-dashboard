import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Flag,
  MapPin,
  RefreshCw,
  Route,
  ShieldAlert,
  Ticket,
  Vote,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { Link } from '../router';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { AdminQuizListItem, Quest, Spot, SpotReport, Submission, Voucher } from '../types';

interface PendingAffiliateProjection {
  id: string;
  status: string;
}

interface QuestAttemptProjection {
  id: string;
  status: string;
}

interface JuanChoiceOverviewProjection {
  active_campaign?: { id: string; theme: string; status: string; ballot_count?: number } | null;
  status?: string;
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
  pendingQuestAttempts: number | null;
  destinationsPublished: number | null;
  destinationsNeedingAttention: number | null;
  affiliateQueue: number | null;
  openReports: number | null;
  openPlazaFlags: number | null;
  pendingTrails: number | null;
  questsTotal: number | null;
  questsPublished: number | null;
  quizzesTotal: number | null;
  quizzesPublished: number | null;
  vouchersLive: number | null;
  vouchersPreview: number | null;
  juanChoicePulse: JuanChoiceOverviewProjection | null;
  errors: string[];
}

const AWAITING_AFFILIATE = new Set(['received', 'in_review', 'needs_changes']);

export function OverviewPage() {
  const { scope, selectedAreaId } = useAuth();
  const platform = Boolean(scope?.platform);
  const powers = new Set(scope?.grants.flatMap((grant) => grant.powers) ?? []);
  const canDestinations = platform || powers.has('destinations');
  const canQuestsQuizzes = platform || powers.has('quests_quizzes');
  const canMerchants = platform || powers.has('merchants_vouchers');
  const canAnalytics = platform || powers.has('analytics');

  const [data, setData] = useState<OverviewData | null>(null);
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [readinessError, setReadinessError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    const errors: string[] = [];
    const skip = Promise.resolve(null);

    const [
      submissions,
      questAttempts,
      spots,
      affiliates,
      reports,
      plazaFlags,
      trailQueue,
      quests,
      quizzes,
      vouchers,
      juanChoice,
      health,
    ] = await Promise.allSettled([
      platform ? apiFetch<Submission[]>('/admin/submissions?status=pending', { signal }) : skip,
      platform ? apiFetch<QuestAttemptProjection[]>('/admin/quest-attempts', { signal }) : skip,
      canDestinations ? apiFetch<Spot[]>(withArea('/admin/spots', selectedAreaId), { signal }) : skip,
      canMerchants
        ? apiFetch<PendingAffiliateProjection[]>(withArea('/admin/affiliate/applications', selectedAreaId), { signal })
        : skip,
      canDestinations ? apiFetch<SpotReport[]>(withArea('/admin/spot-reports', selectedAreaId), { signal }) : skip,
      platform ? apiFetch<unknown[]>('/admin/plaza/reports?status=open', { signal }) : skip,
      platform ? apiFetch<unknown[]>('/admin/trails/review', { signal }) : skip,
      canQuestsQuizzes ? apiFetch<Quest[]>(withArea('/admin/quests', selectedAreaId), { signal }) : skip,
      canQuestsQuizzes ? apiFetch<AdminQuizListItem[]>(withArea('/admin/quizzes', selectedAreaId), { signal }) : skip,
      canMerchants ? apiFetch<Voucher[]>(withArea('/admin/vouchers', selectedAreaId), { signal }) : skip,
      platform ? apiFetch<JuanChoiceOverviewProjection>('/juanchoice/overview', { signal }) : skip,
      platform
        ? fetch('/api/v1/ready', { signal }).then(async (response) => (await response.json()) as ReadinessReport)
        : skip,
    ]);

    const countOf = <T,>(
      result: PromiseSettledResult<T[] | null>,
      label: string,
      filter?: (item: T) => boolean,
    ): number | null => {
      if (result.status === 'fulfilled') {
        if (result.value === null) return null;
        return filter ? result.value.filter(filter).length : result.value.length;
      }
      errors.push(`${label} could not be loaded: ${describeError(result.reason)}`);
      return null;
    };

    const next: OverviewData = {
      pendingSubmissions: countOf(submissions, 'Pending submissions'),
      pendingQuestAttempts: countOf(
        questAttempts,
        'Quest attempt reviews',
        (item) => item.status === 'submitted' || item.status === 'needs_review',
      ),
      destinationsPublished: countOf(spots, 'Destinations', (spot) => spot.status === 'published'),
      destinationsNeedingAttention: countOf(
        spots,
        'Destinations',
        (spot) => spot.status !== 'published' || Boolean(spot.recommendation_suppressed),
      ),
      affiliateQueue: countOf(affiliates, 'Affiliate applications', (application) =>
        AWAITING_AFFILIATE.has(application.status),
      ),
      openReports: countOf(reports, 'Destination reports', (report) => report.status === 'pending'),
      openPlazaFlags: countOf(plazaFlags, 'Plaza moderation'),
      pendingTrails: countOf(trailQueue, 'Trail review queue'),
      questsTotal: countOf(quests, 'Quests'),
      questsPublished: countOf(quests, 'Quests', (quest) => quest.status === 'published'),
      quizzesTotal: countOf(quizzes, 'Cultural quizzes'),
      quizzesPublished: countOf(quizzes, 'Cultural quizzes', (item) => item.quiz.status === 'published'),
      vouchersLive: countOf(vouchers, 'Vouchers', (v) => (v.availability || 'live') === 'live'),
      vouchersPreview: countOf(vouchers, 'Vouchers', (v) => v.availability === 'preview'),
      juanChoicePulse: juanChoice.status === 'fulfilled' ? juanChoice.value : null,
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
  }, [platform, canDestinations, canQuestsQuizzes, canMerchants, selectedAreaId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const readinessTone = readiness ? (readiness.ready ? (readiness.degraded ? 'warn-text' : 'good-text') : 'bad-text') : 'warn-text';

  return (
    <div className="overview-command-center">
      <PageHeader
        title="Operations overview"
        description="Role-aware command center across moderation queues, catalog health, live voting, and service readiness."
        actions={
          <button type="button" className="button-muted" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
        }
      />

      {data?.errors.length ? (
        <div className="load-error" role="alert">
          {data.errors.map((error, index) => (
            <p key={`${error}-${index}`}>{error}</p>
          ))}
        </div>
      ) : null}

      <section className="overview-band" aria-labelledby="overview-band-queues">
        <h2 id="overview-band-queues" className="overview-band-title">Action required queues</h2>
        <div className="overview-grid">
          {platform ? (
            <Link to="/quest-reviews" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-pending">
                <Award size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Pending quest attempts</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.pendingQuestAttempts ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Multi-task evidence awaiting review</p>
            </Link>
          ) : null}

          {platform ? (
            <Link to="/submissions" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-pending">
                <ClipboardCheck size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Pending proof submissions</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.pendingSubmissions ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Legacy single-proof verification queue</p>
            </Link>
          ) : null}

          {canDestinations ? (
            <Link to="/spot-reports" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-report">
                <Flag size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Pending destination reports</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.openReports ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Mark them reviewed or dismissed</p>
            </Link>
          ) : null}

          {platform ? (
            <Link to="/plaza-moderation" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-report">
                <ShieldAlert size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Open Plaza flags</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.openPlazaFlags ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Reported traveler comments</p>
            </Link>
          ) : null}

          {canMerchants ? (
            <Link to="/partners/affiliates" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-affiliate">
                <Building2 size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Affiliate applications awaiting decision</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.affiliateQueue ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Received, in review or needing applicant changes</p>
            </Link>
          ) : null}

          {platform ? (
            <Link to="/trails" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-review">
                <Route size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Trails awaiting review</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.pendingTrails ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Human gate before publishing routes</p>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="overview-band" aria-labelledby="overview-band-catalog">
        <h2 id="overview-band-catalog" className="overview-band-title">Catalog & live pulse</h2>
        <div className="overview-grid">
          {canDestinations ? (
            <Link to="/destinations" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-review">
                <Compass size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Scoped destinations</p>
              <p className="overview-card-value">
                {loading && data === null ? '…' : data?.destinationsPublished ?? 'Unavailable'}
              </p>
              <p className="overview-card-hint">
                Published · {data?.destinationsNeedingAttention ?? 0} needing attention
              </p>
            </Link>
          ) : null}

          {canQuestsQuizzes ? (
            <Link to="/quests" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-ok">
                <MapPin size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Quests in area</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.questsTotal ?? 'Unavailable'}</p>
              <p className="overview-card-hint">{data?.questsPublished ?? 0} published</p>
            </Link>
          ) : null}

          {canQuestsQuizzes ? (
            <Link to="/quizzes" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-ok">
                <BookOpen size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Cultural quizzes</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.quizzesTotal ?? 'Unavailable'}</p>
              <p className="overview-card-hint">{data?.quizzesPublished ?? 0} published</p>
            </Link>
          ) : null}

          {canMerchants ? (
            <Link to="/partners/vouchers" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-affiliate">
                <Ticket size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">Merchant vouchers</p>
              <p className="overview-card-value">{loading && data === null ? '…' : data?.vouchersLive ?? 'Unavailable'}</p>
              <p className="overview-card-hint">Live · {data?.vouchersPreview ?? 0} preview offers</p>
            </Link>
          ) : null}

          {platform ? (
            <Link to="/juanchoice" className="stitch-card overview-card">
              <span className="overview-card-icon overview-icon-ok">
                <Vote size={18} aria-hidden="true" />
              </span>
              <p className="overview-card-label">JuanChoice live pulse</p>
              <p className="overview-card-value">
                {loading && data === null
                  ? '…'
                  : data?.juanChoicePulse?.active_campaign?.theme ?? 'Idle'}
              </p>
              <p className="overview-card-hint">
                {data?.juanChoicePulse?.active_campaign
                  ? `${data.juanChoicePulse.active_campaign.status} · ${data.juanChoicePulse.active_campaign.ballot_count ?? 0} ballots`
                  : 'No active voting round'}
              </p>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="overview-band" aria-labelledby="overview-band-actions">
        <h2 id="overview-band-actions" className="overview-band-title">Quick actions & service readiness</h2>
        <div className="overview-actions-strip">
          {canQuestsQuizzes ? (
            <Link to="/quizzes" className="button button-approve">+ Create / manage quizzes</Link>
          ) : null}
          {platform ? (
            <Link to="/quest-reviews" className="button button-secondary">Review quest attempts</Link>
          ) : null}
          {canDestinations ? (
            <Link to="/destinations" className="button button-secondary">Manage destinations</Link>
          ) : null}
          {canAnalytics ? (
            <Link to="/insights/analytics" className="button button-secondary">
              <BarChart3 size={14} aria-hidden="true" /> Analytics
            </Link>
          ) : null}
          {platform ? (
            <Link to="/juanchoice" className="button button-secondary">JuanChoice voting</Link>
          ) : null}
        </div>

        {platform ? (
          <div className="stitch-card overview-readiness-card">
            <div className="overview-readiness-head">
              <span className={`overview-card-icon ${readiness?.ready ? 'overview-icon-ok' : 'overview-icon-warn'}`}>
                {readinessError || !readiness?.ready ? (
                  <AlertTriangle size={18} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={18} aria-hidden="true" />
                )}
              </span>
              <div>
                <p className="overview-card-label">API service</p>
                <p className={`overview-card-value ${readinessTone}`}>
                  {readinessError ? 'Unreachable' : readiness ? readiness.status.replace(/_/g, ' ') : 'Checking…'}
                </p>
                <p className="overview-card-hint">
                  {readinessError ? readinessError : lastUpdated ? `Checked at ${lastUpdated}` : 'Waiting for readiness check'}
                </p>
              </div>
            </div>
            {readiness?.dependencies ? (
              <div className="overview-deps-list">
                {Object.entries(readiness.dependencies).map(([name, dep]) => (
                  <span key={name} className={`status-pill ${dep.status === 'up' ? 'status-approved' : 'status-pending'}`}>
                    {name}: {dep.status} ({dep.latency_ms}ms)
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
