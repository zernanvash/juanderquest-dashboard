import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const definitions = [
  {
    key: 'support_contact_email',
    label: 'Public support contact email',
    category: 'branding_support',
    type: 'email',
    defaultValue: '',
    maxLength: 255,
    restartRequired: false,
    description: 'Shown on approved support surfaces.',
  },
  {
    key: 'quiz_default_radius_meters',
    label: 'Default quiz start radius (m)',
    category: 'quiz_defaults',
    type: 'integer',
    defaultValue: 200,
    min: 100,
    max: 1000,
    restartRequired: false,
    description: 'Applies to new quiz drafts only.',
  },
];

const snapshot = {
  revision: 0,
  updated_by: null,
  updated_at: null,
  values: { support_contact_email: '', quiz_default_radius_meters: 200 },
  definitions,
};

const jsonResponse = (data: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});

const renderPage = () => render(<SettingsPage />);

describe('SettingsPage', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });
  afterEach(() => vi.restoreAllMocks());

  it('saves only changed keys with the expected revision and confirms from the server response', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/admin/settings' && (!init || init.method !== 'PUT')) {
        return Promise.resolve(jsonResponse({ success: true, data: snapshot }));
      }
      if (url === '/api/v1/admin/settings/audit?limit=10') {
        return Promise.resolve(jsonResponse({ success: true, data: { scope: 'settings_only', entries: [] } }));
      }
      if (url === '/api/v1/admin/settings' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse({
          success: true,
          data: {
            revision: 1,
            values: { support_contact_email: 'help@juanderquest.app', quiz_default_radius_meters: 200 },
            changed_keys: ['support_contact_email'],
          },
        }));
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    const emailField = await screen.findByLabelText('Public support contact email');
    expect(screen.getByText('No unsaved changes.')).toBeInTheDocument();

    fireEvent.change(emailField, { target: { value: 'help@juanderquest.app' } });
    expect(screen.getByText('1 unsaved change.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    await waitFor(() => expect(screen.getByText(/Settings saved\. Now at revision 1\./)).toBeInTheDocument());

    const putCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'PUT');
    expect(putCall).toBeDefined();
    const body = JSON.parse(String((putCall?.[1] as RequestInit).body));
    expect(body.expected_revision).toBe(0);
    expect(body.changes).toEqual({ support_contact_email: 'help@juanderquest.app' });
    expect(screen.getByText(/Revision 1/)).toBeInTheDocument();
  });

  it('shows a conflict with the server values and keeps unsaved local changes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/admin/settings' && (!init || init.method !== 'PUT')) {
        return Promise.resolve(jsonResponse({ success: true, data: snapshot }));
      }
      if (url === '/api/v1/admin/settings/audit?limit=10') {
        return Promise.resolve(jsonResponse({ success: true, data: { scope: 'settings_only', entries: [] } }));
      }
      if (url === '/api/v1/admin/settings' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse({
          success: false,
          error: {
            code: 'REVISION_CONFLICT',
            message: 'Another editor saved settings since this form was loaded.',
            current: { revision: 2, values: { support_contact_email: 'newer@juanderquest.app', quiz_default_radius_meters: 250 } },
          },
        }, 409));
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }));

    renderPage();
    fireEvent.change(await screen.findByLabelText('Public support contact email'), { target: { value: 'mine@juanderquest.app' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    const bannerText = await screen.findByText(/Conflict at revision 2/i);
    const banner = bannerText.closest('.conflict-banner');
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent('newer@juanderquest.app');
    expect(banner).toHaveTextContent('mine@juanderquest.app');
    // The server's radius change also diverges from the local draft.
    expect(screen.getByText('2 unsaved changes.')).toBeInTheDocument();
  });

  it('reports a failed write without any success notice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/v1/admin/settings' && (!init || init.method !== 'PUT')) {
        return Promise.resolve(jsonResponse({ success: true, data: snapshot }));
      }
      if (url === '/api/v1/admin/settings/audit?limit=10') {
        return Promise.resolve(jsonResponse({ success: true, data: { scope: 'settings_only', entries: [] } }));
      }
      if (url === '/api/v1/admin/settings' && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Default quiz start radius (m) must be at least 100.' },
        }, 400));
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    }));

    renderPage();
    fireEvent.change(await screen.findByLabelText('Default quiz start radius (m)'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('must be at least 100');
    expect(screen.queryByText(/Settings saved/i)).not.toBeInTheDocument();
    expect(screen.getByText('1 unsaved change.')).toBeInTheDocument();
  });
});
