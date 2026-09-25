# NATA coaching ranking strategy (SEO and AEO), 2026-09-24

**Goal:** Neram Classes appears first when anyone in India searches "NATA coaching", "online NATA coaching" or "NATA coaching in {city or state}". It should also be the institute that ChatGPT, Gemini, Perplexity and Google AI Overviews name when asked the same question.

**Basis:** the marketing audit of 2026-09-24 (`docs/audits/perf/marketing/reports/2026-09-24.md`, findings PERF-0004 to PERF-0044) and a live check of neramclasses.com.

**No site can be guaranteed position 1.** This plan removes everything that currently stops Neram from ranking and then builds the signals that decide the top spot: relevance, trust and reviews, links, and speed. Progress is measured monthly (section 8).

## 1. Where we stand

**Working in our favour:**
- There is a large, genuinely useful exam content library: NATA 2026 guides, counselling for 30 states, a college hub with about 186 colleges, and free tools.
- Answer blocks and FAQs are already on city and online pages.
- AI crawlers are allowed in robots.txt.
- The site has an llms.txt.

**What is holding rankings back right now:**

| Problem | Finding | Effect on ranking |
|---|---|---|
| All 22 "NATA coaching in {state}" pages declare their canonical as `/coaching/nata-coaching-in-undefined` | PERF-0004 | Zero state rankings possible |
| robots.txt blocks `/_next/` (CSS and JS) | PERF-0010 | Google renders unstyled pages |
| Three city page systems, up to 8 pages per city | PERF-0014 | Signals split, none reaches page 1 |
| Hard-coded 4.8 from 2,500 and 4.9 from 90 ratings in schema | PERF-0015 | Manual-action risk to all rich results |
| 40 sitemap URLs 404, a Chennai money page 404s, the logo 404s | PERF-0011, 0012, 0013 | Lower crawl trust, no logo in results |
| About 43 indexed city pages with only the name changed, some claiming a centre that does not exist | PERF-0031 | Doorway and helpful-content risk |
| Brand name twice in titles | PERF-0029 | Lower click-through |
| Heavy global JS and a hidden LCP hero | PERF-0017, 0018 | Weaker Core Web Vitals on phones |
| NAP (name, address, phone) differs across schema, llms.txt and pages. Claims such as "centres in 150+ cities" conflict with the 10 real centres | SEO pass | Weak entity for Google and AI assistants |

## 2. Keyword map: one page per intent

Each search intent gets exactly one target page. Every other page that touches the topic links to that page instead of competing with it.

| Search intent (examples) | Target page | H1 pattern |
|---|---|---|
| NATA coaching; best NATA coaching in India; NATA coaching institute | `/` (home) | "NATA Coaching for Architecture Aspirants, Online and in Classroom" |
| online NATA coaching; NATA online classes; best online NATA coaching | `/nata-online-coaching` | "Online NATA Coaching with Live Classes and Drawing Feedback" |
| NATA coaching in {state} | `/coaching/nata-coaching-in-{state}` (36 states and UTs) | "NATA Coaching in {State}" |
| NATA coaching in {city}; NATA classes near me | One city page per city (decision in section 3) | "NATA Coaching in {City}" |
| NATA coaching centre {area}; Neram {city} address | `/contact/{centre-slug}` (the 10 real centres) | "Neram Classes {Area}, {City}" |
| NATA coaching fees | `/fees`, linked from every coaching page | "NATA Coaching Fees 2026" |
| NATA crash course; NATA 2027 coaching | `/courses/architecture-entrance-crash-course`, `/courses/architecture-entrance-year-long` | Course name with "NATA" in it |
| NATA drawing classes online | New section on `/nata-online-coaching`, or a new `/nata-drawing-classes` page if volume justifies it | |
| NATA coaching in Tamil or Hindi | `/ta/nata-online-coaching`, `/hi/nata-online-coaching` (real translations only) | |
| JEE Paper 2 (B.Arch) coaching | `/jee-paper-2-preparation` | |

**Rules for every target page:**
- The title starts with the keyword and stays under 60 characters, with no second brand suffix.
- The first 100 words answer the query directly.
- The page states fees, mode (online, classroom, hybrid) and batch dates.
- It links to its parent hub and its children.

## 3. Site architecture: consolidate, then expand

**Step 1: consolidate city pages (PERF-0014).** Pick one surviving URL pattern per city.
- **Default choice:** `/coaching/nata-coaching/nata-coaching-centers-in-{city}` (System B). It covers 83 cities and has been in the sitemap longest.
- **Check before the 301s:** Search Console clicks per URL over the last 90 days. If System A (`/nata-coaching/{city}`) earns more, keep A instead.
- **Then:**
  - Merge the unique content of the losing page into the survivor, and 301 the loser.
  - Retire `/nata-coaching-centers-in-chennai`, `/coaching/best-nata-coaching-chennai` and `/blog/best-nata-coaching-chennai` into the Chennai hub. Keep the 6 Chennai neighbourhood pages as children that link up to it.
  - Give each business one LocalBusiness `@id`, on `/contact/{slug}` only.

**Step 2: fix and complete the state layer (PERF-0004).**
- Move the route so the state is read correctly (the URL stays the same through a rewrite).
- Add the 14 missing states and UTs: Goa, Himachal Pradesh, Arunachal Pradesh, Manipur, Meghalaya, Mizoram, Nagaland, Sikkim, Tripura, Jammu and Kashmir, Ladakh, Andaman and Nicobar, Lakshadweep, Dadra and Nagar Haveli and Daman and Diu.
- Each state page carries unique content:
  - the B.Arch colleges in the state and the counselling that fills them (link the existing `/counseling/{state}-barch` page)
  - the NATA exam centres in the state
  - the city pages in the state
  - fees
  - an honest statement of the mode ("online, with live drawing review")

**Step 3: expand cities with unique content only (PERF-0031).**
- **Priority additions** (have a B.Arch college or exam centre nearby): Roorkee, Kharagpur, Rourkela, Hamirpur, Srinagar, Jammu, Panaji, Shimla, Gwalior, Jabalpur, Bhilai, Kota, Jodhpur, Udaipur, Varanasi, Prayagraj, Agra, Jamshedpur, Cuttack, Siliguri, Mohali, Jalandhar, Navi Mumbai, Kolhapur, Gandhinagar, Shillong, Agartala.
- **Alternate spellings** (Bengaluru, Gurugram, Trivandrum, Calicut, Vizag, Mysuru) get a redirect or an alias to the main city page, never a separate page.
- **Every new city page needs at least:**
  - the local B.Arch colleges and their cutoffs (from the college hub)
  - the nearest NATA exam centre
  - class timings in local context
  - a local student result or testimonial, when one exists
  - an FAQ written for that city
- A city with no unique content yet stays `noindex` until it has some.
- **Build rule (15k-file Vercel cap):** new pages render on first visit and are cached (`revalidate`, no `generateStaticParams`).

**Step 4: link the graph (PERF-0041).**
- **Home** links to `/nata-online-coaching`, the state hubs, the top 12 cities and fees.
- **Every NATA 2026 guide** (17 pages, the site's biggest traffic source) ends with a "Prepare with Neram" block linking `/nata-online-coaching` and the reader's state hub.
- **Coaching pages** show visible breadcrumbs: Home > NATA Coaching > {State} > {City}.
- **Clean up:** remove internal links to redirected URLs, including `/coaching/nata-coaching`, `/coaching/best-nata-coaching-india` and `/best-nata-coaching-online`.

## 4. Technical fixes (week 1)

These unblock everything else, and each is small.
1. **PERF-0004:** state route fix.
2. **PERF-0010:** remove `Disallow: /_next/`.
3. **PERF-0011, PERF-0012:** redirect exclusion and sitemap course slugs.
4. **PERF-0013:** add `public/logo.png` (512x512) and `public/og-default.png` (1200x630).
5. **PERF-0029:** remove the double brand in titles.
6. **PERF-0030:** hreflang only for indexable locales, plus `x-default`.
7. **PERF-0040:** sitemap cached daily, real `lastmod` from `updated_at`, split by type, with `/testimonials` and `/achievements` added.
8. **PERF-0018, PERF-0016, PERF-0017:** visible LCP hero, server-rendered banners, lighter global bundle. Then confirm with PageSpeed on `/`, `/nata-online-coaching`, one city page and one state page (mobile).
9. **PERF-0044:** point `.github/workflows/seo-automation.yml` at those four URLs.

## 5. Structured data that earns trust (PERF-0015)

- **Organization** (once, on the home page, `@id` `https://neramclasses.com/#organization`):
  - legal name, founding year and founder
  - the logo PNG
  - `sameAs`: YouTube, Instagram, LinkedIn, Google Business Profiles, Wikidata once created
  - one head-office address that matches the Google Business Profile exactly
- **EducationalOrganization and LocalBusiness:** only on the 10 real centre pages, with the exact GBP address, phone and real opening hours.
- **Course** on `/nata-online-coaching` and the course pages:
  - `provider` pointing to the Organization
  - `offers` with the real fee in INR
  - `hasCourseInstance` with `courseMode: online` (or `blended`), `courseSchedule` and start dates
  - a real instructor Person
- **Online city and state pages:** `Service` or `Course` with `areaServed` set to the city or state. Never LocalBusiness without a centre.
- **Ratings:** remove every hard-coded `aggregateRating`. Add one back only when it is computed from reviews that are visible on the same page.
- **Keep:** FAQPage (Google shows it rarely now, but AI assistants read it), BreadcrumbList, VideoObject for solution and demo videos, and Article with a real Person author on blog and guides.

## 6. Off-page: what decides first place

1. **Google Business Profile for each of the 10 real centres.** Verify, use the same name and address as the site, choose the categories "Coaching center" and "Educational institution", add photos and weekly posts. Use the checklist in `agents/seo-aeo/outreach/gbp-claim-checklist.md`.
2. **Reviews.** Ask every student for a Google review at three points: after the demo class, after the first mock test score, and after results (a WhatsApp nudge through the existing Neram Assistant flow). Target at least 30 new reviews per centre in 90 days. Reply to every review. Reviews are the strongest local ranking signal and what AI assistants quote.
3. **Links from the architecture world.**
   - Partner colleges in the college hub (College Outreach v2 already emails them) can link to their Neram college page.
   - Toppers' results can be pitched to education news sites (`agents/seo-aeo/outreach/press-release-topper.md`).
   - Guest guides can go to architecture blogs.
   - Use the templates in `agents/seo-aeo/outreach/backlink-outreach-emails.md`.
4. **Consistent listings (citations).** Use identical NAP on Justdial, Sulekha, Shiksha, CollegeDunia, Careers360 and UrbanPro for each centre.
5. **YouTube.** Each NATA solution video links to the matching guide and to `/nata-online-coaching`, and the channel is in `sameAs`. Video results often rank above web results for "NATA drawing classes".

## 7. AEO: being the answer in AI assistants

AI assistants build answers from three sources: pages they can parse, third-party lists they trust, and a consistent entity.
1. **Answer-first content.**
   - Every coaching page opens with a 2 to 3 sentence answer to "Which is the best NATA coaching in {place}?" that states facts: years running, results, mode, fees, batch dates.
   - Follow with a comparison table. AI systems quote tables and lists.
2. **Facts that match everywhere.** Use one founding year, one head-office address, one real centre count and one fee table on every page, in llms.txt, in schema and on GBP. Remove unverifiable claims ("#1", "99.9%", "150+ cities" with centres).
3. **Fix llms.txt and llms-full.txt.**
   - List the canonical money pages (`/nata-online-coaching`, the state hubs, the city pages, fees, results) and remove redirected URLs.
   - Add a short factual profile: what Neram teaches, where, how, for how much, and verified results.
4. **Third-party presence.**
   - Answer genuine NATA questions on Quora and Reddit (r/Indian_Academia, r/JEENEETards) under a named faculty account (`agents/seo-aeo/outreach/quora-shiksha-qa-playbook.md`).
   - Get Neram included in third-party "best NATA coaching in India" lists. AI assistants lean heavily on these.
5. **Entity.** Create a Wikidata item for Neram Classes, with founder, founding date, website and social profiles, and add it to `sameAs`.
6. **Bing matters for ChatGPT.**
   - The daily IndexNow cron already submits the sitemap. Once the sitemap is fixed (PERF-0012, PERF-0040), that keeps Bing current.
   - Verify the site in Bing Webmaster Tools.
7. **Author trust (E-E-A-T).**
   - Render the existing `AuthorBox` on guides and blog posts with real faculty names, qualifications (B.Arch, M.Arch, COA registration) and photos.
   - Publish a results page that lists topper names, scores and colleges, with consent.

## 8. Measurement

- **Google Search Console.** Track queries containing "nata coaching" by page and by state (use the Country filter for India plus query filters for each state and city). Watch impressions first; clicks follow.
- **Rank tracking** for a fixed set of 40 keywords, checked monthly:
  - the head terms
  - "online NATA coaching"
  - the top 15 cities
  - the top 10 states
- **AI visibility check, monthly:** ask ChatGPT, Gemini, Perplexity and Google (AI Overview) "best NATA coaching in India", "best online NATA coaching" and "NATA coaching in {3 cities}". Record whether Neram is named and which source is cited.
- **Core Web Vitals:** track the field data (CrUX) for the four monitored URLs in Search Console.

## 9. Timeline

| When | Work | Outcome to expect |
|---|---|---|
| Week 1 | Technical fixes (section 4). Remove fake ratings. | State pages indexable again; clean sitemap; no crawl errors |
| Weeks 2 to 4 | City consolidation and 301s, state content for all 36, internal links, llms.txt, NAP cleanup, GBP verification | Impressions rise for state and city queries; short ranking wobble after the 301s |
| Months 2 to 3 | Unique content for about 30 new cities, review campaign, citations, first outreach links, author boxes | Page 1 for long-tail city and state queries; map pack entries for centre cities |
| Months 3 to 6 | Links and PR from results season, YouTube cross-linking, third-party list inclusion, Wikidata | Competing for the top 3 on "NATA coaching" and "online NATA coaching"; named in AI answers |

**Ownership:**
- Marketing Dev: sections 3 to 5 and the week 1 fixes.
- SEO/AEO agent: sections 2, 6, 7 and 8.
- Staff: GBP, reviews and outreach (these cannot be automated).
