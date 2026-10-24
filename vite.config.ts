import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the site works under the GitHub Pages project path.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { environment: 'node' },
});
