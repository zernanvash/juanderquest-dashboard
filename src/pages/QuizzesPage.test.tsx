import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouterProvider } from '../router';
import { QuizzesPage } from './QuizzesPage';

const quizList = [
  {
    quiz: {
      id: 'quiz-1',
      destination_id: 'spot-1',
      status: 'draft',
      current_version: 1,
      is_test: false,
      created_at: '2026-10-14T00:00:00Z',
      updated_at: '2026-10-14T00:00:00Z',
    },
    version: {
      id: 'version-1',
      quiz_id: 'quiz-1',
      version: 1,
      title: 'Cape Bolinao Stories',
      description: 'A quiz about the cape.',
      language: 'en',
      radius_meters: 200,
      xp_reward: 25,
      time_limit_minutes: 30,
      cooldown_hours: 24,
      published_at: null,
      created_at: '2026-10-14T00:00:00Z',
    },
    destination_name: 'Patar White Beach',
  },
];

const spots = [
  {
    id: 'spot-1',
    name: 'Patar White Beach',
    category: 'nature',
    subcategory: 'beach',
    municipality: 'Bolinao',
    source_name: 'Editorial',
    trust_level: 'verified',
    status: 'published',
  },
];

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const renderPage = () =>
  render(
    <RouterProvider>
      <QuizzesPage />
    </RouterProvider>
  );

describe('QuizzesPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#/quizzes');
  });
  afterEach(() => vi.restoreAllMocks());

  it('lists quizzes with lifecycle effects and publishes a draft after confirmation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/admin/quizzes') return Promise.resolve(jsonResponse({ success: true, data: quizList }));
      if (url === '/api/v1/admin/spots') return Promise.resolve(jsonResponse({ success: true, data: spots }));
      if (url === '/api/v1/admin/quizzes/quiz-1/publish') return Promise.resolve(jsonResponse({ success: true, data: { ...quizList[0].quiz, status: 'published' } }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    renderPage();
    expect(await screen.findByText('Cape Bolinao Stories')).toBeInTheDocument();
    expect(screen.getByText(/Pause — Blocks new attempts/i)).toBeInTheDocument();
    expect(screen.getByText(/Revoke — Archives the quiz and abandons active attempts/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/v1/admin/quizzes/quiz-1/publish')).toBe(true)
    );
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('becomes immutable'));
  });

  it('opens the create wizard and validates the first step', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/admin/quizzes') return Promise.resolve(jsonResponse({ success: true, data: [] }));
      if (url === '/api/v1/admin/spots') return Promise.resolve(jsonResponse({ success: true, data: spots }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /create quiz/i }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Destination & basics')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a published destination.');
  });

  it('requires a reasoned revocation', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/admin/quizzes') {
        return Promise.resolve(jsonResponse({
          success: true,
          data: [{ ...quizList[0], quiz: { ...quizList[0].quiz, status: 'published' }, version: { ...quizList[0].version, published_at: '2026-10-14T01:00:00Z' } }],
        }));
      }
      if (url === '/api/v1/admin/spots') return Promise.resolve(jsonResponse({ success: true, data: spots }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'prompt').mockReturnValue('short');

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /^revoke$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 10 characters/i);
  });
});
