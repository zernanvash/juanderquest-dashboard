import { useCallback, useEffect, useState } from 'react';

type Campaign = { id:string;slug:string;region:string;theme:string;status:string;opens_at:string;closes_at:string;is_test:boolean;candidate_count:number;ballot_count:number };
type Candidate = { id:string;spot_id:string;spot_name:string;municipality:string;status:'eligible'|'suspended';spot_status:string;crowd_capacity_band:string;recommendation_suppressed:boolean;votes:number };
type Detail = {campaign:Campaign;candidates:Candidate[];audit:{action:string;reason:string|null;created_at:string}[];result:{valid_ballots:number;co_winner_ids:string[]}|null};
type Spot = {id:string;name:string;municipality:string;status:string;recommendation_suppressed?:boolean;is_test?:boolean};
const base='/api/v1/juanchoice/admin';

export function JuanChoiceAdmin({token,onUnauthorized}:{token:string;onUnauthorized:()=>void}) {
  const [items,setItems]=useState<Campaign[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<Detail|null>(null);
  const [spots,setSpots]=useState<Spot[]>([]);
  const [spotId,setSpotId]=useState('');
  const [slug,setSlug]=useState(''); const [theme,setTheme]=useState(''); const [region,setRegion]=useState('Pangasinan');
  const [opensAt,setOpensAt]=useState(''); const [closesAt,setClosesAt]=useState(''); const [isTest,setIsTest]=useState(true);
  const [reason,setReason]=useState('');
  const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);

  const call=useCallback(async(path:string,init:RequestInit={})=>{
    const response=await fetch(`${base}${path}`,{...init,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(init.headers||{})}});
    const data=await response.json().catch(()=>({}));
    if(response.status===401||response.status===403){onUnauthorized();throw new Error('Administrator session expired.');}
    if(!response.ok||!data.success)throw new Error(data.error?.message||data.error?.code||'Request failed.');
    return data.data;
  },[token,onUnauthorized]);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const result=await call('/campaigns');setItems(result.items);setSelected(current=>current??result.items[0]?.id??null);}
    catch(err){setError(err instanceof Error?err.message:'Campaigns could not be loaded.');}
    finally{setLoading(false);}
  },[call]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!selected){setDetail(null);return;}
    let active=true;
    void call(`/campaigns/${selected}`).then(value=>{if(active)setDetail(value);}).catch(err=>{if(active)setError(err instanceof Error?err.message:'Unable to load campaign.');});
    return()=>{active=false;};
  },[selected,call]);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/v1/admin/spots',{signal:controller.signal,headers:{Authorization:`Bearer ${token}`}}).then(response=>response.json()).then(data=>{if(!controller.signal.aborted&&data.success)setSpots(data.data);}).catch(()=>{});
    return()=>controller.abort();
  },[token]);
  const refresh=async(id?:string)=>{
    const result=await call('/campaigns');setItems(result.items);
    const target=id??selected??result.items[0]?.id;
    if(target){setSelected(target);setDetail(await call(`/campaigns/${target}`));}
  };
  const mutate=async(label:string,path:string,body?:unknown,method='POST')=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{const result=await call(path,{method,body:body===undefined?undefined:JSON.stringify(body)});await refresh(result?.id??selected??undefined);setNotice(`${label} saved.`);}
    catch(err){setError(err instanceof Error?err.message:`${label} failed.`);}
    finally{setBusy(false);}
  };
  const create=(event:React.FormEvent)=>{
    event.preventDefault();
    if(!opensAt||!closesAt||new Date(closesAt)<=new Date(opensAt)){setError('Choose a closing time later than the opening time.');return;}
    void mutate('Draft', '/campaigns',{slug,theme,region,opens_at:new Date(opensAt).toISOString(),closes_at:new Date(closesAt).toISOString(),is_test:isTest});
  };
  const availableSpots=spots.filter(spot=>spot.status==='published'&&!spot.recommendation_suppressed&&Boolean(spot.is_test)===Boolean(detail?.campaign.is_test));
  const canEdit=detail&&['draft','scheduled','voting'].includes(detail.campaign.status);

  return <section aria-labelledby="juanchoice-admin-title" style={{display:'grid',gap:18}}>
    <div className="stitch-panel" style={{padding:24}}><h2 id="juanchoice-admin-title" style={{fontSize:24,fontWeight:800,color:'#582f0e'}}>JuanChoice · promotional voting</h2>
      <p style={{fontSize:13,color:'#514532',marginTop:8}}>Free destination spotlight voting only. Civic XP and stamps are nonspendable; governance and mJDQ are separate.</p>
      <p style={{fontSize:12,color:'#7d5800',marginTop:8}}>QA drafts stay isolated from public discovery. A winning destination is never auto-promoted; review capacity and safety before any spotlight.</p></div>
    {error&&<div className="load-error" role="alert">{error} <button type="button" onClick={()=>void load()}>Retry list</button></div>}
    {notice&&<p role="status" style={{color:'#2d6a4f',fontWeight:700}}>{notice}</p>}
    <div className="stitch-panel" style={{padding:24}}><h3 style={{fontWeight:800,marginBottom:12}}>Create a draft round</h3>
      <form onSubmit={create} style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12}}>
        <label>Slug<input required value={slug} onChange={event=>setSlug(event.target.value)} pattern="[a-z0-9-]+" placeholder="hidden-gems-week-1" /></label>
        <label>Theme<input required value={theme} onChange={event=>setTheme(event.target.value)} placeholder="Hidden gems" /></label>
        <label>Region<input required value={region} onChange={event=>setRegion(event.target.value)} /></label>
        <label>Opens (local time)<input required type="datetime-local" value={opensAt} onChange={event=>setOpensAt(event.target.value)} /></label>
        <label>Closes (local time)<input required type="datetime-local" value={closesAt} onChange={event=>setClosesAt(event.target.value)} /></label>
        <label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={isTest} onChange={event=>setIsTest(event.target.checked)} /> Synthetic QA round</label>
        <button type="submit" disabled={busy} style={{background:'#3f6653',color:'#fff',borderRadius:10,padding:'10px 16px',fontWeight:700}}>Create draft</button>
      </form></div>
    <div className="stitch-panel" style={{padding:24}}><h3 style={{fontWeight:800,marginBottom:12}}>Campaigns</h3>
      {loading?<p>Loading campaigns…</p>:items.length===0?<p>No campaign exists yet.</p>:<div style={{display:'flex',flexWrap:'wrap',gap:8}}>{items.map(item=><button key={item.id} type="button" onClick={()=>setSelected(item.id)} aria-pressed={selected===item.id} style={{padding:'9px 12px',borderRadius:12,background:selected===item.id?'#3f6653':'#efeeea',color:selected===item.id?'white':'#514532',fontWeight:700}}>{item.theme} · {item.status} {item.is_test?'[QA]':''} · {item.ballot_count} ballots</button>)}</div>}</div>
    {detail&&<div className="stitch-panel" style={{padding:24,display:'grid',gap:16}}><div><h3 style={{fontSize:20,fontWeight:800}}>{detail.campaign.theme}</h3><p>{detail.campaign.region} · {detail.campaign.status} · {detail.campaign.is_test?'QA only':'Public'} · {detail.campaign.ballot_count} ballots</p><p style={{fontSize:12}}>Opens {new Date(detail.campaign.opens_at).toLocaleString()} · closes {new Date(detail.campaign.closes_at).toLocaleString()}</p></div>
      {detail.campaign.status==='draft'&&<div><h4 style={{fontWeight:700}}>Nominate a published, unsuppressed destination</h4><div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}><select value={spotId} onChange={event=>setSpotId(event.target.value)} aria-label="Candidate destination"><option value="">Choose a spot</option>{availableSpots.map(spot=><option key={spot.id} value={spot.id}>{spot.name} · {spot.municipality}</option>)}</select><button disabled={!spotId||busy} onClick={()=>void mutate('Candidate',`/campaigns/${detail.campaign.id}/candidates`,{spot_id:spotId})}>Add candidate</button></div></div>}
      <div><h4 style={{fontWeight:700}}>Candidates and provisional ballots</h4><p style={{fontSize:12}}>Live counts can change during moderation; only the final result reports valid ballots.</p>{detail.candidates.length===0?<p>No candidates yet.</p>:<div style={{display:'grid',gap:8,marginTop:8}}>{detail.candidates.map(candidate=><div key={candidate.id} style={{border:'1px solid #e3dfd5',borderRadius:12,padding:12,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><div><strong>{candidate.spot_name}</strong> · {candidate.municipality}<p style={{fontSize:12}}>{candidate.votes} provisional ballots · {candidate.status} · capacity {candidate.crowd_capacity_band}{candidate.recommendation_suppressed?' · suppressed':''}</p></div>{canEdit&&<button disabled={busy} onClick={()=>{const next=candidate.status==='eligible'?'suspended':'eligible';const text=window.prompt(`Reason for marking ${candidate.spot_name} ${next}:`);if(text&&text.trim().length>=10)void mutate('Moderation',`/campaigns/${detail.campaign.id}/candidates/${candidate.id}`,{status:next,reason:text.trim()},'PATCH');else if(text)setError('Moderation reason must contain at least 10 characters.');}}>{candidate.status==='eligible'?'Suspend':'Restore'}</button>}</div>)}</div>}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8}}>{detail.campaign.status==='draft'&&<button disabled={busy||detail.candidates.filter(item=>item.status==='eligible').length===0} onClick={()=>{if(window.confirm('Publish this round? Verify candidate safety and capacity first.'))void mutate('Publication',`/campaigns/${detail.campaign.id}/publish`);}}>Publish round</button>}{['draft','scheduled','voting','closed'].includes(detail.campaign.status)&&<button disabled={busy} onClick={()=>{const text=window.prompt('Cancellation reason (at least 10 characters):');if(text&&text.trim().length>=10)void mutate('Cancellation',`/campaigns/${detail.campaign.id}/cancel`,{reason:text.trim()});else if(text)setError('Cancellation reason must contain at least 10 characters.');}}>Cancel round</button>}{['scheduled','voting','closed'].includes(detail.campaign.status)&&<button disabled={busy||Date.now()<Date.parse(detail.campaign.closes_at)} onClick={()=>void mutate('Finalization',`/campaigns/${detail.campaign.id}/finalize`)}>Finalize closed round</button>}</div>
      {detail.result&&<p style={{fontWeight:700}}>Final: {detail.result.valid_ballots} valid ballots · {detail.result.co_winner_ids.length} co-winner(s). No automatic spotlight.</p>}
      <div><h4 style={{fontWeight:700}}>Audit</h4>{detail.audit.length===0?<p>No actions recorded yet.</p>:<ul>{detail.audit.map((entry,index)=><li key={`${entry.created_at}-${index}`} style={{fontSize:12,marginTop:5}}>{new Date(entry.created_at).toLocaleString()} · {entry.action}{entry.reason?` — ${entry.reason}`:''}</li>)}</ul>}</div>
    </div>}
  </section>;
}
