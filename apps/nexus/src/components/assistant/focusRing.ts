/**
 * A visible keyboard focus ring for the assistant's controls. The theme leaves
 * ButtonBase focus to a faint ripple and a light grey fill (about 1.2:1 on the
 * panel), which a keyboard user cannot follow. Applied as `.Mui-focusVisible`, so
 * a tap or a click never shows it.
 */
export function focusRing(color: string) {
  return { outline: `2px solid ${color}`, outlineOffset: 2 } as const;
}
