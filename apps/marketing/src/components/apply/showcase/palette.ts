/**
 * Showcase-only values that have no design-system token. Every other colour
 * comes from `tokens` in '@/design-system'. Keep hex literals here, never in sx.
 */
export const SHOWCASE_COLORS = {
  /** Microsoft Teams brand tile in the window chrome. */
  teams: '#5b5fc7',
  /** Bars for the chapters outside the top three (Predict). */
  greyBar: '#8792a0',
  /** Paper text at 0.55: inactive tabs and tour labels. */
  paperDim: 'rgba(245,240,232,0.55)',
  /** Paper at 0.2: future tour segments. */
  paperTrack: 'rgba(245,240,232,0.2)',
  /** Outline of the 44px tour buttons. */
  outline: 'rgba(245,240,232,0.24)',
  /** Border of the app window. */
  windowBorder: 'rgba(255,255,255,0.12)',
  /** Stat strip cells over the blueprint grid. */
  statCell: 'rgba(11,22,41,0.6)',
} as const;

/** gold500 at a variable alpha (the Predict highlight fades in). */
export const goldTint = (alpha: number): string => `rgba(232,160,32,${alpha})`;

export const img = (name: string): string => `/images/apply/nexus/${name}.webp`;

/** Every image the scenes use, so the component can warm the cache after the page settles. */
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
  'insp-1',
  'insp-2',
  'insp-3',
  'insp-4',
].map(img);
