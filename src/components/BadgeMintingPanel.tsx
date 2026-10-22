import { useCallback, useEffect, useState } from 'react';
import { Award, Copy, ExternalLink, RotateCcw, Search } from 'lucide-react';
import {
  getBadgeLedger, getBadgeMinting, retryBadgeMint,
  type BadgeLedger, type BadgeLedgerEntry, type BadgeLedgerState, type BadgeMinting,
} from '../api/chain';
import { describeError } from '../utils/errors';

const STATE: Record<BadgeLedgerState, { label: string; tone: string }> = {
  pending_wallet: { label: 'Waiting for wallet', tone: '' },
  queued: { label: 'Queued', tone: 'is-warn' },
  minting: { label: 'Minting', tone: 'is-warn' },
  on_chain: { label: 'On-chain', tone: 'is-good' },
  failed: { label: 'Failed', tone: 'is-bad' },
  revoked: { label: 'Revoked', tone: 'is-bad' },
};

const FILTERS: { value: BadgeLedgerState | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending_wallet', label: 'Waiting for wallet' },
  { value: 'minting', label: 'Minting' },
  { value: 'on_chain', label: 'On-chain' },
  { value: 'failed', label: 'Failed' },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Plan 50: achievements minted as soulbound badges by the server issuer key, with a per-badge ledger. */
export function BadgeMintingPanel() {
  const [data, setData] = useState<BadgeMinting | null>(null);
  const [ledger, setLedger] = useState<BadgeLedger | null>(null);
  const [filter, setFilter] = useState<BadgeLedgerState | ''>('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [minting, rows] = await Promise.all([
        getBadgeMinting(signal),
        getBadgeLedger({ state: filter, q: appliedQuery }, signal),
      ]);
      setData(minting);
      setLedger(rows);
      setError('');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Badge minting status could not be loaded.'));
    }
  }, [filter, appliedQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  const retry = async (row: BadgeLedgerEntry) => {
    if (!row.commandId) return;
    setBusy(row.awardId);
    try {
      await retryBadgeMint(row.commandId);
      await load();
    } catch (cause) {
      setError(describeError(cause, 'The mint could not be retried.'));
    } finally {
      setBusy('');
    }
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1500); } catch { /* ignore */ }
  };

  const minter = data?.minter;
  const minterNote = !minter ? '' : !minter.enabled
    ? 'Minting is turned off on this server (CHAIN_BADGE_MINTING_ENABLED). Earned badges are kept.'
    : minter.error ? `Minter is not running: ${minter.error}` : minter.ready ? 'Minter running · server issuer pays gas' : 'Minter starting…';
  const totals = ledger?.totals;
  const countFor = (value: BadgeLedgerState | '') => !totals ? null
    : value === '' ? ledger!.total : value === 'minting' ? (totals.minting ?? 0) + (totals.queued ?? 0) : totals[value] ?? 0;

  return (
    <section className="chain-section" aria-label="Badge minting">
      <div className="chain-section-head">
        <h2 className="chain-section-title"><Award size={18} aria-hidden="true" /> Badge minting</h2>
        <p className="chain-section-sub">Earned achievements are minted as soulbound badges to each traveler&apos;s linked wallet. Travelers without a wallet keep theirs until they link one.</p>
      </div>
      {error ? <div className="load-error" role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></div> : null}
      {data ? (
        <div className="chain-summary chain-summary-tight">
          {[
            ['On-chain', data.counts.onChain],
            ['Minting', data.counts.minting + data.counts.queued],
            ['Waiting for wallet', data.counts.waitingForWallet],
            ['Failed', data.counts.failed],
          ].map(([label, value]) => (
            <div className="chain-stat" key={label as string}>
              <span className="chain-stat-label">{label}</span>
              <strong className="chain-stat-value">{value}</strong>
              {label === 'On-chain' ? (
                <span className={`chain-stat-note ${minter?.enabled && !minter.error ? 'is-good' : 'is-warn'}`} data-testid="minter-status">
                  <span className="chain-dot" aria-hidden="true" />{minterNote}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="chain-panel" aria-label="Badge ledger">
        <div className="chain-ledger-toolbar">
          <h3 className="chain-ledger-title">Badge ledger</h3>
          <div className="chain-ledger-filters" role="tablist" aria-label="Filter badges">
            {FILTERS.map((f) => (
              <button key={f.value || 'all'} type="button" role="tab" aria-selected={filter === f.value}
                className={`chain-filter ${filter === f.value ? 'is-active' : ''}`} onClick={() => setFilter(f.value)}>
                {f.label}{countFor(f.value) !== null ? <span className="chain-filter-count">{countFor(f.value)}</span> : null}
              </button>
            ))}
          </div>
          <form className="chain-ledger-search" onSubmit={(e) => { e.preventDefault(); setAppliedQuery(query); }}>
            <Search size={14} aria-hidden="true" />
            <input aria-label="Search traveler, badge or wallet" placeholder="Traveler, badge or wallet" value={query}
              onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setAppliedQuery(''); }} />
          </form>
        </div>
        {!ledger ? <p className="chain-empty chain-empty-flat">Reading the ledger…</p>
          : ledger.entries.length === 0 ? <p className="chain-empty chain-empty-flat">No badges match.</p> : (
            <div className="chain-table-wrap">
              <table className="chain-table">
                <thead><tr><th>Traveler</th><th>Badge</th><th>Earned</th><th>Status</th><th>Wallet</th><th>Links</th><th /></tr></thead>
                <tbody>
                  {ledger.entries.map((row) => {
                    const s = STATE[row.state];
                    return (
                      <tr key={row.awardId} data-testid={`ledger-${row.awardId}`}>
                        <td><strong>{row.traveler.name}</strong>{row.traveler.handle ? <div className="chain-muted">@{row.traveler.handle}</div> : null}</td>
                        <td>{row.title}<div className="chain-muted" style={{ textTransform: 'capitalize' }}>{row.track}</div></td>
                        <td className="chain-nowrap chain-muted">{when(row.awardedAt)}</td>
                        <td>
                          <span className={`chain-chip ${s.tone}`}>{s.label}</span>
                          {row.lastError ? <div className="chain-muted" title={row.lastError}>{row.lastError.slice(0, 80)}</div> : null}
                        </td>
                        <td className="chain-nowrap">
                          {row.wallet ? (
                            <>
                              <span className="chain-mono">{short(row.wallet)}</span>
                              <button type="button" className="chain-icon-button" onClick={() => void copy(row.wallet!)} aria-label={`Copy wallet of ${row.traveler.name}`}>
                                <Copy size={12} aria-hidden="true" />
                              </button>
                              {copied === row.wallet ? <span className="chain-muted">Copied</span> : null}
                            </>
                          ) : <span className="chain-muted">Not linked</span>}
                        </td>
                        <td className="chain-nowrap">
                          {row.tokenUrl ? <a className="chain-mono" href={row.tokenUrl} target="_blank" rel="noreferrer">Badge <ExternalLink size={11} aria-hidden="true" /></a> : null}
                          {row.tokenUrl && row.txUrl ? ' · ' : null}
                          {row.txUrl ? <a className="chain-mono" href={row.txUrl} target="_blank" rel="noreferrer">Tx <ExternalLink size={11} aria-hidden="true" /></a> : null}
                          {!row.tokenUrl && !row.txUrl ? <span className="chain-muted">—</span> : null}
                        </td>
                        <td>
                          {row.state === 'failed' && row.commandId ? (
                            <button type="button" className="chain-small-button" disabled={busy === row.awardId} onClick={() => void retry(row)}>
                              <RotateCcw size={12} aria-hidden="true" /> Retry
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </section>
  );
}
