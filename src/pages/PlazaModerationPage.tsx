import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, MessageSquare, AlertTriangle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { PlazaReportGroup } from '../types';

type TabMode = 'comments' | 'activities';
type ReportStatus = 'open' | 'resolved';

export function PlazaModerationPage() {
  const [activeTab, setActiveTab] = useState<TabMode>('comments');
  const [reportStatus, setReportStatus] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<PlazaReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Activities tab state
  const [activityIdInput, setActivityIdInput] = useState('');
  const [activityReasonInput, setActivityReasonInput] = useState('');
  const [activitySuccess, setActivitySuccess] = useState('');
  const [activityError, setActivityError] = useState('');
  const [activityLoading, setActivityLoading] = useState(false);

  const loadReports = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<PlazaReportGroup[]>(`/admin/plaza/reports?status=${reportStatus}`, { signal });
      setReports(data ?? []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load Plaza reports.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [reportStatus]);

  useEffect(() => {
    const controller = new AbortController();
    void loadReports(controller.signal);
    return () => controller.abort();
  }, [loadReports]);

  const handleModerateComment = async (commentId: string, action: 'hide' | 'restore') => {
    try {
      setActionInProgress(commentId);
      await apiFetch(`/admin/plaza/comments/${commentId}`, {
        method: 'PATCH',
        body: { action },
      });
      // Refresh reports after moderation
      await loadReports();
    } catch (cause) {
      setError(describeError(cause, `Failed to ${action} comment.`));
    } finally {
      setActionInProgress(null);
    }
  };

  const handleModerateActivity = async (action: 'hide' | 'restore') => {
    if (!activityIdInput.trim()) {
      setActivityError('Activity ID is required.');
      return;
    }
    try {
      setActivityLoading(true);
      setActivityError('');
      setActivitySuccess('');
      await apiFetch(`/admin/plaza/activities/${activityIdInput.trim()}`, {
        method: 'PATCH',
        body: {
          action,
          reason: activityReasonInput.trim() || undefined,
        },
      });
      setActivitySuccess(`Successfully ${action === 'hide' ? 'hidden' : 'restored'} activity ${activityIdInput.trim()}.`);
      setActivityIdInput('');
      setActivityReasonInput('');
    } catch (cause) {
      setActivityError(describeError(cause, `Failed to ${action} activity.`));
    } finally {
      setActivityLoading(false);
    }
  };

  return (
    <div className="plaza-moderation-page">
      <PageHeader
        title="Plaza moderation"
        description="Review reported comments, resolve traveler flags, and manage social activity visibility."
      />

      <div className="filter-row" style={{ marginBottom: 16 }}>
        <button
          type="button"
          className={`filter-chip${activeTab === 'comments' ? ' is-active' : ''}`}
          aria-pressed={activeTab === 'comments'}
          onClick={() => setActiveTab('comments')}
        >
          <MessageSquare size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          Reported comments
        </button>
        <button
          type="button"
          className={`filter-chip${activeTab === 'activities' ? ' is-active' : ''}`}
          aria-pressed={activeTab === 'activities'}
          onClick={() => setActiveTab('activities')}
        >
          <ShieldAlert size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
          Activities moderation
        </button>
      </div>

      {activeTab === 'comments' ? (
        <div>
          <div className="filter-row" style={{ marginBottom: 20 }}>
            <span className="filter-label">Filter:</span>
            <button
              type="button"
              className={`filter-chip${reportStatus === 'open' ? ' is-active' : ''}`}
              aria-pressed={reportStatus === 'open'}
              onClick={() => setReportStatus('open')}
            >
              Open reports
            </button>
            <button
              type="button"
              className={`filter-chip${reportStatus === 'resolved' ? ' is-active' : ''}`}
              aria-pressed={reportStatus === 'resolved'}
              onClick={() => setReportStatus('resolved')}
            >
              Resolved reports
            </button>
          </div>

          {error ? (
            <div className="load-error" role="alert" style={{ marginBottom: 16 }}>
              {error} <button type="button" onClick={() => void loadReports()}>Retry</button>
            </div>
          ) : null}

          {loading ? (
            <div className="stitch-panel loading-panel">Loading Plaza reports…</div>
          ) : reports.length === 0 ? (
            <div className="stitch-panel page-state page-state-empty">
              <CheckCircle size={40} style={{ opacity: 0.5, marginBottom: 12, color: 'var(--success, #10b981)' }} aria-hidden="true" />
              <p className="page-state-title">No {reportStatus} reports found.</p>
              <p style={{ color: 'var(--muted, #94a3b8)', fontSize: '0.875rem' }}>
                {reportStatus === 'open' ? 'All clear! No comments currently require moderation.' : 'No resolved report history.'}
              </p>
            </div>
          ) : (
            <div className="report-grid">
              {reports.map((group) => {
                const { comment, activity, reports: reportList } = group;
                const isHidden = Boolean(comment.hidden_at);
                const isWorking = actionInProgress === comment.id;

                return (
                  <article key={comment.id} className="stitch-card report-card">
                    <div className="report-card-top">
                      <span className={`status-pill ${isHidden ? 'status-rejected' : 'status-approved'}`}>
                        {isHidden ? 'Hidden' : 'Visible'}
                      </span>
                      <span className="status-pill report-reason">
                        {comment.report_count} report{comment.report_count !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div style={{ margin: '12px 0' }}>
                      <p style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-bright, #f8fafc)', margin: '0 0 4px 0' }}>
                        "{comment.body}"
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--muted, #94a3b8)', margin: 0 }}>
                        By <strong>{comment.author_display_name}</strong> · {new Date(comment.created_at).toLocaleString()}
                      </p>
                    </div>

                    {activity ? (
                      <div
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          padding: '8px 12px',
                          borderRadius: 6,
                          fontSize: '0.8125rem',
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ color: 'var(--muted, #94a3b8)' }}>On activity: </span>
                        <strong>{activity.subject_title}</strong>{' '}
                        <span style={{ opacity: 0.7 }}>({activity.verb.replace(/_/g, ' ')})</span>
                      </div>
                    ) : null}

                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted, #94a3b8)', marginBottom: 6 }}>
                        Report reasons:
                      </p>
                      <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.8125rem', color: 'var(--text, #cbd5e1)' }}>
                        {reportList.map((r, idx) => (
                          <li key={idx} style={{ marginBottom: 4 }}>
                            <strong>{r.reason}</strong> by {r.reporter_display_name}
                            {r.note ? <em> — "{r.note}"</em> : null}
                            {r.resolution ? (
                              <span style={{ marginLeft: 6, fontSize: '0.75rem', opacity: 0.7 }}>
                                (Resolved: {r.resolution})
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 12, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      {!isHidden ? (
                        <button
                          type="button"
                          className="button button-danger"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', padding: '6px 14px' }}
                          disabled={isWorking}
                          onClick={() => void handleModerateComment(comment.id, 'hide')}
                        >
                          <EyeOff size={14} />
                          {isWorking ? 'Processing…' : 'Hide comment'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="button button-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8125rem', padding: '6px 14px' }}
                          disabled={isWorking}
                          onClick={() => void handleModerateComment(comment.id, 'restore')}
                        >
                          <Eye size={14} />
                          {isWorking ? 'Processing…' : 'Restore comment'}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="stitch-panel" style={{ maxWidth: 640 }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 8px 0' }}>Moderate social activity</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--muted, #94a3b8)', margin: '0 0 20px 0' }}>
            Hiding an activity removes it from the public feed and standings boards for all users.
          </p>

          {activityError ? (
            <div className="load-error" role="alert" style={{ marginBottom: 16 }}>
              {activityError}
            </div>
          ) : null}

          {activitySuccess ? (
            <div
              role="status"
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid var(--success, #10b981)',
                color: 'var(--success, #10b981)',
                padding: '10px 14px',
                borderRadius: 6,
                marginBottom: 16,
                fontSize: '0.875rem',
              }}
            >
              {activitySuccess}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label
                htmlFor="activity-id-input"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 4 }}
              >
                Activity ID (e.g. act_...) *
              </label>
              <input
                id="activity-id-input"
                type="text"
                className="input"
                placeholder="act_00000000-0000-0000-0000-000000000000"
                value={activityIdInput}
                onChange={(e) => setActivityIdInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div>
              <label
                htmlFor="activity-reason-input"
                style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 500, marginBottom: 4 }}
              >
                Reason (optional)
              </label>
              <input
                id="activity-reason-input"
                type="text"
                className="input"
                placeholder="e.g. Terms violation or spam report"
                value={activityReasonInput}
                onChange={(e) => setActivityReasonInput(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="button button-danger"
                disabled={activityLoading || !activityIdInput.trim()}
                onClick={() => void handleModerateActivity('hide')}
              >
                {activityLoading ? 'Processing…' : 'Hide activity'}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={activityLoading || !activityIdInput.trim()}
                onClick={() => void handleModerateActivity('restore')}
              >
                {activityLoading ? 'Processing…' : 'Restore activity'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
