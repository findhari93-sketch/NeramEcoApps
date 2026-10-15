# SEO Health (Admin > SEO Health)

A daily SEO and AEO audit of neramclasses.com and app.neramclasses.com. It combines Google Search Console data with our own crawl of every sitemap page. The result is a list of issues that close themselves once they are fixed.

- Page: `apps/admin/src/app/(dashboard)/seo/page.tsx` (admins only)
- Library: `apps/admin/src/lib/seo-audit/`
- Crons: `/api/cron/seo-audit/daily` (03:00 UTC, 08:30 IST) and `/api/cron/seo-audit/weekly` (Mondays 03:30 UTC, 09:00 IST, sends the digest)
- Tables: `seo_audit_runs`, `gsc_search_daily`, `seo_url_status`, `seo_findings` (migration `20261119090000_seo_audit.sql`)

## Connecting Search Console (one time, about 10 minutes)

1. In Google Cloud project **neramclasses-ab480**, go to APIs & Services > Library and enable **Google Search Console API**.
2. Go to IAM & Admin > Service Accounts > Create. Name it `seo-audit`. It needs no project roles. Open it, then Keys > Add key > JSON, which downloads a key file.
3. In Search Console, open neramclasses.com > Settings > Users and permissions > Add user. Enter the service account email (`seo-audit@neramclasses-ab480.iam.gserviceaccount.com`) with permission **Full**. Our code only ever asks for the read-only scope.
4. Base64-encode the key and set it on the admin app:
   ```bash
   base64 -w0 key.json            # copy the output
   # local: add GSC_SERVICE_ACCOUNT_KEY=<output> to apps/admin/.env.local
   cd apps/admin && vercel env add GSC_SERVICE_ACCOUNT_KEY production   # paste the output
   cd apps/admin && vercel env add GSC_SERVICE_ACCOUNT_KEY preview
   ```
   The repo is public, so never commit the key file. Delete the download once it is stored.
5. Optional: set `SEO_DIGEST_TO` (comma separated emails) for the Monday digest.
6. In Admin > SEO Health, choose **Run now > Fetch search data**, then **Inspect URLs**.

Before the key is set, the crawl and the on-page and AI-answer checks still run. Search data and inspection record a `not_connected` run.

## What runs when

| Job | When | What it does |
|---|---|---|
| sitemaps | daily | Resubmits a sitemap to Search Console when its page list changed since yesterday, when Search Console does not list it, or when Google has not downloaded it for 7 days (never twice in a day). Google retired the sitemap ping in 2023, so this is the only automatic way. The one write the audit makes (scope `webmasters`). |
| search | daily | Search Analytics for the last 3 final days (data lags about 3 days). Spare time backfills older history in 30-day chunks, up to `SEO_BACKFILL_DAYS` (90). Page totals are stored as `query = ''` rows, because query rows leave out anonymised searches. |
| inspect | daily | URL Inspection for up to 400 URLs (Google allows 2,000 a day). Priority order: new, changed or imported URLs; URLs with an open indexing issue; never-inspected URLs; then the stalest. |
| crawl | daily | Our crawler reads every sitemap (plus imported URLs and pages seen in search) and re-crawls pages not crawled in 7 days. It records status, redirect, title, description, canonical, robots tags, H1s, JSON-LD types, word count and internal links, then checks the found links for 404s. |
| analyze | daily and weekly | Runs the rules and reconciles `seo_findings`. |
| digest | Mondays | Emails what is new, what was fixed, clicks week on week, and the pages closest to the top. |

**Run now > Crawl all pages** re-crawls everything at once (about a minute for 1,000 pages).

**Import URLs** takes a Search Console export, for example Indexing > Pages > *Server error (5xx)* > Export. It puts those URLs first in the inspection and crawl queues. The Search Console API cannot list the URLs behind each "Why pages aren't indexed" reason, so this is how to check them.

## Ask Google to index (the one manual step)

Google's Indexing API is only for job postings and livestreams; using it for other pages breaks Google's terms. So there is no API to request indexing for our pages. What is automated: sitemaps with real lastmod, resubmitted daily when they change (`sitemaps` job), and IndexNow for Bing and ChatGPT search (marketing and app `/api/cron/indexnow`, daily).

The **Ask Google to index today** card on the SEO Health page lists up to 10 sitemap pages that work on our side but are not indexed, most searched first, then hub pages (`pickAskGoogle` in `rules.ts`).
- **Open in Search Console** opens URL Inspection for that page; press Request indexing there. Google allows about 10 a day.
- **Mark asked** records it (`seo_url_status.index_requested_at`), so the page leaves the list for 14 days and is re-inspected the next morning.

## Claude Code fixes, twice a week (`.github/workflows/seo-autofix.yml`)

Mondays and Thursdays at 10:30 IST, a GitHub Action reads up to 40 open findings from `/api/cron/seo-audit/findings?limit=40` (protected by `SEO_EXPORT_TOKEN`). The order is: most severe first, then the pages with the most search impressions, then hub pages. Each rule is capped at 10, so one rule cannot fill the PR.

Claude Code then fixes the ones marked `autofix` in `lib/seo-audit/rule-guide.ts` and opens **one pull request**. Info items are included only for long titles (O1) and answer-first copy (A4). The PR has these sections:
- what was fixed;
- "Needs your review": city texts drafted with `reviewed: false`, and new season pages;
- what was skipped and why;
- a "Needs you" list of findings that are not code fixes.

Nothing merges or deploys by itself.

- **Skipped while open:** the job skips a run while the last autofix PR is still open.
- **Restricted tools:** Claude can only edit files and run `tsc` and `vitest`. It has no network, cannot commit and cannot push. Findings quote public search queries, so they are treated as data, not instructions.
- **Model:** `claude-sonnet-5-5` (change `--model` in the workflow for Opus).

Setup, once:
1. Generate a token, for example `openssl rand -hex 32`.
2. Add it as `SEO_EXPORT_TOKEN` on the admin Vercel project (production) and as a GitHub Actions secret with the same name.
3. Add `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`) as a GitHub secret.
4. Turn on Settings > Actions > General > "Allow GitHub Actions to create and approve pull requests".
5. Run it once by hand: Actions > SEO Autofix (twice a week) > Run workflow.

PRs opened with the built-in `GITHUB_TOKEN` do not trigger other workflows, so CI does not run on them automatically. The job runs its own type-check and marks the PR as a draft if it fails.

## City pages: reaching every town

Students search for a town's name, but Google indexes only one page out of a set of near-identical ones. So:
- **Marketing city pages** keep the location gate (`apps/marketing/src/lib/seo/location-gate.ts`). A held city becomes indexable when it gains a real local fact; P6 shows where demand already exists.
- **App exam-centre and college-predictor city pages** fold towns with the same answer into the strongest one (`apps/app/src/lib/tools/same-answer.ts`). For exam centres that means the same nearest test city; for the predictor, the same district college list. The indexed page lists the other towns, and their own pages stay up as `noindex, follow` with a link to it.
- **Every town is named on an indexed page:** each app state page has a table of every town with its nearest test city.
- **Shared town names:** `cityForName(name, stateSlug)` in `@neram/geo` resolves a shared name (Aurangabad, Bilaspur, Bijapur, Udaipur) within the state. Until 2026-10-15, Aurangabad in Bihar was treated as a NATA test city because the Maharashtra centre resolved to it.

## The rules (`lib/seo-audit/rules.ts`)

Noindex is judged only on URLs we put in a sitemap. City pages that the location gate holds back, and non-English copies, are noindex on purpose and are not in a sitemap, so they raise nothing.

| Id | Severity | Fires when |
|---|---|---|
| I1 | critical | Any tracked URL returns 5xx |
| I2 | high | A sitemap URL redirects or 404s, or an old URL that still gets search traffic 404s |
| I3 | high | A sitemap URL is noindex |
| I4 | medium | A sitemap URL is not indexed (grouped by Google's coverage state) |
| I5 | medium | Google chose a different canonical than ours |
| I6 | critical | A page with 3+ clicks in 28 days is no longer indexed |
| I7 | high | robots.txt blocks a sitemap URL |
| I8 | info | A noindex page still gets impressions |
| P1 | medium | Striking distance: searches at position 5 to 20 with 100+ impressions |
| P2 | medium | CTR under half of what its position normally earns |
| P3 | high | A page's clicks fall 40%+ week on week (10+ clicks before) |
| P4 | medium | Two or more of our pages each take 20%+ of one search's impressions, or a 200+ impression search is spread over 5+ of our pages with none on page one ("spread"). http and www copies are folded first; brand searches are skipped |
| P5 | info | A search with 50+ impressions where our best page ranks below 20 |
| P6 | medium | 20+ searches in 28 days for coaching or an exam centre in a city whose page is held back by the location gate. The fix is reviewed local text (autofix drafts it with `reviewed: false`), never a looser gate |
| S1 | high | A season starts within 90 days (`lib/seo-audit/seasons.ts`) and a page still names last year, or a year-in-URL hub like `/nata-2026` has no page for the new year |
| O1 | high/medium/info | Title missing, duplicated, or over 65 characters |
| O2 | medium/info | Meta description missing or duplicated |
| O3 | high/medium | Canonical missing, or a sitemap page naming another URL as canonical |
| O4 | medium/info | No H1, or more than one |
| O5 | high | JSON-LD that does not parse |
| O6 | medium | Internal links to 404 pages (Cloudflare's `/cdn-cgi/` links are skipped) |
| O7 | info | Em dash or `--` in a title or description (house rule) |
| O8 | info | Under 250 words of copy |
| A1 | high | robots.txt missing, or blocking GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Google-Extended or Applebot-Extended |
| A2 | medium/info | llms.txt missing, or leaving out our most-clicked pages |
| A3 | medium | A page type without its schema: FAQPage on /coaching/* and exam hubs, CollegeOrUniversity on college pages, Article on blog posts |
| A4 | info | A page with 100+ impressions has no short answer paragraph under its H1 |

**Lifecycle:**
- A new finding is `open`.
- `waiting` means fixed on our side while Google's last look still shows the old problem: our crawl gets a 200 where Google saw a 404 or redirect (I2), our robots.txt allows the URL (I7), or our canonical is now self (I5). It is not counted as an issue, is re-inspected first, and becomes `fixed` once Google agrees.
- One that stops firing becomes `fixed`.
- A fixed one that fires again reopens.
- **Ignore** is for intended cases. An ignored finding stays ignored until its substance changes (for example, a redirect target or the list of competing pages), and then it reopens.
- Analyze never resolves findings when it loaded zero URLs, so a failed sitemap fetch cannot clear the list.

## For Claude sessions

Open issues live in `seo_findings` (status `open`). Query them with `mcp__supabase-prod__execute_sql`, fix the code, and the next daily run closes them. For example:

```sql
select rule_id, severity, url, title, detail from seo_findings
where status = 'open' order by severity, rule_id limit 100;
```
