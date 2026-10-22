import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { BadgeMintingPanel } from './BadgeMintingPanel';

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), apiFetch: vi.fn() }));
const api = vi.mocked(apiFetch);

const row = (over: Record<string, unknown>) => ({
  id: 'c1', status: 'finalized', title: 'First Footstep', traveler: 'Juan', recipient: '0xfadd476c10b6a93bc26a226f9b7d8e8c556f9671',
  tokenId: '1', attempts: 1, lastError: null, updatedAt: '2026-10-22T08:00:00Z',
  txUrl: 'https://amoy.polygonscan.com/tx/0x1', tokenUrl: 'https://amoy.polygonscan.com/nft/0xc/1', ...over,
});

describe('BadgeMintingPanel', () => {
  beforeEach(() => {
    api.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path === '/admin/chain/badges') {
        return {
          minter: { enabled: true, ready: true, error: null },
          counts: { waitingForWallet: 2, queued: 1, minting: 0, onChain: 3, failed: 1 },
          recent: [row({ id: 'bad', status: 'failed', title: 'Heritage Seeker', lastError: 'The mint transaction reverted on-chain.', tokenUrl: null }), row({})],
        } as never;
      }
      return { id: 'bad', status: 'queued' } as never;
    });
  });

  it('shows queue counts, minter state and links', async () => {
    render(<BadgeMintingPanel />);
    expect(await screen.findByText('Heritage Seeker')).toBeInTheDocument();
    expect(screen.getByTestId('minter-status')).toHaveTextContent('Minter running');
    expect(screen.getByText('Waiting for wallet')).toBeInTheDocument();
    expect(screen.getByText(/reverted on-chain/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Badge/ })[0]).toHaveAttribute('href', 'https://amoy.polygonscan.com/nft/0xc/1');
  });

  it('retries a failed mint', async () => {
    render(<BadgeMintingPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Retry/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/chain/badges/bad/retry', { method: 'POST' }));
  });

  it('explains when minting is off', async () => {
    api.mockImplementation(async () => ({ minter: { enabled: false, ready: false, error: null },
      counts: { waitingForWallet: 0, queued: 0, minting: 0, onChain: 0, failed: 0 }, recent: [] }) as never);
    render(<BadgeMintingPanel />);
    expect(await screen.findByTestId('minter-status')).toHaveTextContent('turned off');
    expect(screen.getByText('No badges have been queued yet.')).toBeInTheDocument();
  });
});
