import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, MapPin, Search, ShieldCheck, Store } from 'lucide-react';
import { ApiError, apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { AdminMiniMapPreview } from '../AdminMiniMapPreview';
import { PageHeader } from '../components/PageState';
import { useRouter } from '../router';
import { describeError } from '../utils/errors';
import { useUrlFilterState } from '../utils/urlFilters';
import type { AdminMerchantSpotClaim } from '../types';

type ClaimStatusFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all';

const STATUS_TABS: ReadonlyArray<{ value: ClaimStatusFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const isSafeProofUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/api/v1/uploads/spot-photos/')
  ) {
    return trimmed;
  }
  return null;
};

const formatSourceType = (sourceType: string | null | undefined): string => {
  if (!sourceType) return 'Community destination';
  return sourceType.replace(/_/g, ' ');
};

const mapClaimReviewError = (cause: unknown): { message: string; refresh: boolean } => {
  if (cause instanceof ApiError) {
    const code = cause.code ?? '';
    if (cause.status === 403 || code === 'AREA_SCOPE_FORBIDDEN') {
      return {
        message: 'Out of your assigned area scope: this destination is outside your assigned LGU area.',
        refresh: false,
      };
    }
    if (cause.status === 409) {
      if (code === 'SPOT_ALREADY_LINKED_TO_MERCHANT') {
        return {
          message: 'Conflict (409): this destination is already linked to another active Local Partner.',
          refresh: true,
        };
      }
      if (code === 'SPOT_NOT_PUBLISHED') {
        return {
          message: 'Conflict (409): only published destinations can be linked to a Local Partner.',
          refresh: true,
        };
      }
      if (code === 'CLAIM_ALREADY_REVIEWED') {
        return {
          message: 'This claim was already reviewed or cancelled by someone else. Queue refreshed.',
          refresh: true,
        };
      }
      return {
        message: cause.message || 'Conflict (409): this destination link could not be completed.',
        refresh: true,
      };
    }
  }
  return {
    message: describeError(cause, 'Unable to submit the claim review decision.'),
    refresh: false,
  };
};

export function MerchantSpotClaimsPage() {
  const { navigate } = useRouter();
  const selectedAreaId = useSelectedAreaId();
  const [statusFilter, setStatusFilter] = useUrlFilterState('status', 'pending');
  const activeStatus: ClaimStatusFilter =
    STATUS_TABS.some((tab) => tab.value === statusFilter) ? (statusFilter as ClaimStatusFilter) : 'pending';

  const [claims, setClaims] = useState<AdminMerchantSpotClaim[]>([]);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [confirmDecision, setConfirmDecision] = useState<'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadClaims = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const [rows, pendingRows] = await Promise.all([
        apiFetch<AdminMerchantSpotClaim[]>(`/admin/merchant-spot-claims?status=${activeStatus}`, { signal }),
        activeStatus === 'pending'
          ? Promise.resolve<AdminMerchantSpotClaim[] | null>(null)
          : apiFetch<AdminMerchantSpotClaim[]>('/admin/merchant-spot-claims?status=pending', { signal }).catch(() => null),
      ]);
      const list = Array.isArray(rows) ? rows : [];
      const areaScoped = selectedAreaId
        ? list.filter((row) => !row.town_area_id && !row.barangay_area_id
            ? true
            : row.town_area_id === selectedAreaId || row.barangay_area_id === selectedAreaId)
        : list;
      setClaims(areaScoped);

      if (activeStatus === 'pending') {
        setPendingCount(areaScoped.length);
      } else if (Array.isArray(pendingRows)) {
        const scopedPending = selectedAreaId
          ? pendingRows.filter((row) => !row.town_area_id && !row.barangay_area_id
              ? true
              : row.town_area_id === selectedAreaId || row.barangay_area_id === selectedAreaId)
          : pendingRows;
        setPendingCount(scopedPending.length);
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (cause instanceof ApiError && cause.status === 403) {
        setError('You do not have permission to review Local Partner location claims.');
      } else {
        setError(describeError(cause, 'Unable to load Local Partner location claims.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [activeStatus, selectedAreaId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadClaims(controller.signal);
    return () => controller.abort();
  }, [loadClaims]);

  const filteredClaims = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return claims;
    return claims.filter((claim) =>
      [
        claim.merchant_name,
        claim.spot_name,
        claim.spot_municipality,
        claim.owner_display_name,
        claim.owner_handle,
        claim.merchant_category,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [claims, search]);

  useEffect(() => {
    if (filteredClaims.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filteredClaims.some((claim) => claim.id === selectedId)) {
      setSelectedId(filteredClaims[0].id);
    }
  }, [filteredClaims, selectedId]);

  const selectedClaim = useMemo(
    () => filteredClaims.find((claim) => claim.id === selectedId) ?? null,
    [filteredClaims, selectedId],
  );

  const selectClaim = (claimId: string) => {
    setSelectedId(claimId);
    setConfirmDecision(null);
    setActionError('');
    setActionFeedback('');
    setReviewNote('');
  };

  const handleStatusTab = (nextStatus: ClaimStatusFilter) => {
    setConfirmDecision(null);
    setActionError('');
    setActionFeedback('');
    setReviewNote('');
    setStatusFilter(nextStatus);
    navigate(nextStatus === 'pending' ? '/partners/merchant-claims' : `/partners/merchant-claims?status=${nextStatus}`);
  };

  const trimmedNoteLength = reviewNote.trim().length;
  const noteValid = trimmedNoteLength >= 3 && trimmedNoteLength <= 300;

  const beginConfirmation = (decision: 'approve' | 'reject') => {
    setActionError('');
    setActionFeedback('');
    if (!noteValid) {
      setActionError('Enter a review note between 3 and 300 characters before submitting.');
      return;
    }
    setConfirmDecision(decision);
  };

  const submitReview = async () => {
    if (!selectedClaim || !confirmDecision) return;
    if (!noteValid) {
      setActionError('Enter a review note between 3 and 300 characters before submitting.');
      return;
    }
    try {
      setSubmitting(true);
      setActionError('');
      const result = await apiFetch<{
        id: string;
        status: string;
        competing_rejected?: number;
      }>(`/admin/merchant-spot-claims/${selectedClaim.id}/review`, {
        method: 'POST',
        body: {
          decision: confirmDecision,
          review_note: reviewNote.trim(),
        },
      });
      const actionVerb = confirmDecision === 'approve' ? 'Approved' : 'Rejected';
      const competingSuffix =
        confirmDecision === 'approve' && (result?.competing_rejected ?? 0) > 0
          ? ` (${result.competing_rejected} competing pending claim(s) automatically rejected.)`
          : '';
      setActionFeedback(`${actionVerb} link claim for ${selectedClaim.merchant_name} → ${selectedClaim.spot_name}.${competingSuffix}`);
      setConfirmDecision(null);
      setReviewNote('');
      window.dispatchEvent(new CustomEvent('jdq:merchant-claims-changed'));
      await loadClaims();
    } catch (cause) {
      const mapped = mapClaimReviewError(cause);
      setActionError(mapped.message);
      setConfirmDecision(null);
      if (mapped.refresh) {
        window.dispatchEvent(new CustomEvent('jdq:merchant-claims-changed'));
        await loadClaims();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const safeProofUrl = isSafeProofUrl(selectedClaim?.proof_url);
  const targetLat = selectedClaim?.spot_lat != null ? Number(selectedClaim.spot_lat) : Number.NaN;
  const targetLng = selectedClaim?.spot_lng != null ? Number(selectedClaim.spot_lng) : Number.NaN;
  const hasCoords = Number.isFinite(targetLat) && Number.isFinite(targetLng);

  return (
    <div>
      <PageHeader
        title="Partner location claims"
        description="Verify merchant ownership claims before linking a published Pangasinan destination as a Local Partner."
      />

      <div className="filter-row" role="navigation" aria-label="Partners views">
        <button
          type="button"
          className="filter-chip"
          onClick={() => navigate('/partners/merchants')}
        >
          Merchants directory
        </button>
        <button
          type="button"
          className="filter-chip is-active"
          aria-current="page"
          onClick={() => navigate('/partners/merchant-claims')}
        >
          Location claims
          {pendingCount != null && pendingCount > 0 ? (
            <span className="claims-tab-count" aria-label={`${pendingCount} pending claims`}>
              {pendingCount}
            </span>
          ) : null}
        </button>
      </div>

      {actionFeedback ? (
        <div className="claim-feedback-ok" role="status">
          {actionFeedback}
        </div>
      ) : null}

      {error ? (
        <div className="load-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void loadClaims()}>
            Retry
          </button>
        </div>
      ) : null}

      <div className="filter-row" role="tablist" aria-label="Claim status filter">
        <span className="filter-label">Status</span>
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeStatus === tab.value}
            className={`filter-chip${activeStatus === tab.value ? ' is-active' : ''}`}
            onClick={() => handleStatusTab(tab.value)}
          >
            {tab.label}
            {tab.value === 'pending' && pendingCount != null ? ` (${pendingCount})` : ''}
          </button>
        ))}
        <div className="merchant-search" style={{ marginLeft: 'auto' }}>
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search merchant, destination, town or @handle…"
            aria-label="Search location claims"
          />
        </div>
      </div>

      {loading ? (
        <div className="stitch-panel loading-panel">Loading Local Partner location claims…</div>
      ) : filteredClaims.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <MapPin size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No {activeStatus === 'all' ? '' : `${activeStatus} `}location claims match this filter.</p>
        </div>
      ) : (
        <div className="claims-layout">
          <div className="claims-list" role="list" aria-label="Merchant location claims queue">
            {filteredClaims.map((claim) => {
              const selected = claim.id === selectedClaim?.id;
              return (
                <button
                  key={claim.id}
                  type="button"
                  role="listitem"
                  className={`stitch-card claim-card${selected ? ' is-selected' : ''}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => selectClaim(claim.id)}
                >
                  <div className="claim-card-head">
                    <span className={`status-pill status-${claim.status}`}>{claim.status}</span>
                    <span className="destination-meta">{new Date(claim.created_at).toLocaleDateString()}</span>
                  </div>
                  <h3 className="destination-title">{claim.merchant_name}</h3>
                  <p className="destination-location">
                    Target: <strong>{claim.spot_name}</strong>
                    {claim.spot_municipality ? ` · ${claim.spot_municipality}` : ''}
                  </p>
                  <p className="destination-meta">
                    Submitted by {claim.owner_display_name || 'Merchant owner'}
                    {claim.owner_handle ? ` (@${claim.owner_handle})` : ''}
                  </p>
                </button>
              );
            })}
          </div>

          {selectedClaim ? (
            <section className="stitch-panel claim-detail" aria-label="Selected claim details">
              <div className="claim-card-head">
                <div>
                  <div className="destination-tags">
                    <span className={`status-pill status-${selectedClaim.status}`}>{selectedClaim.status}</span>
                    {selectedClaim.spot_source_type ? (
                      <span className="destination-tag">{formatSourceType(selectedClaim.spot_source_type)}</span>
                    ) : null}
                    {selectedClaim.merchant_category ? (
                      <span className="destination-tag">{selectedClaim.merchant_category.replace(/_/g, ' ')}</span>
                    ) : null}
                  </div>
                  <h2 style={{ marginTop: 8 }}>{selectedClaim.merchant_name}</h2>
                  <p className="destination-meta">
                    Requested {new Date(selectedClaim.created_at).toLocaleString()}
                  </p>
                </div>
                <Store size={22} aria-hidden="true" style={{ color: '#582f0e', flexShrink: 0 }} />
              </div>

              <div className="merchant-detail-grid" style={{ marginTop: 14 }}>
                <div>
                  <span>Target destination</span>
                  <strong>{selectedClaim.spot_name}</strong>
                </div>
                <div>
                  <span>Municipality</span>
                  <strong>{selectedClaim.spot_municipality || 'Not set'}</strong>
                </div>
                <div>
                  <span>Source type</span>
                  <strong>{formatSourceType(selectedClaim.spot_source_type)}</strong>
                </div>
                <div>
                  <span>Merchant owner</span>
                  <strong>
                    {selectedClaim.owner_display_name || 'Owner'}
                    {selectedClaim.owner_handle ? ` (@${selectedClaim.owner_handle})` : ''}
                  </strong>
                </div>
              </div>

              <div className="merchant-detail-section">
                <h3>Destination pin verification</h3>
                {hasCoords ? (
                  <AdminMiniMapPreview
                    spotOnly
                    badgeLabel={selectedClaim.spot_municipality || selectedClaim.spot_name}
                    targetLat={targetLat}
                    targetLng={targetLng}
                    capturedLat={targetLat}
                    capturedLng={targetLng}
                    questTitle={selectedClaim.spot_name}
                    userName={selectedClaim.merchant_name}
                    radiusMeters={100}
                    distanceMeters={0}
                  />
                ) : (
                  <p className="destination-meta">No GPS coordinates stored on this destination.</p>
                )}
              </div>

              <div className="merchant-detail-section">
                <h3>Submitted ownership note &amp; proof</h3>
                <div className="claim-note-box">
                  {selectedClaim.note?.trim() ? selectedClaim.note : 'No justification note submitted.'}
                </div>
                {safeProofUrl ? (
                  <a
                    href={safeProofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="claim-proof-link"
                  >
                    <span>Open ownership proof</span>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ) : (
                  <p className="destination-meta" style={{ marginTop: 8 }}>No proof URL attached.</p>
                )}
              </div>

              {selectedClaim.status === 'pending' ? (
                <div className="merchant-detail-section claim-review-form">
                  <h3>Moderator decision</h3>
                  <label className="claim-review-label" htmlFor="claim-review-note">
                    <span>Review note (3–300 characters)</span>
                    <span>{trimmedNoteLength} / 300</span>
                  </label>
                  <textarea
                    id="claim-review-note"
                    className="claim-review-textarea"
                    value={reviewNote}
                    maxLength={300}
                    placeholder="Record verification findings (e.g., confirmed business permit & storefront pin)."
                    onChange={(event) => {
                      setReviewNote(event.target.value);
                      if (actionError) setActionError('');
                    }}
                  />

                  {actionError ? (
                    <div className="load-error" role="alert">
                      {actionError}
                    </div>
                  ) : null}

                  {confirmDecision ? (
                    <div className="claim-confirm-box" role="region" aria-label="Confirm claim decision">
                      <p>
                        {confirmDecision === 'approve'
                          ? `Confirm approval? "${selectedClaim.merchant_name}" will link to "${selectedClaim.spot_name}" and appear as a Local Partner on published maps. Any other pending claims for this destination will be rejected automatically.`
                          : `Confirm rejection? "${selectedClaim.merchant_name}" will be notified with your review note.`}
                      </p>
                      <div className="claim-action-row">
                        <button
                          type="button"
                          className={confirmDecision === 'approve' ? 'button-approve' : 'button-danger'}
                          disabled={submitting}
                          onClick={() => void submitReview()}
                        >
                          <ShieldCheck size={15} aria-hidden="true" />
                          {submitting
                            ? 'Submitting…'
                            : confirmDecision === 'approve'
                              ? 'Confirm approval'
                              : 'Confirm rejection'}
                        </button>
                        <button
                          type="button"
                          className="button-muted"
                          disabled={submitting}
                          onClick={() => setConfirmDecision(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="claim-action-row">
                      <button
                        type="button"
                        className="button-approve"
                        disabled={submitting}
                        onClick={() => beginConfirmation('approve')}
                      >
                        Approve claim
                      </button>
                      <button
                        type="button"
                        className="button-reject"
                        disabled={submitting}
                        onClick={() => beginConfirmation('reject')}
                      >
                        Reject claim
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="merchant-detail-section">
                  <h3>Review audit</h3>
                  <div className="claim-note-box">
                    <p>
                      <strong>Decision:</strong> {selectedClaim.status}
                      {selectedClaim.reviewer_handle ? ` by @${selectedClaim.reviewer_handle}` : ''}
                      {selectedClaim.reviewed_at ? ` on ${new Date(selectedClaim.reviewed_at).toLocaleString()}` : ''}
                    </p>
                    <p style={{ marginTop: 6 }}>
                      <strong>Review note:</strong> {selectedClaim.review_note || 'No review note recorded.'}
                    </p>
                  </div>
                </div>
              )}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
