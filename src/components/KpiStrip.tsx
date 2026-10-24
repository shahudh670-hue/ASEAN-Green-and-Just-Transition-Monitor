import { aggregate, aggregateSeries, defaultYear, meta, visibleIndicators } from '../lib/data';
import { useApp } from '../lib/context';
import { fmt, fmtSigned } from '../lib/format';
import { SourceLine, refOf } from './ChartCard';
import type { IndicatorMeta } from '../lib/types';

export function Sparkline({ points, colour, width = 120, height = 32, label }: { points: [number, number][]; colour: string; width?: number; height?: number; label: string }) {
  if (points.length < 2) return <span className="text-xs text-ink-3">n/a</span>;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const sx = (x: number) => ((x - x0) / (x1 - x0 || 1)) * (width - 6) + 3;
  const sy = (y: number) => height - 3 - ((y - y0) / (y1 - y0 || 1)) * (height - 6);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('');
  const last = points[points.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={label}>
      <path d={d} fill="none" stroke={colour} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={sx(last[0])} cy={sy(last[1])} r={3} fill={colour} />
    </svg>
  );
}

/** Direction judged against the indicator's polarity; returned with a text label so meaning never rests on colour. */
export function judge(m: IndicatorMeta, diff: number | undefined): { tone: 'good' | 'risk' | 'flat' | 'neutral'; word: string } {
  if (diff === undefined || !Number.isFinite(diff)) return { tone: 'neutral', word: '' };
  if (Math.abs(diff) < Math.pow(10, -m.decimals) / 2) return { tone: 'flat', word: 'no change' };
  if (m.polarity === 'neutral' || !m.polarity) return { tone: 'neutral', word: diff > 0 ? 'up' : 'down' };
  const good = (m.polarity === 'higher') === diff > 0;
  return { tone: good ? 'good' : 'risk', word: good ? 'improving' : 'worsening' };
}

export function DeltaText({ m, diff, suffix }: { m: IndicatorMeta; diff: number | undefined; suffix: string }) {
  const j = judge(m, diff);
  const colour = j.tone === 'good' ? 'var(--good)' : j.tone === 'risk' ? 'var(--risk)' : 'var(--ink-2)';
  return (
    <span className="tabular text-sm" style={{ color: colour }}>
      <span aria-hidden>{diff === undefined ? '' : diff > 0 ? '▲ ' : diff < 0 ? '▼ ' : '● '}</span>
      {fmtSigned(diff, m.decimals > 2 ? 3 : m.decimals)}
      {suffix} {j.word && <span className="text-ink-3">({j.word})</span>}
    </span>
  );
}

export default function KpiStrip() {
  const c = useApp();
  const inds = visibleIndicators(c.ds, c.state.pillar).filter((i) => i.agg && i.agg !== 'none').slice(0, 4);
  if (!inds.length) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {inds.map((ind) => {
        const m = meta(c.ds, ind.id);
        const y = defaultYear(c.ds, ind.id);
        const now = y ? aggregate(c.ds, ind.id, y, 'median') : undefined;
        const then = y ? aggregate(c.ds, ind.id, y - 5, 'median') : undefined;
        const diff = now && then ? now.value - then.value : undefined;
        const spark = aggregateSeries(c.ds, ind.id, 'median').filter(([yy]) => yy >= 2000);
        const active = c.state.indicator === ind.id;
        return (
          <div
            key={ind.id}
            role="button"
            tabIndex={0}
            onClick={() => c.set({ indicator: ind.id, year: null })}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), c.set({ indicator: ind.id, year: null }))}
            className={`card flex cursor-pointer flex-col gap-1 p-4 text-left transition-shadow hover:shadow-card ${active ? 'ring-2 ring-brand' : ''}`}
            aria-pressed={active}
          >
            <span className="text-sm font-semibold text-ink-2">{m.label}</span>
            <span className="flex items-end justify-between gap-2">
              <span>
                <span className="text-[28px] font-bold leading-none text-ink">{fmt(now?.value, m)}</span>
                <span className="ml-1 text-sm text-ink-3">{m.unitShort}</span>
              </span>
              <Sparkline points={spark} colour={c.theme.series[0]} label={`ASEAN trend for ${m.label}`} />
            </span>
            <span className="text-xs text-ink-3">
              ASEAN median, {y ?? 'n/a'}
              {now ? `, ${now.n} of ${c.ds.meta.countries.length} members` : ''}
            </span>
            <DeltaText m={m} diff={diff} suffix={m.unitShort === '%' || m.unitShort?.startsWith('%') ? ' pp over 5 years' : ' over 5 years'} />
            <SourceLine className="mt-1" refs={[refOf(m)]} />
          </div>
        );
      })}
    </div>
  );
}
