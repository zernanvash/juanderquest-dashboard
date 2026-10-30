import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopCosmeticsPage } from './ShopCosmeticsPage';

describe('ShopCosmeticsPage', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      const data = path.includes('/stats') ? { totals: { itemsSold: 2, pointsSpent: 270 } }
        : path.includes('/teasers') ? [] : [{ id: 'frame-bamboo', kind: 'frame', name: 'Bamboo Ring', rarity: 'common', price_points: 120, price_tjdq: null, asset: { colors: ['#95d5b2'], width: 3 }, is_active: true, owners: 2 }];
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true, media: '(prefers-reduced-motion: reduce)', onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('loads cosmetic inventory and offers only the configured name colour palette', async () => {
    render(<ShopCosmeticsPage />);
    expect(await screen.findByText('Bamboo Ring')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'name_color' } });
    const colorSelect = screen.getByLabelText('Name colour') as HTMLSelectElement;
    await waitFor(() => expect(colorSelect.options.length).toBe(4));
    expect(screen.getByText('#2d6a4f')).toBeTruthy();
    expect(screen.getByText('Coming soon teasers')).toBeTruthy();
  });

  it('creates a procedural banner with the selected generator and palette', async () => {
    render(<ShopCosmeticsPage />);
    await screen.findByText('Bamboo Ring');
    fireEvent.change(screen.getByLabelText('ID'), { target: { value: 'banner-test-teal' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Test teal banner' } });
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'procedural' } });
    fireEvent.change(screen.getByLabelText('Generator'), { target: { value: 'sunset' } });
    fireEvent.change(screen.getByLabelText('Palette'), { target: { value: 'ember' } });
    expect(screen.getByLabelText('Procedural banner preview')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));
    await screen.findByText('Cosmetic created.');
    const saveCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/admin/shop/cosmetics') && (init as RequestInit | undefined)?.method === 'POST');
    expect(saveCall).toBeTruthy();
    const saved = JSON.parse((saveCall?.[1] as RequestInit).body as string);
    expect(saved.asset).toMatchObject({ style: 'procedural', generator: 'sunset', palette: 'ember', angle: 160, pattern: 'waves' });
    expect(saved.asset.colors).toEqual(['#3b1027', '#a8323e', '#f27b3f', '#ffd27a', '#5a1f2f', '#1c0b14']);
    expect(saved.asset.fallback.colors).toEqual(['#3b1027', '#a8323e']);
  });

  it('loads and updates an existing procedural banner recipe', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      const data = path.includes('/stats') ? { totals: { itemsSold: 0, pointsSpent: 0 } }
        : path.includes('/teasers') ? [] : [{ id: 'banner-lingayen-sunset', kind: 'banner', name: 'Lingayen Sunset', rarity: 'common', price_points: 150, price_tjdq: null, asset: { style: 'procedural', generator: 'sunset', palette: 'golden', colors: ['#2b2a5c', '#c8577a', '#f6a85a', '#ffe2a0', '#3c3a6b', '#141634'], angle: 135, pattern: 'sun' }, is_active: true, seed: 123 }];
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    });
    render(<ShopCosmeticsPage />);
    await screen.findByText('Lingayen Sunset');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
    expect((screen.getByLabelText('Style') as HTMLSelectElement).value).toBe('procedural');
    expect((screen.getByLabelText('Generator') as HTMLSelectElement).value).toBe('sunset');
    fireEvent.change(screen.getByLabelText('Palette'), { target: { value: 'ember' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('Cosmetic updated.');
    const patchCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith('/banner-lingayen-sunset') && (init as RequestInit | undefined)?.method === 'PATCH');
    expect(patchCall).toBeTruthy();
    const patchBody = JSON.parse((patchCall?.[1] as RequestInit).body as string);
    expect(patchBody.asset.palette).toBe('ember');
    expect(patchBody).not.toHaveProperty('id');
  });

  it('shows the backend asset-validator message when a procedural banner is rejected', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/admin/shop/cosmetics') && init?.method === 'POST') {
        return { ok: false, status: 400, json: async () => ({ success: false, error: { code: 'INVALID_ASSET', message: 'Invalid procedural generator.' } }) } as Response;
      }
      const path = String(input);
      const data = path.includes('/stats') ? { totals: { itemsSold: 0, pointsSpent: 0 } } : path.includes('/teasers') ? [] : [];
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    });
    render(<ShopCosmeticsPage />);
    fireEvent.change(await screen.findByLabelText('ID'), { target: { value: 'banner-invalid' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Invalid banner' } });
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'procedural' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid procedural generator.');
  });

  it('renders a legacy gradient banner swatch with fixed preview size and gradient style', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      const data = path.includes('/stats')
        ? { totals: { itemsSold: 1, pointsSpent: 150 } }
        : path.includes('/teasers')
        ? []
        : [
            {
              id: 'banner-legacy-gradient',
              kind: 'banner',
              name: 'Sunset Gradient',
              rarity: 'rare',
              price_points: 150,
              price_tjdq: null,
              asset: { style: 'gradient', angle: 90, colors: ['#ff7e5f', '#feb47b'] },
              is_active: true,
            },
          ];
      return { ok: true, status: 200, json: async () => ({ success: true, data }) } as Response;
    });
    render(<ShopCosmeticsPage />);
    const swatch = await screen.findByLabelText('Sunset Gradient preview swatch');
    expect(swatch).toBeTruthy();
    expect(swatch.className).toContain('w-24');
    expect(swatch.className).toContain('aspect-[2/1]');
    expect(swatch.className).toContain('rounded');
    expect(swatch.style.background).toMatch(/linear-gradient\(90deg, ?(#ff7e5f|rgb\(255, 126, 95\)), ?(#feb47b|rgb\(254, 180, 123\))\)/);
  });
});
