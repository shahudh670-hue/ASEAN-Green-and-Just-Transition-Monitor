/**
 * Chart colours. The categorical slots and sequential ramp come from a palette
 * validated for colour-vision deficiency and contrast in both themes. Light-mode
 * slots 3 and 4 sit below 3:1 on the light surface, so every chart that uses them
 * also carries direct labels and a table view.
 */
export type Mode = 'light' | 'dark';

export interface ChartTheme {
  mode: Mode;
  surface: string;
  ink: string;
  ink2: string;
  muted: string;
  grid: string;
  axis: string;
  context: string;
  series: string[];
  /** Eight-slot categorical order for compositions (energy mix); assigned in fixed order, never cycled. */
  cat8: string[];
  seq: string[];
  aggregate: string;
  hover: string;
}

const SEQ = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];

export function chartTheme(mode: Mode): ChartTheme {
  return mode === 'dark'
    ? {
        mode,
        surface: '#1a1a19',
        ink: '#f0efec',
        ink2: '#c3c2b7',
        muted: '#898781',
        grid: '#2c2c2a',
        axis: '#383835',
        context: '#4a4945',
        series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
        cat8: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
        seq: SEQ,
        aggregate: '#f0efec',
        hover: '#7dbbe8',
      }
    : {
        mode,
        surface: '#fcfcfb',
        ink: '#0b0b0b',
        ink2: '#52514e',
        muted: '#898781',
        grid: '#e1e0d9',
        axis: '#c3c2b7',
        context: '#cfcec7',
        series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
        cat8: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
        seq: SEQ,
        aggregate: '#0b0b0b',
        hover: '#00528a',
      };
}

export const MAX_FOCUS = 4;

export function currentMode(): Mode {
  const attr = document.documentElement.getAttribute('data-theme');
  if (attr === 'dark' || attr === 'light') return attr;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
