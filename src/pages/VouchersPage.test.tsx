import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../auth', () => ({
  useAuth: () => ({ scope: { platform: true, grants: [] } }),
  useSelectedAreaId: () => null,
}));

import { VouchersPage } from './VouchersPage';

const voucher = {
  id: 'v1',
  merchant_name: 'Aling Nena Cafe',
  title: 'Free halo-halo',
  cost_points: 200,
  description: 'One regular halo-halo.',
  availability: 'live',
};

describe('Plan 107 voucher Used count', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows how many redemptions the shop marked used, and nothing when the API sends no count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: [
            { ...voucher, redeemed_count: 5, used_count: 3 },
            { ...voucher, id: 'v2', title: 'Old voucher' },
          ],
        }),
      }),
    );

    render(<VouchersPage />);

    expect(await screen.findByText('3 of 5')).toBeTruthy();
    expect(screen.getAllByText(/^Used:/)).toHaveLength(1);
  });
});
