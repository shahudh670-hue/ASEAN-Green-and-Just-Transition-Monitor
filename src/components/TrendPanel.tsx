import { useMemo, useRef } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard from './ChartCard';
import { aggregateSeries, countryName, meta, projectionStart, series } from '../lib/data';
import { focusColour, useApp } from '../lib/context';
import { fmt } from '../lib/format';

const FROM_OPTIONS = [1990, 2000, 2010, 2015];

export default function TrendPanel({ year }: { year: number | undefined }) {
  const c = useApp();
  const { ds, theme, state } = c;
  const m = meta(ds, state.indicator);
  const inst = useRef<echarts.ECharts | null>(null);
  const cut = projectionStart(ds);
  const includeProj = Boolean(m.projections && state.proj);

  const data = useMemo(() => {
    const out = ds.meta.countries.map((ct) => {
      let s = series(ds, state.indicator, ct.iso3, includeProj).filter(([y]) => y >= state.from);
      if (state.rebase && s.length) {
        const base = s[0][1];
        s = base ? s.map(([y, v]) => [y, (v / base) * 100] as [number, number]) : [];
      }
      return { iso: ct.iso3, s };
    });
    let agg = aggregateSeries(ds, state.indicator, state.agg, includeProj).filter(([y]) => y >= state.from);
    if (state.rebase && agg.length) {
      const base = agg[0][1];
      agg = base ? agg.map(([y, v]) => [y, (v / base) * 100] as [number, number]) : [];
    }
    return { out, agg };
  }, [ds, state.indicator, state.from, state.rebase, state.agg, includeProj]);

  const option = useMemo(() => {
    const unit = state.rebase ? 'index, first year = 100' : m.unit;
    const focused = state.focus.map((f) => f.iso);
    const sorted = [...data.out].sort((a, b) => Number(focused.includes(a.iso)) - Number(focused.includes(b.iso)));
    const lineSeries: any[] = [];
    for (const { iso, s } of sorted) {
      const col = focusColour(c, iso);
      const hov = c.hovered === iso;
      const isFocus = Boolean(col);
      const actual = includeProj ? s.filter(([y]) => y < cut) : s;
      const proj = includeProj ? s.filter(([y]) => y >= cut - 1) : [];
      const base = {
        type: 'line',
        name: countryName(ds, iso),
        showSymbol: false,
        symbolSize: 8,
        connectNulls: false,
        emphasis: { focus: 'none', lineStyle: { width: 3 } },
        z: isFocus ? 4 : hov ? 3 : 1,
        lineStyle: { width: isFocus ? 2.5 : hov ? 2 : 1.25, color: col ?? (hov ? theme.hover : theme.context) },
        itemStyle: { color: col ?? (hov ? theme.hover : theme.context) },
      };
      lineSeries.push({
        ...base,
        id: `${iso}-a`,
        data: actual,
        endLabel: {
          show: isFocus || hov,
          formatter: countryName(ds, iso),
          color: theme.ink,
          fontSize: 12,
          fontWeight: 600,
          distance: 6,
        },
        labelLayout: { moveOverlap: 'shiftY' },
      });
      if (proj.length > 1) lineSeries.push({ ...base, id: `${iso}-p`, data: proj, lineStyle: { ...base.lineStyle, type: [4, 4] }, tooltip: { show: false } });
    }
    if (data.agg.length) {
      lineSeries.push({
        type: 'line',
        id: 'asean',
        name: 'ASEAN',
        data: data.agg,
        showSymbol: false,
        z: 5,
        lineStyle: { width: 2.5, color: theme.aggregate, type: [8, 4] },
        itemStyle: { color: theme.aggregate },
        endLabel: { show: true, formatter: 'ASEAN', color: theme.ink, fontSize: 12, fontWeight: 700, distance: 6 },
        labelLayout: { moveOverlap: 'shiftY' },
      });
    }
    const years = data.out.flatMap((d) => d.s.map((p) => p[0]));
    const [minY, maxY] = years.length ? [Math.min(...years), Math.max(...years)] : [state.from, cut];
    const markYear =
      year !== undefined && !state.rebase
        ? [{ xAxis: year, lineStyle: { color: theme.muted, type: 'solid', width: 1 }, label: { formatter: String(year), color: theme.ink2, fontSize: 11 } }]
        : [];
    if (lineSeries.length) {
      lineSeries[lineSeries.length - 1].markLine = { silent: true, symbol: 'none', data: markYear };
      if (includeProj) lineSeries[lineSeries.length - 1].markArea = { silent: true, itemStyle: { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(11,11,11,0.035)' }, label: { show: true, color: theme.muted, fontSize: 11, formatter: 'IMF projections', position: 'insideTop' }, data: [[{ xAxis: cut }, { xAxis: maxY }]] };
    }

    return {
      animationDurationUpdate: 350,
      grid: { left: 56, right: 96, top: 24, bottom: 72 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: theme.muted } },
        backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
        borderColor: theme.grid,
        textStyle: { color: theme.ink, fontFamily: 'Inter, Helvetica Neue, Arial, sans-serif' },
        extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;max-height:360px;overflow:auto;',
        formatter: (ps: any[]) => {
          const yr = ps[0]?.value?.[0];
          const rows = new Map<string, { v: number; col: string; bold: boolean }>();
          for (const p of ps) {
            if (p.value?.[1] === undefined || p.seriesId?.endsWith('-p') && rows.has(p.seriesName)) continue;
            const iso = p.seriesId?.split('-')[0];
            const col = p.seriesId === 'asean' ? theme.aggregate : focusColour(c, iso) ?? theme.context;
            rows.set(p.seriesName, { v: p.value[1], col, bold: p.seriesId === 'asean' || Boolean(focusColour(c, iso)) });
          }
          const wrap = document.createElement('div');
          const head = document.createElement('div');
          head.style.cssText = `font-weight:700;margin-bottom:4px`;
          head.textContent = `${yr}${includeProj && yr >= cut ? ' (projection)' : ''}`;
          wrap.append(head);
          [...rows.entries()]
            .sort((a, b) => Number(b[1].bold) - Number(a[1].bold) || b[1].v - a[1].v)
            .forEach(([name, r]) => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;align-items:center;gap:8px;line-height:20px';
              const key = document.createElement('span');
              key.style.cssText = `display:inline-block;width:14px;height:3px;border-radius:2px;background:${r.col}`;
              const val = document.createElement('span');
              val.style.cssText = `min-width:64px;text-align:right;font-variant-numeric:tabular-nums;${r.bold ? 'font-weight:700' : ''}`;
              val.textContent = fmt(r.v, state.rebase ? { decimals: 1 } : m);
              const nm = document.createElement('span');
              nm.style.cssText = `color:${theme.ink2}`;
              nm.textContent = name;
              row.append(key, val, nm);
              wrap.append(row);
            });
          return wrap;
        },
      },
      xAxis: {
        type: 'value',
        min: minY,
        max: maxY,
        interval: maxY - minY > 20 ? 5 : maxY - minY > 8 ? 2 : 1,
        axisLabel: { color: theme.muted, formatter: (v: number) => String(v) },
        axisLine: { lineStyle: { color: theme.axis } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: theme.muted, align: 'left', fontSize: 12 },
        scale: true,
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.grid } },
      },
      dataZoom: [
        { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 22,
          bottom: 16,
          filterMode: 'none',
          borderColor: theme.grid,
          fillerColor: theme.mode === 'dark' ? 'rgba(79,163,224,0.18)' : 'rgba(0,110,181,0.12)',
          handleStyle: { color: theme.surface, borderColor: theme.muted },
          textStyle: { color: theme.muted },
          dataBackground: { lineStyle: { color: theme.axis }, areaStyle: { color: theme.grid } },
          labelFormatter: (v: number) => String(Math.round(v)),
        },
      ],
      series: lineSeries,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, state.focus, c.hovered, year, includeProj, state.rebase]);

  const allYears = [...new Set(data.out.flatMap((d) => d.s.map((p) => p[0])))].sort((a, b) => a - b);
  const table = {
    columns: ['Year', ...ds.meta.countries.map((ct) => ct.short), ...(data.agg.length ? ['ASEAN'] : [])],
    rows: allYears.map((y) => [
      y,
      ...data.out.map((d) => {
        const v = d.s.find((p) => p[0] === y)?.[1];
        return v === undefined ? '' : fmt(v, state.rebase ? { decimals: 1 } : m);
      }),
      ...(data.agg.length ? [fmt(data.agg.find((p) => p[0] === y)?.[1], m)] : []),
    ]),
  };

  return (
    <div id="trend">
      <ChartCard
        title={`${m.label}: trend since ${state.from}`}
        subtitle={`${state.rebase ? 'Index, first available year = 100' : m.unit}. Hover for every member's value; drag the bar below to zoom. Grey lines are the other members.`}
        meta={m}
        table={table}
        fileStem={`trend-${m.id}`}
        onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
        actions={
          <>
            <select className="select" aria-label="Start year" value={state.from} onChange={(e) => c.set({ from: Number(e.target.value) })}>
              {FROM_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  From {y}
                </option>
              ))}
            </select>
            <label className="btn cursor-pointer">
              <input type="checkbox" checked={state.rebase} onChange={(e) => c.set({ rebase: e.target.checked })} />
              Index to 100
            </label>
          </>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
          {data.agg.length > 0 && (
            <span className="flex items-center gap-1.5">
              <svg width="22" height="4" aria-hidden>
                <line x1="0" y1="2" x2="22" y2="2" stroke={theme.aggregate} strokeWidth="2.5" strokeDasharray="6 3" />
              </svg>
              ASEAN ({state.agg === 'median' ? 'median member' : m.agg === 'sum' ? 'total' : `${m.agg === 'gdp' ? 'GDP' : 'population'}-weighted`})
            </span>
          )}
          {state.focus.map((f) => (
            <span key={f.iso} className="flex items-center gap-1.5 font-semibold text-ink">
              <span aria-hidden style={{ width: 22, height: 3, borderRadius: 2, background: theme.series[f.slot], display: 'inline-block' }} />
              {countryName(ds, f.iso)}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span aria-hidden style={{ width: 22, height: 2, background: theme.context, display: 'inline-block' }} />
            Other members
          </span>
          {state.focus.length === 0 && <span className="text-ink-3">Select countries above, on the map or in the ranking to highlight them.</span>}
        </div>
        <EChart
          option={option}
          height={420}
          onHover={(p) => p.seriesId && p.seriesId !== 'asean' && c.setHovered(p.seriesId.split('-')[0])}
          onOut={() => c.setHovered(null)}
          onClick={(p) => {
            const iso = p.seriesId?.split('-')[0];
            if (iso && iso !== 'asean') c.dispatch({ type: 'toggleFocus', iso });
          }}
          ariaLabel={`Line chart of ${m.label} over time for ASEAN members`}
          instanceRef={(i) => (inst.current = i)}
        />
      </ChartCard>
    </div>
  );
}
