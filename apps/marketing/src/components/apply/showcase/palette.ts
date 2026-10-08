import { neramFontFamilies, neramTokens } from '@neram/ui';

/**
 * The showcase paints a dark product demo, so it carries its own surface
 * colours. Brand colours come from the shared tokens.
 */
export const NX = {
  navy: '#0a1628',
  surface: '#0f1d33',
  rule: '#2a3b5a',
  muted: '#a9b4c8',
  dim: '#7d8aa3',
  done: '#5d6b85',
  gold: neramTokens.gold[500],
  goldDark: '#b67a0c',
  ink: '#14161b',
  inkMuted: '#55524c',
  orange: '#f26b1d',
  red: '#e5302a',
  paper: '#f4f3ef',
  border: '#d9d6cf',
  line: '#e4e1da',
  tint: '#fff8e8',
  teams: '#5b5fc7',
  live: '#e5484d',
  white: '#ffffff',
  text: '#dfe5ef',
} as const;

export const mono = 'ui-monospace, Menlo, Consolas, monospace';
export const serif = neramFontFamilies.serif;

export const img = (name: string): string => `/images/apply/nexus/${name}.webp`;

/** Every showcase image, so the component can warm the cache after the page settles. */
export const SHOWCASE_IMAGES = [
  'drawing-1215',
  'drawing-680',
  'live-1360',
  'live-680',
  'lib-1',
  'lib-2',
  'lib-3',
  'lib-4',
  'lib-5',
  'lib-6',
  'lib-7',
  'insp-1',
  'insp-2',
  'insp-3',
  'insp-4',
  'insp-5',
  'insp-6',
].map(img);
