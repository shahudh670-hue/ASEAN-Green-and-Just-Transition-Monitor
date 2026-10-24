import { useMemo, useRef } from 'react';
import EChart, { echarts } from './EChart';
import ChartCard, { refOf, type SourceRef, type TableData } from './ChartCard';
import { meta } from '../lib/data';
import { countryName, latest, projectionStart, value } from '../lib/data';
import { useApp } from '../lib/context';
import { fmt } from '../lib/format';

interface Bars {
  title: string;
  subtitle: string;
  categories: string[]; // iso3
  series: { name: string; colour: string; data: (number | null)[] }[];
  stacked?: boolean;
  unit: string;
  decimals: number;
  max?: number;
  note?: string;
  labels?: (string | null)[];
  sources: SourceRef[];
}

function BarCard(b: Bars) {
  const c = useApp();
  const { theme, ds } = c;
  const inst = useRef<echarts.ECharts | null>(null);
  const option = useMemo(
    () => ({
      grid: { left: 92, right: 64, top: 8, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(11,11,11,0.04)' } },
        backgroundColor: theme.mode === 'dark' ? '#222220' : '#ffffff',
        borderColor: theme.grid,
        textStyle: { color: theme.ink },
        formatter: (ps: any[]) => {
          const d = document.createElement('div');
          const h = document.createElement('div');
          h.style.fontWeight = '700';
          h.textContent = countryName(ds, b.categories[ps[0].dataIndex], false) + (b.labels?.[ps[0].dataIndex] ? ` (${b.labels[ps[0].dataIndex]})` : '');
          d.append(h);
          ps.forEach((p) => {
            const r = document.createElement('div');
            r.style.cssText = 'display:flex;gap:8px;align-items:center';
            const k = document.createElement('span');
            k.style.cssText = `width:10px;height:10px;border-radius:2px;background:${p.color};display:inline-block`;
            const v = document.createElement('span');
            v.style.cssText = 'font-weight:700;min-width:56px;text-align:right;font-variant-numeric:tabular-nums';
            v.textContent = p.value === null || p.value === undefined ? 'n/a' : fmt(p.value, { decimals: b.decimals });
            const n = document.createElement('span');
            n.style.color = theme.ink2;
            n.textContent = p.seriesName;
            r.append(k, v, n);
            d.append(r);
          });
          return d;
        },
      },
      xAxis: { type: 'value', max: b.max, splitLine: { lineStyle: { color: theme.grid } }, axisLabel: { color: theme.muted } },
      yAxis: {
        type: 'category',
        inverse: true,
        data: b.categories.map((i) => countryName(ds, i)),
        axisLabel: { color: theme.ink2, fontSize: 13 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: theme.axis } },
      },
      series: b.series.map((s, si) => ({
        type: 'bar',
        name: s.name,
        stack: b.stacked ? 'a' : undefined,
        barWidth: b.stacked ? '60%' : undefined,
        barGap: '20%',
        data: s.data,
        itemStyle: {
          color: s.colour,
          borderColor: theme.surface,
          borderWidth: b.stacked ? 1 : 0,
          borderRadius: b.stacked ? (si === b.series.length - 1 ? [0, 4, 4, 0] : 0) : [0, 4, 4, 0],
        },
        label:
          !b.stacked
            ? { show: true, position: 'right', color: theme.ink2, fontSize: 11, formatter: (p: any) => (p.value === null ? '' : fmt(p.value, { decimals: b.decimals })) }
            : { show: true, color: si === 3 ? theme.ink : '#ffffff', fontSize: 11, formatter: (p: any) => (p.value >= 12 ? fmt(p.value, { decimals: 0 }) : '') },
      })),
    }),
    [b, theme, ds],
  );
  const table: TableData = {
    columns: ['Country', ...b.series.map((s) => `${s.name} (${b.unit})`)],
    rows: b.categories.map((iso, i) => [countryName(ds, iso, false) + (b.labels?.[i] ? ` (${b.labels[i]})` : ''), ...b.series.map((s) => (s.data[i] === null ? '' : fmt(s.data[i]!, { decimals: b.decimals })))]),
  };
  return (
    <ChartCard title={b.title} subtitle={b.subtitle} sources={b.sources} table={table} fileStem={b.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')} onPng={() => inst.current?.getDataURL({ pixelRatio: 2, backgroundColor: theme.surface })}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Legend">
        {b.series.map((s) => (
          <span key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden style={{ width: 12, height: 12, borderRadius: 3, background: s.colour, display: 'inline-block' }} />
            {s.name}
          </span>
        ))}
      </div>
      <EChart option={option} height={b.categories.length * 34 + 40} ariaLabel={b.title} instanceRef={(i) => (inst.current = i)} onClick={(p) => c.dispatch({ type: 'toggleFocus', iso: b.categories[p.dataIndex] })} />
      {b.note && <p className="mt-1 text-xs text-ink-3">{b.note}</p>}
    </ChartCard>
  );
}

function IncomeTable() {
  const { ds } = useApp();
  const inc = ds.static.income;
  const order = ['HIC', 'UMC', 'LMC', 'LIC'];
  const rows = [...ds.meta.countries].sort((a, b) => order.indexOf(inc.rows[a.iso3]?.group) - order.indexOf(inc.rows[b.iso3]?.group));
  return (
    <section className="card p-4 sm:p-5">
      <h3 className="text-[17px] font-semibold text-ink">Income group and lending category, FY2027</h3>
      <p className="mt-0.5 text-sm text-ink-2">
        Based on 2025 GNI per capita (Atlas method). Thresholds: {Object.entries(inc.thresholds).map(([k, v]) => `${inc.groups[k].toLowerCase()} ${v}`).join('; ')}.
      </p>
      <div className="mt-3 overflow-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-raised">
            <tr>
              {['Country', 'Income group', 'Lending category', 'Change this year'].map((h) => (
                <th key={h} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((ct) => {
              const r = inc.rows[ct.iso3];
              return (
                <tr key={ct.iso3} className="odd:bg-surface even:bg-raised">
                  <td className="px-3 py-1.5 text-ink">{ct.name}</td>
                  <td className="px-3 py-1.5 text-ink-2">{inc.groups[r?.group] ?? 'n/a'}</td>
                  <td className="px-3 py-1.5 text-ink-2">{r?.lending ?? 'Not applicable'}</td>
                  <td className="px-3 py-1.5">
                    {r?.changed ? (
                      <span className="font-semibold text-brand">▲ Up from {inc.groups[r.previous ?? '']?.toLowerCase()}</span>
                    ) : (
                      <span className="text-ink-3">No change</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">
        Source:{' '}
        <a className="text-brand underline underline-offset-2" href={inc.sourceUrl} target="_blank" rel="noreferrer">
          World Bank country and lending groups
        </a>
        .
      </p>
    </section>
  );
}

function MpiCards() {
  const c = useApp();
  const { ds, theme } = c;
  const mpi = ds.static.mpi;
  const isos = Object.keys(mpi.rows).sort((a, b) => mpi.rows[b].headcount - mpi.rows[a].headcount);
  const labels = isos.map((i) => mpi.rows[i].year);
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <BarCard
        title="Multidimensional poverty: who is poor"
        subtitle="Share of people who are multidimensionally poor, and those in severe poverty (% of population), 2026 global MPI. Survey year in brackets in the tooltip and table."
        categories={isos}
        labels={labels}
        unit="% of population"
        decimals={1}
        series={[
          { name: 'Multidimensionally poor', colour: theme.series[0], data: isos.map((i) => mpi.rows[i].headcount) },
          { name: 'In severe poverty', colour: theme.series[1], data: isos.map((i) => mpi.rows[i].severe) },
        ]}
        sources={[{ label: '2026 global MPI, Table 1', name: 'UNDP and OPHI, 2026 Global Multidimensional Poverty Index', url: mpi.sourceUrl }]}
        note={`Not covered: ${mpi.notCovered.map((i) => countryName(ds, i)).join(', ')}. Survey years range from ${[...labels].sort()[0]} to ${[...labels].sort().slice(-1)[0]}.`}
      />
      <BarCard
        title="Multidimensional poverty: what drives it"
        subtitle="Contribution of each dimension to overall multidimensional poverty (%). Living standards include electricity and clean cooking fuel."
        categories={isos}
        labels={labels}
        unit="% contribution"
        decimals={1}
        stacked
        max={100}
        series={[
          { name: 'Health', colour: theme.series[0], data: isos.map((i) => mpi.rows[i].health) },
          { name: 'Education', colour: theme.series[1], data: isos.map((i) => mpi.rows[i].education) },
          { name: 'Living standards', colour: theme.series[2], data: isos.map((i) => mpi.rows[i].living) },
        ]}
        sources={[{ label: '2026 global MPI, Table 1', name: 'UNDP and OPHI, 2026 Global Multidimensional Poverty Index', url: mpi.sourceUrl }]}
      />
    </div>
  );
}

export default function PillarDetail() {
  const c = useApp();
  const { ds, theme, state } = c;
  const isos = ds.meta.countries.map((ct) => ct.iso3);
  const lastActual = projectionStart(ds) - 1;

  if (state.pillar === 'people') return <MpiCards />;
  if (state.pillar === 'prosperity') return <IncomeTable />;

  if (state.pillar === 'transition') {
    const ys = isos.flatMap((i) => Object.keys(ds.indicators.sdg7a1?.values?.[i] ?? {}).map(Number));
    if (!ys.length) return null;
    const end = Math.max(...ys);
    const sum = (iso: string, a: number, b: number) => {
      let s = 0;
      for (let y = a; y <= b; y++) s += value(ds, 'sdg7a1', iso, y) ?? 0;
      return s;
    };
    const rows = isos.map((i) => ({ i, now: sum(i, end - 4, end), prev: sum(i, end - 9, end - 5) })).filter((r) => r.now || r.prev).sort((a, b) => b.now - a.now);
    return (
      <BarCard
        title="International public finance for clean energy, five-year totals"
        subtitle={`US$ million at constant prices, commitments. ${end - 4} to ${end} compared with ${end - 9} to ${end - 5}. Summing over five years smooths single large projects.`}
        categories={rows.map((r) => r.i)}
        unit="US$ million"
        decimals={0}
        series={[
          { name: `${end - 4} to ${end}`, colour: theme.series[0], data: rows.map((r) => r.now) },
          { name: `${end - 9} to ${end - 5}`, colour: theme.series[1], data: rows.map((r) => r.prev) },
        ]}
        sources={[refOf(meta(ds, 'sdg7a1'))]}
      />
    );
  }

  if (state.pillar === 'fiscal') {
    const rows = isos
      .map((i) => ({ i, rev: latest(ds, 'gg_rev', i, lastActual), exp: latest(ds, 'gg_exp', i, lastActual) }))
      .filter((r) => r.rev || r.exp)
      .sort((a, b) => (b.rev?.value ?? 0) - (a.rev?.value ?? 0));
    return (
      <BarCard
        title="Size of the public budget: revenue and spending"
        subtitle={`General government revenue and expenditure, % of GDP, latest year up to ${lastActual} (IMF estimates for the most recent year). The gap is the fiscal balance.`}
        categories={rows.map((r) => r.i)}
        labels={rows.map((r) => String(r.rev?.year ?? r.exp?.year ?? ''))}
        unit="% of GDP"
        decimals={1}
        series={[
          { name: 'Revenue', colour: theme.series[0], data: rows.map((r) => r.rev?.value ?? null) },
          { name: 'Expenditure', colour: theme.series[1], data: rows.map((r) => r.exp?.value ?? null) },
        ]}
        sources={[refOf(meta(ds, 'gg_rev')), refOf(meta(ds, 'gg_exp'))]}
      />
    );
  }

  if (state.pillar === 'debt') {
    const rows = isos
      .map((i) => {
        const l = latest(ds, 'ext_ppg_share', i);
        if (!l) return null;
        const y = l.year;
        const ppg = l.value;
        const png = value(ds, 'ext_png_share', i, y) ?? 0;
        const st = value(ds, 'ext_st_share', i, y) ?? 0;
        return { i, y, ppg, png, st, other: Math.max(0, 100 - ppg - png - st) };
      })
      // Components should sum to at most 100; anything else signals a source revision mid-update, so the row is left out.
      .filter((r): r is NonNullable<typeof r> => Boolean(r) && r!.ppg + r!.png + r!.st <= 101)
      .sort((a, b) => b.ppg - a.ppg);
    return (
      <BarCard
        title="Who owes the external debt"
        subtitle="Composition of total external debt stocks by borrower and maturity, % of total, latest year. Brunei, Malaysia and Singapore do not report."
        categories={rows.map((r) => r.i)}
        labels={rows.map((r) => String(r.y))}
        unit="% of total external debt"
        decimals={1}
        stacked
        max={100}
        series={[
          { name: 'Public and publicly guaranteed, long-term', colour: theme.series[0], data: rows.map((r) => r.ppg) },
          { name: 'Private non-guaranteed, long-term', colour: theme.series[1], data: rows.map((r) => r.png) },
          { name: 'Short-term', colour: theme.series[2], data: rows.map((r) => r.st) },
          { name: 'IMF credit and other', colour: theme.mode === 'dark' ? '#6b6a64' : '#a9a8a1', data: rows.map((r) => r.other) },
        ]}
        sources={[refOf(meta(ds, 'ext_ppg_share')), refOf(meta(ds, 'ext_png_share')), refOf(meta(ds, 'ext_st_share')), refOf(meta(ds, 'aux_ext_total'))]}
        note="Shares derived from external debt stocks in current US$."
      />
    );
  }

  if (state.pillar === 'finance') {
    const rows = isos
      .map((i) => {
        const t = latest(ds, 'priv_credit', i);
        if (!t) return null;
        const bank = value(ds, 'bank_credit', i, t.year);
        return { i, y: t.year, bank: bank ?? null, nonbank: bank !== undefined ? Math.max(0, t.value - bank) : null, total: t.value };
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r))
      .sort((a, b) => b.total - a.total);
    return (
      <BarCard
        title="Depth of domestic credit: banks and other lenders"
        subtitle="Domestic credit to the private sector, % of GDP, latest year, split into credit from banks and from other financial institutions."
        categories={rows.map((r) => r.i)}
        labels={rows.map((r) => String(r.y))}
        unit="% of GDP"
        decimals={1}
        stacked
        series={[
          { name: 'From banks', colour: theme.series[0], data: rows.map((r) => r.bank) },
          { name: 'From other financial institutions', colour: theme.series[1], data: rows.map((r) => r.nonbank) },
        ]}
        sources={[refOf(meta(ds, 'priv_credit')), refOf(meta(ds, 'bank_credit'))]}
        note="Non-bank credit is total private credit minus bank credit."
      />
    );
  }

  if (state.pillar === 'oda') {
    const rows = isos
      .map((i) => ({ i, l: latest(ds, 'aux_oda_usd', i) }))
      .filter((r) => r.l)
      .sort((a, b) => b.l!.value - a.l!.value);
    return (
      <BarCard
        title="Net ODA received, latest year"
        subtitle="US$ million, current prices. Negative values mean repayments exceeded new disbursements."
        categories={rows.map((r) => r.i)}
        labels={rows.map((r) => String(r.l!.year))}
        unit="US$ million"
        decimals={0}
        series={[{ name: 'Net ODA received', colour: theme.series[0], data: rows.map((r) => r.l!.value / 1e6) }]}
        sources={[refOf(meta(ds, 'aux_oda_usd'))]}
      />
    );
  }
  return null;
}
