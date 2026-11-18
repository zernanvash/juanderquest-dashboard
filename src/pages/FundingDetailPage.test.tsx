import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { RouterProvider } from '../router';
import { FundingDetailPage } from './FundingDetailPage';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const basePlan = {
  id: 'plan-1',
  quest_id: 'quest-1',
  quest_title: 'Hundred Islands Clean-up',
  round_number: 1,
  mode: 'budget',
  status: 'active',
  reward_points: 50,
  fee_points: 5,
  planned_completions: 10,
  target_points: 550,
  starts_at: '2026-11-01T00:00:00.000Z',
  ends_at: '2026-12-01T00:00:00.000Z',
  created_by: 'user-1',
  creator_display_name: 'Mayor Cruz',
  holds_paused: false,
  admin_flagged: false,
  is_test: false,
  contributions: [
    {
      id: 'c-1',
      funder_kind: 'merchant',
      funder_name: 'Alaminos Cafe',
      committed_points: 550,
      remaining_points: 440,
      held_points: 55,
      paid_reward_points: 50,
      paid_fee_points: 5,
      refunded_points: 0,
      created_at: '2026-11-02T00:00:00.000Z',
    },
  ],
  holds: [
    {
      id: 'hold-expired',
      user_id: 'traveler-1234',
      traveler_label: 'Juan Dela Cruz',
      submission_id: null,
      status: 'held',
      created_at: '2026-11-03T00:00:00.000Z',
      expires_at: '2020-01-01T00:00:00.000Z',
    },
  ],
  sponsorships: [
    {
      id: 'sp-1',
      merchant_id: 'm-1',
      merchant_name: 'Alaminos Cafe',
      points: 550,
      voucher_qty: 2,
      promo: true,
      status: 'accepted',
      conditions: [{ type: 'same_town', met: false, detail: 'Different towns' }],
      accepted_with_unmet: [{ type: 'same_town', met: false, detail: 'Different towns' }],
      counter_points: null,
      counter_message: null,
    },
  ],
};

const baseTreasury = {
  plan_id: 'plan-1',
  target_points: 550,
  committed_points: 550,
  available_points: 440,
  held_points: 55,
  paid_reward_points: 50,
  paid_fee_points: 5,
  refunded_points: 0,
  live_holds_count: 1,
  live_holds_points: 55,
  reconciliation: { ok: true, mismatches: 0, contributions: [] },
};

describe('FundingDetailPage', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path === '/admin/funding-plans/plan-1') return basePlan as never;
      if (path === '/admin/funding-plans/plan-1/treasury') return baseTreasury as never;
      if (path.startsWith('/admin/funding-plans/plan-1/transactions')) {
        return {
          items: [
            {
              transaction_group_id: 'grp-1',
              type: 'quest_fund_lock',
              points: 550,
              amount_mjdq: 550000,
              from_account: 'merchant:m-1',
              to_account: 'quest_budget:plan-1',
              reference_type: 'quest_sponsorship',
              reference_id: 'sp-1',
              actor_id: 'm-owner',
              created_at: '2026-11-02T00:00:00.000Z',
            },
          ],
        } as never;
      }
      return {} as never;
    });
  });

  it('renders treasury reconciliation, transactions filter, unmet override badge, and control posts', async () => {
    render(
      <RouterProvider>
        <FundingDetailPage planId="plan-1" />
      </RouterProvider>,
    );

    expect(await screen.findByText('Plan reconciliation clean')).toBeInTheDocument();
    expect(screen.getByText('Accepted with unmet (1)')).toBeInTheDocument();
    expect(screen.getByText('grp-1')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter transaction type'), { target: { value: 'quest_fund_hold' } });
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/funding-plans/plan-1/transactions?type=quest_fund_hold',
        expect.anything(),
      ),
    );

    fireEvent.change(screen.getByLabelText('Reason / note (min 5 chars for pause/flag)'), {
      target: { value: 'Investigating anomalous spike' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pause new holds' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/funding-plans/plan-1/pause-holds',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({ reason: 'Investigating anomalous spike' }),
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Release stuck hold' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/admin/funding-holds/hold-expired/release',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
