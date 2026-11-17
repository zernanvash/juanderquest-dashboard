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

import { SpotReportsPage } from './SpotReportsPage';

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

describe('Plan 60 flagged destinations queue', () => {
  beforeEach(() => {
    auth.value = {
      scope: { platform: false, grants: [{ area_id: 'area-1', powers: ['destinations'] }] },
      selectedAreaId: 'area-1',
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists held and auto-hidden spots and lets admins publish, keep hidden, or remove', async () => {
    window.history.replaceState(null, '', '/#/spot-reports?view=flagged');
    const flagged = [
      {
        id: 'spot-held-1',
        name: 'Bayfront Lounge',
        category: 'eat_drink',
        subcategory: 'cafe',
        municipality: 'Dagupan City',
        source_name: 'Community',
        trust_level: 'community',
        status: 'held',
        moderation_reasons: ['TEXT_BLOCKED'],
        moderation_messages: ['Remove web links or blocked words.'],
        appeal_submitted: false,
        moderation_events: [
          {
            id: 'ev-1',
            spot_id: 'spot-held-1',
            actor: 'system',
            decision: 'held',
            reason_codes: ['TEXT_BLOCKED'],
            details: {},
            created_at: '2026-11-17T00:00:00Z',
          },
        ],
      },
      {
        id: 'spot-hidden-2',
        name: 'Old Pier Spot',
        category: 'nature_outdoors',
        subcategory: 'viewpoint',
        municipality: 'Dagupan City',
        source_name: 'Community',
        trust_level: 'community',
        status: 'hidden_pending_review',
        moderation_reasons: ['REPORT_THRESHOLD'],
        moderation_messages: ['Hidden pending moderator review.'],
        appeal_submitted: true,
        moderation_events: [
          {
            id: 'ev-2',
            spot_id: 'spot-hidden-2',
            actor: 'user-author',
            decision: 'appealed',
            reason_codes: ['AUTHOR_APPEAL'],
            details: { note: 'Reopened today.' },
            created_at: '2026-11-17T01:00:00Z',
          },
        ],
      },
    ];

    const calls = stubFetch({
      'GET /api/v1/admin/spot-reports?area_id=area-1': [],
      'GET /api/v1/admin/spots?area_id=area-1': [],
      'GET /api/v1/admin/spot-moderation?area_id=area-1': flagged,
      'POST /api/v1/admin/spots/spot-held-1/moderate': { ...flagged[0], status: 'published' },
      'POST /api/v1/admin/spots/spot-hidden-2/moderate': { ...flagged[1], status: 'hidden_pending_review' },
    });

    render(
      <RouterProvider>
        <SpotReportsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Bayfront Lounge')).toBeInTheDocument();
    expect(screen.getByText('Old Pier Spot')).toBeInTheDocument();
    expect(screen.getByText('auto-hidden')).toBeInTheDocument();
    expect(screen.getAllByText('appealed').length).toBeGreaterThanOrEqual(1);

    const publishButtons = screen.getAllByRole('button', { name: 'Publish' });
    fireEvent.click(publishButtons[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 5 characters/i);

    fireEvent.change(screen.getByLabelText('Moderation note for destination spot-held-1'), {
      target: { value: 'Verified clean listing.' },
    });
    fireEvent.click(publishButtons[0]);
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url === '/api/v1/admin/spots/spot-held-1/moderate')).toBe(true),
    );
    expect(calls.find((c) => c.url === '/api/v1/admin/spots/spot-held-1/moderate')?.body).toEqual({
      action: 'publish',
      note: 'Verified clean listing.',
    });

    await waitFor(() => expect(screen.queryByText('Bayfront Lounge')).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Moderation note for destination spot-hidden-2'), {
      target: { value: 'Needs site inspection first.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Keep hidden' }));
    await waitFor(() =>
      expect(calls.some((c) => c.url === '/api/v1/admin/spots/spot-hidden-2/moderate')).toBe(true),
    );
  });
});
