import { useState, type FormEvent } from 'react';
import { KeyRound, Wallet, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth';
import { describeError } from '../utils/errors';

const LOCAL_ADMIN_WALLET = '0xfadd476c10b6a93bc26a226f9b7d8e8c556f9671';

export function LoginPage() {
  const { status, error, walletMode, signInWithEmail, signInWithWallet, signInWithLocalWallet, retry } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [localAddress, setLocalAddress] = useState('');
  const [busy, setBusy] = useState<'email' | 'wallet' | 'local' | null>(null);
  const [formError, setFormError] = useState('');

  const handleEmailSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy('email');
    setFormError('');
    try {
      await signInWithEmail(email.trim(), password, rememberMe);
    } catch (cause) {
      setFormError(describeError(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleWalletSignIn = async () => {
    if (busy) return;
    setBusy('wallet');
    setFormError('');
    try {
      await signInWithWallet();
    } catch (cause) {
      setFormError(describeError(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleLocalSignIn = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !localAddress.trim()) return;
    setBusy('local');
    setFormError('');
    try {
      await signInWithLocalWallet(localAddress);
    } catch (cause) {
      setFormError(describeError(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="login-screen">
      <div className="stitch-panel login-panel">
        <img src="/logo.png" alt="JuanDerQuest administration logo" className="login-logo" />

        <span className="login-eyebrow">Tourism operations</span>
        <h1 className="login-title">JuanderQuest Control Room</h1>
        <p className="login-copy">
          Sign in with an authorized staff account. Accounts without the administrator role cannot open
          operational data; the server verifies every request.
        </p>

        {status === 'unavailable' ? (
          <div className="load-error" role="alert">
            {error || 'The session service is unavailable.'}
            <button type="button" onClick={() => void retry()}>
              Retry
            </button>
          </div>
        ) : null}

        {formError ? (
          <p className="login-error" role="alert">
            {formError}
          </p>
        ) : null}

        <form onSubmit={handleEmailSubmit} className="login-form" aria-label="Administrator email sign-in">
          <h2 className="login-section-title">
            <KeyRound size={15} aria-hidden="true" /> Email and password
          </h2>
          <label className="login-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="login-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="login-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Keep this session signed in for 7 days on this device
          </label>
          <button type="submit" className="login-primary" disabled={busy !== null}>
            {busy === 'email' ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {walletMode === 'signature' ? (
          <div className="login-section">
            <h2 className="login-section-title">
              <Wallet size={15} aria-hidden="true" /> Wallet
            </h2>
            <p className="login-hint">
              The wallet address must belong to a staff account with the administrator role.
            </p>
            <button type="button" className="login-secondary" onClick={() => void handleWalletSignIn()} disabled={busy !== null}>
              {busy === 'wallet' ? 'Waiting for wallet…' : 'Sign in with an EVM wallet'}
            </button>
          </div>
        ) : null}

        {walletMode === 'local' ? (
          <form onSubmit={handleLocalSignIn} className="login-section" aria-label="Local wallet sign-in">
            <h2 className="login-section-title">
              <ShieldCheck size={15} aria-hidden="true" /> Local development wallet
            </h2>
            <p className="login-hint">
              The API is running in local wallet mode. This path exists for development only and is rejected
              outside local/test environments.
            </p>
            <label className="login-field">
              <span>Wallet address</span>
              <input
                type="text"
                spellCheck={false}
                placeholder={LOCAL_ADMIN_WALLET}
                value={localAddress}
                onChange={(event) => setLocalAddress(event.target.value)}
              />
            </label>
            <button type="submit" className="login-secondary" disabled={busy !== null || !localAddress.trim()}>
              {busy === 'local' ? 'Signing in…' : 'Use local wallet'}
            </button>
          </form>
        ) : null}

        <p className="login-footnote">
          Prototype build — staff identity and permissions are verified on the server. Contact the system owner
          if your account should have administrator access.
        </p>
      </div>
    </div>
  );
}
