import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Info, RefreshCw } from 'lucide-react';
import { ApiError, apiFetch } from '../api/client';
import { describeError } from '../utils/errors';

interface MonthlyOverview {
  server_time: string;
  region: { key: string; label: string; timezone: string };
  view: 'open' | 'between';
  availability: { voting_enabled: boolean; reason: string | null };
  current: {
    id: string;
    slug: string;
    theme: string;
    status: string;
    opens_at: string;
    closes_at: string;
  } | null;
  next: { opens_at: string; closes_at: string; theme: string | null; schedule_status: string } | null;
  previous: {
    campaign_id: string;
    theme: string;
    period_start: string;
    opens_at: string;
    closes_at: string;
    finalized_at: string;
    valid_ballots: number;
    co_winner_ids: string[];
    period_label: string;
  } | null;
  notice: { code: string; message: string } | null;
}

const AVAILABILITY_LABELS: Record<string, string> = {
  SCHEDULE_PAUSED: 'Monthly schedule is paused',
  FEATURE_DISABLED: 'JuanChoice feature flag is disabled',
  WRITES_DISABLED: 'Voting writes are disabled on this server',
  PROGRESSION_DISABLED: 'Progression subsystem is disabled',
  NO_SCHEDULE: 'No monthly schedule has been created yet',
};

const formatManila = (value: string, timezone: string): string =>
  new Intl.DateTimeFormat('en-PH', {
    timeZone: timezone || 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

export function JuanChoiceOverviewPanel({ onFeatureDisabled }: { onFeatureDisabled?: () => void } = {}) {
  const [overview, setOverview] = useState<MonthlyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<MonthlyOverview>('/juanchoice/overview?region=pangasinan', { signal });
      setOverview(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (cause instanceof ApiError && cause.code === 'FEATURE_DISABLED') onFeatureDisabled?.();
      setError(describeError(cause, 'The effective voting window could not be loaded.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [onFeatureDisabled]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const timezone = overview?.region.timezone || 'Asia/Manila';

  return (
    <section className="stitch-panel jc-window" aria-labelledby="jc-window-title">
      <div className="jc-window-header">
        <h2 id="jc-window-title" className="jc-window-title">
          <CalendarClock size={17} aria-hidden="true" /> Server-effective voting window
        </h2>
        <button type="button" className="button-muted" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} aria-hidden="true" /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      {!overview && loading ? <p className="jc-window-muted">Reading the server schedule…</p> : null}

      {overview ? (
        <>
          <p className="jc-window-muted">
            {overview.region.label} · all times shown in {timezone} · server time {formatManila(overview.server_time, timezone)}
          </p>

          {overview.notice ? (
            <p className={`jc-window-notice${overview.notice.code === 'RESULTS_PENDING' ? ' is-pending' : ''}`}>
              <Info size={14} aria-hidden="true" /> {overview.notice.message}
            </p>
          ) : null}

          <div className="jc-window-grid">
            <article className="jc-window-card">
              <h3>Current round</h3>
              {overview.current ? (
                <>
                  <p className="jc-window-strong">{overview.current.theme}</p>
                  <p>{formatManila(overview.current.opens_at, timezone)} → {formatManila(overview.current.closes_at, timezone)}</p>
                  <p className="jc-window-muted">Status: {overview.current.status}</p>
                </>
              ) : (
                <p className="jc-window-muted">No round is open between scheduled windows.</p>
              )}
            </article>

            <article className="jc-window-card">
              <h3>Next scheduled round</h3>
              {overview.next ? (
                <>
                  <p className="jc-window-strong">{overview.next.theme || 'Theme to be selected'}</p>
                  <p>{formatManila(overview.next.opens_at, timezone)} → {formatManila(overview.next.closes_at, timezone)}</p>
                </>
              ) : (
                <p className="jc-window-muted">No upcoming round is scheduled.</p>
              )}
            </article>

            <article className="jc-window-card">
              <h3>Previous finalized result</h3>
              {overview.previous ? (
                <>
                  <p className="jc-window-strong">{overview.previous.period_label} · {overview.previous.theme}</p>
                  <p>
                    {overview.previous.valid_ballots} valid ballot{overview.previous.valid_ballots === 1 ? '' : 's'} ·{' '}
                    {overview.previous.co_winner_ids.length} co-winner{overview.previous.co_winner_ids.length === 1 ? '' : 's'}
                  </p>
                  <p className="jc-window-muted">Finalized {formatManila(overview.previous.finalized_at, timezone)}</p>
                </>
              ) : (
                <p className="jc-window-muted">Results will appear after the first community round.</p>
              )}
            </article>

            <article className="jc-window-card">
              <h3>Write availability</h3>
              <p className={overview.availability.voting_enabled ? 'good-text jc-window-strong' : 'warn-text jc-window-strong'}>
                {overview.availability.voting_enabled ? 'Voting writes enabled' : 'Voting writes disabled'}
              </p>
              <p className="jc-window-muted">
                {overview.availability.reason
                  ? AVAILABILITY_LABELS[overview.availability.reason] || overview.availability.reason
                  : 'All required server flags are active for this window.'}
              </p>
            </article>
          </div>

          <p className="jc-window-footnote">
            This panel is read-only. Rounds finalize through the existing scheduler and finalizer semantics; voted rounds are never
            moved by arbitrary date edits.
          </p>
        </>
      ) : null}
    </section>
  );
}
