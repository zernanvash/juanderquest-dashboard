import { useCallback, useEffect, useState } from 'react';
import { apiFetch, isAuthError } from './api/client';

type Schedule = {id:string;schedule_key:string;region_key:string;display_region:string;enabled:boolean;
  effective_period:string;is_test:boolean;latest_period?:string|null;latest_status?:string|null;reason_code?:string|null};
const themes = [
  {name:'Nature and coast',categories:['nature_outdoors']},
  {name:'Culture and heritage',categories:['culture_heritage']},
  {name:'Local activities',categories:['activities_wellness']},
];
const initialMonth = () => {
  const now=new Date();const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit'}).formatToParts(now);
  const year=Number(parts.find(part=>part.type==='year')?.value);
  const month=Number(parts.find(part=>part.type==='month')?.value);
  return month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`;
};

export function MonthlyScheduleAdmin({token,onUnauthorized}:{token?:string|null;onUnauthorized?:()=>void}) {
  const [items,setItems]=useState<Schedule[]>([]);
  const [period,setPeriod]=useState(initialMonth);
  const [isTest,setIsTest]=useState(true);
  const [error,setError]=useState('');const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const call=useCallback(async(path:string,init:{method?:string;body?:unknown}={}):Promise<any>=>{
    try {
      return await apiFetch(`/juanchoice/admin/schedules${path}`, { ...init, token });
    } catch (cause) {
      if (isAuthError(cause)) { onUnauthorized?.(); throw new Error('Administrator session expired.'); }
      throw cause;
    }
  },[token,onUnauthorized]);
  const refresh=useCallback(async()=>{
    setLoading(true);
    try{const result=await call('');setItems(result.items);setError('');return true;}
    catch(cause){setError(cause instanceof Error?cause.message:'Unable to load schedules.');return false;}
    finally{setLoading(false);}
  },[call]);
  useEffect(()=>{void refresh();},[refresh]);
  const perform=async(action:()=>Promise<unknown>,message:string)=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{await action();if(await refresh())setNotice(message);}
    catch(cause){setError(cause instanceof Error?cause.message:'Schedule action failed.');}
    finally{setBusy(false);}
  };
  const create=()=>void perform(()=>call('',{method:'POST',body:{
    schedule_key:'pangasinan-monthly',region_key:'pangasinan',display_region:'Pangasinan',timezone:'Asia/Manila',
    enabled:false,effective_period:period,preparation_lead_days:7,minimum_candidates:2,target_candidates:4,
    maximum_candidates:6,themes,policy_version:'juanchoice-monthly-v1',is_test:isTest,
  }}),'Schedule saved. Enable it when ready to prepare rounds.');
  const reconcile=()=>void perform(async()=>{
    const result=await call('/reconcile',{method:'POST'});
    if(result.failed>0)throw new Error(`${result.failed} schedule(s) failed reconciliation. Review the scheduler logs before retrying.`);
  },'Scheduler checked due periods.');
  return <section className="stitch-panel panel-section" aria-labelledby="monthly-schedule-heading">
    <h3 id="monthly-schedule-heading" className="jc-section-title">Automatic monthly rounds</h3>
    <p className="jc-sub">Voting opens on the 1st and closes on the 8th at midnight Philippine time. The scheduler prepares eligible destinations seven days early. Ballot writes are controlled separately.</p>
    {error&&<p role="alert" className="load-error">{error} <button type="button" onClick={()=>void refresh()}>Retry</button></p>}
    {notice&&<p role="status" className="jc-notice">{notice}</p>}
    <div className="form-inline">
      <label>First month (day 1)<input type="date" value={period} onChange={event=>setPeriod(event.target.value)} /></label>
      <label className="form-check"><input type="checkbox" checked={isTest} onChange={event=>setIsTest(event.target.checked)} /> Synthetic QA schedule</label>
      <div className="form-actions">
        <button type="button" className="button-approve" disabled={busy||!/^\d{4}-\d{2}-01$/.test(period)} onClick={create}>Create schedule</button>
        <button type="button" className="button-muted" disabled={busy} onClick={reconcile}>Check due periods</button>
      </div>
    </div>
    {loading&&<p role="status" className="jc-meta">Loading schedules…</p>}
    {items.length===0?(!loading&&!error&&<p className="empty-state" style={{marginTop:14}}>No monthly schedule exists yet.</p>):<ul className="jc-list">{items.map(item=><li key={item.id} className="jc-item">
      <div>
        <strong>{item.display_region} · {item.is_test?'Synthetic QA':'Public'}</strong>{' '}
        <span className={`status-pill ${item.enabled?'status-approved':'status-pending'}`}>{item.enabled?'Enabled':'Paused'}</span>
        <p>First month: {String(item.effective_period).slice(0,10)} · Latest period: {item.latest_period?`${String(item.latest_period).slice(0,10)} (${item.latest_status})`:'not prepared'}{item.reason_code?` · ${item.reason_code}`:''}</p>
      </div>
      <button type="button" className="button-muted" disabled={busy} onClick={()=>void perform(()=>call(`/${item.id}`,{method:'PATCH',body:{
        enabled:!item.enabled,reason:'Operator changed monthly schedule availability',
      }}),item.enabled?'Schedule paused.':'Schedule enabled.')}>{item.enabled?'Pause schedule':'Enable schedule'}</button>
    </li>)}</ul>}
  </section>;
}
