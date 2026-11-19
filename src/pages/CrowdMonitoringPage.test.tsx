import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { RouterProvider } from '../router';
import { CrowdMonitoringPage } from './CrowdMonitoringPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('../auth', () => ({ useAuth: vi.fn(), useOptionalAuth: () => auth() }));

const api = vi.mocked(apiFetch);
const auth = vi.mocked(useAuth);

const mockAreas = {
  scope_mode: 'platform' as const,
  locked_province: null,
  locked_municipality: null,
  provinces: [
    { id: 'prov:pang', name: 'Pangasinan', municipality_count: 2, spot_count: 2 },
    { id: 'prov:lu', name: 'La Union', municipality_count: 1, spot_count: 1 },
  ],
  municipalities: [
    { name: 'Alaminos', town_area_id: 'town:alaminos', province_id: 'prov:pang', province_name: 'Pangasinan', spot_count: 1 },
    { name: 'Dagupan City', town_area_id: 'town:dagupan', province_id: 'prov:pang', province_name: 'Pangasinan', spot_count: 1 },
    { name: 'San Juan', town_area_id: 'town:sanjuan', province_id: 'prov:lu', province_name: 'La Union', spot_count: 1 },
  ],
  categories: ['nature'],
};

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
  area_breakdown: {
    level: 'province',
    items: [
      {
        area_key: 'prov:pang',
        area_name: 'Pangasinan',
        province_id: 'prov:pang',
        province_name: 'Pangasinan',
        spots: 2,
        busy_spots: 0,
        unique_visitors: 30,
        verified_visits: 40,
        interactions: 130,
        on_site_now: 4,
      },
      {
        area_key: 'prov:lu',
        area_name: 'La Union',
        province_id: 'prov:lu',
        province_name: 'La Union',
        spots: 1,
        busy_spots: 0,
        unique_visitors: 12,
        verified_visits: 15,
        interactions: 50,
        on_site_now: 2,
      },
    ],
  },
  category_breakdown: [{ category: 'nature', spots: 3, verified_visits: 55, interactions: 180, on_site_now: 6 }],
  top_destinations: [
    {
      spot_id: 'spot-1',
      name: 'Hundred Islands',
      municipality: 'Alaminos',
      province_id: 'prov:pang',
      province_name: 'Pangasinan',
      category: 'nature',
      crowd_capacity_band: 'high',
      crowd_status: 'moderate',
      crowd_confidence: 'high',
      pressure_score: 18,
      recommendation_suppressed: false,
      verified_visits: 30,
      unique_visitors: 22,
      on_site_now: 3,
      interactions: 100,
      planning_to_go: 20,
      trail_checkins: 5,
      dwell_minutes: 34.5,
    },
    {
      spot_id: 'spot-2',
      name: 'Bonuan Tondaligan Beach',
      municipality: 'Dagupan City',
      province_id: 'prov:pang',
      province_name: 'Pangasinan',
      category: 'nature',
      crowd_capacity_band: 'medium',
      crowd_status: 'quiet',
      crowd_confidence: 'medium',
      pressure_score: 8,
      recommendation_suppressed: false,
      verified_visits: 10,
      unique_visitors: 8,
      on_site_now: 1,
      interactions: 30,
      planning_to_go: 8,
      trail_checkins: 2,
      dwell_minutes: 25,
    },
  ],
  destinations_pagination: { page: 1, limit: 25, total: 48, total_pages: 2 },
  filter_options: {
    provinces: [
      { id: 'prov:pang', name: 'Pangasinan' },
      { id: 'prov:lu', name: 'La Union' },
    ],
    municipalities: ['Alaminos', 'Dagupan City', 'San Juan'],
    categories: ['nature'],
  },
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
      if (path.startsWith('/admin/crowd/areas')) return mockAreas as never;
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
      if (path.startsWith('/admin/crowd/suggestions/dismiss')) {
        return { spot_id: 'spot-1', suggestion_key: 'busy_now', dismissed_until: '2026-11-19T12:00:00Z' } as never;
      }
      if (path.startsWith('/admin/crowd/suggestions')) {
        return {
          suggestions: [
            {
              spot_id: 'spot-1',
              spot_name: 'Hundred Islands',
              municipality: 'Alaminos',
              suggestion_key: 'busy_now',
              rule_label: 'Busy now',
              evidence: 'Pressure peaked at 32 across 2 consecutive Manila hours.',
              actions: [
                {
                  action_key: 'suppress_spot_4h',
                  label: 'Suppress from Explore (4 h)',
                  method: 'PATCH',
                  path: '/admin/spots/spot-1',
                  body: { status: 'published', crowd_capacity_band: 'high', recommendation_suppressed: true, suppress_hours: 4 },
                },
              ],
            },
          ],
        } as never;
      }
      if (path === '/admin/spots/spot-1') {
        return { id: 'spot-1', recommendation_suppressed: true } as never;
      }
      return {} as never;
    });
  });

  it('renders KPIs, opens pre-print prompt with 3-page layout, applies/dismisses suggestion, and drills into a destination', async () => {
    render(
      <RouterProvider>
        <CrowdMonitoringPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Pressure peaked at 32 across 2 consecutive Manila hours.')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply: Suppress from Explore (4 h)' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/spots/spot-1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.objectContaining({ recommendation_suppressed: true, suppress_hours: 4 }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss for 24 h' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/crowd/suggestions/dismiss',
        expect.objectContaining({
          method: 'POST',
          body: { spot_id: 'spot-1', suggestion_key: 'busy_now' },
        }),
      ),
    );

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const dialog = await screen.findByRole('dialog', { name: 'Prepare crowd monitoring hard copy' });
    expect(printSpy).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate & Print Hard Copy' }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));

    expect(screen.getByLabelText('Print Page 1 Overview')).toBeInTheDocument();
    expect(screen.getByLabelText('Print Page 2 Graphs')).toBeInTheDocument();
    expect(screen.getByLabelText('Print Page 3+ Organized Numbers')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/overview\?.*granularity=day/), expect.anything()),
    );

    const spotMatches = screen.getAllByText('Hundred Islands');
    fireEvent.click(spotMatches[spotMatches.length - 1]);
    expect(await screen.findByText('Crowd status timeline')).toBeInTheDocument();
    printSpy.mockRestore();
  });

  it('asks province vs municipality before printing and structures Page 1 overview, Page 2 graphs, and Page 3+ organized tables', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(
      <RouterProvider>
        <CrowdMonitoringPage />
      </RouterProvider>,
    );

    await screen.findByText('Traffic by province (2)');

    // 1. Print entire province (Pangasinan)
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    let dialog = await screen.findByRole('dialog', { name: 'Prepare crowd monitoring hard copy' });
    fireEvent.change(within(dialog).getByLabelText('Print province'), { target: { value: 'prov:pang' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate & Print Hard Copy' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/crowd\/overview\?.*province=prov%3Apang.*include_all=true/),
    );

    const p1 = screen.getByLabelText('Print Page 1 Overview');
    const p2 = screen.getByLabelText('Print Page 2 Graphs');
    const p3 = screen.getByLabelText('Print Page 3+ Organized Numbers');
    expect(p1.compareDocumentPosition(p2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(p2.compareDocumentPosition(p3) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(p3).getByText('3.3 Destinations ledger grouped by municipality (2)')).toBeInTheDocument();
    const groupRows = p3.querySelectorAll('.crowd-print-group-row');
    expect(groupRows).toHaveLength(2);
    expect(groupRows[0].textContent).toContain('Alaminos');
    expect(groupRows[1].textContent).toContain('Dagupan City');

    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });

    // 2. Print specific municipality in another province (San Juan, La Union)
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    dialog = await screen.findByRole('dialog', { name: 'Prepare crowd monitoring hard copy' });
    fireEvent.click(within(dialog).getByLabelText('Specific municipality / city'));
    fireEvent.change(within(dialog).getByLabelText('Print province'), { target: { value: 'prov:lu' } });
    fireEvent.change(within(dialog).getByLabelText('Print municipality'), { target: { value: 'San Juan' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate & Print Hard Copy' }));

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(2));
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/crowd\/overview\?.*province=prov%3Alu.*municipality=San(\+|%20)Juan.*include_all=true/),
    );
    printSpy.mockRestore();
  });

  it('locks area admins to their authorized municipality, blocks nationwide print options, and forwards ?area_id=', async () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    auth.mockReturnValue({
      status: 'authenticated',
      selectedAreaId: 'town:dagupan',
      scope: {
        platform: false,
        grants: [{ areaId: 'town:dagupan', areaName: 'Dagupan City', powers: ['analytics'] }],
      },
    } as never);

    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/crowd/areas')) {
        return {
          scope_mode: 'municipality',
          locked_province: 'prov:pang',
          locked_municipality: 'Dagupan City',
          provinces: [{ id: 'prov:pang', name: 'Pangasinan', municipality_count: 1, spot_count: 1 }],
          municipalities: [
            { name: 'Dagupan City', town_area_id: 'town:dagupan', province_id: 'prov:pang', province_name: 'Pangasinan', spot_count: 1 },
          ],
          categories: ['nature'],
        } as never;
      }
      if (path.startsWith('/admin/crowd/overview')) {
        return {
          ...mockOverview,
          privacy_masked: true,
          top_destinations: [mockOverview.top_destinations[1]],
          destinations_pagination: { page: 1, limit: 25, total: 1, total_pages: 1 },
        } as never;
      }
      if (path.startsWith('/admin/crowd/heatmap')) return { cells: [] } as never;
      if (path.startsWith('/admin/crowd/suggestions')) return { suggestions: [] } as never;
      return {} as never;
    });

    render(
      <RouterProvider>
        <CrowdMonitoringPage />
      </RouterProvider>,
    );

    expect(await screen.findByText(/Showing only destinations in Dagupan City/)).toBeInTheDocument();
    expect(screen.getByLabelText('Province')).toBeDisabled();
    expect(screen.getByLabelText('Municipality')).toBeDisabled();
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/areas\?area_id=town%3Adagupan/), expect.anything());
    expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/overview\?.*area_id=town%3Adagupan/), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    const dialog = await screen.findByRole('dialog', { name: 'Prepare crowd monitoring hard copy' });
    expect(within(dialog).queryByText(/All provinces \(Nationwide\)/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Your area-admin scope covers/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate & Print Hard Copy' }));
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
    expect(api).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/crowd\/overview\?.*municipality=Dagupan(\+|%20)City.*area_id=town%3Adagupan/),
    );
    printSpy.mockRestore();
  });

  it('supports nationwide province drill-down, breadcrumb reset, and destinations pagination', async () => {
    render(
      <RouterProvider>
        <CrowdMonitoringPage />
      </RouterProvider>,
    );

    const rollupHeading = await screen.findByText('Traffic by province (2)');
    const rollupSection = rollupHeading.closest('section')!;
    fireEvent.click(within(rollupSection).getByText('Pangasinan'));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/overview\?.*province=prov%3Apang/), expect.anything()),
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'Geographic scope breadcrumb' });
    fireEvent.click(within(breadcrumb).getByRole('button', { name: 'All provinces (Nationwide)' }));

    await waitFor(() => {
      const overviewCalls = api.mock.calls.filter(([url]) => String(url).startsWith('/admin/crowd/overview'));
      const lastUrl = String(overviewCalls[overviewCalls.length - 1][0]);
      expect(lastUrl).not.toContain('province=prov%3Apang');
    });

    const destHeading = screen.getByText('Destinations traffic (48)');
    const destSection = destHeading.closest('section')!;
    fireEvent.click(within(destSection).getByRole('button', { name: 'Next' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(expect.stringMatching(/\/admin\/crowd\/overview\?.*page=2/), expect.anything()),
    );
  });
});
