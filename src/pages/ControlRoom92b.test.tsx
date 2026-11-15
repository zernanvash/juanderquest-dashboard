import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';

const auth = vi.hoisted(() => ({
  value: {
    scope: { platform: false, grants: [{ area_id: 'area-1', powers: ['destinations'] }] },
    selectedAreaId: 'area-1' as string | null,
  },
}));
vi.mock('../auth', () => ({
  useAuth: () => auth.value,
  useSelectedAreaId: () => auth.value.selectedAreaId,
}));

import { OverviewPage } from './OverviewPage';
import { QuestsPage } from './QuestsPage';
import { SpotReportsPage } from './SpotReportsPage';
import { StampsPage } from './StampsPage';

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

type Call = { url: string; method: string; body: unknown };
function stubFetch(routes: Record<string, unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const key = `${method} ${url}`;
      if (key in routes) return ok(routes[key]);
      return Promise.reject(new Error(`Unhandled ${key}`));
    }),
  );
  return calls;
}

const report = {
  id: 'rep-1',
  spot_id: 'spot-1',
  reason: 'wrong_info',
  details: 'Misleading photo',
  status: 'pending',
  created_at: '2026-11-16T00:00:00Z',
};

describe('Plan 92b control room', () => {
  beforeEach(() => {
    auth.value = {
      scope: { platform: false, grants: [{ area_id: 'area-1', powers: ['destinations'] }] },
      selectedAreaId: 'area-1',
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('resolves a destination report with a note, filtered to the selected area', async () => {
    window.history.replaceState(null, '', '/#/spot-reports');
    const calls = stubFetch({
      'GET /api/v1/admin/spot-reports?area_id=area-1': [report],
      'GET /api/v1/admin/spots?area_id=area-1': [],
      'PATCH /api/v1/admin/spot-reports/rep-1': { ...report, status: 'dismissed', resolution_note: 'Photo is fine.' },
    });
    render(
      <RouterProvider>
        <SpotReportsPage />
      </RouterProvider>,
    );
    expect(await screen.findByText('Misleading photo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 5 characters/i);
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);

    fireEvent.change(screen.getByLabelText('Resolution note for report rep-1'), { target: { value: 'Photo is fine.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(calls.find((call) => call.method === 'PATCH')).toBeDefined());
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      status: 'dismissed',
      resolution_note: 'Photo is fine.',
    });
    expect(await screen.findByText(/Photo is fine\./)).toBeInTheDocument();
  });

  it('pauses a published quest and publishes a paused one', async () => {
    window.history.replaceState(null, '', '/#/quests');
    const quest = {
      id: 'q-1',
      title: 'Hundred Islands Hop',
      category: 'nature',
      status: 'published',
      reward_points: 50,
      steps: [],
      spot_name: 'Hundred Islands',
      municipality: 'Alaminos City',
    };
    const calls = stubFetch({
      'GET /api/v1/admin/quests?area_id=area-1': [quest],
      'PATCH /api/v1/quests/q-1/status': { ...quest, status: 'paused' },
    });
    render(<QuestsPage />);
    expect(await screen.findByText('Hundred Islands Hop')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'paused' });
  });

  it('loads stamps data and creates a mission', async () => {
    const calls = stubFetch({
      'GET /api/v1/admin/stamps/stats': {
        date: '2026-11-16',
        week_id: '2026-W47',
        claims_today: 3,
        missions_completed_today: 2,
        weekly_cap_hits: 0,
        travelers_today: 4,
        outstanding_balance: 120,
      },
      'GET /api/v1/admin/stamps/missions': [],
      'GET /api/v1/admin/stamps/qotd/questions': [],
      'POST /api/v1/admin/stamps/missions': { id: 'm-1' },
    });
    render(<StampsPage />);
    expect(await screen.findByText('Claims: 3')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'visit_spot' } });
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Visit a spot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add mission' }));
    expect(await screen.findByText('Mission saved.')).toBeInTheDocument();
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      kind: 'visit_spot',
      title: 'Visit a spot',
      stamps: 5,
      on_site: false,
      active: true,
    });
  });

  it('gives an area admin only the queues their powers allow, with no readiness probe', async () => {
    window.history.replaceState(null, '', '/#/');
    const calls = stubFetch({
      'GET /api/v1/admin/spots?area_id=area-1': [],
      'GET /api/v1/admin/spot-reports?area_id=area-1': [report],
    });
    render(
      <RouterProvider>
        <OverviewPage />
      </RouterProvider>,
    );
    await waitFor(() => expect(calls).toHaveLength(2));
    const urls = calls.map((call) => call.url);
    expect(urls).not.toContain('/api/v1/ready');
    expect(urls.some((url) => url.includes('submissions') || url.includes('affiliate'))).toBe(false);
    expect(screen.queryByText(/Open the proof review queue/i)).toBeNull();
    expect(await screen.findByText(/Mark them reviewed or dismissed/i)).toBeInTheDocument();
  });
});
