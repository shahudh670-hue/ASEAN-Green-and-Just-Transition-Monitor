import { describe, expect, it } from 'vitest';
import config from '../../config/indicators.json';
import mpi from '../../config/static/mpi.json';
import income from '../../config/static/income.json';
import mpi2026 from '../../config/static/mpi2026.json';
import subregional from '../../config/static/subregional.json';
import povrefs from '../../config/static/poverty-refs.json';
import { headline, key, povertyInsights, shareOfPoor, typology } from './poverty';
import type { Dataset, Mpi2026 } from './types';

const M = mpi2026 as unknown as Mpi2026;

function build(extra: Dataset['indicators'] = {}): Dataset {
  return {
    meta: { title: 't', generatedAt: '2026-10-24T00:00:00Z', status: [], checks: [], countries: config.countries, pillars: config.pillars },
    catalogue: config.indicators as Dataset['catalogue'],
    indicators: extra,
    static: {
      mpi: mpi as unknown as Dataset['static']['mpi'],
      income: income as unknown as Dataset['static']['income'],
      mpi2026: M,
      subregional: subregional as unknown as Dataset['static']['subregional'],
      povrefs,
    },
  };
}

describe('MPI 2026 tables', () => {
  it('holds the eight covered members and 133 survey regions', () => {
    expect(Object.keys(M.national).sort()).toEqual(['IDN', 'KHM', 'LAO', 'MMR', 'PHL', 'THA', 'TLS', 'VNM']);
    expect(M.regions).toHaveLength(133);
    expect(M.notCovered).toEqual(['BRN', 'MYS', 'SGP']);
  });

  it('matches the published Table 1 values used elsewhere on the site', () => {
    for (const [iso, r] of Object.entries((mpi as { rows: Record<string, { headcount: number; mpi: number }> }).rows)) {
      expect(M.national[iso].headcount).toBeCloseTo(r.headcount, 1);
      expect(M.national[iso].mpi).toBeCloseTo(r.mpi, 3);
    }
  });

  it('adds regional poor to the national total within rounding', () => {
    for (const iso of Object.keys(M.national)) {
      const sum = M.regions.filter((r) => r.iso === iso).reduce((s, r) => s + r.poor2024, 0);
      expect(Math.abs(sum - M.national[iso].poor2024) / M.national[iso].poor2024).toBeLessThan(0.05);
    }
  });

  it('computes the headline totals', () => {
    const h = headline(M);
    expect(h.poor / 1000).toBeCloseTo(42.9, 1);
    expect(h.cookingPoor / 1000).toBeCloseTo(36.7, 1);
    expect(h.electricityPoor / 1000).toBeCloseTo(19.8, 1);
  });

  it('bounds the share of the poor deprived', () => {
    expect(shareOfPoor(5, 10)).toBe(50);
    expect(shareOfPoor(null, 10)).toBeNull();
  });
});

describe('typology', () => {
  it('assigns every region exactly once and is deterministic', () => {
    const a = typology(M);
    const b = typology(M);
    expect(Object.keys(a.byKey)).toHaveLength(133);
    expect(a.byKey).toEqual(b.byKey);
    expect(a.types.reduce((s, t) => s + t.members.length, 0)).toBe(133);
  });

  it('orders types from the highest to the lowest poverty level', () => {
    const t = typology(M).types.filter((x) => x.id !== 'R');
    for (let i = 1; i < t.length; i++) expect(t[i - 1].meanH).toBeGreaterThan(t[i].meanH);
  });

  it('matches every framework region to a survey region', () => {
    const keys = new Set(M.regions.map(key));
    for (const f of subregional.frameworks) for (const k of Object.keys(f.regions)) expect(keys.has(k)).toBe(true);
  });
});

describe('poverty insights', () => {
  const ins = povertyInsights(build());
  it('covers the three levels', () => {
    expect(new Set(ins.map((i) => i.level))).toEqual(new Set(['people', 'action', 'asean']));
  });
  it('cites a source for every insight', () => {
    for (const i of ins) expect(i.refs.length).toBeGreaterThan(0);
  });
  it('writes without em dashes and capitalises the Philippines at sentence starts', () => {
    for (const i of ins) {
      expect(`${i.title} ${i.body}`).not.toMatch(/\u2014/);
      expect(i.body).not.toMatch(/(^|\. )the Philippines/);
    }
  });
});
