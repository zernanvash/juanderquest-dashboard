import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { GiveMjdqPage } from './GiveMjdqPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const traveler = { id: 'u1', display_name: 'Ana', handle: 'ana', email: 'ana@example.com', balance: 100, is_test: false, role: 'user' };
const grant = {
  id: 'grant_1',
  user: { id: 'u1', display_name: 'Ana', handle: 'ana' },
  admin: { id: 'a1', display_name: 'Zernan' },
  points: 50,
  reason: 'Beta thanks',
  balance_after: 150,
  is_test: false,
  created_at: '2026-11-18T08:00:00.000Z',
  anchor: { fingerprint: `0x${'1'.repeat(64)}`, status: 'finalized', tx_hash: `0x${'2'.repeat(64)}`, explorer_url: `https://amoy.polygonscan.com/tx/0x${'2'.repeat(64)}`, last_error: null },
};

describe('Give mJDQ', () => {
  beforeEach(() => {
    api.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/point-grants?')) return { items: [grant], max_points: 1000, daily_cap: 5000 } as never;
      if (path.startsWith('/admin/point-grants/lookup')) return { users: [traveler] } as never;
      if (path === '/admin/point-grants') return { grant } as never;
      return {} as never;
    });
  });

  it('lists grants with their Polygonscan link', async () => {
    render(<GiveMjdqPage />);
    expect(await screen.findByText('On-chain (final)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Polygonscan/ })).toHaveAttribute('href', grant.anchor.explorer_url);
  });

  it('finds a traveler, validates the amount and posts the grant', async () => {
    render(<GiveMjdqPage />);
    await screen.findByText('On-chain (final)');
    fireEvent.change(screen.getByLabelText('Traveler email or @handle'), { target: { value: 'ana@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Find/ }));
    expect(await screen.findByText('100 mJDQ')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Amount (mJDQ)'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Reason (shown in the audit log)'), { target: { value: 'Beta thanks' } });
    expect(screen.getByRole('button', { name: /^Give 5000 mJDQ/ })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Amount (mJDQ)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /^Give 50 mJDQ/ }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/admin/point-grants', expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ user_id: 'u1', points: 50, reason: 'Beta thanks' }),
      })),
    );
    expect(await screen.findByText(/New balance: 150 mJDQ/)).toBeInTheDocument();
  });
});
