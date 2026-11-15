import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flag } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { useRouter } from '../router';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Spot, SpotReport } from '../types';

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'dismissed';

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

export function SpotReportsPage() {
  const { query, navigate } = useRouter();
  const selectedAreaId = useSelectedAreaId();
  const statusFilter = parseStatus(query.get('status'));
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const [reports, setReports] = useState<SpotReport[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const [reportData, spotData] = await Promise.all([
        apiFetch<SpotReport[]>(withArea('/admin/spot-reports', selectedAreaId), { signal }),
        apiFetch<Spot[]>(withArea('/admin/spots', selectedAreaId), { signal }),
      ]);
      setReports(reportData);
      setSpots(spotData);
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

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const spotById = useMemo(() => new Map(spots.map((spot) => [spot.id, spot])), [spots]);
  const filtered = reports.filter((report) => statusFilter === 'all' || report.status === statusFilter);

  return (
    <div>
      <PageHeader
        title="Destination reports"
        description="Traveler-submitted destination reports. Mark each one reviewed or dismissed with a short note; every decision is audited. Use the Destinations page to unpublish or suppress a destination."
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

      {loading ? (
        <div className="stitch-panel loading-panel">Loading destination reports…</div>
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Flag size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No reports match this filter.</p>
        </div>
      ) : (
        <div className="report-grid">
          {filtered.map((report) => {
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
      )}
    </div>
  );
}
