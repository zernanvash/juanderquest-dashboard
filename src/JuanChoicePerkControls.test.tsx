import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JuanChoicePerkControls, ManifestoEditor } from './JuanChoicePerkControls';

const ok = (data: unknown, status = 200) => Promise.resolve({ ok: true, status, json: async () => ({ success: true, data }) });
const state = (overrides: Record<string, unknown> = {}) => ({
  catalog: [
    { key: 'daily_stamp_bonus', domain: 'stamps_quiz', anchor: false, default_standard: 5, default_festival: 10, bounds: { min: 1, max: 20, unit: 'stamps' },
      enabled: true, standard_value: 5, festival_value: 10, overridden: false, updated_by: null, updated_at: null, sample_label: '+5 daily stamps' },
    { key: 'spot_xp_boost', domain: 'quests', anchor: true, default_standard: 0.5, default_festival: 0.75, bounds: { min: 0.05, max: 1, unit: 'percent' },
      enabled: true, standard_value: 0.5, festival_value: 0.75, overridden: false, updated_by: null, updated_at: null, sample_label: '+50% quest XP here' },
  ],
  reign: { campaign_id: 'camp-1', theme: 'Coast week', round_tier: 'standard', reign_ends_at: '2026-11-09T16:00:00.000Z' },
  live: [{ key: 'daily_stamp_bonus', label: '+5 daily stamps', role: 'minister', campaign_id: 'camp-1', candidate_id: 'cand-2', spot_id: 's2',
    municipality: 'Bolinao', suspension_id: null, paused_by_setting: false, effective_value: 5 }],
  audit: [{ action: 'perk_setting.update', target: { perk_key: 'spot_xp_boost' }, reason: 'Testing the switch today', actor_id: 'staff-1', created_at: '2026-10-29T03:00:00.000Z' }],
  ...overrides,
});

describe('JuanChoice perk controls (JuanderQuest staff only)', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing for area admins', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => (url.endsWith('/perk-controls/access') ? ok({ platform: false }) : Promise.reject(new Error(url))));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<JuanChoicePerkControls token="t" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.textContent).toBe('');
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/v1/juanchoice/admin/perk-controls/access']);
  });

  it('lets staff pause a live perk, switch a type off and change amounts, each with a reason', async () => {
    const writes: Array<{ url: string; method?: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/perk-controls/access')) return ok({ platform: true });
      if (url.endsWith('/perk-controls') && (!init?.method || init.method === 'GET')) return ok(state());
      writes.push({ url, method: init?.method, body: JSON.parse(String(init?.body)) });
      return ok({});
    }));
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Vendor reported a pricing error');
    render(<JuanChoicePerkControls token="t" />);

    const live = await screen.findByRole('list', { name: 'Live perks' });
    expect(within(live).getByText('+5 daily stamps')).toBeTruthy();
    expect(within(live).getByText(/Vice Champion · Bolinao/)).toBeTruthy();
    fireEvent.click(within(live).getByRole('button', { name: 'Pause this perk' }));
    await screen.findByText('Pause saved.');
    expect(writes[0]).toEqual({ url: '/api/v1/juanchoice/admin/perk-controls/suspensions', method: 'POST',
      body: { campaign_id: 'camp-1', candidate_id: 'cand-2', perk_key: 'daily_stamp_bonus', reason: 'Vendor reported a pricing error' } });

    const settings = screen.getByRole('list', { name: 'Perk settings' });
    fireEvent.click(within(settings).getAllByRole('button', { name: 'Switch off everywhere' })[0]);
    await waitFor(() => expect(writes).toHaveLength(2));
    expect(writes[1]).toMatchObject({ url: '/api/v1/juanchoice/admin/perk-controls/settings/daily_stamp_bonus', method: 'PUT', body: { enabled: false } });

    fireEvent.change(screen.getByLabelText('Quest XP at the winning spot normal value'), { target: { value: '20' } });
    fireEvent.click(within(settings).getAllByRole('button', { name: 'Save amounts' })[1]);
    await waitFor(() => expect(writes).toHaveLength(3));
    expect(writes[2]).toMatchObject({ url: '/api/v1/juanchoice/admin/perk-controls/settings/spot_xp_boost', body: { standard_value: 0.2, festival_value: 0.75 } });
    expect(prompt).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Testing the switch today/)).toBeTruthy();
  });

  it('refuses a change without a 10-character reason', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => (url.endsWith('/access') ? ok({ platform: true }) : ok(state())));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'prompt').mockReturnValue('oops');
    render(<JuanChoicePerkControls token="t" />);
    fireEvent.click(within(await screen.findByRole('list', { name: 'Live perks' })).getByRole('button', { name: 'Pause this perk' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/at least 10 characters/);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('edits an upcoming contender\'s perks with a mystery perk', async () => {
    const fetchMock = vi.fn().mockImplementation(() => ok([]));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'prompt').mockReturnValue('Balance the round before it opens');
    const onSaved = vi.fn();
    render(<ManifestoEditor campaignId="camp-9" candidateId="cand-9" current={['spot_xp_boost']} token="t" onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit perks (staff)' }));
    fireEvent.click(screen.getByLabelText('Quiz XP'));
    fireEvent.change(screen.getByLabelText('Mystery perk'), { target: { value: 'quiz_arcade_xp_boost' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save perks' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/juanchoice/admin/campaigns/camp-9/candidates/cand-9/manifesto');
    expect(JSON.parse(String(init.body))).toEqual({ perk_keys: ['spot_xp_boost', 'quiz_arcade_xp_boost'], mystery_key: 'quiz_arcade_xp_boost', reason: 'Balance the round before it opens' });
  });
});
