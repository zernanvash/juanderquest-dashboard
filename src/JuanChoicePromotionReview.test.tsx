import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  JuanChoicePromotionReview,
  formatLocalDateTimeLocal,
  getDefaultValidUntilIso,
  formatEligibilityReason,
} from './JuanChoicePromotionReview';
import { JuanChoiceAdmin } from './JuanChoiceAdmin';

describe('JuanChoicePromotionReview component', () => {
  const onUnauthorized = vi.fn();
  const token = 'test-admin-token';
  const campaignId = 'camp-123';
  const candidateId = 'cand-456';
  const candidateName = 'Hundred Islands National Park';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders initial loading state then displays "Awaiting review" when no prior assessment exists', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'unknown',
              crowd_confidence: 'none',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    // Initial loading indicator
    expect(screen.getByRole('status')).toHaveTextContent(/Loading review…/i);

    // Resolves to awaiting review
    const badge = await screen.findByTestId('promotion-state-badge');
    expect(badge).toHaveTextContent('Awaiting review');

    // Crowd description acknowledges estimates without assuming unknown is quiet
    expect(screen.getByText(/Crowd status estimate:/i)).toBeInTheDocument();
    expect(screen.getByText(/unknown evidence is not proof of quiet conditions/i)).toBeInTheDocument();
  });

  it('displays loading failure and allows individual card retry', async () => {
    let callCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'Review service temporarily unavailable' },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'moderate',
              crowd_confidence: 'low',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Review service temporarily unavailable/i);

    // Click retry button
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    // Second call succeeds
    const badge = await screen.findByTestId('promotion-state-badge');
    expect(badge).toHaveTextContent('Awaiting review');
    expect(callCount).toBe(2);
  });

  it('submits a cleared POST with exact expected revision and reloads review state', async () => {
    let postBody: any = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/promotion-assessment')) {
        if (init?.method === 'POST') {
          postBody = JSON.parse(init.body as string);
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              data: {
                id: 'assessment-uuid-1',
                candidate_id: candidateId,
                assessed_by: 'admin-1',
                revision: 1,
                decision: postBody.decision,
                reason: postBody.reason,
                assessed_at: new Date().toISOString(),
                valid_until: postBody.valid_until,
                is_test: false,
              },
            }),
          });
        }
        // GET returns latest revision 0 initially, then 1 after POST
        const rev = postBody ? 1 : null;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: rev !== null,
              eligibility_reason: rev !== null ? 'NONE' : 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: rev
                ? {
                    id: 'assessment-uuid-1',
                    candidate_id: candidateId,
                    assessed_by: 'admin-1',
                    revision: 1,
                    decision: 'cleared',
                    reason: 'Verified park capacity and access conditions on field check.',
                    assessed_at: new Date().toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    is_test: false,
                  }
                : null,
              crowd_status: 'low',
              crowd_confidence: 'medium',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    await screen.findByTestId('promotion-state-badge');

    // Open assessment form
    fireEvent.click(screen.getByTestId('toggle-review-form-btn'));

    // Fill form
    const textarea = screen.getByLabelText(/Review rationale/i);
    fireEvent.change(textarea, {
      target: { value: 'Verified park capacity and access conditions on field check.' },
    });

    // Submit cleared review
    const submitBtn = screen.getByRole('button', { name: /Submit cleared review/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody.decision).toBe('cleared');
    expect(postBody.expected_revision).toBe(0);
    expect(postBody.reason).toBe('Verified park capacity and access conditions on field check.');
    expect(new Date(postBody.valid_until).getTime()).toBeGreaterThan(Date.now());

    // Verified badge updates
    expect(await screen.findByText(/Cleared through/i)).toBeInTheDocument();
  });

  it('submits a restricted POST when candidate has existing revision and expects revision 1', async () => {
    let postBody: any = null;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/promotion-assessment')) {
        if (init?.method === 'POST') {
          postBody = JSON.parse(init.body as string);
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              success: true,
              data: {
                id: 'assessment-uuid-2',
                candidate_id: candidateId,
                assessed_by: 'admin-1',
                revision: 2,
                decision: 'restricted',
                reason: postBody.reason,
                assessed_at: new Date().toISOString(),
                valid_until: postBody.valid_until,
                is_test: false,
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: postBody ? false : true,
              eligibility_reason: postBody ? 'ASSESSMENT_RESTRICTED' : 'NONE',
              latest_assessment: postBody
                ? {
                    id: 'assessment-uuid-2',
                    candidate_id: candidateId,
                    assessed_by: 'admin-1',
                    revision: 2,
                    decision: 'restricted',
                    reason: postBody.reason,
                    assessed_at: new Date().toISOString(),
                    valid_until: postBody.valid_until,
                    is_test: false,
                  }
                : {
                    id: 'assessment-uuid-1',
                    candidate_id: candidateId,
                    assessed_by: 'admin-1',
                    revision: 1,
                    decision: 'cleared',
                    reason: 'Prior clearance rationale.',
                    assessed_at: new Date(Date.now() - 3600000).toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    is_test: false,
                  },
              crowd_status: 'low',
              crowd_confidence: 'medium',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    // Initial state: Cleared through ...
    expect(await screen.findByText(/Cleared through/i)).toBeInTheDocument();

    // Open form
    fireEvent.click(screen.getByTestId('toggle-review-form-btn'));

    // Select restrict
    fireEvent.click(screen.getByLabelText(/Restrict promotion/i));

    // Fill rationale
    fireEvent.change(screen.getByLabelText(/Review rationale/i), {
      target: { value: 'High tidal surge warning and route maintenance require suspension.' },
    });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Submit restricted review/i }));

    await waitFor(() => expect(postBody).not.toBeNull());
    expect(postBody.decision).toBe('restricted');
    expect(postBody.expected_revision).toBe(1);
    expect(postBody.reason).toBe('High tidal surge warning and route maintenance require suspension.');

    expect(await screen.findByText(/Promotion restricted/i)).toBeInTheDocument();
  });

  it('handles 409 conflict with successful refetch: warns operator, refreshes latest state, and preserves typed draft', async () => {
    let getCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/promotion-assessment')) {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              success: false,
              error: {
                code: 'CONFLICT_REVISION_MISMATCH',
                message: 'Stale assessment revision; another operator modified this candidate.',
              },
            }),
          });
        }
        getCallCount++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: getCallCount > 1 ? 'ASSESSMENT_RESTRICTED' : 'NONE',
              latest_assessment: getCallCount > 1
                ? {
                    id: 'assessment-concurrent',
                    candidate_id: candidateId,
                    assessed_by: 'other-admin',
                    revision: 1,
                    decision: 'restricted',
                    reason: 'Concurrent operator marked restricted due to sudden rain.',
                    assessed_at: new Date().toISOString(),
                    valid_until: new Date(Date.now() + 86400000).toISOString(),
                    is_test: false,
                  }
                : null,
              crowd_status: 'low',
              crowd_confidence: 'medium',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    await screen.findByTestId('promotion-state-badge');

    // Open form & type draft
    fireEvent.click(screen.getByTestId('toggle-review-form-btn'));
    const textarea = screen.getByLabelText(/Review rationale/i);
    fireEvent.change(textarea, {
      target: { value: 'My carefully formulated justification that should not be wiped.' },
    });

    // Submit -> triggers 409
    fireEvent.click(screen.getByRole('button', { name: /Submit cleared review/i }));

    // Expect verified conflict reload message
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/The latest assessment was reloaded; please verify before saving again/i);

    // The draft content is still present in textarea!
    expect((screen.getByLabelText(/Review rationale/i) as HTMLTextAreaElement).value).toBe(
      'My carefully formulated justification that should not be wiped.'
    );

    // Review state refreshed to the new revision 1
    expect(await screen.findByText(/Promotion restricted/i)).toBeInTheDocument();
  });

  it('handles 409 conflict with failed refetch: warns operator of reload failure, preserves draft, hides stale data, and disables save', async () => {
    let getCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/promotion-assessment')) {
        if (init?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: async () => ({
              success: false,
              error: { code: 'CONFLICT_REVISION_MISMATCH', message: 'Revision mismatch.' },
            }),
          });
        }
        getCallCount++;
        if (getCallCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                eligible: true,
                eligibility_reason: 'NONE',
                latest_assessment: {
                  id: 'ass-1',
                  candidate_id: candidateId,
                  assessed_by: 'admin-1',
                  revision: 1,
                  decision: 'cleared',
                  reason: 'Original reason.',
                  assessed_at: new Date().toISOString(),
                  valid_until: new Date(Date.now() + 86400000).toISOString(),
                  is_test: false,
                },
                crowd_status: 'low',
                crowd_confidence: 'high',
              },
            }),
          });
        }
        // Second GET (triggered by 409) fails with 500
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Database query timed out.' },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    await screen.findByTestId('promotion-state-badge');
    expect(screen.getByText(/Original reason/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('toggle-review-form-btn'));

    const textarea = screen.getByLabelText(/Review rationale/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Crucial rationale entered by user.' } });

    // Submit -> triggers 409 -> initiates background refetch which fails
    const submitBtn = screen.getByRole('button', { name: /Submit cleared review/i });
    fireEvent.click(submitBtn);

    // Conflict alert warns that reloading latest state failed; does NOT claim reload succeeded
    const conflictAlert = await screen.findByText(/reloading latest state failed/i);
    expect(conflictAlert).toBeInTheDocument();
    expect(screen.queryByText(/The latest assessment was reloaded/i)).not.toBeInTheDocument();

    // Rationale draft was preserved
    expect(textarea.value).toBe('Crucial rationale entered by user.');

    // Stale assessment details are removed from the view
    expect(screen.queryByText(/Original reason/i)).not.toBeInTheDocument();

    // Because refetch failed, data is null, submit button is disabled to prevent blind overwrite / stale resubmission
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Submit cleared review/i })).toBeDisabled();
    });
  });

  it('displays QA round badge when isQaCampaign is true', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'unknown',
              crowd_confidence: 'none',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={true}
        onUnauthorized={onUnauthorized}
      />
    );

    const qaBadge = await screen.findByTestId('qa-campaign-badge');
    expect(qaBadge).toHaveTextContent('[QA Round]');
  });

  it('formats datetime-local default from local fields across timezones without UTC slicing drift', () => {
    // Test formatLocalDateTimeLocal with a known local date instance
    const sampleDate = new Date(2026, 9, 3, 14, 5); // Oct 3, 2026 14:05 local
    expect(formatLocalDateTimeLocal(sampleDate)).toBe('2026-10-03T14:05');

    // Verify getDefaultValidUntilIso matches local date math
    const fixedNow = new Date('2026-10-01T10:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    const expectedLocal = formatLocalDateTimeLocal(new Date(fixedNow + 48 * 60 * 60 * 1000));
    expect(getDefaultValidUntilIso()).toBe(expectedLocal);
  });

  it('enforces exact 7-day boundary and rejects past or unparseable dates on the client', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'moderate',
              crowd_confidence: 'medium',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const fixedNow = new Date('2026-10-01T12:00:00.000Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(fixedNow);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    await screen.findByTestId('promotion-state-badge');
    fireEvent.click(screen.getByTestId('toggle-review-form-btn'));

    const textarea = screen.getByLabelText(/Review rationale/i);
    fireEvent.change(textarea, { target: { value: 'Valid rationale with sufficient characters.' } });

    const expiryInput = screen.getByLabelText(/Validity expiration/i);
    const submitBtn = screen.getByRole('button', { name: /Submit cleared review/i });

    // 1. Past date
    const form = screen.getByTestId('promotion-review-form');
    const pastDate = formatLocalDateTimeLocal(new Date(fixedNow - 3600000));
    fireEvent.change(expiryInput, { target: { value: pastDate } });
    fireEvent.submit(form);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Expiry must be in the future/i);

    // 2. Beyond exact 7 days (7 days + 1 hour)
    const tooFarDate = formatLocalDateTimeLocal(new Date(fixedNow + 7 * 24 * 60 * 60 * 1000 + 3600000));
    fireEvent.change(expiryInput, { target: { value: tooFarDate } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Expiry cannot exceed exactly 7 days from now/i);
    });

    // 3. Empty date
    fireEvent.change(expiryInput, { target: { value: '' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Validity expiry date is required/i);
    });
  });

  it('provides wrapping fieldset and minimum 44px hit targets for touch accessibility', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'low',
              crowd_confidence: 'low',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    // Toggle button has minHeight 44px
    const toggleBtn = await screen.findByTestId('toggle-review-form-btn');
    expect(toggleBtn).toHaveStyle({ minHeight: '44px' });

    // Open form
    fireEvent.click(toggleBtn);

    // Decision fieldset wraps on narrow viewports
    const fieldset = screen.getByTestId('decision-fieldset');
    expect(fieldset).toHaveStyle({ display: 'flex', flexWrap: 'wrap' });

    // Submit and cancel buttons have minHeight 44px
    const submitBtn = screen.getByRole('button', { name: /Submit cleared review/i });
    const cancelBtn = screen.getByRole('button', { name: /^Cancel$/i });
    expect(submitBtn).toHaveStyle({ minHeight: '44px' });
    expect(cancelBtn).toHaveStyle({ minHeight: '44px' });

    // Expiry input has minHeight 44px
    const expiryInput = screen.getByLabelText(/Validity expiration/i);
    expect(expiryInput).toHaveStyle({ minHeight: '44px' });
  });

  it('maps known eligibility codes to plain operator reasons and clears stale details on fetch error', async () => {
    // Contract alignment: verify all actual codes from backend/src/juanchoice/promotion-safety.ts
    expect(formatEligibilityReason('CANDIDATE_NOT_FOUND')).toBe('Candidate not found or ineligible');
    expect(formatEligibilityReason('SCOPE_MISMATCH')).toBe('Campaign, candidate, or destination scope mismatch');
    expect(formatEligibilityReason('SPOT_UNPUBLISHED')).toBe('Destination is not published');
    expect(formatEligibilityReason('SPOT_SUPPRESSED')).toBe('Destination suppressed by moderation');
    expect(formatEligibilityReason('CANDIDATE_NOT_ELIGIBLE')).toBe('Candidate is not marked eligible');
    expect(formatEligibilityReason('ESTIMATED_BUSY')).toBe('High visitor crowd pressure');
    expect(formatEligibilityReason('NO_PROMOTION_ASSESSMENT')).toBe('Pending moderator review');
    expect(formatEligibilityReason('ASSESSMENT_RESTRICTED')).toBe('Suspended by moderation team');
    expect(formatEligibilityReason('INVALID_ASSESSMENT_DATES')).toBe('Invalid assessment timestamp or validity window');
    expect(formatEligibilityReason('ASSESSMENT_FUTURE_DATED')).toBe('Assessment effective date is in the future');
    expect(formatEligibilityReason('ASSESSMENT_EXPIRED')).toBe('Moderator clearance has expired');
    expect(formatEligibilityReason('UNKNOWN_CODE_XYZ')).toBe('Withheld (unknown code xyz)');

    let succeed = true;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/promotion-assessment')) {
        if (!succeed) {
          return Promise.resolve({
            ok: false,
            status: 500,
            json: async () => ({
              success: false,
              error: { code: 'SERVICE_DOWN', message: 'Service unavailable' },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'ESTIMATED_BUSY',
              latest_assessment: {
                id: 'ass-busy',
                candidate_id: candidateId,
                assessed_by: 'admin-1',
                revision: 1,
                decision: 'cleared',
                reason: 'Field check was clear but crowd spiked later.',
                assessed_at: new Date().toISOString(),
                valid_until: new Date(Date.now() + 86400000).toISOString(),
                is_test: false,
              },
              crowd_status: 'estimated_busy',
              crowd_confidence: 'high',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId={candidateId}
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    // Verify initial load displays plain mapped reason
    expect(await screen.findByText(/High visitor crowd pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Field check was clear but crowd spiked later/i)).toBeInTheDocument();

    // Now trigger failure upon candidate change or re-fetch:
    // Stale assessment details must disappear and save disabled when fetch fails
    succeed = false;
    rerender(
      <JuanChoicePromotionReview
        campaignId={campaignId}
        candidateId="cand-stale-test"
        candidateName={candidateName}
        token={token}
        isQaCampaign={false}
        onUnauthorized={onUnauthorized}
      />
    );

    // Shows error alert
    expect(await screen.findByRole('alert')).toHaveTextContent(/Service unavailable/i);
    // Stale details are hidden
    expect(screen.queryByText(/Field check was clear but crowd spiked later/i)).not.toBeInTheDocument();
    // Re-assess / save is not present while in error state
    expect(screen.queryByTestId('toggle-review-form-btn')).not.toBeInTheDocument();

    // Now restore service and click Retry
    succeed = true;
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryBtn);

    // Successfully loads fresh details
    expect(await screen.findByText(/High visitor crowd pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/Field check was clear but crowd spiked later/i)).toBeInTheDocument();
  });
});

describe('JuanChoiceAdmin integration and error isolation', () => {
  const token = 'test-token';
  const onUnauthorized = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isolates candidate card review failures so one error does not break other cards', async () => {
    const campaign = {
      id: 'camp-1',
      slug: 'bolinao-w1',
      region: 'Pangasinan',
      theme: 'Pristine shores',
      status: 'scheduled',
      opens_at: new Date(Date.now() + 86400000).toISOString(),
      closes_at: new Date(Date.now() + 172800000).toISOString(),
      is_test: false,
      candidate_count: 2,
      ballot_count: 0,
    };
    const cand1 = {
      id: 'cand-1',
      spot_id: 'spot-1',
      spot_name: 'Patar Beach',
      municipality: 'Bolinao',
      status: 'eligible' as const,
      spot_status: 'published',
      crowd_capacity_band: 'high',
      recommendation_suppressed: false,
      votes: 12,
    };
    const cand2 = {
      id: 'cand-2',
      spot_id: 'spot-2',
      spot_name: 'Cape Bolinao Lighthouse',
      municipality: 'Bolinao',
      status: 'eligible' as const,
      spot_status: 'published',
      crowd_capacity_band: 'medium',
      recommendation_suppressed: false,
      votes: 8,
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/juanchoice/admin/campaigns') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [campaign] } }),
        });
      }
      if (url === '/api/v1/juanchoice/admin/campaigns/camp-1') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { campaign, candidates: [cand1, cand2], audit: [], result: null },
          }),
        });
      }
      if (url === '/api/v1/admin/spots') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/v1/juanchoice/admin/schedules') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [] } }),
        });
      }
      if (url.includes('/candidates/cand-1/promotion-assessment')) {
        // Candidate 1 fails to load
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({
            success: false,
            error: { code: 'SERVER_ERR', message: 'Failed to fetch Patar assessment' },
          }),
        });
      }
      if (url.includes('/candidates/cand-2/promotion-assessment')) {
        // Candidate 2 succeeds
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: true,
              eligibility_reason: 'NONE',
              latest_assessment: {
                id: 'ass-2',
                candidate_id: 'cand-2',
                assessed_by: 'admin-1',
                revision: 1,
                decision: 'cleared',
                reason: 'Field check clear.',
                assessed_at: new Date().toISOString(),
                valid_until: new Date(Date.now() + 86400000).toISOString(),
                is_test: false,
              },
              crowd_status: 'low',
              crowd_confidence: 'high',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<JuanChoiceAdmin token={token} onUnauthorized={onUnauthorized} />);

    // Both candidates render
    expect(await screen.findByText('Patar Beach')).toBeInTheDocument();
    expect(screen.getByText('Cape Bolinao Lighthouse')).toBeInTheDocument();

    // Candidate 1 card shows isolated error alert and retry button
    const card1 = screen.getByTestId('promotion-review-card-cand-1');
    expect(card1).toHaveTextContent(/Failed to fetch Patar assessment/i);

    // Candidate 2 card successfully shows cleared badge without being affected
    const card2 = screen.getByTestId('promotion-review-card-cand-2');
    expect(card2).toHaveTextContent(/Cleared through/i);

    // Static copy correctly mentions reviewed winners spotlight policy
    expect(
      screen.getByText(/Reviewed winners can receive a spotlight while crowd and safety gates pass/i)
    ).toBeInTheDocument();
  });

  it('cancels/ignores stale campaign responses when switching campaigns', async () => {
    const campaignA = {
      id: 'camp-A',
      slug: 'camp-a',
      region: 'Pangasinan',
      theme: 'Theme A',
      status: 'voting',
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      is_test: false,
      candidate_count: 1,
      ballot_count: 0,
    };
    const campaignB = {
      id: 'camp-B',
      slug: 'camp-b',
      region: 'Pangasinan',
      theme: 'Theme B',
      status: 'voting',
      opens_at: new Date().toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
      is_test: false,
      candidate_count: 1,
      ballot_count: 0,
    };
    const candA = {
      id: 'cand-A',
      spot_id: 'spot-A',
      spot_name: 'Spot Alpha',
      municipality: 'Alaminos',
      status: 'eligible' as const,
      spot_status: 'published',
      crowd_capacity_band: 'medium',
      recommendation_suppressed: false,
      votes: 5,
    };
    const candB = {
      id: 'cand-B',
      spot_id: 'spot-B',
      spot_name: 'Spot Beta',
      municipality: 'Bolinao',
      status: 'eligible' as const,
      spot_status: 'published',
      crowd_capacity_band: 'high',
      recommendation_suppressed: false,
      votes: 10,
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/juanchoice/admin/campaigns') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [campaignA, campaignB] } }),
        });
      }
      if (url === '/api/v1/juanchoice/admin/campaigns/camp-A') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { campaign: campaignA, candidates: [candA], audit: [], result: null },
          }),
        });
      }
      if (url === '/api/v1/juanchoice/admin/campaigns/camp-B') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { campaign: campaignB, candidates: [candB], audit: [], result: null },
          }),
        });
      }
      if (url === '/api/v1/admin/spots') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        });
      }
      if (url === '/api/v1/juanchoice/admin/schedules') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { items: [] } }),
        });
      }
      if (url.includes('/candidates/cand-A/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: false,
              eligibility_reason: 'NO_PROMOTION_ASSESSMENT',
              latest_assessment: null,
              crowd_status: 'unknown',
              crowd_confidence: 'none',
            },
          }),
        });
      }
      if (url.includes('/candidates/cand-B/promotion-assessment')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              eligible: true,
              eligibility_reason: 'NONE',
              latest_assessment: {
                id: 'ass-B',
                candidate_id: 'cand-B',
                assessed_by: 'admin-1',
                revision: 1,
                decision: 'cleared',
                reason: 'Beta cleared.',
                assessed_at: new Date().toISOString(),
                valid_until: new Date(Date.now() + 86400000).toISOString(),
                is_test: false,
              },
              crowd_status: 'low',
              crowd_confidence: 'high',
            },
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<JuanChoiceAdmin token={token} onUnauthorized={onUnauthorized} />);

    // Initially loads Campaign A
    expect(await screen.findByText('Spot Alpha')).toBeInTheDocument();
    expect(await screen.findByText('Awaiting review')).toBeInTheDocument();

    // Switch to Campaign B
    const campaignBButton = screen.getByRole('button', { name: /Theme B/i });
    fireEvent.click(campaignBButton);

    // Candidate A disappears, Candidate B appears with its own assessment
    expect(await screen.findByText('Spot Beta')).toBeInTheDocument();
    expect(screen.queryByText('Spot Alpha')).not.toBeInTheDocument();
    expect(await screen.findByText(/Cleared through/i)).toBeInTheDocument();
  });
});
