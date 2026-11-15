import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';
import { DeveloperRolesPage } from './DeveloperRolesPage';

const auth = vi.hoisted(() => ({ profile: { id: 'dev-1', role: 'admin', admin_scope: 'developer' } as Record<string, unknown> }));
vi.mock('../auth', () => ({ useAuth: () => ({ profile: auth.profile }) }));

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const accounts = [
  { id: 'dev-1', display_name: 'Zernan', email: 'z@example.com', handle: null, wallet_address: '0xFAdD476C10B6A93Bc26a226f9b7d8e8c556F9671', role: 'admin', admin_scope: 'developer', created_at: '2026-10-01' },
  { id: 'u-2', display_name: 'Ana', email: 'ana@example.com', handle: null, wallet_address: null, role: 'user', admin_scope: null, created_at: '2026-10-02' },
];

describe('Developer: account roles', () => {
  beforeEach(() => { auth.profile = { id: 'dev-1', role: 'admin', admin_scope: 'developer' }; });
  afterEach(() => vi.unstubAllGlobals());

  it('is closed to admins who are not developers', () => {
    auth.profile = { id: 'adm', role: 'admin', admin_scope: 'platform' };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<DeveloperRolesPage />);
    expect(screen.getByRole('alert').textContent).toMatch(/Only developers/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lists accounts, protects your own row, and saves a change with a reason', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('/role-audit')) return ok([]);
      if (init?.method === 'PUT') return ok({ ...accounts[1], role: 'admin', admin_scope: 'platform' });
      return ok(accounts);
    }));
    render(<DeveloperRolesPage />);
    const list = await screen.findByRole('list');
    expect(within(list).getByText('Zernan (you)')).toBeTruthy();
    expect(within(list).getByText(/Another developer must change your own role/)).toBeTruthy();
    expect(list.querySelector('.dev-roles-badge.is-developer')?.textContent).toBe('Developer');

    fireEvent.change(screen.getByLabelText('Access for Ana'), { target: { value: 'admin:platform' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/reason/);
    fireEvent.change(screen.getByLabelText('Reason for Ana'), { target: { value: 'Joins the tourism office' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText(/Ana is now JuanderQuest staff/);
    const put = calls.find(c => c.init?.method === 'PUT')!;
    expect(put.url).toContain('/admin/developer/users/u-2/role');
    expect(JSON.parse(String(put.init!.body))).toEqual({ role: 'admin', admin_scope: 'platform', reason: 'Joins the tourism office' });
    await waitFor(() => expect(calls.filter(c => c.url.includes('/role-audit')).length).toBe(2));
  });

  it('omits Area admin from role options and links area_admin rows to /area-admins without a select', async () => {
    const withAreaAdmin = [
      ...accounts,
      { id: 'aa-1', display_name: 'Mayor Marco', email: 'marco@example.com', handle: null, wallet_address: null, role: 'area_admin', admin_scope: null, created_at: '2026-10-03' },
    ];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('/role-audit')) return ok([]);
      return ok(withAreaAdmin);
    }));
    render(<RouterProvider><DeveloperRolesPage /></RouterProvider>);
    const list = await screen.findByRole('list');

    const selectForAna = screen.getByLabelText('Access for Ana');
    const optionLabels = Array.from(selectForAna.querySelectorAll('option')).map(option => option.textContent);
    expect(optionLabels).not.toContain('Area admin');

    const areaRow = within(list).getByText('Mayor Marco').closest('li')!;
    expect(within(areaRow).getByText('Area admin')).toBeTruthy();
    expect(within(areaRow).getByText(/Area admin — manage in/)).toBeTruthy();
    const link = within(areaRow).getByRole('link', { name: 'Area admins' });
    expect(link.getAttribute('href')).toBe('#/area-admins');
    expect(within(areaRow).queryByRole('combobox')).toBeNull();
    expect(within(areaRow).queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
