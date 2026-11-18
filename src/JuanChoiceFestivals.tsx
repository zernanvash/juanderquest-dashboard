import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthError } from './api/client';
import { PrintReport } from './components/PrintReport';
import { downloadCsv } from './utils/csv';

// Plan 65: a weekly round whose Monday falls inside a festival becomes a Special Festival round
// with stronger perks. The table starts empty; admins add festivals here.
// Plan 94: festivals also show on the app's Almanac with exact dates; each one chooses whether it boosts voting.
export type Festival = { id:string;name:string;municipality:string|null;starts_on:string;ends_on:string;boost_multiplier:number|string;is_test:boolean;boosts_voting?:boolean };

export function JuanChoiceFestivals({token,onUnauthorized}:{token?:string|null;onUnauthorized?:()=>void}) {
  const [items,setItems]=useState<Festival[]>([]);
  const [name,setName]=useState(''); const [municipality,setMunicipality]=useState('');
  const [startsOn,setStartsOn]=useState(''); const [endsOn,setEndsOn]=useState(''); const [isTest,setIsTest]=useState(false);
  const [boostsVoting,setBoostsVoting]=useState(true); const [editingId,setEditingId]=useState<string|null>(null);
  const [error,setError]=useState(''); const [busy,setBusy]=useState(false); const [loading,setLoading]=useState(true);

  const call=useCallback(async<T,>(path:string,init:{method?:string;body?:unknown}={}):Promise<T>=>{
    try { return await apiFetch<T>(`/juanchoice/admin/festivals${path}`,{...init,token}); }
    catch (cause) {
      if (isAuthError(cause)) { onUnauthorized?.(); throw new Error('Administrator session expired.'); }
      throw cause;
    }
  },[token,onUnauthorized]);
  const load=useCallback(async()=>{
    setLoading(true);
    try { setItems(await call<Festival[]>('')); setError(''); }
    catch (err) { setError(err instanceof Error?err.message:'Festivals could not be loaded.'); }
    finally { setLoading(false); }
  },[call]);
  useEffect(()=>{void load();},[load]);

  const resetForm=()=>{setName('');setMunicipality('');setStartsOn('');setEndsOn('');setIsTest(false);setBoostsVoting(true);setEditingId(null);};
  const startEdit=(festival:Festival)=>{
    setEditingId(festival.id);setName(festival.name);setMunicipality(festival.municipality??'');
    setStartsOn(festival.starts_on.slice(0,10));setEndsOn(festival.ends_on.slice(0,10));
    setIsTest(festival.is_test);setBoostsVoting(festival.boosts_voting!==false);setError('');
  };
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!startsOn||!endsOn||endsOn<startsOn){setError('The festival must end on or after its first day.');return;}
    setBusy(true);setError('');
    const fields={name:name.trim(),municipality:municipality.trim()||null,starts_on:startsOn,ends_on:endsOn,boosts_voting:boostsVoting};
    try {
      if(editingId) await call(`/${editingId}`,{method:'PATCH',body:fields});
      else await call('',{method:'POST',body:{...fields,is_test:isTest}});
      resetForm();
      await load();
    } catch (err) { setError(err instanceof Error?err.message:'Festival could not be saved.'); }
    finally { setBusy(false); }
  };
  const remove=async(festival:Festival)=>{
    if(!window.confirm(`Remove ${festival.name}? Rounds already scheduled keep their tier.`))return;
    setBusy(true);setError('');
    try { await call(`/${festival.id}`,{method:'DELETE'}); if(editingId===festival.id)resetForm(); await load(); }
    catch (err) { setError(err instanceof Error?err.message:'Festival could not be removed.'); }
    finally { setBusy(false); }
  };

  return <div className="stitch-panel panel-section" aria-labelledby="jc-festivals-title">
    <div className="section-heading-row">
      <h3 id="jc-festivals-title" className="jc-section-title">Festival calendar</h3>
      <PrintReport
        title="Festival calendar"
        onExportCsv={() =>
          downloadCsv(
            'festival-calendar.csv',
            ['Name', 'Municipality', 'First day', 'Last day', 'Boosts voting', 'QA only'],
            items.map((f) => [f.name, f.municipality ?? '', f.starts_on.slice(0, 10), f.ends_on.slice(0, 10), f.boosts_voting === false ? 'no' : 'yes', f.is_test ? 'yes' : 'no']),
          )
        }
      />
    </div>
    <p className="jc-sub">Festivals show on the app's Almanac with their exact dates. With the boost switch on, a weekly round that opens during the festival also becomes a Special Festival election with stronger perks. Every 4th week is special too.</p>
    {error&&<div className="load-error" role="alert">{error}</div>}
    <form onSubmit={event=>void save(event)} className="form-grid" aria-label={editingId?'Edit festival':'Add festival'}>
      <label>Festival<input required minLength={2} value={name} onChange={event=>setName(event.target.value)} placeholder="Pista'y Dayat" /></label>
      <label>Town (optional)<input value={municipality} onChange={event=>setMunicipality(event.target.value)} placeholder="Lingayen" /></label>
      <label>First day<input required type="date" value={startsOn} onChange={event=>setStartsOn(event.target.value)} /></label>
      <label>Last day<input required type="date" value={endsOn} onChange={event=>setEndsOn(event.target.value)} /></label>
      <label className="form-check"><input type="checkbox" checked={boostsVoting} onChange={event=>setBoostsVoting(event.target.checked)} /> Boost JuanChoice voting that week</label>
      <label className="form-check"><input type="checkbox" checked={isTest} disabled={Boolean(editingId)} onChange={event=>setIsTest(event.target.checked)} /> QA only</label>
      <div className="form-actions">
        <button type="submit" className="button-approve" disabled={busy}>{editingId?'Save changes':'Add festival'}</button>
        {editingId&&<button type="button" className="button button-secondary" disabled={busy} onClick={resetForm}>Cancel edit</button>}
      </div>
    </form>
    {loading?<p className="jc-meta">Loading festivals…</p>:items.length===0?<p className="empty-state">No festivals yet. Only every 4th week is a special round.</p>:
      <ul className="jc-list" aria-label="Festivals">{items.map(festival=><li key={festival.id} className="jc-item">
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <div><strong>{festival.name}</strong>{festival.municipality?` · ${festival.municipality}`:''}{festival.is_test?' [QA]':''}
            <p>{festival.starts_on.slice(0,10)} → {festival.ends_on.slice(0,10)} · {festival.boosts_voting===false?'Calendar only':'Boosts voting'}</p></div>
          <div className="form-actions">
            <button type="button" className="button button-secondary" disabled={busy} onClick={()=>startEdit(festival)}>Edit</button>
            <button type="button" className="button-reject" disabled={busy} onClick={()=>void remove(festival)}>Remove</button>
          </div>
        </div>
      </li>)}</ul>}
  </div>;
}
