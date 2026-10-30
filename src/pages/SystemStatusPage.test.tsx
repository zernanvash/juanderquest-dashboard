import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatusPage } from './SystemStatusPage';

const status = {
  observed_at: '2026-10-14T10:00:00Z',
  read_only: true,
  service: {
    status: 'degraded',
    ready: true,
    degraded: true,
    dependencies: {
      postgres: { status: 'up', required: true, latency_ms: 2 },
      valhalla: { status: 'degraded', required: false, latency_ms: 1500, message: 'Valhalla dependency is unavailable.' },
    },
    checked_at: '2026-10-14T10:00:00Z',
  },
  release: {
    version_name: 'alpha-abc1234',
    version_code: 7,
    commit_hash: 'abc1234',
    published_at: '2026-10-13T00:00:00Z',
    update_policy: 'optional',
    force_update: false,
    min_supported_version_code: 1,
    channel: 'alpha',
  },
  runtime: {
    node_env: 'test',
    wallet_auth_mode: 'local',
    spot_photo_storage: 'local',
    migration_ledger: { applied: 43, total: 43, up_to_date: true },
  },
  feature_flags: {
    juanchoice_enabled: true,
    juanchoice_writes_enabled: false,
  },
  deployment_note: 'Deployment-owned values are read-only in the browser.',
};

const jsonResponse = (data: unknown, statusCode = 200) => ({
  ok: statusCode >= 200 && statusCode < 300,
  status: statusCode,
  json: async () => data,
});

describe('SystemStatusPage', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders read-only service, release, runtime and sanitized flags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ success: true, data: status })));
    render(<SystemStatusPage />);

    expect(await screen.findByText('degraded')).toBeInTheDocument();
    expect(screen.getByText(/postgres/i)).toBeInTheDocument();
    expect(screen.getByText(/2ms · required/i)).toBeInTheDocument();
    expect(screen.getByText('alpha-abc1234')).toBeInTheDocument();
    expect(screen.getByText(/Backend release/i)).toBeInTheDocument();
    expect(screen.getByText('43/43 · up to date')).toBeInTheDocument();
    expect(screen.getByText('JuanChoice voting writes')).toBeInTheDocument();
    expect(screen.getByText('on')).toBeInTheDocument();
    expect(screen.getByText('off')).toBeInTheDocument();
    expect(screen.getByText(/Deployment-owned values are read-only/)).toBeInTheDocument();

    const buttons = screen.getAllByRole('button').map((button) => button.textContent);
    expect(buttons.every((label) => /refresh/i.test(label || ''))).toBe(true);
  });
});
