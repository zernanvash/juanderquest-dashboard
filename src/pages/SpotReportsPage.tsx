import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flag, ShieldAlert } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { useRouter } from '../router';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { describeError } from '../utils/errors';
import type { FlaggedSpot, Spot, SpotReport } from '../types';

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'dismissed';
type ReportsTab = 'reports' | 'flagged';

const parseStatus = (value: string | null): StatusFilter =>
  value === 'pending' || value === 'reviewed' || value === 'dismissed' ? value : 'all';

const REASON_LABELS: Record<SpotReport['reason'], string> = {
  inaccurate_location: 'Inaccurate location',
  site_closed_or_hazard: 'Site closed or hazard',
  misleading_photo: 'Misleading photo',
  spam_or_scam: 'Spam or scam',
  environmental_concern: 'Environmental concern',
  other: 'Other',
};

const MODERATION_STATUS_LABEL: Record<string, string> = {
  held: 'held',
  hidden_pending_review: 'auto-hidden',
  unpublished: 'removed',
  published: 'published',
};

export function SpotReportsPage() {
  const { query, navigate } = useRouter();
  const selectedAreaId = useSelectedAreaId();
  const statusFilter = parseStatus(query.get('status'));
  const activeTab: ReportsTab = query.get('view') === 'flagged' ? 'flagged' : 'reports';
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [modNotes, setModNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [reports, setReports] = useState<SpotReport[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [flaggedSpots, setFlaggedSpots] = useState<FlaggedSpot[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const [reportData, spotData, moderationData] = await Promise.all([
        apiFetch<SpotReport[]>(withArea('/admin/spot-reports', selectedAreaId), { signal }),
        apiFetch<Spot[]>(withArea('/admin/spots', selectedAreaId), { signal }),
        apiFetch<FlaggedSpot[]>(withArea('/admin/spot-moderation', selectedAreaId), { signal }).catch((cause) => {
          if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
          return [] as FlaggedSpot[];
        }),
      ]);
      setReports(reportData);
      setSpots(spotData);
      setFlaggedSpots(moderationData);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load destination reports.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [selectedAreaId]);

  const resolve = async (report: SpotReport, status: 'reviewed' | 'dismissed') => {
    const note = (notes[report.id] ?? '').trim();
    if (note.length < 5) {
      setActionError('Write a note of at least 5 characters before resolving a report.');
      return;
    }
    setSaving(report.id);
    setActionError('');
    try {
      const updated = await apiFetch<SpotReport>(`/admin/spot-reports/${report.id}`, {
        method: 'PATCH',
        body: { status, resolution_note: note },
      });
      setReports((current) => current.map((item) => (item.id === report.id ? updated : item)));
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to update the report.'));
    } finally {
      setSaving(null);
    }
  };

  const moderateSpot = async (spot: FlaggedSpot, action: 'publish' | 'keep_hidden' | 'remove') => {
    const note = (modNotes[spot.id] ?? '').trim();
    if (note.length < 5) {
      setActionError('Write a moderation note of at least 5 characters.');
      return;
    }
    setSaving(spot.id);
    setActionError('');
    try {
      const updated = await apiFetch<FlaggedSpot>(`/admin/spots/${spot.id}/moderate`, {
        method: 'POST',
        body: { action, note },
      });
      setFlaggedSpots((current) =>
        action === 'publish' || action === 'remove'
          ? current.filter((item) => item.id !== spot.id)
          : current.map((item) => (item.id === spot.id ? updated : item)),
      );
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to moderate this destination.'));
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const spotById = useMemo(() => new Map(spots.map((spot) => [spot.id, spot])), [spots]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== 'all' && report.status !== statusFilter) return false;
      if (!q) return true;
      const spot = spotById.get(report.spot_id);
      return (
        (spot?.name ?? '').toLowerCase().includes(q) ||
        (spot?.municipality ?? '').toLowerCase().includes(q) ||
        report.reason.toLowerCase().includes(q) ||
        (report.details ?? '').toLowerCase().includes(q) ||
        (report.reporter_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [reports, statusFilter, search, spotById]);
  const filteredFlagged = useMemo(() => {
    const q = search.trim().toLowerCase();
    return flaggedSpots.filter((spot) => {
      if (!q) return true;
      return (
        spot.name.toLowerCase().includes(q) ||
        spot.municipality.toLowerCase().includes(q) ||
        (spot.moderation_reasons ?? []).some((code) => code.toLowerCase().includes(q)) ||
        (spot.moderation_messages ?? []).some((msg) => msg.toLowerCase().includes(q))
      );
    });
  }, [flaggedSpots, search]);
  const { page, totalPages, pageItems: pagedReports, setPage } = useClientPagination(filtered, 24);
  const {
    page: flaggedPage,
    totalPages: flaggedTotalPages,
    pageItems: pagedFlagged,
    setPage: setFlaggedPage,
  } = useClientPagination(filteredFlagged, 24);

  return (
    <div>
      <PageHeader
        title="Destination reports"
        description="Traveler-submitted destination reports and auto-filtered destinations. Mark each one reviewed or dismissed with a short note; every decision is audited. Use the Destinations page to unpublish or suppress a destination."
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

      <div className="filter-row" role="tablist" aria-label="Destination moderation views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reports'}
          className={`filter-chip${activeTab === 'reports' ? ' is-active' : ''}`}
          onClick={() => navigate('/spot-reports')}
        >
          Reports ({reports.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'flagged'}
          className={`filter-chip${activeTab === 'flagged' ? ' is-active' : ''}`}
          onClick={() => navigate('/spot-reports?view=flagged')}
        >
          Flagged destinations ({flaggedSpots.length})
        </button>
      </div>

      {activeTab === 'reports' ? (
        <div className="filter-row">
          <span className="filter-label">Status</span>
          {(['all', 'pending', 'reviewed', 'dismissed'] as StatusFilter[]).map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${statusFilter === value ? ' is-active' : ''}`}
              aria-pressed={statusFilter === value}
              onClick={() => navigate(value === 'all' ? '/spot-reports' : `/spot-reports?status=${value}`)}
            >
              {value} ({value === 'all' ? reports.length : reports.filter((report) => report.status === value).length})
            </button>
          ))}
        </div>
      ) : null}

      <AdminSearchBar
        search={search}
        onSearchChange={setSearch}
        placeholder={
          activeTab === 'flagged'
            ? 'Search flagged destination, municipality, hold reason…'
            : 'Search destination, municipality, reason, reporter…'
        }
        resultCount={activeTab === 'flagged' ? filteredFlagged.length : filtered.length}
        totalCount={activeTab === 'flagged' ? flaggedSpots.length : reports.length}
      />

      {loading ? (
        <div className="stitch-panel loading-panel">Loading destination reports…</div>
      ) : activeTab === 'flagged' ? (
        filteredFlagged.length === 0 ? (
          <div className="stitch-panel page-state page-state-empty">
            <ShieldAlert size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
            <p className="page-state-title">No flagged destinations need review right now.</p>
          </div>
        ) : (
          <>
            <div className="report-grid">
              {pagedFlagged.map((spot) => {
                const statusText = MODERATION_STATUS_LABEL[spot.status] ?? spot.status.replace(/_/g, ' ');
                const events = spot.moderation_events ?? [];
                return (
                  <article key={spot.id} className="stitch-card report-card">
                    <div className="report-card-top">
                      <span className={`status-pill status-${spot.status === 'held' ? 'pending' : 'rejected'}`}>
                        {statusText}
                      </span>
                      {spot.appeal_submitted ? <span className="status-pill status-pending">appealed</span> : null}
                    </div>
                    <h3 className="report-spot">{spot.name}</h3>
                    <p className="report-location">{spot.municipality}</p>
                    {(spot.moderation_reasons ?? []).length > 0 ? (
                      <div className="report-meta">
                        {(spot.moderation_reasons ?? []).map((code) => (
                          <span key={code} className="status-pill">
                            {code}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {(spot.moderation_messages ?? []).map((msg, idx) => (
                      <p key={idx} className="report-details">{msg}</p>
                    ))}
                    {events.length > 0 ? (
                      <ul className="report-details" style={{ margin: 0, paddingLeft: 18 }}>
                        {events.slice(0, 4).map((ev) => (
                          <li key={ev.id}>
                            <strong>{ev.decision.replace(/_/g, ' ')}</strong> · {ev.actor === 'system' ? 'Auto-filter' : ev.actor}
                            {typeof ev.details?.note === 'string' && ev.details.note ? `: ${ev.details.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="report-actions">
                      <label>
                        Moderation note
                        <textarea
                          aria-label={`Moderation note for destination ${spot.id}`}
                          value={modNotes[spot.id] ?? ''}
                          maxLength={500}
                          onChange={(event) => setModNotes((current) => ({ ...current, [spot.id]: event.target.value }))}
                        />
                      </label>
                      <button type="button" disabled={saving === spot.id} onClick={() => void moderateSpot(spot, 'publish')}>
                        Publish
                      </button>
                      <button type="button" disabled={saving === spot.id} onClick={() => void moderateSpot(spot, 'keep_hidden')}>
                        Keep hidden
                      </button>
                      <button type="button" disabled={saving === spot.id} onClick={() => void moderateSpot(spot, 'remove')}>
                        Remove
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <AdminPagination page={flaggedPage} totalPages={flaggedTotalPages} totalItems={filteredFlagged.length} onPageChange={setFlaggedPage} />
          </>
        )
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Flag size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No reports match this filter.</p>
        </div>
      ) : (
        <>
          <div className="report-grid">
            {pagedReports.map((report) => {
            const spot = spotById.get(report.spot_id);
            return (
              <article key={report.id} className="stitch-card report-card">
                <div className="report-card-top">
                  <span className={`status-pill report-reason report-reason-${report.reason}`}>
                    {REASON_LABELS[report.reason]}
                  </span>
                  <span className={`status-pill status-${report.status === 'pending' ? 'pending' : report.status === 'reviewed' ? 'approved' : 'rejected'}`}>
                    {report.status}
                  </span>
                </div>
                <h3 className="report-spot">{spot ? spot.name : report.spot_id}</h3>
                <p className="report-location">
                  {spot ? `${spot.municipality} · ${spot.status.replace(/_/g, ' ')}` : 'Destination not in the current catalog view'}
                </p>
                {report.details ? <p className="report-details">{report.details}</p> : null}
                <div className="report-meta">
                  <span>Reported {new Date(report.created_at).toLocaleString()}</span>
                  {report.reporter_name ? <span>By {report.reporter_name}</span> : <span>Anonymous report</span>}
                </div>
                {report.status === 'pending' ? (
                  <div className="report-actions">
                    <label>
                      Resolution note
                      <textarea
                        aria-label={`Resolution note for report ${report.id}`}
                        value={notes[report.id] ?? ''}
                        maxLength={500}
                        onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))}
                      />
                    </label>
                    <button type="button" disabled={saving === report.id} onClick={() => void resolve(report, 'reviewed')}>
                      Mark reviewed
                    </button>
                    <button type="button" disabled={saving === report.id} onClick={() => void resolve(report, 'dismissed')}>
                      Dismiss
                    </button>
                  </div>
                ) : report.resolution_note ? (
                  <p className="report-resolution">
                    {report.resolution_note}
                    {report.resolved_at ? ` · ${new Date(report.resolved_at).toLocaleString()}` : ''}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
        <AdminPagination page={page} totalPages={totalPages} totalItems={filtered.length} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
