import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const adminProfile = {
  id: 'admin-1',
  seed_id: 'admin-1',
  display_name: 'Tourism Officer Admin',
  email: 'admin@pangasinan.gov.ph',
  role: 'admin',
};

const travelerProfile = {
  id: 'user-1',
  seed_id: 'user-1',
  display_name: 'Juan Dela Cruz',
  email: 'juan@juanderquest.ph',
  role: 'user',
};

const submission = {
  id: 'submission-1',
  user_name: 'Traveler',
  quest_title: 'Beach Quest',
  scanned_marker_code: 'BEACH',
  captured_lat: 16.1,
  captured_lng: 120.2,
  target_lat: 16.1,
  target_lng: 120.2,
  distance_meters: 75,
  quest_radius_meters: 100,
  captured_accuracy: 8,
  status: 'pending',
  created_at: '2026-08-03T00:00:00Z',
};

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const unauthorized = () =>
  jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing session.' } }, 401);

const adminFetchMock = (overrides: Record<string, unknown> = {}) =>
  vi.fn().mockImplementation((url: string) => {
    if (url in overrides) return Promise.resolve(overrides[url]);
    if (url === '/api/v1/auth/me') return Promise.resolve(jsonResponse({ success: true, data: adminProfile }));
    if (url === '/api/v1/auth/wallet/config') return Promise.resolve(jsonResponse({ success: true, data: { mode: 'signature' } }));
    if (url === '/api/v1/ready') {
      return Promise.resolve(jsonResponse({ status: 'ready', ready: true, degraded: false, timestamp: new Date().toISOString(), dependencies: { postgres: { status: 'up', latency_ms: 1 } } }));
    }
    if (url.startsWith('/api/v1/admin/submissions')) return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/spots') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/spot-reports') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/affiliate/applications') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/quizzes') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/merchants') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/admin/settings') {
      return Promise.resolve(jsonResponse({ success: true, data: { revision: 0, updated_by: null, updated_at: null, values: {}, definitions: [] } }));
    }
    if (url === '/api/v1/admin/settings/audit?limit=10') {
      return Promise.resolve(jsonResponse({ success: true, data: { scope: 'settings_only', entries: [] } }));
    }
    if (url === '/api/v1/admin/system/status') {
      return Promise.resolve(jsonResponse({
        success: true,
        data: {
          observed_at: new Date().toISOString(),
          read_only: true,
          service: { status: 'ready', ready: true, degraded: false, dependencies: {}, checked_at: new Date().toISOString() },
          release: { version_name: 'alpha-test', version_code: 1, commit_hash: 'abc1234', published_at: new Date().toISOString(), update_policy: 'optional', force_update: false, min_supported_version_code: 1, channel: 'alpha' },
          runtime: { node_env: 'test', wallet_auth_mode: 'local', spot_photo_storage: 'local', migration_ledger: { applied: 43, total: 43, up_to_date: true } },
          feature_flags: {},
          deployment_note: 'Read-only.',
        },
      }));
    }
    if (url.startsWith('/api/v1/admin/analytics')) {
      return Promise.resolve(jsonResponse({ success: true, data: { days: 30, totalViews: 0, uniqueSessions: 0, ctaClicks: 0, topPages: [], topCtas: [], daily: [] } }));
    }
    if (url === '/api/v1/quests') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    if (url === '/api/v1/vouchers') return Promise.resolve(jsonResponse({ success: true, data: [] }));
    return Promise.reject(new Error(`Unhandled URL: ${url}`));
  });

describe('admin authentication and routed shell', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows a real sign-in form when no administrator session exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(unauthorized()));
    render(<App />);
    expect(await screen.findByRole('heading', { name: /juanderquest control room/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByText(/pending proof submissions/i)).not.toBeInTheDocument();
  });

  it('renders the operations overview for a server-validated administrator session', async () => {
    vi.stubGlobal('fetch', adminFetchMock());
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /operations overview/i })).toBeInTheDocument();
    expect(screen.getByText('Tourism Officer Admin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^destinations$/i })).toBeInTheDocument();
  });

  it('denies travelers without the administrator role and loads no privileged data', async () => {
    const fetchMock = adminFetchMock({
      '/api/v1/auth/me': jsonResponse({ success: true, data: travelerProfile }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('heading', { name: /administrator access required/i })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map((call) => String(call[0])).some((url) => url.includes('/admin/'))).toBe(false);
  });

  it('signs in with email credentials and only then loads privileged data', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/auth/me') {
        const authenticated = fetchMock.mock.calls.some((call) => String(call[0]).includes('/auth/login'));
        return Promise.resolve(authenticated ? jsonResponse({ success: true, data: adminProfile }) : unauthorized());
      }
      if (url === '/api/v1/auth/login') return Promise.resolve(jsonResponse({ success: true, data: { token: 'session-token' } }));
      if (url === '/api/v1/auth/wallet/config') return Promise.resolve(jsonResponse({ success: true, data: { mode: 'signature' } }));
      if (url.startsWith('/api/v1/admin/submissions')) return Promise.resolve(jsonResponse({ success: true, data: [] }));
      if (url === '/api/v1/admin/spots') return Promise.resolve(jsonResponse({ success: true, data: [] }));
      if (url === '/api/v1/admin/spot-reports') return Promise.resolve(jsonResponse({ success: true, data: [] }));
      if (url === '/api/v1/admin/affiliate/applications') return Promise.resolve(jsonResponse({ success: true, data: [] }));
      if (url === '/api/v1/ready') return Promise.resolve(jsonResponse({ status: 'ready', ready: true, degraded: false, timestamp: new Date().toISOString(), dependencies: {} }));
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'admin@pangasinan.gov.ph' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse battery' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByRole('heading', { level: 1, name: /operations overview/i })).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find((call) => String(call[0]) === '/api/v1/auth/login');
    expect(loginCall).toBeDefined();
    expect(JSON.parse(String((loginCall?.[1] as RequestInit).body))).toMatchObject({
      email: 'admin@pangasinan.gov.ph',
      password: 'correct horse battery',
    });
  });

  it('shows a sign-in error when credentials are rejected', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/auth/login') {
        return Promise.resolve(jsonResponse({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' } }, 401));
      }
      return Promise.resolve(unauthorized());
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'admin@pangasinan.gov.ph' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('renders a deep-linked page on refresh and keeps filter state in the URL', async () => {
    window.history.replaceState(null, '', '/#/submissions?status=all');
    const fetchMock = adminFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /proof submissions/i })).toBeInTheDocument();
    const submissionCalls = fetchMock.mock.calls.map((call) => String(call[0])).filter((url) => url.includes('/admin/submissions'));
    expect(submissionCalls[0]).toBe('/api/v1/admin/submissions');
  });

  it('requires a rejection reason before submitting a rejection', async () => {
    window.history.replaceState(null, '', '/#/submissions');
    vi.stubGlobal('fetch', adminFetchMock({
      '/api/v1/admin/submissions?status=pending': jsonResponse({ success: true, data: [submission] }),
    }));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^reject$/i }));
    const confirm = screen.getByRole('button', { name: /confirm rejection/i });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Rejection reason'), { target: { value: 'Marker proof is unreadable.' } });
    expect(confirm).toBeEnabled();
  });

  it('shows a loading failure with a retry control', async () => {
    window.history.replaceState(null, '', '/#/submissions');
    vi.stubGlobal('fetch', adminFetchMock({
      '/api/v1/admin/submissions?status=pending': Promise.reject(new Error('Server unavailable')) as never,
    }));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/network error/i);
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('filters between live and QA submissions using URL-backed controls', async () => {
    window.history.replaceState(null, '', '/#/submissions');
    const liveSub = { ...submission, id: 'sub-live', quest_title: 'Live Quest', is_test: false };
    const qaSub = { ...submission, id: 'sub-qa', quest_title: 'Synthetic Test Quest', is_test: true };
    vi.stubGlobal('fetch', adminFetchMock({
      '/api/v1/admin/submissions?status=pending': jsonResponse({ success: true, data: [liveSub, qaSub] }),
    }));

    render(<App />);
    expect(await screen.findByText('Live Quest')).toBeInTheDocument();
    expect(screen.getByText('Synthetic Test Quest')).toBeInTheDocument();
    expect(screen.getByText(/QA Test Fixture/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Live production/i }));
    expect(screen.getByText('Live Quest')).toBeInTheDocument();
    expect(screen.queryByText('Synthetic Test Quest')).not.toBeInTheDocument();
    expect(window.location.hash).toContain('qa=live');

    fireEvent.click(screen.getByRole('button', { name: /QA fixtures/i }));
    expect(screen.queryByText('Live Quest')).not.toBeInTheDocument();
    expect(screen.getByText('Synthetic Test Quest')).toBeInTheDocument();
  });

  it('navigates between sections without a full reload', async () => {
    const fetchMock = adminFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /operations overview/i });
    fireEvent.click(screen.getByRole('link', { name: /^destinations$/i }));
    expect(await screen.findByRole('heading', { level: 1, name: /^destinations$/i })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/destinations');
    expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/v1/admin/spots')).toBe(true);
  });

  it('loads only the active section and never eagerly fetches every admin area', async () => {
    const fetchMock = adminFetchMock();
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /operations overview/i });

    const overviewCalls = fetchMock.mock.calls.map((call) => String(call[0]));
    for (const section of ['/admin/quizzes', '/admin/merchants', '/admin/analytics', '/admin/governance', '/juanchoice/admin', '/admin/system/status']) {
      expect(overviewCalls.some((url) => url.includes(section))).toBe(false);
    }

    fireEvent.click(screen.getByRole('link', { name: /^destinations$/i }));
    await screen.findByRole('heading', { level: 1, name: /^destinations$/i });

    const afterNavigation = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(afterNavigation).toContain('/api/v1/admin/spots');
    for (const section of ['/admin/quizzes', '/admin/merchants', '/admin/analytics', '/admin/governance', '/juanchoice/admin']) {
      expect(afterNavigation.some((url) => url.includes(section))).toBe(false);
    }
  });

  it('handles an expired session by returning to sign-in and clearing privileged data', async () => {
    const fetchMock = adminFetchMock({
      '/api/v1/admin/submissions?status=pending': jsonResponse({ success: false, error: { code: 'UNAUTHORIZED', message: 'expired' } }, 401),
      '/api/v1/admin/spots': jsonResponse({ success: true, data: [] }),
      '/api/v1/admin/affiliate/applications': jsonResponse({ success: true, data: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.replaceState(null, '', '/#/submissions');
    render(<App />);
    expect(await screen.findByRole('heading', { name: /juanderquest control room/i })).toBeInTheDocument();
  });

  it('signs out through the server endpoint and returns to the sign-in screen', async () => {
    const fetchMock = adminFetchMock({
      '/api/v1/auth/logout': jsonResponse({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<App />);
    await screen.findByRole('heading', { level: 1, name: /operations overview/i });
    fireEvent.click(screen.getByRole('button', { name: /logout/i }));
    await waitFor(() => expect(fetchMock.mock.calls.some((call) => String(call[0]) === '/api/v1/auth/logout')).toBe(true));
    expect(await screen.findByRole('heading', { name: /juanderquest control room/i })).toBeInTheDocument();
  });

  it('paginates the proof queue without dropping URL filter state', async () => {
    window.history.replaceState(null, '', '/#/submissions');
    const manySubmissions = Array.from({ length: 13 }, (_, index) => ({
      ...submission,
      id: `submission-${index + 1}`,
      quest_title: `Quest ${index + 1}`,
      is_test: false,
    }));
    vi.stubGlobal('fetch', adminFetchMock({
      '/api/v1/admin/submissions?status=pending': jsonResponse({ success: true, data: manySubmissions }),
    }));

    render(<App />);
    expect(await screen.findByText('Quest 1')).toBeInTheDocument();
    expect(screen.getByText('Quest 12')).toBeInTheDocument();
    expect(screen.queryByText('Quest 13')).not.toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(await screen.findByText('Quest 13')).toBeInTheDocument();
    expect(screen.queryByText('Quest 1')).not.toBeInTheDocument();
    expect(window.location.hash).toContain('page=2');
    expect(screen.getByText(/Page 2 of 2/)).toBeInTheDocument();
  });

  it('surfaces a stale review conflict and refreshes the queue', async () => {
    window.history.replaceState(null, '', '/#/submissions');
    const fetchMock = adminFetchMock({
      '/api/v1/admin/submissions?status=pending': jsonResponse({ success: true, data: [{ ...submission, is_test: false }] }),
    });
    const baseImplementation = fetchMock.getMockImplementation()! as (url: string, init?: RequestInit) => Promise<unknown>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/admin/submissions/submission-1' && init?.method === 'PATCH') {
        return Promise.resolve(jsonResponse({ success: false, error: { code: 'STATE_CONFLICT', message: "Submission 'submission-1' has already been reviewed as 'approved'." } }, 409));
      }
      return baseImplementation(url, init);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: /^approve$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already been reviewed/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/queue was refreshed/i);
  });

  it('renders destination reports as a read-only page', async () => {
    window.history.replaceState(null, '', '/#/spot-reports');
    vi.stubGlobal('fetch', adminFetchMock({
      '/api/v1/admin/spot-reports': jsonResponse({
        success: true,
        data: [{
          id: 'report-1',
          spot_id: 'spot-patar',
          reporter_name: 'Scout Celine',
          reason: 'misleading_photo',
          details: 'The cover photo is from a different beach.',
          status: 'pending',
          created_at: '2026-10-13T09:00:00Z',
        }],
      }),
      '/api/v1/admin/spots': jsonResponse({
        success: true,
        data: [{
          id: 'spot-patar',
          name: 'Patar White Beach',
          category: 'nature',
          subcategory: 'beach',
          municipality: 'Bolinao',
          source_name: 'Editorial',
          trust_level: 'verified',
          status: 'published',
        }],
      }),
    }));

    render(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: /destination reports/i })).toBeInTheDocument();
    expect(await screen.findByText('Patar White Beach')).toBeInTheDocument();
    expect(screen.getByText('Misleading photo')).toBeInTheDocument();
    expect(screen.getByText(/This view is read-only/i)).toBeInTheDocument();
    const reportCard = screen.getByText('Misleading photo').closest('article');
    expect(reportCard).not.toBeNull();
    expect(reportCard?.querySelector('button')).toBeNull();
  });
});
