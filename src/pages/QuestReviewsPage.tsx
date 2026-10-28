import { useCallback, useEffect, useState } from 'react';
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
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { QuestAttempt, QuestStepEvidence } from '../types';

export function QuestReviewsPage() {
  const [attempts, setAttempts] = useState<QuestAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedAttempt, setSelectedAttempt] = useState<QuestAttempt | null>(null);

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
          body: JSON.stringify({
            action: reviewAction,
            ...(reviewAction === 'needs_changes' ? { reason: needsChangesReason.trim() } : {}),
          }),
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
        body: JSON.stringify({ action: 'approve' }),
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
        return <MapPin className="w-4 h-4 text-emerald-600" aria-hidden="true" />;
      case 'qr':
        return <QrCode className="w-4 h-4 text-blue-600" aria-hidden="true" />;
      case 'photo':
        return <Camera className="w-4 h-4 text-amber-600" aria-hidden="true" />;
      case 'ar':
        return <Sparkles className="w-4 h-4 text-purple-600" aria-hidden="true" />;
      case 'action':
        return <HelpCircle className="w-4 h-4 text-cyan-600" aria-hidden="true" />;
      default:
        return <Compass className="w-4 h-4 text-stone-500" aria-hidden="true" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            Verified
          </span>
        );
      case 'pending_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 animate-pulse">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Pending Review
          </span>
        );
      case 'needs_changes':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
            Needs Changes
          </span>
        );
      case 'ready':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-700">
            Ready
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-500">
            {status}
          </span>
        );
    }
  };

  // Determine if all required steps are verified
  const pendingRequiredSteps =
    selectedAttempt?.steps?.filter((s) => s.required && s.status !== 'verified') || [];
  const canApproveAttempt =
    selectedAttempt &&
    selectedAttempt.status !== 'completed' &&
    pendingRequiredSteps.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quest Attempts & Per-Task Review"
        description="Review multi-task quest completions, inspect photo evidence with verified GPS distance, and request changes or approve tasks individually (Plan 43 §4.5)."
      />

      {error ? (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center justify-between" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void fetchAttempts()} className="font-bold underline hover:no-underline">
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Attempt List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-stone-700 uppercase tracking-wider">
              Recent Attempts ({attempts.length})
            </h2>
            <button
              type="button"
              onClick={() => void fetchAttempts()}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
              style={{ minHeight: 40, minWidth: 40 }}
            >
              Refresh list
            </button>
          </div>

          {loading && attempts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-stone-200 text-center text-sm text-stone-500">
              Loading quest attempts…
            </div>
          ) : attempts.length === 0 ? (
            <div className="p-8 rounded-2xl bg-white border border-stone-200 text-center text-sm text-stone-500">
              No quest attempts found.
            </div>
          ) : (
            <div className="space-y-2.5">
              {attempts.map((attempt) => {
                const isSelected = selectedAttempt?.id === attempt.id;
                const hasPendingReview = attempt.steps?.some((s) => s.status === 'pending_review');

                return (
                  <button
                    key={attempt.id}
                    type="button"
                    onClick={() => handleSelectAttempt(attempt)}
                    className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-500 shadow-sm ring-1 ring-emerald-500'
                        : 'bg-white border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-bold text-stone-900 text-sm truncate">
                          {attempt.quest_title || 'Untitled Quest'}
                        </h3>
                        <p className="text-xs text-stone-500 truncate mt-0.5">
                          Traveler: <span className="font-semibold text-stone-700">{attempt.traveler_name || 'Traveler'}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                            attempt.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : attempt.status === 'submitted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-stone-100 text-stone-700'
                          }`}
                        >
                          {attempt.status.replace(/_/g, ' ')}
                        </span>
                        {hasPendingReview && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3" /> Proof waiting
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                      <span>
                        Mode: <strong className="text-stone-700">{attempt.step_order_mode}</strong>
                      </span>
                      <span>
                        Tasks: <strong className="text-stone-700">{attempt.verified_steps}</strong> / {attempt.total_steps || attempt.steps?.length || 0} verified
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Attempt Detail & Per-Task Evidence */}
        <div className="lg:col-span-7">
          {selectedAttempt ? (
            <div className="p-6 rounded-3xl bg-white border border-stone-200 shadow-sm space-y-6">
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-stone-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black text-stone-900">
                      {selectedAttempt.quest_title}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-600">
                      Attempt {selectedAttempt.id.slice(0, 8)}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-1">
                    Destination: <strong className="text-stone-700">{selectedAttempt.quest_location || 'Pangasinan'}</strong> · Traveler: <strong className="text-stone-700">{selectedAttempt.traveler_name}</strong>
                  </p>
                </div>

                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-semibold text-stone-500">
                    Started {new Date(selectedAttempt.created_at).toLocaleDateString()}
                  </span>
                  {selectedAttempt.completed_at && (
                    <span className="text-[11px] text-emerald-700 font-bold">
                      Completed {new Date(selectedAttempt.completed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Task Evidence Rows */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-stone-600 tracking-wider">
                  Quest Tasks ({selectedAttempt.steps?.length || 0})
                </h3>

                {selectedAttempt.steps && selectedAttempt.steps.length > 0 ? (
                  <div className="space-y-3">
                    {selectedAttempt.steps.map((step) => {
                      const payload =
                        typeof step.evidence_payload === 'string'
                          ? JSON.parse(step.evidence_payload)
                          : step.evidence_payload;

                      return (
                        <div
                          key={step.id || step.step_order}
                          className="p-4 rounded-2xl border border-stone-200 bg-stone-50/50 space-y-3"
                          data-testid={`task-row-${step.step_order}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5">
                              <div className="p-2 rounded-xl bg-white border border-stone-200 shadow-2xs">
                                {getCheckpointIcon(step.checkpoint_type)}
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-stone-900 text-sm">
                                    {step.step_order}. {step.title}
                                  </h4>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
                                    {step.checkpoint_type}
                                  </span>
                                  {step.required ? (
                                    <span className="text-[10px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                      Required
                                    </span>
                                  ) : (
                                    <span className="text-[10px] font-medium text-stone-500">
                                      Optional
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-stone-600 mt-0.5">{step.description}</p>
                              </div>
                            </div>

                            <div>{getStatusBadge(step.status)}</div>
                          </div>

                          {/* Evidence inspection card */}
                          {payload && (
                            <div className="p-3 rounded-xl bg-white border border-stone-200 text-xs space-y-2">
                              {payload.photo_url && (
                                <div className="flex items-start gap-3">
                                  <img
                                    src={payload.photo_url}
                                    alt={`Proof for ${step.title}`}
                                    className="w-24 h-24 object-cover rounded-lg border border-stone-200 shrink-0 bg-stone-100"
                                  />
                                  <div className="space-y-1 min-w-0">
                                    <p className="font-bold text-stone-800">Photo Proof Submitted</p>
                                    {payload.distance_meters !== undefined && (
                                      <p className="text-stone-600">
                                        GPS Distance: <strong className="text-stone-900">{Math.round(payload.distance_meters)} m</strong> from target
                                      </p>
                                    )}
                                    {payload.captured_accuracy !== undefined && (
                                      <p className="text-stone-500 text-[11px]">
                                        Accuracy: ±{Math.round(payload.captured_accuracy)} m
                                      </p>
                                    )}
                                    {payload.mime_type && (
                                      <p className="text-stone-400 text-[10px]">
                                        Format: {payload.mime_type} · {(payload.byte_length / 1024).toFixed(1)} KB
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}

                              {payload.marker_code && (
                                <p className="text-stone-600">
                                  Scanned QR Code: <code className="bg-stone-100 px-1.5 py-0.5 rounded font-mono text-stone-900">{payload.marker_code}</code>
                                </p>
                              )}

                              {payload.quiz_title && (
                                <p className="text-stone-600">
                                  Quiz completed: <strong className="text-stone-900">{payload.quiz_title}</strong> (Score: {payload.score}%)
                                </p>
                              )}

                              {payload.ar_challenge_verified && (
                                <p className="text-purple-700 font-medium">
                                  ✨ AR object collected on-site with valid single-use challenge token.
                                </p>
                              )}
                            </div>
                          )}

                          {step.needs_changes_reason && (
                            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                              <strong>Changes requested:</strong> {step.needs_changes_reason}
                            </div>
                          )}

                          {/* Per-Task Actions (Plan 43 §4.5) */}
                          {step.status === 'pending_review' && selectedAttempt.status !== 'completed' && (
                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => handleOpenTaskReview(step, 'needs_changes')}
                                className="px-3 py-1.5 rounded-xl border border-rose-300 bg-white hover:bg-rose-50 text-rose-700 text-xs font-bold transition-colors cursor-pointer"
                              >
                                Needs Changes…
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenTaskReview(step, 'approve')}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Approve Task
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-stone-50 text-xs text-stone-500 text-center">
                    No task evidence rows recorded for this attempt.
                  </div>
                )}
              </div>

              {/* Attempt Approval Section */}
              <div className="pt-4 border-t border-stone-200 space-y-3">
                {attemptActionError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    {attemptActionError}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-bold text-stone-900">Final Attempt Approval</h4>
                    <p className="text-xs text-stone-500">
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
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ${
                      canApproveAttempt
                        ? 'bg-[#2D6A4F] hover:bg-[#1B4332] text-white'
                        : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none'
                    }`}
                  >
                    <Check className="w-4 h-4" />
                    {approvingAttempt ? 'Approving…' : 'Approve Quest Attempt'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 rounded-3xl bg-white border border-stone-200 text-center text-stone-400 text-sm">
              Select a quest attempt from the list to review task evidence.
            </div>
          )}
        </div>
      </div>

      {/* Per-Task Review Modal */}
      {reviewingStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white rounded-3xl border border-stone-200 shadow-xl overflow-hidden p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-stone-900 text-base">
                  {reviewAction === 'approve' ? 'Approve Task Evidence' : 'Request Changes for Task'}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Task {reviewingStep.step_order}: {reviewingStep.title}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseTaskReview}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {taskReviewError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {taskReviewError}
              </div>
            )}

            {reviewAction === 'approve' ? (
              <p className="text-sm text-stone-600">
                Are you sure you want to approve this task evidence? Once verified, the traveler will make progress towards completing the quest.
              </p>
            ) : (
              <div className="space-y-2">
                <label htmlFor="needs-changes-reason" className="block text-xs font-bold text-stone-700">
                  Reason for requesting changes (10–300 characters):
                </label>
                <textarea
                  id="needs-changes-reason"
                  rows={3}
                  value={needsChangesReason}
                  onChange={(e) => setNeedsChangesReason(e.target.value)}
                  placeholder="e.g., The photo was taken too far from the marker. Please retake closer to the lighthouse entrance."
                  className="w-full p-3 rounded-xl border border-stone-200 text-xs text-stone-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={handleCloseTaskReview}
                className="px-3.5 py-2 rounded-xl border border-stone-200 text-xs font-bold text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submittingReview}
                onClick={handleSubmitTaskReview}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer ${
                  reviewAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
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
