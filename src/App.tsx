import { useEffect, useMemo, useState } from 'react';
import Header from './components/Header';
import Controls from './components/Controls';
import KpiStrip from './components/KpiStrip';
import RegionalPanel from './components/RegionalPanel';
import TrendPanel from './components/TrendPanel';
import GridPanel from './components/GridPanel';
import PillarDetail from './components/PillarDetail';
import InsightsView, { PillarInsights } from './components/Insights';
import ExplorerView from './components/ExplorerView';
import CountriesView from './components/CountriesView';
import MethodsView from './components/MethodsView';
import PovertyEnergyView from './components/PovertyEnergyView';
import { AppCtx, type Ctx } from './lib/context';
import { allYears, defaultYear, meta } from './lib/data';
import { generateInsights } from './lib/insights';
import { useAppState } from './lib/state';
import { chartTheme, currentMode, type Mode } from './lib/theme';
import type { Dataset } from './lib/types';

function useMode(): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'dark' || saved === 'light') {
        document.documentElement.setAttribute('data-theme', saved);
        return saved;
      }
    } catch {
      /* storage unavailable */
    }
    return currentMode();
  });
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => {
      if (!document.documentElement.getAttribute('data-theme')) setMode(currentMode());
    };
    mq?.addEventListener('change', on);
    return () => mq?.removeEventListener('change', on);
  }, []);
  const set = (m: Mode) => {
    document.documentElement.setAttribute('data-theme', m);
    try {
      localStorage.setItem('theme', m);
    } catch {
      /* storage unavailable */
    }
    setMode(m);
  };
  return [mode, set];
}

export default function App({ ds }: { ds: Dataset }) {
  const { state, dispatch, set } = useAppState();
  const [mode, setMode] = useMode();
  const [hovered, setHovered] = useState<string | null>(null);
  const theme = useMemo(() => chartTheme(mode), [mode]);
  const insights = useMemo(() => generateInsights(ds), [ds]);

  // Guard against stale or hand-edited links.
  const validIndicator = ds.catalogue.some((c) => c.id === state.indicator && !c.hidden && ds.indicators[c.id]);
  useEffect(() => {
    if (!validIndicator) {
      const first = ds.catalogue.find((c) => !c.hidden && c.pillar === state.pillar && ds.indicators[c.id]) ?? ds.catalogue.find((c) => !c.hidden && ds.indicators[c.id]);
      if (first) set({ indicator: first.id, pillar: first.pillar ?? state.pillar });
    }
  }, [validIndicator, ds, set, state.pillar]);

  const ctx: Ctx = { ds, state, dispatch, set, theme, insights, hovered, setHovered };
  if (!validIndicator) return null;

  const m = meta(ds, state.indicator);
  const years = allYears(ds, state.indicator, Boolean(m.projections && state.proj));
  const year = state.year && years.includes(state.year) ? state.year : defaultYear(ds, state.indicator);

  return (
    <AppCtx.Provider value={ctx}>
      <a href="#main" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <Header mode={mode} onMode={setMode} />
      <main id="main" className="mx-auto max-w-[1400px] space-y-4 px-4 py-5 sm:px-6">
        {state.tab === 'overview' && (
          <>
            <Controls year={year} years={years} />
            <KpiStrip />
            <RegionalPanel year={year} />
            <TrendPanel year={year} />
            <PillarInsights />
            <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
              <GridPanel year={year} />
              <PillarDetail />
            </div>
          </>
        )}
        {state.tab === 'explorer' && <ExplorerView />}
        {state.tab === 'insights' && <InsightsView />}
        {state.tab === 'poverty' && <PovertyEnergyView />}
        {state.tab === 'countries' && <CountriesView />}
        {state.tab === 'methods' && <MethodsView />}
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[1400px] flex-wrap justify-between gap-3 px-4 py-5 text-sm text-ink-3 sm:px-6">
          <p>Data from the World Bank, IMF, UN Statistics Division, ILO, OECD, IRENA, IEA, OPHI and UNDP HDRO.</p>
          <button className="font-semibold text-brand hover:underline" onClick={() => set({ tab: 'methods' })}>
            Sources and methods
          </button>
        </div>
      </footer>
    </AppCtx.Provider>
  );
}
