import { useCallback, useEffect, useReducer } from 'react';
import { MAX_FOCUS } from './theme';

export type Tab = 'overview' | 'explorer' | 'insights' | 'countries' | 'methods';
export type Agg = 'weighted' | 'median' | 'off';
export type SizeBy = 'pop' | 'gdp' | 'none';

export interface FocusEntry {
  iso: string;
  slot: number;
}

export interface AppState {
  tab: Tab;
  pillar: string;
  indicator: string;
  year: number | null;
  focus: FocusEntry[];
  agg: Agg;
  rebase: boolean;
  proj: boolean;
  from: number;
  ex: { x: string; y: string; size: SizeBy; logx: boolean; logy: boolean; trails: boolean; year: number | null };
  country: string;
}

export const initialState: AppState = {
  tab: 'overview',
  pillar: 'transition',
  indicator: 're_share',
  year: null,
  focus: [],
  agg: 'weighted',
  rebase: false,
  proj: false,
  from: 2000,
  ex: { x: 'gdppc_ppp', y: 'co2_intensity', size: 'pop', logx: true, logy: false, trails: false, year: null },
  country: 'PHL',
};

export type Action =
  | { type: 'set'; patch: Partial<AppState> }
  | { type: 'ex'; patch: Partial<AppState['ex']> }
  | { type: 'toggleFocus'; iso: string }
  | { type: 'setFocus'; isos: string[] }
  | { type: 'clearFocus' };

function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'set':
      return { ...s, ...a.patch };
    case 'ex':
      return { ...s, ex: { ...s.ex, ...a.patch } };
    case 'toggleFocus': {
      if (s.focus.some((f) => f.iso === a.iso)) return { ...s, focus: s.focus.filter((f) => f.iso !== a.iso) };
      if (s.focus.length >= MAX_FOCUS) return s;
      // Colour follows the country: take the lowest free slot so existing
      // selections never change colour when another is added or removed.
      const used = new Set(s.focus.map((f) => f.slot));
      const slot = [0, 1, 2, 3].find((i) => !used.has(i)) ?? 0;
      return { ...s, focus: [...s.focus, { iso: a.iso, slot }] };
    }
    case 'setFocus':
      return { ...s, focus: a.isos.slice(0, MAX_FOCUS).map((iso, slot) => ({ iso, slot })) };
    case 'clearFocus':
      return { ...s, focus: [] };
  }
}

function encode(s: AppState): string {
  const p = new URLSearchParams();
  p.set('t', s.tab);
  p.set('p', s.pillar);
  p.set('i', s.indicator);
  if (s.year) p.set('y', String(s.year));
  if (s.focus.length) p.set('f', s.focus.map((f) => `${f.iso}:${f.slot}`).join(','));
  if (s.agg !== 'weighted') p.set('a', s.agg);
  if (s.rebase) p.set('r', '1');
  if (s.proj) p.set('pr', '1');
  if (s.from !== 2000) p.set('fr', String(s.from));
  p.set('x', s.ex.x);
  p.set('yv', s.ex.y);
  if (s.ex.size !== 'pop') p.set('sz', s.ex.size);
  if (!s.ex.logx) p.set('lx', '0');
  if (s.ex.logy) p.set('ly', '1');
  if (s.ex.trails) p.set('tr', '1');
  if (s.ex.year) p.set('ey', String(s.ex.year));
  p.set('c', s.country);
  return p.toString();
}

function decode(hash: string): Partial<AppState> {
  const p = new URLSearchParams(hash.replace(/^#/, ''));
  if (![...p.keys()].length) return {};
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : null);
  const focus = (p.get('f') || '')
    .split(',')
    .filter(Boolean)
    .map((t) => {
      const [iso, slot] = t.split(':');
      return { iso, slot: Number(slot) || 0 };
    })
    .slice(0, MAX_FOCUS);
  return {
    tab: (p.get('t') as Tab) || initialState.tab,
    pillar: p.get('p') || initialState.pillar,
    indicator: p.get('i') || initialState.indicator,
    year: num('y'),
    focus,
    agg: (p.get('a') as Agg) || 'weighted',
    rebase: p.get('r') === '1',
    proj: p.get('pr') === '1',
    from: num('fr') ?? 2000,
    ex: {
      x: p.get('x') || initialState.ex.x,
      y: p.get('yv') || initialState.ex.y,
      size: (p.get('sz') as SizeBy) || 'pop',
      logx: p.get('lx') !== '0',
      logy: p.get('ly') === '1',
      trails: p.get('tr') === '1',
      year: num('ey'),
    },
    country: p.get('c') || initialState.country,
  };
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...initialState, ...decode(window.location.hash) }));
  useEffect(() => {
    const next = `#${encode(state)}`;
    if (window.location.hash !== next) window.history.replaceState(null, '', next);
  }, [state]);
  useEffect(() => {
    const onHash = () => dispatch({ type: 'set', patch: decode(window.location.hash) });
    window.addEventListener('popstate', onHash);
    return () => window.removeEventListener('popstate', onHash);
  }, []);
  const set = useCallback((patch: Partial<AppState>) => dispatch({ type: 'set', patch }), []);
  return { state, dispatch, set };
}
