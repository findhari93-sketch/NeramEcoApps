import { alpha, type Theme } from '@neram/ui';
import type { SectionWeightage } from '@/lib/qb-weightage';

/**
 * Chart colours for the weightage page.
 *
 * Units use a fixed categorical order (validated for colour-blind separation on
 * adjacent pairs), stepped separately for light and dark. Colour follows the
 * unit, never its rank, so switching window or section never repaints Algebra.
 *
 * The heat map is one hue (the theme's primary), light to dark, with text
 * colour chosen per step so every number stays readable.
 */

const UNIT_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];
const UNIT_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300'];

/** Heat steps as opacities of the theme's primary colour, so the map wears the app's brand in either mode. */
const HEAT_ALPHA = [0, 0.14, 0.3, 0.5, 0.85, 1];

export function unitColorMap(s: SectionWeightage, theme: Theme): (unit: string | null) => string {
  const ramp = theme.palette.mode === 'dark' ? UNIT_DARK : UNIT_LIGHT;
  const map = new Map(s.units.map((u, i) => [u.slug, ramp[i] ?? theme.palette.grey[500]]));
  const single = theme.palette.primary.main;
  return (unit) => (s.units.length && unit ? map.get(unit) ?? theme.palette.grey[500] : single);
}

export function heatColors(theme: Theme) {
  const p = theme.palette.primary.main;
  const bg = HEAT_ALPHA.map((a) => (a ? alpha(p, a) : 'transparent'));
  // Light steps keep the page's ink; the two darkest switch to the primary's
  // contrast text, which the theme already guarantees against primary.main.
  const fg = HEAT_ALPHA.map((a, i) => (i >= 4 ? theme.palette.primary.contrastText : theme.palette.text.primary));
  return { bg, fg };
}

/** Diagonal hatch for years that are missing or only partly in the bank. */
export function hatch(theme: Theme): string {
  return `repeating-linear-gradient(135deg, ${theme.palette.divider} 0 2px, transparent 2px 6px)`;
}
