import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopCosmeticsPage } from './ShopCosmeticsPage';

describe('ShopCosmeticsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const data = path.includes('/stats') ? { totals: { itemsSold: 2, pointsSpent: 270 } }
        : path.includes('/teasers') ? [] : [{ id: 'frame-bamboo', kind: 'frame', name: 'Bamboo Ring', rarity: 'common', price_points: 120, price_tjdq: null, asset: { colors: ['#95d5b2'], width: 3 }, is_active: true, owners: 2 }];
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('loads cosmetic inventory and offers only the configured name colour palette', async () => {
    render(<ShopCosmeticsPage />);
    expect(await screen.findByText('Bamboo Ring')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'name_color' } });
    const colorSelect = screen.getByLabelText('Name colour') as HTMLSelectElement;
    await waitFor(() => expect(colorSelect.options.length).toBe(4));
    expect(screen.getByText('#2d6a4f')).toBeTruthy();
    expect(screen.getByText('Coming soon teasers')).toBeTruthy();
  });
});
