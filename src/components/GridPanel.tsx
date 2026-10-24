import { useMemo, useRef } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard from './ChartCard';
import { allYears, countryName, meta, value } from '../lib/data';
import { focusColour, useApp } from '../lib/context';
import { fmt } from '../lib/format';

export default function GridPanel({ year }: { year: number | undefined }) {
  const c = useApp();
  const { ds, theme, state } = c;
  const m = meta(ds, state.indicator);
  const inst = useRef<echarts.ECharts | null>(null);
  const years = allYears(ds, state.indicator, Boolean(m.projections && state.proj)).filter((y) => y >= Math.max(state.from, 2000));
  const countries = ds.meta.countries;

  const option = useMemo(() => {
    const cells: [number, number, number][] = [];
    countries.forEach((ct, ci) =>
      years.forEach((y, yi) => {
        const v = value(ds, state.indicator, ct.iso3, y);
        if (v !== undefined) cells.push([yi, ci, v]);
      }),
    );
    const vals = cells.map((d) => d[2]);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    return {
      grid: { left: 92, right: 16, top: 8, bottom: 56 },
      tooltip: {
        backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
        borderColor: theme.grid,
        textStyle: { color: theme.ink },
        formatter: (p: any) => {
          const [yi, ci, v] = p.data;
          const d = document.createElement('div');
          const b = document.createElement('div');
          b.style.cssText = 'font-weight:700;font-size:15px';
          b.textContent = fmt(v, m, true);
          const n = document.createElement('div');
          n.style.color = theme.ink2;
          n.textContent = `${countries[ci].name}, ${years[yi]}`;
          d.append(b, n);
          return d;
        },
      },
      xAxis: { type: 'category', data: years.map(String), axisLabel: { color: theme.muted, interval: years.length > 16 ? 1 : 0 }, axisLine: { lineStyle: { color: theme.axis } }, axisTick: { show: false }, splitArea: { show: false } },
      yAxis: {
        type: 'category',
        data: countries.map((ct) => ct.short),
        inverse: true,
        axisLabel: {
          color: theme.ink2,
          fontSize: 12,
          formatter: (v: string) => v,
          rich: {},
        },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      visualMap: {
        min: lo,
        max: hi === lo ? lo + 1 : hi,
        calculable: true,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 220,
        itemWidth: 12,
        inRange: { color: theme.seq },
        textStyle: { color: theme.ink2, fontSize: 12 },
        formatter: (v: number) => fmt(v, m),
      },
      series: [
        {
          type: 'heatmap',
          data: cells,
          itemStyle: { borderColor: theme.surface, borderWidth: 2, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: theme.hover, borderWidth: 2 } },
          markLine:
            year !== undefined && years.includes(year)
              ? { silent: true, symbol: 'none', lineStyle: { color: theme.ink, width: 1.5, type: 'solid' }, label: { show: false }, data: [{ xAxis: String(year) }] }
              : undefined,
        },
      ],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ds, state.indicator, years.join(), theme, year]);

  const focusedNames = countries.filter((ct) => focusColour(c, ct.iso3)).map((ct) => ct.short);
  return (
    <ChartCard
      title="Every member, every year"
      subtitle={`${m.unit}. Blank cells have no data. Click a cell to jump the whole page to that year.${focusedNames.length ? ` Highlighted: ${focusedNames.join(', ')}.` : ''}`}
      meta={m}
      fileStem={`grid-${m.id}`}
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <EChart
        option={option}
        height={countries.length * 30 + 72}
        onClick={(p) => {
          const yi = p.data?.[0];
          if (yi !== undefined) c.set({ year: years[yi] });
        }}
        ariaLabel={`Heat grid of ${m.label} by country and year`}
        instanceRef={(i) => (inst.current = i)}
      />
      <p className="mt-1 text-xs text-ink-3">Colour scale spans the full range shown; {countryName(ds, 'SGP')} and other outliers can compress it.</p>
    </ChartCard>
  );
}
