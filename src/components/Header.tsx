import { useState } from 'react';
import type { Tab } from '../lib/state';
import { useApp } from '../lib/context';
import type { Mode } from '../lib/theme';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'explorer', label: 'Relationship explorer' },
  { id: 'insights', label: 'Policy insights' },
  { id: 'countries', label: 'Country profiles' },
  { id: 'methods', label: 'Sources and methods' },
];

function Logo() {
  // The official UNDP logo is supplied as public/brand/undp-logo.svg.
  // Until that file is present, a plain text label stands in its place.
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="flex h-14 w-11 items-center justify-center rounded-sm bg-brand text-[11px] font-bold tracking-wide text-white" aria-label="UNDP">
        UNDP
      </span>
    );
  return <img src="brand/undp-logo.svg" alt="UNDP" className="h-14 w-auto" onError={() => setFailed(true)} />;
}

export default function Header({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const c = useApp();
  const updated = new Date(c.ds.meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <header className="border-b border-line bg-surface">
      {c.ds.meta.testFixture && (
        <div className="bg-risk px-4 py-1.5 text-center text-sm font-semibold text-white">
          Test build: the figures on this page are synthetic and must not be used.
        </div>
      )}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <p className="eyebrow">United Nations Development Programme</p>
            <h1 className="text-[22px] font-bold leading-tight text-ink sm:text-[26px]">ASEAN Green and Just Transition Monitor</h1>
            <p className="text-sm text-ink-2">
              Energy transition, human development, fiscal space and finance across the eleven ASEAN members. Data updated {updated}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a className="btn" href="data/asean-transition-monitor-data.csv" download>
            Download all data
          </a>
          <button
            className="btn"
            onClick={() => onMode(mode === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} theme`}
          >
            {mode === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
        </div>
      </div>
      <nav className="mx-auto mt-3 flex max-w-[1400px] gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => c.set({ tab: t.id })}
            aria-current={c.state.tab === t.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[15px] font-semibold transition-colors ${
              c.state.tab === t.id ? 'border-brand text-brand' : 'border-transparent text-ink-2 hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
