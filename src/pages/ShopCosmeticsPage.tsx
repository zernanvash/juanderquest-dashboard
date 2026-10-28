import { FormEvent, useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { paletteColors, type GeneratorId } from '../components/cosmetics/procedural';
import { ProceduralBannerPreview } from '../components/cosmetics/ProceduralBannerPreview';

type Item = { id: string; kind: string; name: string; description: string; rarity: string; price_points: number | null; price_tjdq: number | null; unlock_achievement_id: string | null; asset: any; is_active: boolean; owners?: number; seed?: number };
type Teaser = { id: string; title: string; description: string; icon_key: string; eta_text: string | null; sort_order: number; is_active: boolean };
const PALETTE = ['#2d6a4f', '#c2410c', '#1d4ed8', '#7e22ce'];
const DEFAULT_ASSETS: Record<string, any> = {
  banner: { style: 'gradient', colors: ['#f4a261', '#e76f51'], angle: 135, pattern: 'sun' },
  frame: { style: 'ring', colors: ['#95d5b2', '#2d6a4f'], width: 3, animated: false },
  title: { text: 'New title' },
  name_color: { color: PALETTE[0] },
};
const GENERATOR_LABELS: Record<GeneratorId, string> = {
  sunset: 'Lingayen Sunset', islands: 'Hundred Islands', bangus: 'Bangus Run',
  banderitas: "Pista'y Dayat", asin: 'Asin Pans', topo: 'Quest Trail',
  habi: 'Habi Weave', alitaptap: 'Alitaptap',
};
const PATTERNS = ['none', 'waves', 'islands', 'capiz', 'bamboo', 'sun'];

function proceduralAsset(generator: GeneratorId, palette: string) {
  const colors = paletteColors[generator][palette];
  const angle = 160;
  const pattern = generator === 'sunset' || generator === 'bangus' ? 'waves' : generator === 'islands' || generator === 'topo' ? 'islands' : 'none';
  return { style: 'procedural', generator, palette, colors: [...colors], fallback: { colors: colors.slice(0, 2), angle, pattern }, angle, pattern };
}

export function ShopCosmeticsPage() {
  const [items, setItems] = useState<Item[]>([]), [stats, setStats] = useState<any>(null), [teasers, setTeasers] = useState<Teaser[]>([]), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [kind, setKind] = useState('banner'), [id, setId] = useState(''), [name, setName] = useState(''), [rarity, setRarity] = useState('common'), [price, setPrice] = useState('150'), [asset, setAsset] = useState<any>(DEFAULT_ASSETS.banner), [unlock, setUnlock] = useState(''), [activeId, setActiveId] = useState(''), [target, setTarget] = useState(''), [reason, setReason] = useState(''), [editingId, setEditingId] = useState('');

  const load = useCallback(async () => {
    try {
      const [catalog, shopStats, teaserItems] = await Promise.all([apiFetch<Item[]>('/admin/shop/cosmetics'), apiFetch<any>('/admin/shop/stats'), apiFetch<Teaser[]>('/admin/shop/teasers')]);
      setItems(catalog); setStats(shopStats); setTeasers(teaserItems);
    } catch (e: any) { setError(e.message || 'Shop admin data unavailable.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const changeKind = (value: string) => { setKind(value); setAsset(DEFAULT_ASSETS[value]); };
  const changeStyle = (style: 'gradient' | 'procedural') => {
    setAsset(style === 'procedural' ? proceduralAsset('sunset', 'golden') : DEFAULT_ASSETS.banner);
  };
  const changeGenerator = (generator: GeneratorId) => {
    const palette = Object.keys(paletteColors[generator])[0];
    setAsset(proceduralAsset(generator, palette));
  };
  const changePalette = (palette: string) => setAsset((current: any) => proceduralAsset(current.generator as GeneratorId, palette));

  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const payload = { id: id.trim(), kind, name: name.trim(), rarity, price_points: price ? Number(price) : null, price_tjdq: null, unlock_achievement_id: unlock.trim() || null, asset, is_active: true };
      const body = editingId
        ? Object.fromEntries(Object.entries(payload).filter(([field]) => field !== 'id'))
        : payload;
      await apiFetch(editingId ? `/admin/shop/cosmetics/${editingId}` : '/admin/shop/cosmetics', { method: editingId ? 'PATCH' : 'POST', body });
      setMessage(editingId ? 'Cosmetic updated.' : 'Cosmetic created.'); setEditingId(''); setId(''); setName(''); await load();
    } catch (e: any) { setError(e.message || 'Could not save cosmetic.'); }
  };
  const edit = (item: Item) => { setEditingId(item.id); setId(item.id); setKind(item.kind); setName(item.name); setRarity(item.rarity); setPrice(item.price_points == null ? '' : String(item.price_points)); setAsset(item.asset); setUnlock(item.unlock_achievement_id || ''); };
  const cancelEdit = () => { setEditingId(''); setId(''); setName(''); setKind('banner'); setAsset(DEFAULT_ASSETS.banner); };
  const deactivate = async (item: Item) => { try { await apiFetch(`/admin/shop/cosmetics/${item.id}`, { method: 'PATCH', body: { is_active: false } }); await load(); } catch (e: any) { setError(e.message); } };
  const grant = async () => { try { await apiFetch(`/admin/shop/cosmetics/${activeId}/grant`, { method: 'POST', body: { user_id: target.trim(), reason: reason.trim() } }); setMessage('Grant recorded.'); setActiveId(''); setTarget(''); setReason(''); await load(); } catch (e: any) { setError(e.message || 'Grant failed.'); } };
  const saveTeasers = async () => { try { await apiFetch('/admin/shop/teasers', { method: 'PUT', body: { items: teasers } }); setMessage('Teasers saved.'); } catch (e: any) { setError(e.message); } };

  return <div>
    <PageHeader title="Cosmetics shop" description="Manage the traveler cosmetic catalog, grants, sales metrics, and coming soon cards." />
    {error && <p role="alert" className="status-banner status-banner-danger">{error}</p>}{message && <p role="status" className="status-banner status-banner-success">{message}</p>}
    <div className="metric-grid"><div className="metric-card"><span>Items sold</span><strong>{stats?.totals?.itemsSold ?? 0}</strong></div><div className="metric-card"><span>Points spent</span><strong>{stats?.totals?.pointsSpent ?? 0}</strong></div><div className="metric-card"><span>Catalog items</span><strong>{items.length}</strong></div></div>
    <section className="panel-section"><h2 className="section-title">Catalog</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Preview</th><th>Cosmetic</th><th>Kind / rarity</th><th>Points</th><th>tJDQ</th><th>Unlock</th><th>Active</th><th>Owners</th><th>Actions</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Swatch item={item} /></td><td><strong>{item.name}</strong><small><code>{item.id}</code></small></td><td>{item.kind}<small>{item.rarity}</small></td><td>{item.price_points ?? '—'}</td><td>{item.price_tjdq ?? '—'}</td><td>{item.unlock_achievement_id ?? '—'}</td><td><span className="status-pill">{item.is_active ? 'Active' : 'Inactive'}</span></td><td>{item.owners ?? 0}</td><td><button className="button button-secondary" onClick={() => edit(item)}>Edit</button><button className="button button-secondary" onClick={() => setActiveId(item.id)}>Grant</button>{item.is_active && <button className="button button-secondary" onClick={() => void deactivate(item)}>Deactivate</button>}</td></tr>)}</tbody></table></div></section>
    <section className="panel-section"><h2 className="section-title">{editingId ? 'Edit cosmetic' : 'Create cosmetic'}</h2>{editingId && <button type="button" className="button button-secondary" onClick={cancelEdit}>Cancel edit</button>}
      <form className="form-grid" onSubmit={save}>
        <label>ID<input required minLength={3} maxLength={60} pattern="[a-z0-9-]+" value={id} readOnly={Boolean(editingId)} onChange={(e) => setId(e.target.value)} /></label>
        <label>Name<input required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Kind<select value={kind} onChange={(e) => changeKind(e.target.value)}>{['banner', 'frame', 'title', 'name_color'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Rarity<select value={rarity} onChange={(e) => setRarity(e.target.value)}>{['common', 'rare', 'epic', 'legendary'].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Points price<input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} /></label>
        <label>Unlock achievement<input value={unlock} onChange={(e) => setUnlock(e.target.value)} placeholder="Optional achievement ID" /></label>
        {kind === 'banner' && <>
          <label>Style<select value={asset.style === 'procedural' ? 'procedural' : 'gradient'} onChange={(e) => changeStyle(e.target.value as 'gradient' | 'procedural')}><option value="gradient">Gradient</option><option value="procedural">Procedural</option></select></label>
          {asset.style === 'procedural' ? <>
            <label>Generator<select value={asset.generator} onChange={(e) => changeGenerator(e.target.value as GeneratorId)}>{Object.entries(GENERATOR_LABELS).map(([generator, label]) => <option key={generator} value={generator}>{label}</option>)}</select></label>
            <label>Palette<select value={asset.palette} onChange={(e) => changePalette(e.target.value)}>{Object.keys(paletteColors[asset.generator as GeneratorId]).map((palette) => <option key={palette} value={palette}>{palette}</option>)}</select></label>
            <div className="detail-drawer" style={{ gridColumn: '1 / -1' }}><strong>Live procedural preview</strong><ProceduralBannerPreview asset={asset} seed={0} motion="auto" aspect={3} /></div>
          </> : <>
            <label>Start colour<input type="color" value={asset.colors[0]} onChange={(e) => setAsset((current: any) => ({ ...current, colors: [e.target.value, ...current.colors.slice(1)] }))} /></label>
            <label>End colour<input type="color" value={asset.colors[1]} onChange={(e) => setAsset((current: any) => ({ ...current, colors: [current.colors[0], e.target.value] }))} /></label>
            <label>Pattern<select value={asset.pattern} onChange={(e) => setAsset((current: any) => ({ ...current, pattern: e.target.value }))}>{PATTERNS.map((pattern) => <option key={pattern}>{pattern}</option>)}</select></label>
          </>}
        </>}
        {kind === 'frame' && <><label>Ring colour<input type="color" value={asset.colors[0]} onChange={(e) => setAsset((current: any) => ({ ...current, colors: [e.target.value, ...current.colors.slice(1)] }))} /></label><label>Width<input type="number" min="2" max="6" value={asset.width} onChange={(e) => setAsset((current: any) => ({ ...current, width: Number(e.target.value) }))} /></label><label className="form-check"><input type="checkbox" checked={asset.animated} onChange={(e) => setAsset((current: any) => ({ ...current, animated: e.target.checked }))} /> Animated ring (legendary)</label></>}
        {kind === 'title' && <label>Title preview<input maxLength={24} value={asset.text} onChange={(e) => setAsset({ text: e.target.value })} /></label>}
        {kind === 'name_color' && <label>Name colour<select value={asset.color} onChange={(e) => setAsset({ color: e.target.value })}>{PALETTE.map((color) => <option key={color} value={color}>{color}</option>)}</select></label>}
        <div className="form-actions"><button className="button button-approve" type="submit">{editingId ? 'Save changes' : 'Create item'}</button></div>
      </form>
      {kind !== 'banner' || asset.style !== 'procedural' ? <div className="detail-drawer"><strong>Live preview</strong><div className="mt-2"><Swatch item={{ id: 'preview', name: name || 'Preview', kind, asset } as Item} /></div></div> : null}
    </section>
    <section className="panel-section"><h2 className="section-title">Coming soon teasers</h2>{teasers.map((teaser, index) => <div key={teaser.id} className="form-grid" style={{ marginBottom: 10 }}><label>Title<input value={teaser.title} onChange={(e) => setTeasers((current) => current.map((item, i) => i === index ? { ...item, title: e.target.value } : item))} /></label><label>Description<input value={teaser.description} onChange={(e) => setTeasers((current) => current.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} /></label><label>ETA<input value={teaser.eta_text || ''} onChange={(e) => setTeasers((current) => current.map((item, i) => i === index ? { ...item, eta_text: e.target.value } : item))} /></label></div>)}<button className="button button-secondary" onClick={() => void saveTeasers()}>Save teasers</button></section>
    {activeId && <div className="modal-backdrop" role="presentation"><section className="stitch-panel" role="dialog" aria-modal="true" aria-labelledby="grant-title"><h2 id="grant-title">Grant to traveler</h2><label className="settings-field">Traveler ID<input value={target} onChange={(e) => setTarget(e.target.value)} /></label><label className="settings-field">Reason (10 characters minimum)<input minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} /></label><div className="form-actions"><button className="button button-approve" disabled={!target || reason.trim().length < 10} onClick={() => void grant()}>Grant item</button><button className="button button-secondary" onClick={() => setActiveId('')}>Cancel</button></div></section></div>}
  </div>;
}

function Swatch({ item }: { item: Item }) {
  if (item.kind === 'banner' && item.asset?.style === 'procedural') return <ProceduralBannerPreview asset={item.asset} seed={item.seed ?? 0} motion="still" aspect={2} className="w-24" />;
  const isGradientBanner = item.kind === 'banner';
  const style = isGradientBanner
    ? { background: `linear-gradient(${item.asset?.angle || 135}deg,${(item.asset?.colors || ['#f4a261', '#e76f51']).join(',')})` }
    : item.kind === 'name_color'
    ? { color: item.asset?.color }
    : {};
  const className = isGradientBanner
    ? 'inline-block w-24 aspect-[2/1] rounded'
    : 'inline-flex min-w-12 items-center justify-center rounded-md px-2 py-1 text-xs font-bold';
  return <span aria-label={`${item.name} preview swatch`} className={className} style={style}>{item.kind === 'title' ? item.asset?.text : item.kind === 'name_color' ? item.name : item.kind === 'frame' ? '◉' : null}</span>;
}
