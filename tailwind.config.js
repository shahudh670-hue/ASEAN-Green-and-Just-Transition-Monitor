/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Source Sans 3"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'] },
      colors: {
        brand: { DEFAULT: 'var(--brand)', strong: 'var(--brand-strong)', soft: 'var(--brand-soft)' },
        plane: 'var(--plane)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: 'var(--line)',
        good: 'var(--good)',
        risk: 'var(--risk)',
      },
      boxShadow: { card: '0 1px 2px rgba(11,11,11,0.04), 0 0 0 1px var(--line)' },
    },
  },
  plugins: [],
};
