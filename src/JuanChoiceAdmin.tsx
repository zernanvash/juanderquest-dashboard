import { useCallback, useEffect, useState } from 'react';
import { MonthlyScheduleAdmin } from './MonthlyScheduleAdmin';
import { JuanChoicePromotionReview } from './JuanChoicePromotionReview';
import { JuanChoiceFestivals } from './JuanChoiceFestivals';
import { apiFetch, isAuthError } from './api/client';

type Campaign = { id:string;slug:string;region:string;theme:string;status:string;opens_at:string;closes_at:string;is_test:boolean;candidate_count:number;ballot_count:number;
  policy_version?:string;round_tier?:'standard'|'special_festival';festival_name?:string|null;weighted_votes?:number;boost_points?:number };
type Perk = { key?:string;label?:string;is_mystery?:boolean;revealed?:boolean;is_anchor?:boolean;role?:string;candidate_id?:string };
type Candidate = { id:string;spot_id:string;spot_name:string;municipality:string;status:'eligible'|'suspended';spot_status:string;crowd_capacity_band:string;recommendation_suppressed:boolean;votes:number;
  weighted_votes?:number;boost_points?:number;manifesto_perks?:Perk[]|null;prior_loss_streak?:number };
type Detail = {campaign:Campaign;candidates:Candidate[];audit:{action:string;reason:string|null;created_at:string}[];result:{valid_ballots:number;co_winner_ids:string[];
  minister_candidate_id?:string|null;active_perks?:Perk[]|null;total_weighted_votes?:number|null;total_boost_points?:number|null}|null};
// Plan 65 weekly rounds: admins see every perk, including the masked mystery one.
const perkText=(perk:Perk)=>`${perk.label??perk.key??'perk'}${perk.is_mystery?' (mystery)':''}${perk.is_anchor?' · anchor':''}`;
type Spot = {id:string;name:string;municipality:string;status:string;recommendation_suppressed?:boolean;is_test?:boolean};

export function JuanChoiceAdmin({token,onUnauthorized}:{token?:string|null;onUnauthorized?:()=>void}) {
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

  const call=useCallback(async(path:string,init:{method?:string;body?:unknown}={}):Promise<any>=>{
    try {
      return await apiFetch(`/juanchoice/admin${path}`,{...init,token});
    } catch (cause) {
      if (isAuthError(cause)) { onUnauthorized?.(); throw new Error('Administrator session expired.'); }
      throw cause;
    }
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
    void apiFetch<Spot[]>('/admin/spots',{signal:controller.signal,token}).then(data=>{if(!controller.signal.aborted)setSpots(data);}).catch(()=>{});
    return()=>controller.abort();
  },[token]);
  const refresh=async(id?:string)=>{
    const result=await call('/campaigns');setItems(result.items);
    const target=id??selected??result.items[0]?.id;
    if(target){setSelected(target);setDetail(await call(`/campaigns/${target}`));}
  };
  const mutate=async(label:string,path:string,body?:unknown,method='POST')=>{
    if(busy)return;setBusy(true);setError('');setNotice('');
    try{const result=await call(path,{method,body});await refresh(result?.id??selected??undefined);setNotice(`${label} saved.`);}
    catch(err){setError(err instanceof Error?err.message:`${label} failed.`);}
    finally{setBusy(false);}
  };
  const create=(event:React.FormEvent)=>{
    event.preventDefault();
    if(!opensAt||!closesAt||new Date(closesAt)<=new Date(opensAt)){setError('Choose a closing time later than the opening time.');return;}
    void mutate('Draft', '/campaigns',{slug,theme,region,opens_at:new Date(opensAt).toISOString(),closes_at:new Date(closesAt).toISOString(),is_test:isTest});
  };
  const availableSpots=spots.filter(spot=>spot.status==='published'&&!spot.recommendation_suppressed&&Boolean(spot.is_test)===Boolean(detail?.campaign.is_test));
  const weekly=detail?.campaign.policy_version==='juanchoice-weekly-v1';
  const nameOf=(candidateId:string)=>detail?.candidates.find(item=>item.id===candidateId)?.spot_name??candidateId;
  const canEdit=detail&&['draft','scheduled','voting'].includes(detail.campaign.status);

  return <section aria-labelledby="juanchoice-admin-title" className="jc-stack">
    <h2 id="juanchoice-admin-title" className="sr-only">JuanChoice · promotional voting</h2>
    <div className="jc-policy">
      <div>
        <strong>Free destination spotlight voting only</strong>
        Civic XP and stamps are nonspendable; governance and mJDQ are separate. QA drafts stay isolated from public discovery. Reviewed winners can receive a spotlight while crowd and safety gates pass; a later restriction immediately hides it.
      </div>
    </div>
    <MonthlyScheduleAdmin token={token} onUnauthorized={onUnauthorized} />
    <JuanChoiceFestivals token={token} onUnauthorized={onUnauthorized} />
    {error&&<div className="load-error" role="alert">{error} <button type="button" onClick={()=>void load()}>Retry list</button></div>}
    {notice&&<p role="status" className="jc-notice">{notice}</p>}
    <div className="stitch-panel panel-section"><h3 className="jc-section-title">Create a draft round</h3>
      <p className="jc-sub">Draft rounds are invisible to travelers until published. Times are in your local time zone.</p>
      <form onSubmit={create} className="form-grid">
        <label>Slug<input required value={slug} onChange={event=>setSlug(event.target.value)} pattern="[a-z0-9-]+" placeholder="hidden-gems-week-1" /></label>
        <label>Theme<input required value={theme} onChange={event=>setTheme(event.target.value)} placeholder="Hidden gems" /></label>
        <label>Region<input required value={region} onChange={event=>setRegion(event.target.value)} /></label>
        <label>Opens (local time)<input required type="datetime-local" value={opensAt} onChange={event=>setOpensAt(event.target.value)} /></label>
        <label>Closes (local time)<input required type="datetime-local" value={closesAt} onChange={event=>setClosesAt(event.target.value)} /></label>
        <label className="form-check"><input type="checkbox" checked={isTest} onChange={event=>setIsTest(event.target.checked)} /> Synthetic QA round</label>
        <div className="form-actions"><button type="submit" className="button-approve" disabled={busy}>Create draft</button></div>
      </form></div>
    <div className="stitch-panel panel-section"><h3 className="jc-section-title">Campaigns</h3>
      {loading?<p className="jc-meta">Loading campaigns…</p>:items.length===0?<p className="empty-state">No campaign exists yet.</p>:<div className="jc-tabs">{items.map(item=><button key={item.id} type="button" className="jc-tab" onClick={()=>setSelected(item.id)} aria-pressed={selected===item.id}>{item.theme} <small>· {item.status} {item.is_test?'[QA]':''} · {item.ballot_count} ballots</small></button>)}</div>}</div>
    {detail&&<div className="stitch-panel panel-section jc-detail">
      <div>
        <h3 className="jc-section-title">{detail.campaign.theme}</h3>
        <div className="jc-chips">
          <span className="status-pill status-pending">{detail.campaign.status}</span>{' '}
          <span className={`status-pill ${detail.campaign.is_test?'status-pending':'status-approved'}`}>{detail.campaign.is_test?'QA only':'Public'}</span>
          {detail.campaign.round_tier==='special_festival'&&<>{' '}<span className="status-pill status-approved">Special round{detail.campaign.festival_name?` · ${detail.campaign.festival_name}`:''}</span></>}
        </div>
        <p className="jc-meta">{detail.campaign.region} · {detail.campaign.ballot_count} ballots{weekly?` · ${detail.campaign.weighted_votes??0} weighted votes · ${detail.campaign.boost_points??0} boost points`:''} · opens {new Date(detail.campaign.opens_at).toLocaleString()} · closes {new Date(detail.campaign.closes_at).toLocaleString()}</p>
      </div>
      {detail.campaign.status==='draft'&&<div><h4>Nominate a published, unsuppressed destination</h4><div className="form-inline"><select value={spotId} onChange={event=>setSpotId(event.target.value)} aria-label="Candidate destination"><option value="">Choose a spot</option>{availableSpots.map(spot=><option key={spot.id} value={spot.id}>{spot.name} · {spot.municipality}</option>)}</select><button type="button" className="button-approve" disabled={!spotId||busy} onClick={()=>void mutate('Candidate',`/campaigns/${detail.campaign.id}/candidates`,{spot_id:spotId})}>Add candidate</button></div></div>}
      <div><h4>Candidates and provisional ballots</h4><p className="jc-meta">Live counts can change during moderation; only the final result reports valid ballots.</p>{detail.candidates.length===0?<p className="empty-state" style={{marginTop:10}}>No candidates yet.</p>:<div className="jc-list">{detail.candidates.map(candidate=><div key={candidate.id} className="jc-item jc-item-wide">
        <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}}>
          <div><strong>{candidate.spot_name}</strong> · {candidate.municipality}<p>{candidate.votes} provisional ballots{weekly?` · ${candidate.weighted_votes??candidate.votes} weighted · ${candidate.boost_points??0} boost pts`:''}{(candidate.prior_loss_streak??0)>0?` · underdog ×${candidate.prior_loss_streak}`:''} · {candidate.status} · capacity {candidate.crowd_capacity_band}{candidate.recommendation_suppressed?' · suppressed':''}</p></div>
          {canEdit&&<button type="button" className={candidate.status==='eligible'?'button-reject':'button-muted'} disabled={busy} onClick={()=>{const next=candidate.status==='eligible'?'suspended':'eligible';const text=window.prompt(`Reason for marking ${candidate.spot_name} ${next}:`);if(text&&text.trim().length>=10)void mutate('Moderation',`/campaigns/${detail.campaign.id}/candidates/${candidate.id}`,{status:next,reason:text.trim()},'PATCH');else if(text)setError('Moderation reason must contain at least 10 characters.');}}>{candidate.status==='eligible'?'Suspend':'Restore'}</button>}
        </div>
        {Array.isArray(candidate.manifesto_perks)&&candidate.manifesto_perks.length>0&&<p className="jc-meta">Manifesto: {candidate.manifesto_perks.map(perkText).join(' · ')}</p>}
        <JuanChoicePromotionReview
          campaignId={detail.campaign.id}
          candidateId={candidate.id}
          candidateName={candidate.spot_name}
          token={token}
          isQaCampaign={detail.campaign.is_test}
          onUnauthorized={onUnauthorized}
        />
      </div>)}</div>}</div>
      <div className="form-actions">{detail.campaign.status==='draft'&&<button type="button" className="button-approve" disabled={busy||detail.candidates.filter(item=>item.status==='eligible').length===0} onClick={()=>{if(window.confirm('Publish this round? Verify candidate safety and capacity first.'))void mutate('Publication',`/campaigns/${detail.campaign.id}/publish`);}}>Publish round</button>}{['draft','scheduled','voting','closed'].includes(detail.campaign.status)&&<button type="button" className="button-reject" disabled={busy} onClick={()=>{const text=window.prompt('Cancellation reason (at least 10 characters):');if(text&&text.trim().length>=10)void mutate('Cancellation',`/campaigns/${detail.campaign.id}/cancel`,{reason:text.trim()});else if(text)setError('Cancellation reason must contain at least 10 characters.');}}>Cancel round</button>}{['scheduled','voting','closed'].includes(detail.campaign.status)&&<button type="button" className="button-muted" disabled={busy||Date.now()<Date.parse(detail.campaign.closes_at)} onClick={()=>void mutate('Finalization',`/campaigns/${detail.campaign.id}/finalize`)}>Finalize closed round</button>}</div>
      {detail.result&&<p className="jc-notice">Final: {detail.result.valid_ballots} valid ballots · {detail.result.co_winner_ids.length} co-winner(s).{weekly?` ${detail.result.total_weighted_votes??0} weighted votes · ${detail.result.total_boost_points??0} boost points.`:''} Spotlight requires {weekly?'the automated safety gate':'active promotion clearance'} and passing crowd gates.</p>}
      {detail.result&&weekly&&<div className="jc-notice" data-testid="jc-weekly-result">
        <p>Champion{detail.result.co_winner_ids.length>1?'s':''}: {detail.result.co_winner_ids.map(nameOf).join(' & ')||'none'} · Minister: {detail.result.minister_candidate_id?nameOf(detail.result.minister_candidate_id):'none (tie or single candidate)'}</p>
        <p>Active perks: {Array.isArray(detail.result.active_perks)&&detail.result.active_perks.length>0?detail.result.active_perks.map(perk=>`${perkText(perk)} (${perk.role??'champion'})`).join(' · '):'none (withheld by the safety gate)'}</p>
      </div>}
      <div><h4>Audit</h4>{detail.audit.length===0?<p className="jc-meta">No actions recorded yet.</p>:<ul className="jc-audit">{detail.audit.map((entry,index)=><li key={`${entry.created_at}-${index}`}><span className="jc-meta">{new Date(entry.created_at).toLocaleString()}</span> · {entry.action}{entry.reason?` — ${entry.reason}`:''}</li>)}</ul>}</div>
    </div>}
  </section>;
}
