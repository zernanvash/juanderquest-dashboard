import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AvatarReportsPage } from './AvatarReportsPage';
import { NAV_SECTIONS } from '../navigation';

const group = {
  user_id: 'usr-maria',
  avatar_url: '/api/v1/uploads/spot-photos/spot_photo_maria.jpg',
  display_name: 'Maria',
  handle: 'maria',
  report_count: 2,
  reasons: ['spam', 'impersonation'],
  first_reported_at: '2026-11-19T03:00:00.000Z',
  is_current: true,
};

const json = (data: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => data }) as Response;

describe('AvatarReportsPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('is listed in the moderation section', () => {
    const items = NAV_SECTIONS.flatMap((s) => s.items).map((i) => i.path);
    expect(items).toContain('/avatar-reports');
  });

  it('lists open reports and resets a picture', async () => {
    let open = [group];
    const posts: { url: string; body: unknown }[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const u = String(url);
      if (u.endsWith('/api/v1/admin/avatar-reports')) {
        return Promise.resolve(json({ success: true, data: { items: open } }));
      }
      if (u.includes('/api/v1/admin/avatar-reports/usr-maria/resolve')) {
        posts.push({ url: u, body: JSON.parse(String(init?.body)) });
        open = [];
        return Promise.resolve(json({ success: true, data: { resolved: 2 } }));
      }
      return Promise.reject(new Error(`Unexpected url: ${u}`));
    });

    render(<AvatarReportsPage />);
    expect(await screen.findByText('Maria (@maria)')).toBeTruthy();
    expect(screen.getByText('2 reports')).toBeTruthy();
    expect(screen.getByText('Spam, Not a person / impersonation')).toBeTruthy();
    expect(screen.getByAltText('Profile picture of Maria').getAttribute('src')).toBe(group.avatar_url);

    fireEvent.click(screen.getByRole('button', { name: 'Reset picture' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toEqual({ action: 'reset' });
    expect(await screen.findByText('No open profile picture reports.')).toBeTruthy();
  });

  it('dismisses reports', async () => {
    const bodies: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      const u = String(url);
      if (u.includes('/resolve')) {
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(json({ success: true, data: { resolved: 2 } }));
      }
      return Promise.resolve(json({ success: true, data: { items: [group] } }));
    });
    render(<AvatarReportsPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(bodies).toEqual([{ action: 'dismiss' }]));
  });
});
