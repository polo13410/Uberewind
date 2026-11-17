import { useSyncExternalStore } from 'react';

/**
 * Chart colours. SVG presentation attributes can't use CSS var(), so the
 * values live here and switch with prefers-color-scheme.
 * Categorical order is fixed (validated for CVD on adjacent pairs, light and
 * dark): never cycle it, fold extra series into "Autres".
 */
const LIGHT = {
  dark: false,
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  surface: '#ffffff',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  text: '#141414',
  muted: '#6b6a66',
  cursor: 'rgba(11,11,11,0.06)',
};

const DARK: typeof LIGHT = {
  dark: true,
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
  surface: '#1c1c1c',
  grid: '#2c2c2a',
  axis: '#383835',
  text: '#eeeeee',
  muted: '#a3a29c',
  cursor: 'rgba(255,255,255,0.06)',
};

export type ChartTheme = typeof LIGHT;

const query = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function subscribe(cb: () => void) {
  const q = query();
  q?.addEventListener('change', cb);
  return () => q?.removeEventListener('change', cb);
}

export function useChartTheme(): ChartTheme {
  const dark = useSyncExternalStore(subscribe, () => query()?.matches ?? false, () => false);
  return dark ? DARK : LIGHT;
}
