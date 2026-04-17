# Universal Search: Cross-Site Search for Marketing + Tools App

## Context

The marketing site (neramclasses.com) has a search feature triggered by a small magnifying glass icon in the header or Ctrl+K. It searches a hardcoded static index of ~70 entries covering main pages, NATA content, courses, tools, and legal pages. The search has significant gaps:

1. **College Hub is invisible to search.** The site has 50+ architecture colleges in Supabase, but none appear in search results. Typing "Anna University" or "Chennai" returns nothing.
2. **Tools app pages are missing.** The student app (app.neramclasses.com) has 25+ public tools and pages not represented in the search.
3. **Coaching location pages are missing.** City-specific coaching pages (Chennai branches, state pages) are not searchable.
4. **The search trigger is hard to find.** A small 32x32px icon with no label blends into the dark header. Users don't realize search exists.
5. **No fuzzy matching.** The current scoring algorithm requires exact substring matches, so typos ("chennai" vs "chenai") fail silently.
6. **No analytics.** No way to know what users search for or what queries return zero results.

This redesign transforms search from a basic page finder into a comprehensive discovery tool that covers every page across the marketing site and tools app, with fuzzy matching, grouped results, and lightweight analytics.

## Scope

### In Scope
- Expanded search index covering all marketing pages, colleges, coaching locations, tools app pages
- Build-time index generation script that fetches colleges from Supabase
- Fuse.js integration for fuzzy/typo-tolerant matching
- Redesigned search trigger in header (prominent icon + label + keyboard hint)
- Redesigned search dialog with grouped results by category, recent searches, quick links
- "N more" overflow for categories with many results (especially colleges)
- Recent searches stored in localStorage
- Search analytics via Supabase (query tracking, click tracking, zero-result tracking)

### Out of Scope
- Server-side/API-based search (using client-side only)
- Search within page content (searches titles, descriptions, keywords only)
- Real-time college data updates (updates on redeploy only)
- Authenticated user context (search is anonymous, no personalization)
- Tools app integration (search lives only in marketing app, links to tools app marketing pages)
- Voice search or image search

## Architecture

### Search Index Sources

```
┌─────────────────────────────────────────────────┐
│              Search Index Sources                │
├──────────────┬──────────────┬───────────────────┤
│  Static      │  Generated   │  Static           │
│  (handcraft) │  (colleges)  │  (tools app)      │
│              │              │                   │
│  ~70 entries │  ~500 entries│  ~25 entries       │
│  Pages, NATA │  From        │  Public tools,    │
│  Courses,    │  Supabase    │  counseling,      │
│  Blog, Legal │  at build    │  coaching pages   │
└──────┬───────┴──────┬───────┴────────┬──────────┘
       │              │                │
       ▼              ▼                ▼
  ┌────────────────────────────────────────────┐
  │        Merged SEARCH_INDEX at runtime      │
  │    Searched by Fuse.js (fuzzy matching)    │
  └────────────────────────────────────────────┘
```

### Data Flow

1. **Build time**: `scripts/generate-search-index.ts` runs before `next build` (chained in the marketing app's build script)
2. It connects to Supabase and fetches all colleges (name, city, state, slug, type, fees, accreditation)
3. It writes `apps/marketing/src/lib/generated-search-index.ts` with college entries
4. During app build, `search-index.ts` imports both static + generated arrays and merges them
5. **Runtime**: Fuse.js searches the merged index client-side with zero API calls
6. Analytics events fire via `navigator.sendBeacon()` to `/api/analytics/search`

## Search Entry Schema

```typescript
export type SearchCategory = 
  | 'page' | 'course' | 'tool' | 'nata' | 'blog' | 'legal'  // existing
  | 'college' | 'coaching' | 'counseling';                    // new

export interface SearchEntry {
  path: string;           // Route URL (locale-independent, e.g. '/courses')
  title: string;          // Display title
  description: string;    // One-line description
  keywords: string[];     // Search keywords (fuzzy matched)
  category: SearchCategory;
  meta?: {                // Optional display-only metadata (not searched)
    city?: string;
    state?: string;
    type?: string;        // Government, Private, Deemed
    nirmRank?: number;
  };
}
```

### Category Configuration

| Category | Color | Icon | Label | Max results shown |
|----------|-------|------|-------|-------------------|
| `college` | `#2e7d32` (green) | School | Colleges | 3 + overflow |
| `page` | `#1976d2` (blue) | Article | Pages | 4 |
| `course` | `#7b1fa2` (purple) | MenuBook | Courses | 3 |
| `tool` | `#ed6c02` (orange) | Build | Free Tools | 3 |
| `nata` | `#9c27b0` (purple) | School | NATA 2026 | 3 |
| `coaching` | `#0288d1` (cyan) | LocationOn | Coaching | 3 |
| `counseling` | `#00796b` (teal) | Psychology | Counseling | 3 |
| `blog` | `#0288d1` (blue) | RssFeed | Blog | 2 |
| `legal` | `#757575` (grey) | Gavel | Legal | 2 |

**Display order**: Results are grouped by category. Categories with matches appear in the order listed above. Within each category, results are sorted by Fuse.js relevance score.

**Overflow rule**: If a category has more results than its max, show top N and a "+ M more" link. For colleges, this links to `/colleges?q={query}`. For other categories, it scrolls to show more in a future interaction (or links to the category page).

## Fuse.js Configuration

```typescript
const fuseOptions = {
  keys: [
    { name: 'title', weight: 0.4 },
    { name: 'keywords', weight: 0.35 },
    { name: 'description', weight: 0.25 },
  ],
  threshold: 0.3,        // moderate fuzziness (0 = exact, 1 = match anything)
  distance: 100,          // how far from expected position a match can be
  minMatchCharLength: 2,  // don't match single characters
  includeScore: true,     // return relevance scores
  shouldSort: true,       // sort by score
};
```

**Why Fuse.js**: ~7KB gzipped, no dependencies, well-maintained, supports weighted fuzzy search. Perfect for small-to-medium static datasets. No build step required (unlike Lunr.js).

## Search Trigger UI (Header)

### Desktop

The search trigger replaces the current bare icon with a visible button showing an icon, label, and keyboard shortcut hint.

```
  ┌───────────────────────────────────┐
  │  🔍 Search              Ctrl+K   │
  └───────────────────────────────────┘
```

Styling:
- Border: 1px solid rgba(255,255,255,0.2), border-radius: 8px
- Background: transparent, hover: rgba(255,255,255,0.08)
- Icon: SearchIcon (MUI), 20px, opacity 0.7
- "Search" text: 14px, opacity 0.6
- "Ctrl+K" badge: 12px, opacity 0.4, monospace, subtle border
- Min-width: 200px, height: 36px
- Positioned between nav links and Apply Now button
- Cursor: pointer (entire area is clickable)

### Mobile

Icon-only button, enlarged from 32px to 40px for better touch target.

```
  ┌──────────────────────────────┐
  │  neramClasses         🔍  ☰  │
  └──────────────────────────────┘
```

- 40x40px touch target
- SearchIcon, 24px
- Positioned left of hamburger menu icon

## Search Dialog UI

### Empty State (no query typed)

Shows recent searches (if any) and quick links for popular destinations.

```
┌──────────────────────────────────────────────────┐
│  🔍 │ Search colleges, courses, tools...  │  ESC │
├──────────────────────────────────────────────────┤
│                                                  │
│  RECENT ─────────────────────────────────────── │
│  🕐 Anna University Chennai                     │
│  🕐 NATA syllabus                                │
│  🕐 Cutoff calculator                            │
│                                                  │
│  QUICK LINKS ────────────────────────────────── │
│  📄 Apply Now         🎓 All Courses             │
│  🏛️ Browse Colleges   🧮 Cutoff Calculator       │
│                                                  │
│  ↑↓ Navigate  ↵ Select  esc Close               │
└──────────────────────────────────────────────────┘
```

- Recent searches: Last 5 queries stored in localStorage key `neram_recent_searches`
- Quick links: 4 hardcoded popular destinations (Apply, Courses, Colleges, Cutoff Calculator)
- Clear recent button (small "Clear" link next to "RECENT" header)

### Results State (query typed)

Results grouped by category with section headers.

```
┌──────────────────────────────────────────────────┐
│  🔍 │ chennai                             │  ✕   │
├──────────────────────────────────────────────────┤
│                                                  │
│  COLLEGES ─────────────────────────────────────  │
│  🏛️ Anna University, Chennai        Government   │
│     Est. 1978 · NAAC A++ · Fee ₹25K/yr          │
│  🏛️ SRM Easwari, Chennai            Private      │
│     Est. 1996 · NAAC A · Fee ₹1.5L/yr           │
│  🏛️ IIT Madras, Chennai             Government   │
│     Est. 1959 · NIRF #1 · Fee ₹12K/yr           │
│     + 12 more colleges → Browse all              │
│                                                  │
│  PAGES ────────────────────────────────────────  │
│  📄 NATA Coaching in Chennai                     │
│  📄 Contact: Chennai Center                      │
│                                                  │
│  COACHING ─────────────────────────────────────  │
│  📍 Anna Nagar Branch, Chennai                   │
│  📍 Adyar Branch, Chennai                        │
│                                                  │
│  15 results  ↑↓ Navigate  ↵ Select  esc Close   │
└──────────────────────────────────────────────────┘
```

### No Results State

```
┌──────────────────────────────────────────────────┐
│  🔍 │ xyzabc123                           │  ✕   │
├──────────────────────────────────────────────────┤
│                                                  │
│           🔍                                     │
│                                                  │
│     No results for "xyzabc123"                   │
│     Try a different search term                  │
│                                                  │
│     ── Popular searches ──                       │
│     NATA 2026 · Colleges · Fees · Apply          │
│                                                  │
│     Need help? Call +91 91761 37043              │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Mobile Full-Screen

```
┌──────────────────────────────┐
│  ←  Search...          ✕     │ 48px header
├──────────────────────────────┤
│                              │
│  COLLEGES                    │
│  ┌──────────────────────┐    │
│  │ 🏛️ Anna University   │    │ 64px min-height
│  │    Chennai · Govt     │    │ per result card
│  └──────────────────────┘    │
│  ┌──────────────────────┐    │
│  │ 🏛️ SRM Easwari       │    │
│  │    Chennai · Private  │    │
│  └──────────────────────┘    │
│  + 12 more → Browse all      │
│                              │
│  PAGES                       │
│  ┌──────────────────────┐    │
│  │ 📄 NATA Coaching     │    │
│  │    Chennai Center     │    │
│  └──────────────────────┘    │
│                              │
│  COACHING                    │
│  ┌──────────────────────┐    │
│  │ 📍 Anna Nagar Branch │    │
│  │    Chennai            │    │
│  └──────────────────────┘    │
│                              │
└──────────────────────────────┘
```

- Full-screen modal (existing behavior)
- Card-style results with 64px min-height for easy tapping
- 16px horizontal padding
- Scrollable results area
- Back arrow (←) to close

## College Index Generation

### Build Script: `scripts/generate-search-index.ts`

Runs during `prebuild` npm script. Connects to production Supabase and fetches college data.

**Query**:
```sql
SELECT slug, name, short_name, city, state, state_slug, type, 
       established_year, coa_approved, naac_grade, nirf_rank,
       annual_fee_approx, accepted_exams, counseling_systems
FROM colleges
WHERE slug IS NOT NULL
ORDER BY name
```

**Entry generation per college**:
```typescript
{
  path: `/colleges/${college.state_slug}/${college.slug}`,
  title: `${college.name}, ${college.city}`,
  description: buildCollegeDescription(college),
  // e.g. "Government · Est. 1978 · NAAC A++ · NIRF #4 · Fee ₹25K/yr"
  keywords: [
    college.name.toLowerCase(),
    college.short_name?.toLowerCase(),
    college.city.toLowerCase(),
    college.state.toLowerCase(),
    college.type?.toLowerCase(),
    college.naac_grade ? `naac ${college.naac_grade.toLowerCase()}` : null,
    college.coa_approved ? 'coa approved' : null,
    ...(college.accepted_exams || []).map(e => e.toLowerCase()),
    ...(college.counseling_systems || []).map(s => s.toLowerCase()),
  ].filter(Boolean),
  category: 'college' as const,
  meta: {
    city: college.city,
    state: college.state,
    type: college.type,
    nirmRank: college.nirf_rank,
  }
}
```

**Output file**: `apps/marketing/src/lib/generated-search-index.ts`
```typescript
// AUTO-GENERATED - DO NOT EDIT
// Generated at: 2026-04-17T10:00:00Z
// Colleges: 523
import type { SearchEntry } from './search-index';
export const GENERATED_COLLEGE_INDEX: SearchEntry[] = [ ... ];
```

**Fallback**: If the script fails (Supabase down, env var missing), it writes an empty array and logs a warning. The build continues with static entries only.

### New Static Entries to Add

**Tools app pages** (~25 entries, hardcoded in `search-index.ts`):
- Dashboard, Question Bank, Cutoff Calculator, College Predictor, Exam Centers, Exam Planner, Image Crop, Eligibility Checker, Cost Calculator, Rank Predictor, COA Checker, Counseling Insights, Saved Colleges, Support
- All paths point to marketing landing pages (e.g. `/tools/cutoff-calculator`)

**Coaching location pages** (~15 entries, hardcoded):
- Coaching hub, NATA coaching overview, city-specific pages (Chennai, Anna Nagar, Adyar, etc.)
- State-level pages (Tamil Nadu, Karnataka, etc.)

**Counseling pages** (~5 entries, hardcoded):
- Counseling overview, College Predictor, Rank Predictor, COA Checker, Insights

**College category pages** (~10 entries, hardcoded):
- Browse All Colleges, Compare Colleges, TNEA Colleges, JoSAA Colleges
- NIRF Rankings, ArchIndex Rankings
- Colleges by fee range pages (below 1L, below 2L, etc.)

## Search Analytics

### Supabase Table: `search_analytics`

```sql
CREATE TABLE search_analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('query', 'click', 'no_results')),
  query TEXT NOT NULL,
  result_path TEXT,          -- null for 'query' and 'no_results' events
  result_position INTEGER,   -- 0-indexed position of clicked result
  result_count INTEGER,      -- total results for that query
  session_id TEXT,           -- anonymous UUID from localStorage
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for analytics queries
CREATE INDEX idx_search_analytics_created ON search_analytics (created_at DESC);
CREATE INDEX idx_search_analytics_event ON search_analytics (event_type);
```

### API Route: `POST /api/analytics/search`

Thin endpoint that inserts into `search_analytics`. No auth required. Rate-limited implicitly by Supabase insert speed.

```typescript
// apps/marketing/src/app/api/analytics/search/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const { event_type, query, result_path, result_position, result_count, session_id } = body;
  
  // Validate event_type
  if (!['query', 'click', 'no_results'].includes(event_type)) {
    return Response.json({ error: 'Invalid event' }, { status: 400 });
  }
  
  // Insert (fire and forget, don't block)
  const supabase = createAdminClient();
  await supabase.from('search_analytics').insert({
    event_type, query: query?.slice(0, 200), result_path, 
    result_position, result_count, session_id
  });
  
  return Response.json({ ok: true });
}
```

### Client-Side Tracking

```typescript
// In SearchDialog.tsx
function trackSearch(event: SearchAnalyticsEvent) {
  if (typeof navigator.sendBeacon === 'function') {
    navigator.sendBeacon('/api/analytics/search', JSON.stringify(event));
  }
}
```

**Events fired**:
- `query`: Debounced 500ms after user stops typing. Includes query text and result count.
- `click`: When user selects a result. Includes query, clicked path, position in list.
- `no_results`: When search returns 0 results. Includes query text.

**Session ID**: Anonymous UUID generated on first search, stored in localStorage as `neram_search_session`. Refreshes daily. No PII, no user identification.

## Files to Modify/Create

| File | Action | Purpose |
|------|--------|---------|
| `scripts/generate-search-index.ts` | **Create** | Build-time script to fetch colleges from Supabase |
| `apps/marketing/src/lib/generated-search-index.ts` | **Create (auto)** | Auto-generated college entries (gitignored) |
| `apps/marketing/src/lib/search-index.ts` | **Modify** | Add new categories, tools/coaching/counseling entries, merge with generated index, export Fuse.js searcher |
| `apps/marketing/src/components/SearchDialog.tsx` | **Rewrite** | New grouped UI, recent searches, quick links, Fuse.js integration, analytics tracking |
| `apps/marketing/src/components/Header.tsx` | **Modify** | Replace icon button with prominent search trigger (icon + label + shortcut) |
| `apps/marketing/package.json` | **Modify** | Add `fuse.js` dependency |
| `apps/marketing/src/app/api/analytics/search/route.ts` | **Create** | Analytics ingestion endpoint |
| `supabase/migrations/XXXX_search_analytics.sql` | **Create** | Create `search_analytics` table |
| `apps/marketing/.gitignore` | **Modify** | Add `src/lib/generated-search-index.ts` |
| `apps/marketing/package.json` | **Modify** | Change build script to `"build": "tsx ../../scripts/generate-search-index.ts && next build"` so index generation runs before every build |

## Verification Plan

1. **Build test**: Run `pnpm build` in marketing app, verify generated index file is created with college entries
2. **Search quality**: Open search, type "chennai", verify college results appear grouped under "Colleges"
3. **Fuzzy matching**: Type "chenai" (typo), verify it still matches Chennai colleges
4. **Category grouping**: Type "nata", verify results from NATA, Courses, and Tools categories appear in separate groups
5. **Overflow**: Type a broad term like "tamil nadu", verify "+ N more" appears for colleges with >3 results
6. **Recent searches**: Search for something, close dialog, reopen, verify recent search appears
7. **Quick links**: Open search with empty query, verify 4 quick link buttons appear
8. **Mobile**: Test on 375px viewport, verify full-screen modal, 48px+ touch targets, no horizontal overflow
9. **Keyboard**: Test Ctrl+K opens search, arrow keys navigate, Enter selects, Esc closes
10. **Analytics**: Check Supabase `search_analytics` table after several searches, verify events logged
11. **Header trigger**: Verify search button shows icon + "Search" + Ctrl+K on desktop, icon-only on mobile
12. **No build regression**: Verify `pnpm build` completes for all apps (search changes are marketing-only)