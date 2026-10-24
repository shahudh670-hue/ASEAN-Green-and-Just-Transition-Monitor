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
const tidy = (t: string) => t.replace(/(^|[.;:]\s+|\(\s*)the Philippines/g, (_m, p) => `${p}The Philippines`);
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
  const aggEnd = aggregate(ds, 'co2_intensity', end);
  const aggStart = aggregate(ds, 'co2_intensity', end - SPAN);
  const regional = aggEnd && aggStart ? cagr(aggStart.value, aggEnd.value, SPAN) : undefined;
  const rising = rows.filter((r) => r.ch.cagr! > 0);
  const fastest = rows.slice(0, 2);
  return [
    {
      id: 'co2-pace',
      pillar: 'transition',
      kind: rising.length ? 'risk' : 'progress',
      title: regional !== undefined ? `Regional carbon intensity is changing by ${fmtSigned(regional, 1, '%')} a year` : 'Carbon intensity of growth',
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
      pillar: 'transition',
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

export const RULES = [
  transitionLeaders,
  decarbonisation,
  decoupling,
  investmentGap,
  cleanFinance,
  accessGap,
  planetaryPressure,
  energyPoverty,
  fiscalSpace,
  debtStructure,
  financialDepth,
  graduation,
  odaReliance,
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
