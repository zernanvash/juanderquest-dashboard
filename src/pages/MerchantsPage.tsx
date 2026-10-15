import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Store, X } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { AdminMerchantDetail, AdminMerchantListItem } from '../types';

export function MerchantsPage() {
  const [merchants, setMerchants] = useState<AdminMerchantListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<AdminMerchantDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<AdminMerchantListItem[]>('/admin/merchants', { signal });
      setMerchants(data);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Unable to load the merchant directory.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const openDetail = async (merchantId: string) => {
    try {
      setDetailLoading(true);
      setDetailError('');
      setDetail(null);
      const data = await apiFetch<AdminMerchantDetail>(`/admin/merchants/${merchantId}`);
      setDetail(data);
    } catch (cause) {
      setDetailError(describeError(cause, 'Unable to load merchant details.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return merchants;
    return merchants.filter((merchant) =>
      [merchant.name, merchant.municipality, merchant.category, merchant.owner_display_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [merchants, search]);

  return (
    <div>
      <PageHeader
        title="Merchants"
        description="Directory and inspection of provisioned merchant workspaces. Owners keep publishing their profile and catalog in the traveler /merchant workspace."
      />

      <div className="readonly-banner" role="note">
        Staff suspend/hide/restore actions are deferred until a dedicated reasoned, audited API and ownership-visibility policy exist.
        This screen is read-only inspection and never silently deletes products or creates financial obligations.
      </div>

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      ) : null}

      <div className="filter-row">
        <div className="merchant-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search business, owner, town or category…"
            aria-label="Search merchants"
          />
        </div>
      </div>

      {loading ? (
        <div className="stitch-panel loading-panel">Loading merchant directory…</div>
      ) : filtered.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Store size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No merchant matches this view.</p>
        </div>
      ) : (
        <div className="merchant-grid">
          {filtered.map((merchant) => (
            <button
              key={merchant.id}
              type="button"
              className="stitch-card merchant-card"
              onClick={() => void openDetail(merchant.id)}
            >
              <div className="destination-tags">
                <span className={`status-pill ${merchant.is_published ? 'status-approved' : 'status-pending'}`}>
                  {merchant.is_published ? 'published' : 'draft'}
                </span>
                {merchant.status === 'suspended' ? <span className="status-pill status-rejected">suspended</span> : null}
                {merchant.category ? <span className="destination-tag">{merchant.category.replace(/_/g, ' ')}</span> : null}
              </div>
              <h3 className="destination-title">{merchant.name}</h3>
              <p className="destination-location">{merchant.municipality || merchant.location || 'Location not set'}</p>
              <p className="destination-meta">
                Owner: {merchant.owner_display_name || 'Not linked'} · {merchant.active_product_count} active product
                {merchant.active_product_count === 1 ? '' : 's'}
                {merchant.archived_product_count > 0 ? ` · ${merchant.archived_product_count} archived` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {detailLoading ? <div className="stitch-panel loading-panel">Loading merchant details…</div> : null}
      {detailError ? <div className="load-error" role="alert">{detailError}</div> : null}

      {detail ? (
        <div className="modal-backdrop">
          <div className="stitch-panel merchant-detail-panel" role="dialog" aria-modal="true" aria-labelledby="merchant-detail-title">
            <div className="quiz-editor-header">
              <div>
                <h2 id="merchant-detail-title">{detail.merchant.name}</h2>
                <p className="quiz-editor-subtitle">
                  {detail.merchant.municipality || detail.merchant.location} ·{' '}
                  {detail.merchant.status || 'active'} · {detail.merchant.is_published ? 'published showcase' : 'draft showcase'}
                </p>
              </div>
              <button type="button" className="quiz-editor-close" onClick={() => setDetail(null)} aria-label="Close merchant details">
                <X size={18} />
              </button>
            </div>

            <section className="merchant-detail-section">
              <h3>Business profile</h3>
              <p className="merchant-detail-description">{detail.merchant.description || 'No description recorded.'}</p>
              <div className="merchant-detail-grid">
                <div><span>Contact email</span><strong>{detail.merchant.contact_email || 'Not set'}</strong></div>
                <div><span>Contact phone</span><strong>{detail.merchant.contact_phone || 'Not set'}</strong></div>
                <div><span>Provisioned</span><strong>{new Date(detail.merchant.created_at).toLocaleDateString()}</strong></div>
                <div><span>Category</span><strong>{(detail.merchant.category || 'unset').replace(/_/g, ' ')}</strong></div>
              </div>
            </section>

            <section className="merchant-detail-section">
              <h3>Memberships</h3>
              {detail.memberships.length === 0 ? (
                <p className="jc-window-muted">No membership is recorded for this merchant.</p>
              ) : (
                <ul className="merchant-membership-list">
                  {detail.memberships.map((membership) => (
                    <li key={membership.id}>
                      <strong>{membership.member_display_name || 'Unknown member'}</strong>
                      <span>
                        {membership.role} · {membership.status} · since {new Date(membership.created_at).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="merchant-detail-section">
              <h3>Products ({detail.products.length})</h3>
              {detail.products.length === 0 ? (
                <p className="jc-window-muted">No products have been added yet.</p>
              ) : (
                <div className="merchant-product-list">
                  {detail.products.map((product) => (
                    <div key={product.id} className="merchant-product-row">
                      <div>
                        <strong>{product.name}</strong>
                        <span className="merchant-product-price">
                          {product.price != null ? `${product.currency} ${product.price}` : 'No price'}
                        </span>
                      </div>
                      <span className={`status-pill ${product.is_archived ? 'status-rejected' : product.is_published ? 'status-approved' : 'status-pending'}`}>
                        {product.is_archived ? 'archived' : product.is_published ? 'published' : 'hidden by owner'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="merchant-detail-section">
              <h3>Original affiliation application</h3>
              {detail.application ? (
                <p className="jc-window-muted">
                  {detail.application.business_name} · {detail.application.status} · {detail.application.municipality},{' '}
                  {detail.application.business_province || 'Pangasinan'} · submitted{' '}
                  {new Date(detail.application.created_at).toLocaleDateString()}
                  {detail.application.reviewed_at ? ` · reviewed ${new Date(detail.application.reviewed_at).toLocaleDateString()}` : ''}
                </p>
              ) : (
                <p className="jc-window-muted">No source application is linked to this merchant.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
