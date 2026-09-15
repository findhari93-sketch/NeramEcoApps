/**
 * Pinterest-style placement without a layout library.
 *
 * Columns follow the grid's own width (measured with ResizeObserver), never the
 * window: inside the Nexus sidebar a window breakpoint over-counts columns and
 * overflows. Placement is greedy and in order, so appending a page never moves
 * a tile that is already on screen.
 */
const DEFAULT_ASPECT = 0.75;
/** The one-line caption under every tile, as a fraction of tile width. */
const CAPTION = 0.15;

export function columnsForWidth(width: number): number {
  if (width < 560) return 2;
  if (width < 840) return 3;
  if (width < 1120) return 4;
  return 5;
}

export function layoutMasonry<T>(items: T[], columns: number, aspectOf: (item: T) => number | null): T[][] {
  const count = Math.max(1, Math.floor(columns));
  const cols: T[][] = Array.from({ length: count }, () => []);
  const heights = new Array<number>(count).fill(0);
  for (const item of items) {
    const aspect = aspectOf(item);
    const height = 1 / (aspect && aspect > 0 ? aspect : DEFAULT_ASPECT) + CAPTION;
    let target = 0;
    for (let i = 1; i < count; i++) {
      if (heights[i] < heights[target] - 1e-9) target = i;
    }
    cols[target].push(item);
    heights[target] += height;
  }
  return cols;
}
