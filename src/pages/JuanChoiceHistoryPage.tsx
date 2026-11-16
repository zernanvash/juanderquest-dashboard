import { useCallback, useEffect, useMemo, useState } from 'react';
import { Award } from 'lucide-react';
import { apiFetch } from '../api/client';
import { EmptyState, PageHeader, PageLoading } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { describeError } from '../utils/errors';

type Campaign = {
  id: string;
  slug: string;
  region: string;
  theme: string;
  status: string;
  opens_at: string;
  closes_at: string;
  is_test: boolean;
  candidate_count: number;
  ballot_count: number;
  policy_version?: string;
  round_tier?: 'standard' | 'special_festival';
  festival_name?: string | null;
  weighted_votes?: number;
  boost_points?: number;
};

type Perk = {
  key?: string;
  label?: string;
  is_mystery?: boolean;
  revealed?: boolean;
  is_anchor?: boolean;
  role?: string;
  candidate_id?: string;
};

type Candidate = {
  id: string;
  spot_id: string;
  spot_name: string;
  municipality: string;
  status: 'eligible' | 'suspended';
  spot_status: string;
  crowd_capacity_band: string;
  recommendation_suppressed: boolean;
  votes: number;
  weighted_votes?: number;
  boost_points?: number;
  manifesto_perks?: Perk[] | null;
  prior_loss_streak?: number;
};

type Detail = {
  campaign: Campaign;
  candidates: Candidate[];
  audit: { action: string; reason: string | null; created_at: string }[];
  result: {
    valid_ballots: number;
    co_winner_ids: string[];
    minister_candidate_id?: string | null;
    active_perks?: Perk[] | null;
    total_weighted_votes?: number | null;
    total_boost_points?: number | null;
  } | null;
};

type HistoryTab = 'summary' | 'candidates' | 'audit';

const perkText = (perk: Perk) =>
  `${perk.label ?? perk.key ?? 'perk'}${perk.is_mystery ? ' (mystery)' : ''}${perk.is_anchor ? ' · anchor' : ''}`;

export function JuanChoiceHistoryPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [activeTab, setActiveTab] = useState<HistoryTab>('summary');
  const [statusFilter, setStatusFilter] = useState<'past' | 'finalized' | 'closed' | 'cancelled'>('past');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const res = await apiFetch<{ items: Campaign[] }>('/juanchoice/admin/campaigns', { signal });
      setCampaigns(res.items ?? []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load JuanChoice history.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      const isPast = ['finalized', 'closed', 'cancelled'].includes(c.status);
      if (statusFilter === 'past' && !isPast) return false;
      if (statusFilter !== 'past' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (
        c.theme.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        c.region.toLowerCase().includes(q) ||
        (c.festival_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [campaigns, statusFilter, search]);

  useEffect(() => {
    if (filtered.length > 0 && (!selectedId || !filtered.some((c) => c.id === selectedId))) {
      setSelectedId(filtered[0].id);
    } else if (filtered.length === 0) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    void apiFetch<Detail>(`/juanchoice/admin/campaigns/${selectedId}`)
      .then((res) => {
        if (active) setDetail(res);
      })
      .catch((cause) => {
        if (active) setError(describeError(cause, 'Unable to load round details.'));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const { page, totalPages, pageItems: pagedCampaigns, setPage } = useClientPagination(filtered, 15);
  const nameOf = (candidateId: string) =>
    detail?.candidates.find((item) => item.id === candidateId)?.spot_name ?? candidateId;

  if (loading) return <PageLoading label="Loading JuanChoice round history…" />;

  return (
    <div>
      <PageHeader
        title="JuanChoice round history"
        description="Inspect finalized, closed, and cancelled rounds, winning manifests, and promotion audit logs."
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      <div className="filter-row">
        <span className="filter-label">Status</span>
        {(['past', 'finalized', 'closed', 'cancelled'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={`filter-chip${statusFilter === value ? ' is-active' : ''}`}
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
          >
            {value === 'past' ? 'All past' : value}
          </button>
        ))}
      </div>

      <AdminSearchBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Search round theme, slug, festival, region…"
        resultCount={filtered.length}
        totalCount={campaigns.length}
      />

      {filtered.length === 0 ? (
        <EmptyState title="No past rounds match" detail="Completed and cancelled rounds will appear here." />
      ) : (
        <div className="trail-studio-workspace">
          <aside className="trail-studio-list" aria-label="Past JuanChoice rounds">
            {pagedCampaigns.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`trail-studio-list-item${selectedId === item.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="trail-studio-list-item-head">
                  <span className={`status-pill ${item.status === 'finalized' ? 'status-approved' : 'status-pending'}`}>
                    {item.status}
                  </span>
                  {item.is_test ? <span className="status-pill status-pending">QA</span> : null}
                </div>
                <strong>{item.theme}</strong>
                <small>
                  {item.ballot_count} ballots · closed {new Date(item.closes_at).toLocaleDateString()}
                </small>
              </button>
            ))}
            <AdminPagination page={page} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
          </aside>

          <div className="trail-studio-detail">
            {detailLoading || !detail ? (
              <div className="stitch-panel loading-panel">Loading round details…</div>
            ) : (
              <section className="stitch-panel jc-detail">
                <div>
                  <h2 className="jc-section-title">
                    <Award size={18} aria-hidden="true" style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                    {detail.campaign.theme}
                  </h2>
                  <p className="jc-meta">
                    {detail.campaign.region} · {detail.campaign.status} · {detail.campaign.ballot_count} ballots · closed{' '}
                    {new Date(detail.campaign.closes_at).toLocaleString()}
                  </p>
                </div>

                <div className="filter-row" role="tablist" aria-label="Round history views">
                  {([
                    ['summary', 'Summary & Winners'],
                    ['candidates', `Candidates & Manifests (${detail.candidates.length})`],
                    ['audit', `Audit Log (${detail.audit.length})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={activeTab === key}
                      className={`filter-chip${activeTab === key ? ' is-active' : ''}`}
                      onClick={() => setActiveTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {activeTab === 'summary' ? (
                  detail.result ? (
                    <div className="jc-notice" data-testid="jc-history-summary">
                      <p>
                        <strong>{detail.result.valid_ballots}</strong> valid ballots ·{' '}
                        {detail.result.co_winner_ids.length} co-winner(s)
                        {detail.result.total_weighted_votes != null
                          ? ` · ${detail.result.total_weighted_votes} weighted votes · ${detail.result.total_boost_points ?? 0} boost points`
                          : ''}
                      </p>
                      <p>
                        Champion{detail.result.co_winner_ids.length > 1 ? 's' : ''}:{' '}
                        {detail.result.co_winner_ids.map(nameOf).join(' & ') || 'none'} · Vice Champion:{' '}
                        {detail.result.minister_candidate_id ? nameOf(detail.result.minister_candidate_id) : 'none'}
                      </p>
                      <p>
                        Active perks:{' '}
                        {Array.isArray(detail.result.active_perks) && detail.result.active_perks.length > 0
                          ? detail.result.active_perks
                              .map((perk) => `${perkText(perk)} (${perk.role === 'minister' ? 'vice champion' : 'champion'})`)
                              .join(' · ')
                          : 'none'}
                      </p>
                    </div>
                  ) : (
                    <p className="jc-meta">No final result recorded for this round.</p>
                  )
                ) : null}

                {activeTab === 'candidates' ? (
                  detail.candidates.length === 0 ? (
                    <p className="empty-state">No candidates in this round.</p>
                  ) : (
                    <div className="jc-list">
                      {detail.candidates.map((candidate) => (
                        <div key={candidate.id} className="jc-item">
                          <strong>{candidate.spot_name}</strong> · {candidate.municipality}
                          <p className="jc-meta">
                            {candidate.votes} ballots · {candidate.weighted_votes ?? candidate.votes} weighted ·{' '}
                            {candidate.boost_points ?? 0} boost pts · {candidate.status}
                          </p>
                          {Array.isArray(candidate.manifesto_perks) && candidate.manifesto_perks.length > 0 ? (
                            <p className="jc-meta">Manifesto: {candidate.manifesto_perks.map(perkText).join(' · ')}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )
                ) : null}

                {activeTab === 'audit' ? (
                  detail.audit.length === 0 ? (
                    <p className="jc-meta">No audit actions recorded.</p>
                  ) : (
                    <ul className="jc-audit">
                      {detail.audit.map((entry, index) => (
                        <li key={`${entry.created_at}-${index}`}>
                          <span className="jc-meta">{new Date(entry.created_at).toLocaleString()}</span> · {entry.action}
                          {entry.reason ? ` — ${entry.reason}` : ''}
                        </li>
                      ))}
                    </ul>
                  )
                ) : null}
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
