import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import type { Dataset } from './lib/types';
import './index.css';

const root = createRoot(document.getElementById('root')!);

function Message({ text }: { text: string }) {
  return (
    <div className="mx-auto max-w-xl px-6 py-24 text-center text-ink-2">
      <p className="text-lg">{text}</p>
    </div>
  );
}

root.render(<Message text="Loading the ASEAN Green and Just Transition Monitor…" />);

fetch('data/data.json', { cache: 'no-cache' })
  .then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json() as Promise<Dataset>;
  })
  .then((ds) =>
    root.render(
      <StrictMode>
        <App ds={ds} />
      </StrictMode>,
    ),
  )
  .catch(() => root.render(<Message text="The data could not be loaded. Please refresh the page; if the problem persists, the data pipeline may be running." />));
