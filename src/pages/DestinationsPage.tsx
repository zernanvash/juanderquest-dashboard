import { useCallback, useEffect, useState } from 'react';
import { Compass } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useRouter } from '../router';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Spot } from '../types';

type StatusFilter = 'all' | 'published' | 'needs_review' | 'unpublished';
const STATUS_FILTERS: StatusFilter[] = ['all', 'published', 'needs_review', 'unpublished'];

const parseStatus = (value: string | null): StatusFilter =>
  value === 'published' || value === 'needs_review' || value === 'unpublished' ? value : 'all';

export function DestinationsPage() {
  const { query, navigate } = useRouter();
  const statusFilter = parseStatus(query.get('status'));

  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchSpots = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setListError('');
      const data = await apiFetch<Spot[]>('/admin/spots', { signal });
      setSpots(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setListError(describeError(cause, 'Unable to load destinations.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchSpots(controller.signal);
    return () => controller.abort();
  }, [fetchSpots]);

  const reviewSpot = async (
    spot: Spot,
    status: 'published' | 'needs_review' | 'unpublished',
    band: Spot['crowd_capacity_band'] = spot.crowd_capacity_band || 'medium',
    suppressed = spot.recommendation_suppressed || false
  ) => {
    try {
      setReviewingId(spot.id);
      setReviewError('');
      const updated = await apiFetch<Spot>(`/admin/spots/${spot.id}`, {
        method: 'PATCH',
        body: { status, crowd_capacity_band: band, recommendation_suppressed: suppressed },
      });
      setSpots((current) => current.map((item) => (item.id === spot.id ? updated : item)));
    } catch (cause) {
      setReviewError(describeError(cause, 'Unable to update destination.'));
    } finally {
      setReviewingId(null);
    }
  };

  const filtered = spots.filter((spot) => statusFilter === 'all' || spot.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Destinations"
        description="Published destination catalog and existing emergency controls. Community uploads publish immediately; suppression only affects recommendation ranking."
      />

      {listError ? (
        <div className="load-error" role="alert">
          {listError} <button type="button" onClick={() => void fetchSpots()}>Retry</button>
        </div>
      ) : null}
      {reviewError ? <div className="load-error" role="alert">{reviewError}</div> : null}

      <div className="filter-row">
        <span className="filter-label">Status</span>
        {STATUS_FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={`filter-chip${statusFilter === value ? ' is-active' : ''}`}
            aria-pressed={statusFilter === value}
            onClick={() => navigate(value === 'all' ? '/destinations' : `/destinations?status=${value}`)}
          >
            {value.replace(/_/g, ' ')} ({value === 'all' ? spots.length : spots.filter((spot) => spot.status === value).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="stitch-panel loading-panel">Loading destinations…</div>
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Compass size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No destinations match this filter.</p>
        </div>
      ) : (
        <div className="quest-grid">
          {filtered.map((spot) => (
            <div key={spot.id} className="stitch-card destination-card">
              {spot.image_url ? (
                <img
                  src={spot.image_url}
                  alt={`${spot.name} destination`}
                  width="480"
                  height="120"
                  loading="lazy"
                  style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }}
                />
              ) : null}
              <div className="destination-tags">
                <span className="destination-tag">{spot.subcategory.replace(/_/g, ' ')}</span>
                <span className="destination-tag destination-tag-source">
                  {spot.source_type === 'community_resident' ? 'Community uploaded' : spot.source_name}
                </span>
              </div>
              <h3 className="destination-title">{spot.name}</h3>
              <p className="destination-location">{spot.municipality}</p>
              <p className="destination-meta">
                Source: {spot.source_name} · Trust: {spot.trust_level}
              </p>
              <p className={spot.crowd_status === 'estimated_busy' ? 'warn-text destination-status' : 'good-text destination-status'}>
                Status: {spot.status.replace(/_/g, ' ')} · Crowd: {(spot.crowd_status || 'unknown').replace(/_/g, ' ')}
              </p>
              {spot.recommendation_suppressed ? (
                <span className="suppression-badge">Suppressed from alternative recommendations</span>
              ) : null}
              <label className="destination-capacity">
                Capacity band
                <select
                  value={spot.crowd_capacity_band || 'medium'}
                  disabled={reviewingId === spot.id}
                  onChange={(event) =>
                    void reviewSpot(spot, spot.status as 'published' | 'needs_review' | 'unpublished', event.target.value as Spot['crowd_capacity_band'])
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <div className="destination-actions">
                {spot.status !== 'published' ? (
                  <button
                    type="button"
                    className="button-approve"
                    disabled={reviewingId === spot.id}
                    onClick={() => void reviewSpot(spot, 'published')}
                  >
                    Publish
                  </button>
                ) : null}
                <button
                  type="button"
                  className="button-muted"
                  disabled={reviewingId === spot.id}
                  onClick={() => {
                    const verb = spot.status === 'published' ? 'Unpublish' : 'Reject';
                    if (!window.confirm(`${verb} "${spot.name}"? Travelers will no longer see it as a published destination.`)) return;
                    void reviewSpot(spot, 'unpublished');
                  }}
                >
                  {spot.status === 'published' ? 'Unpublish' : 'Reject'}
                </button>
                <button
                  type="button"
                  className="button-muted"
                  disabled={reviewingId === spot.id}
                  onClick={() => {
                    const action = spot.recommendation_suppressed ? 'Allow this destination in alternative recommendations again' : `Suppress "${spot.name}" from alternative recommendations`;
                    if (!window.confirm(`${action}? This emergency control does not unpublish the destination.`)) return;
                    void reviewSpot(spot, spot.status as 'published' | 'needs_review' | 'unpublished', spot.crowd_capacity_band, !spot.recommendation_suppressed);
                  }}
                >
                  {spot.recommendation_suppressed ? 'Allow alternatives' : 'Suppress alternative'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
