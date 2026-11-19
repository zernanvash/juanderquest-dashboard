import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowLeft, ChevronRight, Download, Flame, RefreshCw, Users } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../auth';
import { AdminPagination, AdminSearchBar, useClientPagination } from '../components/AdminSearchBar';
import { CrowdPrintDialog, type CrowdAreaOptions, type CrowdPrintRequest } from '../components/CrowdPrintDialog';
import { CrowdPrintDocument, type CrowdPrintSnapshot } from '../components/CrowdPrintDocument';
import { PageHeader } from '../components/PageState';
import { PrintReport } from '../components/PrintReport';
import { useRouter } from '../router';
import { withArea } from '../utils/areaQuery';
import { downloadCsv } from '../utils/csv';
import { describeError } from '../utils/errors';

type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type SortField = 'verified_visits' | 'on_site_now' | 'interactions' | 'pressure_score' | 'dwell_minutes' | 'name';

const DEST_PAGE_SIZE = 25;

function manilaYmd(offsetDays = 0): string {
  const target = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(target);
}

function numericOrZero(val: number | '<3' | undefined): number {
  return typeof val === 'number' ? val : val === '<3' ? 1 : 0;
}

export function CrowdMonitoringPage() {
  const { scope, selectedAreaId, profile } = useAuth();
  const { query, navigate } = useRouter();
  const isPlatform = Boolean(scope?.platform);

  const [preset, setPreset] = useState<Preset>(() => (query.get('range') as Preset) || 'month');
  const [from, setFrom] = useState<string>(() => query.get('from') || manilaYmd(-29));
  const [to, setTo] = useState<string>(() => query.get('to') || manilaYmd(0));
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>(
    () => (query.get('granularity') as 'day' | 'week' | 'month') || 'day',
  );
  const [province, setProvince] = useState(() => query.get('province') || '');
  const [municipality, setMunicipality] = useState(() => query.get('municipality') || '');
  const [category, setCategory] = useState(() => query.get('category') || '');
  const [search, setSearch] = useState(() => query.get('q') || '');
  const [onsiteHours, setOnsiteHours] = useState(() => Number(query.get('onsite_hours') || 2) || 2);
  const [includeTest, setIncludeTest] = useState(() => isPlatform && query.get('include_test') === 'true');
  const [selectedSpotId, setSelectedSpotId] = useState<string>(() => query.get('spot') || '');
  const [sortField, setSortField] = useState<SortField>('verified_visits');
  const [sortAsc, setSortAsc] = useState(false);
  const [destPage, setDestPage] = useState(1);
  const [areaSearch, setAreaSearch] = useState('');

  const [areasData, setAreasData] = useState<CrowdAreaOptions | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [heatmap, setHeatmap] = useState<any[]>([]);
  const [spotDetail, setSpotDetail] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);
  const [printError, setPrintError] = useState('');
  const [printSnapshot, setPrintSnapshot] = useState<CrowdPrintSnapshot | null>(null);
  const [pendingPrintTrigger, setPendingPrintTrigger] = useState(0);

  const applyPreset = (next: Preset) => {
    setPreset(next);
    setDestPage(1);
    const today = manilaYmd(0);
    if (next === 'day') {
      setFrom(today);
      setTo(today);
      setGranularity('day');
    } else if (next === 'week') {
      setFrom(manilaYmd(-6));
      setTo(today);
      setGranularity('day');
    } else if (next === 'month') {
      setFrom(manilaYmd(-29));
      setTo(today);
      setGranularity('day');
    } else if (next === 'year') {
      setFrom(manilaYmd(-364));
      setTo(today);
      setGranularity('month');
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    const qs = isPlatform && includeTest ? '?include_test=true' : '';
    apiFetch<CrowdAreaOptions>(withArea(`/admin/crowd/areas${qs}`, selectedAreaId), {
      signal: controller.signal,
    })
      .then((res) => {
        if (res && Array.isArray(res.provinces)) {
          setAreasData(res);
          if (res.scope_mode === 'municipality' && res.locked_municipality) {
            setProvince(res.locked_province ?? '');
            setMunicipality(res.locked_municipality);
          } else if (res.scope_mode === 'province' && res.locked_province) {
            setProvince(res.locked_province);
          }
        } else {
          setAreasData(null);
        }
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setAreasData(null);
      });
    return () => controller.abort();
  }, [includeTest, isPlatform, selectedAreaId]);

  useEffect(() => {
    setDestPage(1);
  }, [from, to, granularity, province, municipality, category, search, onsiteHours, includeTest, sortField, sortAsc, selectedAreaId]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('range', preset);
    params.set('from', from);
    params.set('to', to);
    params.set('granularity', granularity);
    if (province) params.set('province', province);
    if (municipality) params.set('municipality', municipality);
    if (category) params.set('category', category);
    if (search.trim()) params.set('q', search.trim());
    if (onsiteHours !== 2) params.set('onsite_hours', String(onsiteHours));
    if (isPlatform && includeTest) params.set('include_test', 'true');
    if (selectedSpotId) params.set('spot', selectedSpotId);
    navigate(`/insights/crowd?${params.toString()}`, { replace: true });
  }, [preset, from, to, granularity, province, municipality, category, search, onsiteHours, includeTest, selectedSpotId, isPlatform]);

  const baseQueryString = useMemo(() => {
    const params = new URLSearchParams({
      from,
      to,
      granularity,
      onsite_hours: String(onsiteHours),
    });
    if (province) params.set('province', province);
    if (municipality) params.set('municipality', municipality);
    if (category) params.set('category', category);
    if (search.trim()) params.set('q', search.trim());
    if (isPlatform && includeTest) params.set('include_test', 'true');
    return params.toString();
  }, [from, to, granularity, province, municipality, category, search, onsiteHours, isPlatform, includeTest]);

  const overviewQueryString = useMemo(() => {
    const params = new URLSearchParams(baseQueryString);
    params.set('page', String(destPage));
    params.set('limit', String(DEST_PAGE_SIZE));
    params.set('sort', sortField);
    params.set('dir', sortAsc ? 'asc' : 'desc');
    return params.toString();
  }, [baseQueryString, destPage, sortField, sortAsc]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const sugQuery = selectedSpotId
        ? `${baseQueryString}&spot_id=${encodeURIComponent(selectedSpotId)}`
        : baseQueryString;
      const sugPromise = apiFetch<{ suggestions: any[] }>(
        withArea(`/admin/crowd/suggestions?${sugQuery}`, selectedAreaId),
        { signal },
      ).catch((cause) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
        return { suggestions: [] };
      });
      if (selectedSpotId) {
        const [detail, sug] = await Promise.all([
          apiFetch<any>(
            withArea(`/admin/crowd/spots/${encodeURIComponent(selectedSpotId)}?${baseQueryString}`, selectedAreaId),
            { signal },
          ),
          sugPromise,
        ]);
        setSpotDetail(detail);
        setHeatmap(detail?.heatmap ?? []);
        setSuggestions(sug?.suggestions ?? []);
      } else {
        setSpotDetail(null);
        const [ov, hm, sug] = await Promise.all([
          apiFetch<any>(withArea(`/admin/crowd/overview?${overviewQueryString}`, selectedAreaId), { signal }),
          apiFetch<{ cells: any[] }>(withArea(`/admin/crowd/heatmap?${baseQueryString}`, selectedAreaId), { signal }),
          sugPromise,
        ]);
        setOverview(ov);
        setHeatmap(hm?.cells ?? []);
        setSuggestions(sug?.suggestions ?? []);
      }
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError(describeError(cause, 'Unable to load crowd monitoring analytics.'));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [baseQueryString, overviewQueryString, selectedSpotId, selectedAreaId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const activeData = spotDetail || overview;
  const kpis = activeData?.kpis;
  const timeseries: any[] = activeData?.timeseries ?? [];
  const topDestinations: any[] = overview?.top_destinations ?? [];

  const sortedDestinations = useMemo(() => {
    const copy = [...topDestinations];
    copy.sort((a, b) => {
      if (sortField === 'name') {
        return sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      }
      const av = numericOrZero(a[sortField]);
      const bv = numericOrZero(b[sortField]);
      return sortAsc ? av - bv : bv - av;
    });
    return copy;
  }, [topDestinations, sortField, sortAsc]);

  const effectiveAreas = useMemo<CrowdAreaOptions | null>(() => {
    if (areasData) return areasData;
    if (!overview?.filter_options) return null;
    const provs = (overview.filter_options.provinces ?? []).map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      municipality_count: Number(p.municipality_count ?? 0),
      spot_count: Number(p.spot_count ?? 0),
    }));
    const munis = (overview.filter_options.municipalities ?? []).map((m: string) => ({
      name: m,
      town_area_id: null,
      province_id: '',
      province_name: '',
      spot_count: 0,
    }));
    return {
      scope_mode: isPlatform ? 'platform' : 'multi_area',
      locked_province: null,
      locked_municipality: null,
      provinces: provs,
      municipalities: munis,
      categories: overview.filter_options.categories ?? [],
    };
  }, [areasData, overview?.filter_options, isPlatform]);

  const isMuniLocked = areasData?.scope_mode === 'municipality';
  const isProvinceLocked = isMuniLocked || areasData?.scope_mode === 'province';

  const availableProvinces = useMemo(() => effectiveAreas?.provinces ?? [], [effectiveAreas]);
  const availableMunicipalities = useMemo(() => {
    const structured = effectiveAreas?.municipalities ?? [];
    if (structured.length > 0) {
      return [...new Set(
        structured
          .filter((m) => !province || m.province_id === province || !m.province_id)
          .map((m) => m.name),
      )];
    }
    return (overview?.filter_options?.municipalities ?? []) as string[];
  }, [effectiveAreas, province, overview?.filter_options?.municipalities]);

  const selectedProvinceName =
    availableProvinces.find((p) => p.id === province)?.name ??
    areasData?.assigned_areas?.find((a) => a.area_id === province)?.area_name ??
    '';

  const rawAreaItems: any[] = overview?.area_breakdown?.items ?? [];
  const areaLevel: 'province' | 'municipality' =
    overview?.area_breakdown?.level ?? (province || isProvinceLocked ? 'municipality' : 'province');

  const filteredAreaItems = useMemo(() => {
    const q = areaSearch.trim().toLowerCase();
    if (!q) return rawAreaItems;
    return rawAreaItems.filter(
      (item) =>
        String(item.area_name || '').toLowerCase().includes(q) ||
        String(item.province_name || '').toLowerCase().includes(q),
    );
  }, [rawAreaItems, areaSearch]);

  const {
    page: areaPage,
    totalPages: areaTotalPages,
    pageItems: pagedAreaItems,
    setPage: setAreaPage,
  } = useClientPagination(filteredAreaItems, 12);

  const serverPagination = overview?.destinations_pagination as
    | { page: number; limit: number; total: number; total_pages: number }
    | undefined;
  const totalDestinations = serverPagination?.total ?? sortedDestinations.length;
  const totalDestPages = serverPagination?.total_pages ?? Math.max(1, Math.ceil(sortedDestinations.length / DEST_PAGE_SIZE));
  const displayDestinations = serverPagination
    ? sortedDestinations
    : sortedDestinations.slice((destPage - 1) * DEST_PAGE_SIZE, destPage * DEST_PAGE_SIZE);

  const toggleSort = (field: SortField) => {
    setDestPage(1);
    if (sortField === field) setSortAsc((prev) => !prev);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  useEffect(() => {
    const onAfterPrint = () => {
      setPrintSnapshot(null);
    };
    window.addEventListener('afterprint', onAfterPrint);
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, []);

  useEffect(() => {
    if (!pendingPrintTrigger || !printSnapshot) return;
    const timer = window.setTimeout(() => {
      window.print();
      setPendingPrintTrigger(0);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pendingPrintTrigger, printSnapshot]);

  const handleConfirmPrint = async (req: CrowdPrintRequest) => {
    setPrintBusy(true);
    setPrintError('');
    try {
      const p = new URLSearchParams({
        from: req.from,
        to: req.to,
        granularity: req.granularity,
        onsite_hours: String(req.onsiteHours),
      });
      if (req.province) p.set('province', req.province);
      if (req.municipality) p.set('municipality', req.municipality);
      if (category) p.set('category', category);
      if (search.trim()) p.set('q', search.trim());
      if (isPlatform && includeTest) p.set('include_test', 'true');
      const baseQs = p.toString();

      const ovParams = new URLSearchParams(p);
      ovParams.set('include_all', 'true');
      ovParams.set('sort', sortField);
      ovParams.set('dir', sortAsc ? 'asc' : 'desc');

      const [ov, hm, sug] = await Promise.all([
        apiFetch<any>(withArea(`/admin/crowd/overview?${ovParams.toString()}`, selectedAreaId)),
        apiFetch<{ cells: any[] }>(withArea(`/admin/crowd/heatmap?${baseQs}`, selectedAreaId)),
        apiFetch<{ suggestions: any[] }>(withArea(`/admin/crowd/suggestions?${baseQs}`, selectedAreaId)).catch(() => ({
          suggestions: [],
        })),
      ]);

      const scopeParts: string[] = [];
      if (req.municipality) {
        scopeParts.push(req.municipality);
        if (req.provinceLabel && !req.provinceLabel.startsWith('All ')) {
          scopeParts.push(req.provinceLabel);
        }
      } else if (req.provinceLabel) {
        scopeParts.push(req.provinceLabel);
      } else {
        scopeParts.push(isPlatform ? 'All accessible areas (Nationwide)' : 'Assigned area');
      }

      const generatedAt = `${new Intl.DateTimeFormat('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date())} PHT`;

      setPrintSnapshot({
        scopeLabel: scopeParts.join(' · '),
        provinceLabel: req.provinceLabel,
        municipalityLabel: req.municipality || 'All municipalities in scope',
        from: req.from,
        to: req.to,
        granularity: req.granularity,
        onsiteHours: req.onsiteHours,
        generatedAt,
        generatedBy: profile?.display_name ?? profile?.email ?? 'Admin',
        overview: ov,
        heatmap: hm?.cells ?? [],
        suggestions: sug?.suggestions ?? [],
        spotDetail: null,
      });
      setPrintDialogOpen(false);
      setPendingPrintTrigger((n) => n + 1);
    } catch (cause) {
      setPrintError(describeError(cause, 'Unable to prepare printable crowd report.'));
    } finally {
      setPrintBusy(false);
    }
  };

  const applySuggestionAction = async (sug: any, action: any) => {
    if (action.navigate_to) {
      navigate(action.navigate_to);
      return;
    }
    if (!action.path || !action.method) return;
    const key = `${sug.spot_id}:${sug.suggestion_key}:${action.action_key}`;
    setActionBusy(key);
    setError('');
    setActionNotice('');
    try {
      await apiFetch(withArea(action.path, selectedAreaId), {
        method: action.method,
        body: { ...(action.body ?? {}), idempotency_key: crypto.randomUUID() },
      });
      setActionNotice(`Applied "${action.label}" for ${sug.spot_name}.`);
      await load();
    } catch (cause) {
      setError(describeError(cause, 'Unable to apply crowd suggestion.'));
    } finally {
      setActionBusy('');
    }
  };

  const dismissSuggestion = async (sug: any) => {
    const key = `${sug.spot_id}:${sug.suggestion_key}:dismiss`;
    setActionBusy(key);
    setError('');
    setActionNotice('');
    try {
      await apiFetch(withArea('/admin/crowd/suggestions/dismiss', selectedAreaId), {
        method: 'POST',
        body: { spot_id: sug.spot_id, suggestion_key: sug.suggestion_key },
      });
      setSuggestions((prev) =>
        prev.filter((item) => !(item.spot_id === sug.spot_id && item.suggestion_key === sug.suggestion_key)),
      );
      setActionNotice(`Dismissed "${sug.rule_label}" for ${sug.spot_name} for 24 hours.`);
    } catch (cause) {
      setError(describeError(cause, 'Unable to dismiss suggestion.'));
    } finally {
      setActionBusy('');
    }
  };

  const maxBucketVisits = useMemo(
    () => Math.max(1, ...timeseries.map((b) => Math.max(numericOrZero(b.verified_visits), numericOrZero(b.interactions)))),
    [timeseries],
  );
  const maxHeat = useMemo(() => Math.max(1, ...heatmap.map((c) => numericOrZero(c.count))), [heatmap]);

  const exportCsv = () => {
    if (spotDetail) {
      downloadCsv(
        `crowd-spot-${selectedSpotId}-${from}-to-${to}.csv`,
        ['Bucket', 'Verified visits', 'Unique visitors', 'Interactions', 'Planning to go', 'Trail check-ins', 'Proofs'],
        timeseries.map((b) => [
          b.bucket,
          b.verified_visits,
          b.unique_visitors,
          b.interactions,
          b.planning_to_go,
          b.trail_checkins,
          b.proofs,
        ]),
      );
      return;
    }
    downloadCsv(
      `crowd-overview-${from}-to-${to}.csv`,
      [
        'Destination',
        'Municipality',
        'Category',
        'Capacity band',
        'Crowd status',
        'Pressure score',
        'Verified visits',
        'Unique visitors',
        'On-site now',
        'Interactions',
        'Planning to go',
        'Trail check-ins',
        'Avg dwell (min)',
      ],
      sortedDestinations.map((d) => [
        d.name,
        d.municipality,
        d.category,
        d.crowd_capacity_band,
        d.crowd_status,
        d.pressure_score,
        d.verified_visits,
        d.unique_visitors,
        d.on_site_now,
        d.interactions,
        d.planning_to_go,
        d.trail_checkins,
        d.dwell_minutes,
      ]),
    );
  };

  const dowRows = [0, 1, 2, 3, 4, 5, 6];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className={printSnapshot ? 'crowd-has-print-doc' : ''}>
      <div className="crowd-screen-view">
        <PageHeader
          title={spotDetail ? `Crowd monitoring · ${spotDetail.spot?.name || selectedSpotId}` : 'Crowd monitoring'}
          description="Aggregate traffic, on-site activity, conversion funnel, dwell proxy, and Manila-time capacity peaks. Individual travelers are never identified."
          actions={
            <PrintReport
              title={spotDetail ? `Crowd monitoring — ${spotDetail.spot?.name || selectedSpotId}` : 'Crowd monitoring overview'}
              orientation="landscape"
              hideDefaultChrome
              onPrint={() => {
                setPrintError('');
                setPrintDialogOpen(true);
              }}
              filters={[
                { label: 'Range', value: `${from} to ${to}` },
                { label: 'Granularity', value: granularity },
                { label: 'On-site window', value: `${onsiteHours}h` },
                ...(selectedProvinceName ? [{ label: 'Province', value: selectedProvinceName }] : []),
                ...(municipality ? [{ label: 'Municipality', value: municipality }] : []),
                ...(category ? [{ label: 'Category', value: category }] : []),
                ...(search.trim() ? [{ label: 'Search', value: search.trim() }] : []),
                ...(isPlatform && includeTest ? [{ label: 'Test data', value: 'Included' }] : []),
              ]}
              onExportCsv={activeData ? exportCsv : undefined}
            />
          }
        />

        <section className="stitch-panel panel-section" aria-label="Crowd filters">
          <div className="section-heading-row">
            <div className="filter-row">
              {(['day', 'week', 'month', 'year', 'custom'] as Preset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`filter-chip ${preset === p ? 'is-active' : ''}`}
                  onClick={() => applyPreset(p)}
                >
                  {p === 'day' ? 'Day' : p === 'week' ? 'Week' : p === 'month' ? 'Month' : p === 'year' ? 'Year' : 'Custom'}
                </button>
              ))}
            </div>
            <div className="action-cluster">
              {selectedSpotId && (
                <button type="button" className="button button-secondary" onClick={() => setSelectedSpotId('')}>
                  <ArrowLeft size={14} /> All destinations
                </button>
              )}
              <button type="button" className="button button-secondary" onClick={exportCsv} disabled={!activeData}>
                <Download size={14} /> Export CSV
              </button>
              <button type="button" className="button button-secondary" onClick={() => void load()} disabled={loading}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <nav className="crowd-breadcrumb" aria-label="Geographic scope breadcrumb" style={{ marginTop: 10 }}>
            <button
              type="button"
              className="crowd-breadcrumb-btn"
              disabled={isProvinceLocked}
              onClick={() => {
                setProvince('');
                setMunicipality('');
                setSelectedSpotId('');
                setDestPage(1);
              }}
            >
              {isPlatform ? 'All provinces (Nationwide)' : 'Assigned scope'}
            </button>
            {selectedProvinceName ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <button
                  type="button"
                  className="crowd-breadcrumb-btn"
                  disabled={isMuniLocked}
                  onClick={() => {
                    setMunicipality('');
                    setSelectedSpotId('');
                    setDestPage(1);
                  }}
                >
                  {selectedProvinceName}
                </button>
              </>
            ) : null}
            {municipality ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span className="crowd-breadcrumb-current">{municipality}</span>
              </>
            ) : null}
            {spotDetail?.spot?.name ? (
              <>
                <ChevronRight size={14} aria-hidden="true" />
                <span className="crowd-breadcrumb-current">{spotDetail.spot.name}</span>
              </>
            ) : null}
          </nav>

          {isMuniLocked || isProvinceLocked ? (
            <div className="status-banner" role="status" style={{ marginTop: 10 }}>
              <strong>Assigned area lock:</strong>
              <span>
                {isMuniLocked
                  ? `Showing only destinations in ${areasData?.locked_municipality || municipality || 'your municipality'}.`
                  : `Showing only destinations in ${selectedProvinceName || 'your assigned province'}.`}
              </span>
            </div>
          ) : null}

          <div className="settings-grid" style={{ marginTop: 12 }}>
            <label className="settings-field">
              From (Manila date)
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setPreset('custom');
                  setFrom(e.target.value);
                  setDestPage(1);
                }}
              />
            </label>
            <label className="settings-field">
              To (Manila date)
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setPreset('custom');
                  setTo(e.target.value);
                  setDestPage(1);
                }}
              />
            </label>
            <label className="settings-field">
              Bucket granularity
              <select value={granularity} onChange={(e) => setGranularity(e.target.value as 'day' | 'week' | 'month')}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </select>
            </label>
            <label className="settings-field">
              On-site window (hours)
              <select value={onsiteHours} onChange={(e) => setOnsiteHours(Number(e.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((h) => (
                  <option key={h} value={h}>
                    Last {h} h
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              Province
              <select
                aria-label="Province"
                value={province}
                disabled={isProvinceLocked}
                onChange={(e) => {
                  setProvince(e.target.value);
                  setMunicipality('');
                  setDestPage(1);
                }}
              >
                <option value="">{isPlatform ? 'All provinces' : 'All assigned provinces'}</option>
                {availableProvinces.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.spot_count > 0 ? ` (${p.spot_count})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              Municipality / city
              <select
                aria-label="Municipality"
                value={municipality}
                disabled={isMuniLocked}
                onChange={(e) => {
                  setMunicipality(e.target.value);
                  setDestPage(1);
                }}
              >
                <option value="">All municipalities</option>
                {availableMunicipalities.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              Category
              <select
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setDestPage(1);
                }}
              >
                <option value="">All categories</option>
                {(effectiveAreas?.categories ?? overview?.filter_options?.categories ?? []).map((c: string) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-field">
              Destination search
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setDestPage(1);
                }}
                placeholder="Filter by spot, town, or province…"
              />
            </label>
            {isPlatform && (
              <label className="checkbox-inline" style={{ alignSelf: 'end', paddingBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={includeTest}
                  onChange={(e) => {
                    setIncludeTest(e.target.checked);
                    setDestPage(1);
                  }}
                />
                Include test data
              </label>
            )}
          </div>
        </section>

      {error && (
        <div className="load-error" role="alert">
          {error}
          <button type="button" onClick={() => void load()}>Retry</button>
        </div>
      )}

      {loading && !activeData ? (
        <p className="loading-panel">Loading crowd monitoring metrics…</p>
      ) : activeData && kpis ? (
        <>
          {activeData.privacy_masked && (
            <div className="status-banner" role="status">
              <strong>Area privacy protection active:</strong>
              <span>Buckets with 1–2 visitors are masked as &lt;3.</span>
            </div>
          )}
          {actionNotice ? (
            <div className="status-banner status-banner-success" role="status">
              {actionNotice}
            </div>
          ) : null}

          <section className="stitch-panel panel-section" aria-label="Crowd control suggestions">
            <h2 className="section-title">Crowd control suggestions ({suggestions.length})</h2>
            <p className="section-description">
              Rule-based recommendations from live traffic, 4-week recurring peaks, and proof anomalies. Nothing changes until an admin clicks Apply.
            </p>
            {suggestions.length === 0 ? (
              <p className="empty-state">No active crowd control suggestions right now.</p>
            ) : (
              <div className="page-stack">
                {suggestions.map((sug) => (
                  <div key={`${sug.spot_id}:${sug.suggestion_key}`} className="stitch-card" style={{ padding: 14 }}>
                    <div className="section-heading-row">
                      <div className="row-badges">
                        <span className={`pill ${sug.suggestion_key === 'busy_now' ? 'pill-danger' : 'pill-warn'}`}>
                          {sug.rule_label}
                        </span>
                        <strong>{sug.spot_name}</strong>
                        <small>{sug.municipality}</small>
                      </div>
                      <button
                        type="button"
                        className="button button-secondary no-print"
                        disabled={!!actionBusy}
                        onClick={() => void dismissSuggestion(sug)}
                      >
                        Dismiss for 24 h
                      </button>
                    </div>
                    <p style={{ marginTop: 6 }}>{sug.evidence}</p>
                    {Array.isArray(sug.alternatives) && sug.alternatives.length > 0 ? (
                      <p className="destination-meta" style={{ marginTop: 4 }}>
                        Quiet nearby alternatives:{' '}
                        {sug.alternatives.map((a: any) => `${a.name} (${a.municipality}, ${a.crowd_status})`).join(' · ')}
                      </p>
                    ) : null}
                    <div className="action-cluster no-print" style={{ marginTop: 8 }}>
                      {(sug.actions ?? []).map((act: any) => (
                        <button
                          key={act.action_key}
                          type="button"
                          className="button-approve"
                          disabled={!!actionBusy}
                          onClick={() => void applySuggestionAction(sug, act)}
                        >
                          {act.navigate_to ? act.label : `Apply: ${act.label}`}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Crowd KPIs">
            <div className="metric-grid">
              <div className="metric-card">
                <span>Unique visitors</span>
                <strong>{kpis.unique_visitors}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.unique_visitors ?? 0}%</small>
              </div>
              <div className="metric-card">
                <span>Verified visits</span>
                <strong>{kpis.verified_visits}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.verified_visits ?? 0}%</small>
              </div>
              <div className="metric-card">
                <span>Currently on site ({onsiteHours}h)</span>
                <strong>{kpis.on_site_now}</strong>
                <small>Trail check-ins: {kpis.trail_checkins}</small>
              </div>
              <div className="metric-card">
                <span>Interactions</span>
                <strong>{kpis.interactions}</strong>
                <small>Planning to go: {kpis.planning_to_go}</small>
              </div>
              <div className="metric-card">
                <span>Proofs (App / Pend / Rej)</span>
                <strong>{kpis.proofs.approved} / {kpis.proofs.pending} / {kpis.proofs.rejected}</strong>
                <small>Prev Δ: {activeData.previous_period?.delta_pct?.interactions ?? 0}% interactions</small>
              </div>
              <div className="metric-card">
                <span>Busiest hour / day</span>
                <strong>{kpis.busiest_hour !== null ? `${String(kpis.busiest_hour).padStart(2, '0')}:00` : '—'} · {kpis.busiest_day || '—'}</strong>
                <small>Avg dwell proxy: {activeData.average_dwell_minutes ?? 0} min</small>
              </div>
            </div>

            <div className="metric-grid" style={{ marginTop: 12 }}>
              <div className="metric-card">
                <span>New vs returning</span>
                <strong>{activeData.new_vs_returning?.new_visitors ?? 0} / {activeData.new_vs_returning?.returning_visitors ?? 0}</strong>
              </div>
              <div className="metric-card">
                <span>Locals vs visitors</span>
                <strong>{activeData.locals_vs_visitors?.locals ?? 0} / {activeData.locals_vs_visitors?.visitors ?? 0}</strong>
                <small>Unknown town: {activeData.locals_vs_visitors?.unknown ?? 0}</small>
              </div>
              <div className="metric-card">
                <span>Conversion funnel</span>
                <strong>{activeData.conversion_funnel?.views ?? 0} → {activeData.conversion_funnel?.directions ?? 0} → {activeData.conversion_funnel?.verified_visits ?? 0}</strong>
                <small>View→Dir {activeData.conversion_funnel?.view_to_directions_pct ?? 0}% · View→Visit {activeData.conversion_funnel?.view_to_visit_pct ?? 0}%</small>
              </div>
            </div>
          </section>

          {(activeData.peak_capacity_alerts ?? []).length > 0 && (
            <section className="stitch-panel panel-section" aria-label="Peak capacity alerts">
              <h2 className="section-title"><Flame size={18} /> Peak capacity alerts ({activeData.peak_capacity_alerts.length})</h2>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Destination</th>
                      <th>Manila hour</th>
                      <th>Pressure score</th>
                      <th>Capacity band (threshold)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeData.peak_capacity_alerts.slice(0, 15).map((a: any, i: number) => (
                      <tr key={`${a.spot_id}-${a.hour_bucket}-${i}`}>
                        <td>{a.spot_name}</td>
                        <td>{a.hour_bucket}</td>
                        <td><strong>{a.pressure_score}</strong></td>
                        <td>{a.capacity_band} (≥ {a.threshold})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="stitch-panel panel-section" aria-label="Traffic over time">
            <h2 className="section-title"><Activity size={18} /> Visits &amp; interactions ({granularity})</h2>
            {timeseries.length === 0 ? (
              <p className="empty-state">No activity recorded in this window.</p>
            ) : (
              <div className="bar-chart">
                {timeseries.map((row) => {
                  const v = numericOrZero(row.verified_visits);
                  const inter = numericOrZero(row.interactions);
                  return (
                    <div key={row.bucket} className="bar-row">
                      <span className="bar-label">{row.bucket}</span>
                      <div className="bar-track">
                        <div className="bar-fill bar-fill-primary" style={{ width: `${Math.round((v / maxBucketVisits) * 100)}%` }} title={`Visits: ${row.verified_visits}`} />
                        <div className="bar-fill bar-fill-secondary" style={{ width: `${Math.round((inter / maxBucketVisits) * 100)}%` }} title={`Interactions: ${row.interactions}`} />
                      </div>
                      <span className="bar-value">{row.verified_visits}v · {row.interactions}i</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="stitch-panel panel-section" aria-label="Hour by day heatmap">
            <h2 className="section-title"><Users size={18} /> Manila hour × day-of-week heatmap</h2>
            <div className="table-scroll">
              <table className="heatmap-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    {hours.map((h) => (
                      <th key={h}>{String(h).padStart(2, '0')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dowRows.map((dow) => {
                    const rowCells = heatmap.filter((c) => c.dow === dow);
                    const label = rowCells[0]?.day_label ?? String(dow);
                    return (
                      <tr key={dow}>
                        <th>{label}</th>
                        {hours.map((h) => {
                          const cell = rowCells.find((c) => c.hour === h);
                          const val = cell?.count ?? 0;
                          const alpha = val === 0 ? 0.04 : Math.min(0.9, 0.16 + (numericOrZero(val) / maxHeat) * 0.74);
                          return (
                            <td
                              key={h}
                              style={{ backgroundColor: `rgba(45, 106, 79, ${alpha})`, color: alpha > 0.5 ? '#fff' : '#1b1c1a' }}
                              title={`${label} ${String(h).padStart(2, '0')}:00 — ${val}`}
                            >
                              {val === 0 ? '' : val}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {spotDetail ? (
            <section className="stitch-panel panel-section" aria-label="Crowd status timeline">
              <h2 className="section-title">Crowd status timeline</h2>
              {(spotDetail.crowd_status_timeline ?? []).length === 0 ? (
                <p className="empty-state">No pressure timeline rows in this range.</p>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Manila day</th>
                        <th>Pressure score</th>
                        <th>Busy threshold</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {spotDetail.crowd_status_timeline.map((r: any) => (
                        <tr key={r.bucket}>
                          <td>{r.bucket}</td>
                          <td>{r.pressure_score}</td>
                          <td>{r.threshold}</td>
                          <td><span className={`pill ${r.status === 'estimated_busy' ? 'pill-danger' : r.status === 'moderate' ? 'pill-warn' : 'pill-success'}`}>{r.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ) : (
            <>
              {rawAreaItems.length > 0 && (
                <section className="stitch-panel panel-section" aria-label="Geographic traffic rollup">
                  <div className="section-heading-row" style={{ marginBottom: 10 }}>
                    <div>
                      <h2 className="section-title">
                        Traffic by {areaLevel === 'province' ? 'province' : 'municipality / city'} ({rawAreaItems.length})
                      </h2>
                      <p className="section-description">
                        {areaLevel === 'province'
                          ? 'Click a province to drill down into its municipalities and destinations.'
                          : 'Click a municipality or city to filter the destinations ledger.'}
                      </p>
                    </div>
                    <AdminSearchBar
                      value={areaSearch}
                      onChange={setAreaSearch}
                      placeholder={areaLevel === 'province' ? 'Search province…' : 'Search city or town…'}
                      ariaLabel={`Filter ${areaLevel === 'province' ? 'provinces' : 'municipalities'}`}
                      totalCount={rawAreaItems.length}
                      filteredCount={filteredAreaItems.length}
                      shownCount={pagedAreaItems.length}
                      itemLabel={areaLevel === 'province' ? 'provinces' : 'municipalities'}
                    />
                  </div>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>{areaLevel === 'province' ? 'Province' : 'Municipality / City'}</th>
                          {areaLevel !== 'province' ? <th>Province</th> : null}
                          <th>Destinations</th>
                          <th>Busy now</th>
                          <th>Unique visitors</th>
                          <th>Verified visits</th>
                          <th>Interactions</th>
                          <th>On-site now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedAreaItems.map((item: any) => (
                          <tr
                            key={item.area_key}
                            className="crowd-area-table-row"
                            onClick={() => {
                              if (areaLevel === 'province') {
                                if (isProvinceLocked) return;
                                setProvince(item.province_id || item.area_key);
                                setMunicipality('');
                                setDestPage(1);
                              } else {
                                if (isMuniLocked) return;
                                setMunicipality(item.area_name);
                                if (!province && item.province_id && item.province_id !== '__unassigned__') {
                                  setProvince(item.province_id);
                                }
                                setDestPage(1);
                              }
                            }}
                          >
                            <td>
                              <strong>{item.area_name}</strong>
                            </td>
                            {areaLevel !== 'province' ? <td>{item.province_name}</td> : null}
                            <td>{item.spots}</td>
                            <td>{item.busy_spots}</td>
                            <td>{item.unique_visitors}</td>
                            <td>{item.verified_visits}</td>
                            <td>{item.interactions}</td>
                            <td>{item.on_site_now}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <AdminPagination
                    page={areaPage}
                    totalPages={areaTotalPages}
                    totalItems={filteredAreaItems.length}
                    onPageChange={setAreaPage}
                  />
                </section>
              )}

              <section className="stitch-panel panel-section" aria-label="Category breakdown">
                <h2 className="section-title">Category breakdown</h2>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Destinations</th>
                        <th>Verified visits</th>
                        <th>Interactions</th>
                        <th>On-site now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview?.category_breakdown ?? []).map((c: any) => (
                        <tr key={c.category}>
                          <td>{c.category}</td>
                          <td>{c.spots}</td>
                          <td>{c.verified_visits}</td>
                          <td>{c.interactions}</td>
                          <td>{c.on_site_now}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="stitch-panel panel-section" aria-label="Top destinations">
                <h2 className="section-title">Destinations traffic ({totalDestinations})</h2>
                <p className="section-description">Click any destination row to drill down into its crowd timeline and funnel.</p>
                {displayDestinations.length === 0 ? (
                  <p className="empty-state">No destinations match the current filters.</p>
                ) : (
                  <>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('name')}>Destination</button></th>
                            <th>Crowd now</th>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('pressure_score')}>Pressure</button></th>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('verified_visits')}>Verified visits</button></th>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('on_site_now')}>On-site now</button></th>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('interactions')}>Interactions</button></th>
                            <th>Plan to go</th>
                            <th>Trail check-ins</th>
                            <th><button type="button" className="sort-header" onClick={() => toggleSort('dwell_minutes')}>Dwell (min)</button></th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayDestinations.map((d) => (
                            <tr key={d.spot_id} onClick={() => setSelectedSpotId(d.spot_id)} style={{ cursor: 'pointer' }}>
                              <td>
                                <strong>{d.name}</strong>
                                <small>
                                  {d.municipality}
                                  {d.province_name && d.province_name !== 'Unassigned province' ? `, ${d.province_name}` : ''}
                                  {' · '}
                                  {d.category}
                                  {d.recommendation_suppressed ? ' · SUPPRESSED' : ''}
                                </small>
                              </td>
                              <td>
                                <span className={`pill ${d.crowd_status === 'estimated_busy' ? 'pill-danger' : d.crowd_status === 'moderate' ? 'pill-warn' : ''}`}>
                                  {d.crowd_status}
                                </span>
                                <small>{d.crowd_capacity_band} ({d.crowd_confidence})</small>
                              </td>
                              <td>{d.pressure_score}</td>
                              <td>{d.verified_visits}</td>
                              <td>{d.on_site_now}</td>
                              <td>{d.interactions}</td>
                              <td>{d.planning_to_go}</td>
                              <td>{d.trail_checkins}</td>
                              <td>{d.dwell_minutes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <AdminPagination
                      page={serverPagination?.page ?? destPage}
                      totalPages={totalDestPages}
                      totalItems={totalDestinations}
                      onPageChange={setDestPage}
                    />
                  </>
                )}
              </section>
            </>
          )}
        </>
      ) : null}
      </div>

      <CrowdPrintDialog
        open={printDialogOpen}
        onClose={() => !printBusy && setPrintDialogOpen(false)}
        areas={effectiveAreas}
        isPlatform={isPlatform}
        initialProvince={province}
        initialMunicipality={municipality}
        initialFrom={from}
        initialTo={to}
        initialGranularity={granularity}
        initialOnsiteHours={onsiteHours}
        busy={printBusy}
        error={printError}
        onConfirm={(req) => void handleConfirmPrint(req)}
      />

      <CrowdPrintDocument snapshot={printSnapshot} />
    </div>
  );
}
