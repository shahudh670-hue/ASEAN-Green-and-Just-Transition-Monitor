import { createContext, useContext } from 'react';
import type { Action, AppState } from './state';
import type { ChartTheme } from './theme';
import type { Dataset } from './types';
import type { Insight } from './insights';

export interface Ctx {
  ds: Dataset;
  state: AppState;
  dispatch: (a: Action) => void;
  set: (p: Partial<AppState>) => void;
  theme: ChartTheme;
  insights: Insight[];
  hovered: string | null;
  setHovered: (iso: string | null) => void;
}

export const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppCtx missing');
  return c;
}

/** Colour for a focused country, or undefined if it is not in focus. */
export function focusColour(c: Ctx, iso: string): string | undefined {
  const f = c.state.focus.find((x) => x.iso === iso);
  return f ? c.theme.series[f.slot] : undefined;
}

/** Navigate to the overview chart that backs an insight or an indicator. */
export function openIndicator(c: Ctx, indicator: string, countries: string[] = [], view: 'trend' | 'map' | 'explorer' = 'trend', x?: string, y?: string) {
  if (view === 'explorer') {
    c.dispatch({ type: 'set', patch: { tab: 'explorer' } });
    c.dispatch({ type: 'ex', patch: { x: x ?? c.state.ex.x, y: y ?? c.state.ex.y } });
  } else {
    const m = c.ds.catalogue.find((i) => i.id === indicator);
    c.dispatch({ type: 'set', patch: { tab: 'overview', indicator, pillar: m?.pillar ?? c.state.pillar, year: null } });
  }
  c.dispatch({ type: 'setFocus', isos: countries });
  requestAnimationFrame(() => {
    document.getElementById(view === 'map' ? 'regional' : view === 'trend' ? 'trend' : 'explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
