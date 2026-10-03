/**
 * The Next data-cache tag for student-agnostic Library reads (see
 * library-cache.ts). Kept in its own dependency-free module so low-level writers
 * such as class-library-bridge.ts can invalidate it without importing the query
 * layer.
 */

import { revalidateTag } from 'next/cache';

export const LIBRARY_CACHE_TAG = 'library';

/**
 * Drop the cached Library reads after a write. Never throws: a failed
 * invalidation (for example outside a Next request, in a test or a script)
 * only means the change shows within five minutes instead of immediately.
 */
export function invalidateLibraryCache(): void {
  try {
    revalidateTag(LIBRARY_CACHE_TAG);
  } catch (err) {
    console.warn('[library-cache] revalidateTag failed:', err instanceof Error ? err.message : err);
  }
}
