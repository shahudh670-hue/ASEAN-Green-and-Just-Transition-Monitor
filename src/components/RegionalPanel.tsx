import { useEffect, useMemo, useRef, useState } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard from './ChartCard';
import { aggregate, change, countryName, meta, value } from '../lib/data';
import { focusColour, useApp } from '../lib/context';
import { fmt, fmtSigned } from '../lib/format';

const SMALL_STATES: Record<string, [number, number]> = { SGP: [103.82, 1.35], BRN: [114.73, 4.53] };
let mapReady: Promise<void> | null = null;
function loadMap() {
  mapReady ??= fetch('geo/region.json')
    .then((r) => r.json())
    .then((geo) => echarts.registerMap('asean-region', geo));
  return mapReady;
}

export default function RegionalPanel({ year }: { year: number | undefined }) {
  const c = useApp();
  const { ds, theme, state } = c;
  const m = meta(ds, state.indicator);
  const [ready, setReady] = useState(false);
  const mapInst = useRef<echarts.ECharts | null>(null);
  const barInst = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    loadMap().then(() => setReady(true));
  }, []);

  const rows = useMemo(() => {
    if (year === undefined) return [];
    return ds.meta.countries
      .map((ct) => ({ iso: ct.iso3, name: ct.short, v: value(ds, state.indicator, ct.iso3, year) }))
      .filter((r): r is { iso: string; name: string; v: number } => r.v !== undefined)
      .sort((a, b) => b.v - a.v);
  }, [ds, state.indicator, year]);
  const missing = ds.meta.countries.filter((ct) => !rows.some((r) => r.iso === ct.iso3)).map((ct) => ct.short);
  const agg = year !== undefined && state.agg !== 'off' ? aggregate(ds, state.indicator, year, state.agg) : undefined;
  const vals = rows.map((r) => r.v);
  const [lo, hi] = vals.length ? [Math.min(...vals), Math.max(...vals)] : [0, 1];

  const tip = (iso: string) => {
    const v = value(ds, state.indicator, iso, year ?? 0);
    const rank = rows.findIndex((r) => r.iso === iso) + 1;
    const ch = change(ds, state.indicator, iso, 5, year);
    const div = document.createElement('div');
    const strong = document.createElement('div');
    strong.style.cssText = 'font-size:16px;font-weight:700';
    strong.textContent = v === undefined ? 'No data' : fmt(v, m, true);
    const name = document.createElement('div');
    name.style.cssText = `color:${theme.ink2}`;
    name.textContent = `${countryName(ds, iso, false)}, ${year}`;
    div.append(strong, name);
    if (rank) {
      const r = document.createElement('div');
      r.style.cssText = `color:${theme.ink2};margin-top:4px`;
      r.textContent = `Rank ${rank} of ${rows.length}${ch ? `; ${fmtSigned(ch.diff, m.decimals)} since ${ch.startYear}` : ''}`;
      div.append(r);
    }
    const hint = document.createElement('div');
    hint.style.cssText = `color:${theme.muted};margin-top:4px;font-size:12px`;
    hint.textContent = focusColour(c, iso) ? 'Click to remove highlight' : 'Click to highlight';
    div.append(hint);
    return div;
  };

  const tooltipBase = {
    backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
    borderColor: theme.grid,
    textStyle: { color: theme.ink, fontFamily: 'Source Sans 3, system-ui, sans-serif' },
    extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;',
  };

  const mapOption = useMemo(() => {
    if (!ready) return {};
    const focused = new Set(state.focus.map((f) => f.iso));
    return {
      animationDurationUpdate: 400,
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => (p.name?.startsWith('ctx-') ? '' : tip(p.data?.iso ?? p.name)) },
      visualMap: {
        type: 'continuous',
        min: lo,
        max: hi === lo ? lo + 1 : hi,
        seriesIndex: [0, 1],
        inRange: { color: theme.seq },
        orient: 'vertical',
        left: 4,
        bottom: 8,
        itemWidth: 12,
        itemHeight: 150,
        formatter: (v: number) => fmt(v, m),
        textStyle: { color: theme.ink2, fontSize: 12 },
        calculable: true,
        realtime: true,
      },
      geo: {
        map: 'asean-region',
        roam: true,
        scaleLimit: { min: 1, max: 8 },
        boundingCoords: [
          [91, 25],
          [142, -11.5],
        ],
        layoutCenter: ['54%', '50%'],
        layoutSize: '96%',
        silent: true,
        itemStyle: { areaColor: theme.mode === 'dark' ? '#2a2a28' : '#ecebe6', borderColor: theme.surface, borderWidth: 0.8 },
      },
      series: [
        {
          type: 'map',
          geoIndex: 0,
          data: ds.meta.countries.map((ct) => {
            const v = year !== undefined ? value(ds, state.indicator, ct.iso3, year) : undefined;
            const col = focusColour(c, ct.iso3);
            return {
              name: ct.iso3,
              iso: ct.iso3,
              value: v ?? null,
              itemStyle: {
                borderColor: col ?? (c.hovered === ct.iso3 ? theme.hover : theme.surface),
                borderWidth: col ? 2.5 : c.hovered === ct.iso3 ? 2 : 0.8,
                ...(v === undefined ? { areaColor: theme.mode === 'dark' ? '#3a3936' : '#d6d5cf', decal: { symbol: 'none', dashArrayX: [1, 0], dashArrayY: [2, 4], rotation: Math.PI / 4, color: theme.muted } } : {}),
              },
              emphasis: { itemStyle: { borderColor: theme.hover, borderWidth: 2 } },
            };
          }),
          emphasis: { label: { show: false } },
          select: { disabled: true },
        },
        {
          type: 'scatter',
          coordinateSystem: 'geo',
          symbolSize: 13,
          data: Object.entries(SMALL_STATES)
            .map(([iso, xy]) => ({ iso, name: iso, value: [...xy, year !== undefined ? value(ds, state.indicator, iso, year) ?? null : null] }))
            .filter((d) => d.value[2] !== null),
          itemStyle: { borderColor: theme.surface, borderWidth: 2 },
          label: { show: true, position: 'right', formatter: (p: any) => countryName(ds, p.data.iso), color: theme.ink2, fontSize: 11 },
          z: 5,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ds, state.indicator, year, theme, state.focus, c.hovered, lo, hi]);

  const barOption = useMemo(() => {
    const aggLine = agg && agg.method !== 'sum'
      ? [{ xAxis: agg.value, lineStyle: { color: theme.aggregate, type: 'dashed', width: 1.5 }, label: { formatter: `ASEAN ${fmt(agg.value, m)}`, color: theme.ink2, position: 'start', fontSize: 11 } }]
      : [];
    return {
      animationDurationUpdate: 400,
      grid: { left: 92, right: 56, top: 26, bottom: 8 },
      tooltip: { ...tooltipBase, trigger: 'item', formatter: (p: any) => tip(p.data.iso) },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, fontSize: 11 }, min: Math.min(0, lo) },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map((r) => r.name),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.axis } },
        axisLabel: { color: theme.ink2, fontSize: 13 },
      },
      series: [
        {
          type: 'bar',
          barWidth: '62%',
          data: rows.map((r) => {
            const col = focusColour(c, r.iso);
            const hov = c.hovered === r.iso;
            return {
              value: r.v,
              iso: r.iso,
              itemStyle: {
                color: col ?? (theme.mode === 'dark' ? '#6b6a64' : '#a9a8a1'),
                borderRadius: r.v >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4],
                borderColor: hov ? theme.hover : theme.surface,
                borderWidth: hov ? 2 : 1,
              },
            };
          }),
          label: { show: true, position: 'right', color: theme.ink2, fontSize: 12, formatter: (p: any) => fmt(p.value, m) },
          markLine: { silent: true, symbol: 'none', data: aggLine },
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, theme, state.focus, c.hovered, agg?.value, lo]);

  const onClick = (p: any) => {
    const iso = p.data?.iso ?? (typeof p.name === 'string' && !p.name.startsWith('ctx-') ? p.name : null);
    if (iso && ds.meta.countries.some((ct) => ct.iso3 === iso)) c.dispatch({ type: 'toggleFocus', iso });
  };
  const onHover = (p: any) => {
    const iso = p.data?.iso ?? null;
    if (iso) c.setHovered(iso);
  };

  const table = {
    columns: ['Rank', 'Country', `${m.label} (${m.unit}), ${year ?? ''}`],
    rows: rows.map((r, i) => [i + 1, countryName(ds, r.iso, false), fmt(r.v, m)] as (string | number)[]),
  };
  const csvTable = {
    columns: ['Country', 'ISO3', 'Year', m.label, 'Unit'],
    rows: rows.map((r) => [countryName(ds, r.iso, false), r.iso, year ?? '', r.v, m.unit] as (string | number)[]),
  };

  return (
    <div id="regional" className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <ChartCard
        className="xl:col-span-7"
        title={`${m.label}, ${year ?? ''}`}
        subtitle={`${m.unit}. Drag to pan, scroll to zoom, click a country to highlight it everywhere.`}
        meta={m}
        table={table}
        fileStem={`map-${m.id}-${year}`}
        onPng={() => mapInst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      >
        <EChart
          option={mapOption}
          height={440}
          onClick={onClick}
          onHover={onHover}
          onOut={() => c.setHovered(null)}
          ariaLabel={`Map of ${m.label} across ASEAN in ${year}`}
          instanceRef={(i) => (mapInst.current = i)}
        />
        {missing.length > 0 && <p className="mt-1 text-xs text-ink-3">Hatched or absent: no {year} data for {missing.join(', ')}.</p>}
      </ChartCard>
      <ChartCard
        className="xl:col-span-5"
        title="Ranking"
        subtitle={agg ? `Dashed line: ASEAN ${agg.method === 'sum' ? 'total' : agg.method} (${agg.n} members reporting)` : 'Members with data in the selected year'}
        table={csvTable}
        fileStem={`ranking-${m.id}-${year}`}
        onPng={() => barInst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      >
        <EChart
          option={barOption}
          height={Math.max(240, rows.length * 36 + 40)}
          onClick={onClick}
          onHover={onHover}
          onOut={() => c.setHovered(null)}
          ariaLabel={`Ranking of members on ${m.label} in ${year}`}
          instanceRef={(i) => (barInst.current = i)}
        />
      </ChartCard>
    </div>
  );
}
