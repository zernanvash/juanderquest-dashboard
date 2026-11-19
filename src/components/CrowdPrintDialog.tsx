import { useEffect, useMemo, useState } from 'react';

export interface CrowdAreaProvince {
  id: string;
  name: string;
  municipality_count: number;
  spot_count: number;
}

export interface CrowdAreaMunicipality {
  name: string;
  town_area_id: string | null;
  province_id: string;
  province_name: string;
  spot_count: number;
}

export interface CrowdAreaOptions {
  scope_mode: 'platform' | 'province' | 'municipality' | 'multi_area';
  locked_province: string | null;
  locked_municipality: string | null;
  assigned_areas?: Array<{ area_id: string; area_name: string }>;
  provinces: CrowdAreaProvince[];
  municipalities: CrowdAreaMunicipality[];
  categories: string[];
}

export type CrowdPrintScopeChoice = 'province' | 'municipality' | 'all';

export interface CrowdPrintRequest {
  scopeChoice: CrowdPrintScopeChoice;
  province: string;
  provinceLabel: string;
  municipality: string;
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  onsiteHours: number;
}

interface CrowdPrintDialogProps {
  open: boolean;
  onClose: () => void;
  areas: CrowdAreaOptions | null;
  isPlatform: boolean;
  initialProvince: string;
  initialMunicipality: string;
  initialFrom: string;
  initialTo: string;
  initialGranularity: 'day' | 'week' | 'month';
  initialOnsiteHours: number;
  busy: boolean;
  error: string;
  onConfirm: (req: CrowdPrintRequest) => void;
}

export function CrowdPrintDialog({
  open,
  onClose,
  areas,
  isPlatform,
  initialProvince,
  initialMunicipality,
  initialFrom,
  initialTo,
  initialGranularity,
  initialOnsiteHours,
  busy,
  error,
  onConfirm,
}: CrowdPrintDialogProps) {
  const scopeMode = areas?.scope_mode ?? (isPlatform ? 'platform' : 'multi_area');
  const provinces = areas?.provinces ?? [];
  const municipalities = areas?.municipalities ?? [];

  const [scopeChoice, setScopeChoice] = useState<CrowdPrintScopeChoice>('province');
  const [province, setProvince] = useState('');
  const [municipality, setMunicipality] = useState('');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [muniSearch, setMuniSearch] = useState('');
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>(initialGranularity);
  const [onsiteHours, setOnsiteHours] = useState(initialOnsiteHours);

  useEffect(() => {
    if (!open) return;
    setFrom(initialFrom);
    setTo(initialTo);
    setGranularity(initialGranularity);
    setOnsiteHours(initialOnsiteHours);
    setProvinceSearch('');
    setMuniSearch('');

    if (scopeMode === 'municipality') {
      setScopeChoice('municipality');
      setProvince(areas?.locked_province ?? initialProvince);
      setMunicipality(areas?.locked_municipality ?? initialMunicipality ?? municipalities[0]?.name ?? '');
      return;
    }

    if (scopeMode === 'province') {
      const lockedProv = areas?.locked_province ?? provinces[0]?.id ?? initialProvince;
      setProvince(lockedProv);
      if (initialMunicipality) {
        setScopeChoice('municipality');
        setMunicipality(initialMunicipality);
      } else {
        setScopeChoice('province');
        setMunicipality('');
      }
      return;
    }

    if (initialMunicipality) {
      setScopeChoice('municipality');
      setProvince(initialProvince || municipalities.find((m) => m.name === initialMunicipality)?.province_id || '');
      setMunicipality(initialMunicipality);
    } else if (initialProvince) {
      setScopeChoice('province');
      setProvince(initialProvince);
      setMunicipality('');
    } else if (provinces.length > 0) {
      setScopeChoice('province');
      setProvince(provinces[0].id);
      setMunicipality('');
    } else {
      setScopeChoice('all');
      setProvince('');
      setMunicipality('');
    }
  }, [
    open,
    scopeMode,
    areas?.locked_province,
    areas?.locked_municipality,
    initialProvince,
    initialMunicipality,
    initialFrom,
    initialTo,
    initialGranularity,
    initialOnsiteHours,
  ]);

  const filteredProvinces = useMemo(() => {
    const q = provinceSearch.trim().toLowerCase();
    if (!q) return provinces;
    return provinces.filter((p) => p.name.toLowerCase().includes(q));
  }, [provinces, provinceSearch]);

  const filteredMunicipalities = useMemo(() => {
    const q = muniSearch.trim().toLowerCase();
    return municipalities.filter((m) => {
      if (province && m.province_id !== province) return false;
      if (!q) return true;
      return m.name.toLowerCase().includes(q) || m.province_name.toLowerCase().includes(q);
    });
  }, [municipalities, province, muniSearch]);

  const totalAccessibleSpots = useMemo(
    () => provinces.reduce((acc, p) => acc + p.spot_count, 0),
    [provinces],
  );

  if (!open) return null;

  const lockedProvName =
    provinces.find((p) => p.id === (areas?.locked_province ?? province))?.name ?? 'Assigned province';
  const selectedProvName = provinces.find((p) => p.id === province)?.name ?? '';

  const canConfirm =
    !busy &&
    Boolean(from) &&
    Boolean(to) &&
    (scopeChoice === 'all' ||
      (scopeChoice === 'province' && (Boolean(province) || provinces.length === 0)) ||
      (scopeChoice === 'municipality' && Boolean(municipality)));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canConfirm) return;
    const effectiveProv = scopeChoice === 'all' ? '' : province;
    const effectiveProvLabel =
      scopeChoice === 'all'
        ? isPlatform
          ? 'All accessible areas (Nationwide)'
          : 'All assigned areas'
        : provinces.find((p) => p.id === effectiveProv)?.name ??
          municipalities.find((m) => m.name === municipality)?.province_name ??
          '';
    onConfirm({
      scopeChoice: scopeChoice === 'province' && !effectiveProv ? 'all' : scopeChoice,
      province: effectiveProv,
      provinceLabel: effectiveProvLabel,
      municipality: scopeChoice === 'municipality' ? municipality : '',
      from,
      to,
      granularity,
      onsiteHours,
    });
  };

  return (
    <div
      className="crowd-print-modal-backdrop no-print"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="crowd-print-modal stitch-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Prepare crowd monitoring hard copy"
      >
        <div className="crowd-print-modal-head">
          <div>
            <h2>Prepare hard copy print</h2>
            <p className="section-description">
              Choose the province or specific municipality/city to include. Only destinations inside your authorized admin scope can be printed.
            </p>
          </div>
          <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>

        <form onSubmit={handleSubmit} className="crowd-print-modal-body">
          {scopeMode === 'municipality' ? (
            <div className="status-banner" role="status">
              <strong>Assigned area lock:</strong>
              <span>
                Your area-admin scope covers <strong>{areas?.locked_municipality || municipality || 'your town'}</strong>
                {lockedProvName ? ` (${lockedProvName})` : ''}.
              </span>
            </div>
          ) : (
            <fieldset className="crowd-print-fieldset">
              <legend>Geographic scope</legend>
              <div className="crowd-print-radio-row">
                <label className="crowd-print-radio">
                  <input
                    type="radio"
                    name="crowd_print_scope"
                    value="province"
                    checked={scopeChoice === 'province'}
                    onChange={() => {
                      setScopeChoice('province');
                      if (!province && provinces[0]) setProvince(provinces[0].id);
                      setMunicipality('');
                    }}
                  />
                  <span>{scopeMode === 'province' ? `Entire province (${lockedProvName})` : 'Specific province'}</span>
                </label>
                <label className="crowd-print-radio">
                  <input
                    type="radio"
                    name="crowd_print_scope"
                    value="municipality"
                    checked={scopeChoice === 'municipality'}
                    onChange={() => {
                      setScopeChoice('municipality');
                      const firstMuni = filteredMunicipalities[0]?.name ?? municipalities[0]?.name ?? '';
                      if (!municipality && firstMuni) setMunicipality(firstMuni);
                    }}
                  />
                  <span>Specific municipality / city</span>
                </label>
                {(scopeMode === 'platform' || scopeMode === 'multi_area') && (
                  <label className="crowd-print-radio">
                    <input
                      type="radio"
                      name="crowd_print_scope"
                      value="all"
                      checked={scopeChoice === 'all'}
                      onChange={() => setScopeChoice('all')}
                    />
                    <span>{isPlatform ? 'All provinces (Nationwide)' : 'All assigned areas'}</span>
                  </label>
                )}
              </div>

              {scopeChoice === 'all' && totalAccessibleSpots > 80 ? (
                <p className="notice" style={{ marginTop: 8 }}>
                  All accessible areas contain {totalAccessibleSpots} destinations across {provinces.length} provinces. Pick a specific province or municipality for a shorter hard copy.
                </p>
              ) : null}

              {scopeChoice !== 'all' && scopeMode !== 'province' ? (
                <div className="crowd-print-pickers">
                  <label className="settings-field">
                    Filter provinces ({provinces.length})
                    <input
                      type="search"
                      value={provinceSearch}
                      onChange={(e) => setProvinceSearch(e.target.value)}
                      placeholder="Type province name…"
                    />
                  </label>
                  <label className="settings-field">
                    Province
                    <select
                      aria-label="Print province"
                      value={province}
                      onChange={(e) => {
                        const nextProv = e.target.value;
                        setProvince(nextProv);
                        setMunicipality('');
                      }}
                    >
                      {scopeChoice === 'municipality' ? <option value="">All accessible provinces</option> : null}
                      {filteredProvinces.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.municipality_count} LGUs · {p.spot_count} spots)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {scopeChoice === 'municipality' ? (
                <div className="crowd-print-pickers">
                  <label className="settings-field">
                    Filter municipalities / cities ({filteredMunicipalities.length})
                    <input
                      type="search"
                      value={muniSearch}
                      onChange={(e) => setMuniSearch(e.target.value)}
                      placeholder="Type city or town…"
                    />
                  </label>
                  <label className="settings-field">
                    Municipality / city
                    <select
                      aria-label="Print municipality"
                      value={municipality}
                      onChange={(e) => setMunicipality(e.target.value)}
                    >
                      <option value="">Choose municipality / city…</option>
                      {filteredMunicipalities.map((m) => (
                        <option key={`${m.province_id}:${m.name}`} value={m.name}>
                          {m.name}
                          {!province ? ` · ${m.province_name}` : ''} ({m.spot_count} spots)
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}
            </fieldset>
          )}

          <div className="settings-grid">
            <label className="settings-field">
              From (Manila date)
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </label>
            <label className="settings-field">
              To (Manila date)
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </label>
            <label className="settings-field">
              Granularity
              <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label className="settings-field">
              On-site window
              <select value={onsiteHours} onChange={(e) => setOnsiteHours(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    Last {h} h
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="crowd-print-outline">
            <strong>Hard copy layout ({scopeChoice === 'municipality' && municipality ? municipality : selectedProvName || 'All accessible areas'})</strong>
            <ol>
              <li>
                <strong>Page 1 · Overview:</strong> Executive KPIs, period deltas, visitor mix, conversion funnel, and top alerts.
              </li>
              <li>
                <strong>Page 2 · Graphs:</strong> Visits &amp; interactions trend chart, 24×7 Manila heatmap, and category share chart.
              </li>
              <li>
                <strong>Page 3+ · Organized Numbers:</strong> Geographic rollup, category totals, destinations ledger grouped by municipality, and time-series figures.
              </li>
            </ol>
          </div>

          {error ? (
            <p className="notice notice-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="crowd-print-modal-actions">
            <button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button-approve" disabled={!canConfirm}>
              {busy ? 'Preparing report…' : 'Generate & Print Hard Copy'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
