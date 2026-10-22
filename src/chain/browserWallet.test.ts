import { afterEach, describe, expect, it, vi } from 'vitest';
import { AMOY, connectOnAmoy, describeAction, setInjectedWalletForTests, WalletActionError } from './browserWallet';

function fakeWallet(chainId: string, switchError?: { code: number }) {
  const calls: Array<{ method: string; params?: unknown[] }> = [];
  const request = vi.fn(async ({ method, params }: { method: string; params?: unknown[] }) => {
    calls.push({ method, params });
    if (method === 'eth_requestAccounts') return ['0xfadd476c10b6a93bc26a226f9b7d8e8c556f9671'];
    if (method === 'eth_chainId') return chainId;
    if (method === 'wallet_switchEthereumChain' && switchError) throw switchError;
    return null;
  });
  return { provider: { request } as never, calls };
}

describe('browser wallet (MetaMask) on Polygon Amoy', () => {
  afterEach(() => setInjectedWalletForTests(undefined));

  it('without a wallet, explains that MetaMask is needed', async () => {
    setInjectedWalletForTests(null);
    await expect(connectOnAmoy()).rejects.toThrow(WalletActionError);
    await expect(connectOnAmoy()).rejects.toThrow(/Install MetaMask/);
  });

  it('already on Amoy: no network switch', async () => {
    const w = fakeWallet('0x13882');
    setInjectedWalletForTests(w.provider);
    const { address } = await connectOnAmoy();
    expect(address).toBe('0xFAdD476C10B6A93Bc26a226f9b7d8e8c556F9671');
    expect(w.calls.map((c) => c.method)).not.toContain('wallet_switchEthereumChain');
  });

  it('switches to Amoy, and adds it when the wallet does not know it (4902)', async () => {
    const known = fakeWallet('0x1');
    setInjectedWalletForTests(known.provider);
    await connectOnAmoy();
    expect(known.calls).toContainEqual({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13882' }] });

    const unknown = fakeWallet('0x1', { code: 4902 });
    setInjectedWalletForTests(unknown.provider);
    await connectOnAmoy();
    expect(unknown.calls).toContainEqual({ method: 'wallet_addEthereumChain', params: [AMOY.params] });
  });

  it('a refused switch is reported, not ignored', async () => {
    const w = fakeWallet('0x1', { code: 4001 });
    setInjectedWalletForTests(w.provider);
    await expect(connectOnAmoy()).rejects.toThrow(/Switch the wallet to Polygon Amoy/);
  });

  it('describes each action in plain words', () => {
    expect(describeAction({ kind: 'pause', contract: '0x1' }, { contract: 'Reward distributor' })).toMatch(/no token claims/);
    expect(describeAction({ kind: 'revoke', contract: '0x1', roleHash: '0x', account: '0x2' },
      { contract: 'Badge', role: 'ISSUER_ROLE', account: 'Issuer' })).toBe('Remove ISSUER_ROLE on the Badge contract from Issuer.');
  });
});
