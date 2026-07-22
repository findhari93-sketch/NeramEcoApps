'use client';

/**
 * Best-effort DOM screenshot for auto-attaching to a problem report.
 *
 * Returns a JPEG File, or null on ANY failure (missing lib, cross-origin taint,
 * huge page, etc.). Auto-screenshot is a nice-to-have — never a blocker — so the
 * caller should just skip attachment when this returns null. Capture should be
 * invoked BEFORE the report dialog opens so the dialog/backdrop isn't in frame;
 * elements marked `data-no-screenshot="true"` (e.g. the floating button) are
 * excluded.
 */
export async function captureScreenshot(fileName = 'auto-screenshot.jpg'): Promise<File | null> {
  if (typeof document === 'undefined' || typeof window === 'undefined') return null;
  try {
    // Dynamic import so a missing/failed dep never breaks the report flow.
    const { domToBlob } = await import('modern-screenshot');
    const blob = await domToBlob(document.body, {
      quality: 0.7,
      type: 'image/jpeg',
      backgroundColor: '#ffffff',
      scale: Math.min(window.devicePixelRatio || 1, 2),
      filter: (node: Node) => {
        const el = node as HTMLElement;
        return !(el?.dataset && el.dataset.noScreenshot === 'true');
      },
    });
    if (!blob || !blob.size) return null;
    return new File([blob], fileName, { type: 'image/jpeg' });
  } catch {
    return null;
  }
}
