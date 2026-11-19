import { useCallback, useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

/** v0.3.10: profile pictures go live instantly; travelers report them here. */
export interface AvatarReportGroup {
  user_id: string;
  avatar_url: string;
  display_name: string;
  handle: string | null;
  report_count: number;
  reasons: string[];
  first_reported_at: string;
  is_current: boolean;
}

const REASON_LABELS: Record<string, string> = {
  inappropriate: 'Inappropriate',
  impersonation: 'Not a person / impersonation',
  spam: 'Spam',
  other: 'Other',
};

export function AvatarReportsPage() {
  const [items, setItems] = useState<AvatarReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<{ items: AvatarReportGroup[] }>('/admin/avatar-reports', { signal });
      setItems(data?.items ?? []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load profile picture reports.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const resolve = async (userId: string, action: 'reset' | 'dismiss') => {
    try {
      setBusy(userId);
      await apiFetch(`/admin/avatar-reports/${encodeURIComponent(userId)}/resolve`, {
        method: 'POST',
        body: { action },
      });
      await load();
    } catch (cause) {
      setError(describeError(cause, action === 'reset' ? 'Failed to reset picture.' : 'Failed to dismiss reports.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="avatar-reports-page">
      <PageHeader
        title="Profile picture reports"
        description="Pictures go live instantly. Reset one to the default avatar, or dismiss the reports to keep it."
      />

      {error ? (
        <div className="load-error" role="alert" style={{ marginBottom: 16 }}>
          {error}{' '}
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="stitch-panel loading-panel">Loading profile picture reports…</div>
      ) : items.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <CheckCircle size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No open profile picture reports.</p>
        </div>
      ) : (
        <div className="report-grid">
          {items.map((item) => (
            <article key={`${item.user_id}:${item.avatar_url}`} className="stitch-card report-card">
              <div className="report-card-top">
                <span className="status-pill status-rejected">
                  {item.report_count} report{item.report_count === 1 ? '' : 's'}
                </span>
                {item.is_current ? null : <span className="status-pill">Already changed</span>}
              </div>
              <img
                src={item.avatar_url}
                alt={`Profile picture of ${item.display_name}`}
                width={120}
                height={120}
                style={{ objectFit: 'cover', borderRadius: 8, margin: '12px 0' }}
              />
              <h3>
                {item.display_name}
                {item.handle ? ` (@${item.handle})` : ''}
              </h3>
              <p>{(item.reasons ?? []).map((r) => REASON_LABELS[r] ?? r).join(', ')}</p>
              <div className="report-action-buttons">
                <button
                  type="button"
                  className="button button-danger"
                  disabled={busy === item.user_id}
                  onClick={() => void resolve(item.user_id, 'reset')}
                >
                  Reset picture
                </button>
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={busy === item.user_id}
                  onClick={() => void resolve(item.user_id, 'dismiss')}
                >
                  Dismiss
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
