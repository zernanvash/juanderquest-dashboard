import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthError } from './api/client';

// JuanChoice perk controls: JuanderQuest platform staff only (area admins never see this).
// Switch a perk type off, change its amount, pause one live perk, and see who changed what.
type Unit = 'percent' | 'stamps' | 'fixed';
export type CatalogRow = {
  key: string; domain: string; anchor: boolean; default_standard: number; default_festival: number;
  bounds: { min: number; max: number; unit: Unit }; enabled: boolean; standard_value: number; festival_value: number;
  overridden: boolean; updated_by: string | null; updated_at: string | null; sample_label: string;
};
type LivePerk = {
  key: string; label: string; role: 'champion' | 'minister'; campaign_id: string; candidate_id: string; spot_id: string;
  municipality: string; suspension_id: string | null; paused_by_setting: boolean; effective_value: number;
};
type State = {
  catalog: CatalogRow[];
  reign: { campaign_id: string; theme: string; round_tier: string; reign_ends_at: string } | null;
  live: LivePerk[];
  audit: { action: string; target: Record<string, string>; reason: string; actor_id: string; created_at: string }[];
};

const PERK_NAMES: Record<string, string> = {
  spot_xp_boost: 'Quest XP at the winning spot', msme_partner_spotlight: 'Local partner spotlight',
  category_xp_boost: 'Category quest XP', corridor_trail_discount: 'Hiyas Trail unlock discount',
  trail_completion_bonus: 'Trail completion bonus', quiz_arcade_xp_boost: 'Quiz XP',
  daily_stamp_bonus: 'Daily bonus stamps', shop_cosmetic_discount: 'Shop banner & frame discount',
};
export const perkName = (key: string) => PERK_NAMES[key] ?? key.replace(/_/g, ' ');
const show = (value: number, unit: Unit) => (unit === 'percent' ? `${Math.round(value * 100)}%` : unit === 'stamps' ? `${value} stamps` : 'on');
const toInput = (value: number, unit: Unit) => (unit === 'percent' ? String(Math.round(value * 100)) : String(value));
const fromInput = (text: string, unit: Unit) => (unit === 'percent' ? Number(text) / 100 : Number(text));

const askReason = (what: string): string | null => {
  const text = window.prompt(`Reason for ${what} (at least 10 characters, saved in the audit log):`);
  if (text === null) return null;
  return text.trim().length >= 10 ? text.trim() : '';
};

/** Shared access check so the admin screen can also gate the manifesto editor. */
export function usePlatformStaff(token?: string | null) {
  const [platform, setPlatform] = useState(false);
  useEffect(() => {
    let active = true;
    apiFetch<{ platform: boolean }>('/juanchoice/admin/perk-controls/access', { token })
      .then(value => { if (active) setPlatform(Boolean(value?.platform)); })
      .catch(() => { if (active) setPlatform(false); });
    return () => { active = false; };
  }, [token]);
  return platform;
}

export function JuanChoicePerkControls({ token, onUnauthorized }: { token?: string | null; onUnauthorized?: () => void }) {
  const platform = usePlatformStaff(token);
  const [state, setState] = useState<State | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { standard: string; festival: string }>>({});
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);

  const call = useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    try { return await apiFetch<T>(`/juanchoice/admin/perk-controls${path}`, { ...init, token }); }
    catch (cause) {
      if (isAuthError(cause)) { onUnauthorized?.(); throw new Error('Administrator session expired.'); }
      throw cause;
    }
  }, [token, onUnauthorized]);

  const load = useCallback(async () => {
    try {
      const next = await call<State>('');
      setState(next);
      setDrafts(Object.fromEntries(next.catalog.map(row => [row.key, { standard: toInput(row.standard_value, row.bounds.unit), festival: toInput(row.festival_value, row.bounds.unit) }])));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Perk controls could not be loaded.'); }
  }, [call]);
  useEffect(() => { if (platform) void load(); }, [platform, load]);

  const act = async (label: string, run: (reason: string) => Promise<unknown>, what: string) => {
    if (busy) return;
    const reason = askReason(what);
    if (reason === null) return;
    if (!reason) { setError('The reason must be at least 10 characters.'); return; }
    setBusy(true); setError(''); setNotice('');
    try { await run(reason); await load(); setNotice(`${label} saved.`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `${label} failed.`); }
    finally { setBusy(false); }
  };

  if (!platform) return null;
  return (
    <section className="stitch-panel panel-section" aria-labelledby="jc-perk-controls-title">
      <h3 id="jc-perk-controls-title" className="jc-section-title">Perk controls <span className="status-pill status-pending">JuanderQuest staff only</span></h3>
      <p className="jc-sub">Changes apply to the reigning winners right away and to rounds prepared afterwards. Every change needs a reason and is logged. Rewards travelers already received stay theirs.</p>
      {error && <div className="load-error" role="alert">{error}</div>}
      {notice && <p role="status" className="jc-notice">{notice}</p>}
      {!state ? <p className="jc-meta">Loading perk controls…</p> : (
        <>
          <h4>Live this week {state.reign ? `· ${state.reign.theme} (until ${new Date(state.reign.reign_ends_at).toLocaleString()})` : ''}</h4>
          {state.live.length === 0 ? <p className="jc-meta">No perks are reigning right now.</p> : (
            <ul className="jc-list" aria-label="Live perks">
              {state.live.map(perk => {
                const status = perk.paused_by_setting ? 'Off everywhere' : perk.suspension_id ? 'Paused' : 'Live';
                return (
                  <li key={`${perk.candidate_id}:${perk.key}`} className="jc-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div>
                        <strong>{perk.label}</strong> · {perk.role === 'minister' ? 'Vice Champion' : 'Champion'} · {perk.municipality}
                        <p><span className={`status-pill ${status === 'Live' ? 'status-approved' : 'status-pending'}`}>{status}</span></p>
                      </div>
                      {!perk.paused_by_setting && (perk.suspension_id
                        ? <button type="button" className="button-approve" disabled={busy}
                            onClick={() => void act('Resume', reason => call(`/suspensions/${perk.suspension_id}/lift`, { method: 'POST', body: { reason } }), `resuming "${perk.label}"`)}>Resume</button>
                        : <button type="button" className="button-reject" disabled={busy}
                            onClick={() => void act('Pause', reason => call('/suspensions', { method: 'POST', body: { campaign_id: perk.campaign_id, candidate_id: perk.candidate_id, perk_key: perk.key, reason } }), `pausing "${perk.label}"`)}>Pause this perk</button>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <h4 style={{ marginTop: 16 }}>Perk settings</h4>
          <ul className="jc-list" aria-label="Perk settings">
            {state.catalog.map(row => {
              const unit = row.bounds.unit;
              const draft = drafts[row.key] ?? { standard: '', festival: '' };
              const min = unit === 'percent' ? Math.round(row.bounds.min * 100) : row.bounds.min;
              const max = unit === 'percent' ? Math.round(row.bounds.max * 100) : row.bounds.max;
              const save = () => {
                const standard = fromInput(draft.standard, unit); const festival = fromInput(draft.festival, unit);
                return act('Perk setting', reason => call(`/settings/${row.key}`, { method: 'PUT', body: { standard_value: standard, festival_value: festival, reason } }), `changing ${perkName(row.key)}`);
              };
              return (
                <li key={row.key} className="jc-item">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div>
                      <strong>{perkName(row.key)}</strong> <span className="jc-meta">· {row.sample_label}</span>
                      <p className="jc-meta">Default {show(row.default_standard, unit)} (festival {show(row.default_festival, unit)}){row.overridden && row.updated_at ? ` · changed ${new Date(row.updated_at).toLocaleString()}` : ''}</p>
                    </div>
                    <button type="button" className={row.enabled ? 'button-reject' : 'button-approve'} disabled={busy} aria-pressed={row.enabled}
                      onClick={() => void act(row.enabled ? 'Switch off' : 'Switch on', reason => call(`/settings/${row.key}`, { method: 'PUT', body: { enabled: !row.enabled, reason } }), `${row.enabled ? 'switching off' : 'switching on'} ${perkName(row.key)}`)}>
                      {row.enabled ? 'Switch off everywhere' : 'Switch back on'}
                    </button>
                  </div>
                  {unit !== 'fixed' && (
                    <div className="form-inline" style={{ marginTop: 6 }}>
                      <label>Normal ({unit === 'percent' ? '%' : 'stamps'})
                        <input type="number" min={min} max={max} value={draft.standard} aria-label={`${perkName(row.key)} normal value`}
                          onChange={event => setDrafts(all => ({ ...all, [row.key]: { ...draft, standard: event.target.value } }))} />
                      </label>
                      <label>Festival ({unit === 'percent' ? '%' : 'stamps'})
                        <input type="number" min={min} max={max} value={draft.festival} aria-label={`${perkName(row.key)} festival value`}
                          onChange={event => setDrafts(all => ({ ...all, [row.key]: { ...draft, festival: event.target.value } }))} />
                      </label>
                      <button type="button" className="button-muted" disabled={busy} onClick={() => void save()}>Save amounts</button>
                      {row.overridden && <button type="button" className="button-muted" disabled={busy}
                        onClick={() => void act('Reset', reason => call(`/settings/${row.key}`, { method: 'PUT', body: { standard_value: null, festival_value: null, reason } }), `resetting ${perkName(row.key)} to its default`)}>Reset to default</button>}
                      <span className="jc-meta">Allowed {min}–{max}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <h4 style={{ marginTop: 16 }}>Recent changes</h4>
          {state.audit.length === 0 ? <p className="jc-meta">No changes yet.</p> : (
            <ul className="jc-audit">
              {state.audit.map((entry, index) => (
                <li key={`${entry.created_at}-${index}`}>
                  <span className="jc-meta">{new Date(entry.created_at).toLocaleString()}</span> · {entry.action} · {perkName(entry.target?.perk_key ?? '')} — {entry.reason} <span className="jc-meta">({entry.actor_id})</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Platform staff: replace an upcoming contender's perks before voting opens. */
export function ManifestoEditor({ campaignId, candidateId, current, token, onSaved }: {
  campaignId: string; candidateId: string; current: string[]; token?: string | null; onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<string[]>(current);
  const [mystery, setMystery] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    const reason = askReason('editing this contender\'s perks');
    if (reason === null) return;
    if (!reason) { setError('The reason must be at least 10 characters.'); return; }
    setBusy(true); setError('');
    try {
      await apiFetch(`/juanchoice/admin/campaigns/${campaignId}/candidates/${candidateId}/manifesto`, { method: 'PUT', token, body: { perk_keys: keys, mystery_key: mystery || null, reason } });
      setOpen(false); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Saving perks failed.'); }
    finally { setBusy(false); }
  };
  if (!open) return <button type="button" className="button-muted" onClick={() => setOpen(true)}>Edit perks (staff)</button>;
  return (
    <div className="jc-item" style={{ marginTop: 8 }}>
      <p className="jc-meta">Pick 1–4 perks; the first is the anchor. Only before voting opens.</p>
      <div className="jc-chips" role="group" aria-label="Contender perks">
        {Object.keys(PERK_NAMES).map(key => (
          <label key={key} className="form-check">
            <input type="checkbox" checked={keys.includes(key)} disabled={!keys.includes(key) && keys.length >= 4}
              onChange={event => setKeys(list => event.target.checked ? [...list, key] : list.filter(item => item !== key))} /> {perkName(key)}
          </label>
        ))}
      </div>
      <label>Mystery perk
        <select value={mystery} onChange={event => setMystery(event.target.value)} aria-label="Mystery perk">
          <option value="">None</option>
          {keys.map(key => <option key={key} value={key}>{perkName(key)}</option>)}
        </select>
      </label>
      {error && <p className="load-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button-approve" disabled={busy || keys.length === 0} onClick={() => void save()}>Save perks</button>
        <button type="button" className="button-muted" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
