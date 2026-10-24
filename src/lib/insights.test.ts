import { describe, expect, it } from 'vitest';
import config from '../../config/indicators.json';
import mpi from '../../config/static/mpi.json';
import income from '../../config/static/income.json';
import { aggregate, cagr, change, defaultYear } from './data';
import { generateInsights } from './insights';
import type { CountrySeries, Dataset } from './types';

// Synthetic values for unit tests only. They exercise the rule logic; they are
// not, and must never be presented as, real statistics.
function build(values: Record<string, CountrySeries>): Dataset {
  return {
    meta: { title: 't', generatedAt: '2026-10-24T00:00:00Z', status: [], checks: [], countries: config.countries, pillars: config.pillars },
    catalogue: config.indicators as Dataset['catalogue'],
    indicators: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { values: v }])),
    static: { mpi: mpi as unknown as Dataset['static']['mpi'], income: income as unknown as Dataset['static']['income'] },
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

  it('writes without em dashes', () => {
    const ds = build({ re_share: { KHM: linear(40, 55), LAO: linear(45, 52), PHL: linear(25, 27), VNM: linear(25, 20) } });
    for (const i of generateInsights(ds)) expect(`${i.title} ${i.body}`).not.toMatch(/\u2014/);
  });
});
