import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { useSelectedAreaId } from '../auth';
import { withArea } from '../utils/areaQuery';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';

/** Plan 107: Suki Cards (merchant loyalty) for LGU / platform admins. */
export interface SukiProgramRow {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'paused';
  paused_by: 'merchant' | 'admin' | null;
  pause_reason: string | null;
  mode: 'standee' | 'staff_scan';
  visits_required: number;
  reward_text: string;
  merchant_id: string;
  merchant_name: string;
  municipality: string | null;
  cards: number;
  visits_30d: number;
  flagged: number;
}

export interface SukiTownRow {
  town: string;
  week: string;
  visits: number;
  shops: number;
  unique_customers: number;
}

export function SukiCardsPage() {
  const selectedAreaId = useSelectedAreaId();
  const [programs, setPrograms] = useState<SukiProgramRow[]>([]);
  const [towns, setTowns] = useState<SukiTownRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        setError('');
        const [programData, townData] = await Promise.all([
          apiFetch<{ items: SukiProgramRow[] }>(withArea('/admin/suki/programs', selectedAreaId), { signal }),
          apiFetch<{ items: SukiTownRow[] }>(withArea('/admin/suki/towns?weeks=8', selectedAreaId), { signal }),
        ]);
        setPrograms(programData.items);
        setTowns(townData.items);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(describeError(cause, 'Unable to load Suki Cards.'));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedAreaId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const setPaused = async (program: SukiProgramRow, paused: boolean) => {
    const reason = (reasons[program.id] ?? '').trim();
    if (paused && reason.length < 3) {
      setActionError('Write a reason of at least 3 characters before pausing a Suki Card.');
      return;
    }
    setSaving(program.id);
    setActionError('');
    try {
      await apiFetch(`/admin/suki/programs/${program.id}/${paused ? 'pause' : 'resume'}`, {
        method: 'POST',
        body: paused ? { reason } : {},
      });
      await load();
    } catch (cause) {
      setActionError(describeError(cause, 'Unable to update this Suki Card.'));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Suki Cards"
        description="Merchant loyalty cards in your area. Visits are recorded at the shop (GPS standee or staff scan); rewards are given in kind by the shop, never in points. Pause a card you suspect of fake visits; every pause is audited."
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

      {loading ? (
        <div className="stitch-panel loading-panel">Loading Suki Cards…</div>
      ) : (
        <>
          <section className="stitch-panel">
            <h2>Cards</h2>
            {programs.length === 0 ? (
              <p className="page-state-title">No Suki Cards in this area yet.</p>
            ) : (
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Shop</th>
                    <th>Town</th>
                    <th>Card</th>
                    <th>Status</th>
                    <th>Cards</th>
                    <th>Visits (30 d)</th>
                    <th>Flagged</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {programs.map((program) => (
                    <tr key={program.id}>
                      <td>{program.merchant_name}</td>
                      <td>{program.municipality ?? '—'}</td>
                      <td>
                        {program.title}: {program.visits_required} visits → {program.reward_text}
                        <br />
                        <small>{program.mode === 'staff_scan' ? 'Staff scan' : 'Counter standee'}</small>
                      </td>
                      <td>
                        <span className={`status-pill status-${program.status === 'active' ? 'approved' : 'pending'}`}>
                          {program.status}
                          {program.paused_by ? ` by ${program.paused_by}` : ''}
                        </span>
                        {program.pause_reason ? <div><small>{program.pause_reason}</small></div> : null}
                      </td>
                      <td>{program.cards}</td>
                      <td>{program.visits_30d}</td>
                      <td>{program.flagged}</td>
                      <td>
                        {program.paused_by === 'admin' ? (
                          <button type="button" className="button-approve" disabled={saving === program.id} onClick={() => void setPaused(program, false)}>
                            Resume
                          </button>
                        ) : program.status === 'active' ? (
                          <div className="form-inline">
                            <label className="settings-field">
                              Reason
                              <input
                                aria-label={`Pause reason for ${program.merchant_name}`}
                                placeholder="Reason"
                                maxLength={300}
                                value={reasons[program.id] ?? ''}
                                onChange={(event) => setReasons((current) => ({ ...current, [program.id]: event.target.value }))}
                              />
                            </label>
                            <button type="button" className="button-reject" disabled={saving === program.id} onClick={() => void setPaused(program, true)}>
                              Pause
                            </button>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>

          <section className="stitch-panel">
            <h2>Visits by town (last 8 weeks)</h2>
            {towns.length === 0 ? (
              <p className="page-state-title">No Suki visits yet.</p>
            ) : (
              <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Week of</th>
                    <th>Town</th>
                    <th>Visits</th>
                    <th>Shops</th>
                    <th>Customers</th>
                  </tr>
                </thead>
                <tbody>
                  {towns.map((row) => (
                    <tr key={`${row.week}-${row.town}`}>
                      <td>{row.week}</td>
                      <td>{row.town}</td>
                      <td>{row.visits}</td>
                      <td>{row.shops}</td>
                      <td>{row.unique_customers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
