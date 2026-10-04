# Neram Classes: SEO + AEO City Ranking Plan

> Instructions file for Claude Code. Goal: make neramclasses.com rank on Google and get recommended by ChatGPT, Claude, Perplexity, Gemini and Google AI Overviews for NATA coaching (online and offline) across India, with Tamil Nadu as the main hub and Karnataka as the second.

---

## 0. How to use this file

1. Read this whole file, then read the repo's existing `CLAUDE.md`, the Turborepo structure, and the `neramclasses.com` app.
2. Run **Phase 0 (Audit)** first. Do not change code during the audit.
3. Write findings to `docs/seo/AUDIT_REPORT.md` using the status table format in Phase 0.
4. Stop and show the audit report to Hari before starting Phase 1.
5. Work phase by phase. After each phase, update `docs/seo/PROGRESS.md` with what was done, what is pending, and what needs data from Hari.

---

## 1. Business facts (source of truth)

### Physical classrooms (offline + online)

| Center | State | Slug | Search spellings to cover in content |
|---|---|---|---|
| Chennai | Tamil Nadu | `chennai` | Chennai, Madras |
| Tambaram | Tamil Nadu | `tambaram` (locality under Chennai) | Tambaram, South Chennai, Chengalpattu |
| Pudukkottai | Tamil Nadu | `pudukkottai` | Pudukkottai, Pudukottai |
| Coimbatore | Tamil Nadu | `coimbatore` | Coimbatore, Kovai |
| Tiruchirappalli | Tamil Nadu | `trichy` | Trichy, Tiruchirappalli, Tiruchi |
| Madurai | Tamil Nadu | `madurai` | Madurai |
| Tiruppur | Tamil Nadu | `tiruppur` | Tiruppur, Tirupur |
| Bengaluru | Karnataka | `bengaluru` | Bangalore, Bengaluru |

All other cities are **online only**. Never say or imply offline classes, a center, or a local address for any city not in this table.

### Proof points (use exactly, do not inflate)

- 10+ years running
- 1,000+ students taught
- AIR 1 in JEE B.Arch 2024
- Microsoft Education partnership

### Languages

| Language | Use | Review |
|---|---|---|
| English | All pages | Default |
| Tamil (`ta`) | All Tamil Nadu pages | Neram team reviews before publish |
| Kannada (`kn`) | Karnataka pages | Kannada-speaking staff reviews before publish |
| Hindi (`hi`) | Hindi-belt state pages (Wave 3) | AI-translated, flagged `needs_review: true` until reviewed |

### Primary keywords

- NATA coaching in {city}
- NATA coaching centre in {city} / near me (center cities only)
- Online NATA coaching {state / India}
- Best NATA coaching in {city / state / India}
- NATA classes {city}, NATA drawing classes {city}
- B.Arch entrance coaching {city}
- JEE Paper 2 (B.Arch) coaching {city} (secondary)
- Local language equivalents, for example "NATA பயிற்சி மையம் சென்னை", "NATA ಕೋಚಿಂಗ್ ಬೆಂಗಳೂರು", "NATA कोचिंग दिल्ली"

---

## 2. Guardrails (must follow)

1. **No fabrication.** Never invent addresses, phone numbers, student names, results, reviews, cutoffs, college lists, exam centres, fees or statistics. If data is missing, insert `{{DATA_NEEDED: description}}` and list it in `PROGRESS.md`.
2. **No doorway pages.** A city page is never just a template with the city name swapped. See the uniqueness gate in Phase 5.
3. **No fake local presence.** Offline wording, LocalBusiness schema, maps and addresses only for the 8 centers above.
4. **No self-serving rating markup.** Do not add AggregateRating or Review schema for Neram's own business. Show real reviews visually only.
5. **No em dashes in user-facing copy.** Use commas, colons, or separate sentences.
6. **No AI filler phrases** in copy, for example: "in today's competitive world", "unlock your potential", "look no further", "embark on a journey", "comprehensive guide", "dive into", "elevate".
7. **Preserve existing URLs that already rank.** Check Search Console data or existing routes first. If a URL must change, add a 301 redirect.
8. **Do not break existing schema, llms.txt, hreflang or AI crawler rules.** Extend them.
9. **Every fact that changes yearly** (exam dates, cutoffs, fees, exam centres) shows a visible "Last updated" date and a source.

---

## 3. Phase 0: Audit the current implementation

Check each item and record status as `Exists`, `Partial`, `Missing` or `Broken`, with file paths and notes.

### 3.1 Crawlability and indexing

- [ ] `robots.txt` on neramclasses.com and app.neramclasses.com: allows Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot
- [ ] Cloudflare Bot Fight Mode / WAF: test with `curl -A "<bot user agent>" -I https://...` for each bot above on both domains. Previously app.neramclasses.com returned 403 to all bots. Confirm whether fixed.
- [ ] XML sitemaps: exist, split by language, accurate `lastmod`, submitted to Google Search Console and Bing Webmaster Tools (ask Hari to confirm GSC/Bing access)
- [ ] IndexNow implemented (key file + ping on publish)
- [ ] Canonical tags correct on all pages, no duplicates across languages
- [ ] hreflang: correct pairs, `x-default` set, return links valid
- [ ] `llms.txt` (and `llms-full.txt` if present): content current, includes centers and key pages
- [ ] No important content rendered client-side only (check page source / SSR or SSG for key pages)

### 3.2 Existing location pages

- [ ] List all existing city, district or state pages (the 38-district TN plan may already exist partly)
- [ ] For each: URL, word count, unique local data points present, schema present, internal links in/out, indexed or not
- [ ] Measure similarity between location pages (see Phase 5 script). Flag any pair above 60% text similarity.

### 3.3 Structured data

- [ ] EducationalOrganization (org level): name, logo, url, sameAs (YouTube, Instagram, Facebook, LinkedIn, GBP links), foundingDate, contact
- [ ] WebSite, BreadcrumbList, SoftwareApplication: confirm valid
- [ ] Course / CourseInstance: present or missing
- [ ] LocalBusiness for centers: present or missing
- [ ] FAQPage, VideoObject, Event: present or missing
- [ ] Validate with schema.org validator logic (JSON-LD parses, required fields present)

### 3.4 Performance (mobile first, 95% of users are on phones)

- [ ] Core Web Vitals on home, a location page and the fee page: LCP < 2.5s, INP < 200ms, CLS < 0.1 on a mid-range Android profile
- [ ] YouTube embeds: using a lightweight facade (click to load) or full iframe on load
- [ ] Images: next/image, correct sizes, modern formats, alt text

### 3.5 Content and AEO readiness

- [ ] Each key page has an answer-first block (2 to 3 sentence direct answer near the top)
- [ ] FAQ sections present and written as real questions
- [ ] Visible "Last updated" dates on time-sensitive pages
- [ ] A NATA facts hub exists (exam pattern, dates, eligibility, syllabus, colleges, cutoffs)
- [ ] Results, reviews and faculty pages exist and are linked from location pages

### 3.6 Conversion and tracking

- [ ] WhatsApp buttons: present, pre-filled text, includes city and language
- [ ] Demo booking: exists, working or broken, collects parent details or not
- [ ] Lead source tagging: UTM capture, landing page, referrer, language, first-touch and last-touch
- [ ] AI referrer detection (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com)
- [ ] PostHog and Microsoft Clarity installed on marketing site, key events defined

### Audit report format

```
| Area | Item | Status | Location (file/URL) | Notes | Priority (P0/P1/P2) |
```

End the report with: top 10 issues by impact, and a list of `DATA_NEEDED` items.

---

## 4. Phase 1: Technical foundations (fix first)

1. Fix any bot blocking found in 3.1. Write the exact Cloudflare settings change Hari must make if it can't be done in code (WAF skip rule for verified bots and named AI crawlers).
2. Sitemaps: `sitemap-index.xml` with `sitemap-en.xml`, `sitemap-ta.xml`, `sitemap-kn.xml`, `sitemap-hi.xml`, `sitemap-locations.xml`, `sitemap-videos.xml`. Accurate `lastmod` from content update time, not build time.
3. IndexNow: generate key, host key file, ping on page publish or update (Bing, Yandex share it; Bing feeds ChatGPT search).
4. Update `llms.txt`: short description of Neram, the 8 centers with city links, online coaching page, NATA facts hub, results page, fee page, contact.
5. Performance fixes from 3.4.

**Acceptance:** all target bots get 200 on key pages from both domains; sitemaps valid; CWV pass on mobile for the 3 test pages.

---

## 5. Phase 2: Information architecture

### URL structure

Check existing routes first. Use these if nothing ranks yet, otherwise map existing URLs to this structure with 301s.

```
/nata-coaching                                   National hub (online + all centers)
/nata-coaching/online                            Online NATA coaching India
/nata-coaching/tamil-nadu                        State hub
/nata-coaching/tamil-nadu/chennai                Center page
/nata-coaching/tamil-nadu/chennai/tambaram       Locality center page
/nata-coaching/tamil-nadu/pudukkottai            Center page
/nata-coaching/tamil-nadu/coimbatore             Center page
/nata-coaching/tamil-nadu/trichy                 Center page
/nata-coaching/tamil-nadu/madurai                Center page
/nata-coaching/tamil-nadu/tiruppur               Center page
/nata-coaching/tamil-nadu/{city}                 Online-only city page
/nata-coaching/karnataka                         State hub
/nata-coaching/karnataka/bengaluru               Center page
/nata-coaching/karnataka/{city}                  Online-only city page
/nata-coaching/{state}                           Other state hubs
/nata-coaching/gulf/{country}                    NRI pages
/nata                                            NATA facts hub (exam, dates, syllabus, colleges)

/ta/...   Tamil versions
/kn/...   Kannada versions
/hi/...   Hindi versions
```

### Chennai and Tambaram (avoid competing with yourself)

- Chennai page targets "NATA coaching Chennai" and lists both centers, with Tambaram as a section linking to its page.
- Tambaram page targets "NATA coaching Tambaram", "South Chennai", "Chengalpattu", "near Tambaram".
- Different hero copy, different FAQs, different local data (nearby colleges and schools differ).

### Internal linking

- National hub links to all state hubs and all 8 center pages
- State hub links to every city page in that state
- Each online-only city page links to its nearest center page ("Want to visit? Our nearest classroom is in Madurai, about X km away")
- Every location page links to: results, fees, NATA facts hub, demo booking, faculty
- NATA facts hub and blog posts link back to relevant city pages with natural anchor text

### Rollout waves

| Wave | Pages | Languages |
|---|---|---|
| 1 | National hub, Online page, NATA facts hub, TN hub, Karnataka hub, 8 center pages | en, ta (TN), kn (Bengaluru) |
| 2 | TN online cities: Salem, Erode, Tirunelveli, Thanjavur, Vellore, Karur, Dindigul, Namakkal, Kanchipuram, Thoothukudi, Kumbakonam, Nagercoil. Karnataka: Mysuru, Mangaluru, Hubballi-Dharwad, Belagavi, Davangere | en, ta / kn |
| 3 | Kerala, Andhra Pradesh, Telangana, Maharashtra state hubs + major cities (Kochi, Thiruvananthapuram, Hyderabad, Visakhapatnam, Vijayawada, Pune, Mumbai) | en |
| 4 | Hindi belt state hubs: Delhi NCR, Rajasthan, Uttar Pradesh, Bihar, Madhya Pradesh, Gujarat. Cities only after GSC shows impressions | en, hi |
| 5 | Gulf: UAE, Saudi Arabia, Qatar, Kuwait, Oman, Bahrain | en |

Wave 2 onward: only publish a city once it passes the uniqueness gate.

---

## 6. Phase 3: Data model

Store location content as structured data (Supabase), not hardcoded text, so pages stay accurate and the uniqueness gate can count data points. Adjust to existing schema if similar tables exist.

```sql
-- Locations
create table seo_locations (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  parent_slug text,                -- state slug, or city slug for localities
  type text not null check (type in ('national','state','city','locality','country')),
  name_en text not null,
  name_ta text, name_kn text, name_hi text,
  alt_names text[],                -- Bangalore, Tirupur, Kovai etc.
  state text,
  has_center boolean default false,
  nearest_center_slug text,
  distance_to_center_km numeric,
  lat numeric, lng numeric,
  languages text[] default '{en}',
  status text default 'draft' check (status in ('draft','review','published','noindex')),
  last_reviewed_at timestamptz
);

-- Centers (only the 8 real classrooms)
create table seo_centers (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null,
  name text not null,
  address text not null,           -- DATA_NEEDED
  pincode text,
  phone text,                      -- DATA_NEEDED
  whatsapp text,
  lat numeric, lng numeric,
  opening_hours jsonb,
  gbp_url text,                    -- Google Business Profile link
  photos text[],
  visit_booking_enabled boolean default true
);

-- Architecture colleges near each location
create table seo_colleges (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null,
  name text not null,
  city text,
  type text,                       -- government, aided, private, deemed
  accepts text[],                  -- NATA, JEE Paper 2
  cutoff_note text,
  cutoff_year int,
  source_url text not null,        -- COA approved list or official counselling data
  last_verified_at date
);

-- NATA exam centres per location
create table seo_exam_centres (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null,
  exam text default 'NATA',
  year int,
  centre_name text,
  source_url text not null
);

-- Testimonials and results with location
create table seo_testimonials (
  id uuid primary key default gen_random_uuid(),
  location_slug text,
  student_name text,
  person_type text check (person_type in ('student','parent')),
  result text,                     -- e.g. "NATA 2025: 142", "Admitted to ..."
  quote text,
  language text,
  video_url text,
  consent_obtained boolean not null default false,
  year int
);

-- Videos
create table seo_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_id text not null,
  title text, description text,
  language text,
  location_slug text,              -- null for general videos
  type text,                       -- class_clip, review, short, demo_live
  duration_seconds int,
  upload_date date,
  transcript text
);

-- Location FAQs
create table seo_faqs (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null,
  language text not null,
  question text not null,
  answer text not null,            -- 2 to 4 sentences, direct answer first
  sort_order int
);

-- Local context (anything unique to the place)
create table seo_local_facts (
  id uuid primary key default gen_random_uuid(),
  location_slug text not null,
  fact_type text,                  -- board_calendar, travel, coaching_cost_comparison, local_note
  content_en text,
  content_local text,
  source_url text
);
```

Only show testimonials where `consent_obtained = true`.

---

## 7. Phase 4: Location page template

Build one reusable template that renders differently based on `type` and `has_center`. Mobile first, Fluent-consistent if the marketing site already uses it, otherwise match the existing design system.

### Section order: center city page

1. **Hero**
   - H1: "NATA Coaching in {City}" (local language version on localized page)
   - One proof line: "{N}+ years, 1,000+ students, AIR 1 in JEE B.Arch 2024"
   - Two buttons: **Book a family demo** (primary), **WhatsApp us** (secondary)
   - Small line: "Classroom in {City} + live online classes"
2. **Answer-first block** (for Google snippets and AI tools)
   - 2 to 3 sentences: what Neram offers in this city, modes, who teaches, how to start. Factual, no hype.
3. **Watch a real class**
   - 1 to 3 videos, local language first. Lightweight YouTube facade (load iframe on click).
4. **Visit our {City} classroom**
   - Address, map, photos, timings, "Book a center visit" button, link to Google Business Profile
5. **Students from {City}**
   - Real results and reviews from that city or district. If fewer than 2, show state-level and label them as "Students from Tamil Nadu".
6. **Architecture colleges near {City}**
   - Table: college, type, accepts NATA / JEE Paper 2, last cutoff note, source link, last verified date
7. **NATA exam centres in {City}** (with year and source)
8. **Batches and modes**
   - Classroom, online, hybrid. Start dates. Link to course selector.
9. **Fees and value**
   - Short breakdown, installments, comparison note (local data), link to full fee page
10. **FAQ** (local, in that language)
11. **Final CTA**: family demo booking with language and slot choice

### Section order: online-only city page

Same as above, but replace section 4 with:

4. **How online coaching works from {City}**
   - Live class schedule, drawing correction process, materials courier to {City}, parent progress updates
   - "Want to visit? Our nearest classroom is in {Nearest Center}, about {X} km away" with link

Never show an address, map pin or "centre in {City}" on online-only pages.

### State hub page

- Answer-first block, all centers in that state, all city pages, state-level results, state colleges table (top colleges), state board calendar note, FAQ, demo CTA.

### National hub and online page

- Target "best NATA coaching in India", "online NATA coaching". All centers, how online works, national results, faculty, comparison, FAQ, demo CTA.

### Copy rules

- Short sentences. Facts first. Real numbers with sources.
- Each page must answer: Who teaches? Where? Online or offline? How much? What results? How do I start?
- No em dashes. No filler phrases (see Guardrails).
- Tamil and Kannada copy written naturally for parents, not word-for-word translation of English.

---

## 8. Phase 5: Uniqueness gate (build check)

Create `scripts/seo/check-locations.ts` and run it in CI before deploy.

### Rule 1: minimum unique local data points

A city or locality page can be `published` only if it has at least **5** of these:

1. 2+ colleges in `seo_colleges` for that location
2. 1+ exam centre in `seo_exam_centres`
3. 1+ testimonial from that location (consent true)
4. Center record (center pages) or nearest center + distance (online pages)
5. 1+ local-language video in `seo_videos`
6. 4+ FAQs in `seo_faqs` for that location
7. 1+ `seo_local_facts` entry (board calendar, travel, cost comparison)
8. Localized page in the region's language (ta / kn / hi)
9. Local photos (center pages)

If it has fewer, the page renders with `noindex` and is excluded from sitemaps, and the script lists what's missing.

### Rule 2: similarity check

- Compare rendered main content text between every pair of location pages in the same language (word shingles, Jaccard similarity).
- Fail if any pair is above **0.6**. Report the pair and the duplicated sections.

### Output

`docs/seo/LOCATION_READINESS.md` with a table: page, data points count, missing items, similarity max, publishable yes/no.

---

## 9. Phase 6: Structured data per page type

All JSON-LD, server-rendered.

### Organization (site-wide, extend existing)

`EducationalOrganization` with `name`, `url`, `logo`, `foundingDate`, `sameAs` (YouTube, Instagram, Facebook, LinkedIn, all 8 GBP URLs), `department` or `subOrganization` linking to each center's `@id`.

### Center pages

```json
{
  "@context": "https://schema.org",
  "@type": ["EducationalOrganization", "LocalBusiness"],
  "@id": "https://neramclasses.com/nata-coaching/tamil-nadu/madurai#center",
  "name": "Neram Classes Madurai",
  "parentOrganization": { "@id": "https://neramclasses.com/#organization" },
  "address": { "@type": "PostalAddress", "streetAddress": "{{DATA_NEEDED}}", "addressLocality": "Madurai", "addressRegion": "Tamil Nadu", "postalCode": "{{DATA_NEEDED}}", "addressCountry": "IN" },
  "geo": { "@type": "GeoCoordinates", "latitude": 0, "longitude": 0 },
  "telephone": "{{DATA_NEEDED}}",
  "openingHoursSpecification": [],
  "hasMap": "{{GBP_URL}}",
  "sameAs": ["{{GBP_URL}}"],
  "areaServed": ["Madurai", "Dindigul", "Theni", "Virudhunagar", "Sivaganga"]
}
```

(Fill `areaServed` from `seo_locations` where `nearest_center_slug` = this center.)

### All location pages

- `BreadcrumbList`
- `Course` with `provider` = organization, and `hasCourseInstance`:
  - Center pages: one `CourseInstance` with `courseMode: "onsite"` and `location` = center, one with `courseMode: "online"`
  - Online pages: `courseMode: "online"` only
- `FAQPage` from `seo_faqs` (Google rarely shows FAQ rich results for this category now, but AI tools read it)
- `VideoObject` for each embedded video (name, description, thumbnailUrl, uploadDate, duration, embedUrl, transcript if available)
- `Event` for upcoming demo classes (name, startDate, `eventAttendanceMode` online or mixed, location, organizer, `isAccessibleForFree: true`)

### Do not add

- AggregateRating or Review for Neram itself
- LocalBusiness on online-only pages

---

## 10. Phase 7: Multilingual

- Routes `/ta/`, `/kn/`, `/hi/` mirror English structure. Slugs stay in English for clean URLs; titles, H1 and content are localized.
- hreflang on every localized page: `en-IN`, `ta-IN`, `kn-IN`, `hi-IN`, `x-default` (English).
- Only create a localized page where that language is relevant (Tamil for TN, Kannada for Karnataka, Hindi for Hindi-belt states). Do not create Kannada versions of Tamil Nadu cities.
- Language switcher visible in header on location pages.
- Store a `needs_review` flag on machine-translated content. Hindi pages stay `noindex` until reviewed, OR until Hari approves publishing with the flag.
- Local-language title tag examples:
  - ta: "சென்னையில் NATA பயிற்சி | நேரம் கிளாசஸ்"
  - kn: "ಬೆಂಗಳೂರಿನಲ್ಲಿ NATA ಕೋಚಿಂಗ್ | ನೇರಂ ಕ್ಲಾಸಸ್"
  - hi: "दिल्ली में NATA कोचिंग | नेरम क्लासेस"
  (Have reviewers confirm brand name spelling in each script.)

---

## 11. Phase 8: YouTube, demo booking and WhatsApp

### YouTube on site

- Component `<ClassVideo youtubeId lang title />` using a click-to-load facade (thumbnail + play button, iframe loads on tap).
- Each location page pulls videos by `location_slug`, then by `language`, then general.
- Video sitemap entries generated from `seo_videos`.

### YouTube Live family demo

- Weekly live demo per language: Tamil, Kannada, English (Hindi later).
- Registration happens on neramclasses.com (not YouTube) so we capture student and **parent** details.
- After registration: confirmation with the live link on WhatsApp to both student and parent, reminders 24h and 1h before.
- Upcoming live demos appear on relevant location pages with `Event` schema.
- If the full family demo booking flow (parent OTP, slots, capacity) already exists or is in progress, reuse it. If not, build a minimal version: student name, student phone, parent name, parent phone (OTP), city, language, slot. Mark the full version as a separate task.

### WhatsApp button

- Format: `https://wa.me/{number}?text={encoded}`
- Pre-filled text by language, including city and a page code for tracking:
  - en: "Hi Neram, I'm from {City}. I'd like to know about NATA coaching. [{PAGE_CODE}]"
  - ta: "வணக்கம் நேரம், நான் {City}-லிருந்து. NATA பயிற்சி பற்றி தெரிந்துகொள்ள விரும்புகிறேன். [{PAGE_CODE}]"
  - kn: "ನಮಸ್ಕಾರ ನೇರಂ, ನಾನು {City} ಇಂದ. NATA ಕೋಚಿಂಗ್ ಬಗ್ಗೆ ತಿಳಿಯಲು ಬಯಸುತ್ತೇನೆ. [{PAGE_CODE}]"
  - hi: "नमस्ते नेरम, मैं {City} से हूँ। NATA कोचिंग के बारे में जानना चाहता/चाहती हूँ। [{PAGE_CODE}]"
- `PAGE_CODE` format: `{LANG}-{CITYCODE}`, for example `TA-MDU`, `KN-BLR`, `EN-CHN`.
- Route Kannada page clicks to the number handled by the Kannada-speaking staff member (config value, `{{DATA_NEEDED}}`).
- Sticky WhatsApp + Demo bar at the bottom on mobile.

### Center visit booking (center pages only)

- Button opens a simple form: name, parent name, phone, preferred date and time, center. Sends WhatsApp confirmation with address and map link.

---

## 12. Phase 9: Lead attribution

On every lead (demo booking, WhatsApp click event, visit booking, callback, application) store:

```
first_touch: { source, medium, campaign, landing_page, referrer, timestamp }
last_touch:  { same fields }
landing_location_slug
landing_language
page_code
channel: one of [google_organic, bing_organic, ai_chatgpt, ai_perplexity, ai_claude, ai_gemini, ai_copilot, youtube, google_ads, meta_ads, whatsapp, direct, referral, other]
```

- Capture UTM params and `document.referrer` on first visit, persist in a first-party cookie (90 days).
- AI channel detection: referrer host or `utm_source` containing chatgpt.com, perplexity.ai, claude.ai, gemini.google.com, copilot.microsoft.com.
- Fire PostHog events: `location_page_view`, `class_video_play`, `whatsapp_click`, `demo_booking_started`, `demo_booking_completed`, `center_visit_booked`, with `location_slug`, `language`, `channel` as properties.
- Admin view: leads by city, language and channel, and conversion to paid admission.

---

## 13. Phase 10: Measurement

### Tools

- Google Search Console and Bing Webmaster Tools (both domains, all sitemaps)
- PostHog + Microsoft Clarity (already chosen as shared monorepo layer)

### AI visibility prompt set

Create `docs/seo/AI_PROMPT_SET.md` with these prompts. Hari (or Claude in Chrome) runs them monthly in ChatGPT, Claude, Perplexity, Gemini and Google (AI Overview), and records: Neram mentioned (yes/no), position, accuracy of details, sources cited.

1. Best NATA coaching in India
2. Best online NATA coaching
3. Best NATA coaching in Tamil Nadu
4. NATA coaching in Chennai
5. NATA coaching in Tambaram
6. NATA coaching in Coimbatore
7. NATA coaching in Madurai
8. NATA coaching in Trichy
9. NATA coaching in Tiruppur
10. NATA coaching in Pudukkottai
11. NATA coaching in Bangalore
12. Best NATA drawing classes online
13. NATA coaching for Class 11 students
14. NATA crash course online
15. JEE Paper 2 B.Arch coaching online
16. Which coaching produced AIR 1 in JEE B.Arch 2024
17. Affordable NATA coaching online India
18. NATA coaching in Salem
19. NATA coaching in Mysore
20. NATA coaching in Kerala
21. NATA coaching in Hyderabad
22. NATA coaching in Delhi
23. NATA coaching for NRI students in Dubai
24. How to prepare for NATA drawing at home
25. Is online NATA coaching good
26. சென்னையில் சிறந்த NATA பயிற்சி மையம்
27. ಬೆಂಗಳೂರಿನಲ್ಲಿ ಉತ್ತಮ NATA ಕೋಚಿಂಗ್
28. ऑनलाइन NATA कोचिंग सबसे अच्छी
29. Neram Classes review
30. Neram Classes vs other NATA coaching

### KPIs (report monthly in `docs/seo/MONTHLY_REPORT.md`)

- Impressions, clicks, average position per location page (GSC + Bing)
- Rank for "NATA coaching in {city}" for the 8 center cities
- AI prompt set: mentions out of 30, per tool
- Location page to WhatsApp / demo conversion rate
- Leads and admissions by city, language and channel

---

## 14. Phase 11: Off-page tasks (for Claude in Chrome, not Claude Code)

Claude Code should only generate the supporting files below. The browser work is done separately with Claude in Chrome, with Hari approving each submission.

### Files to generate

1. `docs/seo/NAP_MASTER.md`: one table with the exact business name, address, phone, website URL, hours and category for each of the 8 centers. Every listing must match this exactly.
2. `docs/seo/CITATION_TARGETS.md`: checklist of directories with status columns (not started, submitted, verified, live URL):
   - Google Business Profile (8, one per center)
   - Bing Places
   - Apple Business Connect
   - Justdial, Sulekha, IndiaMART, UrbanPro
   - Shiksha, Collegedunia, Careers360, CollegeDekho
   - Local Chennai / Coimbatore / Madurai / Bengaluru directories
3. `docs/seo/GBP_POST_PLAN.md`: 8 weeks of Google Business Profile post drafts per center (class photos, results, demo dates, NATA dates). No em dashes.
4. `docs/seo/QA_ANSWER_DRAFTS.md`: 20 drafted answers to common NATA questions on Quora / Reddit, written as genuinely helpful answers with clear disclosure that the author is from Neram Classes. Hari posts from his own account.
5. `docs/seo/OUTREACH_TARGETS.md`: architecture blogs, college fest organisers, school career counsellors and education journalists in TN and Karnataka, with draft outreach emails.
6. `docs/seo/REVIEW_REQUEST_FLOW.md`: WhatsApp message templates (en, ta, kn) asking enrolled families for a Google review of their center, sent after week 3 of classes and after results.

### Rules for off-page work

- No fake reviews, no review exchanges, no paid reviews.
- No bulk or automated posting on Reddit or Quora.
- Name, address and phone identical everywhere.
- Account verification, CAPTCHAs, payments and personal-account posting are done by Hari.

---

## 15. Data needed from Hari

Track in `PROGRESS.md`. Do not invent any of these.

- [ ] Full address, pincode, phone and timings for each of the 8 centers
- [ ] Google Business Profile status and links for each center (exists / needs creating / needs verifying)
- [ ] Center photos (outside, classroom, students drawing)
- [ ] Student results by city and year, with consent
- [ ] Testimonial videos (student and parent), with consent
- [ ] YouTube channel URL and list of existing class videos with language
- [ ] WhatsApp numbers: main, API, Kannada staff
- [ ] Fee structure per course and mode, installment rules
- [ ] Batch start dates per center and online
- [ ] Reviewer for Tamil, Kannada (and Hindi if available)
- [ ] GSC and Bing Webmaster access confirmed
- [ ] Cloudflare access or the person who manages it

---

## 16. Execution order summary

1. Phase 0 audit, report to Hari, wait for go-ahead
2. Phase 1 technical fixes
3. Phase 3 data model + seed the 8 centers with `{{DATA_NEEDED}}` placeholders
4. Phase 4 template + Phase 6 schema
5. Phase 5 uniqueness gate in CI
6. Phase 8 video, WhatsApp, demo, visit booking components
7. Phase 9 lead attribution
8. Publish Wave 1 (only pages passing the gate)
9. Phase 7 Tamil and Kannada versions for Wave 1
10. Phase 10 measurement setup + first AI prompt baseline
11. Phase 11 off-page files
12. Waves 2 to 5 based on Search Console data

### Definition of done for Wave 1

- 13 pages live (national, online, NATA hub, 2 state hubs, 8 centers), English + Tamil (TN) + Kannada (Bengaluru)
- All pass uniqueness gate and schema validation
- All crawlable by Google, Bing and named AI bots (200 status)
- CWV pass on mobile
- WhatsApp, demo and visit buttons working with attribution
- Baseline AI prompt results recorded
