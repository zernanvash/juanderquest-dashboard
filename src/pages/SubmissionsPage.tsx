import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Clock, ShieldAlert, X } from 'lucide-react';
import { AdminMiniMapPreview, ProximityGauge } from '../AdminMiniMapPreview';
import { QueueVisualAnalytics } from '../QueueVisualAnalytics';
import { ApiError, apiFetch } from '../api/client';
import { useRouter } from '../router';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Submission } from '../types';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
type QaFilter = 'all' | 'live' | 'qa';

const PAGE_SIZE = 12;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Pending queue' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All submissions' },
];

const parseStatus = (value: string | null): StatusFilter =>
  value === 'approved' || value === 'rejected' || value === 'all' ? value : 'pending';

const parseQa = (value: string | null): QaFilter => (value === 'live' || value === 'qa' ? value : 'all');

export function SubmissionsPage() {
  const { query, navigate } = useRouter();
  const status = parseStatus(query.get('status'));
  const qaFilter = parseQa(query.get('qa'));

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectModal, setShowRejectModal] = useState(false);
  const rejectInputRef = useRef<HTMLTextAreaElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement | null>(null);

  const fetchSubmissions = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setListLoading(true);
        setListError('');
        const statusQuery = status === 'all' ? '' : `?status=${status}`;
        const data = await apiFetch<Submission[]>(`/admin/submissions${statusQuery}`, { signal });
        setSubmissions(data);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setListError(describeError(cause, 'Unable to load submissions.'));
      } finally {
        if (!signal?.aborted) setListLoading(false);
      }
    },
    [status]
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchSubmissions(controller.signal);
    return () => controller.abort();
  }, [fetchSubmissions]);

  useEffect(() => {
    if (!showRejectModal) return;
    rejectInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !reviewingId) {
        setShowRejectModal(false);
        setRejectionReason('');
        requestAnimationFrame(() => rejectTriggerRef.current?.focus());
      }
      if (event.key === 'Tab') {
        const dialog = rejectInputRef.current?.closest('[role="dialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRejectModal, reviewingId]);

  const handleReview = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    if (reviewingId || (action === 'reject' && !reason?.trim())) return;
    try {
      setReviewingId(id);
      setReviewError('');
      await apiFetch(`/admin/submissions/${id}`, {
        method: 'PATCH',
        body: { action, rejection_reason: reason },
      });
      setShowRejectModal(false);
      setSelectedSub(null);
      setRejectionReason('');
      rejectTriggerRef.current?.focus();
      await fetchSubmissions();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setReviewError(`${cause.message} The queue was refreshed; review the current state before retrying.`);
        setShowRejectModal(false);
        await fetchSubmissions();
      } else {
        setReviewError(describeError(cause, 'Review failed.'));
      }
    } finally {
      setReviewingId(null);
    }
  };

  const buildQuery = (nextStatus: StatusFilter, nextQa: QaFilter, nextPage = 1): string => {
    const params = new URLSearchParams();
    if (nextStatus !== 'pending') params.set('status', nextStatus);
    if (nextQa !== 'all') params.set('qa', nextQa);
    if (nextPage > 1) params.set('page', String(nextPage));
    const suffix = params.toString();
    return `/submissions${suffix ? `?${suffix}` : ''}`;
  };

  const setFilters = (nextStatus: StatusFilter, nextQa: QaFilter) => {
    navigate(buildQuery(nextStatus, nextQa));
  };

  const displayedSubmissions = submissions.filter((sub) => {
    if (qaFilter === 'live') return !sub.is_test;
    if (qaFilter === 'qa') return Boolean(sub.is_test);
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(displayedSubmissions.length / PAGE_SIZE));
  const requestedPage = Number(query.get('page')) || 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const pageItems = displayedSubmissions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title="Proof submissions"
        description="GPS-backed quest proof awaiting review. Approvals award the declared quest rewards; rejections require a reason."
      />

      {listError ? (
        <div className="load-error" role="alert">
          {listError} <button type="button" onClick={() => void fetchSubmissions()}>Retry</button>
        </div>
      ) : null}
      {reviewError ? <div className="load-error" role="alert">{reviewError}</div> : null}

      {(status === 'pending' || status === 'all') && submissions.length > 0 ? (
        <QueueVisualAnalytics submissions={submissions} />
      ) : null}

      <div className="filter-row">
        <span className="filter-label">Status</span>
        {STATUS_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-chip${status === option.value ? ' is-active' : ''}`}
            aria-pressed={status === option.value}
            onClick={() => setFilters(option.value, qaFilter)}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <span className="filter-label">Data scope</span>
        <button
          type="button"
          className={`filter-chip${qaFilter === 'all' ? ' is-active' : ''}`}
          aria-pressed={qaFilter === 'all'}
          onClick={() => setFilters(status, 'all')}
        >
          All ({submissions.length})
        </button>
        <button
          type="button"
          className={`filter-chip${qaFilter === 'live' ? ' is-active' : ''}`}
          aria-pressed={qaFilter === 'live'}
          onClick={() => setFilters(status, 'live')}
        >
          Live production ({submissions.filter((s) => !s.is_test).length})
        </button>
        <button
          type="button"
          className={`filter-chip${qaFilter === 'qa' ? ' is-active' : ''}`}
          aria-pressed={qaFilter === 'qa'}
          onClick={() => setFilters(status, 'qa')}
        >
          QA fixtures ({submissions.filter((s) => s.is_test).length})
        </button>
      </div>

      {listLoading ? (
        <div className="stitch-panel loading-panel">Loading submissions…</div>
      ) : displayedSubmissions.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Clock size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No submissions found in this queue.</p>
        </div>
      ) : (
        <>
          <div className="submission-grid">
            {pageItems.map((sub) => (
            <div key={sub.id} className="stitch-card submission-card">
              <div>
                <div className="submission-card-top">
                  <span className="submission-id">ID: {sub.id.substring(0, 8)}</span>
                  {sub.is_test ? (
                    <span className="qa-badge">
                      <ShieldAlert size={12} aria-hidden="true" /> [QA Test Fixture]
                    </span>
                  ) : null}
                  <span className={`status-pill status-${sub.status}`}>
                    {sub.status === 'pending' ? 'Awaiting review' : sub.status}
                  </span>
                </div>

                <h3 className="submission-title">{sub.quest_title}</h3>
                <p className="submission-submitter">
                  Submitted by: <strong>{sub.user_name}</strong>
                </p>

                <AdminMiniMapPreview
                  targetLat={sub.target_lat}
                  targetLng={sub.target_lng}
                  capturedLat={sub.captured_lat}
                  capturedLng={sub.captured_lng}
                  questTitle={sub.quest_title}
                  userName={sub.user_name}
                  radiusMeters={sub.quest_radius_meters}
                  distanceMeters={sub.distance_meters}
                  capturedAccuracy={sub.captured_accuracy}
                  status={sub.status}
                />

                <div className="submission-details">
                  <div className="submission-detail-row">
                    <span className="submission-detail-label">Marker code</span>
                    <span className="mono-chip">{sub.scanned_marker_code}</span>
                  </div>
                  <ProximityGauge distanceMeters={sub.distance_meters} radiusMeters={sub.quest_radius_meters} />
                  <div className="submission-detail-row submission-detail-meta">
                    <span>Captured time</span>
                    <span className="submission-detail-strong">{new Date(sub.created_at).toLocaleString()}</span>
                  </div>
                  <div className="submission-detail-row submission-detail-meta">
                    <span>Sensor accuracy</span>
                    <span className={sub.captured_accuracy != null && sub.captured_accuracy <= 15 ? 'good-text' : 'warn-text'}>
                      {sub.captured_accuracy != null ? `±${sub.captured_accuracy}m (mobile GNSS)` : 'Standard mobile GPS'}
                    </span>
                  </div>
                </div>

                {sub.rejection_reason ? (
                  <div className="rejection-note">Reason: {sub.rejection_reason}</div>
                ) : null}
              </div>

              {sub.status === 'pending' ? (
                <div className="submission-actions">
                  <button
                    type="button"
                    className="button-approve"
                    onClick={() => void handleReview(sub.id, 'approve')}
                    disabled={reviewingId !== null}
                  >
                    <Check size={16} aria-hidden="true" /> Approve
                  </button>
                  <button
                    type="button"
                    className="button-reject"
                    onClick={(event) => {
                      rejectTriggerRef.current = event.currentTarget;
                      setSelectedSub(sub);
                      setReviewError('');
                      setShowRejectModal(true);
                    }}
                    disabled={reviewingId !== null}
                  >
                    <X size={16} aria-hidden="true" /> Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          </div>

          {totalPages > 1 ? (
            <nav className="pagination" aria-label="Submission pages">
              <button
                type="button"
                className="button-muted"
                disabled={page <= 1}
                onClick={() => navigate(buildQuery(status, qaFilter, page - 1))}
              >
                <ChevronLeft size={15} aria-hidden="true" /> Previous
              </button>
              <span className="pagination-status" role="status">
                Page {page} of {totalPages} · {displayedSubmissions.length} item{displayedSubmissions.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="button-muted"
                disabled={page >= totalPages}
                onClick={() => navigate(buildQuery(status, qaFilter, page + 1))}
              >
                Next <ChevronRight size={15} aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </>
      )}

      {showRejectModal && selectedSub ? (
        <div className="modal-backdrop">
          <div className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="reject-title" aria-describedby="reject-description">
            <h3 id="reject-title" className="modal-title-danger">
              Reject quest submission
            </h3>
            <p id="reject-description" className="modal-description">
              Please state the reason for rejecting <strong>{selectedSub.user_name}</strong>&apos;s proof:
            </p>
            <textarea
              ref={rejectInputRef}
              aria-label="Rejection reason"
              required
              rows={4}
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              placeholder="e.g., GPS distance offset exceeded maximum radius threshold."
              className="modal-textarea"
            />
            <div className="modal-actions">
              <button
                type="button"
                className="button-muted"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  requestAnimationFrame(() => rejectTriggerRef.current?.focus());
                }}
                disabled={reviewingId !== null}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-danger"
                onClick={() => void handleReview(selectedSub.id, 'reject', rejectionReason.trim())}
                disabled={!rejectionReason.trim() || reviewingId !== null}
              >
                {reviewingId ? 'Rejecting…' : 'Confirm rejection'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
