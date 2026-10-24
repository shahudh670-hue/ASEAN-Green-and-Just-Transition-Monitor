import { useState, type ReactNode } from 'react';
import type { IndicatorMeta } from '../lib/types';

export interface TableData {
  columns: string[];
  rows: (string | number)[][];
}

export function downloadText(name: string, text: string, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function toCSV(t: TableData): string {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns.map(esc).join(','), ...t.rows.map((r) => r.map(esc).join(','))].join('\n');
}

interface Props {
  title: string;
  subtitle?: string;
  meta?: IndicatorMeta;
  table?: TableData;
  fileStem?: string;
  onPng?: () => string | undefined;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function ChartCard({ title, subtitle, meta, table, fileStem = 'chart', onPng, actions, children, className = '' }: Props) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [info, setInfo] = useState(false);
  return (
    <section className={`card p-4 sm:p-5 ${className}`} aria-label={title}>
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-snug text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-ink-2">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions}
          {table && (
            <div className="flex overflow-hidden rounded-lg border border-line text-sm" role="tablist" aria-label="View">
              {(['chart', 'table'] as const).map((v) => (
                <button
                  key={v}
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`px-2.5 py-1 capitalize ${view === v ? 'bg-brand text-white' : 'bg-raised text-ink-2 hover:text-ink'}`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          {table && (
            <button className="btn" onClick={() => downloadText(`${fileStem}.csv`, toCSV(table))} title="Download the data behind this chart">
              CSV
            </button>
          )}
          {onPng && (
            <button
              className="btn"
              title="Download this chart as an image"
              onClick={() => {
                const url = onPng();
                if (!url) return;
                const a = document.createElement('a');
                a.href = url;
                a.download = `${fileStem}.png`;
                a.click();
              }}
            >
              PNG
            </button>
          )}
          {meta && (
            <button className="btn" aria-expanded={info} onClick={() => setInfo((x) => !x)} title="About this indicator">
              Source
            </button>
          )}
        </div>
      </header>
      {meta && info && (
        <div className="mb-3 rounded-lg border border-line bg-raised p-3 text-sm text-ink-2">
          <p className="text-ink">{meta.description}</p>
          <p className="mt-1">
            Unit: {meta.unit}. Source:{' '}
            <a className="text-brand underline underline-offset-2" href={meta.sourceUrl} target="_blank" rel="noreferrer">
              {meta.sourceName}
            </a>
            .
          </p>
          {meta.caveat && <p className="mt-1">Note: {meta.caveat}</p>}
        </div>
      )}
      <div hidden={view !== 'chart'}>{children}</div>
      {table && view === 'table' && (
        <div className="max-h-[440px] overflow-auto rounded-lg border border-line">
          <table className="tabular w-full text-sm">
            <thead className="sticky top-0 bg-raised">
              <tr>
                {table.columns.map((c) => (
                  <th key={c} scope="col" className="border-b border-line px-3 py-2 text-left font-semibold text-ink">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="odd:bg-surface even:bg-raised">
                  {r.map((v, j) => (
                    <td key={j} className={`px-3 py-1.5 ${j > 0 ? 'text-right' : 'text-left'} text-ink-2`}>
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
