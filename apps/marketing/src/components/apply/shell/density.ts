/**
 * Laptop density for the apply flow. Phones keep the roomy Apply Flow sizes;
 * from 900px wide the form and showcase tighten so a whole step fits a
 * 1366 to 1536px laptop screen (often only 650 to 800px tall at 125% scaling).
 */
export const DESK = '@media (min-width: 900px)';
/** A laptop whose window is short: drop the least important blocks. */
export const DESK_SHORT = '@media (min-width: 900px) and (max-height: 820px)';

/** Hides text visually but keeps it for screen readers. Widths are strings: sx `width: 1` means 100%. */
export const visuallyHiddenSx = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;
