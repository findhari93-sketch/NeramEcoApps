/**
 * Cached #AskSeniors reads for the home page and /ask-seniors.
 *
 * Daily ISR, tagged 'ask-seniors' so an admin edit to the event purges both
 * pages at once through /api/revalidate. Errors are not cached and read as
 * "no event" / "no colleges".
 */
import { unstable_cache } from 'next/cache';
import { getActiveAskSeniorsEvent, getAskSeniorsColleges } from '@neram/database';
import { CACHE_TAGS } from '@/lib/cache-tags';

const ASK_SENIORS_REVALIDATE = 86400;

export const getCachedAskSeniorsEvent = unstable_cache(
  async () => getActiveAskSeniorsEvent(),
  ['marketing-ask-seniors-event-v1'],
  { revalidate: ASK_SENIORS_REVALIDATE, tags: [CACHE_TAGS.askSeniors] },
);

export const getCachedAskSeniorsColleges = unstable_cache(
  async () => getAskSeniorsColleges(),
  ['marketing-ask-seniors-colleges-v1'],
  { revalidate: ASK_SENIORS_REVALIDATE, tags: [CACHE_TAGS.askSeniors] },
);
