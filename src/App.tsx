import React, { useState, useEffect, useRef } from 'react';
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  MapPin, 
  ShieldAlert, 
  LogOut, 
  Award,
  Layers,
  Check,
  X,
  Compass,
  Sparkles,
  Vote,
  Store,
} from 'lucide-react';
import { GovernanceControlCenter } from './GovernanceControlCenter';

interface Submission {
  id: string;
  user_name: string;
  quest_title: string;
  scanned_marker_code: string;
  captured_lat: number;
  captured_lng: number;
  target_lat: number;
  target_lng: number;
  distance_meters: number;
  quest_radius_meters: number;
  captured_accuracy?: number;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  created_at: string;
}

interface Quest {
  id: string;
  title: string;
  category: string;
  location_name: string;
  reward_points: number;
  marker_code: string;
  radius_meters: number;
}
interface Spot { id:string; name:string; category:string; subcategory:string; municipality:string; source_type?:string; source_name:string; trust_level:string; status:string; image_url?:string; crowd_capacity_band?:'low'|'medium'|'high'; crowd_status?:string; recommendation_suppressed?:boolean; }

interface Voucher {
  id: string;
  merchant_name: string;
  offer_title: string;
  cost_points: number;
  category: string;
}

export function App() {
  const travelerUrl = import.meta.env.VITE_TRAVELER_URL || '/app';
  const [token, setToken] = useState<string | null>(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const handedOffToken = fragment.get('session');
    if (handedOffToken) {
      localStorage.setItem('admin_token', handedOffToken);
      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
      return handedOffToken;
    }
    return localStorage.getItem('admin_token');
  });
  const [activeTab, setActiveTab] = useState<'pending' | 'all' | 'spots' | 'quests' | 'proposals' | 'vouchers'>('pending');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [selectedSub, setSelectedSub] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string>('');
  const rejectInputRef = useRef<HTMLTextAreaElement>(null);
  const rejectTriggerRef = useRef<HTMLButtonElement | null>(null);

  const vouchers: Voucher[] = [
    { id: 'v1', merchant_name: 'Dagupan Bangus Grill & Restaurant', offer_title: '₱100 Meal Discount Voucher', cost_points: 50, category: 'FOOD & DINING' },
    { id: 'v2', merchant_name: 'Hundred Islands Boatmen Association', offer_title: '15% Off Island Hopping Tour', cost_points: 75, category: 'ECO-TOURISM' },
    { id: 'v3', merchant_name: 'Bolinao Souvenirs & Crafts', offer_title: 'Free Heritage Gift Token', cost_points: 40, category: 'TRADE & CRAFTS' },
  ];

  const API_BASE = '/api/v1';

  // Demo Login
  const handleLogin = async () => {
    try {
      setAuthLoading(true);
      setLoginError('');
      const res = await fetch(`${API_BASE}/auth/demo-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seed_id: 'admin-1' }),
      });
      const data = await res.json();
      if (data.success) {
        setToken(data.data.token);
        localStorage.setItem('admin_token', data.data.token);
      } else {
        setLoginError(data.error?.message || 'Login failed');
      }
    } catch (err) {
      setLoginError('Network error - cannot reach server');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    localStorage.removeItem('admin_token');
  };

  // Fetch Submissions
  const fetchSubmissions = async (signal?: AbortSignal) => {
    if (!token) return;
    try {
      setListLoading(true);
      setListError('');
      const statusQuery = activeTab === 'pending' ? '?status=pending' : '';
      const res = await fetch(`${API_BASE}/admin/submissions${statusQuery}`, {
        headers: { Authorization: `Bearer ${token}` }, signal,
      });
      if (res.status === 401 || res.status === 403) { handleLogout(); return; }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to load submissions.');
      setSubmissions(data.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setListError(err instanceof Error ? err.message : 'Unable to load submissions.');
    } finally {
      if (!signal?.aborted) setListLoading(false);
    }
  };

  // Fetch Quests
  const fetchQuests = async (signal?: AbortSignal) => {
    try {
      setListLoading(true);
      setListError('');
      const res = await fetch(`${API_BASE}/quests`, { signal });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error?.message || 'Unable to load quests.');
      setQuests(data.data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setListError(err instanceof Error ? err.message : 'Unable to load quests.');
    } finally {
      if (!signal?.aborted) setListLoading(false);
    }
  };
  const fetchSpots = async (signal?: AbortSignal) => { try { setListLoading(true);setListError('');const res=await fetch(`${API_BASE}/admin/spots`,{signal,headers:{Authorization:`Bearer ${token}`}});const data=await res.json();if(!res.ok||!data.success)throw new Error(data.error?.message||'Unable to load spots.');setSpots(data.data);}catch(err){if(err instanceof DOMException&&err.name==='AbortError')return;setListError(err instanceof Error?err.message:'Unable to load spots.');}finally{if(!signal?.aborted)setListLoading(false);} };
  const reviewSpot=async(spot:Spot,status:'published'|'needs_review'|'unpublished',band:Spot['crowd_capacity_band']=spot.crowd_capacity_band||'medium',suppressed=spot.recommendation_suppressed||false)=>{try{setReviewingId(spot.id);setReviewError('');const res=await fetch(`${API_BASE}/admin/spots/${spot.id}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({status,crowd_capacity_band:band,recommendation_suppressed:suppressed})});const data=await res.json();if(!res.ok||!data.success)throw new Error(data.error?.message||'Unable to update spot.');setSpots(current=>current.map(item=>item.id===spot.id?data.data:item));}catch(err){setReviewError(err instanceof Error?err.message:'Unable to update spot.');}finally{setReviewingId(null);}};

  useEffect(() => {
    const controller = new AbortController();
    if (token) {
      if (activeTab === 'spots') {
        void fetchSpots(controller.signal);
      } else if (activeTab === 'quests') {
        void fetchQuests(controller.signal);
      } else if (activeTab === 'pending' || activeTab === 'all') {
        void fetchSubmissions(controller.signal);
      }
    }
    return () => controller.abort();
  }, [token, activeTab]);

  useEffect(() => {
    if (!showRejectModal) return;
    rejectInputRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !reviewingId) {
        setShowRejectModal(false);
        setRejectionReason('');
        requestAnimationFrame(() => rejectTriggerRef.current?.focus());
      }
      if (event.key === 'Tab') {
        const dialog = rejectInputRef.current?.closest('[role="dialog"]');
        const focusable = dialog?.querySelectorAll<HTMLElement>('textarea, button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showRejectModal, reviewingId]);

  // Review Submission
  const handleReview = async (id: string, action: 'approve' | 'reject', reason?: string) => {
    if (reviewingId || (action === 'reject' && !reason?.trim())) return;
    try {
      setReviewingId(id);
      setReviewError('');
      const res = await fetch(`${API_BASE}/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          rejection_reason: reason,
        }),
      });
      if (res.status === 401 || res.status === 403) { handleLogout(); return; }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Review failed.');
      }
      const data = await res.json();
      if (data.success) {
        setShowRejectModal(false);
        setSelectedSub(null);
        setRejectionReason('');
        rejectTriggerRef.current?.focus();
        await fetchSubmissions();
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setReviewingId(null);
    }
  };

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf9f5', padding: '20px' }}>
        <div className="stitch-panel" style={{ width: '100%', maxWidth: '440px', padding: '40px', textAlign: 'center' }}>
          <div style={{ margin: '0 auto 20px', width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="JuanderQuest Logo" style={{ width: '100%', height: 'auto', filter: 'drop-shadow(0 8px 16px rgba(88, 47, 14, 0.15))' }} />
          </div>
          
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#582f0e', display: 'block', marginBottom: '6px' }}>
            Pangasinan Tourism Verification
          </span>
          <h1 style={{ fontSize: '26px', fontWeight: 800, color: '#582f0e', marginBottom: '8px' }}>
            JuanderQuest Control Room
          </h1>
          <p style={{ color: '#514532', fontSize: '13px', lineHeight: 1.5, marginBottom: '32px' }}>
            Administrator portal for reviewing GPS-backed quest proof and moderating Pangasinan tourism destinations.
          </p>

          {loginError && (
            <p style={{ color: '#bc4749', fontSize: '12px', marginBottom: '12px' }}>{loginError}</p>
          )}
          <button
            onClick={() => setActiveTab('spots')}
            style={{padding:'10px 20px',borderRadius:'20px',background:activeTab==='spots'?'#ffb703':'#e9e8e4',color:activeTab==='spots'?'#6b4b00':'#514532',fontWeight:700,fontSize:'13px',display:'flex',alignItems:'center',gap:'8px'}}
          ><Compass size={16}/> Destination Spots</button>

          <button
            onClick={handleLogin}
            disabled={authLoading}
            style={{
              width: '100%',
              padding: '16px',
              borderRadius: '14px',
              background: authLoading ? '#e9e8e4' : '#ffb703',
              color: authLoading ? '#837560' : '#6b4b00',
              fontWeight: 700,
              fontSize: '16px',
              boxShadow: '0 4px 16px rgba(255, 183, 3, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px'
            }}
          >
            {authLoading ? (
              'Authenticating...'
            ) : (
              <>
                <span>Sign In as Pangasinan Admin</span>
                <Sparkles size={18} />
              </>
            )}
          </button>

          <div style={{ marginTop: '28px', fontSize: '11px', color: '#837560' }}>
            PROTOTYPE BUILD V1.0.0 — ADMIN PORTAL
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#faf9f5' }}>
      {/* Header */}
      <header className="stitch-panel" style={{ borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0, padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <img src="/logo.png" alt="Logo" style={{ height: '40px', width: 'auto' }} />
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#582f0e' }}>JuanderQuest Control Room</h2>
            <p style={{ fontSize: '12px', color: '#514532' }}>Pangasinan Destination Moderation & Verification Portal</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#beead1', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: '#436b58' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#2d6a4f' }}></div>
            <span>PANGASINAN REGION ACTIVE</span>
          </div>
          <a href={travelerUrl} style={{ color: '#582f0e', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
            View traveler site
          </a>
          <button onClick={handleLogout} style={{ background: 'transparent', color: '#582f0e', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 600 }}>
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      {/* Container */}
      <main style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '32px 20px', flex: 1 }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid #d5c4ac', paddingBottom: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('pending')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              background: activeTab === 'pending' ? '#ffb703' : '#e9e8e4',
              color: activeTab === 'pending' ? '#6b4b00' : '#514532',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Clock size={16} /> Pending Queue
          </button>

          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              background: activeTab === 'all' ? '#ffb703' : '#e9e8e4',
              color: activeTab === 'all' ? '#6b4b00' : '#514532',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Layers size={16} /> All Submissions
          </button>

          <button
            onClick={() => setActiveTab('quests')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              background: activeTab === 'quests' ? '#ffb703' : '#e9e8e4',
              color: activeTab === 'quests' ? '#6b4b00' : '#514532',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <MapPin size={16} /> Pangasinan Quests
          </button>

          <button
            onClick={() => setActiveTab('proposals')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              background: activeTab === 'proposals' ? '#ffb703' : '#e9e8e4',
              color: activeTab === 'proposals' ? '#6b4b00' : '#514532',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Vote size={16} /> Governance & Tokenomics
          </button>

          <button
            onClick={() => setActiveTab('vouchers')}
            style={{
              padding: '10px 20px',
              borderRadius: '20px',
              background: activeTab === 'vouchers' ? '#ffb703' : '#e9e8e4',
              color: activeTab === 'vouchers' ? '#6b4b00' : '#514532',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Store size={16} /> Merchant Vouchers
          </button>
        </div>

        {/* Pending & All Submissions Tab */}
        {(activeTab === 'pending' || activeTab === 'all') && (
          <div>
            {listError && <div className="load-error" role="alert">{listError} <button onClick={() => void fetchSubmissions()}>Retry</button></div>}
            {reviewError && <div className="load-error" role="alert">{reviewError}</div>}
            {listLoading ? <div className="stitch-panel loading-panel">Loading submissions…</div> : submissions.length === 0 ? (
              <div className="stitch-panel" style={{ padding: '48px', textAlign: 'center', color: '#837560' }}>
                <Clock size={40} style={{ opacity: 0.5, marginBottom: '12px' }} />
                <p style={{ fontWeight: 600 }}>No submissions found in this queue.</p>
              </div>
            ) : (
              <div className="submission-grid">
                {submissions.map((sub) => (
                  <div key={sub.id} className="stitch-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#837560' }}>ID: {sub.id.substring(0, 8)}</span>
                        <span
                          style={{
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            background:
                              sub.status === 'approved'
                                ? '#beead1'
                                : sub.status === 'rejected'
                                ? 'rgba(188, 71, 73, 0.15)'
                                : 'rgba(255, 183, 3, 0.2)',
                            color:
                              sub.status === 'approved'
                                ? '#2d6a4f'
                                : sub.status === 'rejected'
                                ? '#bc4749'
                                : '#6b4b00',
                          }}
                        >
                          {sub.status === 'pending' ? 'Awaiting Review' : sub.status}
                        </span>
                      </div>

                      <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#582f0e', marginBottom: '6px' }}>{sub.quest_title}</h3>
                      <p style={{ fontSize: '13px', color: '#514532', marginBottom: '16px' }}>Submitted by: <strong style={{ color: '#1b1c1a' }}>{sub.user_name}</strong></p>

                      <div style={{ background: '#efeeea', padding: '14px', borderRadius: '12px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#514532' }}>Marker Code:</span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#582f0e' }}>{sub.scanned_marker_code}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#514532' }}>Distance Offset:</span>
                           <span style={{ fontWeight: 700, color: sub.distance_meters <= sub.quest_radius_meters ? '#2d6a4f' : '#bc4749' }}>
                            {sub.distance_meters}m / {sub.quest_radius_meters}m {sub.distance_meters <= sub.quest_radius_meters ? '(Valid)' : '(Exceeded)'}
                           </span>
                         </div>
                         <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#514532' }}>Captured:</span><span>{new Date(sub.created_at).toLocaleString()}</span></div>
                         <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#514532' }}>GPS Proof:</span><span>{sub.captured_lat.toFixed(5)}, {sub.captured_lng.toFixed(5)}{sub.captured_accuracy != null ? ` (±${sub.captured_accuracy}m)` : ''}</span></div>
                      </div>

                      {sub.rejection_reason && (
                        <div style={{ background: 'rgba(188, 71, 73, 0.1)', borderLeft: '3px solid #bc4749', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', color: '#bc4749', marginBottom: '16px' }}>
                          Reason: {sub.rejection_reason}
                        </div>
                      )}
                    </div>

                    {sub.status === 'pending' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                        <button
                          onClick={() => handleReview(sub.id, 'approve')}
                          disabled={reviewingId !== null}
                          style={{ padding: '12px', borderRadius: '10px', background: reviewingId ? '#e9e8e4' : '#2d6a4f', color: reviewingId ? '#837560' : '#fff', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <Check size={16} /> Approve
                        </button>

                        <button
                          onClick={(event) => {
                            rejectTriggerRef.current = event.currentTarget;
                            setSelectedSub(sub);
                            setReviewError('');
                            setShowRejectModal(true);
                          }}
                          disabled={reviewingId !== null}
                          style={{ padding: '12px', borderRadius: '10px', background: 'rgba(188, 71, 73, 0.15)', border: '1px solid #bc4749', color: reviewingId ? '#837560' : '#bc4749', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                        >
                          <X size={16} /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'spots' && (
          <div>
            {reviewError && <div className="load-error">{reviewError}</div>}
            {listError && <div className="load-error">{listError}<button onClick={()=>void fetchSpots()}>Retry</button></div>}
            {listLoading ? <div className="stitch-panel loading-panel">Loading spots…</div> : <div className="quest-grid">
              {spots.map(s => (
                <div key={s.id} className="stitch-card" style={{padding:'20px',display:'flex',flexDirection:'column',gap:'8px'}}>
                  {s.image_url ? <img src={s.image_url} alt={s.name} style={{width:'100%',height:'120px',objectFit:'cover',borderRadius:'12px'}} /> : null}
                  <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                    <span style={{fontSize:'10px',fontWeight:700,textTransform:'uppercase',padding:'4px 8px',borderRadius:'6px',background:'#beead1',color:'#436b58'}}>{s.subcategory.replace(/_/g,' ')}</span>
                    <span style={{fontSize:'10px',fontWeight:700,padding:'4px 8px',borderRadius:'6px',background:s.source_type==='community_resident'?'#ffe082':'#e0e0e0',color:'#582f0e'}}>{s.source_type==='community_resident'?'Community Uploaded':s.source_name}</span>
                  </div>
                  <h3 style={{fontSize:'18px',fontWeight:800,color:'#582f0e',margin:'4px 0'}}>{s.name}</h3>
                  <p style={{fontSize:'13px',color:'#514532'}}>{s.municipality}</p>
                  <p style={{fontSize:'11px',color:'#837560',marginTop:'4px'}}>Source: {s.source_name} · Trust: {s.trust_level}</p>
                  <p style={{fontSize:'11px',fontWeight:700,color:s.crowd_status==='estimated_busy'?'#bc4749':'#436b58'}}>Status: {s.status.replace(/_/g,' ')} · Crowd: {(s.crowd_status||'unknown').replace(/_/g,' ')}</p>
                  <label style={{fontSize:'11px',color:'#514532'}}>Capacity band <select value={s.crowd_capacity_band||'medium'} disabled={reviewingId===s.id} onChange={e=>void reviewSpot(s,s.status as 'published'|'needs_review'|'unpublished',e.target.value as Spot['crowd_capacity_band'])} style={{marginLeft:'6px',padding:'5px',borderRadius:'6px'}}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                  <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>{s.status!=='published'&&<button disabled={reviewingId===s.id} onClick={()=>void reviewSpot(s,'published')} style={{padding:'7px 10px',borderRadius:'8px',background:'#2d6a4f',color:'white',fontWeight:700}}>Approve</button>}<button disabled={reviewingId===s.id} onClick={()=>void reviewSpot(s,'unpublished')} style={{padding:'7px 10px',borderRadius:'8px',background:'#f3e5d0',color:'#582f0e',fontWeight:700}}>{s.status==='published'?'Unpublish':'Reject'}</button><button disabled={reviewingId===s.id} onClick={()=>void reviewSpot(s,s.status==='published'?'published':'unpublished',s.crowd_capacity_band,!s.recommendation_suppressed)} style={{padding:'7px 10px',borderRadius:'8px',background:'#e9e8e4',fontWeight:700}}>{s.recommendation_suppressed?'Allow alternatives':'Suppress alternative'}</button></div>
                </div>
              ))}
            </div>}
          </div>
        )}

        {activeTab === 'quests' && (
          <div>
          {listError && <div className="load-error" role="alert">{listError} <button onClick={() => void fetchQuests()}>Retry</button></div>}
          {listLoading ? <div className="stitch-panel loading-panel">Loading quests…</div> : <div className="quest-grid">
            {quests.map((q) => (
              <div key={q.id} className="stitch-card" style={{ padding: '20px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '6px', background: '#beead1', color: '#436b58', marginBottom: '8px', display: 'inline-block' }}>
                  {q.category}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#582f0e', marginBottom: '6px' }}>{q.title}</h3>
                <p style={{ fontSize: '13px', color: '#514532', marginBottom: '14px' }}>{q.location_name}</p>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', background: '#efeeea', padding: '10px 14px', borderRadius: '10px' }}>
                  <span>Reward: <strong style={{ color: '#7d5800' }}>+{q.reward_points} PTS</strong></span>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#582f0e', fontWeight: 700 }}>{q.marker_code}</span>
                 </div>
                 <p style={{ fontSize: '11px', color: '#837560', marginTop: '10px' }}>GPS radius: {q.radius_meters}m · Proof: marker code + captured coordinates</p>
              </div>
            ))}
          </div>}
          </div>
        )}

        {/* Governance, tokenomics analytics, and Community Quest controls */}
        {activeTab === 'proposals' && (
          <GovernanceControlCenter token={token} onUnauthorized={handleLogout} />
        )}

        {/* Merchant Vouchers Tab */}
        {activeTab === 'vouchers' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {vouchers.map((v) => (
              <div key={v.id} className="stitch-card" style={{ padding: '20px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '4px 8px', borderRadius: '6px', background: 'rgba(63, 102, 83, 0.12)', color: '#3f6653', marginBottom: '8px', display: 'inline-block' }}>
                  {v.category}
                </span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#582f0e', marginBottom: '4px' }}>{v.offer_title}</h3>
                <p style={{ fontSize: '13px', fontWeight: 600, color: '#1b1c1a', marginBottom: '14px' }}>{v.merchant_name}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', background: '#efeeea', padding: '10px 14px', borderRadius: '10px' }}>
                  <span>Cost: <strong style={{ color: '#7d5800' }}>{v.cost_points} PTS</strong></span>
                  <span style={{ fontSize: '11px', color: '#2d6a4f', fontWeight: 700 }}>ACTIVE MERCHANT</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Reject Reason Modal */}
      {showRejectModal && selectedSub && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(13, 27, 42, 0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 100 }}>
          <div className="stitch-panel" role="dialog" aria-modal="true" aria-labelledby="reject-title" aria-describedby="reject-description" style={{ width: '100%', maxWidth: '440px', padding: '28px' }}>
            <h3 id="reject-title" style={{ fontSize: '20px', fontWeight: 800, marginBottom: '12px', color: '#bc4749' }}>Reject Quest Submission</h3>
            <p id="reject-description" style={{ fontSize: '14px', color: '#514532', marginBottom: '16px' }}>
              Please state the reason for rejecting <strong>{selectedSub.user_name}</strong>'s proof:
            </p>
            <textarea
              ref={rejectInputRef}
              aria-label="Rejection reason"
              required
              rows={4}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., GPS distance offset exceeded maximum radius threshold."
              style={{ width: '100%', background: '#faf9f5', border: '1px solid #d5c4ac', borderRadius: '10px', padding: '12px', color: '#1b1c1a', fontSize: '14px', marginBottom: '20px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectionReason('');
                  requestAnimationFrame(() => rejectTriggerRef.current?.focus());
                }}
                disabled={reviewingId !== null}
                style={{ padding: '10px 16px', borderRadius: '10px', background: '#e9e8e4', color: '#514532', fontWeight: 600 }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleReview(selectedSub.id, 'reject', rejectionReason.trim())}
                disabled={!rejectionReason.trim() || reviewingId !== null}
                style={{ padding: '10px 16px', borderRadius: '10px', background: '#bc4749', color: '#fff', fontWeight: 700 }}
              >
                {reviewingId ? 'Rejecting…' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
