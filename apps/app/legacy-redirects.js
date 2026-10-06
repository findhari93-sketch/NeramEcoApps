/**
 * Old tool URLs that are still linked from search results, bookmarks and other
 * sites. Each one points straight at the live page (no chains). Keep these
 * permanently; legacy-redirects.test.ts fails if a destination stops existing
 * or a source comes back into the sitemap.
 */
module.exports = [
  { source: '/tools/cutoff-calculator', destination: '/tools/nata/cutoff-calculator', permanent: true },
  { source: '/tools/college-predictor', destination: '/tools/counseling/college-predictor', permanent: true },
  { source: '/tools/nata/college-predictor', destination: '/tools/counseling/college-predictor', permanent: true },
  { source: '/tools/nata/rank-predictor', destination: '/tools/counseling/rank-predictor', permanent: true },
  { source: '/tools/exam-centers', destination: '/tools/nata/exam-centers', permanent: true },
  { source: '/tools/josaa-predictor', destination: '/tools/counseling/josaa-predictor', permanent: true },
  { source: '/tools/question-bank', destination: '/tools/nata/question-bank', permanent: true },
];
