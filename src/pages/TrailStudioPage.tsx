import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Archive, Check, MapPin, RefreshCw, Route, Send, Sparkles, WandSparkles, X } from 'lucide-react';
import { apiFetch } from '../api/client';
import { EmptyState, PageHeader, PageLoading } from '../components/PageState';
import { describeError } from '../utils/errors';

type Tier = 'starter' | 'explorer' | 'signature' | 'legendary';
interface Stop { position:number; spot_id:string; name:string; municipality:string; lat:number|string; lng:number|string; narration?:string; leg_minutes?:number; leg_km?:number; approximate?:boolean }
interface StudioTrail {
  id:string; title:string; tagline?:string; tier:Tier; status:string; theme:string; municipalities:string[];
  total_minutes:number; total_km:number|string; unlock_rule?:{price_points?:number}; available_from?:string|null; available_until?:string|null;
  story?:{intro?:string}; stops:Stop[]; ai_used?:boolean; ai_fallback_reason?:string|null; ai_model?:string|null; solver?:string; solver_ms?:number; objective?:number;
}
interface MatrixStatus {costing:string;rows:number;approximate_count:number;last_computed:string|null;graph_label:string|null}
interface Generation {id:string;kind:string;solver:string;solver_ms:number;objective:number;result:Record<string,unknown>;ai_used:boolean;ai_fallback_reason?:string|null;created_at:string}
interface CatalogSpot {id:string;name:string;municipality?:string}
interface SolverRun {objective:number;feasible:boolean;stops:Array<{spotId:string}>;totalMin:number;totalKm:number;ms:number;solver:string}
interface SolverComparison {local:SolverRun;cuopt:SolverRun}

function RoutePreview({ stops }: { stops:Stop[] }) {
  const points = useMemo(() => {
    if (!stops.length) return [];
    const lats = stops.map(stop=>Number(stop.lat)), lngs = stops.map(stop=>Number(stop.lng));
    const minLat=Math.min(...lats), maxLat=Math.max(...lats), minLng=Math.min(...lngs), maxLng=Math.max(...lngs);
    return stops.map((stop,index)=>({
      x:maxLng===minLng ? 50+index*18 : 24+(Number(stop.lng)-minLng)/(maxLng-minLng)*312,
      y:maxLat===minLat ? 90 : 20+(maxLat-Number(stop.lat))/(maxLat-minLat)*140,
      stop,
    }));
  },[stops]);
  return <div className="trail-studio-map" role="img" aria-label={`Route preview with ${stops.length} stops`}>
    <svg viewBox="0 0 360 180" aria-hidden="true"><path d={points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ')} fill="none" stroke="#28735a" strokeWidth="4" strokeDasharray="7 6"/>{points.map((point,index)=><g key={point.stop.position}><circle cx={point.x} cy={point.y} r="11" fill="#f4a261" stroke="white" strokeWidth="3"/><text x={point.x} y={point.y+4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#392718">{index+1}</text></g>)}</svg>
    <span className="trail-studio-map-caption"><MapPin size={13}/> {stops.map(stop=>stop.municipality).filter((town,index,array)=>town&&array.indexOf(town)===index).join(' · ') || 'Route preview'}</span>
  </div>;
}

export function TrailStudioPage() {
  const [queue,setQueue]=useState<StudioTrail[]>([]);
  const [published,setPublished]=useState<StudioTrail[]>([]);
  const [drafts,setDrafts]=useState<StudioTrail[]>([]);
  const [generations,setGenerations]=useState<Generation[]>([]);
  const [matrix,setMatrix]=useState<MatrixStatus[]>([]);
  const [spots,setSpots]=useState<CatalogSpot[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [theme,setTheme]=useState('coastal discoveries');
  const [tier,setTier]=useState<Tier>('starter');
  const [budget,setBudget]=useState(240);
  const [cuoptResult,setCuoptResult]=useState<SolverComparison|null>(null);
  const [compareSpotIds,setCompareSpotIds]=useState<string[]>([]);
  const [compareBudget,setCompareBudget]=useState(240);
  const cuoptEnabled=import.meta.env.VITE_TRAILS_CUOPT_ENABLED==='true';

  const load=useCallback(async(signal?:AbortSignal)=>{
    try{
      setLoading(true);setError('');
      const [reviewRows,publishedRows,draftRows,history,matrixRows,spotRows]=await Promise.all([
        apiFetch<StudioTrail[]>('/admin/trails/review',{signal}),
        apiFetch<StudioTrail[]>('/admin/trails?status=published',{signal}),
        apiFetch<StudioTrail[]>('/admin/trails?status=draft',{signal}),
        apiFetch<Generation[]>('/admin/trails/generations',{signal}).catch(()=>[]),
        apiFetch<MatrixStatus[]>('/admin/trails/matrix/status',{signal}).catch(()=>[]),
        cuoptEnabled?apiFetch<CatalogSpot[]>('/admin/spots',{signal}).catch(()=>[]):Promise.resolve([]),
      ]);
      setQueue(reviewRows);setPublished(publishedRows);setDrafts(draftRows);setGenerations(history);setMatrix(matrixRows);setSpots(spotRows);
    }catch(cause){if(cause instanceof DOMException&&cause.name==='AbortError')return;setError(describeError(cause,'Unable to load Trail Studio.'));}
    finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);

  const mutate=async(id:string,path:string,method='POST',body?:unknown)=>{
    try{setBusy(id);setError('');setNotice('');await apiFetch(`/admin/trails/${encodeURIComponent(id)}${path}`,{method,body});setNotice(`Trail ${path.split('/').pop()} complete.`);await load();}
    catch(cause){setError(describeError(cause,`Could not ${path.split('/').pop()} trail.`));}
    finally{setBusy('');}
  };
  const submitReview=(trail:StudioTrail)=>{if(window.confirm(`Submit “${trail.title}” to the review queue?`))void mutate(trail.id,'/review','POST',{decision:'submit'});};
  const publish=(trail:StudioTrail)=>{
    const approximate=trail.stops?.some(stop=>stop.approximate);
    if(approximate&&!window.confirm(`“${trail.title}” contains straight-line estimated legs. Publish with those estimates clearly disclosed?`))return;
    void mutate(trail.id,'/publish','POST',approximate?{confirm_approximate:true}:{});
  };
  const reject=(trail:StudioTrail)=>{if(window.confirm(`Reject “${trail.title}”?`))void mutate(trail.id,'/reject');};
  const retire=(trail:StudioTrail)=>{if(window.confirm(`Retire “${trail.title}” from the traveler catalog?`))void mutate(trail.id,'/retire');};
  const save=(trail:StudioTrail,form:HTMLFormElement)=>{
    const data=new FormData(form);const price=Number(data.get('price_points'));
    const body={title:String(data.get('title')),tagline:String(data.get('tagline')),tier:String(data.get('tier')) as Tier,
      ...(price>0?{price_points:price}:{}),available_from:data.get('available_from')?new Date(String(data.get('available_from'))).toISOString():null,
      available_until:data.get('available_until')?new Date(String(data.get('available_until'))).toISOString():null,
      narration:trail.stops.map(stop=>({position:stop.position,text:String(data.get(`narration_${stop.position}`)??'')}))};
    void mutate(trail.id,'','PATCH',body);
  };
  const generate=async(event:React.FormEvent)=>{
    event.preventDefault();try{setBusy('generate');setError('');setNotice('');const result=await apiFetch<{trail:StudioTrail}>('/admin/trails/generate',{method:'POST',body:{theme,tier,budgetMin:budget,minStops:2,maxStops:6,maxLegMin:60,maxPerCategory:2}});setNotice(`Draft created: ${result.trail.title}`);await load();}
    catch(cause){setError(describeError(cause,'Trail generation failed.'));}finally{setBusy('');}
  };
  const refreshMatrix=async()=>{try{setBusy('matrix');setError('');const result=await apiFetch<MatrixStatus>('/admin/trails/matrix/refresh',{method:'POST',body:{costing:'auto'}});setNotice(`Matrix refreshed: ${result.rows} routes, ${result.approximate_count} approximate.`);await load();}catch(cause){setError(describeError(cause,'Matrix refresh failed.'));}finally{setBusy('');}};
  const compare=async()=>{try{setBusy('compare');setError('');setCuoptResult(null);const result=await apiFetch<SolverComparison>('/admin/trails/compare-solvers',{method:'POST',body:{spot_ids:compareSpotIds,budget_min:compareBudget}});setCuoptResult(result);}catch(cause){setError(describeError(cause,'Solver comparison failed.'));}finally{setBusy('');}};

  if(loading)return <PageLoading label="Loading Trail Studio…"/>;
  return <div className="trail-studio">
    <PageHeader title="Trail Studio" description="Build route drafts, review AI-assisted story text, inspect route quality, and publish only after operator review." actions={<button className="button-neutral" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button>}/>
    <div className="trail-studio-safety"><Sparkles size={16}/><span>Route selection is deterministic and catalog-only. AI can assist with preference parsing and narration; template fallback is labeled. No wallet transaction or on-chain action is performed here.</span></div>
    {error&&<div className="load-error" role="alert">{error}<button onClick={()=>void load()}>Retry</button></div>}{notice&&<p className="trail-studio-notice" role="status">{notice}</p>}

    <section className="trail-studio-grid" aria-label="Matrix and generator controls">
      <article className="stitch-panel trail-studio-panel"><div className="trail-studio-panel-title"><div><p className="eyebrow">Routing coverage</p><h2>Travel matrix</h2></div><Route size={21}/></div>
        {matrix.length?<div className="trail-matrix-list">{matrix.map(item=><div key={item.costing} className="trail-matrix-row"><strong>{item.costing}</strong><span>{item.rows.toLocaleString()} pairs</span><span>{item.approximate_count.toLocaleString()} estimated</span><small>{item.last_computed?new Date(item.last_computed).toLocaleString():'No refresh yet'} · {item.graph_label||'graph label unavailable'}</small></div>)}</div>:<p className="trail-muted">No matrix rows are available yet. Route generation can use the flagged approximate fallback.</p>}
        <button className="button-neutral" disabled={busy==='matrix'} onClick={()=>void refreshMatrix()}><RefreshCw size={14}/>{busy==='matrix'?'Refreshing…':'Refresh auto matrix'}</button>
      </article>
      <form className="stitch-panel trail-studio-panel" onSubmit={generate}><div className="trail-studio-panel-title"><div><p className="eyebrow">Admin-only</p><h2>Generate now</h2></div><WandSparkles size={21}/></div>
        <label>Theme<input value={theme} onChange={event=>setTheme(event.target.value)} required maxLength={80}/></label>
        <div className="trail-form-row"><label>Tier<select value={tier} onChange={event=>setTier(event.target.value as Tier)}><option value="starter">Starter</option><option value="explorer">Explorer</option><option value="signature">Signature</option><option value="legendary">Legendary</option></select></label><label>Budget minutes<input type="number" min={60} max={600} step={30} value={budget} onChange={event=>setBudget(Number(event.target.value))}/></label></div>
        <p className="trail-muted">Generated items start as drafts and are not visible to travelers until submitted, reviewed, then published.</p>
        <button className="button-approve" disabled={busy==='generate'}><WandSparkles size={15}/>{busy==='generate'?'Optimizing…':'Generate draft'}</button>
      </form>
    </section>

    {cuoptEnabled&&<section className="stitch-panel trail-studio-panel trail-studio-compare"><div className="trail-studio-panel-title"><div><p className="eyebrow">Evaluation only</p><h2>Solver comparison</h2></div><Activity size={20}/></div><p>Compares the deterministic local result with cuOpt using the exact same published spots and constraints. This control is admin-only and never runs in traveler requests.</p><div className="trail-form-row"><label>Candidate spots · select at least 3<select aria-label="Solver comparison candidate spots" multiple size={5} value={compareSpotIds} onChange={event=>setCompareSpotIds(Array.from(event.target.selectedOptions,option=>option.value))}>{spots.map(spot=><option key={spot.id} value={spot.id}>{spot.name}{spot.municipality?` · ${spot.municipality}`:''}</option>)}</select></label><label>Budget minutes<input type="number" min={60} max={600} step={30} value={compareBudget} onChange={event=>setCompareBudget(Number(event.target.value))}/></label></div><button className="button-neutral" disabled={busy==='compare'||compareSpotIds.length<3} onClick={()=>void compare()}>{busy==='compare'?'Comparing…':'Compare solvers'}</button>{cuoptResult&&<div className="trail-compare-results">{(['local','cuopt'] as const).map(key=><article key={key}><h3>{key==='local'?'Local solver':'cuOpt'}</h3><p>{cuoptResult[key].feasible?'Feasible':'No feasible route'} · objective {Number(cuoptResult[key].objective).toFixed(3)}</p><p>{cuoptResult[key].stops.length} stops · {cuoptResult[key].totalMin} min · {cuoptResult[key].totalKm.toFixed(1)} km · {cuoptResult[key].ms} ms</p><ol>{cuoptResult[key].stops.map(stop=><li key={stop.spotId}>{spots.find(spot=>spot.id===stop.spotId)?.name??stop.spotId}</li>)}</ol></article>)}</div>}</section>}

    <section className="trail-studio-section"><div className="trail-studio-section-heading"><div><p className="eyebrow">Human gate</p><h2>Review queue <span>{queue.length}</span></h2></div></div>
      {queue.length?<div className="trail-studio-cards">{queue.map(trail=><TrailCard key={trail.id} trail={trail} busy={busy===trail.id} onSave={form=>save(trail,form)} onPublish={()=>publish(trail)} onReject={()=>reject(trail)} onRetire={()=>retire(trail)} onSubmit={()=>submitReview(trail)}/>)}</div>:<EmptyState title="Review queue is clear" detail="Submitted trail drafts will appear here with stop preview and solver/AI provenance."/>}
    </section>
    {drafts.length>0&&<section className="trail-studio-section"><div className="trail-studio-section-heading"><div><p className="eyebrow">Generated by operators</p><h2>Drafts <span>{drafts.length}</span></h2></div></div><div className="trail-studio-drafts">{drafts.map(trail=><div className="trail-studio-draft" key={trail.id}><div><strong>{trail.title}</strong><span>{trail.tier} · {trail.theme} · {trail.solver_ms??'—'} ms</span></div><button className="button-approve" disabled={busy===trail.id} onClick={()=>submitReview(trail)}><Send size={14}/>Submit for review</button></div>)}</div></section>}
    <section className="trail-studio-section"><div className="trail-studio-section-heading"><div><p className="eyebrow">Traveler catalog</p><h2>Published trails <span>{published.length}</span></h2></div></div>{published.length?<div className="trail-studio-drafts">{published.map(trail=><div className="trail-studio-draft" key={trail.id}><div><strong>{trail.title}</strong><span>{trail.tier} · {trail.theme} · {trail.stops?.length??'—'} stops</span></div><button className="button-danger" disabled={busy===trail.id} onClick={()=>retire(trail)}><Archive size={14}/>Retire</button></div>)}</div>:<EmptyState title="No engine trails are published yet"/>}</section>
    <section className="trail-studio-section"><div className="trail-studio-section-heading"><div><p className="eyebrow">Audit trail</p><h2>Generation history <span>{generations.length}</span></h2></div></div>{generations.length?<div className="trail-history-table"><div className="trail-history-header"><span>When</span><span>Kind / solver</span><span>Result</span><span>AI provenance</span></div>{generations.map(row=><div className="trail-history-row" key={row.id}><span>{new Date(row.created_at).toLocaleString()}</span><span>{row.kind} · {row.solver} · {row.solver_ms} ms</span><span>objective {Number(row.objective).toFixed(3)}</span><span>{row.ai_used?'AI-assisted':`Template fallback${row.ai_fallback_reason?` · ${row.ai_fallback_reason}`:''}`}</span></div>)}</div>:<EmptyState title="No generation history yet"/>}</section>
  </div>;
}

function TrailCard({trail,busy,onSave,onPublish,onReject,onRetire,onSubmit}:{trail:StudioTrail;busy:boolean;onSave:(form:HTMLFormElement)=>void;onPublish:()=>void;onReject:()=>void;onRetire:()=>void;onSubmit:()=>void}){
  return <article className="stitch-panel trail-studio-card"><div className="trail-studio-card-head"><div><span className={`trail-tier-badge tier-${trail.tier}`}>{trail.tier}</span><h3>{trail.title}</h3><p>{trail.municipalities.join(' · ')||'Pangasinan'} · {minsLabel(trail.total_minutes)} · {trail.total_km} km</p></div><span className={trail.ai_used?'trail-ai-badge':'trail-fallback-badge'}>{trail.ai_used?'AI story':'Template fallback'}</span></div>
    {trail.ai_fallback_reason&&<p className="trail-muted">Fallback reason: {trail.ai_fallback_reason}</p>}
    <RoutePreview stops={trail.stops??[]}/>
    <form onSubmit={event=>{event.preventDefault();onSave(event.currentTarget);}} className="trail-studio-edit"><label>Title<input name="title" defaultValue={trail.title} minLength={3} maxLength={80} required/></label><label>Tagline<input name="tagline" defaultValue={trail.tagline??''} maxLength={160}/></label><div className="trail-form-row"><label>Tier<select name="tier" defaultValue={trail.tier}><option value="starter">Starter</option><option value="explorer">Explorer</option><option value="signature">Signature</option><option value="legendary">Legendary</option></select></label><label>Points price<input name="price_points" type="number" min={1} max={100000} defaultValue={trail.unlock_rule?.price_points??''} placeholder="Tier default"/></label></div>
      <div className="trail-form-row"><label>Available from<input name="available_from" type="datetime-local" defaultValue={trail.available_from?trail.available_from.slice(0,16):''}/></label><label>Available until<input name="available_until" type="datetime-local" defaultValue={trail.available_until?trail.available_until.slice(0,16):''}/></label></div>
      {(trail.stops??[]).map(stop=><label key={stop.position}>Stop {stop.position} · {stop.name}<textarea name={`narration_${stop.position}`} rows={2} maxLength={400} defaultValue={stop.narration??''}/></label>)}
      <button className="button-neutral" disabled={busy}><Check size={14}/>Save edits</button></form>
    <div className="trail-studio-actions">{trail.status==='draft'?<button className="button-neutral" disabled={busy} onClick={onSubmit}><Send size={14}/>Submit for review</button>:<><button className="button-approve" disabled={busy} onClick={onPublish}><Check size={14}/>Publish</button><button className="button-danger" disabled={busy} onClick={onReject}><X size={14}/>Reject</button></>}<button className="button-danger" disabled={busy} onClick={onRetire}><Archive size={14}/>Retire</button></div>
    {trail.stops?.some(stop=>stop.approximate)&&<p className="trail-approx-warning"><AlertTriangle size={14}/>Contains straight-line estimated legs; publishing requires explicit confirmation.</p>}
  </article>;
}
function minsLabel(minutes:number){return minutes<60?`${minutes} min`:`${Math.floor(minutes/60)}h ${minutes%60?`${minutes%60}m`:''}`;}
