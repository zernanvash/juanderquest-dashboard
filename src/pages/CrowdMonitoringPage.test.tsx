import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { RouterProvider } from '../router';
import { CrowdMonitoringPage } from './CrowdMonitoringPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../auth', () => ({ useAuth: vi.fn() }));

const api = vi.mocked(apiFetch);
const auth = vi.mocked(useAuth);

const mockOverview = {
  window: { fromYmd: '2026-10-20', toYmd: '2026-11-18', granularity: 'day', onsiteHours: 2 },
  privacy_masked: false,
  kpis: {
    unique_visitors: 42,
    verified_visits: 55,
    on_site_now: 6,
    interactions: 180,
    planning_to_go: 34,
    trail_checkins: 9,
    proofs: { approved: 50, pending: 3, rejected: 2 },
    busiest_hour: 14,
    busiest_day: 'Sat',
  },
  previous_period: { delta_pct: { unique_visitors: 12.5, verified_visits: 10, interactions: 5 } },
  new_vs_returning: { new_visitors: 30, returning_visitors: 12 },
  locals_vs_visitors: { locals: 18, visitors: 20, unknown: 4 },
  conversion_funnel: {
    views: 120,
    directions: 24,
    verified_visits: 55,
    view_to_directions_pct: 20,
    directions_to_visit_pct: 229.2,
    view_to_visit_pct: 45.8,
  },
  average_dwell_minutes: 34.5,
  peak_capacity_alerts: [],
  timeseries: [
    { bucket: '2026-11-18', verified_visits: 12, unique_visitors: 10, interactions: 40, planning_to_go: 8, trail_checkins: 2, proofs: 12 },
  ],
  category_breakdown: [{ category: 'nature', spots: 1, verified_visits: 55, interactions: 180, on_site_now: 6 }],
  top_destinations: [
    {
      spot_id: 'spot-1',
      name: 'Hundred Islands',
      municipality: 'Alaminos',
      category: 'nature',
      crowd_capacity_band: 'high',
      crowd_status: 'moderate',
      crowd_confidence: 'high',
      pressure_score: 18,
      recommendation_suppressed: false,
      verified_visits: 55,
      unique_visitors: 42,
      on_site_now: 6,
      interactions: 180,
      planning_to_go: 34,
      trail_checkins: 9,
      dwell_minutes: 34.5,
    },
  ],
  filter_options: { municipalities: ['Alaminos'], categories: ['nature'] },
};

describe('CrowdMonitoringPage', () => {
  beforeEach(() => {
    window.location.hash = '#/insights/crowd';
    api.mockReset();
    auth.mockReturnValue({
      status: 'authenticated',
      scope: { platform: true, grants: [] },
    } as never);
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/crowd/overview')) return mockOverview as never;
      if (path.startsWith('/admin/crowd/heatmap')) return { cells: [{ dow: 6, day_label: 'Sat', hour: 14, count: 15 }] } as never;
      if (path.startsWith('/admin/crowd/spots/spot-1')) {
        return {
          ...mockOverview,
          spot: mockOverview.top_destinations[0],
          heatmap: [{ dow: 6, day_label: 'Sat', hour: 14, count: 15 }],
          crowd_status_timeline: [{ bucket: '2026-11-18', pressure_score: 18, threshold: 30, status: 'moderate' }],
        } as never;
      }
      return {} as never;
    });
  });

  it('renders KPIs, switches date preset, and drills into a destination', async () => {
    render(
      <RouterProvider>
        <CrowdMonitoringPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Hundred Islands')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/overview\?.*granularity=day/), expect.anything()),
    );

    fireEvent.click(screen.getByText('Hundred Islands'));
    expect(await screen.findByText('Crowd status timeline')).toBeInTheDocument();
  });
});
