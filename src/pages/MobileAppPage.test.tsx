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
    app_promo_enabled: false,
    app_promo_campaign_id: '',
    app_promo_title: '',
    app_promo_body: '',
    app_promo_cta_label: 'Open Form',
    app_promo_url: '',
    app_promo_until: '',
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

  it('renders promo panel controls + live preview, validates HTTPS URL, rotates campaign_id, and saves all 7 keys', async () => {
    api.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (path === '/admin/mobile-app/overview') return mockOverview as never;
      if (path === '/admin/settings' && init?.method === 'PUT') return { revision: 5 } as never;
      return {} as never;
    });

    render(<MobileAppPage />);
    expect(await screen.findByText('Home Feedback & Promotion Panel')).toBeInTheDocument();

    const preview = screen.getByLabelText('Home promo live preview');
    expect(preview).toHaveTextContent('DISABLED');

    const savePromoBtn = screen.getByRole('button', { name: 'Save promo panel' });

    fireEvent.click(screen.getByLabelText('Show highlighted panel on Mobile Home'));
    fireEvent.change(screen.getByLabelText(/^Headline/i), { target: { value: 'Share Beta Feedback!' } });
    fireEvent.change(screen.getByLabelText(/^Description/i), { target: { value: 'Help us polish v0.4.' } });
    fireEvent.change(screen.getByLabelText(/^Button label/i), { target: { value: 'Take Survey' } });
    fireEvent.change(screen.getByLabelText('Form URL (HTTPS)'), { target: { value: 'http://insecure.example.com' } });

    expect(screen.getByText(/Form URL must start with https:\/\//i)).toBeInTheDocument();
    expect(savePromoBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Form URL (HTTPS)'), { target: { value: 'https://forms.gle/abc123' } });
    expect(preview).toHaveTextContent('LIVE');
    expect(preview).toHaveTextContent('Share Beta Feedback!');
    expect(preview).toHaveTextContent('TAKE SURVEY');

    fireEvent.click(screen.getByRole('button', { name: 'New campaign ID' }));
    const rotatedId = (screen.getByLabelText('Campaign ID') as HTMLInputElement).value;
    expect(rotatedId).toMatch(/^promo-\d{8}-\d{6}/);

    expect(savePromoBtn).not.toBeDisabled();
    fireEvent.click(savePromoBtn);

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/settings',
        expect.objectContaining({
          method: 'PUT',
          body: expect.objectContaining({
            expected_revision: 4,
            changes: {
              app_promo_enabled: true,
              app_promo_campaign_id: rotatedId,
              app_promo_title: 'Share Beta Feedback!',
              app_promo_body: 'Help us polish v0.4.',
              app_promo_cta_label: 'Take Survey',
              app_promo_url: 'https://forms.gle/abc123',
              app_promo_until: '',
            },
          }),
        }),
      ),
    );
  });
});
