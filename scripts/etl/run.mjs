// Data pipeline for the ASEAN Green and Just Transition Monitor.
//
// Pulls every series named in config/indicators.json from its official source,
// derives composite series, attaches the static tables (MPI, income groups),
// runs reference checks and writes public/data/data.json plus a long-format CSV.
//
// Sources
//   wb    World Bank Indicators API v2 (WDI and International Debt Statistics)
//   imf   IMF DataMapper API (World Economic Outlook)
//   sdg   UN SDG Global Database API (SDG 7.a.1)
//   hdro  UNDP HDRO composite indices time series (CSV)
//
// If a source fails, the previous values for its indicators are kept from the
// existing data.json (if any) and the failure is recorded in meta.status. The
// run fails only if no data at all could be assembled.
//
// Usage: node scripts/etl/run.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONFIG = JSON.parse(readFileSync(resolve(ROOT, 'config/indicators.json'), 'utf8'));
const MPI = JSON.parse(readFileSync(resolve(ROOT, 'config/static/mpi.json'), 'utf8'));
const INCOME = JSON.parse(readFileSync(resolve(ROOT, 'config/static/income.json'), 'utf8'));
const REFS = JSON.parse(readFileSync(resolve(ROOT, 'config/reference-checks.json'), 'utf8'));
const OUT_DIR = resolve(ROOT, 'public/data');
const OUT_JSON = resolve(OUT_DIR, 'data.json');

const ISO = CONFIG.countries.map((c) => c.iso3);
const M49_TO_ISO = Object.fromEntries(CONFIG.countries.map((c) => [String(c.m49), c.iso3]));
const FIRST_YEAR = 1990;
const LAST_YEAR = new Date().getUTCFullYear() + 6;
const UA = { 'User-Agent': 'asean-transition-monitor-etl/1.0 (+https://github.com/)', Accept: 'application/json,text/csv,*/*' };

const log = (...a) => console.log('[etl]', ...a);

async function getWithRetry(url, { as = 'json', tries = 4 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return as === 'json' ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`${url} -> ${lastErr?.message}`);
}

const put = (series, iso, year, value) => {
  if (value === null || value === undefined || value === '') return;
  const v = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  if (!Number.isFinite(v)) return;
  const y = Number(year);
  if (!Number.isInteger(y) || y < FIRST_YEAR || y > LAST_YEAR) return;
  (series[iso] ??= {})[y] = v;
};

// ---------- World Bank ----------
async function fetchWB(code) {
  const series = {};
  let unit = null;
  let page = 1;
  let pages = 1;
  do {
    const url = `https://api.worldbank.org/v2/country/${ISO.join(';')}/indicator/${encodeURIComponent(code)}?format=json&date=${FIRST_YEAR}:${LAST_YEAR}&per_page=5000&page=${page}`;
    const body = await getWithRetry(url);
    if (!Array.isArray(body) || body[0]?.message) throw new Error(`WB ${code}: ${JSON.stringify(body?.[0]?.message ?? body).slice(0, 200)}`);
    pages = body[0].pages || 1;
    for (const r of body[1] || []) {
      const iso = r.countryiso3code || r.country?.id;
      if (!ISO.includes(iso)) continue;
      put(series, iso, r.date, r.value);
      if (!unit && r.indicator?.value) unit = r.indicator.value;
    }
    page += 1;
  } while (page <= pages);
  return { series, sourceLabel: unit };
}

// ---------- IMF DataMapper (WEO) ----------
async function fetchIMF(code) {
  const url = `https://www.imf.org/external/datamapper/api/v1/${code}/${ISO.join('/')}`;
  const body = await getWithRetry(url);
  const block = body?.values?.[code];
  if (!block) throw new Error(`IMF ${code}: no values block`);
  const series = {};
  for (const iso of ISO) for (const [y, v] of Object.entries(block[iso] || {})) put(series, iso, y, v);
  return { series };
}

// ---------- UN SDG Global Database ----------
async function fetchSDG(code) {
  const areas = CONFIG.countries.map((c) => `areaCode=${c.m49}`).join('&');
  const series = {};
  let page = 1;
  let totalPages = 1;
  let label = null;
  do {
    const url = `https://unstats.un.org/sdgapi/v1/sdg/Series/Data?seriesCode=${code}&${areas}&pageSize=2000&page=${page}`;
    const body = await getWithRetry(url);
    totalPages = body.totalPages || 1;
    for (const r of body.data || []) {
      const dims = r.dimensions || {};
      const tech = dims['Type of renewable technology'];
      if (tech && tech !== 'ALL') continue;
      const iso = M49_TO_ISO[String(Number(r.geoAreaCode))];
      if (!iso) continue;
      const y = Math.round(Number(r.timePeriodStart));
      // Prefer the national figure if both national and global reporting rows exist.
      const prev = series[iso]?.[y];
      if (prev !== undefined && dims['Reporting Type'] !== 'N') continue;
      put(series, iso, y, r.value);
      label ??= r.seriesDescription;
    }
    page += 1;
  } while (page <= totalPages);
  return { series, sourceLabel: label };
}

// ---------- UNDP HDRO composite indices ----------
const HDRO_CSV = 'https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv';

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

let hdroCache = null;
async function fetchHDRO(prefix) {
  if (!hdroCache) {
    const text = await getWithRetry(HDRO_CSV, { as: 'text' });
    const [header, ...body] = parseCSV(text.replace(/^﻿/, ''));
    const isoIdx = header.indexOf('iso3');
    if (isoIdx < 0) throw new Error('HDRO: no iso3 column');
    hdroCache = { header, rows: body.filter((r) => ISO.includes(r[isoIdx])), isoIdx };
  }
  const { header, rows, isoIdx } = hdroCache;
  const re = new RegExp(`^${prefix}_(\\d{4})$`);
  const series = {};
  header.forEach((h, idx) => {
    const m = h.match(re);
    if (!m) return;
    for (const r of rows) put(series, r[isoIdx], m[1], r[idx]);
  });
  return { series };
}

const FETCHERS = { wb: fetchWB, imf: fetchIMF, sdg: fetchSDG, hdro: fetchHDRO };

// ---------- derived series ----------
function ratio(num, den) {
  const out = {};
  for (const iso of ISO) for (const [y, n] of Object.entries(num?.[iso] || {})) {
    const d = den?.[iso]?.[y];
    if (d) put(out, iso, y, (n / d) * 100);
  }
  return out;
}

function shareOfTotal(abs, minReporters = 6) {
  const out = {};
  const years = new Set(ISO.flatMap((iso) => Object.keys(abs?.[iso] || {})));
  for (const y of years) {
    const vals = ISO.map((iso) => [iso, abs?.[iso]?.[y]]).filter(([, v]) => Number.isFinite(v));
    if (vals.length < minReporters) continue;
    const total = vals.reduce((s, [, v]) => s + v, 0);
    if (total <= 0) continue;
    for (const [iso, v] of vals) put(out, iso, y, (v / total) * 100);
  }
  return out;
}

// ---------- main ----------
async function main() {
  const previous = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, 'utf8')) : null;
  const indicators = {};
  const status = [];

  const fetchable = CONFIG.indicators.filter((i) => FETCHERS[i.source]);
  // Small concurrency pool keeps the public APIs comfortable.
  const queue = [...fetchable];
  async function worker() {
    while (queue.length) {
      const ind = queue.shift();
      try {
        const { series, sourceLabel } = await FETCHERS[ind.source](ind.code);
        const n = Object.values(series).reduce((s, o) => s + Object.keys(o).length, 0);
        if (n === 0) throw new Error('no observations returned');
        indicators[ind.id] = { values: series, apiLabel: sourceLabel ?? null };
        status.push({ id: ind.id, ok: true, observations: n });
        log(`${ind.id.padEnd(16)} ${ind.source.padEnd(4)} ${String(n).padStart(5)} obs`);
      } catch (e) {
        const prev = previous?.indicators?.[ind.id];
        if (prev) indicators[ind.id] = { ...prev, stale: true };
        status.push({ id: ind.id, ok: false, error: String(e.message).slice(0, 300), keptPrevious: Boolean(prev) });
        log(`${ind.id.padEnd(16)} FAILED ${e.message}${prev ? ' (kept previous values)' : ''}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);

  const v = (id) => indicators[id]?.values;
  const derived = {
    ext_ppg_share: ratio(v('aux_ext_ppg'), v('aux_ext_total')),
    ext_png_share: ratio(v('aux_ext_png'), v('aux_ext_total')),
    oda_share: shareOfTotal(v('aux_oda_usd')),
  };
  for (const [id, series] of Object.entries(derived)) {
    const n = Object.values(series).reduce((s, o) => s + Object.keys(o).length, 0);
    if (n) indicators[id] = { values: series };
    status.push({ id, ok: n > 0, observations: n, derived: true });
  }

  // Reference checks: values confirmed through the World Bank Data360 and UN
  // Data Commons connectors when the indicator set was scoped. Differences are
  // reported (sources revise data), never silently corrected.
  const checks = REFS.checks.map((c) => {
    const got = indicators[c.id]?.values?.[c.iso3]?.[c.year];
    const diff = got === undefined ? null : Math.abs(got - c.value);
    const ok = diff !== null && diff <= c.tolerance;
    return { ...c, got: got ?? null, ok };
  });
  checks.forEach((c) => log(`check ${c.ok ? 'ok  ' : 'WARN'} ${c.id} ${c.iso3} ${c.year}: expected ${c.value}, got ${c.got}`));

  // Link check: every source link shown on the site must resolve.
  const urls = [...new Set([...CONFIG.indicators.map((i) => i.sourceUrl), MPI.sourceUrl, MPI.tableUrl, INCOME.sourceUrl])];
  const links = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(45_000) });
        return { url, status: res.status, ok: res.ok };
      } catch (e) {
        return { url, status: 0, ok: false, error: String(e.message).slice(0, 120) };
      }
    }),
  );
  links.forEach((l) => log(`link ${l.ok ? 'ok  ' : 'FAIL'} ${l.status} ${l.url}`));

  const total = Object.values(indicators).reduce((s, i) => s + Object.values(i.values || {}).reduce((t, o) => t + Object.keys(o).length, 0), 0);
  if (total === 0) throw new Error('No data assembled from any source.');

  const out = {
    meta: {
      title: 'ASEAN Green and Just Transition Monitor',
      generatedAt: new Date().toISOString(),
      status,
      checks,
      links,
      countries: CONFIG.countries,
      pillars: CONFIG.pillars,
    },
    catalogue: CONFIG.indicators,
    indicators,
    static: { mpi: MPI, income: INCOME },
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSON, JSON.stringify(out));

  const lines = ['indicator_id,indicator,unit,iso3,country,year,value,source'];
  const names = Object.fromEntries(CONFIG.countries.map((c) => [c.iso3, c.name]));
  for (const ind of CONFIG.indicators) {
    const series = indicators[ind.id]?.values || {};
    for (const iso of ISO) for (const [y, val] of Object.entries(series[iso] || {})) {
      lines.push([ind.id, `"${ind.label}"`, `"${ind.unit}"`, iso, `"${names[iso]}"`, y, val, `"${ind.sourceName}"`].join(','));
    }
  }
  writeFileSync(resolve(OUT_DIR, 'asean-transition-monitor-data.csv'), lines.join('\n'));
  log(`wrote ${total} observations; ${status.filter((s) => !s.ok).length} source failures; ${checks.filter((c) => !c.ok).length} check warnings`);
}

main().catch((e) => {
  console.error('[etl] fatal', e);
  process.exit(1);
});
