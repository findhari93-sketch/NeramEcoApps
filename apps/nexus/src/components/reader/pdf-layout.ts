/**
 * Layout arithmetic for PDFReader, kept pure so it is tested without pdf.js or a
 * layout engine.
 *
 * Slides are why this exists. A 16:9 slide on a phone is about a quarter as tall
 * as it is wide, so the old fixed 400px page placeholder left big white gaps, and
 * pages drawn for portrait stayed small and soft after the phone was turned.
 */

/** A page placeholder's CSS aspect ratio (width over height), or null when the size is unknown. */
export function pageAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
): number | null {
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return width / height;
}

/** How much the reader's width may change before drawn pages are drawn again. */
export const RERENDER_WIDTH_CHANGE = 0.08;

/**
 * Should pages drawn at `renderedWidth` be drawn again now that the reader is
 * `width` wide? Small changes (a scrollbar appearing) are not worth the work.
 * A hidden reader measures 0, which is never a reason to draw.
 */
export function needsRerenderForWidth(
  renderedWidth: number | null | undefined,
  width: number,
  threshold: number = RERENDER_WIDTH_CHANGE,
): boolean {
  if (!renderedWidth || renderedWidth <= 0 || !width || width <= 0) return false;
  return Math.abs(width - renderedWidth) / renderedWidth > threshold;
}

/**
 * The page a reader is on: the last page whose top has passed a line 40% of the
 * way down the visible area. `tops` are each page's top relative to the top of
 * the scroll area, in page order. 0 when there are no pages.
 */
export function currentPageFromTops(tops: number[], viewportHeight: number, line = 0.4): number {
  if (!tops.length) return 0;
  const mark = Math.max(0, viewportHeight) * line;
  let page = 1;
  for (let i = 0; i < tops.length; i++) {
    if (tops[i] <= mark) page = i + 1;
    else break;
  }
  return page;
}
