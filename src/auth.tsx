import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, apiFetch, getBearerToken, setBearerToken, setUnauthorizedListener } from './api/client';

export interface AdminProfile {
  id: string;
  seed_id: string;
  display_name: string;
  email?: string;
  role: string;
  avatar_url?: string;
  wallet_address?: string;
}

export type AuthStatus = 'checking' | 'anonymous' | 'denied' | 'authenticated' | 'unavailable';

interface AuthValue {
  status: AuthStatus;
  profile: AdminProfile | null;
  error: string;
  walletMode: string | null;
  signInWithEmail: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signInWithWallet: () => Promise<void>;
  signInWithLocalWallet: (address: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
}

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [error, setError] = useState('');
  const [walletMode, setWalletMode] = useState<string | null>(null);

  const applyProfile = useCallback((user: AdminProfile | null) => {
    if (!user) {
      setProfile(null);
      setStatus('anonymous');
      return;
    }
    setProfile(user);
    setStatus(user.role === 'admin' ? 'authenticated' : 'denied');
  }, []);

  const bootstrap = useCallback(async () => {
    setStatus('checking');
    setError('');
    try {
      const user = await apiFetch<AdminProfile>('/auth/me');
      applyProfile(user);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status !== 401 && cause.status !== 403) {
        setProfile(null);
        setError(cause.message);
        setStatus('unavailable');
      } else {
        applyProfile(null);
      }
    }
  }, [applyProfile]);

  useEffect(() => {
    setUnauthorizedListener(() => {
      setBearerToken(null);
      applyProfile(null);
    });
    void bootstrap();
    return () => setUnauthorizedListener(null);
  }, [applyProfile, bootstrap]);

  useEffect(() => {
    let active = true;
    apiFetch<{ mode: string }>('/auth/wallet/config', { token: null })
      .then((config) => {
        if (active) setWalletMode(config.mode);
      })
      .catch(() => {
        if (active) setWalletMode(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const finalizeLogin = useCallback(
    async (result: { token?: string } | null) => {
      setBearerToken(result?.token ?? null);
      const user = await apiFetch<AdminProfile>('/auth/me');
      applyProfile(user);
    },
    [applyProfile]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const result = await apiFetch<{ token?: string }>('/auth/login', {
        method: 'POST',
        body: { email, password, remember_me: rememberMe },
        token: null,
      });
      await finalizeLogin(result);
    },
    [finalizeLogin]
  );

  const signInWithWallet = useCallback(async () => {
    const provider = (window as { ethereum?: EthereumProvider }).ethereum;
    if (!provider) {
      throw new Error('No EVM wallet provider was detected in this browser. Install or unlock a wallet, or use email sign-in.');
    }
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
    const address = accounts?.[0];
    if (!address) throw new Error('The wallet did not return an account.');
    const challenge = await apiFetch<{ message: string }>('/auth/wallet/challenge', {
      method: 'POST',
      body: { address },
      token: null,
    });
    const signature = (await provider.request({
      method: 'personal_sign',
      params: [challenge.message, address],
    })) as string;
    const result = await apiFetch<{ token?: string }>('/auth/wallet/login', {
      method: 'POST',
      body: { address, signature, remember_me: true },
      token: null,
    });
    await finalizeLogin(result);
  }, [finalizeLogin]);

  const signInWithLocalWallet = useCallback(
    async (address: string) => {
      const result = await apiFetch<{ token?: string }>('/auth/wallet/local-login', {
        method: 'POST',
        body: { address: address.trim(), remember_me: true },
        token: null,
      });
      await finalizeLogin(result);
    },
    [finalizeLogin]
  );

  const signOut = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', token: getBearerToken() });
    } catch {
      // The local session is cleared even if the server is unreachable.
    }
    setBearerToken(null);
    applyProfile(null);
  }, [applyProfile]);

  const value = useMemo<AuthValue>(
    () => ({
      status,
      profile,
      error,
      walletMode,
      signInWithEmail,
      signInWithWallet,
      signInWithLocalWallet,
      signOut,
      retry: bootstrap,
    }),
    [status, profile, error, walletMode, signInWithEmail, signInWithWallet, signInWithLocalWallet, signOut, bootstrap]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
