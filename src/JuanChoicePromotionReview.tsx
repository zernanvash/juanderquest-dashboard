import React, { useCallback, useEffect, useState } from 'react';

export type AssessmentDecision = 'cleared' | 'restricted';

export interface PromotionAssessmentRow {
  id: string;
  candidate_id: string;
  assessed_by: string;
  revision: number | string;
  decision: AssessmentDecision;
  reason: string;
  assessed_at: string;
  valid_until: string;
  is_test: boolean;
}

export interface CandidatePromotionAssessmentResponse {
  eligible: boolean;
  eligibility_reason: string | null;
  latest_assessment: PromotionAssessmentRow | null;
  crowd_status: string;
  crowd_confidence: string;
}

export interface JuanChoicePromotionReviewProps {
  campaignId: string;
  candidateId: string;
  candidateName: string;
  token: string;
  isQaCampaign: boolean;
  onUnauthorized: () => void;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatLocalDateTimeLocal(d: Date): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hours = pad2(d.getHours());
  const minutes = pad2(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getDefaultValidUntilIso(): string {
  // Default to 48 hours in the future using local date/time parts (within maximum 7 days limit)
  const d = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return formatLocalDateTimeLocal(d);
}

export function formatEligibilityReason(code: string | null | undefined): string {
  if (!code || code === 'NONE') return '';
  switch (code) {
    case 'CANDIDATE_NOT_FOUND':
      return 'Candidate not found or ineligible';
    case 'SCOPE_MISMATCH':
      return 'Campaign, candidate, or destination scope mismatch';
    case 'SPOT_UNPUBLISHED':
      return 'Destination is not published';
    case 'SPOT_SUPPRESSED':
      return 'Destination suppressed by moderation';
    case 'CANDIDATE_NOT_ELIGIBLE':
      return 'Candidate is not marked eligible';
    case 'ESTIMATED_BUSY':
      return 'High visitor crowd pressure';
    case 'NO_PROMOTION_ASSESSMENT':
      return 'Pending moderator review';
    case 'ASSESSMENT_RESTRICTED':
      return 'Suspended by moderation team';
    case 'INVALID_ASSESSMENT_DATES':
      return 'Invalid assessment timestamp or validity window';
    case 'ASSESSMENT_FUTURE_DATED':
      return 'Assessment effective date is in the future';
    case 'ASSESSMENT_EXPIRED':
      return 'Moderator clearance has expired';
    default:
      return `Withheld (${code.toLowerCase().replace(/_/g, ' ')})`;
  }
}

export function JuanChoicePromotionReview({
  campaignId,
  candidateId,
  candidateName,
  token,
  isQaCampaign,
  onUnauthorized,
}: JuanChoicePromotionReviewProps) {
  const [data, setData] = useState<CandidatePromotionAssessmentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [conflictWarning, setConflictWarning] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form draft state
  const [decision, setDecision] = useState<AssessmentDecision>('cleared');
  const [reason, setReason] = useState('');
  const [validUntil, setValidUntil] = useState<string>(getDefaultValidUntilIso());

  const fetchAssessment = useCallback(async (signal?: AbortSignal): Promise<boolean> => {
    if (!campaignId || !candidateId) return false;
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch(
        `/api/v1/juanchoice/admin/campaigns/${encodeURIComponent(campaignId)}/candidates/${encodeURIComponent(candidateId)}/promotion-assessment`,
        {
          signal,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        throw new Error('Administrator session expired.');
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || 'Failed to fetch promotion review.');
      }
      setData(json.data);
      return true;
    } catch (err: unknown) {
      if (signal?.aborted) return false;
      // Stale details must be hidden on error
      setData(null);
      const msg = err instanceof Error ? err.message : 'Failed to fetch promotion review.';
      setFetchError(msg);
      return false;
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [campaignId, candidateId, token, onUnauthorized]);

  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    void fetchAssessment(controller.signal);
    return () => {
      controller.abort();
    };
  }, [campaignId, candidateId, fetchAssessment]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10 || trimmedReason.length > 1000) {
      setSubmitError('Rationale must be between 10 and 1000 characters.');
      return;
    }

    if (!validUntil) {
      setSubmitError('Validity expiry date is required.');
      return;
    }

    const parsedTime = Date.parse(validUntil);
    if (!Number.isFinite(parsedTime)) {
      setSubmitError('Invalid expiry date format.');
      return;
    }

    const validUntilDate = new Date(parsedTime);
    const now = Date.now();
    if (validUntilDate.getTime() <= now) {
      setSubmitError('Expiry must be in the future.');
      return;
    }
    const maxExpiry = now + 7 * 24 * 60 * 60 * 1000;
    if (validUntilDate.getTime() > maxExpiry) {
      setSubmitError('Expiry cannot exceed exactly 7 days from now.');
      return;
    }

    // Require current assessment data to be loaded for revision control
    if (!data) {
      setSubmitError('Current assessment state is unavailable. Please reload before saving.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setConflictWarning('');

    const expectedRevision = data?.latest_assessment
      ? Number(data.latest_assessment.revision)
      : 0;

    let isoString: string;
    try {
      isoString = validUntilDate.toISOString();
    } catch {
      setSubmitError('Invalid expiry date.');
      setSubmitting(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/v1/juanchoice/admin/campaigns/${encodeURIComponent(campaignId)}/candidates/${encodeURIComponent(candidateId)}/promotion-assessment`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            decision,
            reason: trimmedReason,
            valid_until: isoString,
            expected_revision: expectedRevision,
          }),
        }
      );

      if (res.status === 401 || res.status === 403) {
        onUnauthorized();
        throw new Error('Administrator session expired.');
      }

      const json = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // Refresh assessment state while preserving draft
        const refreshed = await fetchAssessment();
        if (refreshed) {
          setConflictWarning('Another moderator changed the review revision. The latest assessment was reloaded; please verify before saving again.');
        } else {
          setConflictWarning('Another moderator changed the review revision, but reloading latest state failed. Please retry to load current state before saving.');
        }
        return;
      }

      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || json.error?.code || 'Failed to save review.');
      }

      // Success: reload assessment and close form
      setShowForm(false);
      setReason('');
      await fetchAssessment();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save review.';
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Render review badge / status
  const latest = data?.latest_assessment;
  const isExpired = latest ? new Date(latest.valid_until).getTime() <= Date.now() : false;

  let reviewStateLabel = 'Awaiting review';
  let reviewStateColor = '#7d5800'; // Amber/brown
  let reviewStateBg = '#fef3c7';

  if (data?.crowd_status === 'estimated_busy') {
    reviewStateLabel = 'Currently busy (promotion withheld)';
    reviewStateColor = '#991b1b';
    reviewStateBg = '#fee2e2';
  } else if (!latest) {
    reviewStateLabel = 'Awaiting review';
    reviewStateColor = '#7d5800';
    reviewStateBg = '#fef3c7';
  } else if (latest.decision === 'restricted') {
    reviewStateLabel = 'Promotion restricted';
    reviewStateColor = '#991b1b';
    reviewStateBg = '#fee2e2';
  } else if (isExpired) {
    reviewStateLabel = `Clearance expired (${new Date(latest.valid_until).toLocaleDateString()})`;
    reviewStateColor = '#9a3412';
    reviewStateBg = '#ffedd5';
  } else {
    reviewStateLabel = `Cleared through ${new Date(latest.valid_until).toLocaleDateString()}`;
    reviewStateColor = '#166534';
    reviewStateBg = '#dcfce7';
  }

  // Format crowd estimates (never claim unknown is quiet or clearance proves uncrowded)
  const crowdEst = data?.crowd_status ? data.crowd_status.replace('_', ' ') : 'unknown';
  const confidenceEst = data?.crowd_confidence || 'none';

  return (
    <div
      data-testid={`promotion-review-card-${candidateId}`}
      style={{
        marginTop: 10,
        padding: 12,
        background: '#fbfaf8',
        border: '1px solid #e7e4dc',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13, color: '#332a1e' }}>Promotion review:</strong>
          {isQaCampaign && (
            <span
              data-testid="qa-campaign-badge"
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#6b21a8',
                background: '#f3e8ff',
                padding: '2px 6px',
                borderRadius: 4,
              }}
            >
              [QA Round]
            </span>
          )}
          {loading ? (
            <span role="status" style={{ color: '#736b5e' }}>Loading review…</span>
          ) : fetchError ? (
            <span role="alert" style={{ color: '#b91c1c' }}>
              {fetchError}{' '}
              <button
                type="button"
                onClick={() => void fetchAssessment()}
                style={{
                  marginLeft: 6,
                  minHeight: 44,
                  padding: '6px 12px',
                  fontSize: 12,
                  textDecoration: 'underline',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#b91c1c',
                }}
              >
                Retry
              </button>
            </span>
          ) : (
            <span
              data-testid="promotion-state-badge"
              style={{
                fontSize: 12,
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: 6,
                color: reviewStateColor,
                background: reviewStateBg,
              }}
            >
              {reviewStateLabel}
            </span>
          )}
        </div>

        {!loading && !fetchError && (
          <button
            type="button"
            data-testid="toggle-review-form-btn"
            onClick={() => {
              setShowForm(!showForm);
              setSubmitError('');
              setConflictWarning('');
              if (!showForm) {
                // If opening, re-initialize validUntil
                setValidUntil(getDefaultValidUntilIso());
              }
            }}
            style={{
              fontSize: 12,
              fontWeight: 600,
              minHeight: 44,
              padding: '8px 14px',
              borderRadius: 6,
              background: showForm ? '#e5e2da' : '#3f6653',
              color: showForm ? '#332a1e' : '#ffffff',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {showForm ? 'Cancel review' : 'Assess promotion'}
          </button>
        )}
      </div>

      {!loading && !fetchError && data && (
        <div style={{ marginTop: 8, color: '#5b5346', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div>
            <span>Crowd status estimate: <strong>{crowdEst}</strong> (confidence: {confidenceEst}). </span>
            <span style={{ fontSize: 11, color: '#78716c' }}>
              Estimates are derived from rolling 24-hr activity; unknown evidence is not proof of quiet conditions.
            </span>
          </div>

          {latest && (
            <div style={{ marginTop: 4, padding: 8, background: '#f5f3ef', borderRadius: 6 }}>
              <div>
                <strong>Rev {latest.revision} ({latest.decision}):</strong> “{latest.reason}”
              </div>
              <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
                Assessed {new Date(latest.assessed_at).toLocaleString()} · Valid until {new Date(latest.valid_until).toLocaleString()}
              </div>
            </div>
          )}

          {data.eligibility_reason && data.eligibility_reason !== 'NONE' && (
            <div style={{ fontSize: 11, color: data.eligible ? '#166534' : '#991b1b', marginTop: 2 }}>
              Spotlight gate: {formatEligibilityReason(data.eligibility_reason)} ({data.eligible ? 'eligible' : 'ineligible'})
            </div>
          )}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          data-testid="promotion-review-form"
          style={{
            marginTop: 12,
            padding: 12,
            background: '#ffffff',
            border: '1px solid #dcd7cc',
            borderRadius: 8,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 12, color: '#44403c', lineHeight: 1.4 }}>
            <strong>Note:</strong> Clearing permits spotlight promotion only while real-time crowd and safety gates pass. Restricting immediately suspends promotion.
          </div>

          {conflictWarning && (
            <div role="alert" style={{ color: '#b45309', background: '#fef3c7', padding: 8, borderRadius: 6, fontSize: 12 }}>
              {conflictWarning}
            </div>
          )}

          {submitError && (
            <div role="alert" style={{ color: '#b91c1c', background: '#fee2e2', padding: 8, borderRadius: 6, fontSize: 12 }}>
              {submitError}
            </div>
          )}

          <fieldset
            data-testid="decision-fieldset"
            style={{
              border: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
            }}
          >
            <legend style={{ fontWeight: 700, fontSize: 12, marginBottom: 6, width: '100%' }}>
              Decision for {candidateName}:
            </legend>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                minHeight: 44,
                padding: '4px 8px',
                borderRadius: 6,
                background: '#faf9f5',
                border: '1px solid #e7e4dc',
              }}
            >
              <input
                type="radio"
                name={`decision-${candidateId}`}
                value="cleared"
                checked={decision === 'cleared'}
                onChange={() => setDecision('cleared')}
                style={{ width: 18, height: 18 }}
              />
              Clear for promotion
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                minHeight: 44,
                padding: '4px 8px',
                borderRadius: 6,
                background: '#faf9f5',
                border: '1px solid #e7e4dc',
              }}
            >
              <input
                type="radio"
                name={`decision-${candidateId}`}
                value="restricted"
                checked={decision === 'restricted'}
                onChange={() => setDecision('restricted')}
                style={{ width: 18, height: 18 }}
              />
              Restrict promotion
            </label>
          </fieldset>

          <label style={{ display: 'grid', gap: 4, fontWeight: 600, fontSize: 12 }}>
            Review rationale (10–1000 characters):
            <textarea
              required
              rows={3}
              minLength={10}
              maxLength={1000}
              value={reason}
              placeholder="State rationale regarding destination capacity, safety, or field checks…"
              onChange={(e) => setReason(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontFamily: 'inherit',
                fontSize: 13,
                minHeight: 80,
              }}
            />
            <span style={{ fontSize: 11, color: reason.trim().length < 10 ? '#b91c1c' : '#78716c' }}>
              {reason.trim().length} / 1000 characters (min 10)
            </span>
          </label>

          <label style={{ display: 'grid', gap: 4, fontWeight: 600, fontSize: 12 }}>
            Validity expiration (maximum 7 days from now):
            <input
              type="datetime-local"
              required
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              style={{
                padding: 10,
                borderRadius: 6,
                border: '1px solid #ccc',
                fontSize: 13,
                boxSizing: 'border-box',
                width: '100%',
                maxWidth: 280,
                minHeight: 44,
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <button
              type="submit"
              disabled={submitting || !data}
              style={{
                background: decision === 'cleared' ? '#2d6a4f' : '#b91c1c',
                color: '#ffffff',
                fontWeight: 700,
                minHeight: 44,
                padding: '10px 18px',
                borderRadius: 6,
                border: 'none',
                cursor: (submitting || !data) ? 'not-allowed' : 'pointer',
                opacity: (!data || submitting) ? 0.6 : 1,
              }}
            >
              {submitting ? 'Saving…' : `Submit ${decision} review`}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setShowForm(false);
                setSubmitError('');
                setConflictWarning('');
              }}
              style={{
                background: '#e5e2da',
                color: '#332a1e',
                fontWeight: 600,
                minHeight: 44,
                padding: '10px 18px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
