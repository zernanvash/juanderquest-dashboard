import { useCallback, useEffect, useState } from 'react';
import { Award, ExternalLink, RotateCcw } from 'lucide-react';
import { getBadgeMinting, retryBadgeMint, type BadgeMinting, type BadgeMintRow } from '../api/chain';
import { describeError } from '../utils/errors';

const STATUS: Record<BadgeMintRow['status'], { label: string; tone: string }> = {
  queued: { label: 'Queued', tone: 'is-warn' },
  submitted: { label: 'Minting', tone: 'is-warn' },
  included: { label: 'Confirming', tone: 'is-warn' },
  unknown: { label: 'Checking', tone: 'is-warn' },
  finalized: { label: 'On-chain', tone: 'is-good' },
  failed: { label: 'Failed', tone: 'is-bad' },
  reverted: { label: 'Reverted', tone: 'is-bad' },
  replaced: { label: 'Replaced', tone: '' },
};

/** Plan 50: achievements minted as soulbound badges by the server issuer key. */
export function BadgeMintingPanel() {
  const [data, setData] = useState<BadgeMinting | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await getBadgeMinting(signal));
      setError('');
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(describeError(cause, 'Badge minting status could not be loaded.'));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => { void load(); }, 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [load]);

  const retry = async (row: BadgeMintRow) => {
    setBusy(row.id);
    try {
      await retryBadgeMint(row.id);
      await load();
    } catch (cause) {
      setError(describeError(cause, 'The mint could not be retried.'));
    } finally {
      setBusy('');
    }
  };

  const minter = data?.minter;
  const minterNote = !minter ? '' : !minter.enabled
    ? 'Minting is turned off on this server (CHAIN_BADGE_MINTING_ENABLED). Earned badges are kept.'
    : minter.error ? `Minter is not running: ${minter.error}` : minter.ready ? 'Minter running · server issuer pays gas' : 'Minter starting…';

  return (
    <section className="chain-section" aria-label="Badge minting">
      <div className="chain-section-head">
        <h2 className="chain-section-title"><Award size={18} aria-hidden="true" /> Badge minting</h2>
        <p className="chain-section-sub">Earned achievements are minted as soulbound badges to each traveler&apos;s linked wallet. Travelers without a wallet keep theirs until they link one.</p>
      </div>
      {error ? <div className="load-error" role="alert">{error} <button type="button" onClick={() => void load()}>Retry</button></div> : null}
      {data ? (
        <>
          <div className="chain-summary chain-summary-tight">
            {[
              ['On-chain', data.counts.onChain, 'is-good'],
              ['Minting', data.counts.minting + data.counts.queued, data.counts.minting + data.counts.queued ? 'is-warn' : ''],
              ['Waiting for wallet', data.counts.waitingForWallet, ''],
              ['Failed', data.counts.failed, data.counts.failed ? 'is-bad' : 'is-good'],
            ].map(([label, value, tone]) => (
              <div className="chain-stat" key={label as string}>
                <span className="chain-stat-label">{label}</span>
                <strong className="chain-stat-value">{value}</strong>
                {label === 'On-chain' ? (
                  <span className={`chain-stat-note ${minter?.enabled && !minter.error ? 'is-good' : 'is-warn'}`} data-testid="minter-status">
                    <span className="chain-dot" aria-hidden="true" />{minterNote}
                  </span>
                ) : <span className={`chain-stat-note ${tone}`} />}
              </div>
            ))}
          </div>
          {data.recent.length === 0 ? <p className="chain-empty">No badges have been queued yet.</p> : (
            <div className="chain-panel">
              <div className="chain-table-wrap">
                <table className="chain-table">
                  <thead><tr><th>Badge</th><th>Traveler</th><th>Status</th><th>Updated</th><th>Links</th><th /></tr></thead>
                  <tbody>
                    {data.recent.map((row) => {
                      const s = STATUS[row.status];
                      return (
                        <tr key={row.id}>
                          <td><strong>{row.title}</strong></td>
                          <td>{row.traveler}<div className="chain-muted chain-mono">{row.recipient.slice(0, 6)}…{row.recipient.slice(-4)}</div></td>
                          <td>
                            <span className={`chain-chip ${s.tone}`}>{s.label}</span>
                            {row.lastError ? <div className="chain-muted" title={row.lastError}>{row.lastError.slice(0, 80)}</div> : null}
                          </td>
                          <td className="chain-nowrap chain-muted">{new Date(row.updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                          <td className="chain-nowrap">
                            {row.tokenUrl ? <a className="chain-mono" href={row.tokenUrl} target="_blank" rel="noreferrer">Badge <ExternalLink size={11} aria-hidden="true" /></a> : null}
                            {row.tokenUrl && row.txUrl ? ' · ' : null}
                            {row.txUrl ? <a className="chain-mono" href={row.txUrl} target="_blank" rel="noreferrer">Tx <ExternalLink size={11} aria-hidden="true" /></a> : null}
                            {!row.tokenUrl && !row.txUrl ? '—' : null}
                          </td>
                          <td>
                            {row.status === 'failed' ? (
                              <button type="button" className="chain-small-button" disabled={busy === row.id} onClick={() => void retry(row)}>
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
            </div>
          )}
        </>
      ) : !error ? <p className="chain-empty">Reading the minting queue…</p> : null}
    </section>
  );
}
