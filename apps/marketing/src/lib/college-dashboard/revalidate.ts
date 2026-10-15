import { revalidatePath } from 'next/cache';
import { collegePagePaths } from '@/lib/college-hub/revalidate-paths';

/** Refreshes one college page in this app (all locales). Never throws. */
export function revalidateCollegePage(stateSlug: string | null, slug: string | null): void {
  try {
    for (const path of collegePagePaths([{ state_slug: stateSlug, slug }])) revalidatePath(path);
  } catch (e) {
    console.warn('[college-dashboard] revalidate failed:', (e as Error).message);
  }
}
