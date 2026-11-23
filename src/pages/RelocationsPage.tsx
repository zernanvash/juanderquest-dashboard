import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { useRouter } from '../router';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { useUrlFilterState } from '../utils/urlFilters';
import { describeError } from '../utils/errors';
import { MAP_TILE_MAX_NATIVE_ZOOM, MAP_TILE_URL } from '../mapTiles';

export interface SpotRelocationItem {
  id: string;
  spot_id: string;
  spot_name: string;
  spot_slug: string;
  municipality: string;
  town_area_id: string | null;
  requested_by: string;
  author_handle: string | null;
  author_display_name: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  distance_m: number;
  accuracy_m: number | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';

const parseStatus = (value: string | null): StatusFilter =>
  value === 'approved' || value === 'rejected' || value === 'all' ? value : 'pending';

function RelocationBeforeAfterMap({
  fromLat,
  fromLng,
  toLat,
  toLng,
  distanceM,
}: {
  fromLat: number;
  fromLng: number;
  toLat: number;
  toLng: number;
  distanceM: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const map = L.map(el, {
        center: [(fromLat + toLat) / 2, (fromLng + toLng) / 2],
        zoom: 15,
        scrollWheelZoom: false,
        attributionControl: false,
      });

      L.tileLayer(MAP_TILE_URL, {
        maxNativeZoom: MAP_TILE_MAX_NATIVE_ZOOM,
        maxZoom: 18,
      }).addTo(map);

      const fromIcon = L.divIcon({
        className: 'relocation-pin relocation-pin-from',
        html: '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#64748b;border:2px solid #fff;"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const toIcon = L.divIcon({
        className: 'relocation-pin relocation-pin-to',
        html: '<span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#c2410c;border:2px solid #fff;"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      L.marker([fromLat, fromLng], { icon: fromIcon }).bindTooltip('Current pin').addTo(map);
      L.marker([toLat, toLng], { icon: toIcon }).bindTooltip('Requested pin').addTo(map);
      L.polyline(
        [
          [fromLat, fromLng],
          [toLat, toLng],
        ],
        { color: '#c2410c', weight: 3, dashArray: '5 5' },
      ).addTo(map);

      map.fitBounds(
        L.latLngBounds([
          [fromLat, fromLng],
          [toLat, toLng],
        ]),
        { padding: [20, 20], maxZoom: 16 },
      );

      return () => {
        map.remove();
      };
    } catch {
      return undefined;
    }
  }, [fromLat, fromLng, toLat, toLng]);

  return (
    <div
      style={{ position: 'relative', width: 220, height: 110, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border, #d6d3d1)' }}
      role="img"
      aria-label={`Before and after map: ${distanceM} m move`}
    >
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      <span
        style={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          zIndex: 500,
          background: 'rgba(15,23,42,0.82)',
          color: '#fff',
          fontSize: 11,
          padding: '2px 6px',
          borderRadius: 4,
        }}
      >
        {distanceM} m
      </span>
    </div>
  );
}

export function RelocationsPage() {
  const { query, navigate } = useRouter();
  const selectedAreaId = useSelectedAreaId();
  const statusFilter = parseStatus(query.get('status'));
  const [items, setItems] = useState<SpotRelocationItem[]>([]);
  const [search, setSearch] = useUrlFilterState('q', '');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError('');
        const path = withArea(`/admin/spots/relocations?status=${statusFilter}`, selectedAreaId);
        const data = await apiFetch<SpotRelocationItem[]>(path, { signal });
        setItems(data);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(describeError(cause, 'Unable to load destination relocation requests.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedAreaId, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const notifyCountChanged = () => {
    window.dispatchEvent(new CustomEvent('jdq:relocations-changed'));
  };

  const approve = async (item: SpotRelocationItem) => {
    setSaving(item.id);
    setActionError('');
    try {
      const updated = await apiFetch<SpotRelocationItem>(`/admin/spots/relocations/${item.id}/approve`, {
        method: 'POST',
      });
      setItems((current) =>
        statusFilter === 'pending'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) => (row.id === item.id ? { ...row, ...updated } : row)),
      );
      notifyCountChanged();
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to approve the relocation request.'));
    } finally {
      setSaving(null);
    }
  };

  const reject = async (item: SpotRelocationItem) => {
    const note = (notes[item.id] ?? '').trim();
    if (note.length < 3) {
      setActionError('Write a rejection note of at least 3 characters.');
      return;
    }
    setSaving(item.id);
    setActionError('');
    try {
      const updated = await apiFetch<SpotRelocationItem>(`/admin/spots/relocations/${item.id}/reject`, {
        method: 'POST',
        body: { note },
      });
      setItems((current) =>
        statusFilter === 'pending'
          ? current.filter((row) => row.id !== item.id)
          : current.map((row) => (row.id === item.id ? { ...row, ...updated } : row)),
      );
      notifyCountChanged();
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to reject the relocation request.'));
    } finally {
      setSaving(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.spot_name.toLowerCase().includes(q) ||
        item.municipality.toLowerCase().includes(q) ||
        (item.author_handle ?? '').toLowerCase().includes(q) ||
        item.author_display_name.toLowerCase().includes(q),
    );
  }, [items, search]);

  const { page, totalPages, pageItems: pagedItems, setPage } = useClientPagination(filtered, 20);

  return (
    <div>
      <PageHeader
        title="Destination relocations"
        description="Pin moves larger than 200 m wait here for approval. Review the before/after map before approving or rejecting."
      />

      {actionError ? (
        <div className="load-error" role="alert">
          {actionError}
        </div>
      ) : null}

      {error ? (
        <div className="load-error" role="alert">
          {error}{' '}
          <button type="button" onClick={() => void load()}>
            Retry
          </button>
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
            onClick={() =>
              navigate(value === 'pending' ? '/destinations/relocations' : `/destinations/relocations?status=${value}`)
            }
          >
            {value}
          </button>
        ))}
      </div>

      <AdminSearchBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search destination, town, or @handle…"
        resultCount={filtered.length}
        totalCount={items.length}
      />

      {loading ? (
        <div className="stitch-panel loading-panel">Loading relocation requests…</div>
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <MapPin size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No relocation requests match this filter.</p>
        </div>
      ) : (
        <>
          <div className="stitch-panel" style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Author</th>
                  <th>Before / After</th>
                  <th>Move</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.spot_name}</strong>
                      <div style={{ fontSize: 12, opacity: 0.75 }}>{item.municipality || '—'}</div>
                    </td>
                    <td>
                      <div>{item.author_handle ? `@${item.author_handle}` : item.author_display_name}</div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {new Date(item.created_at).toLocaleString()}
                      </div>
                    </td>
                    <td>
                      <RelocationBeforeAfterMap
                        fromLat={item.from_lat}
                        fromLng={item.from_lng}
                        toLat={item.to_lat}
                        toLng={item.to_lng}
                        distanceM={item.distance_m}
                      />
                    </td>
                    <td>
                      <div>
                        <strong>{item.distance_m} m</strong>
                        {item.accuracy_m != null ? ` (±${Math.round(item.accuracy_m)} m)` : ''}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>
                        From: {item.from_lat.toFixed(5)}, {item.from_lng.toFixed(5)}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.75 }}>
                        To: {item.to_lat.toFixed(5)}, {item.to_lng.toFixed(5)}
                      </div>
                    </td>
                    <td>
                      <span className={`status-pill status-${item.status}`}>{item.status}</span>
                      {item.review_note ? (
                        <div style={{ fontSize: 12, marginTop: 4, opacity: 0.8 }}>{item.review_note}</div>
                      ) : null}
                    </td>
                    <td>
                      {item.status === 'pending' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
                          <button
                            type="button"
                            className="btn-primary"
                            disabled={saving === item.id}
                            onClick={() => void approve(item)}
                          >
                            {saving === item.id ? 'Saving…' : 'Approve'}
                          </button>
                          <input
                            type="text"
                            aria-label={`Rejection note for ${item.spot_name}`}
                            placeholder="Rejection note…"
                            value={notes[item.id] ?? ''}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={saving === item.id}
                            onClick={() => void reject(item)}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, opacity: 0.65 }}>Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AdminPagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
