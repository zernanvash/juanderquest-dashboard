import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';

vi.mock('../auth', () => ({
  useAuth: () => ({ scope: { platform: false, grants: [{ area_id: 'area-1', powers: ['merchants_vouchers'] }] } }),
  useSelectedAreaId: () => 'area-1',
}));

import { SukiCardsPage } from './SukiCardsPage';

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

const program = {
  id: 'suki_1',
  title: 'Kape Suki',
  status: 'active',
  paused_by: null,
  pause_reason: null,
  mode: 'standee',
  visits_required: 10,
  reward_text: 'Free iced coffee',
  merchant_id: 'm1',
  merchant_name: 'Aling Nena Cafe',
  municipality: 'Dagupan City',
  cards: 12,
  visits_30d: 40,
  flagged: 2,
};

describe('Plan 107 Suki Cards admin page', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists cards and town visits, and pauses a card only with a reason', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    let paused = false;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (method === 'GET' && url === '/api/v1/admin/suki/programs?area_id=area-1')
          return ok({ items: [paused ? { ...program, status: 'paused', paused_by: 'admin', pause_reason: 'Fake visits' } : program] });
        if (method === 'GET' && url === '/api/v1/admin/suki/towns?weeks=8&area_id=area-1')
          return ok({ items: [{ town: 'Dagupan City', week: '2026-11-16', visits: 40, shops: 3, unique_customers: 18 }] });
        if (method === 'POST' && url === '/api/v1/admin/suki/programs/suki_1/pause') {
          paused = true;
          return ok({ id: 'suki_1', status: 'paused' });
        }
        return Promise.reject(new Error(`Unhandled ${method} ${url}`));
      }),
    );

    render(
      <RouterProvider>
        <SukiCardsPage />
      </RouterProvider>,
    );

    expect(await screen.findByText('Aling Nena Cafe')).toBeTruthy();
    expect(screen.getByText('2026-11-16')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('alert').textContent).toContain('reason');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    fireEvent.change(screen.getByLabelText('Pause reason for Aling Nena Cafe'), { target: { value: 'Fake visits' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy());
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ reason: 'Fake visits' });
  });
});
