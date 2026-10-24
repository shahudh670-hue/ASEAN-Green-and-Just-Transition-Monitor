import { useEffect, useRef, useState } from 'react';
import { meta, visibleIndicators } from '../lib/data';
import { focusColour, useApp } from '../lib/context';
import { MAX_FOCUS } from '../lib/theme';

export function usePlayer(years: number[], current: number | undefined, onYear: (y: number) => void, ms = 700) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef({ years, current, onYear });
  ref.current = { years, current, onYear };
  useEffect(() => {
    if (!playing) return;
    const { years: ys, current: cur, onYear: go } = ref.current;
    if (cur === undefined || cur >= ys[ys.length - 1]) go(ys[0]);
    const t = setInterval(() => {
      const { years: y2, current: c2, onYear: g2 } = ref.current;
      const i = y2.indexOf(c2 ?? y2[0]);
      if (i < 0 || i >= y2.length - 1) {
        setPlaying(false);
        return;
      }
      g2(y2[i + 1]);
    }, ms);
    return () => clearInterval(t);
  }, [playing, ms]);
  return { playing, toggle: () => setPlaying((p) => !p), stop: () => setPlaying(false) };
}

export function YearSlider({ years, year, onYear, label = 'Year' }: { years: number[]; year: number | undefined; onYear: (y: number) => void; label?: string }) {
  const { playing, toggle } = usePlayer(years, year, onYear);
  if (!years.length || year === undefined) return null;
  const idx = Math.max(0, years.indexOf(year));
  return (
    <div className="flex min-w-[240px] flex-1 items-center gap-3">
      <button className="btn btn-primary w-[78px] justify-center" onClick={toggle} aria-label={playing ? 'Pause animation' : 'Play through the years'}>
        {playing ? 'Pause' : 'Play'}
      </button>
      <label className="flex flex-1 items-center gap-3">
        <span className="sr-only">{label}</span>
        <input
          type="range"
          className="w-full"
          min={0}
          max={years.length - 1}
          value={idx}
          onChange={(e) => onYear(years[Number(e.target.value)])}
          aria-valuetext={String(year)}
        />
        <span className="tabular w-[46px] text-right text-[17px] font-semibold text-ink">{year}</span>
      </label>
    </div>
  );
}

export function CountryPicker() {
  const c = useApp();
  const full = c.state.focus.length >= MAX_FOCUS;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Countries to highlight">
      <span className="eyebrow mr-1">Highlight up to {MAX_FOCUS}</span>
      {c.ds.meta.countries.map((ct) => {
        const col = focusColour(c, ct.iso3);
        const on = Boolean(col);
        return (
          <button
            key={ct.iso3}
            className="chip chip-focus"
            aria-pressed={on}
            disabled={!on && full}
            title={!on && full ? `Clear a country first (maximum ${MAX_FOCUS})` : `Highlight ${ct.name}`}
            onClick={() => c.dispatch({ type: 'toggleFocus', iso: ct.iso3 })}
            onMouseEnter={() => c.setHovered(ct.iso3)}
            onMouseLeave={() => c.setHovered(null)}
            style={on ? { borderColor: col, color: 'var(--ink)', fontWeight: 600 } : !on && full ? { opacity: 0.45 } : undefined}
          >
            {on && <span aria-hidden style={{ width: 14, height: 3, borderRadius: 2, background: col, display: 'inline-block' }} />}
            {ct.short}
          </button>
        );
      })}
      {c.state.focus.length > 0 && (
        <button className="btn" onClick={() => c.dispatch({ type: 'clearFocus' })}>
          Clear
        </button>
      )}
    </div>
  );
}

export default function Controls({ year, years }: { year: number | undefined; years: number[] }) {
  const c = useApp();
  const inds = visibleIndicators(c.ds, c.state.pillar);
  const m = meta(c.ds, c.state.indicator);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Pillars">
        {c.ds.meta.pillars.map((p) => (
          <button
            key={p.id}
            role="tab"
            className="chip"
            aria-selected={c.state.pillar === p.id}
            onClick={() => {
              const first = visibleIndicators(c.ds, p.id)[0];
              c.set({ pillar: p.id, indicator: first?.id ?? c.state.indicator, year: null });
            }}
          >
            {p.short}
          </button>
        ))}
      </div>
      <div className="card flex flex-wrap items-center gap-x-5 gap-y-3 p-3">
        <label className="flex min-w-[260px] flex-1 flex-col gap-1">
          <span className="eyebrow">Indicator</span>
          <select className="select" value={c.state.indicator} onChange={(e) => c.set({ indicator: e.target.value, year: null })}>
            {inds.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex min-w-[300px] flex-[2] flex-col gap-1">
          <span className="eyebrow">Year</span>
          <YearSlider years={years} year={year} onYear={(y) => c.set({ year: y })} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="eyebrow">ASEAN figure</span>
          <select className="select" value={c.state.agg} onChange={(e) => c.set({ agg: e.target.value as typeof c.state.agg })}>
            <option value="weighted">{m.agg === 'sum' ? 'Regional total' : m.agg === 'none' ? 'Median' : `${m.agg === 'gdp' ? 'GDP' : 'Population'}-weighted average`}</option>
            <option value="median">Median member</option>
            <option value="off">Hide</option>
          </select>
        </label>
        {m.projections && (
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" checked={c.state.proj} onChange={(e) => c.set({ proj: e.target.checked })} />
            Show IMF projections
          </label>
        )}
      </div>
      <CountryPicker />
      {years.length === 0 && <p className="text-sm text-risk">No data is available for this indicator in the current build.</p>}
    </div>
  );
}
