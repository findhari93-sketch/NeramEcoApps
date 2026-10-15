/**
 * Each rule's short name and what to do about it, shown on the SEO Health page
 * and sent to the weekly Claude Code fix job (/api/cron/seo-audit/findings).
 * Keep in step with rules.ts.
 *
 * `autofix` says whether the weekly job may change code for it. Content work,
 * data clean-up and Google-side states go to the "needs you" list instead.
 */
export const RULES: Record<string, { name: string; fix: string; autofix: boolean }> = {
  // Waiting findings (status 'waiting') reuse their rule: fixed here, Google has not re-crawled yet.
  I1: { name: 'Server error', fix: 'The page fails on the server. Open it, check the Vercel runtime logs for that route and fix the error. Google drops pages that keep failing.', autofix: false },
  I2: { name: 'Redirect or 404', fix: 'List only final, working URLs in the sitemap. If the page moved, keep the 301 and put the new URL in the sitemap. An old URL that still gets traffic needs a 301 to its closest page.', autofix: true },
  I3: { name: 'Noindex in sitemap', fix: 'Either remove the noindex or take the page out of the sitemap. For city pages the location gate decides: add reviewed local content rather than loosening the gate.', autofix: true },
  I4: { name: 'Not indexed', fix: '"Crawled, not indexed" usually means thin or near-duplicate content. Add unique, useful copy and links from strong pages, then request indexing in Search Console.', autofix: false },
  I5: { name: 'Canonical mismatch', fix: 'Google treats another URL as the main one. Make the canonical tag, internal links and sitemap all point at the same URL, or merge the two pages.', autofix: true },
  I6: { name: 'Dropped from index', fix: 'This page earned clicks and dropped out. Check it loads, has no noindex, and that its content or canonical did not change recently.', autofix: false },
  I7: { name: 'Blocked by robots.txt', fix: 'robots.txt blocks a URL we ask Google to index. Remove the Disallow rule or take the URL out of the sitemap.', autofix: true },
  I8: { name: 'Noindex still in search', fix: 'Google still shows this noindex page. Confirm the noindex is intended. If the page deserves traffic, make it indexable.', autofix: false },
  P1: { name: 'Close to the top', fix: 'These searches rank on page 1 or 2. Put the main search phrase in the title and H1, answer it in the first paragraph, and link to the page from related pages.', autofix: true },
  P2: { name: 'Low click rate', fix: 'The page shows high in results but few people click. Rewrite the title and meta description around what searchers want.', autofix: true },
  P3: { name: 'Clicks dropped', fix: 'Clicks fell sharply this week. Check the page still loads and is indexed, then compare positions in Search performance.', autofix: false },
  P4: { name: 'Pages compete', fix: 'Several of our pages split one search. Pick one page for it, point internal links there, and refocus or merge the others.', autofix: false },
  P5: { name: 'Unmet demand', fix: 'People search this and we rank below 20. Consider a section or page that answers it directly.', autofix: false },
  P6: { name: 'City demand', fix: 'People search for coaching or an exam centre in this city, but its page is held back by the location gate. Add reviewed local text built from our own data (distances, colleges, counselling) so the gate can index it. Never loosen the gate.', autofix: true },
  S1: { name: 'Season coming', fix: 'This exam or counselling season starts within 90 days and the page still names last year. Update its title, H1 and dates to the new cycle (unknown dates say "expected"), or add the new year\'s hub page and link to it from the old one.', autofix: true },
  O1: { name: 'Title', fix: 'Give each page a unique title of 65 characters or fewer that leads with its main search phrase. Translated pages need translated titles.', autofix: true },
  O2: { name: 'Meta description', fix: 'Write a unique meta description of about 150 characters that gives a reason to click.', autofix: true },
  O3: { name: 'Canonical', fix: 'Every page should name itself as canonical. Without one, Google picks its own ("Duplicate without user-selected canonical").', autofix: true },
  O4: { name: 'H1 heading', fix: 'Use exactly one H1 that says what the page is about, rendered on the server.', autofix: true },
  O5: { name: 'Broken structured data', fix: 'A JSON-LD block does not parse, so Google ignores it. Fix the JSON and check the page in the Rich Results Test.', autofix: true },
  O6: { name: 'Broken links', fix: 'Fix or remove internal links to pages that return 404.', autofix: true },
  O7: { name: 'Dash style', fix: 'House rule: replace em dashes and double dashes with commas, colons or full stops.', autofix: true },
  O8: { name: 'Thin page', fix: 'Pages under 250 words rarely get indexed. Add unique, useful copy or merge the page into a stronger one.', autofix: false },
  A1: { name: 'AI crawler access', fix: 'AI answer engines cannot read the site. Allow these crawlers in apps/marketing/src/app/robots.ts.', autofix: true },
  A2: { name: 'llms.txt', fix: 'llms.txt points AI answer engines at our best pages. Add the missing pages in apps/marketing/src/lib/seo/llms.ts.', autofix: true },
  A3: { name: 'Structured data', fix: 'Add the structured data this kind of page should carry so search and AI answers can read it.', autofix: true },
  A4: { name: 'Answer first', fix: 'Add a short paragraph (under 60 words) right under the H1 that answers the page’s main question. AI answers quote these.', autofix: true },
};
