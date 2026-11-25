import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { RouterProvider } from '../router';
import { MerchantSpotClaimsPage } from './MerchantSpotClaimsPage';

const apiFetchMock = vi.fn();
let selectedAreaMock: string | null = null;

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

vi.mock('../auth', () => ({
  useSelectedAreaId: () => selectedAreaMock,
}));

const pendingClaim = {
  id: 'claim-1',
  merchant_id: 'merch-1',
  merchant_name: 'Kape Dagupan',
  merchant_category: 'food_and_beverage',
  requested_by: 'user-owner-1',
  owner_handle: 'kape_owner',
  owner_display_name: 'Elena Reyes',
  spot_id: 'spot-1',
  spot_name: 'Tondaligan Heritage Gazebo',
  spot_slug: 'tondaligan-heritage-gazebo',
  spot_municipality: 'Dagupan City',
  spot_lat: 16.0712,
  spot_lng: 120.3421,
  spot_source_type: 'lgu_verified',
  town_area_id: 'area-dagupan',
  barangay_area_id: null,
  note: 'Our cafe operates directly inside the heritage pavilion arcade.',
  proof_url: 'https://example.com/permit.jpg',
  status: 'pending' as const,
  reviewed_by: null,
  reviewer_handle: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-11-24T09:00:00.000Z',
};

const approvedClaim = {
  ...pendingClaim,
  id: 'claim-2',
  merchant_name: 'Bangus Smokehouse',
  spot_name: 'Dagupan Riverwalk',
  status: 'approved' as const,
  reviewed_by: 'admin-1',
  reviewer_handle: 'lgu_officer',
  reviewed_at: '2026-11-24T12:00:00.000Z',
  review_note: 'Verified DTI registration and physical kiosk.',
  proof_url: 'javascript:alert(1)',
};

describe('MerchantSpotClaimsPage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    selectedAreaMock = null;
    window.location.hash = '#/partners/merchant-claims';
  });

  it('loads pending claims, renders detail + mini map preview, and requires 3-300 char note', async () => {
    apiFetchMock.mockResolvedValueOnce([pendingClaim]);

    render(
      <RouterProvider>
        <MerchantSpotClaimsPage />
      </RouterProvider>,
    );

    expect((await screen.findAllByText('Kape Dagupan')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Tondaligan Heritage Gazebo/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/@kape_owner/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Our cafe operates directly inside/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open ownership proof/i })).toHaveAttribute(
      'href',
      'https://example.com/permit.jpg',
    );
    expect(screen.getByText(/Pending \(1\)/)).toBeInTheDocument();

    // Too-short review note is blocked before confirmation step
    fireEvent.change(screen.getByLabelText(/Review note/i), { target: { value: 'ok' } });
    fireEvent.click(screen.getByRole('button', { name: /Approve claim/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/3 and 300 characters/i);
    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('confirms and approves a pending claim then refreshes the queue', async () => {
    apiFetchMock
      .mockResolvedValueOnce([pendingClaim])
      .mockResolvedValueOnce({
        id: 'claim-1',
        merchant_id: 'merch-1',
        spot_id: 'spot-1',
        status: 'approved',
        review_note: 'Verified business permit at location.',
        competing_rejected: 1,
      })
      .mockResolvedValueOnce([]);

    render(
      <RouterProvider>
        <MerchantSpotClaimsPage />
      </RouterProvider>,
    );

    expect((await screen.findAllByText('Kape Dagupan')).length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText(/Review note/i), {
      target: { value: 'Verified business permit at location.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve claim/i }));
    expect(screen.getByRole('region', { name: /Confirm claim decision/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm approval/i }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/admin/merchant-spot-claims/claim-1/review', {
        method: 'POST',
        body: {
          decision: 'approve',
          review_note: 'Verified business permit at location.',
        },
      });
    });

    expect(await screen.findByRole('status')).toHaveTextContent(/1 competing pending claim\(s\) automatically rejected/i);
  });

  it('switches to approved filter and suppresses unsafe javascript proof URLs', async () => {
    apiFetchMock
      .mockResolvedValueOnce([pendingClaim])
      .mockResolvedValueOnce([approvedClaim])
      .mockResolvedValueOnce([pendingClaim]);

    render(
      <RouterProvider>
        <MerchantSpotClaimsPage />
      </RouterProvider>,
    );

    expect((await screen.findAllByText('Kape Dagupan')).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('tab', { name: /Approved/i }));

    expect((await screen.findAllByText('Bangus Smokehouse')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Verified DTI registration/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open ownership proof/i })).not.toBeInTheDocument();
  });

  it('handles 409 spot already linked and 403 area scope forbidden errors cleanly', async () => {
    apiFetchMock
      .mockResolvedValueOnce([pendingClaim])
      .mockRejectedValueOnce(new ApiError('Spot already claimed.', 409, 'SPOT_ALREADY_LINKED_TO_MERCHANT'))
      .mockResolvedValueOnce([pendingClaim])
      .mockRejectedValueOnce(new ApiError('Outside assigned area.', 403, 'AREA_SCOPE_FORBIDDEN'));

    render(
      <RouterProvider>
        <MerchantSpotClaimsPage />
      </RouterProvider>,
    );

    expect((await screen.findAllByText('Kape Dagupan')).length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText(/Review note/i), {
      target: { value: 'Approving location claim now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Approve claim/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm approval/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already linked to another active Local Partner/i);

    fireEvent.click(screen.getByRole('button', { name: /Reject claim/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm rejection/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/outside your assigned LGU area/i);
  });
});
