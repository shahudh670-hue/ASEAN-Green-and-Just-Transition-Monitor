/**
 * Automated policy insights.
 *
 * Every insight is a deterministic rule over the published data. Each returns
 * the numbers it used (evidence) and a "focus" that tells the interface which
 * chart, indicator and countries to show, so a reader can check the claim in
 * one click. Wording is hedged: the rules describe patterns ("signals",
 * "consistent with"), never causes.
 */
import { aggregate, cagr, change, countryName, latest, median, meta, projectionStart, value } from './data';
import { fmt, fmtSigned, listJoin } from './format';
import type { Dataset, Iso3 } from './types';

export type InsightKind = 'progress' | 'risk' | 'gap' | 'finance' | 'note';

export interface Insight {
  id: string;
  pillar: string;
  kind: InsightKind;
  title: string;
  body: string;
  countries: Iso3[];
  indicators: string[];
  evidence: { label: string; value: string }[];
  focus: { view: 'trend' | 'map' | 'explorer'; indicator: string; countries: Iso3[]; x?: string; y?: string };
}

const SPAN = 5;
const isoList = (ds: Dataset) => ds.meta.countries.map((c) => c.iso3);
// "the Philippines" in running text; capitalised at sentence starts by tidy().
const inText = (ds: Dataset, iso: Iso3) => (iso === 'PHL' ? 'the Philippines' : countryName(ds, iso));
const names = (ds: Dataset, isos: Iso3[]) => listJoin(isos.map((i) => inText(ds, i)));
/** Verb agreement for a list of countries. */
const vb = (isos: unknown[], singular: string, plural: string) => (isos.length === 1 ? singular : plural);
const tidy = (t: string) => t.replace(/(^|[.:]\s+|\(\s*)the Philippines/g, (_m, p) => `${p}The Philippines`);
const has = (ds: Dataset, id: string) => Boolean(ds.indicators[id]);

/** Latest actual (non-projection) year for an indicator, per country. */
const actual = (ds: Dataset, id: string, iso: Iso3) => latest(ds, id, iso, projectionStart(ds) - 1);

function transitionLeaders(ds: Dataset): Insight[] {
  if (!has(ds, 're_share')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, ch: change(ds, 're_share', iso, SPAN) }))
    .filter((r): r is { iso: string; ch: NonNullable<ReturnType<typeof change>> } => Boolean(r.ch));
  if (rows.length < 4) return [];
  rows.sort((a, b) => b.ch.diff - a.ch.diff);
  const leaders = rows.filter((r) => r.ch.diff > 0).slice(0, 3);
  const decliners = rows.filter((r) => r.ch.diff < -0.5);
  const endYear = Math.max(...rows.map((r) => r.ch.endYear));
  const out: Insight[] = [];
  if (leaders.length) {
    out.push({
      id: 're-leaders',
      pillar: 'transition',
      kind: 'progress',
      title: `${countryName(ds, leaders[0].iso)} leads the shift to renewables`,
      body:
        `Over the five years to ${endYear}, the renewable share of final energy rose most in ${names(ds, leaders.map((l) => l.iso))} ` +
        `(${leaders.map((l) => fmtSigned(l.ch.diff, 1, ' pp')).join(', ')}). ` +
        `These gains point to where policy and project pipelines are already moving, and where catalytic finance can scale what works.`,
      countries: leaders.map((l) => l.iso),
      indicators: ['re_share'],
      evidence: leaders.map((l) => ({ label: `${countryName(ds, l.iso)}, ${l.ch.startYear} to ${l.ch.endYear}`, value: `${fmt(l.ch.start, meta(ds, 're_share'))}% to ${fmt(l.ch.end, meta(ds, 're_share'))}%` })),
      focus: { view: 'trend', indicator: 're_share', countries: leaders.map((l) => l.iso) },
    });
  }
  if (decliners.length) {
    out.push({
      id: 're-decliners',
      pillar: 'transition',
      kind: 'risk',
      title: `Renewable share is falling in ${decliners.length} member${decliners.length > 1 ? 's' : ''}`,
      body:
        `The share fell in ${names(ds, decliners.map((d) => d.iso))} over the same period. ` +
        `Part of this can reflect a welcome move away from traditional biomass for cooking, which the indicator counts as renewable. ` +
        `Read together with access to clean energy, a falling share alongside rising coal or gas demand is the pattern that signals lock-in risk.`,
      countries: decliners.map((d) => d.iso),
      indicators: ['re_share'],
      evidence: decliners.map((d) => ({ label: countryName(ds, d.iso), value: fmtSigned(d.ch.diff, 1, ' pp') })),
      focus: { view: 'trend', indicator: 're_share', countries: decliners.slice(0, 4).map((d) => d.iso) },
    });
  }
  return out;
}

function decarbonisation(ds: Dataset): Insight[] {
  if (!has(ds, 'co2_intensity')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, ch: change(ds, 'co2_intensity', iso, SPAN) }))
    .filter((r) => r.ch?.cagr !== undefined) as { iso: string; ch: NonNullable<ReturnType<typeof change>> }[];
  if (rows.length < 4) return [];
  rows.sort((a, b) => a.ch.cagr! - b.ch.cagr!);
  const end = Math.max(...rows.map((r) => r.ch.endYear));
  const aggEnd = aggregate(ds, 'co2_intensity', end, 'median');
  const aggStart = aggregate(ds, 'co2_intensity', end - SPAN, 'median');
  const regional = aggEnd && aggStart ? cagr(aggStart.value, aggEnd.value, SPAN) : undefined;
  const rising = rows.filter((r) => r.ch.cagr! > 0);
  const fastest = rows.slice(0, 2);
  return [
    {
      id: 'co2-pace',
      pillar: 'transition',
      kind: rising.length ? 'risk' : 'progress',
      title: regional !== undefined ? `Median carbon intensity in ASEAN is changing by ${fmtSigned(regional, 1, '%')} a year` : 'Carbon intensity of growth',
      body:
        `${names(ds, fastest.map((f) => f.iso))} cut the carbon intensity of their GDP fastest over the five years to ${end} ` +
        `(${fastest.map((f) => fmtSigned(f.ch.cagr, 1, '% a year')).join(' and ')}). ` +
        (rising.length
          ? `Intensity rose in ${names(ds, rising.map((r) => r.iso))}, which signals that new output is still more carbon-heavy than the existing economy.`
          : 'No member saw intensity rise over the period.'),
      countries: [...fastest.map((f) => f.iso), ...rising.map((r) => r.iso)],
      indicators: ['co2_intensity'],
      evidence: rows.map((r) => ({ label: countryName(ds, r.iso), value: fmtSigned(r.ch.cagr, 1, '% a year') })),
      focus: { view: 'trend', indicator: 'co2_intensity', countries: [...fastest.map((f) => f.iso), ...rising.map((r) => r.iso)].slice(0, 4) },
    },
  ];
}

function decoupling(ds: Dataset): Insight[] {
  if (!has(ds, 'co2_intensity') || !has(ds, 'aux_gdp')) return [];
  const groups: Record<'absolute' | 'relative' | 'coupled', { iso: string; em: number; gdp: number }[]> = { absolute: [], relative: [], coupled: [] };
  let endYear = 0;
  for (const iso of isoList(ds)) {
    const ci = change(ds, 'co2_intensity', iso, SPAN);
    if (!ci?.cagr) continue;
    const g0 = value(ds, 'aux_gdp', iso, ci.startYear);
    const g1 = value(ds, 'aux_gdp', iso, ci.endYear);
    const gdp = g0 && g1 ? cagr(g0, g1, ci.years) : undefined;
    if (gdp === undefined) continue;
    const em = ((1 + ci.cagr / 100) * (1 + gdp / 100) - 1) * 100;
    endYear = Math.max(endYear, ci.endYear);
    const row = { iso, em, gdp };
    if (gdp > 0 && em < 0) groups.absolute.push(row);
    else if (em < gdp) groups.relative.push(row);
    else groups.coupled.push(row);
  }
  const total = groups.absolute.length + groups.relative.length + groups.coupled.length;
  if (total < 4) return [];
  return [
    {
      id: 'decoupling',
      pillar: 'transition',
      kind: groups.absolute.length ? 'progress' : 'gap',
      title: `${groups.absolute.length} of ${total} members grew while cutting emissions`,
      body:
        (groups.absolute.length ? `${names(ds, groups.absolute.map((g) => g.iso))} ${vb(groups.absolute, 'shows', 'show')} absolute decoupling: real GDP rose while implied CO2 emissions fell. ` : 'No member shows absolute decoupling over the period. ') +
        (groups.relative.length ? `${names(ds, groups.relative.map((g) => g.iso))} decoupled in relative terms: emissions grew, but more slowly than output. ` : '') +
        (groups.coupled.length ? `In ${names(ds, groups.coupled.map((g) => g.iso))}, emissions grew at least as fast as GDP.` : ''),
      countries: [...groups.absolute, ...groups.coupled].map((g) => g.iso),
      indicators: ['co2_intensity', 'gdppc_growth'],
      evidence: [...groups.absolute, ...groups.relative, ...groups.coupled].map((g) => ({
        label: countryName(ds, g.iso),
        value: `GDP ${fmtSigned(g.gdp, 1, '%')} a year, CO2 ${fmtSigned(g.em, 1, '%')} a year`,
      })),
      focus: { view: 'explorer', indicator: 'co2_intensity', countries: groups.coupled.slice(0, 4).map((g) => g.iso), x: 'gdppc_ppp', y: 'co2_intensity' },
    },
  ];
}

function avgRecent(ds: Dataset, id: string, iso: Iso3, n = 3): number | undefined {
  const l = actual(ds, id, iso);
  if (!l) return undefined;
  const vals = Array.from({ length: n }, (_, i) => value(ds, id, iso, l.year - i)).filter((v): v is number => v !== undefined);
  return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : undefined;
}

function investmentGap(ds: Dataset): Insight[] {
  if (!has(ds, 're_share') || !has(ds, 'fdi') || !has(ds, 'gcf')) return [];
  const rows = isoList(ds).map((iso) => ({
    iso,
    fdi: avgRecent(ds, 'fdi', iso),
    gcf: avgRecent(ds, 'gcf', iso),
    re: change(ds, 're_share', iso, SPAN)?.diff,
  }));
  const mFdi = median(rows.map((r) => r.fdi!).filter(Number.isFinite));
  const mGcf = median(rows.map((r) => r.gcf!).filter(Number.isFinite));
  const mRe = median(rows.map((r) => r.re!).filter(Number.isFinite));
  if (mFdi === undefined || mGcf === undefined || mRe === undefined) return [];
  const flagged = rows.filter((r) => r.re !== undefined && r.re < mRe && ((r.fdi ?? -Infinity) > mFdi || (r.gcf ?? -Infinity) > mGcf) && r.iso !== 'SGP');
  if (!flagged.length) return [];
  return [
    {
      id: 'investment-gap',
      pillar: 'transition',
      kind: 'gap',
      title: 'Capital is arriving, but not yet into the transition',
      body:
        `${names(ds, flagged.map((f) => f.iso))} ${vb(flagged, 'attracts', 'attract')} above-median investment (foreign direct investment or gross capital formation, three-year average) ` +
        `while ${vb(flagged, 'its', 'their')} renewable share has grown less than the ASEAN median. This is the pattern where instruments that change the risk-return of clean projects, ` +
        `such as guarantees, first-loss tranches and project preparation support, are likely to have the most leverage.`,
      countries: flagged.map((f) => f.iso),
      indicators: ['fdi', 'gcf', 're_share'],
      evidence: flagged.map((f) => ({
        label: countryName(ds, f.iso),
        value: `FDI ${fmt(f.fdi, { decimals: 1 })}% GDP, investment ${fmt(f.gcf, { decimals: 1 })}% GDP, renewables ${fmtSigned(f.re, 1, ' pp')}`,
      })),
      focus: { view: 'explorer', indicator: 'gcf', countries: flagged.slice(0, 4).map((f) => f.iso), x: 'gcf', y: 're_share' },
    },
  ];
}

function cleanFinance(ds: Dataset): Insight[] {
  if (!has(ds, 'sdg7a1')) return [];
  const years = isoList(ds).flatMap((iso) => Object.keys(ds.indicators.sdg7a1.values[iso] ?? {}).map(Number));
  if (!years.length) return [];
  const end = Math.max(...years);
  const window = Array.from({ length: SPAN }, (_, i) => end - i);
  const prevWindow = window.map((y) => y - SPAN);
  const sum = (iso: Iso3, ys: number[]) => ys.reduce((s, y) => s + (value(ds, 'sdg7a1', iso, y) ?? 0), 0);
  const rows = isoList(ds).map((iso) => ({ iso, now: sum(iso, window), before: sum(iso, prevWindow) })).filter((r) => r.now > 0 || r.before > 0);
  const total = rows.reduce((s, r) => s + r.now, 0);
  const totalBefore = rows.reduce((s, r) => s + r.before, 0);
  if (!total) return [];
  rows.sort((a, b) => b.now - a.now);
  const top2 = rows.slice(0, 2);
  const top2Share = (top2.reduce((s, r) => s + r.now, 0) / total) * 100;
  const hhi = rows.reduce((s, r) => s + Math.pow((r.now / total) * 100, 2), 0);
  const trend = totalBefore ? ((total - totalBefore) / totalBefore) * 100 : undefined;
  return [
    {
      id: 'clean-finance',
      pillar: 'climatefin',
      kind: 'finance',
      title: `${fmt(top2Share, { decimals: 0 })}% of international clean-energy finance went to two members`,
      body:
        `In ${window[window.length - 1]} to ${end}, ASEAN recipients received commitments of about US$${fmt(total, { decimals: 0 })} million (constant prices) for renewable energy and clean energy research. ` +
        `${names(ds, top2.map((t) => t.iso))} took ${fmt(top2Share, { decimals: 0 })}% of it (concentration index ${fmt(hhi, { decimals: 0 })} on a 0 to 10,000 scale). ` +
        (trend !== undefined ? `Total commitments were ${trend >= 0 ? 'up' : 'down'} ${fmt(Math.abs(trend), { decimals: 0 })}% on the previous five years. ` : '') +
        `Because single large projects dominate, a few deals can move these numbers sharply.`,
      countries: top2.map((t) => t.iso),
      indicators: ['sdg7a1'],
      evidence: rows.map((r) => ({ label: countryName(ds, r.iso), value: `US$${fmt(r.now, { decimals: 0 })} m (previous 5 years: ${fmt(r.before, { decimals: 0 })} m)` })),
      focus: { view: 'map', indicator: 'sdg7a1', countries: top2.map((t) => t.iso) },
    },
  ];
}

function accessGap(ds: Dataset): Insight[] {
  if (!has(ds, 'elec_access')) return [];
  const rows = isoList(ds)
    .map((iso) => {
      const l = latest(ds, 'elec_access', iso);
      const ch = change(ds, 'elec_access', iso, SPAN);
      if (!l || l.value >= 99) return undefined;
      const pace = ch ? ch.diff / ch.years : undefined;
      const yearsTo = pace && pace > 0 ? (100 - l.value) / pace : undefined;
      return { iso, level: l.value, year: l.year, pace, yearsTo };
    })
    .filter(Boolean) as { iso: string; level: number; year: number; pace?: number; yearsTo?: number }[];
  if (!rows.length) return [];
  rows.sort((a, b) => a.level - b.level);
  const pop = (iso: Iso3, year: number) => value(ds, 'aux_pop', iso, year) ?? latest(ds, 'aux_pop', iso, year)?.value;
  const without = rows.reduce((s, r) => s + ((100 - r.level) / 100) * (pop(r.iso, r.year) ?? 0), 0);
  return [
    {
      id: 'access-gap',
      pillar: 'transition',
      kind: 'gap',
      title: without > 0 ? `About ${fmt(without / 1e6, { decimals: 1 })} million people still lack electricity` : 'The last mile of electricity access',
      body:
        `${names(ds, rows.map((r) => r.iso))} ${vb(rows, 'has', 'have')} not yet reached universal access. ` +
        rows
          .map((r) => `${countryName(ds, r.iso)} stands at ${fmt(r.level, { decimals: 1 })}%` + (r.yearsTo !== undefined ? ` and would close the gap in about ${fmt(r.yearsTo, { decimals: 0 })} years at its recent pace` : ', with no recent gain to project'))
          .join('; ') +
        '. The last mile is usually rural and off-grid, where mini-grids and blended finance matter most.',
      countries: rows.map((r) => r.iso),
      indicators: ['elec_access'],
      evidence: rows.map((r) => ({ label: countryName(ds, r.iso), value: `${fmt(r.level, { decimals: 1 })}% (${r.year}), ${r.pace !== undefined ? fmtSigned(r.pace, 1, ' pp a year') : 'n/a'}` })),
      focus: { view: 'trend', indicator: 'elec_access', countries: rows.slice(0, 4).map((r) => r.iso) },
    },
  ];
}

function planetaryPressure(ds: Dataset): Insight[] {
  if (!has(ds, 'hdi_phdi_loss') || !has(ds, 'hdi')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, loss: latest(ds, 'hdi_phdi_loss', iso), dLoss: change(ds, 'hdi_phdi_loss', iso, 10)?.diff, dHdi: change(ds, 'hdi', iso, 10)?.diff }))
    .filter((r) => r.loss);
  if (rows.length < 4) return [];
  rows.sort((a, b) => b.loss!.value - a.loss!.value);
  const worsening = rows.filter((r) => (r.dHdi ?? 0) > 0 && (r.dLoss ?? 0) > 0.5);
  const top = rows.slice(0, 3);
  return [
    {
      id: 'planetary-pressure',
      pillar: 'people',
      kind: worsening.length ? 'risk' : 'note',
      title: 'Human development gains carry a planetary cost',
      body:
        `Adjusting the HDI for carbon emissions and material use lowers it most for ${names(ds, top.map((t) => t.iso))} ` +
        `(${top.map((t) => `${fmt(t.loss!.value, { decimals: 1 })}%`).join(', ')} in ${top[0].loss!.year}). ` +
        (worsening.length
          ? `In ${names(ds, worsening.map((w) => w.iso))}, the HDI rose over the past decade while the planetary-pressure loss widened, which signals that progress is still resource-intensive.`
          : 'No member saw the loss widen while its HDI rose over the past decade.'),
      countries: [...new Set([...top, ...worsening].map((r) => r.iso))],
      indicators: ['hdi_phdi_loss', 'hdi', 'phdi'],
      evidence: rows.map((r) => ({ label: countryName(ds, r.iso), value: `loss ${fmt(r.loss!.value, { decimals: 1 })}%, 10-year change ${fmtSigned(r.dLoss, 1, ' pp')}` })),
      focus: { view: 'explorer', indicator: 'hdi_phdi_loss', countries: worsening.slice(0, 4).map((w) => w.iso), x: 'hdi', y: 'hdi_phdi_loss' },
    },
  ];
}

function energyPoverty(ds: Dataset): Insight[] {
  const mpi = ds.static.mpi.rows;
  const rows = Object.entries(mpi)
    .filter(([, r]) => r.headcount >= 10)
    .map(([iso, r]) => ({ iso, r, access: latest(ds, 'elec_access', iso) }))
    .sort((a, b) => b.r.headcount - a.r.headcount);
  if (!rows.length) return [];
  return [
    {
      id: 'energy-poverty',
      pillar: 'people',
      kind: 'gap',
      title: 'Energy access and multidimensional poverty overlap',
      body:
        `In ${names(ds, rows.map((x) => x.iso))}, at least one person in ten is multidimensionally poor (2026 global MPI). ` +
        `Living standards, which include electricity and clean cooking fuel, account for ` +
        rows.map((x) => `${fmt(x.r.living, { decimals: 0 })}% of poverty in ${countryName(ds, x.iso)}`).join(', ') +
        '. Clean energy investment aimed at these households would count twice: as transition finance and as poverty reduction. Survey years differ and some are old, so the latest figures may overstate current deprivation.',
      countries: rows.map((x) => x.iso),
      indicators: ['elec_access'],
      evidence: rows.map((x) => ({
        label: `${countryName(ds, x.iso)} (survey ${x.r.year})`,
        value: `headcount ${fmt(x.r.headcount, { decimals: 1 })}%, living standards ${fmt(x.r.living, { decimals: 1 })}%, electricity access ${fmt(x.access?.value, { decimals: 1 })}%`,
      })),
      focus: { view: 'map', indicator: 'elec_access', countries: rows.slice(0, 4).map((x) => x.iso) },
    },
  ];
}

function fiscalSpace(ds: Dataset): Insight[] {
  if (!has(ds, 'gg_rev')) return [];
  const rows = isoList(ds).map((iso) => ({
    iso,
    rev: actual(ds, 'gg_rev', iso),
    debt: actual(ds, 'gg_debt', iso),
    ds_: latest(ds, 'debt_service', iso),
  }));
  const mRev = median(rows.map((r) => r.rev?.value).filter((v): v is number => v !== undefined));
  const mDs = median(rows.map((r) => r.ds_?.value).filter((v): v is number => v !== undefined));
  if (mRev === undefined) return [];
  const constrained = rows.filter(
    (r) => r.iso !== 'SGP' && r.rev && r.rev.value < mRev && ((r.ds_ && mDs !== undefined && r.ds_.value > mDs) || (r.debt && r.debt.value > 60)),
  );
  if (!constrained.length) return [];
  return [
    {
      id: 'fiscal-space',
      pillar: 'fiscal',
      kind: 'risk',
      title: 'Thin revenue meets heavy debt burdens',
      body:
        `${names(ds, constrained.map((c) => c.iso))} ${vb(constrained, 'combines', 'combine')} general government revenue below the ASEAN median (${fmt(mRev, { decimals: 1 })}% of GDP) ` +
        `with either above-median external debt service or public debt above 60% of GDP. Public budgets here have little room to co-finance transition investment, ` +
        `which raises the value of grant elements, concessional tenors and revenue reforms that widen the base.`,
      countries: constrained.map((c) => c.iso),
      indicators: ['gg_rev', 'gg_debt', 'debt_service'],
      evidence: constrained.map((c) => ({
        label: countryName(ds, c.iso),
        value: `revenue ${fmt(c.rev?.value, { decimals: 1 })}% GDP, public debt ${fmt(c.debt?.value, { decimals: 1 })}% GDP, debt service ${fmt(c.ds_?.value, { decimals: 1 })}% of exports`,
      })),
      focus: { view: 'explorer', indicator: 'gg_rev', countries: constrained.slice(0, 4).map((c) => c.iso), x: 'gg_rev', y: 'gg_debt' },
    },
  ];
}

function graduation(ds: Dataset): Insight[] {
  const changed = Object.entries(ds.static.income.rows).filter(([, r]) => r.changed);
  if (!changed.length) return [];
  const isos = changed.map(([iso]) => iso);
  const evidence = isos.map((iso) => {
    const oda = change(ds, 'oda_gni', iso, SPAN);
    return { label: countryName(ds, iso), value: `net ODA ${fmt(oda?.end, { decimals: 2 })}% of GNI in ${oda?.endYear ?? 'n/a'} (${fmtSigned(oda?.diff, 2, ' pp')} over 5 years)` };
  });
  const groups = ds.static.income.groups;
  return [
    {
      id: 'graduation',
      pillar: 'oda',
      kind: 'finance',
      title: `${names(ds, isos)} ${isos.length > 1 ? 'have' : 'has'} moved up an income group`,
      body:
        `In the FY2027 classification, ${names(ds, isos)} moved from ${groups[changed[0][1].previous ?? 'LMC'].toLowerCase()} to ${groups[changed[0][1].group].toLowerCase()} status. ` +
        `Graduation tends to narrow access to the most concessional finance just as transition investment needs rise. ` +
        `Blended structures that crowd in private and domestic capital become more important as grant-based support declines.`,
      countries: isos,
      indicators: ['oda_gni', 'oda_share'],
      evidence,
      focus: { view: 'trend', indicator: 'oda_gni', countries: isos },
    },
  ];
}

function debtStructure(ds: Dataset): Insight[] {
  const flagged = isoList(ds)
    .map((iso) => ({ iso, st: change(ds, 'ext_st_share', iso, SPAN), png: change(ds, 'ext_png_share', iso, SPAN) }))
    .filter((r) => (r.st?.diff ?? 0) > 3 || (r.png?.diff ?? 0) > 5);
  if (!flagged.length) return [];
  return [
    {
      id: 'debt-structure',
      pillar: 'debt',
      kind: 'risk',
      title: 'External debt is shifting toward riskier forms',
      body:
        `In ${names(ds, flagged.map((f) => f.iso))}, the short-term or private non-guaranteed share of external debt rose markedly over five years. ` +
        `Shorter maturities and private foreign-currency borrowing raise rollover and exchange-rate risk, which long-tenor transition projects then have to price in.`,
      countries: flagged.map((f) => f.iso),
      indicators: ['ext_st_share', 'ext_png_share'],
      evidence: flagged.map((f) => ({ label: countryName(ds, f.iso), value: `short-term ${fmtSigned(f.st?.diff, 1, ' pp')}, private non-guaranteed ${fmtSigned(f.png?.diff, 1, ' pp')}` })),
      focus: { view: 'trend', indicator: (flagged[0].st?.diff ?? 0) > 3 ? 'ext_st_share' : 'ext_png_share', countries: flagged.slice(0, 4).map((f) => f.iso) },
    },
  ];
}

function financialDepth(ds: Dataset): Insight[] {
  if (!has(ds, 'priv_credit')) return [];
  const rows = isoList(ds).map((iso) => ({ iso, credit: latest(ds, 'priv_credit', iso), cap: latest(ds, 'mkt_cap', iso) }));
  const deep = rows.filter((r) => (r.credit?.value ?? 0) >= 100 || (r.cap?.value ?? 0) >= 80);
  const shallow = rows.filter((r) => r.credit && r.credit.value < 50 && (!r.cap || r.cap.value < 60));
  if (!deep.length && !shallow.length) return [];
  return [
    {
      id: 'financial-depth',
      pillar: 'finance',
      kind: 'finance',
      title: 'Domestic capital pools are deep in some members, shallow in others',
      body:
        (deep.length ? `${names(ds, deep.map((d) => d.iso))} ${vb(deep, 'has', 'have')} deep domestic markets (private credit of at least 100% of GDP or stock market capitalisation of at least 80%), where local-currency green bonds and loans can carry much of the financing. ` : '') +
        (shallow.length ? `${names(ds, shallow.map((s) => s.iso))} ${vb(shallow, 'has', 'have')} private credit below 50% of GDP and small or no equity markets, so transition projects there depend more on external and concessional capital, and on building local markets.` : ''),
      countries: [...deep, ...shallow].map((r) => r.iso),
      indicators: ['priv_credit', 'mkt_cap'],
      evidence: rows
        .filter((r) => r.credit || r.cap)
        .map((r) => ({ label: countryName(ds, r.iso), value: `private credit ${fmt(r.credit?.value, { decimals: 0 })}% GDP, market cap ${fmt(r.cap?.value, { decimals: 0 })}% GDP` })),
      focus: { view: 'explorer', indicator: 'priv_credit', countries: shallow.slice(0, 4).map((s) => s.iso), x: 'priv_credit', y: 'mkt_cap' },
    },
  ];
}

function odaReliance(ds: Dataset): Insight[] {
  if (!has(ds, 'oda_gni')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, l: latest(ds, 'oda_gni', iso), ch: change(ds, 'oda_gni', iso, SPAN) }))
    .filter((r) => r.l && r.l.value >= 2)
    .sort((a, b) => b.l!.value - a.l!.value);
  if (!rows.length) return [];
  return [
    {
      id: 'oda-reliance',
      pillar: 'oda',
      kind: 'note',
      title: `ODA remains material for ${names(ds, rows.map((r) => r.iso))}`,
      body:
        `Net ODA equals ${rows.map((r) => `${fmt(r.l!.value, { decimals: 1 })}% of GNI in ${countryName(ds, r.iso)} (${r.l!.year})`).join(', ')}. ` +
        `Where aid is this large relative to the economy, how it is used to leverage other finance matters as much as how much arrives.`,
      countries: rows.map((r) => r.iso),
      indicators: ['oda_gni'],
      evidence: rows.map((r) => ({ label: countryName(ds, r.iso), value: `${fmt(r.l!.value, { decimals: 2 })}% of GNI, 5-year change ${fmtSigned(r.ch?.diff, 2, ' pp')}` })),
      focus: { view: 'trend', indicator: 'oda_gni', countries: rows.slice(0, 4).map((r) => r.iso) },
    },
  ];
}

function dataRecency(ds: Dataset): Insight[] {
  const cut = projectionStart(ds) - 3;
  const stale = ds.catalogue
    .filter((c) => !c.hidden && ds.indicators[c.id])
    .map((c) => ({ c, last: Math.max(...isoList(ds).map((iso) => latest(ds, c.id, iso)?.year ?? 0)) }))
    .filter((r) => r.last > 0 && r.last < cut);
  if (!stale.length) return [];
  return [
    {
      id: 'data-recency',
      pillar: 'all',
      kind: 'note',
      title: 'Some series lag by three years or more',
      body: `The most recent data for ${listJoin(stale.map((s) => `${s.c.label.toLowerCase()} (${s.last})`))} predates ${cut}. Insights that use these series describe the recent past, not the present.`,
      countries: [],
      indicators: stale.map((s) => s.c.id),
      evidence: stale.map((s) => ({ label: s.c.label, value: String(s.last) })),
      focus: { view: 'trend', indicator: stale[0].c.id, countries: [] },
    },
  ];
}


function coalExposure(ds: Dataset): Insight[] {
  if (!has(ds, 'coal_elec') || !has(ds, 'vuln_emp')) return [];
  const rows = isoList(ds).map((iso) => ({ iso, coal: latest(ds, 'coal_elec', iso), vuln: latest(ds, 'vuln_emp', iso) }));
  const mVuln = median(rows.map((r) => r.vuln?.value).filter((v): v is number => v !== undefined));
  if (mVuln === undefined) return [];
  const flagged = rows.filter((r) => (r.coal?.value ?? 0) >= 40 && (r.vuln?.value ?? 0) > mVuln).sort((a, b) => b.coal!.value - a.coal!.value);
  const coalHeavy = rows.filter((r) => (r.coal?.value ?? 0) >= 40).sort((a, b) => b.coal!.value - a.coal!.value);
  if (!coalHeavy.length) return [];
  return [
    {
      id: 'coal-exposure',
      pillar: 'workers',
      kind: flagged.length ? 'risk' : 'note',
      title: `Coal supplies at least 40% of electricity in ${coalHeavy.length} member${coalHeavy.length > 1 ? 's' : ''}`,
      body:
        `${names(ds, coalHeavy.map((r) => r.iso))} ${vb(coalHeavy, 'generates', 'generate')} at least 40% of ${vb(coalHeavy, 'its', 'their')} electricity from coal ` +
        `(${coalHeavy.map((r) => `${fmt(r.coal!.value, { decimals: 0 })}%`).join(', ')}). ` +
        (flagged.length
          ? `In ${names(ds, flagged.map((r) => r.iso))}, vulnerable employment is also above the ASEAN median (${fmt(mVuln, { decimals: 1 })}% of workers), so a coal phase-down would land on a workforce with few contracts and little income protection. Retraining, wage support and regional development plans need to be financed alongside the clean power itself.`
          : 'Vulnerable employment in these members is at or below the ASEAN median, which gives more room for managed, contract-based transitions.'),
      countries: coalHeavy.map((r) => r.iso),
      indicators: ['coal_elec', 'vuln_emp'],
      evidence: coalHeavy.map((r) => ({ label: countryName(ds, r.iso), value: `coal ${fmt(r.coal!.value, { decimals: 1 })}% of electricity (${r.coal!.year}), vulnerable employment ${fmt(r.vuln?.value, { decimals: 1 })}%` })),
      focus: { view: 'explorer', indicator: 'coal_elec', countries: coalHeavy.slice(0, 4).map((r) => r.iso), x: 'coal_elec', y: 'vuln_emp' },
    },
  ];
}

function protectionGap(ds: Dataset): Insight[] {
  if (!has(ds, 'sp_cov') || !has(ds, 'coal_elec')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, coal: latest(ds, 'coal_elec', iso), sp: latest(ds, 'sp_cov', iso), rents: latest(ds, 'coal_rents', iso) }))
    .filter((r) => r.sp && r.sp.value < 50 && ((r.coal?.value ?? 0) >= 40 || (r.rents?.value ?? 0) >= 1));
  if (!rows.length) return [];
  return [
    {
      id: 'protection-gap',
      pillar: 'workers',
      kind: 'gap',
      title: 'Coal-dependent members have thin safety nets',
      body:
        `In ${names(ds, rows.map((r) => r.iso))}, coal is central to the power system or the economy, yet fewer than half of people receive any social protection benefit ` +
        `(${rows.map((r) => `${fmt(r.sp!.value, { decimals: 0 })}% in ${inText(ds, r.iso)}, ${r.sp!.year}`).join('; ')}). ` +
        'Without unemployment insurance and active labour market programmes in place, workers and communities would carry the cost of early coal retirement. Social protection is part of the transition package, not an add-on.',
      countries: rows.map((r) => r.iso),
      indicators: ['sp_cov', 'coal_elec', 'coal_rents'],
      evidence: rows.map((r) => ({
        label: countryName(ds, r.iso),
        value: `social protection ${fmt(r.sp!.value, { decimals: 1 })}% (${r.sp!.year}), coal ${fmt(r.coal?.value, { decimals: 1 })}% of electricity, coal rents ${fmt(r.rents?.value, { decimals: 2 })}% of GDP (${r.rents?.year ?? 'n/a'})`,
      })),
      focus: { view: 'map', indicator: 'sp_cov', countries: rows.slice(0, 4).map((r) => r.iso) },
    },
  ];
}

function youthAndGender(ds: Dataset): Insight[] {
  if (!has(ds, 'neet') || !has(ds, 'flfp_ratio')) return [];
  const rows = isoList(ds).map((iso) => ({ iso, neet: latest(ds, 'neet', iso), ratio: latest(ds, 'flfp_ratio', iso) }));
  const mNeet = median(rows.map((r) => r.neet?.value).filter((v): v is number => v !== undefined));
  const mRatio = median(rows.map((r) => r.ratio?.value).filter((v): v is number => v !== undefined));
  if (mNeet === undefined || mRatio === undefined) return [];
  const flagged = rows.filter((r) => (r.neet?.value ?? 0) > mNeet && (r.ratio?.value ?? 100) < mRatio);
  if (!flagged.length) return [];
  return [
    {
      id: 'youth-gender',
      pillar: 'workers',
      kind: 'gap',
      title: 'Young people and women risk missing the new green jobs',
      body:
        `${names(ds, flagged.map((r) => r.iso))} combine an above-median share of young people not in education, employment or training (ASEAN median ${fmt(mNeet, { decimals: 1 })}%) ` +
        `with below-median female participation relative to men (median ratio ${fmt(mRatio, { decimals: 0 })}). ` +
        'New jobs in solar, grids and efficiency will go to those with the right skills; targeted training and apprenticeships for young people and women decide whether the transition narrows or widens these gaps.',
      countries: flagged.map((r) => r.iso),
      indicators: ['neet', 'flfp_ratio'],
      evidence: flagged.map((r) => ({ label: countryName(ds, r.iso), value: `NEET ${fmt(r.neet!.value, { decimals: 1 })}% (${r.neet!.year}), female-to-male participation ${fmt(r.ratio?.value, { decimals: 0 })}` })),
      focus: { view: 'explorer', indicator: 'neet', countries: flagged.slice(0, 4).map((r) => r.iso), x: 'flfp_ratio', y: 'neet' },
    },
  ];
}


/* ---------- Climate and transition finance, subsidies, coal pipeline, energy mix ---------- */
function sumWindow(ds: Dataset, id: string, iso: Iso3, end: number, n = 3) {
  let s = 0;
  let seen = 0;
  for (let y = end - n + 1; y <= end; y++) {
    const v = value(ds, id, iso, y);
    if (v !== undefined) {
      s += v;
      seen++;
    }
  }
  return seen ? s : undefined;
}
const lastYearOf = (ds: Dataset, id: string) => Math.max(0, ...isoList(ds).flatMap((iso) => Object.keys(ds.indicators[id]?.values?.[iso] ?? {}).map(Number)));

function climateFinanceTerms(ds: Dataset): Insight[] {
  if (!has(ds, 'climate_fin') || !has(ds, 'climate_fin_grant')) return [];
  const end = lastYearOf(ds, 'climate_fin');
  if (!end) return [];
  const rows = isoList(ds)
    .map((iso) => {
      const tot = sumWindow(ds, 'climate_fin', iso, end);
      let grants = 0;
      let energy = 0;
      for (let y = end - 2; y <= end; y++) {
        const t = value(ds, 'climate_fin', iso, y) ?? 0;
        grants += (t * (value(ds, 'climate_fin_grant', iso, y) ?? 0)) / 100;
        energy += (t * (value(ds, 'climate_fin_energy', iso, y) ?? 0)) / 100;
      }
      return tot ? { iso, tot, grant: (100 * grants) / tot, energy: (100 * energy) / tot } : null;
    })
    .filter((r): r is { iso: Iso3; tot: number; grant: number; energy: number } => Boolean(r && r.tot > 0));
  if (rows.length < 4) return [];
  const loanHeavy = rows.filter((r) => r.grant < 30).sort((a, b) => a.grant - b.grant);
  const total = rows.reduce((s, r) => s + r.tot, 0);
  const grantAll = (rows.reduce((s, r) => s + (r.tot * r.grant) / 100, 0) / total) * 100;
  const energyAll = (rows.reduce((s, r) => s + (r.tot * r.energy) / 100, 0) / total) * 100;
  return [
    {
      id: 'climate-finance-terms',
      pillar: 'climatefin',
      kind: loanHeavy.length ? 'risk' : 'finance',
      title: `${fmt(100 - grantAll, { decimals: 0 })}% of climate-related development finance to ASEAN came as loans or other non-grant instruments`,
      body:
        `In ${end - 2} to ${end}, members received commitments of about US$${fmt(total / 1000, { decimals: 1 })} billion (2024 prices) for climate-related activities, of which ${fmt(grantAll, { decimals: 0 })}% were grants and ${fmt(energyAll, { decimals: 0 })}% went to the energy sector. ` +
        (loanHeavy.length ? `Grants made up less than 30% for ${names(ds, loanHeavy.map((r) => r.iso))}, so most of ${vb(loanHeavy, 'its', 'their')} climate finance adds to debt that must be serviced. ` : '') +
        `Read this alongside the fiscal space and external debt pillars before assuming more borrowing is affordable.`,
      countries: loanHeavy.map((r) => r.iso),
      indicators: ['climate_fin', 'climate_fin_grant', 'climate_fin_energy'],
      evidence: [...rows].sort((a, b) => b.tot - a.tot).map((r) => ({ label: countryName(ds, r.iso), value: `US$${fmt(r.tot, { decimals: 0 })} m; grants ${fmt(r.grant, { decimals: 0 })}%; energy ${fmt(r.energy, { decimals: 0 })}%` })),
      focus: { view: 'map', indicator: 'climate_fin_grant', countries: loanHeavy.slice(0, 4).map((r) => r.iso) },
    },
  ];
}

function mobilisation(ds: Dataset): Insight[] {
  if (!has(ds, 'mob_ratio')) return [];
  const rows = isoList(ds)
    .map((iso) => ({ iso, l: latest(ds, 'mob_ratio', iso) }))
    .filter((r): r is { iso: Iso3; l: NonNullable<ReturnType<typeof latest>> } => Boolean(r.l))
    // Small official flows make the ratio unstable; require US$100 million over three years.
    .filter((r) => (sumWindow(ds, 'climate_fin', r.iso, r.l.year) ?? 0) >= 100);
  if (rows.length < 4) return [];
  rows.sort((a, b) => b.l.value - a.l.value);
  const med = median(rows.map((r) => r.l.value))!;
  const lead = rows.slice(0, 2);
  const low = rows.filter((r) => r.l.value < 10);
  return [
    {
      id: 'mobilisation',
      pillar: 'climatefin',
      kind: 'finance',
      title: `Official climate finance drew in a median US$${fmt(med, { decimals: 0 })} of private money per US$100`,
      body:
        `Among members receiving at least US$100 million of official climate finance over the latest three years, private climate finance mobilised by official interventions (guarantees, syndicated loans, equity funds and credit lines) was highest relative to official climate finance in ${names(ds, lead.map((r) => r.iso))} (US$${lead.map((r) => fmt(r.l.value, { decimals: 0 })).join(' and US$')} per US$100). ` +
        (low.length ? `It was below US$10 per US$100 in ${names(ds, low.map((r) => r.iso))}. ` : '') +
        `Amounts withheld for confidentiality are excluded, so the ratios are lower bounds.`,
      countries: [...lead, ...low].map((r) => r.iso),
      indicators: ['mob_ratio', 'priv_mob_climate', 'climate_fin'],
      evidence: rows.map((r) => ({ label: `${countryName(ds, r.iso)} (three years to ${r.l.year})`, value: `US$${fmt(r.l.value, { decimals: 1 })}` })),
      focus: { view: 'map', indicator: 'mob_ratio', countries: lead.map((r) => r.iso) },
    },
  ];
}

function fossilSubsidies(ds: Dataset): Insight[] {
  if (!has(ds, 'ffs_gdp')) return [];
  const rows = isoList(ds)
    .map((iso) => {
      const l = latest(ds, 'ffs_gdp', iso);
      if (!l) return null;
      const rev = value(ds, 'gg_rev', iso, l.year);
      return { iso, l, ofRevenue: rev ? (100 * l.value) / rev : undefined };
    })
    .filter((r): r is { iso: Iso3; l: NonNullable<ReturnType<typeof latest>>; ofRevenue: number | undefined } => Boolean(r))
    .sort((a, b) => b.l.value - a.l.value);
  const big = rows.filter((r) => r.l.value >= 1);
  if (!big.length) return [];
  const year = Math.max(...big.map((r) => r.l.year));
  return [
    {
      id: 'fossil-subsidies',
      pillar: 'fiscal',
      kind: 'risk',
      title: `Fossil fuel subsidies cost ${names(ds, big.map((r) => r.iso))} at least 1% of GDP`,
      body:
        `In ${year}, explicit subsidies to fossil fuels were ${big.map((r) => `${fmt(r.l.value, { decimals: 1 })}% of GDP in ${inText(ds, r.iso)}${r.ofRevenue ? ` (${fmt(r.ofRevenue, { decimals: 0 })}% of government revenue)` : ''}`).join('; ')}. ` +
        `Reform can free fiscal space for clean energy and social protection, but because poorer households spend a larger share of income on fuel and food, it works best when paired with targeted transfers.`,
      countries: big.map((r) => r.iso),
      indicators: ['ffs_gdp', 'gg_rev'],
      evidence: rows.map((r) => ({ label: `${countryName(ds, r.iso)} (${r.l.year})`, value: `${fmt(r.l.value, { decimals: 2 })}% of GDP${r.ofRevenue ? `; ${fmt(r.ofRevenue, { decimals: 1 })}% of revenue` : ''}` })),
      focus: { view: 'map', indicator: 'ffs_gdp', countries: big.map((r) => r.iso).slice(0, 4) },
    },
  ];
}

function coalPipeline(ds: Dataset): Insight[] {
  const coal = ds.static.coal;
  if (!coal) return [];
  const rows = Object.entries(coal.rows).map(([iso, r]) => ({
    iso,
    r,
    pipeline: r.construction + r.preConstruction,
    retire: Object.entries(r.retirePlanned)
      .filter(([y]) => Number(y) <= 2030)
      .reduce((s, [, v]) => s + v, 0),
  }));
  const expanding = rows.filter((x) => x.pipeline > x.retire && x.pipeline >= 500).sort((a, b) => b.pipeline - a.pipeline);
  if (!expanding.length) return [];
  const gw = (mw: number) => `${fmt(mw / 1000, { decimals: 1 })} GW`;
  return [
    {
      id: 'coal-pipeline',
      pillar: 'workers',
      kind: 'risk',
      title: `Coal capacity is still being added in ${names(ds, expanding.map((x) => x.iso))}`,
      body:
        `In the ${coal.release ?? 'latest'} Global Coal Plant Tracker, ${expanding
          .map((x) => `${inText(ds, x.iso)} had ${gw(x.r.construction)} under construction and ${gw(x.r.preConstruction)} in planning, against ${gw(x.retire)} of planned retirements by 2030`)
          .join('; ')}. ` +
        `New plants lock in emissions and jobs for decades; just transition planning for coal regions is easier before construction than after.`,
      countries: expanding.map((x) => x.iso),
      indicators: ['coal_elec'],
      evidence: [...rows]
        .sort((a, b) => b.r.operating - a.r.operating)
        .map((x) => ({ label: countryName(ds, x.iso), value: `operating ${gw(x.r.operating)}; construction ${gw(x.r.construction)}; planned ${gw(x.r.preConstruction)}; retiring by 2030 ${gw(x.retire)}` })),
      focus: { view: 'map', indicator: 'coal_elec', countries: expanding.map((x) => x.iso).slice(0, 4) },
    },
  ];
}

function energyMixRule(ds: Dataset): Insight[] {
  const e = ds.static.energy;
  if (!e) return [];
  const rows = isoList(ds)
    .map((iso) => {
      const ys = Object.keys(e.tes[iso] ?? {}).sort();
      const y = ys[ys.length - 1];
      if (!y) return null;
      const r = e.tes[iso][y];
      return { iso, y, fossil: r.coal + r.oil + r.gas, coal: r.coal, clean: r.hydro + r.geothermal + r.solar + r.wind + r.nuclear + r.other };
    })
    .filter((r): r is { iso: Iso3; y: string; fossil: number; coal: number; clean: number } => Boolean(r));
  if (rows.length < 6) return [];
  rows.sort((a, b) => b.fossil - a.fossil);
  const med = median(rows.map((r) => r.fossil))!;
  const coalHeavy = rows.filter((r) => r.coal >= 30).sort((a, b) => b.coal - a.coal);
  const cleanLead = [...rows].sort((a, b) => b.clean - a.clean).slice(0, 2);
  return [
    {
      id: 'energy-mix',
      pillar: 'transition',
      kind: 'note',
      title: `Fossil fuels supply a median ${fmt(med, { decimals: 0 })}% of ASEAN members' energy`,
      body:
        `On UN energy statistics for the latest year, coal, oil and gas made up between ${fmt(rows[rows.length - 1].fossil, { decimals: 0 })}% and ${fmt(rows[0].fossil, { decimals: 0 })}% of total energy supply. ` +
        (coalHeavy.length ? `Coal alone supplied 30% or more in ${names(ds, coalHeavy.map((r) => r.iso))}. ` : '') +
        `Hydro, geothermal, solar and wind contributed most in ${names(ds, cleanLead.map((r) => r.iso))} (${cleanLead.map((r) => `${fmt(r.clean, { decimals: 0 })}%`).join(' and ')}). Bioenergy, much of it traditional biomass for cooking, is shown separately.`,
      countries: coalHeavy.map((r) => r.iso),
      indicators: ['re_elec', 're_share'],
      evidence: rows.map((r) => ({ label: `${countryName(ds, r.iso)} (${r.y})`, value: `fossil ${fmt(r.fossil, { decimals: 0 })}%; coal ${fmt(r.coal, { decimals: 0 })}%; hydro, geothermal, solar, wind ${fmt(r.clean, { decimals: 0 })}%` })),
      focus: { view: 'map', indicator: 're_elec', countries: cleanLead.map((r) => r.iso) },
    },
  ];
}

export const RULES = [
  transitionLeaders,
  decarbonisation,
  decoupling,
  investmentGap,
  cleanFinance,
  accessGap,
  coalExposure,
  protectionGap,
  youthAndGender,
  planetaryPressure,
  energyPoverty,
  fiscalSpace,
  debtStructure,
  financialDepth,
  graduation,
  odaReliance,
  climateFinanceTerms,
  mobilisation,
  fossilSubsidies,
  coalPipeline,
  energyMixRule,
  dataRecency,
];

export function generateInsights(ds: Dataset): Insight[] {
  const out: Insight[] = [];
  for (const rule of RULES) {
    try {
      out.push(...rule(ds).map((i) => ({ ...i, title: tidy(i.title), body: tidy(i.body) })));
    } catch (e) {
      // A failing rule must never take the dashboard down; it is simply omitted.
      console.warn(`Insight rule ${rule.name} failed`, e);
    }
  }
  return out;
}
