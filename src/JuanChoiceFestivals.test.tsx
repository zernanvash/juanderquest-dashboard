import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JuanChoiceFestivals } from './JuanChoiceFestivals';

const ok = (data: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('Plan 94 festival calendar admin', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds a calendar-only festival and edits an existing one', async () => {
    const festival = { id: 'f1', name: 'Bangus Festival', municipality: 'Dagupan', starts_on: '2027-04-20', ends_on: '2027-04-30',
      boost_multiplier: '1.50', is_test: false, boosts_voting: true };
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/juanchoice/admin/festivals' && (!init?.method || init.method === 'GET')) return ok([festival]);
      if (url === '/api/v1/juanchoice/admin/festivals' && init?.method === 'POST') return ok({ id: 'f2' });
      if (url === '/api/v1/juanchoice/admin/festivals/f1' && init?.method === 'PATCH') return ok(festival);
      return Promise.reject(new Error(`Unhandled ${init?.method ?? 'GET'} ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<JuanChoiceFestivals token="t" />);

    const list = await screen.findByRole('list', { name: 'Festivals' });
    expect(within(list).getByText(/Boosts voting/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Festival'), { target: { value: 'Pista Dayat' } });
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2027-05-01' } });
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2027-05-01' } });
    fireEvent.click(screen.getByLabelText('Boost JuanChoice voting that week'));
    fireEvent.click(screen.getByRole('button', { name: 'Add festival' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!;
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Pista Dayat', municipality: null, starts_on: '2027-05-01', ends_on: '2027-05-01',
      boosts_voting: false, is_test: false });

    await waitFor(() => expect((screen.getByLabelText('Festival') as HTMLInputElement).value).toBe(''));
    const reloaded = await screen.findByRole('list', { name: 'Festivals' });
    fireEvent.click(within(reloaded).getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText('Festival') as HTMLInputElement).value).toBe('Bangus Festival');
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2027-05-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!;
    expect(JSON.parse(patch[1].body)).toEqual({ name: 'Bangus Festival', municipality: 'Dagupan', starts_on: '2027-04-20',
      ends_on: '2027-05-02', boosts_voting: true });
  });

  it('rejects a festival that ends before it starts without calling the server', async () => {
    const fetchMock = vi.fn().mockImplementation(() => ok([]));
    vi.stubGlobal('fetch', fetchMock);
    render(<JuanChoiceFestivals token="t" />);
    await screen.findByText(/No festivals yet/);
    fireEvent.change(screen.getByLabelText('Festival'), { target: { value: 'Backwards Fiesta' } });
    fireEvent.change(screen.getByLabelText('First day'), { target: { value: '2027-05-03' } });
    fireEvent.change(screen.getByLabelText('Last day'), { target: { value: '2027-05-01' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Add festival' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('end on or after');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
