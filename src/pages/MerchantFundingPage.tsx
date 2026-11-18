import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, ShieldAlert, Store } from 'lucide-react';
import { apiFetch } from '../api/client';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { PageHeader } from '../components/PageState';
import { Link } from '../router';
import { describeError } from '../utils/errors';

interface MerchantFundingRow {
  merchant_id: string;
  name: string;
  category: string | null;
  municipality: string | null;
  status: string;
  is_published: boolean;
  is_test: boolean;
  sponsoring_suspended: boolean;
  sponsoring_suspended_reason: string | null;
  balance_points: number;
  total_credited: number;
  total_sponsored: number;
  sponsorship_counts: Record<string, number>;
  accepted_with_unmet_count: number;
  active_rounds_sponsored: number;
  last_activity: string | null;
}

interface MerchantFundingDetail {
  merchant: {
    id: string;
    name: string;
    municipality: string | null;
    status: string;
    is_published: boolean;
    is_test: boolean;
    sponsoring_suspended: boolean;
    sponsoring_suspended_reason: string | null;
    balance_points: number;
  };
  credits: any[];
  contributions: any[];
  sponsorships: any[];
}

export function MerchantFundingPage() {
  const [items, setItems] = useState<MerchantFundingRow[]>([]);
  const [selected, setSelected] = useState<MerchantFundingDetail | null>(null);
  const [search, setSearch] = useState('');
  const [includeTest, setIncludeTest] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ items: MerchantFundingRow[] }>(
        `/admin/merchant-funding${includeTest ? '?include_test=true' : ''}`,
        { signal },
      );
      setItems(res.items ?? []);
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(describeError(cause, 'Unable to load merchant funding overview.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [includeTest]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const inspectMerchant = async (merchantId: string) => {
    setBusy(merchantId);
    setError('');
    try {
      const detail = await apiFetch<MerchantFundingDetail>(`/admin/merchant-funding/${encodeURIComponent(merchantId)}`);
      setSelected(detail);
    } catch (cause) {
      setError(describeError(cause, 'Unable to load merchant funding detail.'));
    } finally {
      setBusy('');
    }
  };

  const toggleSponsoring = async (merchantId: string, suspend: boolean) => {
    setBusy(`suspend-${merchantId}`);
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/merchants/${encodeURIComponent(merchantId)}/sponsoring/${suspend ? 'suspend' : 'resume'}`, {
        method: 'POST',
        body: {
          ...(suspend ? { reason: suspendReason.trim() } : { reason: suspendReason.trim() || undefined }),
          idempotency_key: crypto.randomUUID(),
        },
      });
      setNotice(suspend ? 'Merchant sponsoring suspended.' : 'Merchant sponsoring resumed.');
      setSuspendReason('');
      await Promise.all([load(), inspectMerchant(merchantId)]);
    } catch (cause) {
      setError(describeError(cause, 'Unable to update merchant sponsoring status.'));
    } finally {
      setBusy('');
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) =>
      `${m.name} ${m.municipality ?? ''} ${m.category ?? ''} ${m.merchant_id}`.toLowerCase().includes(q),
    );
  }, [items, search]);

  const page = useClientPagination(filtered, 24);

  return (
    <div>
      <PageHeader
        title="Merchant funding oversight"
        description="Per-merchant simulated point balances, sponsorship volume, unmet-condition overrides, and sponsoring suspension controls."
      />

      {error && (
        <div className="load-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}
      {notice && <div className="status-banner status-banner-success" role="status">{notice}</div>}

      <section className="stitch-panel panel-section">
        <div className="section-heading-row">
          <div>
            <h2 className="section-title"><Store size={18} /> Merchants ({filtered.length})</h2>
            <p className="section-description">Select any merchant row to inspect its sponsorships, point credits, and round contributions.</p>
          </div>
          <div className="action-cluster">
            <label className="checkbox-inline">
              <input type="checkbox" checked={includeTest} onChange={(e) => setIncludeTest(e.target.checked)} />
              Include test data
            </label>
            <button type="button" className="button button-secondary" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
        </div>

        <AdminSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search merchant name, municipality, or ID…"
          ariaLabel="Search merchant funding"
          totalCount={items.length}
          filteredCount={filtered.length}
          shownCount={page.pageItems.length}
          itemLabel="merchants"
        />

        {loading ? (
          <p className="loading-panel">Loading merchant funding…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No merchants found.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Balance</th>
                    <th>Credited</th>
                    <th>Sponsored</th>
                    <th>Sponsorships</th>
                    <th>Unmet overrides</th>
                    <th>Active rounds</th>
                    <th>Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {page.pageItems.map((m) => (
                    <tr key={m.merchant_id} onClick={() => void inspectMerchant(m.merchant_id)} style={{ cursor: 'pointer' }}>
                      <td>
                        <strong>{m.name}</strong>
                        <small>
                          {m.municipality || 'No town'}
                          {m.is_test ? ' · TEST' : ''}
                          {m.sponsoring_suspended ? ' · SPONSORING SUSPENDED' : ''}
                        </small>
                      </td>
                      <td>{m.balance_points} pts</td>
                      <td>{m.total_credited} pts</td>
                      <td>{m.total_sponsored} pts</td>
                      <td>
                        {m.sponsorship_counts.accepted ?? 0} acc · {m.sponsorship_counts.requested ?? 0} req · {m.sponsorship_counts.countered ?? 0} ctr
                      </td>
                      <td>{m.accepted_with_unmet_count}</td>
                      <td>{m.active_rounds_sponsored}</td>
                      <td>{m.last_activity ? new Date(m.last_activity).toLocaleDateString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AdminPagination page={page.page} totalPages={page.totalPages} onPageChange={page.setPage} />
          </>
        )}
      </section>

      {selected && (
        <section className="stitch-panel panel-section" aria-label="Selected merchant funding detail">
          <div className="section-heading-row">
            <div>
              <h2 className="section-title"><ShieldAlert size={18} /> {selected.merchant.name}</h2>
              <p className="section-description">
                Balance: {selected.merchant.balance_points} pts ·{' '}
                {selected.merchant.sponsoring_suspended ? 'Sponsoring SUSPENDED' : 'Sponsoring active'}
              </p>
            </div>
            <button type="button" className="button button-secondary" onClick={() => setSelected(null)}>
              Close detail
            </button>
          </div>

          {selected.merchant.sponsoring_suspended && selected.merchant.sponsoring_suspended_reason && (
            <div className="status-banner status-banner-danger" role="status">
              <strong>Suspended reason:</strong> <span>{selected.merchant.sponsoring_suspended_reason}</span>
            </div>
          )}

          <div className="settings-grid" style={{ marginBottom: 12 }}>
            <label className="settings-field">
              Suspension / resume reason (min 5 chars to suspend)
              <input
                value={suspendReason}
                maxLength={500}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="Reason for suspending or resuming sponsoring"
              />
            </label>
          </div>
          <div className="action-cluster" style={{ marginBottom: 18 }}>
            {!selected.merchant.sponsoring_suspended ? (
              <button
                type="button"
                className="button button-danger"
                disabled={!!busy || suspendReason.trim().length < 5}
                onClick={() => void toggleSponsoring(selected.merchant.id, true)}
              >
                Suspend sponsoring
              </button>
            ) : (
              <button
                type="button"
                className="button button-approve"
                disabled={!!busy}
                onClick={() => void toggleSponsoring(selected.merchant.id, false)}
              >
                Resume sponsoring
              </button>
            )}
            <Link to="/economy/funding" className="button button-secondary">
              Grant / correct points
            </Link>
          </div>

          <h3 style={{ marginBottom: 8 }}>Sponsorships ({selected.sponsorships.length})</h3>
          {selected.sponsorships.length === 0 ? (
            <p className="empty-state" style={{ marginBottom: 16 }}>No sponsorships yet.</p>
          ) : (
            <div className="table-scroll" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quest / round</th>
                    <th>Status</th>
                    <th>Terms</th>
                    <th>Unmet override</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.sponsorships.map((s: any) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/economy/funding/${encodeURIComponent(s.plan_id)}`}>
                          {s.quest_title || s.quest_id} (R{s.round_number})
                        </Link>
                      </td>
                      <td>{s.status}</td>
                      <td>{s.points} pts · {s.voucher_qty} vouchers</td>
                      <td>{Array.isArray(s.accepted_with_unmet) && s.accepted_with_unmet.length > 0 ? `Yes (${s.accepted_with_unmet.length})` : 'No'}</td>
                      <td>{new Date(s.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ marginBottom: 8 }}>Point credits ({selected.credits.length})</h3>
          {selected.credits.length === 0 ? (
            <p className="empty-state" style={{ marginBottom: 16 }}>No point credits yet.</p>
          ) : (
            <div className="table-scroll" style={{ marginBottom: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Points</th>
                    <th>Reference</th>
                    <th>Ledger group</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.credits.map((c: any) => (
                    <tr key={c.id}>
                      <td>{c.source}</td>
                      <td>{c.points} pts</td>
                      <td>{c.reference}</td>
                      <td><code>{c.ledger_group_id}</code></td>
                      <td>{new Date(c.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 style={{ marginBottom: 8 }}>Round contributions ({selected.contributions.length})</h3>
          {selected.contributions.length === 0 ? (
            <p className="empty-state">No contributions yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Quest / round</th>
                    <th>Committed</th>
                    <th>Remaining</th>
                    <th>Held</th>
                    <th>Paid</th>
                    <th>Refunded</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.contributions.map((c: any) => (
                    <tr key={c.id}>
                      <td>
                        <Link to={`/economy/funding/${encodeURIComponent(c.plan_id)}`}>
                          {c.quest_title || c.quest_id} (R{c.round_number})
                        </Link>
                      </td>
                      <td>{c.committed_points} pts</td>
                      <td>{c.remaining_points} pts</td>
                      <td>{c.held_points} pts</td>
                      <td>{Number(c.paid_reward_points) + Number(c.paid_fee_points)} pts</td>
                      <td>{c.refunded_points} pts</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
