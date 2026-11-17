import { useCallback, useEffect, useMemo, useState } from 'react';
import { Camera } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { useRouter } from '../router';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { describeError } from '../utils/errors';
import type { SpotPhotoSubmission } from '../types';

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const parseStatus = (value: string | null): StatusFilter =>
  value === 'approved' || value === 'rejected' || value === 'all' ? value : 'pending';

export function SpotPhotosPage() {
  const { query, navigate } = useRouter();
  const selectedAreaId = useSelectedAreaId();
  const statusFilter = parseStatus(query.get('status'));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [items, setItems] = useState<SpotPhotoSubmission[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const path = withArea(`/admin/spot-photos?status=${statusFilter}`, selectedAreaId);
      const data = await apiFetch<SpotPhotoSubmission[]>(path, { signal });
      setItems(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load destination photo submissions.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedAreaId, statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const approve = async (item: SpotPhotoSubmission) => {
    setSaving(item.id);
    setActionError('');
    try {
      const updated = await apiFetch<SpotPhotoSubmission>(`/admin/spot-photos/${item.id}/approve`, {
        method: 'POST',
      });
      setItems((current) =>
        statusFilter === 'pending'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) => (row.id === item.id ? updated : row)),
      );
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to approve the photo.'));
    } finally {
      setSaving(null);
    }
  };

  const reject = async (item: SpotPhotoSubmission) => {
    const reason = (reasons[item.id] ?? '').trim();
    if (reason.length < 3) {
      setActionError('Write a rejection reason of at least 3 characters.');
      return;
    }
    setSaving(item.id);
    setActionError('');
    try {
      const updated = await apiFetch<SpotPhotoSubmission>(`/admin/spot-photos/${item.id}/reject`, {
        method: 'POST',
        body: { reason },
      });
      setItems((current) =>
        statusFilter === 'pending'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) => (row.id === item.id ? updated : row)),
      );
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to reject the photo.'));
    } finally {
      setSaving(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      (item.spot_name ?? item.spot_id).toLowerCase().includes(q) ||
      (item.spot_municipality ?? '').toLowerCase().includes(q) ||
      (item.uploader_name ?? '').toLowerCase().includes(q) ||
      (item.caption ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, totalPages, pageItems: pagedItems, setPage } = useClientPagination(filtered, 24);

  return (
    <div>
      <PageHeader
        title="Photos"
        description="Traveler-submitted photos for existing destinations. Approve clear, accurate photos to add them to the gallery, or reject with a reason."
      />

      {actionError ? (
        <div className="load-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      <div className="filter-row">
        <span className="filter-label">Status</span>
        {(['pending', 'approved', 'rejected', 'all'] as StatusFilter[]).map((value) => (
          <button
            key={value}
            type="button"
            className={`filter-chip${statusFilter === value ? ' is-active' : ''}`}
            aria-pressed={statusFilter === value}
            onClick={() => navigate(value === 'pending' ? '/spot-photos' : `/spot-photos?status=${value}`)}
          >
            {value}
          </button>
        ))}
      </div>

      <AdminSearchBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search destination, municipality, uploader, caption…"
        resultCount={filtered.length}
        totalCount={items.length}
      />

      {loading ? (
        <div className="stitch-panel loading-panel">Loading destination photos…</div>
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Camera size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No photo submissions match this filter.</p>
        </div>
      ) : (
        <>
          <div className="report-grid">
            {pagedItems.map((item) => (
              <article key={item.id} className="stitch-card report-card">
                <div className="report-card-top">
                  <span className={`status-pill status-${item.status}`}>{item.status}</span>
                </div>
                {item.photo_url ? (
                  <img
                    src={item.photo_url}
                    alt={item.caption ?? item.spot_name ?? 'Submitted destination photo'}
                    style={{
                      width: '100%',
                      maxHeight: 220,
                      objectFit: 'cover',
                      borderRadius: 6,
                      marginBottom: 8,
                    }}
                  />
                ) : null}
                <h3 className="report-spot">{item.spot_name ?? item.spot_id}</h3>
                <p className="report-location">
                  {item.spot_municipality ? `${item.spot_municipality} · ` : ''}
                  By {item.uploader_name ?? item.user_id}
                </p>
                {item.caption ? <p className="report-details">{item.caption}</p> : null}
                <div className="report-meta">
                  <span>Submitted {new Date(item.created_at).toLocaleString()}</span>
                </div>
                {item.status === 'pending' ? (
                  <div className="report-actions">
                    <label>
                      Rejection reason
                      <input
                        type="text"
                        aria-label={`Rejection reason for photo ${item.id}`}
                        value={reasons[item.id] ?? ''}
                        maxLength={500}
                        placeholder="Required only if rejecting"
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button type="button" disabled={saving === item.id} onClick={() => void approve(item)}>
                      Approve
                    </button>
                    <button type="button" disabled={saving === item.id} onClick={() => void reject(item)}>
                      Reject
                    </button>
                  </div>
                ) : item.reject_reason ? (
                  <p className="report-resolution">
                    Rejected: {item.reject_reason}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <AdminPagination page={page} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
