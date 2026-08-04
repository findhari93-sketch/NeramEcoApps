'use client';

/**
 * Screenshot attachment for the "Report a problem" flow.
 *
 * Mirrors apps/nexus/src/lib/issue-screenshot-upload.ts (same shape, this app's
 * upload route). The auto-captured page shot used to be uploaded in an effect
 * when the dialog opened, and the path written back with `setScreenshots`. That
 * effect listed its own "already handled" flag in its dependency array, so
 * setting the flag re-ran it, React tore the previous run down, and the teardown
 * flipped a `cancelled` guard mid-upload. Every screenshot reached the bucket
 * and not one ever reached `screenshot_urls`.
 *
 * The upload now happens at SUBMIT time and the path stays a local variable all
 * the way into the POST body: no effect, no cleanup, nothing to cancel. It also
 * stops abandoned dialogs from leaving orphan files in the bucket.
 */

import { compressImage } from './image-compress';

/** The upload route rejects anything over 500KB, so leave headroom. */
const MAX_UPLOAD_BYTES = 450 * 1024;

/** How long a report will wait for its screenshot before sending without one. */
const DEFAULT_TIMEOUT_MS = 8000;

export interface CollectScreenshotPathsOptions {
  /** Paths the reporter uploaded by hand (already on the server). */
  manual: string[];
  /** The page capture taken before the dialog opened, if any. */
  autoFile: File | null;
  /** Injected uploader. Resolves to a storage path, or null when it did not land. */
  upload: (file: File) => Promise<string | null>;
  timeoutMs?: number;
}

/**
 * Resolve the final `screenshot_urls` for a report: the auto-captured page shot
 * first, then the manual uploads. Never throws, never returns a duplicate.
 */
export async function collectScreenshotPaths({
  manual,
  autoFile,
  upload,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: CollectScreenshotPathsOptions): Promise<string[]> {
  if (!autoFile) return [...manual];

  let autoPath: string | null = null;
  try {
    autoPath = await withTimeout(upload(autoFile), timeoutMs);
  } catch {
    autoPath = null;
  }

  if (!autoPath || manual.includes(autoPath)) return [...manual];
  return [autoPath, ...manual];
}

/** Resolve to null once `ms` has passed, whatever the promise is still doing. */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Shrink to fit the upload route's limit. `compressImage` only caps WIDTH, so a
 * long scrolling page can still come out over the limit and 400 the upload.
 */
export async function compressForUpload(file: Blob): Promise<Blob> {
  const first = await compressImage(file);
  if (first.size <= MAX_UPLOAD_BYTES) return first;
  return compressImage(first, 900, 0.5);
}
