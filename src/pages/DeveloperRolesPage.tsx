import { useCallback, useEffect, useState } from 'react';
import { Search, UserCog } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

// Developer dashboard (owner 2026-10-29): developers see every account's role and change it.
// Every change needs a reason and lands in the role audit. Nobody can change their own role.
type Role = 'user' | 'admin' | 'qa';
type Scope = 'platform' | 'area' | 'developer' | null;
export type Account = {
  id: string; display_name: string; email: string | null; handle: string | null; wallet_address: string | null;
  role: Role; admin_scope: Scope; created_at: string;
};
type AuditRow = {
  created_at: string; old_role: string; new_role: string; old_scope: string | null; new_scope: string | null;
  reason: string; actor_name: string | null; target_name: string | null; target_email: string | null;
};

// One choice per meaningful combination, so nobody has to understand role + scope separately.
export const ACCESS_OPTIONS: { value: string; label: string; role: Role; scope: Scope; hint: string }[] = [
  { value: 'user', label: 'Traveler', role: 'user', scope: null, hint: 'The traveler app only.' },
  { value: 'qa', label: 'QA evaluator', role: 'qa', scope: null, hint: 'Can see synthetic test data.' },
  { value: 'admin', label: 'Admin', role: 'admin', scope: null, hint: 'This control room.' },
  { value: 'admin:area', label: 'Area admin', role: 'admin', scope: 'area', hint: 'Admin for an area (no JuanChoice perk controls).' },
  { value: 'admin:platform', label: 'JuanderQuest staff', role: 'admin', scope: 'platform', hint: 'Admin + JuanChoice perk controls.' },
  { value: 'admin:developer', label: 'Developer', role: 'admin', scope: 'developer', hint: 'Everything, including changing roles.' },
];
export const accessValue = (role: Role, scope: Scope) => (role === 'admin' && scope ? `admin:${scope}` : role);
export const accessLabel = (role: Role, scope: Scope) =>
  ACCESS_OPTIONS.find(option => option.value === accessValue(role, scope))?.label ?? role;
const shortWallet = (wallet: string | null) => (wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : '—');

export function DeveloperRolesPage() {
  const { profile } = useAuth();
  const isDeveloper = profile?.role === 'admin' && profile?.admin_scope === 'developer';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'staff'>('staff');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { access: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ role: filter });
      if (query.trim()) params.set('q', query.trim());
      const [rows, log] = await Promise.all([
        apiFetch<Account[]>(`/admin/developer/users?${params}`),
        apiFetch<AuditRow[]>('/admin/developer/role-audit'),
      ]);
      setAccounts(rows ?? []);
      setAudit(log ?? []);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => { if (isDeveloper) void load(); }, [isDeveloper, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (account: Account) => {
    const draft = drafts[account.id];
    const option = ACCESS_OPTIONS.find(o => o.value === draft?.access);
    if (!draft || !option) return;
    if (draft.reason.trim().length < 5) {
      setError('Add a reason (at least 5 characters); it is saved in the role audit.');
      return;
    }
    setSaving(account.id);
    setError('');
    setNotice('');
    try {
      const updated = await apiFetch<Account>(`/admin/developer/users/${encodeURIComponent(account.id)}/role`, {
        method: 'PUT', body: { role: option.role, admin_scope: option.scope, reason: draft.reason.trim() },
      });
      setAccounts(rows => rows.map(row => (row.id === account.id ? updated : row)));
      setDrafts(({ [account.id]: _done, ...rest }) => rest);
      setNotice(`${account.display_name} is now ${accessLabel(updated.role, updated.admin_scope)}. They get the new access at their next sign-in.`);
      setAudit(await apiFetch<AuditRow[]>('/admin/developer/role-audit'));
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setSaving(null);
    }
  };

  if (!isDeveloper) {
    return (
      <div>
        <PageHeader title="Developer" description="Account roles." />
        <p className="load-error" role="alert">Only developers can manage account roles.</p>
      </div>
    );
  }

  return (
    <div className="dev-roles">
      <PageHeader title="Developer: account roles" description="Give or remove admin, staff and developer access. Every change needs a reason and is recorded." />

      <form className="stitch-panel dev-roles-search" role="search" onSubmit={(event) => { event.preventDefault(); void load(); }}>
        <label className="quiz-field">
          <span>Find an account</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, email, handle or full wallet address" />
        </label>
        <label className="quiz-field">
          <span>Show</span>
          <select value={filter} onChange={(event) => setFilter(event.target.value as 'all' | 'staff')}>
            <option value="staff">Staff only (admins, QA)</option>
            <option value="all">Everyone</option>
          </select>
        </label>
        <button type="submit" className="button-approve"><Search size={14} aria-hidden="true" /> Search</button>
      </form>

      {error && <p className="load-error" role="alert">{error}</p>}
      {notice && <p className="good-text" role="status">{notice}</p>}

      <section className="stitch-panel" aria-label="Accounts">
        {loading ? <p role="status">Loading accounts…</p> : accounts.length === 0 ? <p>No accounts match.</p> : (
          <ul className="dev-roles-list">
            {accounts.map(account => {
              const current = accessValue(account.role, account.admin_scope);
              const draft = drafts[account.id];
              const self = account.id === profile?.id;
              return (
                <li key={account.id} className="dev-roles-row">
                  <div className="dev-roles-who">
                    <strong>{account.display_name}{self ? ' (you)' : ''}</strong>
                    <span>{account.email ?? 'no email'} · {shortWallet(account.wallet_address)}</span>
                  </div>
                  <span className={`dev-roles-badge is-${account.admin_scope ?? account.role}`}>{accessLabel(account.role, account.admin_scope)}</span>
                  {self ? <span className="settings-description">Another developer must change your own role.</span> : (
                    <div className="dev-roles-edit">
                      <label className="quiz-field">
                        <span>Access</span>
                        <select aria-label={`Access for ${account.display_name}`} value={draft?.access ?? current}
                          onChange={(event) => setDrafts(all => ({ ...all, [account.id]: { access: event.target.value, reason: all[account.id]?.reason ?? '' } }))}>
                          {ACCESS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                      {draft && draft.access !== current && (
                        <>
                          <label className="quiz-field">
                            <span>Reason</span>
                            <input aria-label={`Reason for ${account.display_name}`} value={draft.reason}
                              onChange={(event) => setDrafts(all => ({ ...all, [account.id]: { ...draft, reason: event.target.value } }))}
                              placeholder={ACCESS_OPTIONS.find(o => o.value === draft.access)?.hint} />
                          </label>
                          <button type="button" className="button-approve" disabled={saving === account.id} onClick={() => void save(account)}>
                            {saving === account.id ? 'Saving…' : 'Save'}
                          </button>
                          <button type="button" className="button-muted" onClick={() => setDrafts(({ [account.id]: _drop, ...rest }) => rest)}>Cancel</button>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="stitch-panel settings-audit" aria-label="Role changes">
        <h2 className="settings-section-title"><UserCog size={16} aria-hidden="true" /> Recent role changes</h2>
        {audit.length === 0 ? <p className="settings-description">No role changes yet.</p> : (
          <ul className="settings-audit-list">
            {audit.map((entry, index) => (
              <li key={`${entry.created_at}-${index}`}>
                <div>
                  <strong>{entry.target_name ?? entry.target_email ?? 'Account'}: {accessLabel(entry.old_role as Role, entry.old_scope as Scope)} → {accessLabel(entry.new_role as Role, entry.new_scope as Scope)}</strong>
                  <span>{new Date(entry.created_at).toLocaleString()}</span>
                </div>
                <p>{entry.reason} — by {entry.actor_name ?? 'unknown'}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
