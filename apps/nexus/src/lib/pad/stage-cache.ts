/**
 * Short memories for GET /api/pad/stage. A Next.js route file may export only
 * its handlers, so they live here.
 */

import { TtlCache } from '@/lib/ttl-cache';
import type { StageView } from './stage';

/**
 * Everyone in a meeting may be looking at the shared screen at once, so one
 * reading serves them all for a moment. The screen fetches again shortly after
 * every hint, so a reading taken just before a change is replaced quickly.
 */
export const stageViews = new TtlCache<StageView>(2_000, 200);

/** A student the database has let in to a session's stage, remembered for a minute. */
export const stageAllowed = new TtlCache<true>(60_000, 5_000);

/** Test seam. */
export function __clearStageCaches(): void {
  stageViews.clear();
  stageAllowed.clear();
}
