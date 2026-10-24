import { useMemo, useRef } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard from './ChartCard';
import { YearSlider } from './Controls';
import { CountryPicker } from './Controls';
import { allYears, countryName, median, meta, value, visibleIndicators } from '../lib/data';
import { focusColour, useApp } from '../lib/context';
import { fmt } from '../lib/format';

const INCOME_ORDER = ['LMC', 'UMC', 'HIC'] as const;

/** Value at `year`, or the most recent of the two prior years (flagged). */
function near(ds: any, id: string, iso: string, year: number) {
  for (let back = 0; back <= 2; back++) {
    const v = value(ds, id, iso, year - back);
    if (v !== undefined) return { v, y: year - back };
  }
  return undefined;
}

function pearson(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 4) return undefined;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : undefined;
}

export default function ExplorerView() {
  const c = useApp();
  const { ds, theme, state } = c;
  const ex = state.ex;
  const mx = meta(ds, ex.x);
  const my = meta(ds, ex.y);
  const inst = useRef<echarts.ECharts | null>(null);
  const years = useMemo(() => {
    const a = new Set(allYears(ds, ex.x));
    return allYears(ds, ex.y).filter((y) => a.has(y) || a.has(y - 1) || a.has(y - 2)).filter((y) => y >= 1995);
  }, [ds, ex.x, ex.y]);
  const year = ex.year && years.includes(ex.year) ? ex.year : years[years.length - 1];
  const income = ds.static.income;

  const points = useMemo(() => {
    if (year === undefined) return [];
    return ds.meta.countries
      .map((ct) => {
        const x = near(ds, ex.x, ct.iso3, year);
        const y = near(ds, ex.y, ct.iso3, year);
        if (!x || !y) return null;
        const w = ex.size === 'none' ? undefined : near(ds, ex.size === 'pop' ? 'aux_pop' : 'aux_gdp', ct.iso3, year)?.v;
        return { iso: ct.iso3, x: x.v, y: y.v, xy: x.y, yy: y.y, w, group: income.rows[ct.iso3]?.group };
      })
      .filter((p): p is NonNullable<typeof p> => Boolean(p));
  }, [ds, ex.x, ex.y, ex.size, year, income]);

  const canLogX = points.every((p) => p.x > 0);
  const canLogY = points.every((p) => p.y > 0);
  const logx = ex.logx && canLogX;
  const logy = ex.logy && canLogY;
  const r = pearson(points.map((p) => (logx ? Math.log(p.x) : p.x)), points.map((p) => (logy ? Math.log(p.y) : p.y)));

  const option = useMemo(() => {
    const maxW = Math.max(...points.map((p) => p.w ?? 0), 1);
    const size = (w?: number) => (w === undefined ? 16 : 10 + Math.sqrt(w / maxW) * 46);
    const groupColour = (g?: string) => theme.series[Math.max(0, INCOME_ORDER.indexOf((g ?? 'LMC') as never))];
    const mxv = median(points.map((p) => p.x));
    const myv = median(points.map((p) => p.y));
    const series: any[] = INCOME_ORDER.map((g) => ({
      type: 'scatter',
      name: income.groups[g],
      data: points
        .filter((p) => p.group === g)
        .map((p) => {
          const col = focusColour(c, p.iso);
          const hov = c.hovered === p.iso;
          return {
            value: [p.x, p.y],
            iso: p.iso,
            p,
            symbolSize: size(p.w),
            itemStyle: { color: groupColour(g), opacity: 0.88, borderColor: col ?? (hov ? theme.hover : theme.surface), borderWidth: col ? 3.5 : hov ? 3 : 2 },
            label: { show: true, position: 'right', formatter: countryName(ds, p.iso), color: col ? theme.ink : theme.ink2, fontWeight: col ? 700 : 400, fontSize: 12 },
          };
        }),
      emphasis: { scale: 1.1 },
      z: 3,
    }));
    if (ex.trails && year !== undefined) {
      for (const f of state.focus) {
        const path = years
          .filter((y) => y <= year)
          .map((y) => {
            const x = value(ds, ex.x, f.iso, y);
            const yy = value(ds, ex.y, f.iso, y);
            return x !== undefined && yy !== undefined ? [x, yy, y] : null;
          })
          .filter(Boolean);
        series.push({
          type: 'line',
          name: `${countryName(ds, f.iso)} path`,
          data: path,
          showSymbol: true,
          symbolSize: 5,
          lineStyle: { color: theme.series[f.slot], width: 2, opacity: 0.8 },
          itemStyle: { color: theme.series[f.slot] },
          tooltip: { show: false },
          z: 2,
        });
      }
    }
    series[0].markLine = {
      silent: true,
      symbol: 'none',
      lineStyle: { color: theme.muted, type: [4, 4], width: 1 },
      label: { color: theme.muted, fontSize: 11 },
      data: [
        ...(mxv !== undefined ? [{ xAxis: mxv, label: { formatter: 'median', position: 'end' } }] : []),
        ...(myv !== undefined ? [{ yAxis: myv, label: { formatter: 'median', position: 'end' } }] : []),
      ],
    };
    const axis = (m: typeof mx, log: boolean) => ({
      type: log ? 'log' : 'value',
      name: `${m.label} (${m.unitShort || m.unit})${log ? ', log scale' : ''}`,
      nameLocation: 'middle',
      nameTextStyle: { color: theme.ink2, fontSize: 13 },
      scale: true,
      axisLabel: { color: theme.muted, formatter: (v: number) => fmt(v, { decimals: m.decimals > 2 ? 2 : Math.min(m.decimals, 1) }) },
      splitLine: { lineStyle: { color: theme.grid } },
      axisLine: { lineStyle: { color: theme.axis } },
    });
    return {
      animationDurationUpdate: 600,
      animationEasingUpdate: 'cubicOut' as const,
      grid: { left: 76, right: 40, top: 24, bottom: 64 },
      tooltip: {
        trigger: 'item',
        backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
        borderColor: theme.grid,
        textStyle: { color: theme.ink },
        formatter: (prm: any) => {
          const p = prm.data?.p;
          if (!p) return '';
          const d = document.createElement('div');
          const h = document.createElement('div');
          h.style.cssText = 'font-weight:700;margin-bottom:2px';
          h.textContent = `${countryName(ds, p.iso, false)} (${income.groups[p.group] ?? ''})`;
          d.append(h);
          const line = (label: string, v: string) => {
            const r = document.createElement('div');
            const b = document.createElement('b');
            b.textContent = v;
            const s = document.createElement('span');
            s.style.color = theme.ink2;
            s.textContent = ` ${label}`;
            r.append(b, s);
            d.append(r);
          };
          line(`${mx.label}${p.xy !== year ? ` (${p.xy})` : ''}`, fmt(p.x, mx, true));
          line(`${my.label}${p.yy !== year ? ` (${p.yy})` : ''}`, fmt(p.y, my, true));
          if (p.w !== undefined) line(ex.size === 'pop' ? 'population' : 'GDP, constant US$', fmt(p.w, { decimals: 0 }));
          return d;
        },
      },
      xAxis: { ...axis(mx, logx), nameGap: 36 },
      yAxis: { ...axis(my, logy), nameGap: 54 },
      series,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, theme, state.focus, c.hovered, ex.trails, logx, logy, year]);

  const groups = (pillarId: string) => visibleIndicators(ds, pillarId);
  const Select = ({ v, onChange, label }: { v: string; onChange: (s: string) => void; label: string }) => (
    <label className="flex min-w-[240px] flex-1 flex-col gap-1">
      <span className="eyebrow">{label}</span>
      <select className="select" value={v} onChange={(e) => onChange(e.target.value)}>
        {ds.meta.pillars.map((p) => (
          <optgroup key={p.id} label={p.label}>
            {groups(p.id).map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  const PRESETS = [
    { label: 'Income and carbon intensity', x: 'gdppc_ppp', y: 'co2_intensity' },
    { label: 'Human development and planetary pressure', x: 'hdi', y: 'hdi_phdi_loss' },
    { label: 'Investment and renewables', x: 'gcf', y: 're_share' },
    { label: 'Revenue and public debt', x: 'gg_rev', y: 'gg_debt' },
    { label: 'Credit depth and market size', x: 'priv_credit', y: 'mkt_cap' },
    { label: 'Electricity access and income', x: 'gdppc_ppp', y: 'elec_access' },
  ];

  const table = {
    columns: ['Country', 'Income group', `${mx.label} (${mx.unit})`, `${my.label} (${my.unit})`],
    rows: points.map((p) => [countryName(ds, p.iso, false), income.groups[p.group ?? ''] ?? '', fmt(p.x, mx), fmt(p.y, my)] as (string | number)[]),
  };

  return (
    <div id="explorer" className="space-y-3">
      <div className="card space-y-3 p-4">
        <div>
          <h2 className="text-[20px] font-bold text-ink">Relationship explorer</h2>
          <p className="mt-1 max-w-3xl text-[15px] text-ink-2">Put any two indicators against each other, size the bubbles by population or GDP, and press Play to watch members move over time. Highlighted countries can leave a trail.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} className="chip" aria-pressed={ex.x === p.x && ex.y === p.y} onClick={() => c.dispatch({ type: 'ex', patch: { x: p.x, y: p.y, year: null } })}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Select v={ex.x} label="Horizontal axis" onChange={(x) => c.dispatch({ type: 'ex', patch: { x, year: null } })} />
          <button className="btn mb-0.5" title="Swap axes" onClick={() => c.dispatch({ type: 'ex', patch: { x: ex.y, y: ex.x, logx: ex.logy, logy: ex.logx } })}>
            Swap
          </button>
          <Select v={ex.y} label="Vertical axis" onChange={(y) => c.dispatch({ type: 'ex', patch: { y, year: null } })} />
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Bubble size</span>
            <select className="select" value={ex.size} onChange={(e) => c.dispatch({ type: 'ex', patch: { size: e.target.value as typeof ex.size } })}>
              <option value="pop">Population</option>
              <option value="gdp">GDP</option>
              <option value="none">Equal</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-[300px] flex-1 flex-col gap-1">
            <span className="eyebrow">Year</span>
            <YearSlider years={years} year={year} onYear={(y) => c.dispatch({ type: 'ex', patch: { year: y } })} />
          </div>
          <label className={`flex items-center gap-2 text-sm ${canLogX ? 'text-ink-2' : 'text-ink-3'}`}>
            <input type="checkbox" disabled={!canLogX} checked={logx} onChange={(e) => c.dispatch({ type: 'ex', patch: { logx: e.target.checked } })} />
            Log horizontal
          </label>
          <label className={`flex items-center gap-2 text-sm ${canLogY ? 'text-ink-2' : 'text-ink-3'}`}>
            <input type="checkbox" disabled={!canLogY} checked={logy} onChange={(e) => c.dispatch({ type: 'ex', patch: { logy: e.target.checked } })} />
            Log vertical
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={ex.trails} onChange={(e) => c.dispatch({ type: 'ex', patch: { trails: e.target.checked } })} />
            Trails for highlighted countries
          </label>
        </div>
        <CountryPicker />
      </div>
      <ChartCard
        title={`${my.label} against ${mx.label}, ${year ?? ''}`}
        subtitle={`${points.length} members with data. ${r !== undefined ? `Correlation across members: r = ${fmt(r, { decimals: 2 })}${logx || logy ? ' (on the log scale shown)' : ''}. With ${points.length} countries, treat this as descriptive only.` : ''}`}
        table={table}
        fileStem={`explorer-${ex.x}-${ex.y}-${year}`}
        onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      >
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
          {INCOME_ORDER.map((g, i) => (
            <span key={g} className="flex items-center gap-1.5">
              <span aria-hidden style={{ width: 12, height: 12, borderRadius: 999, background: theme.series[i], display: 'inline-block' }} />
              {income.groups[g]} (FY2027)
            </span>
          ))}
          <span className="text-ink-3">Dashed lines: medians. A year in brackets in the tooltip means the latest value up to two years earlier was used.</span>
        </div>
        <EChart
          option={option}
          height={520}
          onClick={(p) => p.data?.iso && c.dispatch({ type: 'toggleFocus', iso: p.data.iso })}
          onHover={(p) => p.data?.iso && c.setHovered(p.data.iso)}
          onOut={() => c.setHovered(null)}
          ariaLabel={`Scatter plot of ${my.label} against ${mx.label}`}
          instanceRef={(i) => (inst.current = i)}
        />
      </ChartCard>
    </div>
  );
}
