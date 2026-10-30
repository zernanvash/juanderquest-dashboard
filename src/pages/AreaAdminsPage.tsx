import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client';

const POWERS = ['destinations', 'quests_quizzes', 'merchants_vouchers', 'analytics'] as const;
type Power = typeof POWERS[number];
interface Area { id: string; display_name: string; parent_id: string | null; level: string }
interface Assignment { id: string; user_id: string; display_name: string; email?: string; area_id: string; area_name: string; powers: Power[]; revoked_at: string | null }
interface Audit { id: string; actor_id: string; action: string; subject_id: string; created_at: string }

export function AreaAdminsPage() {
  const [areas, setAreas] = useState<Area[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [userId, setUserId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [powers, setPowers] = useState<Power[]>([...POWERS]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [areaData, adminData] = await Promise.all([
      apiFetch<Area[]>('/admin/area-admins/areas'),
      apiFetch<{ assignments: Assignment[]; audit: Audit[] }>('/admin/area-admins'),
    ]);
    setAreas(areaData); setAssignments(adminData.assignments); setAudit(adminData.audit);
    if (!areaId && areaData.length) setAreaId(areaData[0].id);
  };
  useEffect(() => { void load().catch((cause) => setError(cause.message || 'Could not load area administrators.')); }, []);

  const grant = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await apiFetch('/admin/area-admins', { method: 'POST', body: { user_id: userId.trim(), area_id: areaId, powers } }); setUserId(''); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Grant failed.'); }
    finally { setBusy(false); }
  };
  const savePowers = async (assignment: Assignment, next: Power[]) => {
    setError('');
    try { await apiFetch(`/admin/area-admins/${assignment.id}`, { method: 'PATCH', body: { powers: next } }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Update failed.'); }
  };
  const revoke = async (assignment: Assignment) => {
    setError('');
    try { await apiFetch(`/admin/area-admins/${assignment.id}`, { method: 'DELETE' }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Revoke failed.'); }
  };

  return <section className="page-stack">
    <header className="page-heading"><div><p className="eyebrow">Platform access</p><h1>Area admins</h1><p>Grant LGU staff access to selected administrative areas and controls.</p></div></header>
    {error ? <p className="notice notice-error" role="alert">{error}</p> : null}
    <form className="stitch-panel page-stack" onSubmit={(event) => void grant(event)}>
      <h2>Grant an area assignment</h2>
      <label>User ID<input required value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Existing user ID" /></label>
      <label>Area<select value={areaId} onChange={(event) => setAreaId(event.target.value)}>{areas.map((area) => <option key={area.id} value={area.id}>{area.display_name} · {area.level}</option>)}</select></label>
      <fieldset><legend>Permissions</legend>{POWERS.map((power) => <label key={power}><input type="checkbox" checked={powers.includes(power)} onChange={(event) => setPowers((current) => event.target.checked ? [...current, power] : current.filter((value) => value !== power))} /> {power.replace(/_/g, ' ')}</label>)}</fieldset>
      <button type="submit" disabled={busy || !userId.trim() || !areaId || !powers.length}>{busy ? 'Saving…' : 'Grant access'}</button>
    </form>
    <section className="stitch-panel"><h2>Assignments</h2><div className="table-scroll"><table><thead><tr><th>User</th><th>Area</th><th>Permissions</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {assignments.map((assignment) => <tr key={assignment.id}><td>{assignment.display_name}<small>{assignment.email || assignment.user_id}</small></td><td>{assignment.area_name}</td><td><div className="page-stack">{POWERS.map((power) => <label key={power}><input type="checkbox" checked={assignment.powers.includes(power)} disabled={Boolean(assignment.revoked_at)} onChange={(event) => void savePowers(assignment, event.target.checked ? [...assignment.powers, power] : assignment.powers.filter((item) => item !== power))} /> {power.replace(/_/g, ' ')}</label>)}</div></td><td>{assignment.revoked_at ? 'Revoked' : 'Active'}</td><td>{!assignment.revoked_at ? <button type="button" onClick={() => void revoke(assignment)}>Revoke</button> : '—'}</td></tr>)}
      {!assignments.length ? <tr><td colSpan={5}>No area assignments.</td></tr> : null}
    </tbody></table></div></section>
    <section className="stitch-panel"><h2>Recent administrator audit</h2><ul>{audit.map((entry) => <li key={entry.id}>{entry.action} · {entry.subject_id} · {new Date(entry.created_at).toLocaleString()}</li>)}</ul></section>
  </section>;
}
