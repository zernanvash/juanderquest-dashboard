import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';
import { OverviewPage } from './OverviewPage';

vi.mock('../auth', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../auth';

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('OverviewPage', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows quests_quizzes and analytics cards for a scoped area admin', async () => {
    vi.mocked(useAuth).mockReturnValue({
      scope: {
        platform: false,
        grants: [{ area_id: 'area-1', area_name: 'Dagupan', powers: ['quests_quizzes', 'analytics'] }],
      },
      selectedAreaId: 'area-1',
    } as any);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('/admin/quests')) return ok([{ id: 'q1', status: 'published' }, { id: 'q2', status: 'draft' }]);
        if (url.includes('/admin/quizzes')) return ok([{ quiz: { id: 'qz1', status: 'published' } }]);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }),
    );

    render(
      <RouterProvider>
        <OverviewPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Quests in area')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Cultural quizzes')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Analytics/i })).toBeInTheDocument();
    expect(screen.queryByText('Pending proof submissions')).toBeNull();
  });

  it('renders all 3 bands for platform staff including quest attempts, plaza flags, trails, and JuanChoice', async () => {
    vi.mocked(useAuth).mockReturnValue({
      scope: { platform: true, grants: [] },
      selectedAreaId: null,
    } as any);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/ready') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              status: 'ready',
              ready: true,
              degraded: false,
              timestamp: '2026-11-16T00:00:00Z',
              dependencies: { postgres: { status: 'up', latency_ms: 4 } },
            }),
          });
        }
        if (url.includes('/admin/quest-attempts')) return ok([{ id: 'a1', status: 'submitted' }]);
        if (url.includes('/admin/plaza/reports')) return ok([{ id: 'p1' }, { id: 'p2' }]);
        if (url.includes('/admin/trails/review')) return ok([{ id: 't1' }]);
        if (url.includes('/juanchoice/overview')) {
          return ok({ active_campaign: { id: 'c1', theme: 'Bolinao Coast', status: 'voting', ballot_count: 19 } });
        }
        return ok([]);
      }),
    );

    render(
      <RouterProvider>
        <OverviewPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Pending quest attempts')).toBeInTheDocument();
    expect(screen.getByText('Open Plaza flags')).toBeInTheDocument();
    expect(screen.getByText('Trails awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Bolinao Coast')).toBeInTheDocument();
    expect(screen.getByText(/postgres: up \(4ms\)/i)).toBeInTheDocument();
  });
});
