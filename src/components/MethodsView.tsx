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
  ['Climate finance terms', 'Three-year sums of climate-related development finance, with the shares committed as grants and to the energy sector; members with a grant share below 30% are flagged.'],
  ['Mobilisation', 'Private climate finance mobilised by official interventions per US$100 of climate-related development finance, three-year sums in current US dollars; leaders and members below US$10.'],
  ['Fossil fuel subsidies', 'Members whose explicit fossil fuel subsidies reach 1% of GDP, with the same amount as a share of general government revenue.'],
  ['Coal pipeline', 'Members whose coal capacity under construction and in planning exceeds planned retirements to 2030, where the pipeline is at least 500 MW.'],
  ['Energy mix', 'Fossil share of total energy supply in the latest UNSD year, members where coal supplies 30% or more, and the leaders on hydro, geothermal, solar and wind.'],
  ['Data recency', 'Flags any indicator whose latest observation is more than three years old.'],
  ['Poverty and energy: people', 'Poor people deprived in cooking fuel and electricity, from censored headcounts applied to the 2024 population; housing and sanitation deprivation among the poor in regions where at least a third of the poor lack electricity, against all other regions; gaps of 10 points or more between survey and SDG 7 figures.'],
  ['Poverty and energy: options by type', 'For each profile type, integrated access options where at least 40% of the poor lack electricity, clean-cooking options where at least 70% of the poor lack clean cooking, and the most common other deprivation where it affects at least 40% of the poor.'],
  ['Poverty and energy: ASEAN cooperation', 'Members and sub-regional framework areas holding type A regions; poor people, cooking and electricity deprivation in each framework area; the gap between the share of the poor lacking clean cooking and the programme areas of APAEC 2026-2030; the fastest harmonised falls in cooking and electricity deprivation; surveys older than 2018 and members not covered.'],
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
              {ds.static.mpi2026 && (
                <tr className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">Poverty and energy</td>
                  <td className="px-3 py-2 text-ink">
                    Global MPI 2026 by sub-national region (Table 5) and harmonised changes over time (Table 6.1): headcount, intensity, censored and uncensored headcount ratios for all ten indicators, contributions,
                    number of poor
                    <span className="mt-0.5 block text-xs text-ink-3">
                      {ds.static.mpi2026.citations.regions} {ds.static.mpi2026.citations.changes}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">% of population; index; thousands</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={ds.static.mpi2026.pageUrl} target="_blank" rel="noreferrer">
                      OPHI, global MPI 2026 tables (CC BY 4.0)
                    </a>
                  </td>
                  <td className="px-3 py-2 text-ink-2">Survey years vary</td>
                  <td className="px-3 py-2 text-ink-2">
                    {Object.keys(ds.static.mpi2026.national).length} of 11; {ds.static.mpi2026.regions.length} regions
                  </td>
                </tr>
              )}
              {(ds.static.subregional?.frameworks ?? []).map((f) => (
                <tr key={f.id} className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">Poverty and energy</td>
                  <td className="px-3 py-2 text-ink">
                    {f.name}: member territories
                    <span className="mt-0.5 block text-xs text-ink-3">{f.members}. {f.partialNote}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">Membership</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={f.sourceUrl} target="_blank" rel="noreferrer">
                      {f.sourceName}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-ink-2">Current</td>
                  <td className="px-3 py-2 text-ink-2">{Object.keys(f.regions).length} survey regions</td>
                </tr>
              ))}
              {Object.entries(ds.static.povrefs ?? {}).map(([id, r]) => (
                <tr key={id} className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">Poverty and energy</td>
                  <td className="px-3 py-2 text-ink">
                    Reference: {r.name}
                    {r.facts && <span className="mt-0.5 block text-xs text-ink-3">{r.facts}</span>}
                  </td>
                  <td className="px-3 py-2 text-ink-2">Text</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={r.url} target="_blank" rel="noreferrer">
                      {r.name}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-ink-2">As published</td>
                  <td className="px-3 py-2 text-ink-2">Regional or global</td>
                </tr>
              ))}
              {ds.static.energy && (
                <tr className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">Country profiles; energy transition</td>
                  <td className="px-3 py-2 text-ink">
                    Energy mix: total energy supply and electricity generation by source
                    <span className="mt-0.5 block text-xs text-ink-3">{ds.static.energy.note}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">% of total; PJ; TWh</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={ds.static.energy.sourceUrl} target="_blank" rel="noreferrer">
                      {ds.static.energy.source}
                    </a>
                    <span className="block text-xs text-ink-3">
                      Record view:{' '}
                      <a className="text-brand underline underline-offset-2" href={ds.static.energy.dataUrl} target="_blank" rel="noreferrer">
                        UNdata
                      </a>
                      . IRENA's statistics database asks automated tools not to access it, and IAEA data cover nuclear power, which no member generates; both draw on the same national energy statistics.
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{Math.max(...Object.values(ds.static.energy.tes).flatMap((y) => Object.keys(y).map(Number)))}</td>
                  <td className="px-3 py-2 text-ink-2">{Object.keys(ds.static.energy.tes).length} of 11</td>
                </tr>
              )}
              {ds.static.coal && (
                <tr className="align-top odd:bg-surface even:bg-raised">
                  <td className="px-3 py-2 text-ink-2">{pillarName('workers')}</td>
                  <td className="px-3 py-2 text-ink">
                    Coal power capacity by status and planned retirements
                    <span className="mt-0.5 block text-xs text-ink-3">{ds.static.coal.note}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">MW</td>
                  <td className="px-3 py-2">
                    <a className="text-brand underline underline-offset-2" href={ds.static.coal.sourceUrl} target="_blank" rel="noreferrer">
                      {ds.static.coal.source}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{ds.static.coal.release ?? 'Latest release'}</td>
                  <td className="px-3 py-2 text-ink-2">{Object.keys(ds.static.coal.rows).length} of 11</td>
                </tr>
              )}
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
          <li>
            The boundaries and names shown and the designations used on the maps do not imply official endorsement or acceptance by the United Nations. Base map: Natural Earth. Sub-national regions: geoBoundaries
            gbOpen ADM1 (CC BY 4.0), with Thai and Vietnamese provinces grouped into the survey regions used by each national statistics office.
          </li>
          <li>
            Poverty and energy: numbers of poor people apply each survey's headcount ratio to the 2024 population, as OPHI does. The profile types come from k-means clustering (k = 4, deterministic start) on the log
            headcount and the share of the poor deprived in eight indicators, for regions where at least 1% of people are poor. Over-time charts use only OPHI's harmonised pairs (Table 6.1), never a comparison between
            the 2026 levels and older published figures. The policy text on that tab is generated by fixed rules and names a sub-regional framework only where its member territories are confirmed by an official source.
          </li>
          <li>Source data are published under the licences of their producers. World Bank data are available under CC BY 4.0.</li>
          <li>IMF World Economic Outlook values for the current year onward are projections and are hidden unless switched on.</li>
          <li>The code is open source. Suggested citation: UNDP (2026), ASEAN Green and Just Transition Monitor, United Nations Development Programme.</li>
        </ul>
      </section>
    </div>
  );
}
