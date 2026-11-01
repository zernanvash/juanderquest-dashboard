import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './auth';

function StatusProbe() {
  const { status, scope } = useAuth();
  return <p>{status}:{scope?.platform ? 'platform' : scope ? 'scoped' : 'none'}</p>;
}

const json = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('dashboard role admission', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('denies ordinary users and admits area admins with their server-loaded scope', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/auth/me')) return json({ id: 'user-1', seed_id: 'user-seed', role: 'user', display_name: 'Traveler' });
      if (path.endsWith('/admin/me/scope')) return json({ platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['destinations'] }] });
      if (path.endsWith('/auth/wallet/config')) return json({ mode: 'disabled' });
      throw new Error(`Unexpected request: ${path}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = render(<AuthProvider><StatusProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('denied:none')).toBeTruthy());
    unmount();

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith('/auth/me')) return json({ id: 'area-1', seed_id: 'area-seed', role: 'area_admin', display_name: 'LGU Admin' });
      if (path.endsWith('/admin/me/scope')) return json({ platform: false, grants: [{ area_id: 'pangasinan', area_name: 'Pangasinan', powers: ['destinations'] }] });
      if (path.endsWith('/auth/wallet/config')) return json({ mode: 'disabled' });
      throw new Error(`Unexpected request: ${path}`);
    });
    render(<AuthProvider><StatusProbe /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('authenticated:scoped')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/me/scope', expect.anything());
  });
});
