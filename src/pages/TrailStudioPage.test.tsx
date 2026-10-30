import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrailStudioPage } from './TrailStudioPage';

const pending = {
  id:'trail-review-1',title:'Bolinao Coast Walk',tagline:'A gentle coastal route',tier:'signature',status:'pending_review',theme:'coast',municipalities:['Bolinao'],
  total_minutes:180,total_km:12,unlock_rule:{price_points:300},ai_used:false,ai_fallback_reason:'NIM disabled',solver:'local',solver_ms:32,
  stops:[{position:1,spot_id:'private-spot-1',name:'Patar Beach',municipality:'Bolinao',lat:16.3,lng:119.8,narration:'Local stop story',approximate:false},
    {position:2,spot_id:'private-spot-2',name:'Cape Bolinao',municipality:'Bolinao',lat:16.31,lng:119.79,narration:'Lighthouse story',approximate:true}],
};
const response=(data:unknown,status=200)=>({ok:status>=200&&status<300,status,json:async()=>({success:true,data})});

describe('TrailStudioPage',()=>{
  beforeEach(()=>{vi.stubEnv('VITE_TRAILS_CUOPT_ENABLED','false');});
  afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});

  it('shows the review route map, fallback badge and requires explicit confirmation before publishing approximate legs',async()=>{
    const fetchMock=vi.fn().mockImplementation((url:string)=>{
      if(url==='/api/v1/admin/settings')return Promise.resolve(response({revision:0,values:{trail_personal_generation_enabled:false}}));
      if(url==='/api/v1/admin/trails/review')return Promise.resolve(response([pending]));
      if(url==='/api/v1/admin/trails?status=published'||url==='/api/v1/admin/trails?status=draft'||url==='/api/v1/admin/trails/generations'||url==='/api/v1/admin/trails/matrix/status')return Promise.resolve(response([]));
      if(url==='/api/v1/admin/trails/areas')return Promise.resolve(response([{id:'dagupan',level:'town',display_name:'Dagupan City',published_spot_count:24}]));
      if(url==='/api/v1/admin/trails/trail-review-1/publish')return Promise.resolve(response({id:pending.id,status:'published'}));
      return Promise.reject(new Error(`Unhandled API request: ${url}`));
    });
    vi.stubGlobal('fetch',fetchMock);
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
    render(<TrailStudioPage/>);
    expect(await screen.findByRole('heading',{name:'Bolinao Coast Walk'})).toBeInTheDocument();
    expect(screen.getByText('Template fallback')).toBeInTheDocument();
    expect(screen.getByRole('img',{name:'Route preview with 2 stops'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/publish/i}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/publish'))).toBe(true));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('straight-line estimated legs'));
    const publishCall=fetchMock.mock.calls.find(call=>String(call[0]).endsWith('/publish'))!;
    expect(JSON.parse(publishCall[1].body)).toEqual({confirm_approximate:true});
  });

  it('generates an admin draft and offers the separate submit-for-review step',async()=>{
    const draft={...pending,id:'trail-draft-1',title:'Generated Coast',status:'draft',stops:[]};
    const fetchMock=vi.fn().mockImplementation((url:string,init?:RequestInit)=>{
      if(url==='/api/v1/admin/settings'&&init?.method==='PUT')return Promise.resolve(response({revision:1,values:{trail_personal_generation_enabled:true}}));
      if(url==='/api/v1/admin/settings')return Promise.resolve(response({revision:0,values:{trail_personal_generation_enabled:false}}));
      if(url==='/api/v1/admin/trails/review'||url==='/api/v1/admin/trails?status=published'||url==='/api/v1/admin/trails/generations'||url==='/api/v1/admin/trails/matrix/status')return Promise.resolve(response([]));
      if(url==='/api/v1/admin/trails/areas')return Promise.resolve(response([{id:'dagupan',level:'town',display_name:'Dagupan City',published_spot_count:24}]));
      if(url==='/api/v1/admin/trails?status=draft')return Promise.resolve(response([draft]));
      if(url==='/api/v1/admin/trails/generate')return Promise.resolve(response({trail:draft,generation:{id:'generation-1'},solution:{feasible:true}},201));
      if(url==='/api/v1/admin/trails/trail-draft-1/review')return Promise.resolve(response({id:draft.id,status:'pending_review'}));
      return Promise.reject(new Error(`Unhandled API request: ${url} ${init?.method??''}`));
    });
    vi.stubGlobal('fetch',fetchMock);
    vi.spyOn(window,'confirm').mockReturnValue(true);
    render(<TrailStudioPage/>);
    fireEvent.change(await screen.findByLabelText('Generation area'),{target:{value:'dagupan'}});
    fireEvent.change(await screen.findByLabelText('Theme'),{target:{value:'family heritage'}});
    fireEvent.click(screen.getByRole('button',{name:/Generate draft/i}));
    expect(await screen.findByText('Draft created: Generated Coast')).toBeInTheDocument();
    await waitFor(()=>expect(screen.getByText('Generated Coast')).toBeInTheDocument(),{timeout:4000});
    const generateCall=fetchMock.mock.calls.find(call=>String(call[0]).endsWith('/generate'))!;
    expect(JSON.parse(generateCall[1].body)).toMatchObject({area_id:'dagupan',theme:'family heritage',tier:'starter',budgetMin:240});
    fireEvent.click(screen.getByRole('button',{name:/Submit for review/i}));
    await waitFor(()=>expect(fetchMock.mock.calls.some(call=>String(call[0]).endsWith('/review'))).toBe(true));
  });

  it('shows traveler personal trail generation off by default and saves the audited setting',async()=>{
    const fetchMock=vi.fn().mockImplementation((url:string,init?:RequestInit)=>{
      if(url==='/api/v1/admin/settings'&&init?.method==='PUT')return Promise.resolve(response({revision:1,values:{trail_personal_generation_enabled:true}}));
      if(url==='/api/v1/admin/settings')return Promise.resolve(response({revision:0,values:{trail_personal_generation_enabled:false}}));
      if(url==='/api/v1/admin/trails/review'||url==='/api/v1/admin/trails?status=published'||url==='/api/v1/admin/trails?status=draft'||url==='/api/v1/admin/trails/generations'||url==='/api/v1/admin/trails/matrix/status')return Promise.resolve(response([]));
      if(url==='/api/v1/admin/trails/areas')return Promise.resolve(response([]));
      return Promise.reject(new Error(`Unhandled API request: ${url}`));
    });
    vi.stubGlobal('fetch',fetchMock);
    render(<TrailStudioPage/>);
    const toggle=await screen.findByRole('checkbox');
    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Let travelers generate personal trails.')).toBeInTheDocument();
    fireEvent.click(toggle);
    await waitFor(()=>expect(fetchMock.mock.calls.some(call=>String(call[0])==='/api/v1/admin/settings'&&call[1]?.method==='PUT')).toBe(true));
    const update=fetchMock.mock.calls.find(call=>String(call[0])==='/api/v1/admin/settings'&&call[1]?.method==='PUT')!;
    expect(JSON.parse(update[1].body)).toMatchObject({expected_revision:0,changes:{trail_personal_generation_enabled:true}});
    expect(await screen.findByText('Traveler trail generation setting saved.')).toBeInTheDocument();
    expect((toggle as HTMLInputElement).checked).toBe(true);
  });
});
