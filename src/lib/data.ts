import type { AggMethod, Dataset, IndicatorMeta, Iso3, YearSeries } from './types';

export const ASEAN_AGG = 'ASEAN';

/** First year treated as an IMF projection: the year the dataset was generated. */
export function projectionStart(ds: Dataset): number {
  return new Date(ds.meta.generatedAt).getUTCFullYear();
}

export function meta(ds: Dataset, id: string): IndicatorMeta {
  const m = ds.catalogue.find((c) => c.id === id);
  if (!m) throw new Error(`Unknown indicator ${id}`);
  return m;
}

export function visibleIndicators(ds: Dataset, pillar?: string): IndicatorMeta[] {
  return ds.catalogue.filter((c) => !c.hidden && (!pillar || c.pillar === pillar) && ds.indicators[c.id]);
}

export function rawSeries(ds: Dataset, id: string, iso: Iso3): YearSeries {
  return ds.indicators[id]?.values?.[iso] ?? {};
}

/** Series for one country, optionally cut at the projection boundary. */
export function series(ds: Dataset, id: string, iso: Iso3, includeProjections = false): [number, number][] {
  const cut = projectionStart(ds);
  const m = ds.catalogue.find((c) => c.id === id);
  return Object.entries(rawSeries(ds, id, iso))
    .map(([y, v]) => [Number(y), v] as [number, number])
    .filter(([y]) => includeProjections || !m?.projections || y < cut)
    .sort((a, b) => a[0] - b[0]);
}

export function value(ds: Dataset, id: string, iso: Iso3, year: number): number | undefined {
  const v = ds.indicators[id]?.values?.[iso]?.[year];
  return Number.isFinite(v) ? v : undefined;
}

/** Latest observation at or before maxYear (projections excluded unless asked). */
export function latest(ds: Dataset, id: string, iso: Iso3, maxYear = 9999, includeProjections = false) {
  const s = series(ds, id, iso, includeProjections).filter(([y]) => y <= maxYear);
  if (!s.length) return undefined;
  const [year, v] = s[s.length - 1];
  return { year, value: v };
}

export function allYears(ds: Dataset, id: string, includeProjections = false): number[] {
  const set = new Set<number>();
  for (const c of ds.meta.countries) for (const [y] of series(ds, id, c.iso3, includeProjections)) set.add(y);
  return [...set].sort((a, b) => a - b);
}

/** Latest year in which at least `share` of members report (default: half). */
export function defaultYear(ds: Dataset, id: string, share = 0.5): number | undefined {
  const years = allYears(ds, id);
  const need = Math.ceil(ds.meta.countries.length * share);
  for (let i = years.length - 1; i >= 0; i--) {
    const n = ds.meta.countries.filter((c) => value(ds, id, c.iso3, years[i]) !== undefined).length;
    if (n >= need) return years[i];
  }
  return years[years.length - 1];
}

export function median(xs: number[]): number | undefined {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return undefined;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function weightFor(ds: Dataset, method: AggMethod, iso: Iso3, year: number): number | undefined {
  const id = method === 'gdp' ? 'aux_gdp' : 'aux_pop';
  return value(ds, id, iso, year) ?? latest(ds, id, iso, year)?.value;
}

export type AggChoice = 'weighted' | 'median' | 'off';

/** ASEAN aggregate for one year: weighted mean (by GDP or population), sum, or median. */
export function aggregate(ds: Dataset, id: string, year: number, choice: AggChoice = 'weighted') {
  const m = meta(ds, id);
  const pairs = ds.meta.countries
    .map((c) => [c.iso3, value(ds, id, c.iso3, year)] as const)
    .filter((p): p is readonly [string, number] => p[1] !== undefined);
  if (pairs.length < 3) return undefined;
  if (choice === 'median' || m.agg === 'none') return { value: median(pairs.map((p) => p[1]))!, n: pairs.length, method: 'median' as const };
  if (m.agg === 'sum') return { value: pairs.reduce((s, p) => s + p[1], 0), n: pairs.length, method: 'sum' as const };
  let num = 0;
  let den = 0;
  for (const [iso, v] of pairs) {
    const w = weightFor(ds, m.agg ?? 'pop', iso, year);
    if (!w) continue;
    num += v * w;
    den += w;
  }
  if (!den) return undefined;
  return { value: num / den, n: pairs.length, method: m.agg === 'gdp' ? ('GDP-weighted' as const) : ('population-weighted' as const) };
}

export function aggregateSeries(ds: Dataset, id: string, choice: AggChoice, includeProjections = false): [number, number][] {
  if (choice === 'off') return [];
  return allYears(ds, id, includeProjections)
    .map((y) => [y, aggregate(ds, id, y, choice)?.value] as [number, number | undefined])
    .filter((p): p is [number, number] => p[1] !== undefined);
}

/** Compound annual growth rate in per cent between two points. */
export function cagr(start: number, end: number, years: number): number | undefined {
  if (!(start > 0) || !(end > 0) || years <= 0) return undefined;
  return (Math.pow(end / start, 1 / years) - 1) * 100;
}

/** Change between the latest observation and the one `span` years earlier (or the closest available within ±1 year). */
export function change(ds: Dataset, id: string, iso: Iso3, span: number, maxYear = 9999) {
  const end = latest(ds, id, iso, maxYear);
  if (!end) return undefined;
  const target = end.year - span;
  const startYear = [target, target - 1, target + 1].find((y) => value(ds, id, iso, y) !== undefined);
  if (startYear === undefined || startYear >= end.year) return undefined;
  const start = value(ds, id, iso, startYear)!;
  const years = end.year - startYear;
  return { start, end: end.value, startYear, endYear: end.year, years, diff: end.value - start, cagr: cagr(start, end.value, years) };
}

export function countryName(ds: Dataset, iso: Iso3, short = true): string {
  const c = ds.meta.countries.find((x) => x.iso3 === iso);
  return c ? (short ? c.short : c.name) : iso;
}
