import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useRouter } from '../router';
import { PageHeader } from '../components/PageState';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { ProceduralBannerPreview } from '../components/cosmetics/ProceduralBannerPreview';
import type { CosmeticItem } from './ShopCosmeticEditorPage';

type Teaser = {
  id: string;
  title: string;
  description: string;
  icon_key: string;
  eta_text: string | null;
  sort_order: number;
  is_active: boolean;
};

const KIND_FILTERS = ['all', 'banner', 'frame', 'title', 'name_color'] as const;
type KindFilter = (typeof KIND_FILTERS)[number];

export function ShopCosmeticsPage() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<CosmeticItem[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [teasers, setTeasers] = useState<Teaser[]>([]);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeId, setActiveId] = useState('');
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [catalog, shopStats, teaserItems] = await Promise.all([
        apiFetch<CosmeticItem[]>('/admin/shop/cosmetics'),
        apiFetch<any>('/admin/shop/stats'),
        apiFetch<Teaser[]>('/admin/shop/teasers'),
      ]);
      setItems(catalog);
      setStats(shopStats);
      setTeasers(teaserItems);
    } catch (e: any) {
      setError(e.message || 'Shop admin data unavailable.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deactivate = async (item: CosmeticItem) => {
    try {
      await apiFetch(`/admin/shop/cosmetics/${item.id}`, { method: 'PATCH', body: { is_active: false } });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const grant = async () => {
    try {
      await apiFetch(`/admin/shop/cosmetics/${activeId}/grant`, {
        method: 'POST',
        body: { user_id: target.trim(), reason: reason.trim() },
      });
      setMessage('Grant recorded.');
      setActiveId('');
      setTarget('');
      setReason('');
      await load();
    } catch (e: any) {
      setError(e.message || 'Grant failed.');
    }
  };

  const saveTeasers = async () => {
    try {
      await apiFetch('/admin/shop/teasers', { method: 'PUT', body: { items: teasers } });
      setMessage('Teasers saved.');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.kind.toLowerCase().includes(q) ||
        item.rarity.toLowerCase().includes(q)
      );
    });
  }, [items, kindFilter, search]);

  const { page, totalPages, pageItems: pagedItems, setPage } = useClientPagination(filteredItems, 24);

  return (
    <div>
      <PageHeader
        title="Cosmetics shop"
        description="Manage the traveler cosmetic catalog, grants, sales metrics, and coming soon cards."
        actions={
          <button
            type="button"
            className="button button-approve"
            onClick={() => navigate('/shop/cosmetics/new')}
          >
            <Plus size={15} aria-hidden="true" /> Create cosmetic
          </button>
        }
      />

      {error ? <p role="alert" className="status-banner status-banner-danger">{error}</p> : null}
      {message ? <p role="status" className="status-banner status-banner-success">{message}</p> : null}

      <div className="metric-grid">
        <div className="metric-card"><span>Items sold</span><strong>{stats?.totals?.itemsSold ?? 0}</strong></div>
        <div className="metric-card"><span>Points spent</span><strong>{stats?.totals?.pointsSpent ?? 0}</strong></div>
        <div className="metric-card"><span>Catalog items</span><strong>{items.length}</strong></div>
      </div>

      <section className="panel-section">
        <h2 className="section-title">Catalog</h2>
        <div className="filter-row">
          <span className="filter-label">Kind</span>
          {KIND_FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${kindFilter === value ? ' is-active' : ''}`}
              aria-pressed={kindFilter === value}
              onClick={() => setKindFilter(value)}
            >
              {value.replace('_', ' ')} ({value === 'all' ? items.length : items.filter((item) => item.kind === value).length})
            </button>
          ))}
        </div>

        <AdminSearchBar
          search={search}
          onSearchChange={setSearch}
          placeholder="Search cosmetic name, ID, rarity…"
          resultCount={filteredItems.length}
          totalCount={items.length}
        />

        <div className="table-scroll">
          <table className="data-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Preview</th>
                <th>Cosmetic</th>
                <th>Kind / rarity</th>
                <th>Points</th>
                <th>tJDQ</th>
                <th>Unlock</th>
                <th>Active</th>
                <th>Owners</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedItems.map((item) => (
                <tr key={item.id}>
                  <td><Swatch item={item} /></td>
                  <td><strong>{item.name}</strong><small><code>{item.id}</code></small></td>
                  <td>{item.kind}<small>{item.rarity}</small></td>
                  <td>{item.price_points ?? '—'}</td>
                  <td>{item.price_tjdq ?? '—'}</td>
                  <td>{item.unlock_achievement_id ?? '—'}</td>
                  <td><span className="status-pill">{item.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>{item.owners ?? 0}</td>
                  <td>
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => navigate(`/shop/cosmetics/edit?id=${encodeURIComponent(item.id)}`)}
                    >
                      Edit
                    </button>
                    <button type="button" className="button button-secondary" onClick={() => setActiveId(item.id)}>
                      Grant
                    </button>
                    {item.is_active ? (
                      <button type="button" className="button button-secondary" onClick={() => void deactivate(item)}>
                        Deactivate
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination page={page} totalPages={totalPages} totalItems={filteredItems.length} onPageChange={setPage} />
      </section>

      <section className="panel-section">
        <h2 className="section-title">Coming soon teasers</h2>
        {teasers.map((teaser, index) => (
          <div key={teaser.id} className="form-grid" style={{ marginBottom: 10 }}>
            <label>
              Title
              <input
                value={teaser.title}
                onChange={(e) => setTeasers((current) => current.map((item, i) => (i === index ? { ...item, title: e.target.value } : item)))}
              />
            </label>
            <label>
              Description
              <input
                value={teaser.description}
                onChange={(e) => setTeasers((current) => current.map((item, i) => (i === index ? { ...item, description: e.target.value } : item)))}
              />
            </label>
            <label>
              ETA
              <input
                value={teaser.eta_text || ''}
                onChange={(e) => setTeasers((current) => current.map((item, i) => (i === index ? { ...item, eta_text: e.target.value } : item)))}
              />
            </label>
          </div>
        ))}
        <button type="button" className="button button-secondary" onClick={() => void saveTeasers()}>
          Save teasers
        </button>
      </section>

      {activeId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="stitch-panel modal-panel" role="dialog" aria-modal="true" aria-labelledby="grant-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 id="grant-title">Grant to traveler</h2>
            <label className="settings-field">
              Traveler ID
              <input value={target} onChange={(e) => setTarget(e.target.value)} />
            </label>
            <label className="settings-field">
              Reason (10 characters minimum)
              <input minLength={10} value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-approve"
                disabled={!target || reason.trim().length < 10}
                onClick={() => void grant()}
              >
                Grant item
              </button>
              <button type="button" className="button button-secondary" onClick={() => setActiveId('')}>
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Swatch({ item }: { item: CosmeticItem }) {
  if (item.kind === 'banner' && item.asset?.style === 'procedural') {
    return (
      <div style={{ width: 96 }}>
        <ProceduralBannerPreview asset={item.asset} seed={item.seed ?? 0} motion="still" aspect={2} />
      </div>
    );
  }
  const isGradientBanner = item.kind === 'banner';
  if (isGradientBanner) {
    return (
      <span
        aria-label={`${item.name} preview swatch`}
        style={{
          display: 'block',
          width: 96,
          aspectRatio: '2 / 1',
          borderRadius: 6,
          background: `linear-gradient(${item.asset?.angle || 135}deg,${(item.asset?.colors || ['#f4a261', '#e76f51']).join(',')})`,
        }}
      />
    );
  }
  return (
    <span
      aria-label={`${item.name} preview swatch`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 48,
        padding: '4px 8px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 700,
        ...(item.kind === 'name_color' ? { color: item.asset?.color } : {}),
      }}
    >
      {item.kind === 'title' ? item.asset?.text : item.kind === 'name_color' ? item.name : item.kind === 'frame' ? '◉' : null}
    </span>
  );
}
