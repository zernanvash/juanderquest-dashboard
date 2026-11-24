import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';
import { apiFetch } from '../api/client';
import { UsersPage } from './UsersPage';
import { UserDetailPage } from './UserDetailPage';
import { TokensBadgesPage } from './TokensBadgesPage';
import { SuspiciousActivityPage } from './SuspiciousActivityPage';

const auth = vi.hoisted(() => ({
  profile: { id: 'adm-1', role: 'admin', admin_scope: 'platform', display_name: 'Admin' } as Record<string, unknown>,
}));

vi.mock('../auth', () => ({
  useAuth: () => ({ profile: auth.profile }),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    apiFetch: vi.fn(),
  };
});

const api = vi.mocked(apiFetch);

describe('Plan 117 admin pages', () => {
  beforeEach(() => {
    api.mockReset();
    auth.profile = { id: 'adm-1', role: 'admin', admin_scope: 'platform', display_name: 'Admin' };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders UsersPage at 1280px and 390px, shows SUSPENDED chip, flags count, empty and error states', async () => {
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });
    api.mockResolvedValueOnce({
      items: [
        {
          id: 'u-1',
          display_name: 'Juan Dela Cruz',
          handle: 'juand',
          masked_email: 'ju***@gmail.com',
          role: 'user',
          admin_scope: null,
          created_at: '2026-11-20T08:00:00.000Z',
          last_active_at: '2026-11-23T08:00:00.000Z',
          explorer_xp: 450,
          points: 200,
          stamps: 12,
          badges_count: 2,
          open_flags: 1,
          suspended_at: '2026-11-23T09:00:00.000Z',
        },
      ],
      next_cursor: null,
      has_more: false,
    });

    render(
      <RouterProvider>
        <UsersPage />
      </RouterProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Loading users/);
    expect(await screen.findByText('Juan Dela Cruz')).toBeInTheDocument();
    expect(screen.getByText('ju***@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('SUSPENDED')).toBeInTheDocument();
    expect(screen.getByText(/1 open/)).toBeInTheDocument();

    // 390 px viewport empty state check
    Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 390 });
    api.mockResolvedValueOnce({ items: [], next_cursor: null, has_more: false });
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByText('No matching users')).toBeInTheDocument();

    // Error state
    api.mockRejectedValueOnce(new Error('Network offline'));
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network offline');
  });

  it('asks for a 3-300 char reason before suspending on UserDetailPage and hides write buttons for developer', async () => {
    const detailPayload = {
      profile: {
        id: 'u-1',
        display_name: 'Juan Dela Cruz',
        handle: 'juand',
        email: 'juan@gmail.com',
        role: 'user',
        admin_scope: null,
        home_municipality: 'Bolinao',
        suspended_at: null,
        suspended_reason: null,
        suspended_by: null,
        created_at: '2026-11-20T08:00:00.000Z',
        last_active_at: '2026-11-23T08:00:00.000Z',
        session_epoch: 0,
        sign_in_methods: { providers: ['email'], has_password: true },
        area_assignments: [],
      },
      balances: { points: 200, stamps: 12, explorer_xp: 450, civic_xp: 30, scout_reputation: 250 },
      stamp_ledger: [],
      points_ledger: [],
      badge_awards: [],
      quest_attempts: [],
      submissions: [],
      reports_filed: [],
      reports_received: [],
      risk_flags: [],
      resolved_entities: { spots: {}, quests: {}, campaigns: {}, users: {} },
      admin_log: [],
    };
    api.mockResolvedValue(detailPayload);

    const { rerender } = render(
      <RouterProvider>
        <UserDetailPage userId="u-1" />
      </RouterProvider>,
    );

    await screen.findByText('juan@gmail.com');
    fireEvent.click(screen.getByRole('button', { name: /Suspend/ }));
    const dialog = screen.getByRole('dialog');
    const confirmBtn = screen.getByRole('button', { name: 'Confirm suspend' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Ab' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(dialog.querySelector('textarea')!, { target: { value: 'Confirmed bot farm' } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/users/u-1/suspend',
        expect.objectContaining({ method: 'POST', body: { reason: 'Confirmed bot farm' } }),
      ),
    );

    // Switch to developer -> suspend/unsuspend/sign-out buttons hidden
    auth.profile = { id: 'dev-1', role: 'admin', admin_scope: 'developer', display_name: 'Dev' };
    rerender(
      <RouterProvider>
        <UserDetailPage userId="u-1" />
      </RouterProvider>,
    );
    expect(screen.queryByRole('button', { name: /Suspend/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    expect(screen.getByText(/Read-only \(developer\)/)).toBeInTheDocument();
  });

  it('renders TokensBadgesPage KPI tiles, charts, links to /users/:id, and Badges tab', async () => {
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/economy/monitor')) {
        return {
          window: { days: 30, from: '2026-11-01T00:00:00Z', to: '2026-11-23T00:00:00Z' },
          totals: {
            points_issued: 500,
            points_spent: 100,
            stamps_issued: 40,
            stamps_spent: 10,
            explorer_xp_awarded: 900,
            badges_awarded: 3,
            badges_revoked: 0,
            admin_point_grants_count: 1,
            admin_point_grants_sum: 250,
          },
          daily_series: [
            {
              date: '2026-11-23',
              points_issued: 500,
              points_spent: 100,
              stamps_issued: 40,
              stamps_spent: 10,
              explorer_xp_awarded: 900,
              badges_awarded: 3,
              badges_revoked: 0,
              admin_point_grants_count: 1,
              admin_point_grants_sum: 250,
            },
          ],
          top_earners: {
            points: [{ user_id: 'u-99', display_name: 'Top Earner', handle: 'top', amount: 500 }],
            stamps: [],
            xp: [],
          },
          issuance_by_source: {
            points: [{ source: 'quest_reward_credit', issued: 500, count: 2 }],
            stamps: [{ source: 'daily_login', issued: 40, count: 4 }],
          },
        };
      }
      if (path.startsWith('/admin/badges')) {
        return {
          items: [
            {
              id: 'b1',
              title: 'First Explorer',
              track: 'explorer',
              category: 'milestone',
              threshold: 1,
              award_count: 3,
              revoked_count: 0,
              minted_on_chain_count: 1,
              last_awarded_at: '2026-11-23T08:00:00.000Z',
            },
          ],
        };
      }
      return { items: [], next_cursor: null, has_more: false };
    });

    render(
      <RouterProvider>
        <TokensBadgesPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('500 / 100')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Top Earner' })).toHaveAttribute('href', '#/users/u-99');

    fireEvent.click(screen.getByRole('tab', { name: /Badges/ }));
    expect(await screen.findByText('First Explorer')).toBeInTheDocument();
  });

  it('renders SuspiciousActivityPage queue, plain-word rule description, scan button, and hides actions for developer', async () => {
    api.mockResolvedValue({
      items: [
        {
          id: 'rf-1',
          user_id: 'u-1',
          user: {
            id: 'u-1',
            display_name: 'Spike User',
            handle: 'spike',
            masked_email: 'sp***@gmail.com',
            role: 'user',
            suspended_at: null,
          },
          rule: 'stamp_spike',
          severity: 'high',
          evidence: { earned_24h: 240, median_14d: 12 },
          status: 'open',
          review_note: null,
          created_at: '2026-11-23T08:00:00.000Z',
        },
      ],
      next_cursor: null,
      has_more: false,
      summary_30d: { stamp_spike: 1 },
      resolved_entities: { spots: {}, quests: {}, campaigns: {}, users: {} },
    });

    const { rerender } = render(
      <RouterProvider>
        <SuspiciousActivityPage />
      </RouterProvider>,
    );

    expect(await screen.findByText(/Earned 240 stamps in 24 h; usual is 12\/day\./)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Run scan now/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark actioned' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suspend/ })).toBeInTheDocument();

    auth.profile = { id: 'dev-1', role: 'admin', admin_scope: 'developer', display_name: 'Dev' };
    rerender(
      <RouterProvider>
        <SuspiciousActivityPage />
      </RouterProvider>,
    );
    expect(screen.queryByRole('button', { name: /Run scan now/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Suspend/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Open user' })).toHaveAttribute('href', '#/users/u-1');
  });
});
