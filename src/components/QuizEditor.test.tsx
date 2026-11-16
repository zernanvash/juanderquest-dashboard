import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuizEditor } from './QuizEditor';

const ok = (data: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data }) });

describe('QuizEditor with QuizMapPinPicker', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('submits a pinned location quiz without requiring a pre-existing destination_id', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/spots/recognize')) {
        return ok({
          recognized: true,
          municipality: 'Alaminos',
          nearestSpot: { id: 'spot-1', name: 'Lucap Wharf', distanceMeters: 120 },
        });
      }
      if (url === '/api/v1/admin/quizzes' && init?.method === 'POST') {
        return ok({ quiz: { id: 'quiz-1' } });
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSaved = vi.fn();
    render(
      <QuizEditor
        mode="create"
        spots={[{ id: 'spot-1', name: 'Lucap Wharf', municipality: 'Alaminos', gps_lat: 16.156, gps_lng: 119.981, status: 'published' } as any]}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText(/^Title$/i), { target: { value: 'Alaminos Coastal Quiz' } });
    fireEvent.change(screen.getByLabelText(/Description/i), { target: { value: 'Explore the coastal heritage of Alaminos.' } });
    fireEvent.change(screen.getByLabelText(/Location label/i), { target: { value: 'Hundred Islands Pier' } });
    fireEvent.change(screen.getByLabelText(/Latitude/i), { target: { value: '16.158' } });
    fireEvent.change(screen.getByLabelText(/Longitude/i), { target: { value: '119.985' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    const questionInputs = screen.getAllByLabelText(/Question text/i);
    const explanationInputs = screen.getAllByLabelText(/Explanation/i);
    const option1s = screen.getAllByPlaceholderText('Option 1');
    const option2s = screen.getAllByPlaceholderText('Option 2');
    const option3s = screen.getAllByPlaceholderText('Option 3');
    const option4s = screen.getAllByPlaceholderText('Option 4');

    questionInputs.forEach((input, idx) => {
      fireEvent.change(input, { target: { value: `Coastal heritage question ${idx + 1}?` } });
      fireEvent.change(option1s[idx], { target: { value: 'Lingayen Gulf' } });
      fireEvent.change(option2s[idx], { target: { value: 'Manila Bay' } });
      fireEvent.change(option3s[idx], { target: { value: 'Subic Bay' } });
      fireEvent.change(option4s[idx], { target: { value: 'Tayabas Bay' } });
      fireEvent.change(explanationInputs[idx], { target: { value: 'Confirmed by local tourism records.' } });
    });

    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const postCall = fetchMock.mock.calls.find(([u, i]) => u === '/api/v1/admin/quizzes' && (i as RequestInit)?.method === 'POST');
    expect(postCall).toBeTruthy();
    const payload = JSON.parse((postCall?.[1] as RequestInit).body as string);
    expect(payload.destination_id).toBeUndefined();
    expect(payload.pin).toMatchObject({ lat: 16.158, lng: 119.985, name: 'Hundred Islands Pier' });
  });
});
