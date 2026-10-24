import { describe, expect, it } from 'vitest';
import config from '../../config/indicators.json';
import mpi from '../../config/static/mpi.json';
import income from '../../config/static/income.json';
import { aggregate, cagr, change, defaultYear } from './data';
import { generateInsights } from './insights';
import type { CountrySeries, Dataset } from './types';

// Synthetic values for unit tests only. They exercise the rule logic; they are
// not, and must never be presented as, real statistics.
function build(values: Record<string, CountrySeries>, extra: Partial<Dataset['static']> = {}): Dataset {
  return {
    meta: { title: 't', generatedAt: '2026-10-24T00:00:00Z', status: [], checks: [], countries: config.countries, pillars: config.pillars },
    catalogue: config.indicators as Dataset['catalogue'],
    indicators: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { values: v }])),
    static: { mpi: mpi as unknown as Dataset['static']['mpi'], income: income as unknown as Dataset['static']['income'], ...extra },
  };
}

const linear = (from: number, to: number, y0 = 2017, y1 = 2022) =>
  Object.fromEntries(Array.from({ length: y1 - y0 + 1 }, (_, i) => [y0 + i, from + ((to - from) * i) / (y1 - y0)]));

describe('helpers', () => {
  it('computes CAGR', () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(10, 6);
    expect(cagr(0, 10, 2)).toBeUndefined();
  });

  it('measures change over a span', () => {
    const ds = build({ re_share: { PHL: linear(20, 30) } });
    const ch = change(ds, 're_share', 'PHL', 5)!;
    expect(ch.diff).toBeCloseTo(10);
    expect(ch.startYear).toBe(2017);
    expect(ch.endYear).toBe(2022);
  });

  it('weights the regional aggregate by GDP', () => {
    const ds = build({
      fdi: { PHL: { 2022: 2 }, VNM: { 2022: 6 }, THA: { 2022: 4 } },
      aux_gdp: { PHL: { 2022: 300 }, VNM: { 2022: 100 }, THA: { 2022: 100 } },
    });
    expect(aggregate(ds, 'fdi', 2022)!.value).toBeCloseTo((2 * 300 + 6 * 100 + 4 * 100) / 500);
  });

  it('cuts IMF projections from the default year', () => {
    const ds = build({ gg_debt: Object.fromEntries(config.countries.map((c) => [c.iso3, linear(40, 50, 2015, 2031)])) });
    expect(defaultYear(ds, 'gg_debt')).toBe(2025);
  });
});

describe('insight rules', () => {
  it('names renewable leaders and decliners', () => {
    const ds = build({
      re_share: { KHM: linear(40, 55), LAO: linear(45, 52), PHL: linear(25, 27), VNM: linear(25, 20), THA: linear(22, 21) },
    });
    const ins = generateInsights(ds);
    const leaders = ins.find((i) => i.id === 're-leaders')!;
    expect(leaders.countries[0]).toBe('KHM');
    const dec = ins.find((i) => i.id === 're-decliners')!;
    expect(dec.countries).toEqual(expect.arrayContaining(['VNM', 'THA']));
  });

  it('classifies decoupling', () => {
    const ds = build({
      co2_intensity: { PHL: linear(0.5, 0.35), VNM: linear(1, 1.1), THA: linear(0.6, 0.55), IDN: linear(0.7, 0.68) },
      aux_gdp: { PHL: linear(100, 120), VNM: linear(100, 135), THA: linear(100, 110), IDN: linear(100, 125) },
    });
    const d = generateInsights(ds).find((i) => i.id === 'decoupling')!;
    expect(d.body).toContain('Philippines');
    expect(d.title).toMatch(/of 4 members/);
  });

  it('flags the electricity access gap with a time to close it', () => {
    const ds = build({ elec_access: { MMR: linear(65, 80), PHL: linear(92, 95), SGP: linear(100, 100) }, aux_pop: { MMR: { 2022: 54e6 }, PHL: { 2022: 115e6 } } });
    const a = generateInsights(ds).find((i) => i.id === 'access-gap')!;
    expect(a.countries).toEqual(['MMR', 'PHL']);
    expect(a.body).toMatch(/Myanmar stands at 80\.0%/);
  });

  it('reports the graduation of reclassified members from the income table', () => {
    const g = generateInsights(build({})).find((i) => i.id === 'graduation')!;
    expect(g.countries).toEqual(['PHL', 'VNM']);
  });

  it('uses the article for the Philippines and agrees verbs', () => {
    const ds = build({ elec_access: { PHL: linear(90, 95) }, aux_pop: { PHL: { 2022: 115e6 } } });
    const a = generateInsights(ds).find((i) => i.id === 'access-gap')!;
    expect(a.body.startsWith('The Philippines has not yet reached')).toBe(true);
  });

  it('flags coal-heavy members with vulnerable workforces', () => {
    const ds = build({
      coal_elec: { IDN: { 2023: 70 }, PHL: { 2023: 62 }, THA: { 2023: 15 }, MMR: { 2023: 5 } },
      vuln_emp: { IDN: { 2025: 50 }, PHL: { 2025: 34 }, THA: { 2025: 48 }, MMR: { 2025: 63 } },
    });
    const i = generateInsights(ds).find((x) => x.id === 'coal-exposure')!;
    expect(i.countries).toEqual(['IDN', 'PHL']);
    expect(i.kind).toBe('risk');
    expect(i.body).toContain('Indonesia');
  });

  it('flags fossil fuel subsidies of 1% of GDP or more, with the revenue comparison', () => {
    const ds = build({ ffs_gdp: { IDN: { 2023: 2.7 }, MYS: { 2023: 1.4 }, PHL: { 2023: 0.01 } }, gg_rev: { IDN: { 2023: 13.5 } } });
    const i = generateInsights(ds).find((x) => x.id === 'fossil-subsidies')!;
    expect(i.countries).toEqual(['IDN', 'MYS']);
    expect(i.body).toContain('20% of government revenue');
  });

  it('flags members adding more coal than they plan to retire', () => {
    const row = (operating: number, construction: number, pre: number, retire: Record<string, number>) => ({ operating, construction, preConstruction: pre, shelved: 0, cancelled: 0, retired: 0, mothballed: 0, retirePlanned: retire, retireTotal: 0 });
    const coal = { source: 'GEM', release: 'July 2026', sourceUrl: 'x', unit: 'MW', note: '', rows: { IDN: row(60000, 5000, 13000, { 2030: 600 }), MYS: row(13000, 0, 0, { 2029: 1600, 2030: 2100 }) } };
    const i = generateInsights(build({}, { coal })).find((x) => x.id === 'coal-pipeline')!;
    expect(i.countries).toEqual(['IDN']);
    expect(i.body).toContain('5.0 GW under construction');
  });

  it('summarises the energy mix from the supply shares', () => {
    const mk = (coal: number, oil: number, gas: number, hydro: number) => ({ 2023: { coal, oil, gas, bioenergy: 100 - coal - oil - gas - hydro, hydro, geothermal: 0, solar: 0, wind: 0, nuclear: 0, other: 0, totalPJ: 100 } });
    const energy = { source: 'UNSD', sourceUrl: 'x', dataUrl: 'y', note: '', netElectricityTrade: {}, electricity: {}, tes: { IDN: mk(45, 27, 14, 1), VNM: mk(46, 27, 7, 8), PHL: mk(31, 33, 5, 1), THA: mk(17, 36, 27, 0), MYS: mk(21, 28, 46, 3), LAO: mk(50, 8, 0, 30) } };
    const i = generateInsights(build({}, { energy: energy as unknown as Dataset['static']['energy'] })).find((x) => x.id === 'energy-mix')!;
    expect(i.countries).toEqual(['LAO', 'VNM', 'IDN', 'PHL']);
    expect(i.body).toContain('Lao PDR');
  });

  it('writes without em dashes', () => {
    const ds = build({ re_share: { KHM: linear(40, 55), LAO: linear(45, 52), PHL: linear(25, 27), VNM: linear(25, 20) } });
    for (const i of generateInsights(ds)) expect(`${i.title} ${i.body}`).not.toMatch(/\u2014/);
  });
});
