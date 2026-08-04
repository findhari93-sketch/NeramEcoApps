'use client';

/**
 * Screenshot attachment for the "Report a problem" flow.
 *
 * HISTORY / WHY THIS SHAPE: the auto-captured screenshot used to be uploaded in
 * a `useEffect` when the dialog opened, and the resulting path was written back
 * with `setScreenshots`. That effect listed its own "already handled" state flag
 * in its dependency array, so setting the flag re-ran the effect, React tore the
 * previous run down, and the teardown flipped a `cancelled` guard while the
 * upload was still in flight. Every screenshot reached the storage bucket and
 * NOT ONE ever reached `screenshot_urls` (49 orphaned objects, 0 attachments).
 *
 * So the upload now happens at SUBMIT time and the path stays a local variable
 * all the way into the POST body. There is no effect, no cleanup, and nothing
 * that can cancel it. It also means an abandoned dialog no longer leaves a file
 * behind in the bucket.
 *
 * A screenshot is a nice-to-have. It must never block or fail a report, hence
 * the timeout and the swallowed errors.
 */

import { compressImage } from './image-compress';

/** The upload route rejects anything over 500KB, so leave headroom. */
const MAX_UPLOAD_BYTES = 450 * 1024;

/** How long a report will wait for its screenshot before sending without one. */
const DEFAULT_TIMEOUT_MS = 8000;

export interface CollectScreenshotPathsOptions {
  /** Paths the student uploaded by hand (already on the server). */
  manual: string[];
  /** The page capture taken before the dialog opened, if any. */
  autoFile: File | null;
  /** Injected uploader. Resolves to a storage path, or null when it did not land. */
  upload: (file: File) => Promise<string | null>;
  timeoutMs?: number;
}

/**
 * Resolve the final `screenshot_urls` for a report: the auto-captured page shot
 * first (it is the most useful one to a reviewer), then the manual uploads.
 * Never throws, never returns a duplicate.
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
 * One extra pass at a smaller size handles that.
 */
export async function compressForUpload(file: Blob): Promise<Blob> {
  const first = await compressImage(file);
  if (first.size <= MAX_UPLOAD_BYTES) return first;
  return compressImage(first, 900, 0.5);
}

/** Compress + POST one screenshot. Resolves to its storage path, or null. */
export async function uploadIssueScreenshot(file: File, token: string): Promise<string | null> {
  const compressed = await compressForUpload(file);
  const formData = new FormData();
  formData.append('file', compressed, 'auto-screenshot.jpg');

  const res = await fetch('/api/foundation/issues/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) return null;

  const { path } = await res.json();
  return typeof path === 'string' && path ? path : null;
}
