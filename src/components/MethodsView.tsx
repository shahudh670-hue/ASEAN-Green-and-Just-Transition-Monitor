import { latest } from '../lib/data';
import { useApp } from '../lib/context';

const RULES = [
  ['Renewable leaders and decliners', 'Percentage-point change in the renewable share of final energy over the latest five years available for each member. A falling share is read alongside the move away from traditional biomass, which the indicator counts as renewable.'],
  ['Pace of decarbonisation', 'Compound annual change in carbon intensity of GDP over five years, by member and for the GDP-weighted ASEAN average.'],
  ['Decoupling', 'Implied emissions growth is (1 + intensity growth) x (1 + real GDP growth) - 1. Absolute decoupling: GDP up, emissions down. Relative: emissions up but slower than GDP.'],
  ['Investment and transition gap', 'Members above the ASEAN median for foreign direct investment or gross capital formation (three-year average) and below the median for renewable-share gains. Singapore is excluded because of its hub role.'],
  ['Concentration of clean-energy finance', 'Five-year sums of SDG 7.a.1 commitments, the share taken by the top two recipients, and a Herfindahl-Hirschman index (0 to 10,000).'],
  ['Electricity access gap', 'Members below 99% access; years to universal access at the average annual gain of the last five years; people without access from population data.'],
  ['Coal exposure', 'Members where coal supplies at least 40% of electricity, flagged as a risk where vulnerable employment is also above the ASEAN median.'],
  ['Social protection gap', 'Members where coal supplies at least 40% of electricity or coal rents are at least 1% of GDP, and fewer than half of people receive any social protection benefit (SDG 1.3.1).'],
  ['Youth and gender', 'Members with an above-median youth NEET rate and a below-median ratio of female to male labour force participation.'],
  ['Planetary pressure', 'The percentage difference between the HDI and the planetary pressures-adjusted HDI, its level and its ten-year change, compared with the ten-year change in the HDI.'],
  ['Energy and poverty', 'Members where at least 10% of people are multidimensionally poor, with the share of poverty explained by living standards (which include electricity and cooking fuel).'],
  ['Fiscal space', 'Members with general government revenue below the ASEAN median and either above-median external debt service or public debt above 60% of GDP. Singapore is excluded (debt matched by assets).'],
  ['Debt structure', 'A rise of more than 3 percentage points in the short-term share, or 5 points in the private non-guaranteed share, of external debt over five years.'],
  ['Financial depth', 'Deep: private credit of at least 100% of GDP or market capitalisation of at least 80%. Shallow: private credit below 50% and market capitalisation below 60% or absent.'],
  ['Graduation', 'Members whose World Bank income group moved up in the latest classification, read with their ODA trend.'],
  ['ODA reliance', 'Members where net ODA is at least 2% of GNI.'],
  ['Data recency', 'Flags any indicator whose latest observation is more than three years old.'],
];

export default function MethodsView() {
  const { ds } = useApp();
  const failures = ds.meta.status.filter((s) => !s.ok);
  const warnings = ds.meta.checks.filter((c) => !c.ok);
  const generated = new Date(ds.meta.generatedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });
  const pillarName = (id?: string) => ds.meta.pillars.find((p) => p.id === id)?.label ?? '';
  const lastYear = (id: string) => Math.max(0, ...ds.meta.countries.map((c) => latest(ds, id, c.iso3)?.year ?? 0)) || 'n/a';
  const coverage = (id: string) => ds.meta.countries.filter((c) => latest(ds, id, c.iso3)).length;

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <h2 className="text-[20px] font-bold text-ink">About this monitor</h2>
        <div className="mt-2 max-w-4xl space-y-3 text-[15px] leading-relaxed text-ink-2">
          <p>
            The monitor brings together official data on the energy transition, human development, multidimensional poverty, fiscal space, external debt,
            domestic capital markets and official development assistance for the eleven ASEAN members, including Timor-Leste, which joined on 26 October 2025.
            It is built to answer one question: where can scarce public and concessional finance unlock the most private and domestic investment in a
            transition that also improves people's lives?
          </p>
          <p>
            Every figure comes from a primary international source through that source's own public interface. Nothing is estimated or filled in by the
            monitor. Where a source has no value for a country and year, the cell is left empty. ASEAN figures are averages weighted by GDP or population (as
            stated on each chart), regional totals, or the median member, computed only over members that report.
          </p>
          <p>
            The data refresh automatically each month. Last refresh: {generated} UTC. Prepared by Mohamed Shahudh, Country Economist, UNDP Philippines.
          </p>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-[17px] font-semibold text-ink">Indicators and sources</h3>
        <div className="mt-3 overflow-auto rounded-lg border border-line">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-raised">
              <tr>
                {['Pillar', 'Indicator', 'Unit', 'Source', 'Latest year', 'Members covered'].map((h) => (
                  <th key={h} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ds.catalogue
                .filter((c) => !c.hidden)
                .map((m) => (
                  <tr key={m.id} className="align-top odd:bg-surface even:bg-raised">
                    <td className="px-3 py-2 text-ink-2">{pillarName(m.pillar)}</td>
                    <td className="px-3 py-2 text-ink">
                      {m.label}
                      {m.caveat && <span className="mt-0.5 block text-xs text-ink-3">{m.caveat}</span>}
                    </td>
                    <td className="px-3 py-2 text-ink-2">{m.unit}</td>
                    <td className="px-3 py-2">
                      <a className="text-brand underline underline-offset-2" href={m.sourceUrl} target="_blank" rel="noreferrer">
                        {m.sourceName}
                      </a>
                      <span className="block text-xs text-ink-3">Code: {m.code}</span>
                    </td>
                    <td className="tabular px-3 py-2 text-ink-2">{ds.indicators[m.id] ? lastYear(m.id) : 'unavailable'}</td>
                    <td className="tabular px-3 py-2 text-ink-2">{coverage(m.id)} of 11</td>
                  </tr>
                ))}
              <tr className="align-top odd:bg-surface even:bg-raised">
                <td className="px-3 py-2 text-ink-2">{pillarName('people')}</td>
                <td className="px-3 py-2 text-ink">Global Multidimensional Poverty Index: MPI, headcount, intensity, severe and vulnerable shares, dimension contributions</td>
                <td className="px-3 py-2 text-ink-2">% of population; index</td>
                <td className="px-3 py-2">
                  <a className="text-brand underline underline-offset-2" href={ds.static.mpi.sourceUrl} target="_blank" rel="noreferrer">
                    UNDP and OPHI, 2026 Global MPI
                  </a>
                  <span className="block text-xs text-ink-3">{ds.static.mpi.note}</span>
                </td>
                <td className="px-3 py-2 text-ink-2">Survey years vary</td>
                <td className="px-3 py-2 text-ink-2">{Object.keys(ds.static.mpi.rows).length} of 11</td>
              </tr>
              {ds.static.irena && (
                <tr className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">{pillarName('workers')}</td>
                  <td className="px-3 py-2 text-ink">
                    Renewable energy jobs (liquid biofuels)
                    <span className="mt-0.5 block text-xs text-ink-3">{ds.static.irena.note}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">Number of jobs</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={ds.static.irena.sourceUrl} target="_blank" rel="noreferrer">
                      IRENA and ILO, Renewable energy and jobs: Annual review 2025
                    </a>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{ds.static.irena.year}</td>
                  <td className="px-3 py-2 text-ink-2">{Object.keys(ds.static.irena.rows).length} of 11</td>
                </tr>
              )}
              <tr className="align-top odd:bg-surface even:bg-raised">
                <td className="px-3 py-2 text-ink-2">{pillarName('prosperity')}</td>
                <td className="px-3 py-2 text-ink">Income group and lending category</td>
                <td className="px-3 py-2 text-ink-2">Classification</td>
                <td className="px-3 py-2">
                  <a className="text-brand underline underline-offset-2" href={ds.static.income.sourceUrl} target="_blank" rel="noreferrer">
                    World Bank country and lending groups
                  </a>
                  <span className="block text-xs text-ink-3">{ds.static.income.source}</span>
                </td>
                <td className="px-3 py-2 text-ink-2">FY2027</td>
                <td className="px-3 py-2 text-ink-2">11 of 11</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-3">
          Not included: bond market depth (no complete open series for all members) and pension fund assets (reported by one member only in the IMF Financial
          Soundness Indicators).
        </p>
      </section>

      <section className="card p-5">
        <h3 className="text-[17px] font-semibold text-ink">How the automated insights are built</h3>
        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-3 text-[15px] lg:grid-cols-2">
          {RULES.map(([k, v]) => (
            <div key={k}>
              <dt className="font-semibold text-ink">{k}</dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="card p-5">
        <h3 className="text-[17px] font-semibold text-ink">Quality checks on the latest refresh</h3>
        <p className="mt-1 text-[15px] text-ink-2">
          {failures.length === 0
            ? 'Every source responded on the latest refresh.'
            : `${failures.length} source request(s) failed on the latest refresh; previous values were kept where available: ${failures.map((f) => f.id).join(', ')}.`}{' '}
          Reference values recorded when the indicator set was designed are compared with each refresh. {warnings.length === 0 ? 'All matched within tolerance.' : `${warnings.length} differed beyond tolerance, usually because a source revised its data:`}
        </p>
        {warnings.length > 0 && (
          <ul className="tabular mt-2 list-disc pl-5 text-sm text-ink-2">
            {warnings.map((w, i) => (
              <li key={i}>
                {w.id}, {w.iso3}, {w.year}: reference {w.value}, now {w.got ?? 'missing'}
              </li>
            ))}
          </ul>
        )}
        {ds.meta.links && (
          <p className="mt-2 text-[15px] text-ink-2">
            Source links: {ds.meta.links.filter((l) => l.ok).length} of {ds.meta.links.length} responded normally on the latest refresh.
            {ds.meta.links.some((l) => !l.ok) && ` Not reachable: ${ds.meta.links.filter((l) => !l.ok).map((l) => l.url).join(', ')}.`}
          </p>
        )}
      </section>

      <section className="card p-5 text-sm text-ink-2">
        <h3 className="text-[17px] font-semibold text-ink">Notes</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>The boundaries and names shown and the designations used on the map do not imply official endorsement or acceptance by the United Nations. Base map: Natural Earth.</li>
          <li>Source data are published under the licences of their producers. World Bank data are available under CC BY 4.0.</li>
          <li>IMF World Economic Outlook values for the current year onward are projections and are hidden unless switched on.</li>
          <li>The code is open source. Suggested citation: UNDP (2026), ASEAN Green and Just Transition Monitor, United Nations Development Programme.</li>
        </ul>
      </section>
    </div>
  );
}
