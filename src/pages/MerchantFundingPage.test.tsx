import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { RouterProvider } from '../router';
import { MerchantFundingPage } from './MerchantFundingPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

describe('MerchantFundingPage', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/merchant-funding?')) {
        return { items: [] } as never;
      }
      if (path === '/admin/merchant-funding') {
        return {
          items: [
            {
              merchant_id: 'm-1',
              name: 'Alaminos Cafe',
              category: 'Dining',
              municipality: 'Alaminos',
              status: 'active',
              is_published: true,
              is_test: false,
              sponsoring_suspended: false,
              sponsoring_suspended_reason: null,
              balance_points: 1200,
              total_credited: 2000,
              total_sponsored: 800,
              sponsorship_counts: { accepted: 2, requested: 1, countered: 0 },
              accepted_with_unmet_count: 1,
              active_rounds_sponsored: 1,
              last_activity: '2026-11-10T00:00:00.000Z',
            },
          ],
        } as never;
      }
      if (path === '/admin/merchant-funding/m-1') {
        return {
          merchant: {
            id: 'm-1',
            name: 'Alaminos Cafe',
            municipality: 'Alaminos',
            status: 'active',
            is_published: true,
            is_test: false,
            sponsoring_suspended: false,
            sponsoring_suspended_reason: null,
            balance_points: 1200,
          },
          credits: [],
          contributions: [],
          sponsorships: [],
        } as never;
      }
      return {} as never;
    });
  });

  it('lists merchants, opens detail, and suspends sponsoring with a reason', async () => {
    render(
      <RouterProvider>
        <MerchantFundingPage />
      </RouterProvider>,
    );

    const row = await screen.findByText('Alaminos Cafe');
    fireEvent.click(row);

    expect(await screen.findByLabelText('Selected merchant funding detail')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Suspension / resume reason (min 5 chars to suspend)'), {
      target: { value: 'Repeated unmet condition overrides' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Suspend sponsoring' }));

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/merchants/m-1/sponsoring/suspend',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ reason: 'Repeated unmet condition overrides' }),
        }),
      ),
    );
  });
});
