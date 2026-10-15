import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth';

export function DeniedPage() {
  const { profile, signOut } = useAuth();
  const travelerUrl = import.meta.env.VITE_TRAVELER_URL || '/app';

  return (
    <div className="login-screen">
      <div className="stitch-panel login-panel">
        <span className="denied-icon" aria-hidden="true">
          <ShieldAlert size={28} />
        </span>
        <h1 className="login-title">Administrator access required</h1>
        <p className="login-copy">
          {profile?.display_name ? `${profile.display_name}, this` : 'This'} account is signed in but does not have the
          administrator role. The server denied access to operational data; no administration screens were loaded.
        </p>
        <div className="denied-actions">
          <button type="button" className="login-primary" onClick={() => void signOut()}>
            Sign out and use another account
          </button>
          <a className="login-secondary login-secondary-link" href={travelerUrl}>
            Go to the traveler site
          </a>
        </div>
        <p className="login-footnote">
          Contact the system owner if this account should be granted staff access. Roles are granted server-side.
        </p>
      </div>
    </div>
  );
}
