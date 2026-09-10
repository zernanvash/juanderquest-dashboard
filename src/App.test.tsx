import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const submission = {
  id: 'submission-1', user_name: 'Traveler', quest_title: 'Beach Quest', scanned_marker_code: 'BEACH',
  captured_lat: 16.1, captured_lng: 120.2, target_lat: 16.1, target_lng: 120.2,
  distance_meters: 75, quest_radius_meters: 100, captured_accuracy: 8, status: 'pending', created_at: '2026-08-03T00:00:00Z',
};

describe('dashboard stabilization', () => {
  beforeEach(() => { localStorage.clear(); window.history.replaceState(null, '', '/'); });
  afterEach(() => vi.restoreAllMocks());

  it('accepts a handed-off session and removes it from the URL', async () => {
    window.history.replaceState(null, '', '/#session=handoff-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) }));
    render(<App />);
    expect(localStorage.getItem('admin_token')).toBe('handoff-token');
    expect(window.location.hash).toBe('');
    expect(await screen.findByText('No submissions found in this queue.')).toBeInTheDocument();
  });

  it('requires a rejection reason before submitting', async () => {
    localStorage.setItem('admin_token', 'token');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true, data: [submission] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /reject/i }));
    const confirm = screen.getByRole('button', { name: /confirm rejection/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'Marker proof is unreadable.' } });
    expect(confirm).toBeEnabled();
  });

  it('shows a loading failure with a retry control', async () => {
    localStorage.setItem('admin_token', 'token');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Server unavailable')));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Loading submissions…')).not.toBeInTheDocument());
  });
  it('requests test submissions with header and filters between live and qa items', async () => {
    localStorage.setItem('admin_token', 'token');
    const liveSub = { ...submission, id: 'sub-live', quest_title: 'Live Quest', is_test: false };
    const qaSub = { ...submission, id: 'sub-qa', quest_title: 'Synthetic Test Quest', is_test: true };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [liveSub, qaSub] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    // Check header sent
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs[0]).toContain('/admin/submissions');
    expect(callArgs[1]?.headers).toMatchObject({
      Authorization: 'Bearer token',
      'x-include-test': 'true',
    });

    // Check both appear initially
    expect(await screen.findByText('Live Quest')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Test Quest')).toBeInTheDocument();
    expect(screen.getByText(/QA Test Fixture/i)).toBeInTheDocument();

    // Filter by live production only
    fireEvent.click(screen.getByRole('button', { name: /Live Production/i }));
    expect(screen.getByText('Live Quest')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic Test Quest')).not.toBeInTheDocument();

    // Filter by QA fixtures only
    fireEvent.click(screen.getByRole('button', { name: /QA Fixtures/i }));
    expect(screen.queryByText('Live Quest')).not.toBeInTheDocument();
    expect(screen.getByText('Synthetic Test Quest')).toBeInTheDocument();
  });
});
