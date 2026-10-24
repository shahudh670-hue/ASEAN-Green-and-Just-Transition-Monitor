/**
 * Poverty and energy: helpers, the deprivation-profile typology and the
 * generated policy insights for the "Poverty and energy" tab.
 *
 * Everything here is a deterministic function of the published 2026 global MPI
 * tables (OPHI and UNDP) and the World Development Indicators already in the
 * dataset, so the text is rewritten automatically when either is refreshed.
 */
import { countryName, latest } from './data';
import { fmt, listJoin } from './format';
import type { Dataset, Framework, Iso3, Mpi2026, MpiIndicator, MpiRegion } from './types';

export const IND_LABEL: Record<MpiIndicator, string> = {
  nutrition: 'Nutrition',
  child_mortality: 'Child mortality',
  schooling: 'Years of schooling',
  attendance: 'School attendance',
  cooking: 'Cooking fuel',
  sanitation: 'Sanitation',
  water: 'Drinking water',
  electricity: 'Electricity',
  housing: 'Housing',
  assets: 'Assets',
};

/** Indicators used to describe a region's deprivation profile (all ten are surveyed in every covered member except nutrition). */
export const PROFILE: MpiIndicator[] = ['cooking', 'electricity', 'housing', 'sanitation', 'water', 'assets', 'schooling', 'attendance'];
export const ENERGY: MpiIndicator[] = ['cooking', 'electricity'];
/** Surveys older than this are flagged. */
export const OLD_SURVEY = 2018;

export const key = (r: Pick<MpiRegion, 'iso' | 'name'>) => `${r.iso}|${r.name}`;
export const surveyEnd = (y: string) => Number(String(y).split('/').pop()!.slice(-4).padStart(4, '20'));
export const isOld = (y: string) => surveyEnd(y) < OLD_SURVEY;
/** Share of the poor who are deprived in an indicator (censored headcount over H), in %. */
export const shareOfPoor = (censored: number | null | undefined, headcount: number) =>
  censored === null || censored === undefined || !headcount ? null : Math.min(100, (100 * censored) / headcount);
export const surveyName = (s: string) => (s === 'DHS' ? 'Demographic and Health Survey' : s === 'MICS' ? 'Multiple Indicator Cluster Survey' : s);
const inText = (ds: Dataset, iso: Iso3) => (iso === 'PHL' ? 'the Philippines' : countryName(ds, iso));
const tidy = (t: string) => t.replace(/(^|[.;:]\s+|\(\s*)the Philippines/g, (_m, p) => `${p}The Philippines`);
const millions = (thousands: number) => `${fmt(thousands / 1000, { decimals: thousands >= 10_000 ? 1 : 2 })} million`;

export function mpiData(ds: Dataset): Mpi2026 | undefined {
  return ds.static.mpi2026;
}

/* ------------------------------------------------------------------ */
/* Headline figures                                                     */
/* ------------------------------------------------------------------ */

export interface Headline {
  poor: number; // thousands, 2024 population
  cookingPoor: number;
  electricityPoor: number;
  covered: Iso3[];
  notCovered: Iso3[];
  years: string[];
  oldest: { iso: Iso3; year: string };
  newest: { iso: Iso3; year: string };
  medianMpi: number;
  medianH: number;
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function headline(m: Mpi2026): Headline {
  const rows = Object.entries(m.national);
  const sum = (f: (r: (typeof rows)[number][1]) => number) => rows.reduce((s, [, r]) => s + f(r), 0);
  const byAge = [...rows].sort((a, b) => surveyEnd(a[1].year) - surveyEnd(b[1].year));
  return {
    poor: sum((r) => r.poor2024),
    cookingPoor: sum((r) => ((r.censored.cooking ?? 0) * r.pop2024) / 100),
    electricityPoor: sum((r) => ((r.censored.electricity ?? 0) * r.pop2024) / 100),
    covered: rows.map(([i]) => i),
    notCovered: m.notCovered,
    years: rows.map(([, r]) => r.year),
    oldest: { iso: byAge[0][0], year: byAge[0][1].year },
    newest: { iso: byAge[byAge.length - 1][0], year: byAge[byAge.length - 1][1].year },
    medianMpi: med(rows.map(([, r]) => r.mpi)),
    medianH: med(rows.map(([, r]) => r.headcount)),
  };
}

/** Thousands of poor people deprived in an indicator, nationally (2024 population basis). */
export const poorDeprived = (m: Mpi2026, iso: Iso3, ind: MpiIndicator) => {
  const r = m.national[iso];
  return r ? ((r.censored[ind] ?? 0) * r.pop2024) / 100 : 0;
};
export const regionPoorDeprived = (r: MpiRegion, ind: MpiIndicator) => ((r.censored[ind] ?? 0) * r.pop2024) / 100;

/* ------------------------------------------------------------------ */
/* Typology: k-means on poverty level and the profile of deprivations   */
/* ------------------------------------------------------------------ */

export const TYPE_K = 4;
export const TYPE_MIN_H = 1; // regions with fewer than 1% poor are grouped separately: their profiles rest on few observations

export interface RegionType {
  id: string; // A, B, C, D or R
  label: string;
  short: string;
  members: string[]; // region keys
  countries: Iso3[];
  poor: number; // thousands
  meanH: number; // geometric mean headcount, %
  profile: Record<MpiIndicator, number>; // mean share of the poor deprived, %
  z: Record<MpiIndicator, number>;
  energyPoor: { cooking: number; electricity: number }; // thousands
}

export interface Typology {
  types: RegionType[];
  byKey: Record<string, string>;
  features: string[];
  k: number;
}

const DISTINCT: Partial<Record<MpiIndicator, string>> = {
  housing: 'poor housing',
  sanitation: 'sanitation gaps',
  water: 'unsafe water',
  assets: 'few assets',
  schooling: 'schooling gaps',
  attendance: 'children out of school',
};

/** The most common deprivation among the poor other than the two energy indicators. */
export const topOther = (t: Pick<RegionType, 'profile'>) => (Object.keys(DISTINCT) as MpiIndicator[]).sort((a, b) => t.profile[b] - t.profile[a])[0];

function levelWord(h: number) {
  if (h >= 25) return 'High poverty';
  if (h >= 10) return 'Moderate poverty';
  if (h >= 3) return 'Low poverty';
  return 'Residual poverty';
}

export function typology(m: Mpi2026, k = TYPE_K): Typology {
  const R = m.regions.filter((r) => r.headcount >= TYPE_MIN_H);
  const raw = R.map((r) => [Math.log(r.headcount), ...PROFILE.map((f) => shareOfPoor(r.censored[f], r.headcount) ?? 0)]);
  const n = raw[0].length;
  const mu = Array.from({ length: n }, (_, t) => raw.reduce((s, x) => s + x[t], 0) / raw.length);
  const sd = Array.from({ length: n }, (_, t) => Math.sqrt(raw.reduce((s, x) => s + (x[t] - mu[t]) ** 2, 0) / raw.length) || 1);
  const Z = raw.map((x) => x.map((v, t) => (v - mu[t]) / sd[t]));
  const d2 = (a: number[], b: number[]) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);

  // Deterministic farthest-point start: the region with most poor people, then
  // repeatedly the region farthest from every centre chosen so far.
  let start = 0;
  R.forEach((r, i) => (r.poor2024 > R[start].poor2024 ? (start = i) : null));
  const centres = [Z[start]];
  while (centres.length < k) {
    let best = 0;
    let bestD = -1;
    Z.forEach((z, i) => {
      const dd = Math.min(...centres.map((c) => d2(z, c)));
      if (dd > bestD) [best, bestD] = [i, dd];
    });
    centres.push(Z[best]);
  }
  let lab = Z.map(() => 0);
  for (let it = 0; it < 200; it++) {
    const next = Z.map((z) => centres.reduce((bi, c, j) => (d2(z, c) < d2(z, centres[bi]) ? j : bi), 0));
    const same = next.every((v, i) => v === lab[i]);
    lab = next;
    for (let j = 0; j < k; j++) {
      const mem = Z.filter((_, i) => lab[i] === j);
      if (mem.length) centres[j] = Array.from({ length: n }, (_, t) => mem.reduce((s, z) => s + z[t], 0) / mem.length);
    }
    if (same && it > 0) break;
  }

  const build = (idx: number[], id: string): RegionType => {
    const regs = idx.map((i) => R[i]);
    const meanH = Math.exp(idx.reduce((s, i) => s + raw[i][0], 0) / idx.length);
    const profile = Object.fromEntries(PROFILE.map((f, t) => [f, idx.reduce((s, i) => s + raw[i][t + 1], 0) / idx.length])) as RegionType['profile'];
    const z = Object.fromEntries(PROFILE.map((f, t) => [f, (profile[f] - mu[t + 1]) / sd[t + 1]])) as RegionType['z'];
    return {
      id,
      label: '',
      short: '',
      members: regs.map(key),
      countries: [...new Set(regs.map((r) => r.iso))],
      poor: regs.reduce((s, r) => s + r.poor2024, 0),
      meanH,
      profile,
      z,
      energyPoor: { cooking: regs.reduce((s, r) => s + regionPoorDeprived(r, 'cooking'), 0), electricity: regs.reduce((s, r) => s + regionPoorDeprived(r, 'electricity'), 0) },
    };
  };

  const groups = Array.from({ length: k }, (_, j) => lab.map((l, i) => (l === j ? i : -1)).filter((i) => i >= 0)).filter((g) => g.length);
  const types = groups.map((g) => build(g, '')).sort((a, b) => b.meanH - a.meanH);
  types.forEach((t, i) => {
    t.id = String.fromCharCode(65 + i);
    const words: string[] = [];
    if (t.profile.electricity >= 40) words.push('off-grid');
    if (t.profile.cooking >= 70) words.push('solid-fuel cooking');
    words.push(DISTINCT[topOther(t)]!);
    t.short = `${levelWord(t.meanH)}: ${words.join(', ')}`;
    t.label = `Type ${t.id}. ${t.short}`;
  });

  const residual = m.regions.filter((r) => r.headcount < TYPE_MIN_H);
  const byKey: Record<string, string> = {};
  types.forEach((t) => t.members.forEach((mk) => (byKey[mk] = t.id)));
  if (residual.length) {
    const prof = Object.fromEntries(PROFILE.map((f) => [f, NaN])) as RegionType['profile'];
    types.push({
      id: 'R',
      label: `Very low incidence (under ${TYPE_MIN_H}% poor)`,
      short: `Under ${TYPE_MIN_H}% poor`,
      members: residual.map(key),
      countries: [...new Set(residual.map((r) => r.iso))],
      poor: residual.reduce((s, r) => s + r.poor2024, 0),
      meanH: Math.exp(residual.reduce((s, r) => s + Math.log(Math.max(r.headcount, 0.01)), 0) / residual.length),
      profile: prof,
      z: prof,
      energyPoor: {
        cooking: residual.reduce((s, r) => s + regionPoorDeprived(r, 'cooking'), 0),
        electricity: residual.reduce((s, r) => s + regionPoorDeprived(r, 'electricity'), 0),
      },
    });
    residual.forEach((r) => (byKey[key(r)] = 'R'));
  }
  return { types, byKey, features: ['log headcount', ...PROFILE.map((f) => `share of poor deprived in ${IND_LABEL[f].toLowerCase()}`)], k };
}

/* ------------------------------------------------------------------ */
/* Sub-regional frameworks                                              */
/* ------------------------------------------------------------------ */

export function frameworksOf(ds: Dataset, regionKey: string): { fw: Framework; extent: 'full' | 'partial' }[] {
  return (ds.static.subregional?.frameworks ?? []).filter((f) => f.regions[regionKey]).map((fw) => ({ fw, extent: fw.regions[regionKey] }));
}

/* ------------------------------------------------------------------ */
/* Generated insights                                                   */
/* ------------------------------------------------------------------ */

export type PovLevel = 'people' | 'action' | 'asean';

export interface PovInsight {
  id: string;
  level: PovLevel;
  title: string;
  body: string;
  evidence: { label: string; value: string }[];
  refs: { label: string; name: string; url: string; code?: string }[];
  regions: string[];
  countries: Iso3[];
  type?: string;
}

const pct = (v: number, d = 0) => `${fmt(v, { decimals: d })}%`;

export function povertyInsights(ds: Dataset): PovInsight[] {
  const m = mpiData(ds);
  if (!m) return [];
  const h = headline(m);
  const ty = typology(m);
  const refs = ds.static.povrefs ?? {};
  const regionsRef = { label: '2026 global MPI by sub-national region, Table 5', name: 'OPHI and UNDP, 2026 global MPI disaggregation tables', url: m.pageUrl };
  const nationalRef = { label: '2026 global MPI, Table 1', name: 'OPHI and UNDP, 2026 global MPI country results', url: m.pageUrl };
  const changesRef = { label: 'Harmonised MPI over time, Table 6.1', name: 'OPHI, global MPI changes over time 2026', url: m.pageUrl };
  const ref = (id: string, label: string) => (refs[id] ? [{ label, name: refs[id].name, url: refs[id].url }] : []);
  const regionByKey = Object.fromEntries(m.regions.map((r) => [key(r), r]));
  const out: PovInsight[] = [];
  const nat = m.national;
  const covered = h.covered;

  /* ---- What it means for people ---- */
  const cookShare = (100 * h.cookingPoor) / h.poor;
  const over90 = covered.filter((i) => (shareOfPoor(nat[i].censored.cooking, nat[i].headcount) ?? 0) >= 90);
  out.push({
    id: 'pov-cooking',
    level: 'people',
    title: `${pct(cookShare)} of poor people cook with solid fuels`,
    body: tidy(
      `Of the ${millions(h.poor)} people living in multidimensional poverty in the ${covered.length} members covered, about ${millions(h.cookingPoor)} live in households that cook with solid fuels such as wood, charcoal, dung, crop residue or coal. ` +
        (over90.length ? `In ${listJoin(over90.map((i) => inText(ds, i)))}, the share is 90% or more. ` : '') +
        `For these households, poverty is also a matter of health and time: WHO links household air pollution to 2.9 million deaths a year worldwide, and the work of cooking and gathering fuel falls mostly on women and children.`,
    ),
    evidence: [
      { label: 'Poor people, 2024 population', value: millions(h.poor) },
      { label: 'Poor and deprived in cooking fuel', value: millions(h.cookingPoor) },
      ...covered.map((i) => ({ label: `${countryName(ds, i, false)} (${nat[i].year}), share of poor`, value: pct(shareOfPoor(nat[i].censored.cooking, nat[i].headcount) ?? 0) })),
    ],
    refs: [nationalRef, ...ref('who', 'Household air pollution')],
    regions: [],
    countries: covered,
  });

  const elecRows = covered.map((i) => ({ iso: i, k: poorDeprived(m, i, 'electricity') })).sort((a, b) => b.k - a.k);
  const top = elecRows[0];
  const offgrid = m.regions.filter((r) => r.headcount >= TYPE_MIN_H && (shareOfPoor(r.censored.electricity, r.headcount) ?? 0) >= 33);
  const rest = m.regions.filter((r) => r.headcount >= TYPE_MIN_H && (shareOfPoor(r.censored.electricity, r.headcount) ?? 0) < 33);
  const avg = (rs: MpiRegion[], f: MpiIndicator) => rs.reduce((s, r) => s + (shareOfPoor(r.censored[f], r.headcount) ?? 0) * r.poor2024, 0) / rs.reduce((s, r) => s + r.poor2024, 0);
  out.push({
    id: 'pov-electricity',
    level: 'people',
    title: `${millions(h.electricityPoor)} poor people have no electricity, and most of them face several other deprivations`,
    body: tidy(
      `${pct((100 * h.electricityPoor) / h.poor)} of the poor lack electricity. ${countryName(ds, top.iso)} accounts for ${millions(top.k)} of them` +
        (isOld(nat[top.iso].year) ? `, on a survey from ${nat[top.iso].year}, so the current figure may differ` : '') +
        `. In the ${offgrid.length} sub-national regions where at least a third of the poor have no electricity, ${pct(avg(offgrid, 'housing'))} of the poor also live in inadequate housing and ${pct(avg(offgrid, 'sanitation'))} lack basic sanitation, against ${pct(avg(rest, 'housing'))} and ${pct(avg(rest, 'sanitation'))} elsewhere. ` +
        `Being off-grid tends to come bundled with other gaps, which argues for programmes that reach the same households with several services at once.`,
    ),
    evidence: [
      ...elecRows.map((r) => ({ label: `${countryName(ds, r.iso, false)} (${nat[r.iso].year}), poor without electricity`, value: millions(r.k) })),
      { label: 'Regions where one in three poor lack electricity', value: String(offgrid.length) },
      { label: 'Poor in inadequate housing there (weighted by poor)', value: pct(avg(offgrid, 'housing')) },
      { label: 'Poor in inadequate housing elsewhere', value: pct(avg(rest, 'housing')) },
    ],
    refs: [nationalRef, regionsRef],
    regions: offgrid.map(key),
    countries: [...new Set(offgrid.map((r) => r.iso))],
  });

  // Survey deprivation against the modelled SDG 7 series.
  if (ds.indicators.clean_cooking) {
    const rows = covered
      .map((iso) => {
        const l = latest(ds, 'clean_cooking', iso);
        return l ? { iso, survey: nat[iso].raw.cooking ?? 0, wdi: 100 - l.value, wdiYear: l.year } : null;
      })
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    const gaps = rows.filter((r) => Math.abs(r.survey - r.wdi) >= 10);
    if (rows.length >= 4) {
      out.push({
        id: 'pov-overlay',
        level: 'people',
        title: gaps.length ? `Survey and SDG 7 figures on cooking differ by 10 points or more in ${gaps.length} members` : 'Survey and SDG 7 figures on cooking broadly agree',
        body: tidy(
          `The MPI counts a household as deprived when it cooks with solid fuel (wood, charcoal, dung, crops, shrubs or coal) in the survey year; the SDG 7.1.2 series is modelled by WHO for more recent years and also counts kerosene as polluting. ` +
            (gaps.length
              ? `The two differ by 10 points or more in ${listJoin(gaps.map((g) => `${inText(ds, g.iso)} (${fmt(g.survey, { decimals: 0 })}% in ${nat[g.iso].year} against ${fmt(g.wdi, { decimals: 0 })}% in ${g.wdiYear})`))}. `
              : '') +
            `Gaps of this kind usually reflect survey timing and definitions, not error, but they matter for targeting: plans built on the national SDG figure alone may miss where poor households still cook with solid fuels.`,
        ),
        evidence: rows.map((r) => ({ label: `${countryName(ds, r.iso, false)}: survey ${nat[r.iso].year} / SDG 7 ${r.wdiYear}`, value: `${fmt(r.survey, { decimals: 1 })}% / ${fmt(r.wdi, { decimals: 1 })}%` })),
        refs: [nationalRef, { label: 'Access to clean cooking (SDG 7.1.2)', name: 'Tracking SDG7 (WHO), via World Development Indicators', url: 'https://data.worldbank.org/indicator/EG.CFT.ACCS.ZS', code: 'EG.CFT.ACCS.ZS' }],
        regions: [],
        countries: rows.map((r) => r.iso),
      });
    }
  }

  /* ---- Interventions by type ---- */
  for (const t of ty.types.filter((x) => x.id !== 'R')) {
    const regs = t.members.map((mk) => regionByKey[mk]).sort((a, b) => b.poor2024 - a.poor2024);
    const lead = regs.slice(0, 4).map((r) => `${r.name} (${countryName(ds, r.iso)})`);
    const p = t.profile;
    const options: string[] = [];
    if (p.electricity >= 40)
      options.push(
        `Most poor households here need both power and a cleaner stove. Integrated access programmes that pair grid extension or off-grid solar with clean cooking, and that use the same delivery channel for housing and sanitation support, could address several deprivations in one visit.`,
      );
    else if (p.cooking >= 70)
      options.push(
        `Most poor households here already have electricity but still cook with solid fuels. A clean-cooking push (LPG, electric or improved biomass stoves, supported by targeted subsidies or results-based finance) may reach the poor faster than new grid investment, and electric cooking uses connections that already exist.`,
      );
    else options.push(`Energy deprivation here is a minority problem among the poor; targeting through social registries and local service delivery is likely to matter more than large energy programmes.`);
    const second = topOther(t);
    if (p[second] >= 40) {
      const what: Partial<Record<MpiIndicator, string>> = {
        housing: 'housing upgrades that can also carry rooftop solar and safer kitchens',
        sanitation: 'sanitation delivered alongside water and housing programmes',
        water: 'safe water supply, where solar pumping can link energy and water investment',
        assets: 'livelihood and asset-building support, including productive uses of electricity',
        schooling: 'adult education and skills, so that adults can take up jobs created by the transition',
        attendance: 'keeping children in school, where electrified schools and less time spent gathering fuel both help',
      };
      options.push(`After energy, the most common deprivation is ${IND_LABEL[second].toLowerCase()}: ${pct(p[second])} of the poor are deprived, which points to ${what[second]}.`);
    }
    out.push({
      id: `pov-type-${t.id}`,
      level: 'action',
      type: t.id,
      title: `${t.short} (${t.members.length} regions, ${millions(t.poor)} poor)`,
      body: tidy(
        `These regions have, on average, ${pct(t.meanH)} of people poor; among the poor, ${pct(p.cooking)} lack clean cooking and ${pct(p.electricity)} lack electricity. ` +
          `They span ${listJoin(t.countries.map((i) => inText(ds, i)))}; the largest by number of poor are ${listJoin(lead)}. ` +
          options.join(' '),
      ),
      evidence: [
        { label: 'Regions', value: String(t.members.length) },
        { label: 'Poor people', value: millions(t.poor) },
        ...PROFILE.map((f) => ({ label: `Share of poor deprived in ${IND_LABEL[f].toLowerCase()}`, value: pct(p[f]) })),
      ],
      refs: [regionsRef],
      regions: t.members,
      countries: t.countries,
    });
  }

  /* ---- ASEAN cooperation ---- */
  const typeA = ty.types[0];
  const fwA = (ds.static.subregional?.frameworks ?? [])
    .map((fw) => ({ fw, n: typeA ? typeA.members.filter((mk) => fw.regions[mk]).length : 0 }))
    .filter((x) => x.n > 0);
  if (typeA && typeA.countries.length >= 3) {
    out.push({
      id: 'pov-belts',
      level: 'asean',
      type: typeA.id,
      title: `The deepest energy poverty forms belts that cross borders`,
      body: tidy(
        `The ${typeA.members.length} regions of type ${typeA.id} lie in ${typeA.countries.length} members (${listJoin(typeA.countries.map((i) => inText(ds, i)))}) and hold ${millions(typeA.poor)} poor people, ${pct((100 * typeA.poor) / h.poor)} of the total. ` +
          (fwA.length ? `They include ${listJoin(fwA.map((x) => `${x.n} in the ${x.fw.short} area`))}, so the map shows belts along shared borders and seas rather than isolated pockets. ` : '') +
          `Because the profile repeats across borders, members can design one approach to integrated access and adapt it nationally, rather than each starting from scratch: common technical standards for off-grid systems and stoves, pooled procurement, and shared results-based finance windows.`,
      ),
      evidence: typeA.countries.map((i) => ({
        label: `${countryName(ds, i, false)}: type ${typeA.id} regions, poor`,
        value: `${typeA.members.filter((mk) => mk.startsWith(i)).length}, ${millions(typeA.members.filter((mk) => mk.startsWith(i)).reduce((s, mk) => s + regionByKey[mk].poor2024, 0))}`,
      })),
      refs: [regionsRef],
      regions: typeA.members,
      countries: typeA.countries,
    });
  }

  for (const fw of ds.static.subregional?.frameworks ?? []) {
    const regs = Object.keys(fw.regions).map((mk) => regionByKey[mk]).filter(Boolean);
    if (!regs.length) continue;
    const poor = regs.reduce((s, r) => s + r.poor2024, 0);
    const cook = regs.reduce((s, r) => s + regionPoorDeprived(r, 'cooking'), 0);
    const elec = regs.reduce((s, r) => s + regionPoorDeprived(r, 'electricity'), 0);
    const counts = ty.types.map((t) => ({ t, n: regs.filter((r) => ty.byKey[key(r)] === t.id).length })).filter((x) => x.n);
    const hi = [...regs].sort((a, b) => b.headcount - a.headcount).slice(0, 3);
    const isos = [...new Set(regs.map((r) => r.iso))];
    out.push({
      id: `pov-fw-${fw.id}`,
      level: 'asean',
      title: `${fw.short}: ${millions(poor)} poor people in the survey regions it covers`,
      body: tidy(
        `The survey regions inside the ${fw.name} hold ${millions(poor)} poor people, of whom ${pct((100 * cook) / poor)} lack clean cooking and ${pct((100 * elec) / poor)} lack electricity. ` +
          `By profile they divide into ${listJoin(counts.map((x) => `${x.n} of type ${x.t.id}`))}. The highest headcounts are in ${listJoin(hi.map((r) => `${r.name} (${pct(r.headcount)})`))}. ` +
          `The framework already brings these governments together on cross-border development; adding a shared target and pipeline for household energy access, monitored with the sub-national MPI, would give that cooperation a poverty focus.` +
          (Object.values(fw.regions).includes('partial') ? ` ${fw.partialNote}` : ''),
      ),
      evidence: [
        { label: 'Survey regions matched', value: String(regs.length) },
        { label: 'Members covered by the MPI', value: listJoin(isos.map((i) => countryName(ds, i, false))) },
        { label: 'Poor people', value: millions(poor) },
        { label: 'Poor without clean cooking', value: millions(cook) },
        { label: 'Poor without electricity', value: millions(elec) },
      ],
      refs: [regionsRef, { label: `${fw.short} member territories`, name: fw.sourceName, url: fw.sourceUrl }],
      regions: regs.map(key),
      countries: isos,
    });
  }

  if (refs.apaec) {
    out.push({
      id: 'pov-apaec',
      level: 'asean',
      title: "ASEAN's energy plan for 2026 to 2030 has no programme area for clean cooking",
      body:
        `APAEC 2026-2030 sets out seven programme areas, from the ASEAN Power Grid to renewable energy and regional energy policy and planning, and refers to energy access in general terms. ` +
        `None of the seven is about household cooking, yet ${pct(cookShare)} of the poor in the members covered here lack clean cooking, against ${pct((100 * h.electricityPoor) / h.poor)} who lack electricity. ` +
        `A regional workstream on clean cooking and last-mile access, placed under the regional energy policy and planning area and reported against the MPI's cooking and electricity indicators, would align the plan's just and inclusive transition aim with where the poor are.`,
      evidence: [
        { label: 'Poor without clean cooking', value: `${millions(h.cookingPoor)} (${pct(cookShare)})` },
        { label: 'Poor without electricity', value: `${millions(h.electricityPoor)} (${pct((100 * h.electricityPoor) / h.poor)})` },
      ],
      refs: [nationalRef, ...ref('apaec', 'APAEC 2026-2030'), ...ref('apaecPress', 'APAEC 2026-2030 endorsement')],
      regions: [],
      countries: covered,
    });
  }

  // Learning from progress: fastest harmonised fall in cooking deprivation among the poor.
  const latestPair = new Map<string, (typeof m.changes)[number]>();
  for (const c of m.changes) {
    const prev = latestPair.get(c.iso);
    if (!prev || surveyEnd(c.year1) > surveyEnd(prev.year1)) latestPair.set(c.iso, c);
  }
  const pairs = [...latestPair.values()].filter((c) => c.censored.cooking.abs !== null);
  if (pairs.length >= 3) {
    pairs.sort((a, b) => a.censored.cooking.abs! - b.censored.cooking.abs!);
    const best = pairs[0];
    const bestElec = [...pairs].sort((a, b) => (a.censored.electricity.abs ?? 0) - (b.censored.electricity.abs ?? 0))[0];
    out.push({
      id: 'pov-learning',
      level: 'asean',
      title: `${countryName(ds, best.iso)} cut cooking deprivation among the poor fastest`,
      body: tidy(
        `On OPHI's harmonised estimates, the share of people who are poor and cook with solid fuel fell in ${inText(ds, best.iso)} from ${pct(best.censored.cooking.t0!, 1)} in ${best.year0} to ${pct(best.censored.cooking.t1!, 1)} in ${best.year1}, about ${fmt(-best.censored.cooking.abs!, { decimals: 1 })} points a year. ` +
          (bestElec.iso !== best.iso
            ? `For electricity the fastest fall was in ${inText(ds, bestElec.iso)} (${fmt(-(bestElec.censored.electricity.abs ?? 0), { decimals: 1 })} points a year, ${bestElec.year0} to ${bestElec.year1}). `
            : `It also recorded the fastest fall in electricity deprivation among the poor (${fmt(-(bestElec.censored.electricity.abs ?? 0), { decimals: 1 })} points a year). `) +
          `Each member's most recent harmonised pair is compared, so the periods differ. ` +
          `Peer review among ASEAN energy and social ministries of what drove these falls, and whether it reached the poorest regions, is a low-cost form of cooperation that the data now support.`,
      ),
      evidence: pairs.map((c) => ({
        label: `${countryName(ds, c.iso, false)} ${c.year0} to ${c.year1}: cooking, electricity (pp a year)`,
        value: `${fmt(c.censored.cooking.abs, { decimals: 2 })}${c.censored.cooking.sig}, ${fmt(c.censored.electricity.abs, { decimals: 2 })}${c.censored.electricity.sig}`,
      })),
      refs: [changesRef],
      regions: [],
      countries: pairs.map((c) => c.iso),
    });
  }

  const old = covered.filter((i) => isOld(nat[i].year));
  out.push({
    id: 'pov-data',
    level: 'asean',
    title: `Regular, comparable surveys are a regional public good`,
    body: tidy(
      `${old.length ? `The figures for ${listJoin(old.map((i) => `${inText(ds, i)} (${nat[i].year})`))} rest on surveys older than ${OLD_SURVEY}, and` : 'All covered members have recent surveys, but'} ` +
        `${listJoin(m.notCovered.map((i) => inText(ds, i)))} are not covered by the global MPI. ` +
        `A shared ASEAN schedule for household surveys that collect the ten MPI indicators, with sub-national samples large enough for the regions on this map, would let members track energy poverty in the places that cooperation targets.`,
    ),
    evidence: covered.map((i) => ({ label: `${countryName(ds, i, false)}`, value: `${nat[i].survey} ${nat[i].year}` })),
    refs: [nationalRef],
    regions: [],
    countries: [...old, ...m.notCovered],
  });

  return out.map((i) => ({ ...i, title: tidy(i.title) }));
}
