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

import { SpotPhotosPage } from './SpotPhotosPage';

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

const pendingPhoto = {
  id: 'sps-1',
  spot_id: 'spot-1',
  user_id: 'u-1',
  asset_id: 'asset-1',
  caption: 'Clear sunset shot',
  status: 'pending',
  created_at: '2026-11-17T00:00:00Z',
  updated_at: '2026-11-17T00:00:00Z',
  spot_name: 'Hundred Islands',
  spot_municipality: 'Alaminos',
  uploader_name: 'Maria Clara',
  photo_url: '/api/v1/uploads/spot-photos/asset-1.jpg',
};

describe('Plan 102 SpotPhotosPage moderation', () => {
  beforeEach(() => {
    auth.value = {
      scope: { platform: false, grants: [{ area_id: 'area-1', powers: ['destinations'] }] },
      selectedAreaId: 'area-1',
    };
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists pending photos and approves one', async () => {
    window.history.replaceState(null, '', '/#/spot-photos');
    const calls = stubFetch({
      'GET /api/v1/admin/spot-photos?status=pending&area_id=area-1': [pendingPhoto],
      'POST /api/v1/admin/spot-photos/sps-1/approve': { ...pendingPhoto, status: 'approved' },
    });

    render(
      <RouterProvider>
        <SpotPhotosPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Hundred Islands')).toBeInTheDocument();
    expect(screen.getByText('Clear sunset shot')).toBeInTheDocument();
    expect(screen.getByAltText('Clear sunset shot')).toHaveAttribute('src', '/api/v1/uploads/spot-photos/asset-1.jpg');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/approve'))).toBeDefined(),
    );
    await waitFor(() => expect(screen.queryByText('Clear sunset shot')).not.toBeInTheDocument());
  });

  it('requires a reason before rejecting a photo', async () => {
    window.history.replaceState(null, '', '/#/spot-photos');
    const calls = stubFetch({
      'GET /api/v1/admin/spot-photos?status=pending&area_id=area-1': [pendingPhoto],
      'POST /api/v1/admin/spot-photos/sps-1/reject': { ...pendingPhoto, status: 'rejected', reject_reason: 'Too blurry' },
    });

    render(
      <RouterProvider>
        <SpotPhotosPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Clear sunset shot')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 3 characters/i);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText('Rejection reason for photo sps-1'), { target: { value: 'Too blurry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST' && c.url.endsWith('/reject'))?.body).toEqual({
        reason: 'Too blurry',
      }),
    );
  });
});
