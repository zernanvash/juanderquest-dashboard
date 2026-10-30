import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthError } from './api/client';

// Plan 65: a weekly round whose Monday falls inside a festival becomes a Special Festival round
// with stronger perks. The table starts empty; admins add festivals here.
export type Festival = { id:string;name:string;municipality:string|null;starts_on:string;ends_on:string;boost_multiplier:number|string;is_test:boolean };

export function JuanChoiceFestivals({token,onUnauthorized}:{token?:string|null;onUnauthorized?:()=>void}) {
  const [items,setItems]=useState<Festival[]>([]);
  const [name,setName]=useState(''); const [municipality,setMunicipality]=useState('');
  const [startsOn,setStartsOn]=useState(''); const [endsOn,setEndsOn]=useState(''); const [isTest,setIsTest]=useState(false);
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

  const add=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(!startsOn||!endsOn||endsOn<startsOn){setError('The festival must end on or after its first day.');return;}
    setBusy(true);setError('');
    try {
      await call('',{method:'POST',body:{name:name.trim(),municipality:municipality.trim()||null,starts_on:startsOn,ends_on:endsOn,is_test:isTest}});
      setName('');setMunicipality('');setStartsOn('');setEndsOn('');
      await load();
    } catch (err) { setError(err instanceof Error?err.message:'Festival could not be saved.'); }
    finally { setBusy(false); }
  };
  const remove=async(festival:Festival)=>{
    if(!window.confirm(`Remove ${festival.name}? Rounds already scheduled keep their tier.`))return;
    setBusy(true);setError('');
    try { await call(`/${festival.id}`,{method:'DELETE'}); await load(); }
    catch (err) { setError(err instanceof Error?err.message:'Festival could not be removed.'); }
    finally { setBusy(false); }
  };

  return <div className="stitch-panel panel-section" aria-labelledby="jc-festivals-title">
    <h3 id="jc-festivals-title" className="jc-section-title">Festival calendar</h3>
    <p className="jc-sub">A weekly round that opens during a festival becomes a Special Festival election with stronger perks. Every 4th week is special too.</p>
    {error&&<div className="load-error" role="alert">{error}</div>}
    <form onSubmit={event=>void add(event)} className="form-grid">
      <label>Festival<input required minLength={2} value={name} onChange={event=>setName(event.target.value)} placeholder="Pista'y Dayat" /></label>
      <label>Town (optional)<input value={municipality} onChange={event=>setMunicipality(event.target.value)} placeholder="Lingayen" /></label>
      <label>First day<input required type="date" value={startsOn} onChange={event=>setStartsOn(event.target.value)} /></label>
      <label>Last day<input required type="date" value={endsOn} onChange={event=>setEndsOn(event.target.value)} /></label>
      <label className="form-check"><input type="checkbox" checked={isTest} onChange={event=>setIsTest(event.target.checked)} /> QA only</label>
      <div className="form-actions"><button type="submit" className="button-approve" disabled={busy}>Add festival</button></div>
    </form>
    {loading?<p className="jc-meta">Loading festivals…</p>:items.length===0?<p className="empty-state">No festivals yet. Only every 4th week is a special round.</p>:
      <ul className="jc-list" aria-label="Festivals">{items.map(festival=><li key={festival.id} className="jc-item">
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <div><strong>{festival.name}</strong>{festival.municipality?` · ${festival.municipality}`:''}{festival.is_test?' [QA]':''}
            <p>{festival.starts_on.slice(0,10)} → {festival.ends_on.slice(0,10)}</p></div>
          <button type="button" className="button-reject" disabled={busy} onClick={()=>void remove(festival)}>Remove</button>
        </div>
      </li>)}</ul>}
  </div>;
}
