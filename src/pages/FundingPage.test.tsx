import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { FundingPage } from './FundingPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));

const api = vi.mocked(apiFetch);
const credit = {
  id: 'credit-1', merchant_id: 'merchant-1', merchant_name: 'Test Cafe', source: 'admin_grant',
  points: 300, reference: 'initial grant', ledger_group_id: 'ledger-1', reverses_credit_id: null,
  created_at: '2026-10-17T00:00:00.000Z',
};

describe('admin funded quest operations', () => {
  beforeEach(() => {
    api.mockReset();
    vi.stubGlobal('confirm', vi.fn(() => true));
    api.mockImplementation(async (path: string) => {
      if (path === '/admin/quest-funding') return { items: [] } as never;
      if (path === '/admin/treasury') return { accounts: [], reconciliation: { ok: true, plans: { mismatches: 0 }, point_accounts: { mismatches: 0 }, ledger_groups: { mismatches: 0 } } } as never;
      if (path === '/admin/merchant-point-credits?limit=200') return { items: [credit] } as never;
      if (path === '/admin/merchants') return [{ id: 'merchant-1', name: 'Test Cafe', status: 'active', is_published: true }] as never;
      return {} as never;
    });
  });

  it('requires a selected original credit for negative correction and posts an audited reversal', async () => {
    render(<FundingPage />);
    await screen.findByText('Reconciliation clean');

    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'merchant-1' } });
    fireEvent.change(screen.getByLabelText('Signed points'), { target: { value: '-100' } });
    fireEvent.change(screen.getByLabelText('Reason (minimum 10 characters)'), { target: { value: 'Correct duplicate grant' } });
    expect(screen.getByRole('button', { name: 'Record correction' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Original credit to reverse'), { target: { value: 'credit-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record correction' }));

    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/merchants/merchant-1/points', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ points: -100, reason: 'Correct duplicate grant', reverses_credit_id: 'credit-1' }),
    })));
    expect(await screen.findByText('Audited merchant credit correction recorded.')).toBeInTheDocument();
  });
});
