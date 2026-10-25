/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '"Proxima Nova"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        serif: ['"PT Serif"', 'Georgia', 'serif'],
      },
      borderRadius: { none: '0', sm: '0', DEFAULT: '0', md: '0', lg: '0', xl: '0', '2xl': '0', full: '9999px' },
      colors: {
        brand: { DEFAULT: 'var(--brand)', strong: 'var(--brand-strong)', soft: 'var(--brand-soft)' },
        plane: 'var(--plane)',
        surface: 'var(--surface)',
        raised: 'var(--raised)',
        ink: { DEFAULT: 'var(--ink)', 2: 'var(--ink-2)', 3: 'var(--ink-3)' },
        line: 'var(--line)',
        good: 'var(--good)',
        risk: 'var(--risk)',
        accent: 'var(--accent)',
      },
      boxShadow: { card: 'none' },
      colors2: {},
    },
  },
  plugins: [],
};
