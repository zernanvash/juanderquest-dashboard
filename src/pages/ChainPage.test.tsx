import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/client';
import { sendAdminAction } from '../chain/browserWallet';
import { ChainPage, isLastAdmin } from './ChainPage';
import type { ChainContract, ChainOverview } from '../api/chain';

vi.mock('../api/client', async (orig) => ({ ...(await orig<typeof import('../api/client')>()), apiFetch: vi.fn() }));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,AAAA') } }));
vi.mock('../chain/browserWallet', async (orig) => ({
  ...(await orig<typeof import('../chain/browserWallet')>()),
  sendAdminAction: vi.fn(),
}));

const api = vi.mocked(apiFetch);
const send = vi.mocked(sendAdminAction);

const ADMIN = '0xccb1462779dc6ccfb2b4e6f9276dacd654d58c34';
const OWNER = '0xfadd476c10b6a93bc26a226f9b7d8e8c556f9671';
const ISSUER = '0xcf36b1cd5677788deef68ae0f3879af7755cf2e8';
const BADGE = '0xc9b1cc4f980edf71daca182944ecb67e494b3e9b';
const ISSUER_ROLE = '0x' + '1'.repeat(64);

const wallet = (over: Partial<ChainOverview['wallets'][number]>) => ({
  id: 'w', address: ADMIN, label: 'Server admin / deployer', role: 'admin', custody: 'server', ownerName: null,
  balancePol: '9.8637', nonce: 17, lowBalancePol: '2', needsGas: true, low: false, active: true, notes: null,
  explorerUrl: 'https://amoy.polygonscan.com/address/x', ...over,
}) as ChainOverview['wallets'][number];

const overview = (): ChainOverview => ({
  chain: { id: 80002, name: 'Polygon Amoy', currency: 'POL', explorer: 'https://amoy.polygonscan.com', rpcHealthy: true, latestBlock: 50_800_000 },
  wallets: [
    wallet({ id: 'a', low: true, balancePol: '1.2' }),
    wallet({ id: 'i', address: ISSUER, label: 'Server badge issuer', role: 'badge_issuer', balancePol: '10' }),
    wallet({ id: 'o', address: OWNER, label: 'Owner (recovery admin + treasury)', role: 'recovery_admin', custody: 'personal', needsGas: false, lowBalancePol: null, balancePol: '1538.6' }),
  ],
  contracts: [{
    name: 'badge', address: BADGE, explorerUrl: 'x', paused: null,
    roles: [
      { role: 'DEFAULT_ADMIN_ROLE', roleHash: '0x' + '0'.repeat(64), account: ADMIN, label: 'Server admin / deployer', expected: true, onChain: true, drift: false },
      { role: 'DEFAULT_ADMIN_ROLE', roleHash: '0x' + '0'.repeat(64), account: OWNER, label: 'Owner', expected: true, onChain: true, drift: false },
      { role: 'ISSUER_ROLE', roleHash: ISSUER_ROLE, account: ISSUER, label: 'Server badge issuer', expected: true, onChain: false, drift: true },
    ],
  }],
  fetchedAt: '2026-10-22T08:00:00.000Z',
  cacheSeconds: 60,
});

describe('ChainPage', () => {
  beforeEach(() => {
    api.mockReset();
    send.mockReset();
    api.mockImplementation(async (path: string) => {
      if (path.startsWith('/admin/chain/overview')) return overview() as never;
      if (path.startsWith('/admin/chain/audit')) return [] as never;
      if (path === '/admin/chain/wallets') return { id: 'new', address: '0x' } as never;
      return {} as never;
    });
  });
  afterEach(() => vi.clearAllMocks());

  it('shows wallets with balances, a low badge, custody and drift', async () => {
    render(<ChainPage />);
    await screen.findByText(/RPC ok/);
    const adminRow = screen.getByTestId(`wallet-${ADMIN}`);
    expect(within(adminRow).getByText('Low')).toBeInTheDocument();
    expect(within(adminRow).getByText('Server key')).toBeInTheDocument();
    expect(within(screen.getByTestId(`wallet-${OWNER}`)).getByText('No gas needed')).toBeInTheDocument();
    expect(screen.getByTestId('drift-badge')).toHaveTextContent('1 drift');
  });

  it('shows the top-up address and QR code', async () => {
    render(<ChainPage />);
    await screen.findByText(/RPC ok/);
    fireEvent.click(within(screen.getByTestId(`wallet-${ISSUER}`)).getByRole('button', { name: 'Top up' }));
    expect(await screen.findByTestId('topup-address')).toHaveTextContent(ISSUER);
    expect(await screen.findByAltText(`QR code for ${ISSUER}`)).toBeInTheDocument();
  });

  it('add-wallet form has no secret fields and posts only public data', async () => {
    render(<ChainPage />);
    await screen.findByText(/RPC ok/);
    fireEvent.click(screen.getByRole('button', { name: /Add wallet/ }));
    const dialog = await screen.findByRole('dialog');
    const names = Array.from(dialog.querySelectorAll('input,select')).map((el) => el.getAttribute('name') ?? '');
    expect(names.some((n) => /key|secret|seed|mnemonic|private/i.test(n))).toBe(false);

    fireEvent.change(within(dialog).getByLabelText('Address'), { target: { value: '0x9999999999999999999999999999999999999999' } });
    fireEvent.change(within(dialog).getByLabelText('Label'), { target: { value: 'Evaluator wallet' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/admin/chain/wallets', {
      method: 'POST',
      body: { chain_id: 80002, address: '0x9999999999999999999999999999999999999999', label: 'Evaluator wallet', role: 'recovery_admin', custody: 'personal' },
    }));
  });

  it('grant asks for confirmation, then signs in the browser wallet and shows the tx link', async () => {
    send.mockResolvedValue({ hash: '0xabc', wait: async () => true });
    render(<ChainPage />);
    await screen.findByText(/RPC ok/);
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Give ISSUER_ROLE on the Badge (tJDB) contract to Server badge issuer');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open wallet' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith({ kind: 'grant', contract: BADGE, roleHash: ISSUER_ROLE, account: ISSUER }));
    expect(await screen.findByText('Confirmed on-chain.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View transaction/ })).toHaveAttribute('href', 'https://amoy.polygonscan.com/tx/0xabc');
  });

  it('a wallet error is shown and nothing is reported as done', async () => {
    send.mockRejectedValue(new Error('0xabc is not an admin of this contract. Connect your recovery-admin wallet.'));
    render(<ChainPage />);
    await screen.findByText(/RPC ok/);
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Open wallet' }));
    expect(await screen.findByText(/not an admin of this contract/)).toBeInTheDocument();
    expect(screen.queryByText('Confirmed on-chain.')).not.toBeInTheDocument();
  });

  it('never allows revoking the last admin of a contract', () => {
    const c = overview().contracts[0] as ChainContract;
    expect(isLastAdmin(c, c.roles[0])).toBe(false);
    const onlyOne = { ...c, roles: [c.roles[0], { ...c.roles[1], onChain: false }] };
    expect(isLastAdmin(onlyOne, onlyOne.roles[0])).toBe(true);
  });
});
