import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { RouterProvider } from '../router';
import { DestinationsPage } from './DestinationsPage';
import { QuestsPage } from './QuestsPage';
import { SubmissionsPage } from './SubmissionsPage';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock('../auth', () => ({
  useSelectedAreaId: () => null,
  useOptionalAuth: () => null,
}));

const api = vi.mocked(apiFetch);

beforeEach(() => {
  api.mockReset();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WP-4 operational controls & URL filters', () => {
  it('QuestsPage features a quest, bulk-pauses by destination, and syncs filters to URL', async () => {
    window.location.hash = '#/quests';
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/admin/quests') {
        return [
          {
            id: 'q-1',
            title: 'Hundred Islands Clean-up',
            category: 'eco',
            location_name: 'Lucap Wharf',
            reward_points: 50,
            radius_meters: 100,
            status: 'published',
            is_featured: false,
            spot_id: 'spot-1',
            spot_name: 'Lucap Wharf',
            municipality: 'Alaminos',
          },
        ] as never;
      }
      if (path === '/admin/quests/q-1/feature' && init?.method === 'POST') {
        return { id: 'q-1', is_featured: true } as never;
      }
      if (path === '/admin/quests/bulk-pause' && init?.method === 'POST') {
        return { paused_count: 1, skipped_funded: [] } as never;
      }
      return {} as never;
    });

    render(
      <RouterProvider>
        <QuestsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Hundred Islands Clean-up')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Feature' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/quests/q-1/feature',
        expect.objectContaining({ method: 'POST', body: { featured: true } }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Bulk pause destination'), { target: { value: 'spot-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bulk pause by destination' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/quests/bulk-pause',
        expect.objectContaining({ method: 'POST', body: { destination_id: 'spot-1' } }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: /paused \(/i }));
    await waitFor(() => expect(window.location.hash).toContain('status=paused'));
  });

  it('DestinationsPage sends suppress_hours when suppressing temporarily', async () => {
    window.location.hash = '#/destinations';
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/admin/spots') {
        return [
          {
            id: 'spot-1',
            name: 'Hundred Islands',
            category: 'nature',
            subcategory: 'island',
            municipality: 'Alaminos',
            source_name: 'LGU',
            trust_level: 'lgu_verified',
            status: 'published',
            crowd_capacity_band: 'medium',
            recommendation_suppressed: false,
          },
        ] as never;
      }
      if (path === '/admin/spots/spot-1' && init?.method === 'PATCH') {
        return {
          id: 'spot-1',
          name: 'Hundred Islands',
          category: 'nature',
          subcategory: 'island',
          municipality: 'Alaminos',
          source_name: 'LGU',
          trust_level: 'lgu_verified',
          status: 'published',
          crowd_capacity_band: 'medium',
          recommendation_suppressed: true,
          recommendation_suppressed_until: '2026-11-19T00:00:00Z',
        } as never;
      }
      return {} as never;
    });

    render(
      <RouterProvider>
        <DestinationsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Hundred Islands')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Suppression duration for Hundred Islands'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Suppress alternative' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/spots/spot-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ recommendation_suppressed: true, suppress_hours: 8 }),
        }),
      ),
    );
  });

  it('SubmissionsPage supports destination/quest/age filters and bulk reject with reason', async () => {
    window.location.hash = '#/submissions';
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path.startsWith('/admin/submissions?')) {
        return [
          {
            id: 'sub-1',
            user_name: 'Ana',
            quest_title: 'Clean Shore',
            spot_name: 'Patar Beach',
            scanned_marker_code: 'MK1',
            captured_lat: 16.0,
            captured_lng: 120.0,
            target_lat: 16.0,
            target_lng: 120.0,
            distance_meters: 10,
            quest_radius_meters: 100,
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ] as never;
      }
      if (path === '/admin/submissions/bulk-review' && init?.method === 'POST') {
        return { updated_count: 1, skipped: [], failed: [] } as never;
      }
      return {} as never;
    });

    render(
      <RouterProvider>
        <SubmissionsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Clean Shore')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter by destination'), { target: { value: 'Patar Beach' } });
    await waitFor(() => expect(window.location.hash).toContain('dest=Patar+Beach'));

    fireEvent.click(screen.getByLabelText('Select submission sub-1'));
    fireEvent.change(screen.getByLabelText('Bulk rejection reason'), { target: { value: 'Blurry photo proof' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bulk reject (1)' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/submissions/bulk-review',
        expect.objectContaining({
          method: 'POST',
          body: { ids: ['sub-1'], action: 'reject', rejection_reason: 'Blurry photo proof' },
        }),
      ),
    );
  });
});
