import { useMemo, useRef, useState } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard, { SourceLine, refOf, type SourceRef, type TableData } from './ChartCard';
import PovertyMap, { ProfilePanel, typeColour } from './PovertyMap';
import { countryName, latest } from '../lib/data';
import { useApp } from '../lib/context';
import { fmt } from '../lib/format';
import { ENERGY, IND_LABEL, PROFILE, TYPE_MIN_H, headline, isOld, key, povertyInsights, shareOfPoor, typology, type PovInsight, type PovLevel, type Typology } from '../lib/poverty';
import type { PovTrend } from '../lib/state';
import type { Mpi2026, MpiIndicator } from '../lib/types';

const ttBase = (theme: ReturnType<typeof useApp>['theme']) => ({
  backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
  borderColor: theme.grid,
  textStyle: { color: theme.ink, fontFamily: 'Source Sans 3, system-ui, sans-serif' },
  extraCssText: 'box-shadow:0 4px 16px rgba(0,0,0,0.12);border-radius:8px;max-width:300px;white-space:normal;',
});

function useRefs(m: Mpi2026) {
  const { ds } = useApp();
  return useMemo(() => {
    const national: SourceRef = { label: 'Global MPI 2026, Table 1 (national results)', name: 'OPHI and UNDP, global MPI 2026 country results', url: m.pageUrl };
    const regions: SourceRef = { label: 'Global MPI 2026, Table 5 (sub-national regions)', name: 'OPHI and UNDP, global MPI 2026 disaggregation', url: m.pageUrl };
    const changes: SourceRef = { label: 'Harmonised MPI over time, Table 6.1', name: 'OPHI, global MPI 2026 changes over time', url: m.pageUrl };
    const hdro: SourceRef = { label: 'Global MPI 2026', name: 'UNDP Human Development Report Office', url: m.hdroUrl };
    const ind = (id: string) => {
      const meta = ds.catalogue.find((x) => x.id === id);
      return meta ? [refOf(meta)] : [];
    };
    return { national, regions, changes, hdro, elec: ind('elec_access'), cook: ind('clean_cooking') };
  }, [m, ds]);
}

/* ------------------------------------------------------------------ */

const shortYear = (y: string) => y.replace(/^(\d{4})\/\d{2}(\d{2})$/, '$1/$2');

function Headline({ m }: { m: Mpi2026 }) {
  const { ds } = useApp();
  const h = headline(m);
  const r = useRefs(m);
  const tiles = [
    { label: 'People in multidimensional poverty', value: fmt(h.poor / 1000, { decimals: 1 }), unit: 'million', note: `${h.covered.length} of 11 members, 2024 population` },
    { label: 'Poor and cooking with solid fuels', value: fmt(h.cookingPoor / 1000, { decimals: 1 }), unit: 'million', note: `${fmt((100 * h.cookingPoor) / h.poor, { decimals: 0 })}% of the poor` },
    { label: 'Poor and without electricity', value: fmt(h.electricityPoor / 1000, { decimals: 1 }), unit: 'million', note: `${fmt((100 * h.electricityPoor) / h.poor, { decimals: 0 })}% of the poor` },
    { label: 'ASEAN median MPI', value: fmt(h.medianMpi, { decimals: 3 }), unit: '', note: `Median share poor ${fmt(h.medianH, { decimals: 1 })}%` },
    {
      label: 'Survey years',
      value: `${shortYear(h.oldest.year)} to ${shortYear(h.newest.year)}`,
      unit: '',
      note: `Not covered: ${h.notCovered.map((i) => countryName(ds, i)).join(', ')}`,
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="card flex flex-col gap-1 p-4">
          <span className="text-sm font-semibold text-ink-2">{t.label}</span>
          <span>
            <span className="tabular text-[28px] font-bold leading-none text-ink">{t.value}</span>
            {t.unit && <span className="ml-1 text-sm text-ink-3">{t.unit}</span>}
          </span>
          <span className="text-xs text-ink-3">{t.note}</span>
          <SourceLine className="mt-1" refs={[r.national]} />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function SurveyVsSdg({ m }: { m: Mpi2026 }) {
  const c = useApp();
  const { ds, theme } = c;
  const r = useRefs(m);
  const [which, setWhich] = useState<'cooking' | 'electricity'>('cooking');
  const inst = useRef<echarts.ECharts | null>(null);
  const wdiId = which === 'cooking' ? 'clean_cooking' : 'elec_access';
  const rows = Object.entries(m.national)
    .map(([iso, n]) => {
      const l = ds.indicators[wdiId] ? latest(ds, wdiId, iso) : undefined;
      return { iso, survey: n.raw[which] ?? 0, poor: n.censored[which] ?? 0, year: n.year, wdi: l ? 100 - l.value : null, wdiYear: l?.year };
    })
    .sort((a, b) => b.survey - a.survey);
  const colour = which === 'cooking' ? theme.series[1] : theme.series[0];
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 56, top: 8, bottom: 24 },
      tooltip: {
        ...ttBase(theme),
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (ps: any[]) => {
          const x = rows[ps[0].dataIndex];
          const d = document.createElement('div');
          d.innerHTML = '';
          const lines = [
            [countryName(ds, x.iso, false), ''],
            [`Survey ${x.year}, all people`, `${fmt(x.survey, { decimals: 1 })}%`],
            [`Survey ${x.year}, poor and deprived`, `${fmt(x.poor, { decimals: 1 })}%`],
            [`SDG 7 series ${x.wdiYear ?? ''}`, x.wdi === null ? 'n/a' : `${fmt(x.wdi, { decimals: 1 })}%`],
          ];
          lines.forEach(([a, b], i) => {
            const row = document.createElement('div');
            row.style.cssText = `display:flex;justify-content:space-between;gap:12px;${i === 0 ? 'font-weight:700' : ''}`;
            const s1 = document.createElement('span');
            s1.textContent = a;
            const s2 = document.createElement('span');
            s2.style.fontWeight = '600';
            s2.textContent = b;
            row.append(s1, s2);
            d.append(row);
          });
          return d;
        },
      },
      xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: rows.map((x) => countryName(ds, x.iso)), axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 13 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: [
        {
          type: 'bar',
          name: 'Survey: all people deprived',
          data: rows.map((x) => x.survey),
          barWidth: '58%',
          itemStyle: { color: colour, opacity: 0.35, borderRadius: [0, 4, 4, 0] },
          barGap: '-100%',
          z: 1,
        },
        {
          type: 'bar',
          name: 'Survey: poor and deprived',
          data: rows.map((x) => x.poor),
          barWidth: '58%',
          itemStyle: { color: colour, borderRadius: [0, 4, 4, 0] },
          z: 2,
          label: { show: true, position: 'insideLeft', color: '#ffffff', fontSize: 11, formatter: (p: any) => (p.value >= 8 ? fmt(p.value, { decimals: 0 }) : '') },
        },
        {
          type: 'scatter',
          name: 'SDG 7 series, latest year',
          data: rows.map((x) => x.wdi),
          symbol: 'diamond',
          symbolSize: 13,
          itemStyle: { color: theme.ink, borderColor: theme.surface, borderWidth: 1.5 },
          z: 3,
        },
      ],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows.map((x) => x.iso).join(), which, theme, ds],
  );
  const table: TableData = {
    columns: ['Country', 'Survey', 'All people deprived (%)', 'Poor and deprived (%)', 'SDG 7 year', `Without ${which === 'cooking' ? 'clean cooking' : 'electricity'}, SDG 7 (%)`],
    rows: rows.map((x) => [countryName(ds, x.iso, false), x.year, fmt(x.survey, { decimals: 1 }), fmt(x.poor, { decimals: 1 }), x.wdiYear ?? '', x.wdi === null ? '' : fmt(x.wdi, { decimals: 1 })]),
  };
  return (
    <ChartCard
      title="Energy deprivation in household surveys and in the SDG 7 series"
      subtitle={`Share of people ${which === 'cooking' ? 'cooking with solid fuels' : 'without electricity'}. Bars: MPI survey year. Diamonds: latest year of the modelled SDG 7 series.`}
      sources={[r.national, ...(which === 'cooking' ? r.cook : r.elec)]}
      table={table}
      fileStem={`survey-vs-sdg7-${which}`}
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
      actions={
        <div className="flex gap-1" role="group" aria-label="Energy indicator">
          {(['cooking', 'electricity'] as const).map((w) => (
            <button key={w} className="chip" aria-pressed={which === w} onClick={() => setWhich(w)}>
              {w === 'cooking' ? 'Cooking' : 'Electricity'}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: colour, opacity: 0.35 }} />
          All people deprived (survey)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: colour }} />
          Poor and deprived (survey)
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rotate-45" style={{ background: theme.ink }} />
          SDG 7 series, latest year
        </span>
      </div>
      <EChart option={option} height={rows.length * 38 + 40} ariaLabel="Survey energy deprivation against the SDG 7 series" instanceRef={(i) => (inst.current = i)} />
      <p className="mt-1 text-xs text-ink-3">
        {which === 'cooking'
          ? 'The MPI counts solid fuels (wood, charcoal, dung, crops, shrubs, coal); the SDG 7.1.2 series also counts kerosene and is modelled by WHO.'
          : 'The MPI counts a household as deprived when it has no electricity; the SDG 7.1.1 series is compiled by the World Bank from surveys and utility data.'}{' '}
        Survey years differ from the SDG 7 year, so gaps partly reflect time.
      </p>
    </ChartCard>
  );
}

function ShareOfPoor({ m }: { m: Mpi2026 }) {
  const { ds, theme } = useApp();
  const r = useRefs(m);
  const inst = useRef<echarts.ECharts | null>(null);
  const rows = Object.entries(m.national)
    .map(([iso, n]) => ({ iso, year: n.year, cooking: shareOfPoor(n.censored.cooking, n.headcount) ?? 0, electricity: shareOfPoor(n.censored.electricity, n.headcount) ?? 0, poor: n.poor2024 }))
    .sort((a, b) => b.cooking - a.cooking);
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 48, top: 8, bottom: 24 },
      tooltip: { ...ttBase(theme), trigger: 'axis', axisPointer: { type: 'shadow' }, valueFormatter: (v: number) => `${fmt(v, { decimals: 1 })}% of the poor` },
      xAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, formatter: '{value}%' } },
      yAxis: { type: 'category', inverse: true, data: rows.map((x) => `${countryName(ds, x.iso)}${isOld(x.year) ? ' *' : ''}`), axisTick: { show: false }, axisLabel: { color: theme.ink2, fontSize: 13 }, axisLine: { lineStyle: { color: theme.axis } } },
      series: (['cooking', 'electricity'] as const).map((f) => ({
        type: 'bar',
        name: f === 'cooking' ? 'Cooking with solid fuels' : 'Without electricity',
        data: rows.map((x) => x[f]),
        barGap: '20%',
        itemStyle: { color: f === 'cooking' ? theme.series[1] : theme.series[0], borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: 'right', color: theme.ink2, fontSize: 11, formatter: (p: any) => fmt(p.value, { decimals: 0 }) },
      })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, ds, m],
  );
  return (
    <ChartCard
      title="How many of the poor are energy-deprived"
      subtitle="Share of multidimensionally poor people who are also deprived in each energy indicator (%)"
      sources={[r.national]}
      table={{ columns: ['Country', 'Survey', 'Cooking with solid fuels (% of poor)', 'Without electricity (% of poor)'], rows: rows.map((x) => [countryName(ds, x.iso, false), x.year, fmt(x.cooking, { decimals: 1 }), fmt(x.electricity, { decimals: 1 })]) }}
      fileStem="share-of-poor-energy-deprived"
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <div className="mb-2 flex flex-wrap gap-x-4 text-sm text-ink-2" aria-label="Legend">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: theme.series[1] }} />
          Cooking with solid fuels
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: theme.series[0] }} />
          Without electricity
        </span>
      </div>
      <EChart option={option} height={rows.length * 44 + 40} ariaLabel="Share of the poor who are energy-deprived" instanceRef={(i) => (inst.current = i)} />
      <p className="mt-1 text-xs text-ink-3">* Survey older than 2018.</p>
    </ChartCard>
  );
}

function RegionScatter({ m, ty }: { m: Mpi2026; ty: Typology }) {
  const c = useApp();
  const { ds, theme } = c;
  const r = useRefs(m);
  const inst = useRef<echarts.ECharts | null>(null);
  const maxPoor = Math.max(...m.regions.map((x) => x.poor2024));
  const option = useMemo(
    () => ({
      grid: { left: 56, right: 24, top: 16, bottom: 48 },
      tooltip: {
        ...ttBase(theme),
        trigger: 'item',
        formatter: (p: any) => {
          const g = m.regions[p.data.i];
          const d = document.createElement('div');
          const h = document.createElement('div');
          h.style.fontWeight = '700';
          h.textContent = `${g.name}, ${countryName(ds, g.iso)} (${g.year})`;
          const b = document.createElement('div');
          b.style.color = theme.ink2;
          b.textContent = `Cooking with solid fuels ${fmt(g.raw.cooking, { decimals: 1 })}%; without electricity ${fmt(g.raw.electricity, { decimals: 1 })}%; ${fmt(g.poor2024, { decimals: 0 })} thousand poor; ${ty.types.find((t) => t.id === ty.byKey[key(g)])?.short ?? ''}`;
          d.append(h, b);
          return d;
        },
      },
      xAxis: { type: 'value', name: 'All people cooking with solid fuels (%)', nameLocation: 'middle', nameGap: 30, min: 0, max: 100, nameTextStyle: { color: theme.ink2 }, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
      yAxis: { type: 'value', name: 'Without electricity (%)', nameLocation: 'middle', nameGap: 38, min: 0, max: 100, nameTextStyle: { color: theme.ink2 }, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
      series: ty.types.map((t) => ({
        type: 'scatter',
        name: t.label,
        data: m.regions
          .map((g, i) => ({ g, i }))
          .filter(({ g }) => ty.byKey[key(g)] === t.id)
          .map(({ g, i }) => ({ value: [g.raw.cooking ?? 0, g.raw.electricity ?? 0, g.poor2024], i, k: key(g) })),
        symbolSize: (v: number[]) => 5 + 30 * Math.sqrt(v[2] / maxPoor),
        itemStyle: { color: typeColour(t.id, theme.series, theme.muted), opacity: 0.8, borderColor: theme.surface, borderWidth: 0.8 },
        emphasis: { itemStyle: { borderColor: theme.hover, borderWidth: 2, opacity: 1 } },
      })),
    }),
    [m, ty, theme, ds, maxPoor],
  );
  const table: TableData = {
    columns: ['Region', 'Country', 'Survey', 'Cooking with solid fuels (%)', 'Without electricity (%)', 'Poor people (thousands)', 'Profile type'],
    rows: m.regions.map((g) => [g.name, countryName(ds, g.iso, false), g.year, fmt(g.raw.cooking, { decimals: 1 }), fmt(g.raw.electricity, { decimals: 1 }), fmt(g.poor2024, { decimals: 0 }), ty.byKey[key(g)]]),
  };
  return (
    <ChartCard
      title="133 regions by cooking and electricity deprivation"
      subtitle="Each circle is a survey region, sized by number of poor people and coloured by profile type. Click a circle to open its profile."
      sources={[r.regions]}
      table={table}
      fileStem="regions-energy-deprivation"
      onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}
    >
      <TypeLegend ty={ty} />
      <EChart
        option={option}
        height={420}
        ariaLabel="Scatter of regions by cooking and electricity deprivation"
        instanceRef={(i) => (inst.current = i)}
        onClick={(p) => {
          c.dispatch({ type: 'pov', patch: { sel: p.data.k, level: 'sub' } });
          document.getElementById('pov-profile')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
    </ChartCard>
  );
}

function TypeLegend({ ty }: { ty: Typology }) {
  const { theme } = useApp();
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
      {ty.types.map((t) => (
        <span key={t.id} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: typeColour(t.id, theme.series, theme.muted) }} />
          {t.id === 'R' ? t.label : `${t.id}. ${t.short}`}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function TypologyTable({ m, ty }: { m: Mpi2026; ty: Typology }) {
  const c = useApp();
  const { ds, theme } = c;
  const r = useRefs(m);
  const shade = (v: number) => {
    if (!Number.isFinite(v)) return undefined;
    const i = Math.min(theme.seq.length - 1, Math.floor((v / 100) * theme.seq.length));
    return { background: theme.seq[i], color: i >= 3 ? '#ffffff' : '#0b0b0b' };
  };
  const fwCount = (fwRegions: Record<string, string>, members: string[]) => members.filter((x) => fwRegions[x]).length;
  const fws = ds.static.subregional?.frameworks ?? [];
  const showOnMap = () => {
    c.dispatch({ type: 'pov', patch: { metric: 'type', level: 'sub' } });
    document.getElementById('pov-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const table: TableData = {
    columns: ['Type', 'Description', 'Regions', 'Members', 'Poor people (thousands)', 'Mean share poor (%)', ...PROFILE.map((f) => `${IND_LABEL[f]} (% of poor)`), ...fws.map((f) => `${f.short} regions`)],
    rows: ty.types.map((t) => [
      t.id,
      t.short,
      t.members.length,
      t.countries.join(' '),
      fmt(t.poor, { decimals: 0 }),
      fmt(t.meanH, { decimals: 1 }),
      ...PROFILE.map((f) => (Number.isFinite(t.profile[f]) ? fmt(t.profile[f], { decimals: 0 }) : '')),
      ...fws.map((f) => fwCount(f.regions, t.members)),
    ]),
  };
  return (
    <ChartCard
      title="Deprivation profile types"
      subtitle={`Regions grouped by the level of poverty and by which deprivations the poor share. Cells show the share of the poor deprived in each indicator (%), averaged over the regions in each type.`}
      sources={[r.regions]}
      table={table}
      fileStem="mpi-region-typology"
      actions={
        <button className="btn btn-primary" onClick={showOnMap}>
          Show types on the map
        </button>
      }
    >
      <div className="overflow-auto rounded-lg border border-line">
        <table className="tabular w-full min-w-[860px] text-sm">
          <thead className="bg-raised">
            <tr>
              <th scope="col" className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                Type
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-right font-semibold text-ink">
                Regions
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-right font-semibold text-ink">
                Poor (m)
              </th>
              <th scope="col" className="border-b border-line px-2 py-2 text-right font-semibold text-ink">
                Share poor
              </th>
              {PROFILE.map((f) => (
                <th key={f} scope="col" className={`border-b border-line px-2 py-2 text-right font-semibold ${ENERGY.includes(f) ? 'text-brand' : 'text-ink'}`}>
                  {IND_LABEL[f]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ty.types.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-normal">
                  <span className="flex items-start gap-2">
                    <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: typeColour(t.id, theme.series, theme.muted) }} />
                    <span>
                      <span className="font-semibold text-ink">{t.id === 'R' ? 'Other' : `Type ${t.id}`}</span>
                      <span className="block text-xs text-ink-2">{t.short}</span>
                      <span className="block text-xs text-ink-3">{t.countries.map((i) => countryName(ds, i)).join(', ')}</span>
                    </span>
                  </span>
                </th>
                <td className="px-2 py-2 text-right text-ink-2">{t.members.length}</td>
                <td className="px-2 py-2 text-right text-ink-2">{fmt(t.poor / 1000, { decimals: 1 })}</td>
                <td className="px-2 py-2 text-right text-ink-2">{fmt(t.meanH, { decimals: 1 })}%</td>
                {PROFILE.map((f) => (
                  <td key={f} className="px-2 py-2 text-right" style={shade(t.profile[f])}>
                    {Number.isFinite(t.profile[f]) ? fmt(t.profile[f], { decimals: 0 }) : '–'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Method: k-means with k = {ty.k} on standardised values of the log share of people who are poor and the share of the poor deprived in eight indicators (nutrition and child mortality are left out because three members do
        not survey nutrition). Regions where fewer than {TYPE_MIN_H}% of people are poor form a separate group, as their profiles rest on few observations. The starting centres are chosen deterministically, so the
        grouping is reproducible. Types describe similarity, not cause.
      </p>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */

const TRENDS: { id: PovTrend; label: string; decimals: number; unit: string }[] = [
  { id: 'headcount', label: 'Share of people who are poor (H)', decimals: 1, unit: '%' },
  { id: 'mpi', label: 'MPI value', decimals: 3, unit: '' },
  { id: 'cooking', label: 'Poor and cooking with solid fuels', decimals: 1, unit: '%' },
  { id: 'electricity', label: 'Poor and without electricity', decimals: 1, unit: '%' },
  { id: 'poor', label: 'Number of poor (thousands)', decimals: 0, unit: 'k' },
];

function trendBlock(ch: Mpi2026['changes'][number], id: PovTrend) {
  if (id === 'poor') return { t0: ch.poor0, t1: ch.poor1, abs: null, sig: '' };
  if (id === 'cooking' || id === 'electricity') return ch.censored[id as MpiIndicator];
  return ch[id as 'headcount' | 'mpi'];
}
const mid = (y: string) => {
  const p = String(y).split('/').map((x) => Number(x.length === 2 ? `20${x}` : x));
  return p.length > 1 ? (p[0] + p[p.length - 1]) / 2 : p[0];
};

function SmallTrend({ iso, pairs, id }: { iso: string; pairs: Mpi2026['changes']; id: PovTrend }) {
  const { ds, theme } = useApp();
  const tr = TRENDS.find((t) => t.id === id)!;
  const option = useMemo(() => {
    const all = pairs.flatMap((p) => [trendBlock(p, id).t0 ?? 0, trendBlock(p, id).t1 ?? 0]);
    const yMax = Math.max(...all) * 1.15 || 1;
    return {
      grid: { left: 40, right: 12, top: 14, bottom: 22 },
      tooltip: { ...ttBase(theme), trigger: 'item', formatter: (p: any) => `${p.data.label}: ${fmt(p.data.value[1], { decimals: tr.decimals })}${tr.unit === '%' ? '%' : ''}` },
      xAxis: { type: 'value', min: 2007, max: 2024, interval: 4, splitLine: { show: false }, axisLabel: { color: theme.muted, fontSize: 10, formatter: (v: number) => String(v) }, axisLine: { lineStyle: { color: theme.axis } } },
      yAxis: { type: 'value', min: 0, max: Number(yMax.toPrecision(2)), splitNumber: 2, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted, fontSize: 10 } },
      series: pairs.map((p) => {
        const b = trendBlock(p, id);
        return {
          type: 'line',
          data: [
            { value: [mid(p.year0), b.t0], label: p.year0 },
            { value: [mid(p.year1), b.t1], label: p.year1 },
          ],
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color: theme.series[0], width: 2 },
          itemStyle: { color: theme.series[0], borderColor: theme.surface, borderWidth: 1 },
          endLabel: { show: false },
        };
      }),
    };
  }, [pairs, id, theme, tr]);
  return (
    <div className="rounded-lg border border-line bg-raised p-2">
      <p className="px-1 text-sm font-semibold text-ink">{countryName(ds, iso)}</p>
      <EChart option={option} height={150} ariaLabel={`${tr.label}, ${countryName(ds, iso)}, harmonised`} />
    </div>
  );
}

function Trends({ m }: { m: Mpi2026 }) {
  const c = useApp();
  const { ds } = c;
  const r = useRefs(m);
  const id = c.state.pov.trend;
  const tr = TRENDS.find((t) => t.id === id)!;
  const byIso = useMemo(() => {
    const g: Record<string, Mpi2026['changes']> = {};
    for (const ch of m.changes) (g[ch.iso] ??= []).push(ch);
    return g;
  }, [m]);
  const table: TableData = {
    columns: ['Country', 'From', 'To', `${tr.label}, start`, `${tr.label}, end`, 'Annualised absolute change', 'Significance'],
    rows: m.changes.map((ch) => {
      const b = trendBlock(ch, id);
      return [countryName(ds, ch.iso, false), `${ch.survey0} ${ch.year0}`, `${ch.survey1} ${ch.year1}`, fmt(b.t0, { decimals: tr.decimals }), fmt(b.t1, { decimals: tr.decimals }), b.abs === null ? '' : fmt(b.abs, { decimals: 3 }), b.sig || 'not significant'];
    }),
  };
  return (
    <ChartCard
      title="Change over time: harmonised estimates (OPHI)"
      subtitle="Each line joins two surveys that OPHI has made strictly comparable. Values differ slightly from the 2026 levels above because indicator definitions are aligned within each pair."
      sources={[r.changes]}
      table={table}
      fileStem={`mpi-harmonised-${id}`}
      actions={
        <select className="select w-[15rem] min-w-0" value={id} onChange={(e) => c.dispatch({ type: 'pov', patch: { trend: e.target.value as PovTrend } })} aria-label="Indicator over time">
          {TRENDS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      }
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(byIso).map(([iso, pairs]) => (
          <SmallTrend key={iso} iso={iso} pairs={pairs} id={id} />
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Myanmar has a single survey and no harmonised pair. In the table, *** marks a change significant at 1%, ** at 5% and * at 10%. Separate lines for one country mean the pairs were harmonised separately and are
        not joined.
      </p>
    </ChartCard>
  );
}

/* ------------------------------------------------------------------ */

const LEVELS: { id: PovLevel; title: string; intro: string }[] = [
  { id: 'people', title: 'What it means for people', intro: 'Being poor and energy-deprived, in numbers.' },
  { id: 'action', title: 'What could help, by type of region', intro: 'Options matched to each deprivation profile. These are options to test, not prescriptions.' },
  { id: 'asean', title: 'Working together across ASEAN', intro: 'Where shared profiles and shared borders make a regional approach worthwhile.' },
];

function PovCard({ ins, ty }: { ins: PovInsight; ty: Typology }) {
  const c = useApp();
  const { theme } = c;
  const [open, setOpen] = useState(false);
  const t = ins.type ? ty.types.find((x) => x.id === ins.type) : undefined;
  const show = () => {
    const patch = ins.type ? { metric: 'type' as const, level: 'sub' as const, sel: null } : ins.regions.length ? { level: 'sub' as const, sel: ins.regions[0] } : { level: 'nat' as const, sel: ins.countries[0] ?? null };
    c.dispatch({ type: 'pov', patch });
    document.getElementById('pov-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <article className="card flex flex-col gap-2 p-4">
      {t && (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ background: typeColour(t.id, theme.series, theme.muted) }} />
          Type {t.id}
        </span>
      )}
      <h4 className="text-[16px] font-semibold leading-snug text-ink">{ins.title}</h4>
      <p className="text-[15px] leading-relaxed text-ink-2">{ins.body}</p>
      {open && (
        <dl className="tabular grid grid-cols-1 gap-y-1 rounded-lg border border-line bg-raised p-3 text-sm">
          {ins.evidence.map((e, i) => (
            <div key={i} className="flex flex-wrap justify-between gap-x-3">
              <dt className="text-ink-2">{e.label}</dt>
              <dd className="font-semibold text-ink">{e.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <SourceLine refs={ins.refs} />
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <button className="btn btn-primary" onClick={show}>
          Show on the map
        </button>
        <button className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide numbers' : 'Numbers used'}
        </button>
      </div>
    </article>
  );
}

function PovInsights({ ty }: { ty: Typology }) {
  const { ds } = useApp();
  const list = useMemo(() => povertyInsights(ds), [ds]);
  return (
    <section aria-label="Policy insights on poverty and energy" className="space-y-4">
      <div className="card p-4">
        <h3 className="text-[19px] font-bold text-ink">Policy insights for a just and clean energy transition</h3>
        <p className="mt-1 max-w-3xl text-[15px] text-ink-2">
          Generated by fixed rules from the MPI tables, the SDG 7 series and the profile types above, and rewritten when the data change. They describe patterns and options; they do not establish causes. Open "Numbers
          used" to see every figure behind a statement.
        </p>
      </div>
      {LEVELS.map((lv) => {
        const items = list.filter((i) => i.level === lv.id);
        if (!items.length) return null;
        return (
          <div key={lv.id}>
            <h4 className="text-[17px] font-semibold text-ink">{lv.title}</h4>
            <p className="mb-2 text-sm text-ink-3">{lv.intro}</p>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {items.map((i) => (
                <PovCard key={i.id} ins={i} ty={ty} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ------------------------------------------------------------------ */

export default function PovertyEnergyView() {
  const m = useApp().ds.static.mpi2026;
  if (!m) return <p className="text-ink-2">The poverty tables are not available in this build.</p>;
  return <PovertyEnergy m={m} />;
}

function PovertyEnergy({ m }: { m: Mpi2026 }) {
  const c = useApp();
  const ty = useMemo(() => typology(m), [m]);
  const r = useRefs(m);
  const old = Object.entries(m.national).filter(([, n]) => isOld(n.year));
  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <p className="eyebrow">Multidimensional poverty and energy</p>
        <h2 className="mt-1 text-[22px] font-bold text-ink">Who is left behind in the energy transition, and where</h2>
        <p className="mt-2 max-w-4xl text-[15px] leading-relaxed text-ink-2">
          The global Multidimensional Poverty Index counts people as poor when they are deprived in a third or more of ten weighted indicators of health, education and living standards. Two of those indicators, cooking
          fuel and electricity, are about energy. This page maps poverty across the eight ASEAN members the index covers, down to {m.regions.length} survey regions, shows how energy deprivation overlaps with other
          deprivations, groups regions with similar profiles, and draws out options for national action and ASEAN cooperation.
        </p>
        <p className="mt-2 text-sm text-ink-3">
          Figures come from the latest survey for each member, so years differ.{' '}
          {old.length > 0 && `Surveys for ${old.map(([iso, n]) => `${countryName(c.ds, iso)} (${n.year})`).join(', ')} are older than 2018; read them as a baseline rather than the current situation. `}
          Numbers of poor people apply each survey's headcount to the 2024 population.
        </p>
        <SourceLine className="mt-2" refs={[r.national, r.regions, r.changes, r.hdro]} />
      </div>
      <Headline m={m} />
      <PovertyMap m={m} ty={ty} sources={[c.state.pov.level === 'nat' && c.state.pov.metric !== 'type' ? r.national : r.regions]} />
      <div id="pov-profile">
        <ProfilePanel m={m} ty={ty} sources={[c.state.pov.sel?.includes('|') ? r.regions : r.national]} />
      </div>
      <h3 className="pt-2 text-[19px] font-bold text-ink">Energy deprivation among the poor</h3>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SurveyVsSdg m={m} />
        <ShareOfPoor m={m} />
      </div>
      <RegionScatter m={m} ty={ty} />
      <h3 className="pt-2 text-[19px] font-bold text-ink">Regions with similar profiles</h3>
      <TypologyTable m={m} ty={ty} />
      <h3 className="pt-2 text-[19px] font-bold text-ink">Progress over time</h3>
      <Trends m={m} />
      <PovInsights ty={ty} />
      <div className="card p-4 text-sm text-ink-2">
        <h3 className="text-[16px] font-semibold text-ink">About these data</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{m.citations.national}</li>
          <li>{m.citations.regions}</li>
          <li>{m.citations.changes}</li>
          <li>
            Published by OPHI and UNDP under {m.licence}. Brunei Darussalam, Malaysia and Singapore are not covered by the global MPI. Sub-national regions are those for which each survey is representative, and in
            Thailand and Viet Nam they are larger regions rather than provinces.
          </li>
          <li>Access to electricity and to clean cooking (SDG 7.1.1 and 7.1.2) come from the World Development Indicators and are refreshed automatically each month; the MPI tables are updated when OPHI publishes a new release.</li>
        </ul>
      </div>
    </div>
  );
}
