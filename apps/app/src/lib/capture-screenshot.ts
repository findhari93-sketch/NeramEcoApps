'use client';

/**
 * Best-effort DOM screenshot for auto-attaching to a problem report (student
 * PWA, mirrors apps/nexus). Returns a JPEG File, or null on ANY failure
 * (missing lib, cross-origin taint, out of memory, etc.). Capture should be
 * invoked BEFORE the report dialog opens; elements marked
 * `data-no-screenshot="true"` (e.g. the floating button) are excluded.
 *
 * The whole page is captured, so staff see what was above and below the fold.
 * A very tall page (long lists, the question bank) falls back to the part of
 * the page on screen: a 20,000px canvas runs phones out of memory, and what the
 * student was looking at is what matters most anyway.
 */

/** Taller than this and only the visible screen is captured. */
export const FULL_PAGE_MAX_HEIGHT = 8000;
/** Taller than this and the capture drops to 1x to keep the canvas small. */
const HIGH_DPI_MAX_HEIGHT = 4000;

export type CaptureMode = 'full' | 'viewport';

/** Which area to capture, from the page's size. Pure, exported for tests. */
export function planCapture(input: {
  pageHeight: number;
  viewportHeight: number;
  devicePixelRatio: number;
}): { mode: CaptureMode; height: number; scale: number } {
  const dpr = Math.min(input.devicePixelRatio || 1, 2);
  if (input.pageHeight > FULL_PAGE_MAX_HEIGHT) {
    return { mode: 'viewport', height: input.viewportHeight, scale: dpr };
  }
  const height = Math.max(input.pageHeight, input.viewportHeight);
  return { mode: 'full', height, scale: height > HIGH_DPI_MAX_HEIGHT ? 1 : dpr };
}

export async function captureScreenshot(fileName?: string): Promise<File | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  try {
    const { domToBlob } = await import('modern-screenshot');
    const root = document.documentElement;
    const pageHeight = Math.max(document.body.scrollHeight, root.scrollHeight);
    const width = root.clientWidth || window.innerWidth;
    const plan = planCapture({
      pageHeight,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    });

    const blob = await domToBlob(document.body, {
      quality: 0.7,
      type: 'image/jpeg',
      backgroundColor: '#ffffff',
      scale: plan.scale,
      width,
      height: plan.height,
      // Visible screen only: shift the cloned page up by the scroll offset so
      // the frame shows what is on screen. Fixed bars stay put because they are
      // placed against the frame, not the page.
      style:
        plan.mode === 'viewport'
          ? { marginTop: `-${Math.round(window.scrollY)}px`, height: `${pageHeight}px` }
          : undefined,
      filter: (node: Node) => {
        const el = node as HTMLElement;
        return !(el?.dataset && el.dataset.noScreenshot === 'true');
      },
    });
    if (!blob || !blob.size) return null;
    const name = fileName || (plan.mode === 'full' ? 'page-full.jpg' : 'page-visible.jpg');
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return null;
  }
}
