import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api/client';
import { EmptyState, PageError, PageHeader, PageLoading } from '../components/PageState';
import { Link } from '../router';
import { describeError } from '../utils/errors';
import { formatShortDateTime } from '../utils/riskSummary';

export interface AdminUserRow {
  id: string;
  display_name: string;
  handle: string | null;
  masked_email: string;
  role: string;
  admin_scope: string | null;
  created_at: string;
  last_active_at: string | null;
  explorer_xp: number;
  points: number;
  stamps: number;
  badges_count: number;
  open_flags: number;
  suspended_at: string | null;
}

export function UsersPage() {
  const [q, setQ] = useState('');
  const [submittedQ, setSubmittedQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<'newest' | 'xp' | 'points'>('newest');
  const [includeTest, setIncludeTest] = useState(false);

  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const buildParams = useCallback(
    (cursor?: string | null) => {
      const p = new URLSearchParams({ sort, limit: '25' });
      if (submittedQ) p.set('q', submittedQ);
      if (role) p.set('role', role);
      if (status) p.set('status', status);
      if (includeTest) p.set('include_test', '1');
      if (cursor) p.set('cursor', cursor);
      return p.toString();
    },
    [sort, submittedQ, role, status, includeTest],
  );

  const loadFirst = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch<{ items: AdminUserRow[]; next_cursor: string | null; has_more: boolean }>(
          `/admin/users?${buildParams(null)}`,
          { signal },
        );
        setItems(res.items ?? []);
        setNextCursor(res.next_cursor ?? null);
        setHasMore(Boolean(res.has_more));
      } catch (cause) {
        if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
          setError(describeError(cause, 'Unable to load users.'));
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [buildParams],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadFirst(controller.signal);
    return () => controller.abort();
  }, [loadFirst]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch<{ items: AdminUserRow[]; next_cursor: string | null; has_more: boolean }>(
        `/admin/users?${buildParams(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...(res.items ?? [])]);
      setNextCursor(res.next_cursor ?? null);
      setHasMore(Boolean(res.has_more));
    } catch (cause) {
      setError(describeError(cause, 'Unable to load additional users.'));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Users"
        description="Search accounts by name, @handle or email, inspect balances and moderation history, or manage suspensions."
        actions={
          <button type="button" className="button button-secondary" onClick={() => void loadFirst()}>
            <RefreshCw size={15} /> Refresh
          </button>
        }
      />

      <section className="stitch-panel panel-section">
        <form
          className="plan117-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQ(q.trim());
          }}
        >
          <label className="plan117-search-field">
            <span>Search</span>
            <input
              type="search"
              placeholder="Name, @handle or email…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="plan117-filter-field">
            <span>Role</span>
            <select aria-label="Role filter" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              <option value="user">Traveler</option>
              <option value="admin">Admin</option>
              <option value="area_admin">Area admin</option>
              <option value="qa">QA</option>
            </select>
          </label>
          <label className="plan117-filter-field">
            <span>Status</span>
            <select aria-label="Status filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <label className="plan117-filter-field">
            <span>Sort</span>
            <select
              aria-label="Sort order"
              value={sort}
              onChange={(e) => setSort(e.target.value as 'newest' | 'xp' | 'points')}
            >
              <option value="newest">Newest</option>
              <option value="xp">Explorer XP</option>
              <option value="points">Points (mJDQ)</option>
            </select>
          </label>
          <label className="checkbox-inline">
            <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
            Include test data
          </label>
          <button type="submit" className="button button-approve">
            <Search size={14} /> Search
          </button>
        </form>
      </section>

      {error ? <PageError message={error} onRetry={() => void loadFirst()} /> : null}

      {loading ? (
        <PageLoading label="Loading users…" />
      ) : items.length === 0 ? (
        <EmptyState title="No matching users" detail="Try clearing your search or changing filters." />
      ) : (
        <section className="stitch-panel panel-section">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Points</th>
                  <th>Stamps</th>
                  <th>Explorer XP</th>
                  <th>Badges</th>
                  <th>Flags</th>
                  <th>Last active</th>
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link to={`/users/${encodeURIComponent(u.id)}`} className="plan117-user-link">
                        {u.display_name}
                      </Link>
                      {u.handle ? <div className="plan117-subtext">@{u.handle.replace(/^@/, '')}</div> : null}
                      <div className="plan117-subtext">{u.masked_email}</div>
                    </td>
                    <td>
                      <span>{u.role}</span>
                      {u.admin_scope ? <div className="plan117-subtext">{u.admin_scope}</div> : null}
                    </td>
                    <td>
                      {u.suspended_at ? (
                        <span className="status-pill status-rejected">SUSPENDED</span>
                      ) : (
                        <span className="status-pill status-approved">Active</span>
                      )}
                    </td>
                    <td>{u.points.toLocaleString()}</td>
                    <td>{u.stamps.toLocaleString()}</td>
                    <td>{u.explorer_xp.toLocaleString()}</td>
                    <td>{u.badges_count}</td>
                    <td>
                      {u.open_flags > 0 ? (
                        <span className="status-pill status-pending">
                          <ShieldAlert size={12} /> {u.open_flags} open
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td>
                      <div>{formatShortDateTime(u.last_active_at)}</div>
                      <div className="plan117-subtext">Joined {formatShortDateTime(u.created_at)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore ? (
            <div className="plan117-load-more">
              <button
                type="button"
                className="button button-secondary"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
