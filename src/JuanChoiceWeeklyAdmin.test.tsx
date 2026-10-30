import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JuanChoiceAdmin } from './JuanChoiceAdmin';
import { JuanChoicePromotionReview } from './JuanChoicePromotionReview';

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('Plan 65 weekly JuanChoice admin', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('shows weighted telemetry, the vice champion and the active perks of a weekly round', async () => {
    const campaign = { id: 'wk-1', slug: 'weekly-2026-W44-s', region: 'Pangasinan', theme: 'Coast week', status: 'finalized',
      opens_at: '2026-10-25T16:00:00.000Z', closes_at: '2026-11-01T16:00:00.000Z', is_test: false, candidate_count: 2, ballot_count: 7,
      policy_version: 'juanchoice-weekly-v1', round_tier: 'special_festival', festival_name: "Pista'y Dayat", weighted_votes: 12, boost_points: 125 };
    const candidate = (id: string, name: string, votes: number, weighted: number, extra = {}) => ({ id, spot_id: `spot-${id}`, spot_name: name,
      municipality: 'Bolinao', status: 'eligible', spot_status: 'published', crowd_capacity_band: 'high', recommendation_suppressed: false,
      votes, weighted_votes: weighted, boost_points: 0, ...extra });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/juanchoice/admin/campaigns') return ok({ items: [campaign] });
      if (url === '/api/v1/juanchoice/admin/campaigns/wk-1') return ok({ campaign, audit: [],
        candidates: [
          candidate('c1', 'Patar Beach', 4, 9, { boost_points: 125, manifesto_perks: [{ key: 'spot_xp_boost', label: '+50% quest XP here', is_anchor: true },
            { key: 'trail_discount', label: '-20% Hiyas trails', is_mystery: true, revealed: false }] }),
          candidate('c2', 'Enchanted Cave', 3, 3, { prior_loss_streak: 2 }),
        ],
        result: { valid_ballots: 7, co_winner_ids: ['c1'], minister_candidate_id: 'c2', total_weighted_votes: 12, total_boost_points: 125,
          active_perks: [{ key: 'spot_xp_boost', label: '+50% quest XP here', role: 'champion' }, { key: 'daily_stamp_bonus', label: '+5 daily stamps', role: 'minister' }] } });
      if (url === '/api/v1/admin/spots') return ok([]);
      if (url === '/api/v1/juanchoice/admin/schedules') return ok({ items: [] });
      if (url === '/api/v1/juanchoice/admin/festivals') return ok([]);
      if (url.includes('/promotion-assessment')) return ok({ eligible: true, eligibility_reason: null, latest_assessment: null,
        crowd_status: 'low', crowd_confidence: 'high', gate: 'automated' });
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<JuanChoiceAdmin token="t" />);

    expect(await screen.findByText(/12 weighted votes · 125 boost points · opens/)).toBeTruthy();
    expect(screen.getByText(/Special round · Pista'y Dayat/)).toBeTruthy();
    expect(screen.getByText(/4 provisional ballots · 9 weighted · 125 boost pts/)).toBeTruthy();
    expect(screen.getByText(/underdog ×2/)).toBeTruthy();
    expect(screen.getByText(/Manifesto: \+50% quest XP here · anchor · -20% Hiyas trails \(mystery\)/)).toBeTruthy();
    const result = screen.getByTestId('jc-weekly-result');
    expect(within(result).getByText(/Champion: Patar Beach · Vice Champion: Enchanted Cave/)).toBeTruthy();
    expect(within(result).getByText(/\+5 daily stamps \(vice champion\)/)).toBeTruthy();
    expect((await screen.findAllByText('Automated Safety Gate: CLEARED (Override / Restrict Spotlight)')).length).toBe(2);
  });

  it('labels a weekly crowd hold as overridable by a clearance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => ok({ eligible: false, eligibility_reason: 'ESTIMATED_BUSY', latest_assessment: null,
      crowd_status: 'estimated_busy', crowd_confidence: 'medium', gate: 'automated' })));
    render(<JuanChoicePromotionReview campaignId="wk-1" candidateId="c1" candidateName="Patar Beach" token="t" isQaCampaign={false} />);
    expect(await screen.findByText(/Automated Safety Gate: HELD for crowding/)).toBeTruthy();
  });

  it('adds and removes festivals', async () => {
    let festivals: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/juanchoice/admin/festivals' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        festivals = [{ id: 'f1', boost_multiplier: '1.50', ...body }];
        return Promise.resolve({ ok: true, status: 201, json: async () => ({ success: true, data: festivals[0] }) });
      }
      if (url === '/api/v1/juanchoice/admin/festivals/f1' && init?.method === 'DELETE') { festivals = []; return ok({ deleted: true }); }
      if (url === '/api/v1/juanchoice/admin/festivals') return ok(festivals);
      if (url === '/api/v1/juanchoice/admin/campaigns') return ok({ items: [] });
      if (url === '/api/v1/admin/spots') return ok([]);
      if (url === '/api/v1/juanchoice/admin/schedules') return ok({ items: [] });
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<JuanChoiceAdmin token="t" />);

    expect(await screen.findByText(/No festivals yet/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Festival'), { target: { value: 'Bangus Festival' } });
    fireEvent.change(screen.getByLabelText('Town (optional)'), { target: { value: 'Dagupan' } });
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2026-04-20' } });
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2026-05-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add festival' }));
    expect(await screen.findByText('Bangus Festival')).toBeTruthy();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'Bangus Festival', municipality: 'Dagupan', starts_on: '2026-04-20', ends_on: '2026-05-01', is_test: false });
    fireEvent.click(within(screen.getByRole('list', { name: 'Festivals' })).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(screen.getByText(/No festivals yet/)).toBeTruthy());
  });
});
