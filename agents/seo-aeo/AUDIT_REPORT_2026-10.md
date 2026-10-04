# SEO and AEO audit: city ranking plan vs the code (2026-10-03)

Source plan: `apps/marketing/Docs/Improvement03Nov26/NERAM_SEO_AEO_CITY_PLAN.md` (written outside the repo).
Checked against the code on `main` and the live sites with curl and `gh` on 2026-10-03.
Status values: Exists, Partial, Missing, Broken. Work done in this pass is marked **Fixed (uncommitted)**.

## Summary

Most of what the plan asks for already existed (commit 6275cd33): 36 state hubs, 741 Indian and 32 Gulf city pages, an index gate, split sitemaps, llms.txt routes, IndexNow, answer-first blocks, demo, callback and visit APIs, and consent fields on testimonials. The real problems were:

1. Production marketing was never deployed with that work. The `main` deploy of 6275cd33 failed only at Deploy Marketing ("Node.js Version 20.x is discontinued", GHA run 36828739165). The Node 22 pin went to staging in 3c921e96; `origin/main` does not have it.
2. Live 301s sent likely ranking URLs to 404.
3. The site contradicted itself (99.9%, 10,000+, 150+ cities, #1, 4.9/5) while llms.txt and the schema said otherwise.
4. Up to three pages competed for each classroom city.
5. AI-drafted, unchecked city content was enough to index a page.

## Status table

| Area | Item | Status | Location | Notes | Priority |
|---|---|---|---|---|---|
| Crawl | Bots get 200 (Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Applebot) | Exists | live, both domains | curl 2026-10-03: all 200. The old app 403 is gone. | P2 |
| Crawl | robots.txt names the AI bots | **Fixed (uncommitted)** | `apps/marketing/src/app/robots.ts`, `apps/app/src/app/robots.ts` | Added Claude-SearchBot, Claude-User, Perplexity-User, Applebot. | P2 |
| Deploy | Production marketing runs the location build | Broken | GHA 36828739165 | Prod still serves the old public/llms.txt and old sitemap. See "Deploy steps" below. | P0 |
| Crawl | Legacy redirects | **Fixed (uncommitted)** | `apps/marketing/next.config.js`, `lib/seo/location-pages.ts` | `/nata-coaching-in-chennai` and `/nata-coaching-center-in-tamil-nadu` went to `...centers-in-in-...` (404) on prod and staging. Now one hop to the real page; the city route also heals doubled slugs. | P0 |
| Crawl | Sitemaps | Partial, **video sitemap added** | `lib/seo/sitemaps.ts`, `app/sitemaps/*` | Split by section, not language (location pages are English only, so a per-language split adds nothing). Lastmod comes from content dates. | P2 |
| Crawl | IndexNow | Exists | `app/api/cron/indexnow` | Daily cron, follows the index. | P2 |
| Crawl | llms.txt | Exists on staging, **centre links fixed** | `lib/seo/llms.ts` | Centres now link to their city page with the street address. | P1 |
| Crawl | Canonical and hreflang | Exists | `lib/seo/metadata.ts` | Location pages are English only; non-English copies 301 to English. | P2 |
| Content | One fact source | **Fixed (uncommitted)** | `lib/seo/facts.ts` `PROOF_POINTS`, `lib/seo/claims.test.ts` | Founder-confirmed claims only: 10+ years, 1,000+ students, AIR 1 in JEE B.Arch 2024. Removed 99.9%, 10,000+, 5,000+, 150+ cities, #1, 15+/16+/17+ years, 4.9/5 and "AIR 1 & 2" from about 30 files. The test fails the build if one returns. | P0 |
| Location | One page per classroom city | **Fixed (uncommitted)** | `next.config.js`, `data/centre-pages.json` | `/contact/{centre}` (titled "Best NATA Coaching Center in X") and the Tambaram area guide 301 to the city page. | P0 |
| Location | "Classroom" only on real centres | **Fixed (uncommitted)** | `lib/seo/location-facts.ts` | Mode was "classroom" within 15 km, so Bengaluru Rural read "Classroom and Online". Now only the centre's own city page says classroom. | P1 |
| Location | Duplicate GeoNames places | **Fixed (uncommitted)** | `MERGED_CITY_SLUGS` in `lib/seo/location-pages.ts` | bengaluru-rural (same point as Bangalore), mormugao, gadag-betageri 301 to one page each. | P1 |
| Location | Visit section on centre pages | **Fixed (uncommitted)** | `components/coaching-location/CentreVisit.tsx` | Address, hours, phone, directions, visit booking (`/api/centers/visit`). No map iframe. | P1 |
| Location | Uniqueness gate | **Adapted (uncommitted)** | `lib/seo/location-gate.ts`, `lib/seo/location-similarity.ts` | Kept the fact gate. Unreviewed AI content is now a weak fact. JEE city pages index only with a classroom. Pages above 60% shared text leave the index (strongest of each cluster stays). | P0 |
| Location | Last updated and sources | **Fixed (uncommitted)** | `UpdatedLine` in `components/coaching-location/parts.tsx` | City and state pages. | P1 |
| Location | Students from the city | **Built, data-gated** | `loadLocalReviews` in `lib/reviews/data.ts` | Published and moderated testimonials only; falls back to the state with a label. Shows nothing until staff confirm reviews. | P1 |
| Location | City videos | **Built, data-gated** | `lib/seo/location-videos.ts`, `ClassVideo.tsx`, migration 20261029090100 | Click-to-load player, VideoObject, video sitemap. Needs `social_proofs.city_slug` tags. | P2 |
| Schema | Organization on every page | **Fixed (uncommitted)** | `app/[locale]/layout.tsx` | One `#organization` node site-wide. | P1 |
| Schema | Centre LocalBusiness | **Fixed (uncommitted)** | `generateCentreSchema` in `lib/seo/schemas.ts` | `EducationalOrganization` + `LocalBusiness` on the centre's city page, only with a street address and pincode. The course's blended instance points at its `@id`. No AggregateRating anywhere for Neram. | P1 |
| Schema | Shared GBP links | **Guarded (uncommitted)** | `dropSharedProfiles` in `lib/seo/facts.ts` | Prod: both Pudukkottai rows share one GBP link; Kanchipuram carries Tambaram's. Shared links are dropped until staff fix the rows. | P1 |
| Schema | Event for demos | Not done | | Low value; Google rarely shows it for this category. | P2 |
| Perf | YouTube facade | **Fixed (uncommitted)** | `ClassVideo.tsx` | The demo page iframe now loads on tap. | P2 |
| Conversion | WhatsApp per city, page code, tracked | **Fixed (uncommitted)** | `lib/whatsapp.ts`, `WhatsAppLinkButton.tsx`, `lib/whatsapp-track.ts` | One builder for all 6 old hard-coded links. City pages: WhatsApp in the hero and mobile sticky bar with codes like `EN-MDU`. Clicks log `whatsapp_clicked` (first party). | P1 |
| Conversion | Family demo | Partial, **parent fields added** | `DemoClassPageContent.tsx`, migration 20261029090000 | Optional parent name, parent mobile, class language. YouTube Live registration is a separate project. | P2 |
| Attribution | First and last touch, AI channel | **Fixed (uncommitted)** | `lib/attribution.ts` (`classifyChannel`, `captureTouch`), `lib/lead-touch.ts` | Stored on demo, callback, assistance and visit leads. | P1 |
| Analytics | PostHog and Clarity | Not adopted | | First-party only (lifecycle decision 2026-09-25). | n/a |
| Admin | Leads by channel and city | Missing | | Next step once leads carry `channel`. | P2 |

## Index effect (staging data, `LOCATION_READINESS.md`)

| | Pages | Indexed before | Indexed now |
|---|---|---|---|
| NATA city pages | 770 | 231 | 130 |
| JEE Paper 2 city pages | 738 | 168 | 9 |
| State hubs (NATA) | 36 | 28 | 28 |

Pages leave the index with `noindex, follow`; they stay reachable and return as soon as staff review their content or real facts arrive.

## Top 10 issues by impact

1. Production marketing is not on the location build (failed deploy).
2. Legacy 301s to 404 on live URLs.
3. Contradicting claims across the homepage, llms.txt, schema and blog.
4. Two or three pages per classroom city.
5. Unchecked AI content indexing pages.
6. Two centres sharing one Google profile link; Bangalore HQ and Tiruppur have none.
7. No city-tagged reviews or videos, so city pages carry no local proof yet.
8. "Classroom" wording on places without a classroom.
9. No first-touch attribution or AI channel on leads.
10. WhatsApp links fixed text, no city, no tracking.

## Deploy steps (founder runs these)

1. Reconcile `main`: local `main` has 3c921e96 (Node 22 pin) but not 4f98a8f2; `origin/main` is the reverse. `git pull` (merge, never stash).
2. Confirm `apps/marketing/package.json` engines is `22.x`. Also set Node 22 in the neram-marketing Vercel project settings.
3. Check Search Console clicks for `/contact/*` and `/coaching/nata-coaching-chennai/tambaram` before the 301s ship.
4. Apply migrations 20261029090000 and 20261029090100 to production (already on staging).
5. `pnpm deploy:prod` only when the founder says so.

The data needed from the founder is listed in `PROGRESS.md`.
