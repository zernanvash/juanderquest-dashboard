import { useCallback, useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { PageHeader } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { withArea } from '../utils/areaQuery';
import { describeError } from '../utils/errors';
import type { Quest } from '../types';

type AdminQuest = Quest & { spot_name?: string | null; municipality?: string | null };
type StatusFilter = 'all' | 'published' | 'paused' | 'draft';
const FILTERS: StatusFilter[] = ['all', 'published', 'paused', 'draft'];

export function QuestsPage() {
  const selectedAreaId = useSelectedAreaId();
  const [quests, setQuests] = useState<AdminQuest[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const fetchQuests = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError('');
        const data = await apiFetch<AdminQuest[]>(withArea('/admin/quests', selectedAreaId), { signal });
        setQuests(data);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(describeError(cause, 'Unable to load quests.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedAreaId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchQuests(controller.signal);
    return () => controller.abort();
  }, [fetchQuests]);

  const setStatus = async (quest: AdminQuest, status: 'paused' | 'published') => {
    setSaving(quest.id);
    setError('');
    try {
      const updated = await apiFetch<Quest>(`/quests/${quest.id}/status`, { method: 'PATCH', body: { status } });
      setQuests((current) => current.map((item) => (item.id === quest.id ? { ...item, ...updated } : item)));
    } catch (cause) {
      setError(describeError(cause, 'Unable to change the quest status.'));
    } finally {
      setSaving(null);
    }
  };

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quests.filter((quest) => {
      if (filter !== 'all' && quest.status !== filter) return false;
      if (!q) return true;
      return (
        quest.title.toLowerCase().includes(q) ||
        (quest.spot_name ?? '').toLowerCase().includes(q) ||
        (quest.municipality ?? '').toLowerCase().includes(q) ||
        quest.location_name.toLowerCase().includes(q) ||
        quest.category.toLowerCase().includes(q)
      );
    });
  }, [quests, filter, search]);

  const { page, totalPages, pageItems: pagedQuests, setPage } = useClientPagination(shown, 24);

  return (
    <div>
      <PageHeader
        title="Quests"
        description="Every quest in your areas, drafts and paused ones included. Pause a quest to hide it from travelers, or publish it again. Authors still own and edit their quests."
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void fetchQuests()}>Retry</button>
        </div>
      ) : null}

      <div className="filter-row">
        <span className="filter-label">Status</span>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className={`filter-chip${filter === value ? ' is-active' : ''}`}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value} ({value === 'all' ? quests.length : quests.filter((quest) => quest.status === value).length})
          </button>
        ))}
      </div>

      <AdminSearchBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search quest title, destination, municipality, category…"
        resultCount={shown.length}
        totalCount={quests.length}
      />

      {loading ? (
        <div className="stitch-panel loading-panel">Loading quests…</div>
      ) : shown.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <MapPin size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No quests match this filter.</p>
        </div>
      ) : (
        <>
          <div className="quest-grid">
            {pagedQuests.map((quest) => (
            <div key={quest.id} className="stitch-card quest-card">
              <div className="destination-tags">
                <span className="destination-tag">{quest.category.replace(/_/g, ' ')}</span>
                <span className={`status-pill status-${quest.status === 'published' ? 'approved' : 'pending'}`}>
                  {quest.status || (quest.is_active ? 'published' : 'inactive')}
                </span>
              </div>
              <h3 className="destination-title">{quest.title}</h3>
              <p className="destination-location">
                {[quest.spot_name, quest.municipality].filter(Boolean).join(' · ') || quest.location_name}
              </p>
              <div className="quest-reward-row">
                <span>
                  Reward: <strong>+{quest.reward_points} PTS</strong>
                </span>
                <span className="destination-meta">
                  {Array.isArray(quest.steps) && quest.steps.length > 0
                    ? `${quest.steps.length} step${quest.steps.length === 1 ? '' : 's'}`
                    : 'Single checkpoint'}
                </span>
              </div>
              {quest.status === 'published' ? (
                <button type="button" disabled={saving === quest.id} onClick={() => void setStatus(quest, 'paused')}>
                  Pause
                </button>
              ) : quest.status === 'paused' || quest.status === 'draft' ? (
                <button type="button" disabled={saving === quest.id} onClick={() => void setStatus(quest, 'published')}>
                  Publish
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <AdminPagination page={page} totalPages={totalPages} totalItems={shown.length} onPageChange={setPage} />
        </>
      )}

      <p className="page-footnote">
        Proof marker codes are never sent to the dashboard. Funded quests are managed from their funding round, so the
        server refuses a status change for them.
      </p>
    </div>
  );
}
