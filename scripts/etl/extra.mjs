// Additional sources for the ASEAN Green and Just Transition Monitor.
//
//   oecd_crdf  OECD climate-related development finance, recipient perspective
//              (yearly Excel files, activity level)
//   oecd_mob   OECD amounts mobilised from the private sector by official
//              development finance, recipient perspective (bulk Excel file)
//   ffs        OECD and IISD Fossil Fuel Subsidy Tracker (global Excel file)
//   imf_cid    IMF Climate Change Indicators Dashboard, green debt (CSV)
//   gem_coal   Global Energy Monitor, Global Coal Plant Tracker summary tables
//   unsd       UN Statistics Division energy statistics (SDMX API), used for
//              the total energy supply and electricity generation mix
//
// Each fetcher downloads once and is cached, so several indicators can be
// built from one file. Values are aggregated per member and year; nothing is
// imputed except where noted (green bond issuance: a member with no recorded
// issuance in a year is recorded as zero, because the IMF table lists issuers only).
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';

const UA = { 'User-Agent': 'asean-transition-monitor-etl/1.0 (+https://github.com/)', Accept: '*/*' };

export function makeExtra({ CONFIG, ISO, put, parseCSV, log }) {
  const byName = (name) => {
    const n = String(name || '').toLowerCase();
    if (/brunei/.test(n)) return 'BRN';
    if (/cambodia/.test(n)) return 'KHM';
    if (/indonesia/.test(n)) return 'IDN';
    if (/^lao|laos/.test(n)) return 'LAO';
    if (/malaysia/.test(n)) return 'MYS';
    if (/myanmar|burma/.test(n)) return 'MMR';
    if (/philippines/.test(n)) return 'PHL';
    if (/singapore/.test(n)) return 'SGP';
    if (/thailand/.test(n)) return 'THA';
    if (/timor/.test(n)) return 'TLS';
    if (/viet ?nam/.test(n)) return 'VNM';
    return null;
  };

  async function download(url, { as = 'buffer', timeout = 300_000, headers = {}, tries = 3 } = {}) {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetch(url, { headers: { ...UA, ...headers }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (as === 'text') return await res.text();
        return Buffer.from(await res.arrayBuffer());
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
      }
    }
    throw new Error(`${url} -> ${last?.message}`);
  }

  const cell = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object') {
      if (v instanceof Date) return v.toISOString();
      if ('result' in v) return v.result;
      if ('richText' in v) return v.richText.map((t) => t.text).join('');
      if ('text' in v) return v.text;
      return null;
    }
    return v;
  };

  /** Streams every row of every sheet whose header row contains all `required` columns. */
  async function eachRow(buf, required, onRow) {
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buf), {
      sharedStrings: 'cache',
      hyperlinks: 'ignore',
      styles: 'ignore',
      worksheets: 'emit',
      entries: 'emit',
    });
    let used = 0;
    for await (const ws of reader) {
      let header = null;
      let scanned = 0;
      for await (const row of ws) {
        const vals = (row.values || []).slice(1).map(cell);
        if (!header) {
          if (required.every((r) => vals.some((h) => String(h ?? '').trim() === r))) {
            header = vals.map((h) => String(h ?? '').trim());
            used++;
          } else if (++scanned > 15) break;
          continue;
        }
        const rec = {};
        header.forEach((h, i) => (rec[h] = vals[i]));
        onRow(rec);
      }
    }
    if (!used) throw new Error(`no sheet with columns ${required.join(', ')}`);
  }

  const num = (v) => {
    if (v === null || v === undefined || v === '') return NaN;
    return typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  };
  const add = (acc, iso, year, key, v) => {
    if (!iso || !Number.isFinite(v)) return;
    const k = `${iso}|${year}`;
    (acc[k] ??= { iso, year: Number(year) })[key] = ((acc[k][key] ?? 0) + v);
  };

  /* ---------------- OECD climate-related development finance ---------------- */
  const CRDF_DIR = 'https://webfs.oecd.org/climate/RecipientPerspective/';
  const CRDF_TOTAL_K = 'Climate-related development finance - Commitment - 2024 USD thousand';
  const CRDF_TOTAL_CUR = 'Climate-related development finance - Commitment - Current USD thousand';
  let crdf = null;
  async function loadCRDF() {
    if (crdf) return crdf;
    const listing = await download(CRDF_DIR, { as: 'text', timeout: 60_000 });
    const files = [...new Set([...listing.matchAll(/CRDF-RP_(\d{4})(?:-(\d{4}))?\.xlsx/g)].map((m) => m[0]))].filter((f) => {
      const y = Number(f.match(/_(\d{4})/)[1]);
      return y >= 2012 && !/all_years/.test(f);
    });
    if (files.length < 5) throw new Error(`CRDF: only ${files.length} yearly files listed`);
    const acc = {};
    for (const f of files.sort()) {
      const buf = await download(CRDF_DIR + f);
      // Column names carry the constant-price base year; find it from the header.
      let constCol = null;
      await eachRow(buf, ['Year', 'Recipient Name', 'Sector Name'], (r) => {
        if (!constCol) constCol = Object.keys(r).find((k) => /^Climate-related development finance - Commitment - \d{4} USD thousand$/.test(k)) || CRDF_TOTAL_K;
        const iso = byName(r['Recipient Name']);
        if (!iso) return;
        const v = num(r[constCol]);
        const cur = num(r[CRDF_TOTAL_CUR]);
        add(acc, iso, r.Year, 'total', v);
        add(acc, iso, r.Year, 'cur', cur);
        if (/^II\.3/.test(String(r['Sector Name'] ?? ''))) add(acc, iso, r.Year, 'energy', v);
        if (String(r['Financial Instrument code'] ?? '').startsWith('1')) add(acc, iso, r.Year, 'grant', v);
      });
      log(`crdf ${f} read`);
    }
    crdf = acc;
    return acc;
  }
  async function fetchCRDF(code) {
    const acc = await loadCRDF();
    const series = {};
    for (const r of Object.values(acc)) {
      const t = r.total ?? 0;
      if (code === 'total') put(series, r.iso, r.year, t / 1000);
      else if (code === 'cur') put(series, r.iso, r.year, (r.cur ?? 0) / 1000);
      else if (code === 'energy_share' && t > 0) put(series, r.iso, r.year, (100 * (r.energy ?? 0)) / t);
      else if (code === 'grant_share' && t > 0) put(series, r.iso, r.year, (100 * (r.grant ?? 0)) / t);
    }
    return { series };
  }

  /* ---------------- OECD private finance mobilised ---------------- */
  const MOB_URL =
    'https://www.oecd.org/content/dam/oecd/en/data/dashboards/mobilisation-of-private-finance-for-development/Recipient%20perspective%20-%20bulk%20file%20-%202012-2024_Dashboard.xlsx';
  let mob = null;
  async function fetchMOB(code) {
    if (!mob) {
      const buf = await download(MOB_URL);
      const acc = {};
      await eachRow(buf, ['year', 'RecipientNameE', 'total_mobilisation_defl_USDbn'], (r) => {
        const iso = byName(r.RecipientNameE);
        if (!iso) return;
        add(acc, iso, r.year, 'total', num(r.total_mobilisation_defl_USDbn));
        add(acc, iso, r.year, 'climate', num(r.total_climate_mobilisation_defl_USDbn));
        add(acc, iso, r.year, 'climate_cur', num(r.total_climate_mobilisation_USDbn));
      });
      mob = acc;
    }
    const series = {};
    const key = { total: 'total', climate: 'climate', climate_cur: 'climate_cur' }[code];
    for (const r of Object.values(mob)) if (r[key] !== undefined) put(series, r.iso, r.year, r[key] * 1000);
    return { series };
  }

  /* ---------------- OECD and IISD Fossil Fuel Subsidy Tracker ---------------- */
  const FFS_HOME = 'https://fossilfuelsubsidytracker.org/';
  const FFS_FALLBACK = 'https://fossilfuelsubsidytracker.org/wp-content/uploads/2026/01/FossilFuelSubsidiesTracker_GlobalData_2024_Update_Jan26.xlsx';
  let ffs = null;
  async function fetchFFS() {
    if (!ffs) {
      let url = FFS_FALLBACK;
      try {
        const home = await download(FFS_HOME, { as: 'text', timeout: 60_000 });
        const m = home.match(/https:\/\/fossilfuelsubsidytracker\.org\/wp-content\/uploads\/[^"']*GlobalData[^"']*\.xlsx/i);
        if (m) url = m[0];
      } catch (e) {
        log(`ffs: home page unreachable, using known file (${e.message})`);
      }
      const buf = await download(url);
      const acc = {};
      await eachRow(buf, ['ISO', 'Year', 'USD, nominal'], (r) => {
        if (!ISO.includes(r.ISO)) return;
        add(acc, r.ISO, r.Year, 'usd', num(r['USD, nominal']));
      });
      ffs = { acc, url };
    }
    const series = {};
    for (const r of Object.values(ffs.acc)) put(series, r.iso, r.year, r.usd / 1e6);
    return { series, sourceLabel: ffs.url };
  }

  /* ---------------- IMF Climate Change Indicators Dashboard: green debt ---------------- */
  const CID_GREEN = 'https://opendata.arcgis.com/datasets/8e2772e0b65f4e33a80183ce9583d062_0.csv';
  let cid = null;
  async function fetchCID(code) {
    if (!cid) {
      const text = await download(CID_GREEN, { as: 'text', timeout: 120_000 });
      const [header, ...rows] = parseCSV(text.replace(/^﻿/, ''));
      const iIso = header.indexOf('ISO3');
      const iInd = header.indexOf('Indicator');
      if (iIso < 0 || iInd < 0) throw new Error('IMF CID: unexpected columns');
      const years = header.map((h, i) => [h.match(/^F(\d{4})$/)?.[1], i]).filter(([y]) => y);
      cid = { rows: rows.filter((r) => ISO.includes(r[iIso])), iIso, iInd, years };
    }
    const want = {
      green: /^Green Bond Issuances by Country$/,
      gss: /^(Green|Social|Sustainability|Sustainability Linked) Bond Issuances by Country$/,
    }[code];
    const series = {};
    const maxYear = Math.max(...cid.years.map(([y]) => Number(y)));
    const minYear = 2014;
    // The table lists issuers only: record zero for members without issuance.
    for (const iso of ISO) for (let y = minYear; y <= maxYear; y++) put(series, iso, y, 0);
    for (const r of cid.rows) {
      if (!want.test(r[cid.iInd])) continue;
      for (const [y, i] of cid.years) {
        const v = num(r[i]);
        if (Number.isFinite(v) && Number(y) >= minYear) series[r[cid.iIso]][y] = (series[r[cid.iIso]][y] ?? 0) + v;
      }
    }
    return { series };
  }

  /* ---------------- Global Energy Monitor: coal fleet and pipeline ---------------- */
  const GEM_STATUS = 'https://docs.google.com/spreadsheets/d/1_6AkrRZOn3ZXhSV9O6tZnX-m7aJsfG9HiQ_iEqBkbW8/gviz/tq?tqx=out:csv';
  const GEM_RETIRE = 'https://docs.google.com/spreadsheets/d/1E82_2I7n4__oFzDTWVuZwPstfr1tk4jn1kFw4E_gf5w/gviz/tq?tqx=out:csv&gid=780397480';
  function gemTable(text) {
    const rows = parseCSV(text);
    let labels = null;
    const out = {};
    let release = null;
    for (const r of rows) {
      const first = r[0] ?? '';
      release ??= first.match(/updated ([A-Z][a-z]+ \d{4})/)?.[1] ?? null;
      if ((!labels || !labels.length) && /Country\/Area\s*$/.test(first) && r.slice(1).some((s) => s.trim())) {
        labels = r.slice(1).map((s) => s.trim());
        continue;
      }
      if (!labels) continue;
      const iso = byName(first);
      if (!iso) continue;
      out[iso] = {};
      labels.forEach((l, i) => {
        if (!l) return;
        const v = num(r[i + 1]);
        if (Number.isFinite(v)) out[iso][l] = v;
      });
    }
    if (!labels) throw new Error('GEM: header row not found');
    return { out, release };
  }
  async function fetchCoalFleet() {
    const [a, b] = await Promise.all([download(GEM_STATUS, { as: 'text', timeout: 60_000 }), download(GEM_RETIRE, { as: 'text', timeout: 60_000 })]);
    const status = gemTable(a);
    const retire = gemTable(b);
    const rows = {};
    for (const iso of ISO) {
      const s = status.out[iso];
      const t = retire.out[iso];
      if (!s && !t) continue;
      const g = (k) => s?.[k] ?? 0;
      rows[iso] = {
        operating: g('Operating'),
        construction: g('Construction'),
        preConstruction: g('Announced') + g('Pre-permit') + g('Permitted'),
        shelved: g('Shelved'),
        cancelled: g('Cancelled (since 2010)'),
        retired: g('Retired (since 2000)'),
        mothballed: g('Mothballed'),
        retirePlanned: t ? Object.fromEntries(Object.entries(t).filter(([k]) => /^\d{4}$/.test(k))) : {},
        retireTotal: t?.Total ?? 0,
      };
    }
    if (Object.keys(rows).length < 5) throw new Error(`GEM: only ${Object.keys(rows).length} members found`);
    return {
      source: 'Global Energy Monitor, Global Coal Plant Tracker',
      release: status.release ?? retire.release,
      sourceUrl: 'https://globalenergymonitor.org/projects/global-coal-plant-tracker/',
      unit: 'MW',
      note: 'Units of 30 MW and above. Pre-construction is announced, pre-permit and permitted capacity. Members not listed have no coal-fired units in the tracker.',
      rows,
    };
  }

  /* ---------------- UNSD energy statistics: supply and electricity mix ---------------- */
  const UNSD_API = 'https://data.un.org/legacy/ws/rest/data/UNSD,DF_UNDATA_ENERGY,1.2';
  const SECONDARY = /^(03|1200|46|5160)/; // transformation outputs: count net trade only
  const group = (c) => {
    if (/^0[123]|^1[12]/.test(c)) return 'coal';
    if (/^2000|^4/.test(c)) return 'oil';
    if (c === '3000') return 'gas';
    if (/^5|^6/.test(c)) return 'bioenergy';
    if (c === 'DG') return 'geothermal';
    if (c === 'DS') return 'solar';
    return null;
  };
  /** One member's energy records as {c, t, y, v, cf}; tries the documented CSV, the CSV media type, then SDMX-ML. */
  async function unsdRecords(area, firstYear) {
    const key = `A.${area}..GA+01+03+04/ALL/?startPeriod=${firstYear}`;
    const root = 'https://data.un.org/ws/rest/data/UNSD,DF_UNDATA_ENERGY,1.2';
    const attempts = [
      ['csv', `${root}/${key}&format=csv`, {}],
      ['csv', `${UNSD_API}/${key}`, { Accept: 'application/vnd.sdmx.data+csv;version=1.0.0' }],
      ['xml', `${root}/${key}`, { Accept: 'application/vnd.sdmx.genericdata+xml;version=2.1' }],
    ];
    const errors = [];
    for (const [kind, url, headers] of attempts) {
      try {
        const text = await download(url, { as: 'text', timeout: 120_000, headers, tries: 2 });
        if (kind === 'csv' && !text.trimStart().startsWith('<')) {
          const [header, ...rows] = parseCSV(text);
          const col = (n) => header.indexOf(n);
          const [cC, cT, cY, cV, cF] = ['COMMODITY', 'TRANSACTION', 'TIME_PERIOD', 'OBS_VALUE', 'CONVERSION_FACTOR'].map(col);
          if ([cC, cT, cY, cV].some((x) => x < 0)) throw new Error('unexpected columns');
          return rows.map((r) => ({ c: r[cC], t: r[cT], y: r[cY], v: num(r[cV]), cf: num(r[cF]) }));
        }
        const out = [];
        for (const s of text.matchAll(/<generic:Series>([\s\S]*?)<\/generic:Series>/g)) {
          const keyPart = s[1].match(/<generic:SeriesKey>([\s\S]*?)<\/generic:SeriesKey>/)?.[1] ?? '';
          const dim = Object.fromEntries([...keyPart.matchAll(/id="(\w+)" value="([^"]*)"/g)].map((m) => [m[1], m[2]]));
          for (const o of s[1].matchAll(/<generic:Obs>([\s\S]*?)<\/generic:Obs>/g)) {
            const y = o[1].match(/<generic:ObsDimension id="TIME_PERIOD" value="(\d{4})"/)?.[1];
            const v = num(o[1].match(/<generic:ObsValue value="([^"]*)"/)?.[1]);
            const cf = num(o[1].match(/id="CONVERSION_FACTOR" value="([^"]*)"/)?.[1]);
            if (y) out.push({ c: dim.COMMODITY, t: dim.TRANSACTION, y, v, cf });
          }
        }
        if (!out.length) throw new Error('no observations in SDMX-ML');
        return out;
      } catch (e) {
        errors.push(`${kind}: ${String(e.message).replace(/https?:\/\/\S+ -> /, '')}`);
      }
    }
    throw new Error(errors.join('; '));
  }

  async function fetchEnergyMix() {
    const tes = {};
    const elec = {};
    const net = {};
    const failed = [];
    const firstYear = 2000;
    for (const ct of CONFIG.countries) {
      const area = String(ct.m49).padStart(3, '0');
      let records;
      try {
        records = await unsdRecords(area, firstYear);
      } catch (e) {
        failed.push(`${ct.iso3} (${e.message})`);
        log(`unsd ${ct.iso3} FAILED ${e.message}`);
        continue;
      }
      const byYear = {};
      for (const r of records) {
        const y = r.y;
        const v = r.v;
        if (!Number.isFinite(v)) continue;
        const tj = v * (r.cf || 1);
        const rec = (byYear[y] ??= { GA: {}, P: {}, IM: 0, EX: 0, gwh: {} });
        const c = r.c;
        const t = r.t;
        if (t === 'GA') rec.GA[c] = tj;
        else if (t === '01') {
          rec.P[c] = tj;
          if (c.startsWith('7000')) rec.gwh[c] = v;
        } else if (c === '7000' && t === '03') rec.IM += tj;
        else if (c === '7000' && t === '04') rec.EX += tj;
      }
      const counts = Object.values(byYear).map((r) => Object.keys(r.GA).length).sort((a, b) => a - b);
      const typical = counts[Math.floor(counts.length / 2)] || 0;
      for (const [y, r] of Object.entries(byYear)) {
        // Total energy supply by source, terajoules.
        if (Object.keys(r.GA).length >= Math.max(3, 0.8 * typical)) {
          const g = { coal: 0, oil: 0, gas: 0, bioenergy: 0, hydro: 0, geothermal: 0, solar: 0, wind: 0, nuclear: 0, other: 0 };
          for (const [c, v] of Object.entries(r.GA)) {
            const k = group(c);
            if (!k) continue;
            g[k] += SECONDARY.test(c) ? v - (r.P[c] ?? 0) : v;
          }
          g.hydro += r.P['7000H'] ?? 0;
          g.solar += r.P['7000S'] ?? 0;
          g.wind += r.P['7000W'] ?? 0;
          g.other += r.P['7000O'] ?? 0;
          g.nuclear += (r.P['7000N'] ?? 0) / 0.33; // physical energy content method
          const total = Object.values(g).reduce((s, x) => s + Math.max(0, x), 0);
          if (total > 0) {
            (tes[ct.iso3] ??= {})[y] = Object.fromEntries(Object.entries(g).map(([k, x]) => [k, Math.round((1000 * Math.max(0, x)) / total) / 10]));
            (tes[ct.iso3][y]).totalPJ = Math.round(total / 100) / 10;
            (net[ct.iso3] ??= {})[y] = Math.round((1000 * (r.IM - r.EX)) / total) / 10;
          }
        }
        // Electricity generation by source, gigawatt-hours.
        const tot = r.gwh['7000'];
        if (tot > 0) {
          const e = {
            hydro: r.gwh['7000H'] ?? 0,
            geothermal: r.gwh['7000G'] ?? 0,
            solar: r.gwh['7000S'] ?? 0,
            wind: r.gwh['7000W'] ?? 0,
            nuclear: r.gwh['7000N'] ?? 0,
            other: r.gwh['7000O'] ?? 0,
          };
          const nonComb = Object.values(e).reduce((s, x) => s + x, 0);
          e.combustible = Math.max(0, tot - nonComb);
          (elec[ct.iso3] ??= {})[y] = { ...Object.fromEntries(Object.entries(e).map(([k, x]) => [k, Math.round((1000 * x) / tot) / 10])), totalTWh: Math.round(tot / 100) / 10 };
        }
      }
      // Drop incomplete recent years: a total below half the highest earlier total
      // means the year has only partial reporting so far.
      for (const [store, field] of [
        [tes, 'totalPJ'],
        [elec, 'totalTWh'],
      ]) {
        const ys = Object.keys(store[ct.iso3] ?? {}).sort();
        let peak = 0;
        for (const y of ys) {
          const tot = store[ct.iso3][y][field];
          if (peak && tot < 0.5 * peak) {
            delete store[ct.iso3][y];
            if (store === tes) delete net[ct.iso3]?.[y];
            continue;
          }
          peak = Math.max(peak, tot);
        }
      }
      log(`unsd ${ct.iso3}: ${Object.keys(tes[ct.iso3] ?? {}).length} supply years, ${Object.keys(elec[ct.iso3] ?? {}).length} electricity years`);
    }
    if (Object.keys(tes).length < 8) throw new Error(`UNSD: supply mix for only ${Object.keys(tes).length} members. ${failed.join(' | ')}`.slice(0, 900));
    return {
      source: 'UN Statistics Division, Energy Statistics Database (SDMX dataflow DF_UNDATA_ENERGY)',
      sourceUrl: 'https://unstats.un.org/unsd/energystats/api/',
      dataUrl: 'https://data.un.org/Data.aspx?d=EDATA&f=cmID%3aEL',
      note:
        'Total energy supply is built from the UNSD commodity data: primary products at their total energy supply, secondary products (oil and coal products, charcoal) at net trade only, and hydro, solar and wind electricity at their output (physical energy content method); geothermal includes heat used to generate power. Shares exclude net electricity trade, which is reported separately. Electricity generation is gross production; combustible fuels include coal, oil, gas and bioenergy.',
      missing: failed.map((f) => f.slice(0, 3)),
      tes,
      netElectricityTrade: net,
      electricity: elec,
    };
  }

  const FETCHERS = { oecd_crdf: fetchCRDF, oecd_mob: fetchMOB, ffs: fetchFFS, imf_cid: fetchCID };
  return { FETCHERS, fetchCoalFleet, fetchEnergyMix };
}
