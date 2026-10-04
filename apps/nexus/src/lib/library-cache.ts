/**
 * Shared cache for the Library's student-agnostic reads.
 *
 * /api/library/home is identical for every student (six category rows plus the
 * topic chips), so it is computed at most once per five minutes per region and
 * served from the Next data cache in between. Any route that changes what the
 * Library shows calls invalidateLibraryCache() so staff edits appear at once
 * rather than after the window.
 */

import { unstable_cache } from 'next/cache';
import { getVideosByCategory, getTopicCounts } from '@neram/database/queries/nexus';
import { LIBRARY_CACHE_TAG } from './library-cache-tag';

export { LIBRARY_CACHE_TAG, invalidateLibraryCache } from './library-cache-tag';
export const LIBRARY_HOME_REVALIDATE_SECONDS = 300;

export const LIBRARY_HOME_CATEGORIES = [
  { key: 'drawing', label: 'Drawing' },
  { key: 'aptitude', label: 'Aptitude' },
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'general_knowledge', label: 'General Knowledge' },
  { key: 'exam_preparation', label: 'Exam Preparation' },
  { key: 'orientation', label: 'Orientation' },
];

const PER_ROW = 8;

/** The uncached computation, exported so it can be tested without Next's cache. */
export async function loadLibraryHome() {
  const [rows, topics] = await Promise.all([
    Promise.all(
      LIBRARY_HOME_CATEGORIES.map(async (cat) => ({
        key: cat.key,
        label: cat.label,
        videos: await getVideosByCategory(cat.key, PER_ROW),
      })),
    ),
    getTopicCounts(12),
  ]);

  return {
    // Empty rows are dropped here rather than in the client, so the browser
    // is not handed six sections to render and then hide.
    sections: rows.filter((r) => r.videos.length > 0),
    topics,
  };
}

export const getCachedLibraryHome = unstable_cache(loadLibraryHome, ['library-home-v1'], {
  revalidate: LIBRARY_HOME_REVALIDATE_SECONDS,
  tags: [LIBRARY_CACHE_TAG],
});
