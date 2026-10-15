import { useCallback, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Quest } from '../types';

export function QuestsPage() {
  const [quests, setQuests] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchQuests = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<Quest[]>('/quests', { signal });
      setQuests(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load quests.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchQuests(controller.signal);
    return () => controller.abort();
  }, [fetchQuests]);

  return (
    <div>
      <PageHeader
        title="Quests"
        description="Read-only oversight of the active quest catalog. Author-managed destination quests remain owned and edited by their authors."
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void fetchQuests()}>Retry</button>
        </div>
      ) : null}

      {loading ? (
        <div className="stitch-panel loading-panel">Loading quests…</div>
      ) : quests.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <MapPin size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No quests are currently published.</p>
        </div>
      ) : (
        <div className="quest-grid">
          {quests.map((quest) => (
            <div key={quest.id} className="stitch-card quest-card">
              <div className="destination-tags">
                <span className="destination-tag">{quest.category.replace(/_/g, ' ')}</span>
                <span className={`status-pill status-${quest.status === 'paused' ? 'pending' : quest.status === 'draft' ? 'pending' : 'approved'}`}>
                  {quest.status || (quest.is_active ? 'published' : 'inactive')}
                </span>
              </div>
              <h3 className="destination-title">{quest.title}</h3>
              <p className="destination-location">{quest.location_name}</p>
              <div className="quest-reward-row">
                <span>
                  Reward: <strong>+{quest.reward_points} PTS</strong>
                </span>
                <span className="destination-meta">
                  {Array.isArray(quest.steps) && quest.steps.length > 0 ? `${quest.steps.length} step${quest.steps.length === 1 ? '' : 's'}` : 'Single checkpoint'}
                </span>
              </div>
              <p className="destination-meta quest-geofence">
                Geofence perimeter: {quest.radius_meters}m boundary · Native AR and sovereign GPS verification
                {quest.created_at ? ` · Created ${new Date(quest.created_at).toLocaleDateString()}` : ''}
              </p>
            </div>
          ))}
        </div>
      )}

      <p className="page-footnote">
        Proof marker codes are intentionally withheld from this public quest projection. Quest ownership and proof submissions stay
        with their authors; the dashboard does not impersonate authors or edit quests.
      </p>
    </div>
  );
}
