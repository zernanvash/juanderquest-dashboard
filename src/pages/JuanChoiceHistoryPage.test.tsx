import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JuanChoiceHistoryPage } from './JuanChoiceHistoryPage';

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('JuanChoiceHistoryPage', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lists past rounds and switches between Summary, Candidates, and Audit tabs', async () => {
    const pastRound = {
      id: 'round-1',
      slug: 'weekly-2026-w40',
      region: 'Pangasinan',
      theme: 'Heritage Week',
      status: 'finalized',
      opens_at: '2026-10-01T00:00:00Z',
      closes_at: '2026-10-08T00:00:00Z',
      is_test: false,
      candidate_count: 1,
      ballot_count: 14,
    };
    const detail = {
      campaign: pastRound,
      candidates: [
        {
          id: 'cand-1',
          spot_id: 'spot-1',
          spot_name: 'Manaoag Basilica',
          municipality: 'Manaoag',
          status: 'eligible',
          spot_status: 'published',
          crowd_capacity_band: 'high',
          recommendation_suppressed: false,
          votes: 14,
          weighted_votes: 18,
          boost_points: 50,
          manifesto_perks: [{ key: 'spot_xp_boost', label: '+50% quest XP', is_anchor: true }],
        },
      ],
      audit: [{ action: 'campaign_finalized', reason: 'Round closed cleanly', created_at: '2026-10-08T00:05:00Z' }],
      result: {
        valid_ballots: 14,
        co_winner_ids: ['cand-1'],
        minister_candidate_id: null,
        total_weighted_votes: 18,
        total_boost_points: 50,
        active_perks: [{ key: 'spot_xp_boost', label: '+50% quest XP', role: 'champion' }],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === '/api/v1/juanchoice/admin/campaigns') return ok({ items: [pastRound] });
        if (url === '/api/v1/juanchoice/admin/campaigns/round-1') return ok(detail);
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      }),
    );

    render(<JuanChoiceHistoryPage />);

    expect(await screen.findByRole('heading', { name: /Heritage Week/i })).toBeInTheDocument();
    expect(await screen.findByTestId('jc-history-summary')).toHaveTextContent('Manaoag Basilica');

    fireEvent.click(screen.getByRole('tab', { name: /Candidates & Manifests/i }));
    expect(screen.getByText(/14 ballots · 18 weighted · 50 boost pts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Audit Log/i }));
    expect(screen.getByText(/campaign_finalized — Round closed cleanly/i)).toBeInTheDocument();
  });
});
