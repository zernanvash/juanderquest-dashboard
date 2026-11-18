import { FormEvent, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useRouter } from '../router';
import { PageHeader } from '../components/PageState';
import { paletteColors, type GeneratorId } from '../components/cosmetics/procedural';
import { ProceduralBannerPreview } from '../components/cosmetics/ProceduralBannerPreview';

export type CosmeticItem = {
  id: string;
  kind: string;
  name: string;
  description: string;
  rarity: string;
  price_points: number | null;
  price_tjdq: number | null;
  unlock_achievement_id: string | null;
  asset: any;
  is_active: boolean;
  owners?: number;
  seed?: number;
};

const PALETTE = ['#2d6a4f', '#c2410c', '#1d4ed8', '#7e22ce'];

const DEFAULT_ASSETS: Record<string, any> = {
  banner: { style: 'gradient', colors: ['#f4a261', '#e76f51'], angle: 135, pattern: 'sun' },
  frame: { style: 'ring', colors: ['#95d5b2', '#2d6a4f'], width: 3, animated: false },
  title: { text: 'New title' },
  name_color: { color: PALETTE[0] },
};

const GENERATOR_LABELS: Record<GeneratorId, string> = {
  sunset: 'Lingayen Sunset',
  islands: 'Hundred Islands',
  bangus: 'Bangus Run',
  banderitas: "Pista'y Dayat",
  asin: 'Asin Pans',
  topo: 'Quest Trail',
  habi: 'Habi Weave',
  alitaptap: 'Alitaptap',
};

const PATTERNS = ['none', 'waves', 'islands', 'capiz', 'bamboo', 'sun'];

function proceduralAsset(generator: GeneratorId, palette: string) {
  const colors = paletteColors[generator][palette];
  const angle = 160;
  const pattern =
    generator === 'sunset' || generator === 'bangus'
      ? 'waves'
      : generator === 'islands' || generator === 'topo'
        ? 'islands'
        : 'none';
  return {
    style: 'procedural',
    generator,
    palette,
    colors: [...colors],
    fallback: { colors: colors.slice(0, 2), angle, pattern },
    angle,
    pattern,
  };
}

export function ShopCosmeticEditorPage() {
  const { query, navigate } = useRouter();
  const editingId = query.get('id') ?? '';
  const isEditing = Boolean(editingId);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [id, setId] = useState(editingId);
  const [kind, setKind] = useState('banner');
  const [name, setName] = useState('');
  const [rarity, setRarity] = useState('common');
  const [price, setPrice] = useState('150');
  const [unlock, setUnlock] = useState('');
  const [asset, setAsset] = useState<any>(DEFAULT_ASSETS.banner);
  const [seed, setSeed] = useState(0);

  useEffect(() => {
    if (!editingId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const catalog = await apiFetch<CosmeticItem[]>('/admin/shop/cosmetics');
        if (cancelled) return;
        const found = catalog.find((item) => item.id === editingId);
        if (!found) {
          setError(`Cosmetic "${editingId}" was not found.`);
          return;
        }
        setId(found.id);
        setKind(found.kind);
        setName(found.name);
        setRarity(found.rarity);
        setPrice(found.price_points == null ? '' : String(found.price_points));
        setUnlock(found.unlock_achievement_id || '');
        setAsset(found.asset ?? DEFAULT_ASSETS[found.kind] ?? DEFAULT_ASSETS.banner);
        setSeed(found.seed ?? 0);
      } catch (cause: any) {
        if (!cancelled) setError(cause?.message || 'Could not load cosmetic.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId]);

  const changeKind = (value: string) => {
    setKind(value);
    setAsset(DEFAULT_ASSETS[value]);
  };

  const changeStyle = (style: 'gradient' | 'procedural') => {
    setAsset(style === 'procedural' ? proceduralAsset('sunset', 'golden') : DEFAULT_ASSETS.banner);
  };

  const changeGenerator = (generator: GeneratorId) => {
    const palette = Object.keys(paletteColors[generator])[0];
    setAsset(proceduralAsset(generator, palette));
  };

  const changePalette = (palette: string) => {
    setAsset((current: any) => proceduralAsset(current.generator as GeneratorId, palette));
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const payload = {
        id: id.trim(),
        kind,
        name: name.trim(),
        rarity,
        price_points: price ? Number(price) : null,
        price_tjdq: null,
        unlock_achievement_id: unlock.trim() || null,
        asset,
        is_active: true,
      };
      const body = isEditing
        ? Object.fromEntries(Object.entries(payload).filter(([field]) => field !== 'id'))
        : payload;
      await apiFetch(isEditing ? `/admin/shop/cosmetics/${editingId}` : '/admin/shop/cosmetics', {
        method: isEditing ? 'PATCH' : 'POST',
        body,
      });
      setMessage(isEditing ? 'Cosmetic updated.' : 'Cosmetic created.');
      if (!isEditing) {
        setId('');
        setName('');
      }
    } catch (cause: any) {
      setError(cause?.message || 'Could not save cosmetic.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={isEditing ? `Edit cosmetic${name ? `: ${name}` : ''}` : 'Create cosmetic'}
        description="Configure cosmetic metadata, procedural or gradient visuals, and preview how it appears on a traveler profile."
        actions={
          <button type="button" className="button button-secondary" onClick={() => navigate('/shop/cosmetics')}>
            <ArrowLeft size={15} aria-hidden="true" /> Back to catalog
          </button>
        }
      />

      {error ? <p role="alert" className="status-banner status-banner-danger">{error}</p> : null}
      {message ? <p role="status" className="status-banner status-banner-success">{message}</p> : null}

      {loading ? (
        <div className="stitch-panel loading-panel">Loading cosmetic…</div>
      ) : (
        <div className="cosmetic-editor-grid">
          <section className="stitch-panel cosmetic-editor-panel">
            <h2 className="section-title">Configuration</h2>
            <form className="form-grid" onSubmit={save}>
              <label>
                ID
                <input
                  required
                  minLength={3}
                  maxLength={60}
                  pattern="[a-z0-9-]+"
                  value={id}
                  readOnly={isEditing}
                  onChange={(e) => setId(e.target.value)}
                />
              </label>
              <label>
                Name
                <input
                  required
                  minLength={2}
                  maxLength={60}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                Kind
                <select value={kind} onChange={(e) => changeKind(e.target.value)}>
                  {['banner', 'frame', 'title', 'name_color'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Rarity
                <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
                  {['common', 'rare', 'epic', 'legendary'].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Points price
                <input type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} />
              </label>
              <label>
                Unlock achievement
                <input value={unlock} onChange={(e) => setUnlock(e.target.value)} placeholder="Optional achievement ID" />
              </label>

              {kind === 'banner' ? (
                <>
                  <label>
                    Style
                    <select
                      value={asset?.style === 'procedural' ? 'procedural' : 'gradient'}
                      onChange={(e) => changeStyle(e.target.value as 'gradient' | 'procedural')}
                    >
                      <option value="gradient">Gradient</option>
                      <option value="procedural">Procedural</option>
                    </select>
                  </label>
                  {asset?.style === 'procedural' ? (
                    <>
                      <label>
                        Generator
                        <select
                          value={asset.generator}
                          onChange={(e) => changeGenerator(e.target.value as GeneratorId)}
                        >
                          {Object.entries(GENERATOR_LABELS).map(([generator, label]) => (
                            <option key={generator} value={generator}>{label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Palette
                        <select value={asset.palette} onChange={(e) => changePalette(e.target.value)}>
                          {Object.keys(paletteColors[asset.generator as GeneratorId]).map((palette) => (
                            <option key={palette} value={palette}>{palette}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : (
                    <>
                      <label>
                        Start colour
                        <input
                          type="color"
                          value={asset?.colors?.[0] ?? '#f4a261'}
                          onChange={(e) =>
                            setAsset((current: any) => ({
                              ...current,
                              colors: [e.target.value, ...(current?.colors?.slice(1) ?? ['#e76f51'])],
                            }))
                          }
                        />
                      </label>
                      <label>
                        End colour
                        <input
                          type="color"
                          value={asset?.colors?.[1] ?? '#e76f51'}
                          onChange={(e) =>
                            setAsset((current: any) => ({
                              ...current,
                              colors: [current?.colors?.[0] ?? '#f4a261', e.target.value],
                            }))
                          }
                        />
                      </label>
                      <label>
                        Pattern
                        <select
                          value={asset?.pattern ?? 'sun'}
                          onChange={(e) => setAsset((current: any) => ({ ...current, pattern: e.target.value }))}
                        >
                          {PATTERNS.map((pattern) => (
                            <option key={pattern}>{pattern}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                </>
              ) : null}

              {kind === 'frame' ? (
                <>
                  <label>
                    Ring colour
                    <input
                      type="color"
                      value={asset?.colors?.[0] ?? '#95d5b2'}
                      onChange={(e) =>
                        setAsset((current: any) => ({
                          ...current,
                          colors: [e.target.value, ...(current?.colors?.slice(1) ?? ['#2d6a4f'])],
                        }))
                      }
                    />
                  </label>
                  <label>
                    Width
                    <input
                      type="number"
                      min="2"
                      max="6"
                      value={asset?.width ?? 3}
                      onChange={(e) => setAsset((current: any) => ({ ...current, width: Number(e.target.value) }))}
                    />
                  </label>
                  <label className="form-check">
                    <input
                      type="checkbox"
                      checked={Boolean(asset?.animated)}
                      onChange={(e) => setAsset((current: any) => ({ ...current, animated: e.target.checked }))}
                    />
                    Animated ring (legendary)
                  </label>
                </>
              ) : null}

              {kind === 'title' ? (
                <label>
                  Title preview
                  <input maxLength={24} value={asset?.text ?? ''} onChange={(e) => setAsset({ text: e.target.value })} />
                </label>
              ) : null}

              {kind === 'name_color' ? (
                <label>
                  Name colour
                  <select value={asset?.color ?? PALETTE[0]} onChange={(e) => setAsset({ color: e.target.value })}>
                    {PALETTE.map((color) => (
                      <option key={color} value={color}>{color}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="form-actions">
                <button className="button button-approve" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Create item'}
                </button>
                <button type="button" className="button button-secondary" onClick={() => navigate('/shop/cosmetics')}>
                  Cancel
                </button>
              </div>
            </form>
          </section>

          <aside className="stitch-panel cosmetic-preview-panel">
            <h2 className="section-title">Traveler profile preview</h2>
            <div className="cosmetic-profile-card">
              <div className="cosmetic-profile-banner">
                {kind === 'banner' && asset?.style === 'procedural' ? (
                  <ProceduralBannerPreview asset={asset} seed={seed} motion="auto" aspect={3} />
                ) : (
                  <div
                    aria-label="Banner preview"
                    className="cosmetic-profile-gradient"
                    style={{
                      background:
                        kind === 'banner'
                          ? `linear-gradient(${asset?.angle || 135}deg, ${(asset?.colors || ['#f4a261', '#e76f51']).join(', ')})`
                          : 'linear-gradient(135deg, #1b4332, #2d6a4f)',
                    }}
                  />
                )}
              </div>
              <div className="cosmetic-profile-body">
                <div
                  className="cosmetic-profile-avatar"
                  style={{
                    borderColor: kind === 'frame' ? asset?.colors?.[0] || '#95d5b2' : 'var(--accent)',
                    borderWidth: kind === 'frame' ? Math.max(2, Math.min(6, Number(asset?.width ?? 3))) : 3,
                  }}
                >
                  JQ
                </div>
                <div className="cosmetic-profile-identity">
                  <strong style={{ color: kind === 'name_color' ? asset?.color : undefined }}>
                    {name || 'Traveler Explorer'}
                  </strong>
                  <span className="cosmetic-profile-title-badge">
                    {kind === 'title' ? asset?.text || 'Title' : `${rarity.toUpperCase()} · ${kind.replace('_', ' ')}`}
                  </span>
                </div>
              </div>
            </div>
            <p className="destination-meta">
              Price: {price ? `${price} mJDQ` : 'Achievement unlock only'}
              {unlock.trim() ? ` · Unlocks via ${unlock.trim()}` : ''}
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
