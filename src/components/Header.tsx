import type { Tab } from '../lib/state';
import { useApp } from '../lib/context';
import type { Mode } from '../lib/theme';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'countries', label: 'Country profiles' },
  { id: 'poverty', label: 'Poverty and energy' },
  { id: 'insights', label: 'Policy insights' },
  { id: 'explorer', label: 'Relationship explorer' },
  { id: 'methods', label: 'Sources and methods' },
];

export default function Header({ mode, onMode }: { mode: Mode; onMode: (m: Mode) => void }) {
  const c = useApp();
  const updated = new Date(c.ds.meta.generatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <header className="relative border-b border-line bg-surface">
      <div className="brand-band" aria-hidden />
      <div className="accent-tag" aria-hidden />
      {c.ds.meta.testFixture && (
        <div className="bg-risk px-4 py-1.5 text-center text-sm font-semibold text-white">
          Test build: the figures on this page are synthetic and must not be used.
        </div>
      )}
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-4 py-1 pl-14 pr-4 pt-5 sm:pr-6">
        <div className="flex items-center gap-4">
          <div>
            <p className="eyebrow">United Nations Development Programme</p>
            <h1 className="text-[22px] font-bold leading-tight text-ink sm:text-[26px]">ASEAN Green and Just Transition Monitor</h1>
            <p className="serif text-[15px] italic text-ink-2">
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
      <nav className="mx-auto mt-3 flex max-w-[1400px] gap-1 overflow-x-auto pl-14 pr-4 sm:pr-6" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => c.set({ tab: t.id })}
            aria-current={c.state.tab === t.id ? 'page' : undefined}
            className={`whitespace-nowrap border-b-[3px] px-3 py-2.5 text-[14px] font-semibold uppercase tracking-wide transition-colors ${
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
