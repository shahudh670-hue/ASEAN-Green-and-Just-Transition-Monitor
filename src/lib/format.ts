import type { IndicatorMeta } from './types';

const nf = (d: number) => new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmt(v: number | undefined | null, m?: Pick<IndicatorMeta, 'decimals' | 'unitShort'>, withUnit = false): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return 'n/a';
  const d = m?.decimals ?? 1;
  let s: string;
  if (Math.abs(v) >= 1e9) s = `${nf(1).format(v / 1e9)} bn`;
  else if (Math.abs(v) >= 1e6 && d === 0) s = `${nf(1).format(v / 1e6)} m`;
  else s = nf(d).format(v);
  if (withUnit && m?.unitShort) {
    const u = m.unitShort;
    return u === '%' ? `${s}%` : u.startsWith('%') ? `${s}${u}` : `${s} ${u}`;
  }
  return s;
}

export function fmtSigned(v: number | undefined, d = 1, suffix = ''): string {
  if (v === undefined || !Number.isFinite(v)) return 'n/a';
  const s = nf(d).format(Math.abs(v));
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${s}${suffix}`;
}

export function listJoin(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
