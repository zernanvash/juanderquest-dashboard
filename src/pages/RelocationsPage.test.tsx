import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RelocationsPage } from './RelocationsPage';
import { RouterProvider } from '../router';

const apiFetchMock = vi.fn();
let selectedAreaMock: string | null = null;

vi.mock('../api/client', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('../auth', () => ({
  useSelectedAreaId: () => selectedAreaMock,
}));

const sampleItem = {
  id: 'reloc-1',
  spot_id: 'spot-1',
  spot_name: 'Bolinao Sunset Cliff',
  spot_slug: 'bolinao-sunset-cliff',
  municipality: 'Bolinao',
  town_area_id: 'area-bolinao',
  requested_by: 'user-1',
  author_handle: 'maria_ph',
  author_display_name: 'Maria Explorer',
  from_lat: 16.32,
  from_lng: 119.785,
  to_lat: 16.325,
  to_lng: 119.785,
  distance_m: 556,
  accuracy_m: 8.4,
  status: 'pending' as const,
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  created_at: '2026-11-23T08:00:00.000Z',
};

describe('RelocationsPage', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    selectedAreaMock = null;
    window.location.hash = '#/destinations/relocations';
  });

  it('renders pending relocations table and approves a request', async () => {
    apiFetchMock.mockResolvedValueOnce([sampleItem]).mockResolvedValueOnce({
      ...sampleItem,
      status: 'approved',
    });

    render(
      <RouterProvider>
        <RelocationsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Bolinao Sunset Cliff')).toBeInTheDocument();
    expect(screen.getByText('@maria_ph')).toBeInTheDocument();
    expect(screen.getAllByText(/556 m/).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/admin/spots/relocations/reloc-1/approve', {
        method: 'POST',
      });
    });
  });

  it('requires a note to reject and submits POST reject', async () => {
    apiFetchMock.mockResolvedValueOnce([sampleItem]).mockResolvedValueOnce({
      ...sampleItem,
      status: 'rejected',
      review_note: 'Pin is offshore',
    });

    render(
      <RouterProvider>
        <RelocationsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Bolinao Sunset Cliff')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 3 characters/i);

    fireEvent.change(screen.getByLabelText(/Rejection note for Bolinao Sunset Cliff/i), {
      target: { value: 'Pin is offshore' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/admin/spots/relocations/reloc-1/reject', {
        method: 'POST',
        body: { note: 'Pin is offshore' },
      });
    });
  });

  it('passes selected area_id query for area-scoped admins', async () => {
    selectedAreaMock = 'area-dagupan';
    apiFetchMock.mockResolvedValueOnce([]);

    render(
      <RouterProvider>
        <RelocationsPage />
      </RouterProvider>,
    );

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/admin/spots/relocations?status=pending&area_id=area-dagupan',
        expect.any(Object),
      );
    });
  });
});
