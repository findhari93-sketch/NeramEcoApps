# Student Results Showcase: Design Spec

## Context

Neram Classes has 200+ students with strong exam results across NATA, JEE Paper 2, TNEA, and college placements. Currently there is no dedicated way to showcase these results with student photos and verified scorecards on the marketing site. Displaying real results with watermarked scorecards serves as powerful social proof, driving conversions from prospective students and parents browsing the site (mostly on mobile).

The goal: a polished, filterable "Results Wall" on the enhanced `/achievements` page, with SEO-friendly individual student detail pages, a homepage teaser section, and an Admin dashboard for staff to manage results.

---

## 1. Database Schema

### New table: `student_results`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default gen_random_uuid() | |
| student_name | text | NOT NULL | |
| slug | text | UNIQUE, NOT NULL | Auto-generated: `{exam}-{year}-{kebab-name}` |
| photo_url | text | | Supabase Storage URL |
| scorecard_url | text | | Original scorecard (private bucket) |
| scorecard_watermarked_url | text | | Watermarked version (public bucket) |
| exam_type | text | NOT NULL, CHECK in ('nata','jee_paper2','tnea','other') | |
| exam_year | int | NOT NULL | e.g., 2025, 2026 |
| score | decimal | nullable | Raw score (e.g., 158) |
| max_score | decimal | nullable | Max possible (e.g., 200) |
| rank | int | nullable | AIR or state rank |
| percentile | decimal | nullable | |
| college_name | text | nullable | College admitted to |
| college_city | text | nullable | |
| course_name | text | nullable | e.g., "B.Arch" |
| student_quote | text | nullable | Short testimonial |
| is_featured | boolean | default false | Shown in featured carousel + homepage |
| is_published | boolean | default false | Controls visibility on marketing site |
| display_order | int | default 0 | Manual sort for featured results |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | |

**Indexes:**
- `idx_student_results_slug` on `slug` (unique lookups)
- `idx_student_results_published` on `(is_published, exam_type, exam_year)` (filtered queries)
- `idx_student_results_featured` on `(is_published, is_featured, display_order)` (featured queries)

**RLS Policies:**
- Public SELECT where `is_published = true` (anon key)
- Full CRUD for service_role (admin API)

**Storage Buckets:**
- `student-results-originals` (private, admin-only)
- `student-results-watermarked` (public, served to marketing site)
- `student-results-photos` (public, student photos)

---

## 2. Watermarking

**When:** Server-side, triggered on scorecard upload in Admin dashboard.

**How:** Using `sharp` (Node.js image processing library) in an Admin API route:
1. Admin uploads original scorecard image
2. API route receives the image, uploads original to private bucket
3. API composites the Neram Classes logo (30% opacity, centered) and "neramclasses.com" text (25% opacity, below logo) onto the image
4. Watermarked version uploaded to public bucket
5. Both URLs saved to the `student_results` row

**Watermark assets:**
- Logo SVG/PNG stored in `apps/admin/public/watermark-logo.png`
- Text rendered by `sharp` with white color + drop shadow for visibility on any background

**Regeneration:** Admin can trigger re-watermark for a single result or all results (if logo changes).

---

## 3. Enhanced Achievements Page

**Route:** `/[locale]/achievements` (existing page, enhanced)

### 3a. Stats Bar (top of page)
- Total students placed | Average NATA score | Top rank | Colleges count
- Animated count-up on scroll into view
- Gold accent numbers on dark background (existing design language)
- Data from `GET /api/student-results/stats`

### 3b. Featured Students Carousel
- Horizontal scrollable section for `is_featured = true` results (top 5-10)
- Large card per student: photo (circle, 100px), exam badge chip, score prominently, college name
- Auto-scroll with pause on hover/touch, swipeable on mobile
- Only shown if featured results exist

### 3c. Filter Bar
- **Search:** text input, searches student name (debounced 300ms)
- **Exam type chips:** All | NATA | JEE Paper 2 | TNEA | College Placements (filters where `college_name IS NOT NULL`, not an exam_type value)
- **Year dropdown:** populated from available years in data
- **Score range:** optional slider (min/max)
- **College filter:** autocomplete from existing college names in data
- Filters persist in URL query params (`?exam=nata&year=2026`) for shareable links
- "Clear filters" button when any filter is active

### 3d. Results Grid
- **Responsive:** 1 col (mobile), 2 cols (tablet), 3 cols (desktop), 4 cols (xl)
- **Card design:**
  - Student photo (circle, 80px) with exam type badge overlay
  - Student name (bold)
  - Score display: "158/200" or "Rank 342" prominently
  - College name + city (if placed)
  - Small watermarked scorecard thumbnail (corner, 60px)
  - Hover: slight lift (translateY -4px), border glow
- **Click:** navigates to `/achievements/[slug]`
- **Pagination:** "Load more" button, 12 cards per batch
- **Sort:** by score (high to low), rank (low to high), name (A-Z), newest first

### 3e. Empty/Loading States
- Skeleton loader cards while fetching (matching card dimensions)
- "No results match your filters" with reset button
- Initial page load: SSR first batch for SEO, client-side for subsequent loads

### 3f. Existing Achievements Content
- The current academic-year-based achievement cards remain as a separate tab or section below the results wall
- Tab structure: "Student Results" (new, default) | "Achievements" (existing content)

---

## 4. Student Detail Page

**Route:** `/[locale]/achievements/[slug]`

### Layout (mobile-first)

**Hero:**
- Student photo (160px circle mobile, 200px desktop)
- Name (h1)
- Exam type badge chip
- Score: circular progress ring visual showing score/max_score ratio
- Rank display if available: "All India Rank: 342"
- College: name, city, course (e.g., "SPA Delhi, B.Arch 2026")

**Scorecard Section:**
- Watermarked scorecard image, full width on mobile, max 600px on desktop
- Pinch-to-zoom support on mobile (CSS touch-action + transform)
- "Verified Result" badge with Neram Classes branding

**Student Quote (conditional):**
- Styled blockquote if `student_quote` is not null
- Italic text with gold left border accent

**CTA Section:**
- "Want results like this? Start your journey today."
- "Apply Now" primary button (links to /apply)
- "Explore Free Tools" secondary button
- Dark gradient background

**Navigation:**
- "Back to All Results" link at top
- "Previous / Next Student" at bottom (within same exam type)

### SEO
- **Title:** "{student_name} scored {score}/{max_score} in {exam_type} {exam_year} | Neram Classes"
- **Description:** "{student_name} achieved {score}/{max_score} (Rank {rank}) in {exam_type} {exam_year} and got admitted to {college_name}. Trained at Neram Classes."
- **Open Graph image:** Use watermarked scorecard image as OG image (simple, no generation needed)
- **JSON-LD:** EducationalOccupationalCredential schema with student name, exam, score, institution

---

## 5. Homepage Section

**Location:** Between Testimonials and Social Proof sections in `HomePageContent.tsx`

**Design:**
- Section title: "Our Students, Our Pride" (i18n translated)
- 6 featured student cards: horizontal scroll on mobile, 3-column grid on desktop
- Card: photo + name + exam badge + score + college
- "View All Results" CTA button linking to `/achievements`
- Same dark glassmorphism styling as existing homepage sections
- Data: `GET /api/student-results?featured_only=true&limit=6`

---

## 6. API Endpoints

### Marketing App

**`GET /api/student-results`**
- Query: `search`, `exam_type`, `year`, `college`, `score_min`, `score_max`, `featured_only`, `limit` (default 12), `offset` (default 0), `sort` (score_desc, rank_asc, name_asc, newest)
- Returns: `{ success, data: StudentResult[], total: number }`
- Cache: `public, s-maxage=3600, stale-while-revalidate=86400`
- Source: Supabase query on `student_results` where `is_published = true`

**`GET /api/student-results/[slug]`**
- Returns: `{ success, data: StudentResult }`
- Cache: same as above
- 404 if not found or not published

**`GET /api/student-results/stats`**
- Returns: `{ total, avg_nata_score, top_rank, colleges_count, by_exam_type: { nata: N, jee: N, tnea: N } }`
- Cache: same

**`GET /api/student-results/filters`**
- Returns: available years, exam types, colleges (for populating filter dropdowns)
- Cache: same

### Admin App

**`GET /api/admin/student-results`** - List all (including unpublished), with pagination
**`POST /api/admin/student-results`** - Create new (handles photo + scorecard upload + watermark generation)
**`GET /api/admin/student-results/[id]`** - Get single by ID
**`PUT /api/admin/student-results/[id]`** - Update (re-watermarks if scorecard changed)
**`DELETE /api/admin/student-results/[id]`** - Delete (removes storage files too)
**`POST /api/admin/student-results/[id]/watermark`** - Regenerate watermark
**`POST /api/admin/student-results/bulk-import`** - CSV upload for initial data

All admin routes require Microsoft auth (existing pattern).

---

## 7. Admin Dashboard UI

**Route:** `/admin/student-results`

### List View
- Table: photo thumbnail, name, exam, year, score, college, published status, featured status
- Quick toggle buttons for published/featured
- Search + filter by exam type
- Bulk actions: publish/unpublish selected
- "Add New" button, "Bulk Import CSV" button

### Add/Edit Form
- Student name (text, required)
- Photo upload (drag & drop, crop to square preview)
- Scorecard upload (drag & drop, preview with watermark indicator)
- Exam type dropdown (NATA, JEE Paper 2, TNEA, Other)
- Exam year dropdown
- Score + Max score number fields
- Rank, Percentile (optional numbers)
- College name (text with autocomplete from existing entries)
- College city (text with autocomplete)
- Course name (text, optional)
- Student quote (textarea, optional)
- Featured toggle, Published toggle
- Save button: validates, uploads images, generates watermark, creates/updates row

### CSV Bulk Import
- Template download link
- CSV columns: student_name, exam_type, exam_year, score, max_score, rank, percentile, college_name, college_city, course_name, student_quote
- Photos and scorecards uploaded separately (matched by student name + exam + year)
- Preview table before confirm import

---

## 8. i18n

New translation keys in `messages/{locale}.json`:

```
"achievements.results.title": "Student Results"
"achievements.results.stats.total": "Students Placed"
"achievements.results.stats.avgScore": "Avg NATA Score"
"achievements.results.stats.topRank": "Top Rank"
"achievements.results.stats.colleges": "Colleges"
"achievements.results.search": "Search by student name..."
"achievements.results.filters.all": "All"
"achievements.results.filters.nata": "NATA"
"achievements.results.filters.jee": "JEE Paper 2"
"achievements.results.filters.tnea": "TNEA"
"achievements.results.filters.placements": "College Placements"
"achievements.results.filters.year": "Year"
"achievements.results.filters.clear": "Clear Filters"
"achievements.results.loadMore": "Load More Results"
"achievements.results.noResults": "No results match your filters"
"achievements.results.viewAll": "View All Results"
"achievements.detail.backToResults": "Back to All Results"
"achievements.detail.verifiedResult": "Verified Result"
"achievements.detail.rank": "All India Rank"
"achievements.detail.cta.title": "Want results like this? Start your journey today."
"achievements.detail.cta.apply": "Apply Now"
"achievements.detail.cta.tools": "Explore Free Tools"
"home.studentResults.title": "Our Students, Our Pride"
"home.studentResults.viewAll": "View All Results"
```

Translations needed for: en, ta, hi, kn, ml

---

## 9. Mobile-First Considerations

- **Grid:** 1 column on mobile (375px), cards take full width with 16px padding
- **Touch targets:** All buttons and cards minimum 48px tap area
- **Featured carousel:** horizontal swipe, no auto-scroll on mobile (touch conflict)
- **Filters:** collapsible filter drawer on mobile (tap "Filters" chip to expand)
- **Scorecard zoom:** pinch-to-zoom on detail page
- **Performance:** lazy load images below fold, skeleton loaders, limit initial load to 12 cards
- **Bottom CTA:** sticky "Apply Now" bar on detail page (mobile only)

---

## 10. Verification Plan

1. **Database:** Run migration, verify table exists with `SELECT * FROM student_results LIMIT 1`
2. **Admin:** Upload a test student with photo + scorecard, verify watermark is applied
3. **Marketing API:** Hit `/api/student-results` and confirm test data returns
4. **Achievements page:** Load page, verify stats bar, filters, grid render
5. **Detail page:** Click a student card, verify all fields render, scorecard is watermarked
6. **Homepage:** Verify featured section appears with test data
7. **Mobile:** Test on 375px viewport: grid is 1-col, filters collapse, touch targets are 48px+
8. **SEO:** Check meta tags and JSON-LD on detail page
9. **Filters:** Test each filter combination, verify URL params update
10. **E2E:** Run Playwright tests for the full flow

---

## Files to Modify/Create

### Database (packages/database)
- `supabase/migrations/XXXX_create_student_results.sql` (new)
- `src/types/index.ts` (add StudentResult type)
- `src/queries/student-results.ts` (new, all query functions)

### Marketing App (apps/marketing)
- `src/app/api/student-results/route.ts` (new)
- `src/app/api/student-results/[slug]/route.ts` (new)
- `src/app/api/student-results/stats/route.ts` (new)
- `src/app/api/student-results/filters/route.ts` (new)
- `src/app/[locale]/achievements/page.tsx` (modify, add results tab)
- `src/app/[locale]/achievements/[slug]/page.tsx` (new, detail page)
- `src/components/achievements/ResultsWall.tsx` (new)
- `src/components/achievements/ResultCard.tsx` (new)
- `src/components/achievements/FeaturedCarousel.tsx` (new)
- `src/components/achievements/StatsBar.tsx` (new)
- `src/components/achievements/FilterBar.tsx` (new)
- `src/components/achievements/StudentDetailContent.tsx` (new)
- `src/components/HomePageContent.tsx` (modify, add results section)
- `messages/en.json` (add keys)
- `messages/ta.json`, `hi.json`, `kn.json`, `ml.json` (add keys)

### Admin App (apps/admin)
- `src/app/api/admin/student-results/route.ts` (new)
- `src/app/api/admin/student-results/[id]/route.ts` (new)
- `src/app/api/admin/student-results/[id]/watermark/route.ts` (new)
- `src/app/api/admin/student-results/bulk-import/route.ts` (new)
- `src/app/(protected)/student-results/page.tsx` (new)
- `src/app/(protected)/student-results/[id]/page.tsx` (new, edit form)
- `src/components/student-results/ResultsTable.tsx` (new)
- `src/components/student-results/ResultForm.tsx` (new)
- `src/components/student-results/BulkImport.tsx` (new)
- `src/lib/watermark.ts` (new, sharp-based watermarking)
