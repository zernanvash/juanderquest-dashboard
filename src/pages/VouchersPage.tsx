import { useCallback, useEffect, useState } from 'react';
import { Store } from 'lucide-react';
import { apiFetch } from '../api/client';
import { PageHeader } from '../components/PageState';
import { describeError } from '../utils/errors';
import type { Voucher } from '../types';

export function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchVouchers = useCallback(async (signal?: AbortSignal) => {
    try {
      setLoading(true);
      setError('');
      const data = await apiFetch<Voucher[]>('/vouchers', { signal });
      setVouchers(Array.isArray(data) ? data : []);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Voucher service unavailable.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetchVouchers(controller.signal);
    return () => controller.abort();
  }, [fetchVouchers]);

  return (
    <div>
      <PageHeader
        title="Merchant vouchers"
        description="Voucher offers currently visible to travelers. Merchant owners manage their own catalog through the traveler merchant workspace."
      />

      {error ? (
        <div className="load-error" role="alert">
          {error} <button type="button" onClick={() => void fetchVouchers()}>Retry</button>
        </div>
      ) : null}

      {loading ? (
        <div className="stitch-panel loading-panel">Loading vouchers…</div>
      ) : vouchers.length === 0 ? (
        <div className="stitch-panel page-state page-state-empty">
          <Store size={40} style={{ opacity: 0.5, marginBottom: 12 }} aria-hidden="true" />
          <p className="page-state-title">No active vouchers are available.</p>
        </div>
      ) : (
        <div className="voucher-grid">
          {vouchers.map((voucher) => (
            <div key={voucher.id} className="stitch-card voucher-card">
              <h3 className="destination-title">{voucher.title}</h3>
              <p className="voucher-merchant">{voucher.merchant_name}</p>
              <p className="voucher-description">{voucher.description}</p>
              <div className="quest-reward-row">
                <span>
                  Cost: <strong>{voucher.cost_points} mJDQ</strong>
                </span>
                <span className="good-text voucher-status">Available offer</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
