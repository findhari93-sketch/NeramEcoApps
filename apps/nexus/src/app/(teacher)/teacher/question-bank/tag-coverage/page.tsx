'use client';

/**
 * Question Bank > Tag coverage.
 *
 * Deep links: `?tag=<slug>` opens that topic's review queue, `?from=<path>`
 * sets where Back goes (a /teacher/ path only; see safeBackHref).
 * The query string is read after mount inside the workspace rather than with
 * useSearchParams, which would need a Suspense boundary to prerender.
 */

import TagCoverageWorkspace from '@/components/question-bank/tag-coverage/TagCoverageWorkspace';

export default function TagCoveragePage() {
  return <TagCoverageWorkspace />;
}
