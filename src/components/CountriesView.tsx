import { change, countryName, latest, series, visibleIndicators } from '../lib/data';
import { openIndicator, useApp } from '../lib/context';
import { fmt } from '../lib/format';
import { DeltaText, Sparkline } from './KpiStrip';
import { InsightCard } from './Insights';

export default function CountriesView() {
  const c = useApp();
  const { ds, state, theme } = c;
  const iso = state.country;
  const ct = ds.meta.countries.find((x) => x.iso3 === iso) ?? ds.meta.countries[0];
  const inc = ds.static.income.rows[ct.iso3];
  const mpi = ds.static.mpi.rows[ct.iso3];
  const related = c.insights.filter((i) => i.countries.includes(ct.iso3));

  const rank = (id: string, year: number) => {
    const vals = ds.meta.countries
      .map((x) => ({ iso: x.iso3, v: latest(ds, id, x.iso3, year)?.value }))
      .filter((r): r is { iso: string; v: number } => r.v !== undefined && latest(ds, id, r.iso, year)!.year === year);
    vals.sort((a, b) => b.v - a.v);
    const pos = vals.findIndex((v) => v.iso === ct.iso3);
    return pos >= 0 ? `${pos + 1} of ${vals.length}` : '';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Country">
        {ds.meta.countries.map((x) => (
          <button key={x.iso3} role="tab" className="chip" aria-selected={x.iso3 === ct.iso3} onClick={() => c.set({ country: x.iso3 })}>
            {x.short}
          </button>
        ))}
      </div>
      <section className="card grid grid-cols-1 gap-4 p-5 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <p className="eyebrow">Country profile</p>
          <h2 className="text-[26px] font-bold leading-tight text-ink">{ct.name}</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            {ds.static.income.groups[inc?.group] ?? 'Unclassified'}
            {inc?.lending ? `; World Bank lending category: ${inc.lending}` : ''}.
            {inc?.changed && <span className="font-semibold text-brand"> Reclassified up from {ds.static.income.groups[inc.previous ?? '']?.toLowerCase()} in FY2027.</span>}
          </p>
        </div>
        <div className="rounded-lg border border-line bg-raised p-4 lg:col-span-2">
          <p className="eyebrow">Multidimensional poverty (2026 global MPI)</p>
          {mpi ? (
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Poor', `${fmt(mpi.headcount, { decimals: 1 })}%`],
                ['Severely poor', `${fmt(mpi.severe, { decimals: 1 })}%`],
                ['Vulnerable', `${fmt(mpi.vulnerable, { decimals: 1 })}%`],
                ['Living standards share', `${fmt(mpi.living, { decimals: 1 })}%`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div className="text-[22px] font-bold text-ink">{v}</div>
                  <div className="text-sm text-ink-2">{k}</div>
                </div>
              ))}
              <p className="col-span-full text-xs text-ink-3">
                Survey: {mpi.survey === 'D' ? 'Demographic and Health Survey' : 'Multiple Indicator Cluster Survey'}, {mpi.year}. MPI value {fmt(mpi.mpi, { decimals: 3 })}.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-ink-2">Not covered by the global MPI.</p>
          )}
        </div>
      </section>

      {ds.meta.pillars.map((p) => {
        const inds = visibleIndicators(ds, p.id).filter((i) => latest(ds, i.id, ct.iso3));
        if (!inds.length) return null;
        return (
          <section key={p.id} className="card p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[17px] font-semibold text-ink">{p.label}</h3>
              <span className="text-xs text-ink-3">Rank 1 = highest value among members reporting that year. Click a row to open its chart.</span>
            </div>
            <div className="mt-2 divide-y divide-line">
              {inds.map((m) => {
                const l = latest(ds, m.id, ct.iso3)!;
                const ch = change(ds, m.id, ct.iso3, 5);
                const pts = series(ds, m.id, ct.iso3).filter(([y]) => y >= 2000);
                return (
                  <button
                    key={m.id}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 text-left hover:bg-raised sm:grid-cols-[minmax(0,2.2fr)_1fr_1.4fr_auto_auto]"
                    onClick={() => openIndicator(c, m.id, [ct.iso3])}
                    title="Open this indicator on the overview"
                  >
                    <span className="text-[15px] text-ink">
                      {m.label}
                      <span className="block text-xs text-ink-3">{m.unit}</span>
                    </span>
                    <span className="tabular text-right text-[17px] font-semibold text-ink">
                      {fmt(l.value, m)}
                      <span className="ml-1 text-xs font-normal text-ink-3">{l.year}</span>
                    </span>
                    <span className="hidden sm:block">
                      <DeltaText m={m} diff={ch?.diff} suffix={ch ? ` since ${ch.startYear}` : ''} />
                    </span>
                    <span className="hidden text-right text-xs text-ink-3 sm:block">Rank {rank(m.id, l.year)}</span>
                    <span className="hidden sm:block">
                      <Sparkline points={pts} colour={theme.series[0]} width={110} height={28} label={`${m.label} trend for ${countryName(ds, ct.iso3)}`} />
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      {related.length > 0 && (
        <section>
          <h3 className="mb-2 text-[17px] font-semibold text-ink">Insights that mention {ct.short}</h3>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {related.map((i) => (
              <InsightCard key={i.id} ins={i} compact />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
