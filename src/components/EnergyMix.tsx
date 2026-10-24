import { useMemo, useRef, useState } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard, { type SourceRef, type TableData } from './ChartCard';
import { countryName } from '../lib/data';
import { useApp } from '../lib/context';
import { fmt } from '../lib/format';
import type { ChartTheme } from '../lib/theme';
import type { Dataset, ElecYear, TesYear } from '../lib/types';

/** Supply groups in fixed categorical order; colour follows the group everywhere. */
export const SUPPLY = [
  { key: 'coal', label: 'Coal', parts: ['coal'] },
  { key: 'oil', label: 'Oil', parts: ['oil'] },
  { key: 'gas', label: 'Natural gas', parts: ['gas'] },
  { key: 'bio', label: 'Bioenergy and waste', parts: ['bioenergy'] },
  { key: 'hydro', label: 'Hydro', parts: ['hydro'] },
  { key: 'geo', label: 'Geothermal', parts: ['geothermal'] },
  { key: 'sw', label: 'Solar and wind', parts: ['solar', 'wind'] },
  { key: 'oth', label: 'Nuclear and other', parts: ['nuclear', 'other'] },
] as const;

export const POWER = [
  { key: 'comb', label: 'Fossil fuels and bioenergy (combustible)', parts: ['combustible'], slot: -1 },
  { key: 'hydro', label: 'Hydro', parts: ['hydro'], slot: 4 },
  { key: 'geo', label: 'Geothermal', parts: ['geothermal'], slot: 5 },
  { key: 'sw', label: 'Solar and wind', parts: ['solar', 'wind'], slot: 6 },
  { key: 'oth', label: 'Nuclear and other', parts: ['nuclear', 'other'], slot: 7 },
] as const;

const supplyColour = (theme: ChartTheme, i: number) => theme.cat8[i];
const powerColour = (theme: ChartTheme, slot: number) => (slot < 0 ? (theme.mode === 'dark' ? '#6b6a64' : '#a9a8a1') : theme.cat8[slot]);

const sumParts = (row: Record<string, number> | undefined, parts: readonly string[]) => (row ? parts.reduce((s, p) => s + (row[p] ?? 0), 0) : 0);

export function latestYear(rec: Record<string, unknown> | undefined): string | undefined {
  const ys = Object.keys(rec ?? {}).sort();
  return ys[ys.length - 1];
}

export function energyRefs(ds: Dataset): SourceRef[] {
  const e = ds.static.energy;
  if (!e) return [];
  return [
    { label: 'Total energy supply and electricity production by source', name: 'UN Statistics Division, Energy Statistics Database', url: e.sourceUrl, code: 'DF_UNDATA_ENERGY' },
    { label: 'Electricity statistics, record view', name: 'UNdata, Energy Statistics Database', url: e.dataUrl },
  ];
}

function Legend({ items }: { items: { label: string; colour: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
      {items.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: s.colour, display: 'inline-block' }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

const tooltip = (theme: ChartTheme) => ({
  backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
  borderColor: theme.grid,
  textStyle: { color: theme.ink, fontFamily: 'Source Sans 3, system-ui, sans-serif' },
  extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;',
});

/** Regional comparison: one 100% bar per member, latest year. */
export function MixBarsCard() {
  const c = useApp();
  const { ds, theme } = c;
  const e = ds.static.energy;
  const [which, setWhich] = useState<'supply' | 'power'>('supply');
  const inst = useRef<echarts.ECharts | null>(null);
  const groups = which === 'supply' ? SUPPLY.map((g, i) => ({ ...g, colour: supplyColour(theme, i) })) : POWER.map((g) => ({ ...g, colour: powerColour(theme, g.slot) }));
  const rows = useMemo(() => {
    if (!e) return [];
    const src = which === 'supply' ? e.tes : e.electricity;
    return ds.meta.countries
      .map((ct) => {
        const y = latestYear(src[ct.iso3]);
        const row = y ? (src[ct.iso3][y] as unknown as Record<string, number>) : undefined;
        return { iso: ct.iso3, year: y, row, vals: groups.map((g) => sumParts(row, g.parts)) };
      })
      .filter((r) => r.row)
      .sort((a, b) => (which === 'supply' ? b.vals[0] + b.vals[1] + b.vals[2] - (a.vals[0] + a.vals[1] + a.vals[2]) : b.vals[0] - a.vals[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e, which, ds]);
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 16, top: 8, bottom: 24 },
      tooltip: {
        ...tooltip(theme),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: any[]) => {
          const r = rows[ps[0].dataIndex];
          const d = document.createElement('div');
          const h = document.createElement('div');
          h.style.fontWeight = '700';
          h.textContent = `${countryName(ds, r.iso, false)}, ${r.year}`;
          d.append(h);
          ps.forEach((p) => {
            if (!p.value) return;
            const line = document.createElement('div');
            line.style.cssText = 'display:flex;gap:8px;align-items:center';
            const k = document.createElement('span');
            k.style.cssText = `width:10px;height:10px;border-radius:2px;background:${p.color};display:inline-block`;
            const v = document.createElement('span');
            v.style.cssText = 'font-weight:700;min-width:44px;text-align:right;font-variant-numeric:tabular-nums';
            v.textContent = `${fmt(p.value, { decimals: 1 })}%`;
            const n = document.createElement('span');
            n.style.color = theme.ink2;
            n.textContent = p.seriesName;
            line.append(k, v, n);
            d.append(line);
          });
          return d;
        },
      },
      xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => countryName(ds, r.iso)), axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 13 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: groups.map((g, gi) => ({
        type: 'bar',
        name: g.label,
        stack: 'mix',
        barWidth: '62%',
        data: rows.map((r) => Math.round(r.vals[gi] * 10) / 10),
        itemStyle: { color: g.colour, borderColor: theme.surface, borderWidth: 1 },
        label: { show: true, color: theme.mode === 'light' && [2, 3, 4].includes(which === 'supply' ? gi : ((g as { slot?: number }).slot ?? -1)) ? '#0b0b0b' : '#ffffff', fontSize: 10, formatter: (p: any) => (p.value >= 9 ? fmt(p.value, { decimals: 0 }) : '') },
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, theme, ds, which],
  );
  if (!e) return null;
  const table: TableData = {
    columns: ['Country', 'Year', ...groups.map((g) => `${g.label} (%)`), which === 'supply' ? 'Total energy supply (PJ)' : 'Gross production (TWh)'],
    rows: rows.map((r) => [
      countryName(ds, r.iso, false),
      r.year ?? '',
      ...r.vals.map((v) => fmt(v, { decimals: 1 })),
      fmt(which === 'supply' ? (r.row as unknown as TesYear).totalPJ : (r.row as unknown as ElecYear).totalTWh, { decimals: 1 }),
    ]),
  };
  return (
    <ChartCard
      title={which === 'supply' ? 'Energy mix: total energy supply by source' : 'Electricity generation by source'}
      subtitle={`Share of ${which === 'supply' ? 'total energy supply' : 'gross electricity production'} (%), latest year available for each member (shown in the table).`}
      sources={energyRefs(ds)}
      table={table}
      fileStem={`energy-mix-${which}`}
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      actions={
        <div className="flex gap-1" role="group" aria-label="Mix">
          {(
            [
              ['supply', 'Energy supply'],
              ['power', 'Electricity'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className="chip" aria-pressed={which === k} onClick={() => setWhich(k)}>
              {l}
            </button>
          ))}
        </div>
      }
    >
      <Legend items={groups.map((g) => ({ label: g.label, colour: g.colour }))} />
      <EChart option={option} height={rows.length * 34 + 40} ariaLabel="Energy mix by member" instanceRef={(i) => (inst.current = i)} onClick={(p) => c.set({ tab: 'countries', country: rows[p.dataIndex].iso })} />
      <p className="mt-1 text-xs text-ink-3">{e.note} Click a bar to open that member's profile.</p>
    </ChartCard>
  );
}

/** Country profile: supply mix over time, latest electricity mix and the coal fleet. */
export function CountryEnergyMix({ iso }: { iso: string }) {
  const { ds, theme } = useApp();
  const e = ds.static.energy;
  const coal = ds.static.coal;
  const areaRef = useRef<echarts.ECharts | null>(null);
  const tes = e?.tes[iso];
  const years = Object.keys(tes ?? {}).sort();
  const elecYear = latestYear(e?.electricity[iso]);
  const elec = elecYear ? e!.electricity[iso][elecYear] : undefined;
  const supplyYear = years[years.length - 1];
  const net = supplyYear ? e?.netElectricityTrade[iso]?.[supplyYear] : undefined;
  const supplyGroups = SUPPLY.map((g, i) => ({ ...g, colour: supplyColour(theme, i) }));
  const powerGroups = POWER.map((g) => ({ ...g, colour: powerColour(theme, g.slot) }));

  const area = useMemo(
    () => ({
      grid: { left: 44, right: 16, top: 12, bottom: 28 },
      tooltip: { ...tooltip(theme), trigger: 'axis', valueFormatter: (v: number) => `${fmt(v, { decimals: 1 })}%` },
      xAxis: { type: 'category', boundaryGap: false, data: years, axisLabel: { color: theme.muted }, axisLine: { lineStyle: { color: theme.axis } } },
      yAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, formatter: '{value}%' } },
      series: supplyGroups.map((g) => ({
        type: 'line',
        name: g.label,
        stack: 'mix',
        symbol: 'none',
        lineStyle: { width: 0 },
        areaStyle: { color: g.colour, opacity: 0.92 },
        itemStyle: { color: g.colour },
        emphasis: { focus: 'series' },
        data: years.map((y) => Math.round(sumParts(tes?.[y] as unknown as Record<string, number>, g.parts) * 10) / 10),
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tes, theme],
  );

  if (!e || !tes || !years.length) return null;
  const latest = tes[supplyYear];
  const top = supplyGroups
    .map((g) => ({ g, v: sumParts(latest as unknown as Record<string, number>, g.parts) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 3);
  const cr = coal?.rows[iso];
  const retireBy2030 = cr ? Object.entries(cr.retirePlanned).filter(([y]) => Number(y) <= 2030).reduce((s, [, v]) => s + v, 0) : 0;
  const table: TableData = {
    columns: ['Year', ...supplyGroups.map((g) => `${g.label} (%)`), 'Total energy supply (PJ)'],
    rows: years.map((y) => [y, ...supplyGroups.map((g) => fmt(sumParts(tes[y] as unknown as Record<string, number>, g.parts), { decimals: 1 })), fmt(tes[y].totalPJ, { decimals: 1 })]),
  };
  return (
    <ChartCard
      title={`Energy mix, ${countryName(ds, iso, false)}`}
      subtitle={`Share of total energy supply by source, ${years[0]} to ${supplyYear}. In ${supplyYear}, ${top.map((t) => `${t.g.label.toLowerCase()} ${fmt(t.v, { decimals: 0 })}%`).join(', ')}; total ${fmt(latest.totalPJ, { decimals: 0 })} PJ.`}
      sources={[...energyRefs(ds), ...(cr && coal ? [{ label: `Coal plant capacity by status, ${coal.release ?? ''}`, name: coal.source, url: coal.sourceUrl }] : [])]}
      table={table}
      fileStem={`energy-mix-${iso}`}
      onPng={() => areaRef.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <Legend items={supplyGroups.map((g) => ({ label: g.label, colour: g.colour }))} />
          <EChart option={area} height={260} ariaLabel={`Energy supply mix over time, ${countryName(ds, iso)}`} instanceRef={(i) => (areaRef.current = i)} />
          {net !== undefined && Math.abs(net) >= 1 && (
            <p className="mt-1 text-xs text-ink-3">
              Net electricity {net < 0 ? 'exports' : 'imports'} in {supplyYear} equalled {fmt(Math.abs(net), { decimals: 1 })}% of total energy supply (not included in the shares).
            </p>
          )}
        </div>
        <div className="space-y-3 lg:col-span-5">
          {elec && (
            <div>
              <p className="text-sm font-semibold text-ink">
                Electricity generation, {elecYear} ({fmt(elec.totalTWh, { decimals: 1 })} TWh)
              </p>
              <div className="mt-2 flex h-6 w-full overflow-hidden rounded" role="img" aria-label={`Electricity generation mix in ${elecYear}`}>
                {powerGroups.map((g) => {
                  const v = sumParts(elec as unknown as Record<string, number>, g.parts);
                  return v > 0 ? <div key={g.key} title={`${g.label}: ${fmt(v, { decimals: 1 })}%`} style={{ width: `${v}%`, background: g.colour, borderRight: `2px solid ${theme.surface}` }} /> : null;
                })}
              </div>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                {powerGroups.map((g) => (
                  <li key={g.key} className="flex items-center gap-1.5 text-ink-2">
                    <span aria-hidden className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: g.colour }} />
                    <span className="tabular font-semibold text-ink">{fmt(sumParts(elec as unknown as Record<string, number>, g.parts), { decimals: 1 })}%</span>
                    {g.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-lg border border-line bg-raised p-3">
            <p className="text-sm font-semibold text-ink">Coal power fleet{coal?.release ? `, ${coal.release}` : ''}</p>
            {cr ? (
              <dl className="tabular mt-1 grid grid-cols-1 gap-y-1 text-sm">
                {[
                  ['Operating', cr.operating],
                  ['Under construction', cr.construction],
                  ['Planned (pre-construction)', cr.preConstruction],
                  ['Planned retirement by 2030', retireBy2030],
                  ['Retired since 2000', cr.retired],
                  ['Cancelled since 2010', cr.cancelled],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between gap-2">
                    <dt className="text-ink-2">{k}</dt>
                    <dd className="font-semibold text-ink">{fmt(v as number, { decimals: 0 })} MW</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-1 text-sm text-ink-2">No coal-fired units of 30 MW or more in the tracker.</p>
            )}
          </div>
        </div>
      </div>
      {e.stale && <p className="mt-1 text-xs text-ink-3">The UNSD service did not respond at the last refresh; figures are from the previous refresh.</p>}
    </ChartCard>
  );
}

export function CoalFleetCard() {
  const { ds, theme } = useApp();
  const coal = ds.static.coal;
  const inst = useRef<echarts.ECharts | null>(null);
  const rows = Object.entries(coal?.rows ?? {})
    .map(([iso, r]) => ({ iso, r, retire: Object.entries(r.retirePlanned).filter(([y]) => Number(y) <= 2030).reduce((s, [, v]) => s + v, 0) }))
    .sort((a, b) => b.r.operating - a.r.operating);
  const series = [
    { name: 'Operating', colour: theme.series[0], get: (x: (typeof rows)[number]) => x.r.operating },
    { name: 'Under construction', colour: theme.series[1], get: (x: (typeof rows)[number]) => x.r.construction },
    { name: 'Planned (pre-construction)', colour: theme.series[2], get: (x: (typeof rows)[number]) => x.r.preConstruction },
    { name: 'Planned retirement by 2030', colour: theme.series[3], get: (x: (typeof rows)[number]) => x.retire },
  ];
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 64, top: 8, bottom: 24 },
      tooltip: { ...tooltip(theme), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${fmt(v, { decimals: 0 })} MW` },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
      yAxis: { type: 'category', inverse: true, data: rows.map((x) => countryName(ds, x.iso)), axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 13 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: series.map((s) => ({
        type: 'bar',
        name: s.name,
        barGap: '15%',
        data: rows.map((x) => s.get(x)),
        itemStyle: { color: s.colour, borderRadius: [0, 3, 3, 0] },
        label: { show: true, position: 'right', fontSize: 10, color: theme.ink2, formatter: (p: any) => (p.value >= 500 ? fmt(p.value / 1000, { decimals: 1 }) + ' GW' : '') },
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coal, theme, ds],
  );
  if (!coal || !rows.length) return null;
  return (
    <ChartCard
      title="Coal power: operating fleet, pipeline and planned retirements"
      subtitle={`Megawatts, ${coal.release ?? 'latest release'}. Pre-construction is announced, pre-permit and permitted capacity.`}
      sources={[{ label: 'Coal plant capacity by status and planned retirements', name: coal.source, url: coal.sourceUrl }]}
      table={{
        columns: ['Country', 'Operating (MW)', 'Construction (MW)', 'Pre-construction (MW)', 'Shelved (MW)', 'Retired since 2000 (MW)', 'Cancelled since 2010 (MW)', 'Planned retirement by 2030 (MW)', 'All planned retirements (MW)'],
        rows: rows.map((x) => [countryName(ds, x.iso, false), x.r.operating, x.r.construction, x.r.preConstruction, x.r.shelved, x.r.retired, x.r.cancelled, x.retire, x.r.retireTotal]),
      }}
      fileStem="coal-fleet"
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <Legend items={series.map((s) => ({ label: s.name, colour: s.colour }))} />
      <EChart option={option} height={rows.length * 56 + 40} ariaLabel="Coal power fleet by member" instanceRef={(i) => (inst.current = i)} />
      <p className="mt-1 text-xs text-ink-3">{coal.note}</p>
    </ChartCard>
  );
}

export function FinanceTotalsCard() {
  const { ds, theme } = useApp();
  const inst = useRef<echarts.ECharts | null>(null);
  const ids = ['climate_fin', 'priv_mob_climate'] as const;
  const years = ds.meta.countries.flatMap((ct) => Object.keys(ds.indicators.climate_fin?.values?.[ct.iso3] ?? {}).map(Number));
  const end = years.length ? Math.max(...years) : 0;
  const sum = (id: string, iso: string) => {
    let s = 0;
    for (let y = end - 4; y <= end; y++) s += ds.indicators[id]?.values?.[iso]?.[y] ?? 0;
    return s;
  };
  const rows = ds.meta.countries
    .map((ct) => ({ iso: ct.iso3, a: sum(ids[0], ct.iso3), b: sum(ids[1], ct.iso3) }))
    .filter((r) => r.a || r.b)
    .sort((x, y) => y.a - x.a);
  const meta = (id: string) => ds.catalogue.find((m) => m.id === id)!;
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 64, top: 8, bottom: 24 },
      tooltip: { ...tooltip(theme), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `US$ ${fmt(v, { decimals: 0 })} million` },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
      yAxis: { type: 'category', inverse: true, data: rows.map((r) => countryName(ds, r.iso)), axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 13 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: [
        { type: 'bar', name: 'Climate-related development finance', data: rows.map((r) => Math.round(r.a)), itemStyle: { color: theme.series[0], borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', fontSize: 10, color: theme.ink2, formatter: (p: any) => fmt(p.value, { decimals: 0 }) } },
        { type: 'bar', name: 'Private climate finance mobilised', data: rows.map((r) => Math.round(r.b)), itemStyle: { color: theme.series[1], borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', fontSize: 10, color: theme.ink2, formatter: (p: any) => fmt(p.value, { decimals: 0 }) } },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ds, theme, end],
  );
  if (!rows.length) return null;
  return (
    <ChartCard
      title="Official climate finance and the private finance it mobilised, five-year totals"
      subtitle={`US$ million, ${end - 4} to ${end}, commitments. Development finance at 2024 prices; mobilised private finance at OECD constant prices.`}
      sources={[meta('climate_fin'), meta('priv_mob_climate')].map((m) => ({ label: m.label, name: m.sourceName, url: m.sourceUrl }))}
      table={{ columns: ['Country', 'Climate-related development finance (US$ m)', 'Private climate finance mobilised (US$ m)'], rows: rows.map((r) => [countryName(ds, r.iso, false), Math.round(r.a), Math.round(r.b)]) }}
      fileStem="climate-finance-five-year"
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <Legend
        items={[
          { label: 'Climate-related development finance', colour: theme.series[0] },
          { label: 'Private climate finance mobilised', colour: theme.series[1] },
        ]}
      />
      <EChart option={option} height={rows.length * 44 + 40} ariaLabel="Climate finance five-year totals" instanceRef={(i) => (inst.current = i)} />
      <p className="mt-1 text-xs text-ink-3">Brunei and Singapore are not eligible recipients. Mobilised amounts withheld for confidentiality are not included, so they are lower bounds.</p>
    </ChartCard>
  );
}
