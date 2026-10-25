import { useEffect, useMemo, useRef, useState } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard, { type SourceRef, type TableData } from './ChartCard';
import { countryName } from '../lib/data';
import { useApp } from '../lib/context';
import { fmt, listJoin } from '../lib/format';
import { IND_LABEL, frameworksOf, isOld, key, shareOfPoor, surveyName, type Typology } from '../lib/poverty';
import type { PovMetric } from '../lib/state';
import { MPI_INDICATORS, type Mpi2026, type MpiNational, type MpiRegion } from '../lib/types';

interface GeoFile {
  type: 'FeatureCollection';
  features: { type: 'Feature'; properties: { name: string; member?: boolean }; geometry: unknown }[];
  points: Record<string, [number, number]>;
  centroids: Record<string, [number, number]>;
}

let geoReady: Promise<GeoFile> | null = null;
/** Registers two maps: survey regions over a grey regional base, and members over the same base. */
function loadGeo() {
  geoReady ??= Promise.all([fetch('geo/region.json').then((r) => r.json()), fetch('geo/mpi-regions.json').then((r) => r.json())]).then(([base, sub]: [GeoFile, GeoFile]) => {
    const covered = new Set(sub.features.map((f) => f.properties.name.split('|')[0]));
    const context = base.features.filter((f) => !covered.has(f.properties.name));
    echarts.registerMap('mpi-sub', { type: 'FeatureCollection', features: [...context, ...sub.features] } as any);
    echarts.registerMap('mpi-nat', base as any);
    return sub;
  });
  return geoReady;
}

export const METRICS: { id: PovMetric; label: string; unit: string; decimals: number; note: string }[] = [
  { id: 'headcount', label: 'Share of people who are poor (H)', unit: '% of population', decimals: 1, note: 'Multidimensional headcount ratio' },
  { id: 'mpi', label: 'MPI value', unit: '0 to 1', decimals: 3, note: 'Headcount times intensity' },
  { id: 'severe', label: 'In severe poverty', unit: '% of population', decimals: 1, note: 'Deprived in half or more of the weighted indicators' },
  { id: 'poor', label: 'Number of poor people', unit: 'thousands, 2024', decimals: 0, note: 'Survey headcount applied to the 2024 population' },
  { id: 'cooking', label: 'Poor and lacking clean cooking', unit: '% of population', decimals: 1, note: 'Censored headcount, cooking fuel' },
  { id: 'electricity', label: 'Poor and lacking electricity', unit: '% of population', decimals: 1, note: 'Censored headcount, electricity' },
  { id: 'type', label: 'Deprivation profile type', unit: 'type', decimals: 0, note: 'Typology of sub-national regions' },
];

type Unit = MpiNational | MpiRegion;
export function metricValue(u: Unit, metric: PovMetric): number | null {
  switch (metric) {
    case 'headcount':
      return u.headcount;
    case 'mpi':
      return u.mpi;
    case 'severe':
      return u.severe;
    case 'poor':
      return u.poor2024;
    case 'cooking':
      return u.censored.cooking;
    case 'electricity':
      return u.censored.electricity;
    default:
      return null;
  }
}

export function typeColour(id: string, series: string[], context: string) {
  return id === 'R' ? context : series['ABCD'.indexOf(id)] ?? context;
}

const pctPoor = (v: number | null) => (v === null ? 'n/a' : `${fmt(v, { decimals: v >= 99 && v < 100 ? 1 : 0 })}%`);

export interface Selection {
  label: string;
  iso: string;
  unit: Unit;
  isRegion: boolean;
  key: string;
}

export function resolveSelection(m: Mpi2026, sel: string | null, ds: Parameters<typeof countryName>[0]): Selection | null {
  if (!sel) return null;
  if (sel.includes('|')) {
    const r = m.regions.find((x) => key(x) === sel);
    return r ? { label: `${r.name}, ${countryName(ds, r.iso)}`, iso: r.iso, unit: r, isRegion: true, key: sel } : null;
  }
  const n = m.national[sel];
  return n ? { label: countryName(ds, sel, false), iso: sel, unit: n, isRegion: false, key: sel } : null;
}

export default function PovertyMap({ m, ty, sources }: { m: Mpi2026; ty: Typology; sources: SourceRef[] }) {
  const c = useApp();
  const { ds, theme, state } = c;
  const pv = state.pov;
  const [geo, setGeo] = useState<GeoFile | null>(null);
  const mapInst = useRef<echarts.ECharts | null>(null);
  const barInst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    loadGeo().then(setGeo);
  }, []);
  const level = pv.metric === 'type' ? 'sub' : pv.level;
  const metric = METRICS.find((x) => x.id === pv.metric) ?? METRICS[0];
  const set = (patch: Partial<typeof pv>) => c.dispatch({ type: 'pov', patch });

  const units = useMemo(
    () =>
      level === 'nat'
        ? Object.entries(m.national).map(([iso, u]) => ({ k: iso, iso, name: countryName(ds, iso), u }))
        : m.regions.map((r) => ({ k: key(r), iso: r.iso, name: r.name, u: r as Unit })),
    [level, m, ds],
  );
  const vals = units.map((x) => metricValue(x.u, pv.metric)).filter((v): v is number => v !== null);
  const [lo, hi] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];
  const fmtV = (v: number | null) => (v === null ? 'n/a' : pv.metric === 'poor' ? `${fmt(v, { decimals: 0 })}k` : fmt(v, { decimals: metric.decimals }));
  const typesById = Object.fromEntries(ty.types.map((t) => [t.id, t]));

  const tooltipBase = {
    backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
    borderColor: theme.grid,
    textStyle: { color: theme.ink, fontFamily: 'Inter, Helvetica Neue, Arial, sans-serif' },
    extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;max-width:300px;white-space:normal;',
  };
  const tip = (k: string) => {
    const s = resolveSelection(m, k, ds);
    const div = document.createElement('div');
    if (!s) {
      const iso = k;
      if (m.notCovered.includes(iso)) div.textContent = `${countryName(ds, iso, false)}: not covered by the global MPI`;
      return div;
    }
    const u = s.unit;
    const h = document.createElement('div');
    h.style.cssText = 'font-weight:700;font-size:15px';
    h.textContent = s.label;
    const rows: [string, string][] = [
      ['Poor (H)', `${fmt(u.headcount, { decimals: 1 })}%`],
      ['MPI', fmt(u.mpi, { decimals: 3 })],
      ['Poor people, 2024', `${fmt(u.poor2024 / 1000, { decimals: 2 })} million`],
      ['Poor and no clean cooking', `${fmt(u.censored.cooking, { decimals: 1 })}%`],
      ['Poor and no electricity', `${fmt(u.censored.electricity, { decimals: 1 })}%`],
    ];
    if (s.isRegion) rows.push(['Profile', typesById[ty.byKey[s.key]]?.short ?? '']);
    div.append(h);
    for (const [a, b] of rows) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;gap:12px';
      const x = document.createElement('span');
      x.style.color = theme.ink2;
      x.textContent = a;
      const y = document.createElement('span');
      y.style.cssText = 'font-weight:600;font-variant-numeric:tabular-nums;text-align:right';
      y.textContent = b;
      r.append(x, y);
      div.append(r);
    }
    const yr = 'year' in u ? u.year : '';
    const f = document.createElement('div');
    f.style.cssText = `color:${theme.muted};margin-top:4px;font-size:12px`;
    f.textContent = `Survey ${yr}${isOld(yr) ? ' (older than 2018)' : ''}. Click for the full profile.`;
    div.append(f);
    return div;
  };

  const mapOption = useMemo(() => {
    if (!geo) return {};
    const isType = pv.metric === 'type';
    const typeIds = ty.types.map((t) => t.id);
    const visualMap = isType
      ? {
          type: 'piecewise',
          show: false,
          pieces: typeIds.map((id, i) => ({ value: i, label: typesById[id].short, color: typeColour(id, theme.series, theme.muted) })),
          seriesIndex: 0,
        }
      : {
          type: 'continuous',
          min: lo,
          max: hi === lo ? lo + 1 : hi,
          inRange: { color: theme.seq },
          orient: 'vertical',
          left: 4,
          bottom: 8,
          itemWidth: 12,
          itemHeight: 140,
          formatter: (v: number) => fmtV(v),
          textStyle: { color: theme.ink2, fontSize: 12 },
          calculable: true,
          seriesIndex: 0,
        };
    const hatch = { areaColor: theme.mode === 'dark' ? '#3a3936' : '#d6d5cf', decal: { symbol: 'none', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: theme.muted } };
    const data = [
      ...units.map((x) => {
        const v = isType ? typeIds.indexOf(ty.byKey[x.k]) : metricValue(x.u, pv.metric);
        const sel = pv.sel === x.k;
        return {
          name: x.k,
          value: v,
          itemStyle: { borderColor: sel ? theme.hover : theme.surface, borderWidth: sel ? 2.5 : 0.5 },
          emphasis: { itemStyle: { borderColor: theme.hover, borderWidth: 2 } },
        };
      }),
    ];
    const circles = pv.circles
      ? units.map((x) => ({ name: x.k, value: [...(geo.centroids[x.k] ?? [0, 0]), x.u.poor2024] }))
      : [];
    const maxPoor = Math.max(...units.map((x) => x.u.poor2024));
    const points = level === 'sub' ? Object.entries(geo.points).map(([k, xy]) => ({ name: k, value: xy })) : [];
    return {
      animationDurationUpdate: 300,
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => (typeof p.name === 'string' && !p.name.startsWith('ctx-') ? tip(p.name) : '') },
      visualMap,
      geo: {
        map: level === 'sub' ? 'mpi-sub' : 'mpi-nat',
        roam: true,
        scaleLimit: { min: 1, max: 10 },
        boundingCoords: [
          [91, 28.6],
          [142, -11.5],
        ],
        layoutCenter: ['54%', '50%'],
        layoutSize: '98%',
        silent: true,
        itemStyle: { areaColor: theme.mode === 'dark' ? '#2a2a28' : '#ecebe6', borderColor: theme.surface, borderWidth: 0.6 },
        regions: m.notCovered.map((iso) => ({ name: iso, itemStyle: { ...hatch, borderColor: theme.surface, borderWidth: 0.5 } })),
      },
      series: [
        { type: 'map', geoIndex: 0, data, select: { disabled: true }, emphasis: { label: { show: false } } },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          data: circles,
          symbolSize: (v: number[]) => 4 + 34 * Math.sqrt(v[2] / maxPoor),
          itemStyle: { color: 'rgba(0,0,0,0)', borderColor: theme.mode === 'dark' ? '#f0efec' : '#0b0b0b', borderWidth: 1.2, opacity: 0.85 },
          emphasis: { itemStyle: { borderColor: theme.hover, borderWidth: 2 } },
          z: 4,
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          data: points,
          symbol: 'diamond',
          symbolSize: 10,
          itemStyle: { color: isType ? typeColour(ty.byKey['MMR|Naypyitaw'] ?? 'R', theme.series, theme.muted) : theme.ink2, borderColor: theme.surface, borderWidth: 1 },
          label: { show: true, position: 'right', formatter: () => 'Nay Pyi Taw', color: theme.ink2, fontSize: 10 },
          z: 5,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo, units, pv.metric, pv.sel, pv.circles, level, theme, lo, hi, ty]);

  const ranked = useMemo(() => {
    const isType = pv.metric === 'type';
    const rows = units
      .map((x) => ({ ...x, v: isType ? x.u.headcount : metricValue(x.u, pv.metric) }))
      .filter((x): x is typeof x & { v: number } => x.v !== null)
      .sort((a, b) => b.v - a.v);
    return level === 'nat' ? rows : rows.slice(0, 25);
  }, [units, pv.metric, level]);

  const barOption = useMemo(
    () => ({
      grid: { left: level === 'nat' ? 92 : 150, right: 60, top: 8, bottom: 8 },
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => tip(ranked[p.dataIndex].k) },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, fontSize: 11 } },
      yAxis: {
        type: 'category',
        inverse: true,
        data: ranked.map((r) => (level === 'nat' ? r.name : `${r.name} (${r.iso})`)),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.axis } },
        axisLabel: { color: theme.ink2, fontSize: level === 'nat' ? 13 : 11 },
      },
      series: [
        {
          type: 'bar',
          barWidth: '64%',
          data: ranked.map((r) => ({
            value: r.v,
            itemStyle: {
              color:
                pv.metric === 'type'
                  ? typeColour(ty.byKey[r.k], theme.series, theme.muted)
                  : pv.sel === r.k
                    ? theme.series[0]
                    : theme.mode === 'dark'
                      ? '#6b6a64'
                      : '#a9a8a1',
              borderRadius: [0, 4, 4, 0],
              borderColor: pv.sel === r.k ? theme.hover : theme.surface,
              borderWidth: pv.sel === r.k ? 2 : 1,
            },
          })),
          label: {
            show: true,
            position: 'right',
            color: theme.ink2,
            fontSize: 11,
            formatter: (p: any) => {
              const yr = 'year' in ranked[p.dataIndex].u ? (ranked[p.dataIndex].u as MpiNational).year : '';
              return `${fmtV(p.value)}${level === 'nat' && isOld(yr) ? ' *' : ''}`;
            },
          },
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ranked, theme, pv.sel, pv.metric, level, ty],
  );

  const onPick = (k: string | undefined) => {
    if (!k || k.startsWith('ctx-') || m.notCovered.includes(k)) return;
    set({ sel: pv.sel === k ? null : k });
  };
  const metricShown = pv.metric === 'type' ? METRICS[0] : metric;
  const table: TableData = {
    columns: ['Area', 'Country', 'Survey', `${metricShown.label} (${metricShown.unit})`, 'Poor people (thousands, 2024)', ...(level === 'sub' ? ['Profile type'] : [])],
    rows: units.map((x) => [
      x.name,
      countryName(ds, x.iso, false),
      'year' in x.u ? x.u.year : '',
      fmtV(metricValue(x.u, metricShown.id)),
      fmt(x.u.poor2024, { decimals: 0 }),
      ...(level === 'sub' ? [typesById[ty.byKey[x.k]]?.short ?? ''] : []),
    ]),
  };
  const old = Object.entries(m.national).filter(([, n]) => isOld(n.year));

  return (
    <div id="pov-map" className="space-y-3">
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Level</span>
          <div className="flex gap-1.5" role="group" aria-label="Map level">
            {(
              [
                ['nat', 'Country'],
                ['sub', 'Sub-national region'],
              ] as const
            ).map(([id, label]) => (
              <button key={id} className="chip" aria-pressed={level === id} onClick={() => set({ level: id, metric: id === 'nat' && pv.metric === 'type' ? 'headcount' : pv.metric })}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">Show</span>
          <select className="select" value={pv.metric} onChange={(e) => set({ metric: e.target.value as PovMetric, level: e.target.value === 'type' ? 'sub' : pv.level })}>
            {METRICS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-ink-2">
          <input type="checkbox" checked={pv.circles} onChange={(e) => set({ circles: e.target.checked })} />
          Circles sized by number of poor people
        </label>
        <p className="max-w-md pb-1 text-sm text-ink-3">{metric.note}. Click any area on the map or a bar in the ranking to open its profile.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-5"
          title={level === 'nat' ? 'Ranking of members' : 'Top 25 regions'}
          subtitle={`${pv.metric === 'type' ? 'Share of people who are poor, coloured by profile type' : metric.label} (${metricShown.unit})`}
          sources={sources}
          table={table}
          fileStem={`mpi-${level}-${pv.metric}`}
          onPng={() => barInst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
        >
          <EChart option={barOption} height={ranked.length * (level === 'nat' ? 36 : 22) + 24} ariaLabel="Ranking" onClick={(p) => onPick(ranked[p.dataIndex]?.k)} instanceRef={(i) => (barInst.current = i)} />
          {level === 'nat' && old.length > 0 && <p className="mt-1 text-xs text-ink-3">* Survey older than 2018: {old.map(([iso, n]) => `${countryName(ds, iso)} ${n.year}`).join(', ')}.</p>}
        </ChartCard>
        <ChartCard
          className="xl:col-span-7"
          title={`${metric.label}, latest survey`}
          subtitle={`${level === 'nat' ? 'Eight members covered by the global MPI' : '133 survey regions in eight members'}. Darker grey: not covered. Drag to pan, scroll to zoom.`}
          sources={sources}
          table={table}
          fileStem={`mpi-map-${level}-${pv.metric}`}
          onPng={() => mapInst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
        >
          {pv.metric === 'type' && <TypeKey ty={ty} />}
          {geo ? (
            <EChart option={mapOption} height={480} ariaLabel={`Map of ${metric.label}`} onClick={(p) => onPick(p.name)} instanceRef={(i) => (mapInst.current = i)} />
          ) : (
            <div className="flex h-[480px] items-center justify-center text-sm text-ink-3">Loading boundaries</div>
          )}
          <p className="mt-1 text-xs text-ink-3">
            The boundaries and names shown and the designations used on this map do not imply official endorsement or acceptance by the United Nations. Region shapes:{' '}
            <a className="text-brand underline underline-offset-2" href="https://www.geoboundaries.org/" target="_blank" rel="noreferrer">
              geoBoundaries
            </a>{' '}
            (CC BY 4.0), with Thai and Vietnamese provinces grouped into survey regions; Nay Pyi Taw is shown as a point.
          </p>
        </ChartCard>
      </div>
    </div>
  );
}

function TypeKey({ ty }: { ty: Typology }) {
  const { theme } = useApp();
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
      {ty.types.map((t) => (
        <span key={t.id} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: typeColour(t.id, theme.series, theme.muted) }} />
          {t.id === 'R' ? t.label : `${t.id}. ${t.short}`}
        </span>
      ))}
    </div>
  );
}

/** Profile of the selected country or region. */
export function ProfilePanel({ m, ty, sources }: { m: Mpi2026; ty: Typology; sources: SourceRef[] }) {
  const c = useApp();
  const { ds, theme, state } = c;
  const s = resolveSelection(m, state.pov.sel, ds);
  const inst = useRef<echarts.ECharts | null>(null);
  const option = useMemo(() => {
    if (!s) return {};
    const cats = MPI_INDICATORS.map((i) => IND_LABEL[i]);
    return {
      grid: { left: 128, right: 48, top: 8, bottom: 20 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff', borderColor: theme.grid, textStyle: { color: theme.ink }, valueFormatter: (v: number) => (v === null || v === undefined ? 'not surveyed' : `${fmt(v, { decimals: 1 })}%`) },
      xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: cats, axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 12 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: [
        { type: 'bar', name: 'All people deprived', data: MPI_INDICATORS.map((i) => s.unit.raw[i]), itemStyle: { color: theme.mode === 'dark' ? '#6b6a64' : '#bdbcb5', borderRadius: [0, 3, 3, 0] }, barGap: '15%' },
        {
          type: 'bar',
          name: 'Poor and deprived',
          data: MPI_INDICATORS.map((i) => s.unit.censored[i]),
          itemStyle: { color: theme.series[0], borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', fontSize: 11, color: theme.ink2, formatter: (p: any) => (p.value === null || p.value === undefined ? 'n/a' : fmt(p.value, { decimals: 1 })) },
        },
      ],
    };
  }, [s, theme]);
  if (!s) {
    return (
      <div className="card border-dashed p-4 text-sm text-ink-2">
        Select a country or region on the map or in the ranking to see its full deprivation profile, its profile type and any ASEAN sub-regional framework it belongs to.
      </div>
    );
  }
  const u = s.unit;
  const t = s.isRegion ? ty.types.find((x) => x.id === ty.byKey[s.key]) : undefined;
  const fws = s.isRegion ? frameworksOf(ds, s.key) : [];
  const nat = m.national[s.iso];
  const tiles: [string, string][] = [
    ['Poor (H)', `${fmt(u.headcount, { decimals: 1 })}%`],
    ['MPI', fmt(u.mpi, { decimals: 3 })],
    ['Intensity (A)', `${fmt(u.intensity, { decimals: 1 })}%`],
    ['Poor people, 2024', `${fmt(u.poor2024 / 1000, { decimals: 2 })} m`],
    ['Severe poverty', `${fmt(u.severe, { decimals: 1 })}%`],
    ['Vulnerable', `${fmt(u.vulnerable, { decimals: 1 })}%`],
    ['Poor lacking clean cooking', `${pctPoor(shareOfPoor(u.censored.cooking, u.headcount))} of the poor`],
    ['Poor lacking electricity', `${pctPoor(shareOfPoor(u.censored.electricity, u.headcount))} of the poor`],
  ];
  const table: TableData = {
    columns: ['Indicator', 'All people deprived (%)', 'Poor and deprived (%)', 'Contribution to MPI (%)'],
    rows: MPI_INDICATORS.map((i) => [IND_LABEL[i], fmt(u.raw[i], { decimals: 1 }), fmt(u.censored[i], { decimals: 1 }), fmt(u.contrib[i], { decimals: 1 })]),
  };
  return (
    <ChartCard
      title={s.label}
      subtitle={`${surveyName(nat.survey)} ${nat.year}${isOld(nat.year) ? ', older than 2018' : ''}${nat.missing ? `. Not surveyed: ${nat.missing.toLowerCase()} (weights redistributed)` : ''}.`}
      sources={sources}
      table={table}
      fileStem={`mpi-profile-${s.key.replace(/[^A-Za-z0-9]+/g, '-')}`}
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      actions={
        <button className="btn" onClick={() => c.dispatch({ type: 'pov', patch: { sel: null } })} aria-label="Close profile">
          Close
        </button>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <dl className="grid grid-cols-2 gap-2">
            {tiles.map(([a, b]) => (
              <div key={a} className="rounded-lg border border-line bg-raised p-2.5">
                <dt className="text-xs text-ink-3">{a}</dt>
                <dd className="tabular text-[17px] font-semibold text-ink">{b}</dd>
              </div>
            ))}
          </dl>
          {t && (
            <p className="mt-3 flex items-start gap-2 text-sm text-ink-2">
              <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: typeColour(t.id, theme.series, theme.muted) }} />
              <span>
                <span className="font-semibold text-ink">{t.label}.</span> Shares this profile with {t.members.length - 1} other regions in {listJoin(t.countries.map((i) => (i === 'PHL' ? 'the Philippines' : countryName(ds, i))))}.
              </span>
            </p>
          )}
          {fws.map(({ fw, extent }) => (
            <p key={fw.id} className="mt-2 text-sm text-ink-2">
              <span className="font-semibold text-ink">{extent === 'full' ? 'Inside' : 'Partly inside'} the {fw.short} area.</span>{' '}
              {extent === 'partial' ? `${fw.partialNote} ` : ''}
              <a className="text-brand underline underline-offset-2" href={fw.sourceUrl} target="_blank" rel="noreferrer">
                Member territories
              </a>
              .
            </p>
          ))}
        </div>
        <div className="lg:col-span-7">
          <div className="mb-1 flex flex-wrap gap-x-4 text-sm text-ink-2" aria-label="Legend">
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: theme.mode === 'dark' ? '#6b6a64' : '#bdbcb5' }} />
              All people deprived
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: theme.series[0] }} />
              Poor and deprived
            </span>
          </div>
          <EChart option={option} height={330} ariaLabel={`Deprivation profile of ${s.label}`} instanceRef={(i) => (inst.current = i)} />
        </div>
      </div>
    </ChartCard>
  );
}
