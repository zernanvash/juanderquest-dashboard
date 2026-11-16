import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileQuestion,
  HelpCircle,
  MapPin,
  QrCode,
  RotateCcw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { ApiError, apiFetch } from '../api/client';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { EmptyState, PageError, PageHeader, PageLoading } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { QuestAttempt, QuestStepEvidence } from '../types';

type AttemptFilter = 'needs_review' | 'in_progress' | 'completed' | 'all';

const isActionableAttempt = (attempt: QuestAttempt): boolean => {
  if (attempt.status === 'completed') return false;
  if (attempt.steps?.some((s) => s.status === 'pending_review')) return true;
  if (attempt.status === 'submitted') return true;
  return Boolean(attempt.steps?.length && attempt.steps.every((s) => !s.required || s.status === 'verified'));
};

export function QuestReviewsPage() {
  const [attempts, setAttempts] = useState<QuestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState<QuestAttempt | null>(null);
  const [statusFilter, setStatusFilter] = useState<AttemptFilter>('needs_review');
  const [search, setSearch] = useState('');

  // Per-task modal state
  const [reviewingStep, setReviewingStep] = useState<QuestStepEvidence | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'needs_changes'>('approve');
  const [needsChangesReason, setNeedsChangesReason] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [taskReviewError, setTaskReviewError] = useState('');

  // Attempt approval state
  const [approvingAttempt, setApprovingAttempt] = useState(false);
  const [attemptActionError, setAttemptActionError] = useState('');

  const fetchAttempts = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<QuestAttempt[]>('/admin/quest-attempts', { signal });
      setAttempts(Array.isArray(data) ? data : []);
      if (selectedAttempt && Array.isArray(data)) {
        const refreshed = data.find((a) => a.id === selectedAttempt.id);
        if (refreshed) setSelectedAttempt(refreshed);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load quest attempts.'));
      setAttempts([]);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchAttempts(controller.signal);
    return () => controller.abort();
  }, [fetchAttempts]);

  const handleSelectAttempt = (attempt: QuestAttempt) => {
    setSelectedAttempt(attempt);
    setAttemptActionError('');
    setTaskReviewError('');
  };

  const handleOpenTaskReview = (step: QuestStepEvidence, action: 'approve' | 'needs_changes') => {
    setReviewingStep(step);
    setReviewAction(action);
    setNeedsChangesReason('');
    setTaskReviewError('');
  };

  const handleCloseTaskReview = () => {
    setReviewingStep(null);
    setNeedsChangesReason('');
    setTaskReviewError('');
  };

  const handleSubmitTaskReview = async () => {
    if (!selectedAttempt || !reviewingStep) return;
    if (reviewAction === 'needs_changes' && (!needsChangesReason.trim() || needsChangesReason.trim().length < 10)) {
      setTaskReviewError('Reason must be between 10 and 300 characters.');
      return;
    }

    try {
      setSubmittingReview(true);
      setTaskReviewError('');
      await apiFetch(
        `/admin/quest-attempts/${selectedAttempt.id}/steps/${reviewingStep.step_order}`,
        {
          method: 'PATCH',
          body: {
            action: reviewAction,
            ...(reviewAction === 'needs_changes' ? { reason: needsChangesReason.trim() } : {}),
          },
        }
      );

      handleCloseTaskReview();
      await fetchAttempts();
    } catch (cause) {
      setTaskReviewError(describeError(cause, 'Failed to update task review.'));
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleApproveAttempt = async () => {
    if (!selectedAttempt) return;
    try {
      setApprovingAttempt(true);
      setAttemptActionError('');
      await apiFetch(`/admin/quest-attempts/${selectedAttempt.id}`, {
        method: 'PATCH',
        body: { action: 'approve' },
      });
      await fetchAttempts();
    } catch (cause) {
      setAttemptActionError(describeError(cause, 'Failed to approve attempt.'));
    } finally {
      setApprovingAttempt(false);
    }
  };

  const getCheckpointIcon = (type: string) => {
    switch (type) {
      case 'location':
        return <MapPin size={16} color="#2d6a4f" aria-hidden="true" />;
      case 'qr':
        return <QrCode size={16} color="#1d4ed8" aria-hidden="true" />;
      case 'photo':
        return <Camera size={16} color="#b45309" aria-hidden="true" />;
      case 'ar':
        return <Sparkles size={16} color="#7c3aed" aria-hidden="true" />;
      case 'action':
        return <HelpCircle size={16} color="#0e7490" aria-hidden="true" />;
      default:
        return <Compass size={16} color="#837560" aria-hidden="true" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="status-pill status-approved quest-reviews-badge">
            <CheckCircle2 size={14} aria-hidden="true" />
            Verified
          </span>
        );
      case 'pending_review':
        return (
          <span className="status-pill status-pending quest-reviews-badge">
            <Clock size={14} aria-hidden="true" />
            Pending Review
          </span>
        );
      case 'needs_changes':
        return (
          <span className="status-pill status-rejected quest-reviews-badge">
            <RotateCcw size={14} aria-hidden="true" />
            Needs Changes
          </span>
        );
      case 'ready':
        return <span className="status-pill quest-reviews-tone-neutral">Ready</span>;
      default:
        return <span className="status-pill quest-reviews-tone-neutral">{status}</span>;
    }
  };

  // Determine if all required steps are verified
  const pendingRequiredSteps =
    selectedAttempt?.steps?.filter((s) => s.required && s.status !== 'verified') || [];
  const canApproveAttempt =
    selectedAttempt &&
    selectedAttempt.status !== 'completed' &&
    pendingRequiredSteps.length === 0;

  const filterCounts = useMemo(() => {
    const needsReview = attempts.filter(isActionableAttempt).length;
    const inProgress = attempts.filter((a) => a.status === 'in_progress' && !isActionableAttempt(a)).length;
    const completed = attempts.filter((a) => a.status === 'completed').length;
    return { needs_review: needsReview, in_progress: inProgress, completed, all: attempts.length };
  }, [attempts]);

  const filteredAttempts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return attempts.filter((attempt) => {
      if (statusFilter === 'needs_review' && !isActionableAttempt(attempt)) return false;
      if (statusFilter === 'in_progress' && (attempt.status !== 'in_progress' || isActionableAttempt(attempt))) return false;
      if (statusFilter === 'completed' && attempt.status !== 'completed') return false;
      if (!q) return true;
      return `${attempt.quest_title ?? ''} ${attempt.traveler_name ?? ''} ${attempt.quest_location ?? ''} ${attempt.id}`
        .toLowerCase()
        .includes(q);
    });
  }, [attempts, statusFilter, search]);

  const attemptPage = useClientPagination(filteredAttempts, 24);

  return (
    <div>
      <PageHeader
        title="Quest Attempts & Per-Task Review"
        description="Review multi-task quest completions, inspect photo evidence with verified GPS distance, and request changes or approve tasks individually (Plan 43 §4.5)."
      />

      {error ? <PageError message={error} onRetry={() => void fetchAttempts()} /> : null}

      <div className="filter-row" role="tablist" aria-label="Quest attempt status filter">
        {(
          [
            { value: 'needs_review', label: `Needs Review (${filterCounts.needs_review})` },
            { value: 'in_progress', label: `In Progress (${filterCounts.in_progress})` },
            { value: 'completed', label: `Completed (${filterCounts.completed})` },
            { value: 'all', label: `All (${filterCounts.all})` },
          ] as Array<{ value: AttemptFilter; label: string }>
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.value}
            className={`filter-chip${statusFilter === tab.value ? ' is-active' : ''}`}
            onClick={() => setStatusFilter(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <AdminSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by quest title, traveler, destination, or attempt ID…"
        ariaLabel="Search quest attempts"
        totalCount={attempts.length}
        filteredCount={filteredAttempts.length}
        shownCount={attemptPage.pageItems.length}
        itemLabel="attempts"
      />

      <div className="quest-reviews-layout">
        {/* Left Column: Attempt List */}
        <div className="quest-reviews-list">
          <div className="quest-reviews-list-head">
            <h2 className="quest-reviews-section-label">Attempts ({filteredAttempts.length})</h2>
            <button type="button" onClick={() => void fetchAttempts()} className="button button-secondary">
              Refresh list
            </button>
          </div>

          {loading && attempts.length === 0 ? (
            <PageLoading label="Loading quest attempts…" />
          ) : filteredAttempts.length === 0 ? (
            <EmptyState
              title={
                statusFilter === 'needs_review' && attempts.length > 0
                  ? 'No attempts currently need review. Switch to In Progress or All to inspect active travelers.'
                  : 'No quest attempts found.'
              }
            />
          ) : (
            <>
              <div className="quest-reviews-attempts">
                {attemptPage.pageItems.map((attempt) => {
                const isSelected = selectedAttempt?.id === attempt.id;
                const hasPendingReview = attempt.steps?.some((s) => s.status === 'pending_review');

                return (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => handleSelectAttempt(attempt)}
                    className={`stitch-card quest-reviews-attempt${isSelected ? ' is-selected' : ''}`}
                  >
                    <div className="quest-reviews-attempt-top">
                      <div className="quest-reviews-attempt-text">
                        <h3 className="quest-reviews-attempt-title">{attempt.quest_title || 'Untitled Quest'}</h3>
                        <p className="quest-reviews-meta">
                          Traveler: <span className="submission-detail-strong">{attempt.traveler_name || 'Traveler'}</span>
                        </p>
                      </div>
                      <div className="quest-reviews-attempt-badges">
                        <span
                          className={`status-pill ${
                            attempt.status === 'completed'
                              ? 'status-approved'
                              : attempt.status === 'submitted'
                              ? 'quest-reviews-tone-info'
                              : 'quest-reviews-tone-neutral'
                          }`}
                        >
                          {attempt.status.replace(/_/g, ' ')}
                        </span>
                        {hasPendingReview && (
                          <span className="status-pill status-pending quest-reviews-badge">
                            <Clock size={12} aria-hidden="true" /> Proof waiting
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="quest-reviews-attempt-foot">
                      <span>
                        Mode: <strong>{attempt.step_order_mode}</strong>
                      </span>
                      <span>
                        Tasks: <strong>{attempt.verified_steps}</strong> / {attempt.total_steps || attempt.steps?.length || 0} verified
                      </span>
                    </div>
                  </button>
                );
              })}
              </div>
              <AdminPagination
                page={attemptPage.page}
                totalPages={attemptPage.totalPages}
                onPageChange={attemptPage.setPage}
              />
            </>
          )}
        </div>

        {/* Right Column: Attempt Detail & Per-Task Evidence */}
        <div>
          {selectedAttempt ? (
            <div className="stitch-panel quest-reviews-detail">
              <div className="quest-reviews-detail-head">
                <div>
                  <div className="quest-reviews-title-row">
                    <h2 className="submission-title">{selectedAttempt.quest_title}</h2>
                    <span className="mono-chip">Attempt {selectedAttempt.id.slice(0, 8)}</span>
                  </div>
                  <p className="quest-reviews-meta">
                    Destination: <strong>{selectedAttempt.quest_location || 'Pangasinan'}</strong> · Traveler: <strong>{selectedAttempt.traveler_name}</strong>
                  </p>
                </div>

                <div className="quest-reviews-dates">
                  <span>Started {new Date(selectedAttempt.created_at).toLocaleDateString()}</span>
                  {selectedAttempt.completed_at && (
                    <span className="good-text">Completed {new Date(selectedAttempt.completed_at).toLocaleDateString()}</span>
                  )}
                </div>
              </div>

              {/* Task Evidence Rows */}
              <div className="quest-reviews-tasks">
                <h3 className="quest-reviews-section-label">Quest Tasks ({selectedAttempt.steps?.length || 0})</h3>

                {selectedAttempt.steps && selectedAttempt.steps.length > 0 ? (
                  selectedAttempt.steps.map((step) => {
                    const payload =
                      typeof step.evidence_payload === 'string'
                        ? JSON.parse(step.evidence_payload)
                        : step.evidence_payload;
                    const hasEvidence =
                      payload &&
                      (payload.photo_url || payload.marker_code || payload.quiz_title || payload.ar_challenge_verified);

                    return (
                      <div
                        key={step.id || step.step_order}
                        className="quest-reviews-task"
                        data-testid={`task-row-${step.step_order}`}
                      >
                        <div className="quest-reviews-task-head">
                          <div className="quest-reviews-task-main">
                            <div className="quest-reviews-task-icon">{getCheckpointIcon(step.checkpoint_type)}</div>
                            <div>
                              <div className="quest-reviews-title-row">
                                <h4 className="quest-reviews-task-title">
                                  {step.step_order}. {step.title}
                                </h4>
                                <span className="quest-reviews-task-type">{step.checkpoint_type}</span>
                                {step.required ? (
                                  <span className="qa-badge">Required</span>
                                ) : (
                                  <span className="quest-reviews-task-type">Optional</span>
                                )}
                              </div>
                              <p className="quest-reviews-meta">{step.description}</p>
                            </div>
                          </div>

                          <div>{getStatusBadge(step.status)}</div>
                        </div>

                        {/* Evidence inspection card */}
                        {hasEvidence && (
                          <div className="submission-details quest-reviews-evidence">
                            {payload.photo_url && (
                              <div className="quest-reviews-photo">
                                <img
                                  src={payload.photo_url}
                                  alt={`Proof for ${step.title}`}
                                  className="quest-reviews-photo-img"
                                />
                                <div className="quest-reviews-photo-text">
                                  <p className="submission-detail-strong">Photo Proof Submitted</p>
                                  {payload.distance_meters !== undefined && (
                                    <p>
                                      GPS Distance: <strong>{Math.round(payload.distance_meters)} m</strong> from target
                                    </p>
                                  )}
                                  {payload.captured_accuracy !== undefined && (
                                    <p className="quest-reviews-note">Accuracy: ±{Math.round(payload.captured_accuracy)} m</p>
                                  )}
                                  {payload.mime_type && (
                                    <p className="quest-reviews-note">
                                      Format: {payload.mime_type} · {(payload.byte_length / 1024).toFixed(1)} KB
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {payload.marker_code && (
                              <p>
                                Scanned QR Code: <code className="mono-chip">{payload.marker_code}</code>
                              </p>
                            )}

                            {payload.quiz_title && (
                              <p>
                                Quiz completed: <strong>{payload.quiz_title}</strong> (Score: {payload.score}%)
                              </p>
                            )}

                            {payload.ar_challenge_verified && (
                              <p className="quest-reviews-ar">
                                ✨ AR object collected on-site with valid single-use challenge token.
                              </p>
                            )}
                          </div>
                        )}

                        {step.needs_changes_reason && (
                          <div className="rejection-note quest-reviews-reason">
                            <strong>Changes requested:</strong> {step.needs_changes_reason}
                          </div>
                        )}

                        {/* Per-Task Actions (Plan 43 §4.5) */}
                        {step.status === 'pending_review' && selectedAttempt.status !== 'completed' && (
                          <div className="quest-reviews-task-actions">
                            <button
                              type="button"
                              onClick={() => handleOpenTaskReview(step, 'needs_changes')}
                              className="button-reject"
                            >
                              Needs Changes…
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenTaskReview(step, 'approve')}
                              className="button-approve"
                            >
                              <Check size={14} aria-hidden="true" />
                              Approve Task
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="page-state">No task evidence rows recorded for this attempt.</p>
                )}
              </div>

              {/* Attempt Approval Section */}
              <div className="quest-reviews-approval">
                {attemptActionError && <div className="load-error">{attemptActionError}</div>}

                <div className="quest-reviews-approval-row">
                  <div>
                    <h4 className="quest-reviews-task-title">Final Attempt Approval</h4>
                    <p className="quest-reviews-meta">
                      {pendingRequiredSteps.length > 0
                        ? `Blocked: ${pendingRequiredSteps.length} required task(s) still pending review.`
                        : selectedAttempt.status === 'completed'
                        ? 'This attempt has already been verified and rewarded.'
                        : 'All required tasks verified. Ready to settle rewards and grant points.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!canApproveAttempt || approvingAttempt}
                    onClick={handleApproveAttempt}
                    title={
                      !canApproveAttempt
                        ? `Cannot approve: ${pendingRequiredSteps.map((s) => s.title).join(', ')} must be verified first.`
                        : 'Approve attempt and grant reward points'
                    }
                    className="button-approve"
                  >
                    <Check size={16} aria-hidden="true" />
                    {approvingAttempt ? 'Approving…' : 'Approve Quest Attempt'}
                  </button>
                </div>
              </div>
            </div>
          ) : attempts.length > 0 ? (
            <EmptyState title="Select a quest attempt from the list to review task evidence." />
          ) : null}
        </div>
      </div>

      {/* Per-Task Review Modal */}
      {reviewingStep && (
        <div className="modal-backdrop">
          <div className="stitch-panel modal-panel">
            <div className="quest-reviews-modal-head">
              <div>
                <h3 className={`quest-reviews-modal-title${reviewAction === 'approve' ? '' : ' is-danger'}`}>
                  {reviewAction === 'approve' ? 'Approve Task Evidence' : 'Request Changes for Task'}
                </h3>
                <p className="quest-reviews-meta">
                  Task {reviewingStep.step_order}: {reviewingStep.title}
                </p>
              </div>
              <button type="button" onClick={handleCloseTaskReview} className="button-muted" aria-label="Close">
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            {taskReviewError && <div className="load-error">{taskReviewError}</div>}

            {reviewAction === 'approve' ? (
              <p className="modal-description">
                Are you sure you want to approve this task evidence? Once verified, the traveler will make progress towards completing the quest.
              </p>
            ) : (
              <div>
                <label htmlFor="needs-changes-reason" className="quest-reviews-field-label">
                  Reason for requesting changes (10–300 characters):
                </label>
                <textarea
                  id="needs-changes-reason"
                  rows={3}
                  value={needsChangesReason}
                  onChange={(e) => setNeedsChangesReason(e.target.value)}
                  placeholder="e.g., The photo was taken too far from the marker. Please retake closer to the lighthouse entrance."
                  className="modal-textarea"
                />
              </div>
            )}

            <div className="modal-actions">
              <button type="button" onClick={handleCloseTaskReview} className="button-muted">
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingReview}
                onClick={handleSubmitTaskReview}
                className={reviewAction === 'approve' ? 'button-approve' : 'button-danger'}
              >
                {submittingReview
                  ? 'Submitting…'
                  : reviewAction === 'approve'
                  ? 'Confirm Approval'
                  : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
