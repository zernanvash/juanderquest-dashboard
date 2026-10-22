import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { BadgeMintingPanel } from './BadgeMintingPanel';

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const entry = (over: Record<string, unknown>) => ({
  awardId: 'a1', title: 'First Footstep', track: 'explorer', awardedAt: '2026-10-22T08:00:00Z',
  traveler: { id: 'u1', name: 'Juan', handle: 'juan' }, wallet: '0xfadd476c10b6a93bc26a226f9b7d8e8c556f9671',
  state: 'on_chain', commandId: 'c1', attempts: 1, lastError: null, updatedAt: '2026-10-22T08:05:00Z', tokenId: '1',
  txUrl: 'https://amoy.polygonscan.com/tx/0x1', tokenUrl: 'https://amoy.polygonscan.com/nft/0xc/1', ...over,
});
const minting = (enabled = true) => ({
  minter: { enabled, ready: enabled, error: null },
  counts: { waitingForWallet: 1, queued: 0, minting: 0, onChain: 1, failed: 1 }, recent: [],
});
const ledger = {
  totals: { pending_wallet: 1, queued: 0, minting: 0, on_chain: 1, failed: 1, revoked: 0 }, total: 3,
  entries: [
    entry({ awardId: 'bad', state: 'failed', title: 'Heritage Seeker', commandId: 'cmd-bad', lastError: 'The mint transaction reverted on-chain.', tokenUrl: null }),
    entry({}),
    entry({ awardId: 'wait', state: 'pending_wallet', traveler: { id: 'u2', name: 'Maria', handle: null }, wallet: null, commandId: null, tokenUrl: null, txUrl: null }),
  ],
};

describe('BadgeMintingPanel', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path === '/admin/chain/badges') return minting() as never;
      if (path.startsWith('/admin/chain/badges/ledger')) return ledger as never;
      return { id: 'cmd-bad', status: 'queued' } as never;
    });
  });

  it('shows minter state and a ledger of every badge with its traveler', async () => {
    render(<BadgeMintingPanel />);
    expect(await screen.findByText('Maria')).toBeInTheDocument();
    expect(screen.getByTestId('minter-status')).toHaveTextContent('Minter running');
    expect(within(screen.getByTestId('ledger-wait')).getByText('Not linked')).toBeInTheDocument();
    expect(within(screen.getByTestId('ledger-wait')).getByText('Waiting for wallet')).toBeInTheDocument();
    expect(within(screen.getByTestId('ledger-a1')).getByRole('link', { name: /Badge/ })).toHaveAttribute('href', 'https://amoy.polygonscan.com/nft/0xc/1');
    expect(screen.getByText(/reverted on-chain/)).toBeInTheDocument();
  });

  it('filters by state and searches', async () => {
    render(<BadgeMintingPanel />);
    await screen.findByText('Maria');
    fireEvent.click(screen.getByRole('tab', { name: /Waiting for wallet/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/chain/badges/ledger?state=pending_wallet', expect.anything()));
    fireEvent.change(screen.getByLabelText('Search traveler, badge or wallet'), { target: { value: 'maria' } });
    fireEvent.submit(screen.getByLabelText('Search traveler, badge or wallet'));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/chain/badges/ledger?state=pending_wallet&q=maria', expect.anything()));
  });

  it('retries a failed mint', async () => {
    render(<BadgeMintingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /^Retry$/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/chain/badges/cmd-bad/retry', { method: 'POST' }));
  });

  it('explains when minting is off', async () => {
    api.mockImplementation(async (path: string) => (path === '/admin/chain/badges' ? minting(false)
      : { totals: { pending_wallet: 0, queued: 0, minting: 0, on_chain: 0, failed: 0, revoked: 0 }, total: 0, entries: [] }) as never);
    render(<BadgeMintingPanel />);
    expect(await screen.findByTestId('minter-status')).toHaveTextContent('turned off');
    expect(await screen.findByText('No badges match.')).toBeInTheDocument();
  });
});
