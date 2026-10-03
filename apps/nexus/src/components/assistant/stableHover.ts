/**
 * The theme lifts every Button 1px on hover with `transition: all`. On a phone
 * a tap leaves hover stuck on, so the button drifts while the lift animates, and
 * a measurement taken mid-drift reads a 48px button as 47.9999px. Keeping the
 * transition to colours and shadow makes the lift instant: same look, no drift.
 */
export const stableHover = {
  transitionProperty: 'background-color, box-shadow, border-color, color',
} as const;
