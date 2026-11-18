import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { MobileAppPage } from './MobileAppPage';

vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return { ...actual, apiFetch: vi.fn() };
});

const api = vi.mocked(apiFetch);

const mockOverview = {
  observed_at: '2026-11-18T12:00:00Z',
  version: {
    version_name: 'alpha-109',
    version_code: 5,
    build_number: 5,
    commit_hash: 'abc1234',
    changelog: 'Sovereign navigation & AR polish',
    download_url: 'https://github.com/zernanvash/juanderquest-mobile/releases/latest',
    published_at: '2026-11-18T10:00:00Z',
  },
  devices: {
    total_registered: 12,
    active_7d: 8,
    active_30d: 11,
    latest_build: 5,
    on_latest_count: 6,
    on_latest_pct: 50,
    by_build: [
      { app_build: 5, devices: 6, active_7d: 5, active_30d: 6 },
      { app_build: 3, devices: 6, active_7d: 3, active_30d: 5 },
    ],
  },
  push_7d: {
    by_category: [{ category: 'social', sent: 40, failed: 2, skipped: 5, total: 47 }],
    totals: { sent: 40, failed: 2, skipped: 5 },
  },
  notification_preferences: {
    total_profiles: 20,
    rates: { overtaken_pct: 80, friend_activity_pct: 75, social_pct: 90, weekly_recap_pct: 70, quiet_hours_pct: 85 },
  },
  settings: {
    revision: 4,
    app_min_supported_build: 2,
    app_announcement_text: '',
    app_announcement_severity: 'info' as const,
    app_announcement_until: '',
  },
};

beforeEach(() => {
  api.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('MobileAppPage (WP-5)', () => {
  it('renders release overview, device build breakdown, and saves min build & banner with revision', async () => {
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/admin/mobile-app/overview') return mockOverview as never;
      if (path === '/admin/settings' && init?.method === 'PUT') return { revision: 5 } as never;
      return {} as never;
    });

    render(<MobileAppPage />);

    expect(await screen.findByText('alpha-109')).toBeInTheDocument();
    expect(screen.getByText('50% (6)')).toBeInTheDocument();
    expect(screen.getByText('Build 5 (latest)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Minimum supported build'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText(/Announcement text/i), { target: { value: 'Upgrade to v0.4' } });
    fireEvent.change(screen.getByLabelText('Announcement severity'), { target: { value: 'warning' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save mobile controls' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/settings',
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            expected_revision: 4,
            changes: {
              app_min_supported_build: 4,
              app_announcement_text: 'Upgrade to v0.4',
              app_announcement_severity: 'warning',
              app_announcement_until: '',
            },
          }),
        }),
      ),
    );
  });
});
