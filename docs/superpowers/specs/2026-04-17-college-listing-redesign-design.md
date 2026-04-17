# College Listing Page Redesign: Enhanced Filters + Tiered Card Layout

## Context

The current college listing pages (e.g., "Best B.Arch Colleges in Tamil Nadu") display all colleges as uniform grid cards with a basic filter sidebar. The user experience is cluttered: too many similarly-sized cards, limited filter options, no visual hierarchy between top and lower-ranked colleges, and no campus photos. Students (60% mobile) need a faster way to find and compare colleges that matter to them.

This spec enhances the existing listing template (shared by state, counseling, city, type, and other category pages) with a richer filter sidebar, tiered card layout, search, ad banner slots, and campus photos.

**Scope**: Enhance the existing `FilterSidebar.tsx` and `CollegeListingCard.tsx` components, and create a new `FeaturedCollegeCard.tsx` and `CompactCollegeCard.tsx`. Apply first to the state listing page (`/colleges/[state]`) then extend to all category listing pages.

## Data Correction: Exam Types

**Current (incorrect)**: Cards show "JEE Main Paper 2" as accepted for many colleges alongside NATA.

**Corrected logic**:
- **NATA** is the primary entrance exam for merit-based B.Arch admission at most colleges (state counseling: TNEA, KEAM, KCET, etc.)
- **JEE Paper 2 (B.Arch/B.Planning)** is accepted only by central government institutions: NITs, IITs, SPAs, and a few CFTIs admitted through JoSAA counseling
- Management quota seats may consider JEE but that is not the primary admission path
- The `accepted_exams` array in the database should be validated and corrected

## Design: Desktop Layout

### Overall Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  Breadcrumb: Colleges > Tamil Nadu                               │
│  H1: Best B.Arch Colleges in Tamil Nadu                          │
│  Subtitle: 32 colleges, compare fees, NATA cutoffs, placements   │
├─────────────────┬────────────────────────────────────────────────┤
│  FILTER SIDEBAR │  SEARCH BAR (within content area)              │
│  (280px sticky)  │  Active filter pills                           │
│                 │  Results count + Sort dropdown                  │
│  Sort By        │                                                │
│  ─────────────  │  ┌─ FEATURED CARD #1 (full-width) ──────────┐ │
│  COA Approved   │  │ Campus photo | Name, badges, 4-stat grid  │ │
│  ─────────────  │  │ Actions: Details, Compare, Save, Call      │ │
│  Search College │  └────────────────────────────────────────────┘ │
│  ─────────────  │  ┌─ FEATURED CARD #2 ────────────────────────┐ │
│  Accepted Exam  │  │ Same layout as #1                          │ │
│  ─────────────  │  └────────────────────────────────────────────┘ │
│  Ownership      │                                                │
│  ─────────────  │  ═══ AD BANNER (Sponsored) ═══                │
│  NAAC Grade     │                                                │
│  ─────────────  │  ┌─ FEATURED #3 ─────────────────────────────┐ │
│  Fee Range      │  └────────────────────────────────────────────┘ │
│  ─────────────  │  ┌─ FEATURED #4 ─────────────────────────────┐ │
│  City           │  └────────────────────────────────────────────┘ │
│  ─────────────  │  ┌─ FEATURED #5 ─────────────────────────────┐ │
│  Rating         │  └────────────────────────────────────────────┘ │
│                 │                                                │
│                 │  ─── More Colleges ────────────────            │
│                 │                                                │
│                 │  [ #6 Compact row card                    ]    │
│                 │  [ #7 Compact row card                    ]    │
│                 │  [ #8 Compact row card                    ]    │
│                 │                                                │
│                 │  ═══ AD BANNER ═══                             │
│                 │                                                │
│                 │  [ #9  Compact row ]                           │
│                 │  [ #10 Compact row ]                           │
│                 │  ... pagination ...                            │
└─────────────────┴────────────────────────────────────────────────┘
```

### Filter Sidebar (Desktop: 280px sticky)

Enhance existing `FilterSidebar.tsx`. Filters top-to-bottom:

| # | Filter | Control | URL Param |
|---|--------|---------|-----------|
| 1 | Sort By | Select dropdown | `sort` |
| 2 | COA Approved | Checkbox toggle | `coa` |
| 3 | Search College | Text input (debounced 300ms) | `q` |
| 4 | Accepted Exam | Chip group: All / NATA / JEE Paper 2 | `exam` |
| 5 | Ownership (College Type) | Checkboxes with counts: Government, Private, Deemed, Govt Aided | `type` |
| 6 | NAAC Grade | Chip group: A++, A+, A, B++, B+, B | `naac` |
| 7 | Annual Fee Range | Min/Max inputs + quick preset chips (Under 1L, 1-2L, 2-5L, 5L+) | `minFee`, `maxFee` |
| 8 | City | Checkboxes with counts, expandable (show top 4 + "X more") | `city` |
| 9 | Rating | Chip group: 4+ stars, 3+ stars, Any | `rating` |

**Note on Rating filter**: The `college_reviews` table has user ratings (1-5 stars). The filter will use the average review score per college. If a college has no reviews, it is treated as "unrated" and excluded from rating-based filtering. The `CollegeListItem` type needs a new field `avg_rating: number | null` populated via a join or computed column.

**New sort options** (extend existing):
- Relevance (default: ArchIndex score)
- Highest Placement
- Fee: Low to High
- Fee: High to Low
- NAAC Grade
- Name (A-Z)
- NIRF Rank

**Active filter pills**: Shown above results. Each pill has an X to remove that filter. "Clear all" link when 2+ filters active.

**Search**: Inline text input in the sidebar that filters colleges by name. Uses `q` search param. Debounced 300ms. Also shown as a standalone search bar above the card list on desktop.

### Featured College Card (Top 5)

New component: `FeaturedCollegeCard.tsx`

**Layout**: Full-width card with campus photo banner.

```
┌────────────────────────────────────────────────────────────┐
│  [⭐ Featured]                                      [#1]  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │         CAMPUS PHOTO (200px height, full width)      │  │
│  │         gradient overlay at bottom                    │  │
│  │    [College Logo 48x48, bottom-left overlapping]     │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  College Name (18px bold)                                  │
│  📍 City, State, Type                                     │
│                                                            │
│  [✓ COA] [NAAC A] [NATA] [TNEA Counseling]               │
│                                                            │
│  ┌──────────┬──────────┬──────────┬──────────┐            │
│  │ ₹1.4L/yr │   160    │ ₹6.2L/yr │  1978    │            │
│  │  Fee/yr  │  Seats   │ Avg Pkg  │  Est.    │            │
│  └──────────┴──────────┴──────────┴──────────┘            │
│                                                            │
│  [View Details]  [Compare]  [📄] [🤍] [📞]               │
└────────────────────────────────────────────────────────────┘
```

**Data shown**:
- Rank badge (circle, top-right corner of image)
- "Featured" badge (gold gradient pill, top-left, only for gold/platinum tier)
- Campus photo (`hero_image_url`, fallback: gradient + college initial)
- College logo overlay (bottom-left of image)
- College name, location (city, state), type
- Accreditation badges: COA, NAAC grade, accepted exam, counseling system
- 4-column stat grid: Annual fee, B.Arch seats, avg placement salary, established year
- Action buttons: View Details (primary), Compare, Brochure download, Save, Call admissions

**Hover**: Subtle box-shadow elevation + border color change to primary.light

### Compact College Card (Rank #6+)

New component: `CompactCollegeCard.tsx`

**Layout**: Single horizontal row card.

```
┌─────────────────────────────────────────────────────────────────┐
│  [6]  [Logo]  College Name                    ₹80K/yr  60  [→] │
│              📍 City, Type, ✓ COA  [NATA]     Fee     Seats     │
└─────────────────────────────────────────────────────────────────┘
```

**Data shown**:
- Rank number (circle badge, left)
- College logo or initial (40x40)
- College name (truncated if needed)
- Location + COA badge inline
- Exam badge (small chip)
- Fee/yr and seats (right-aligned stats)
- "Details" button or chevron

**Hover**: Light shadow + border highlight

### Ad Banners

New component: `SponsoredBanner.tsx`

**Placement**: After featured card #2, then every 5 compact cards.

**Design**: Warm amber background (#fef3c7), dashed amber border, "Sponsored" label (10px uppercase), CTA text with link. Clearly distinguishable from college cards.

**Data**: For now, static placeholder. Future: could pull from a `sponsored_banners` table or ad network.

### Search Bar

A search input field shown in two places:
1. Inside the filter sidebar (always visible)
2. Above the results area on desktop (between active filter pills and results count)

Both are synced to the same `q` URL param. Debounced 300ms. Filters the current listing by college name (case-insensitive substring match).

## Design: Mobile Layout (375px)

### Header + Search
- Breadcrumb, H1 title, subtitle
- Full-width search bar below header
- Horizontal scrollable filter chip bar (COA, Fee, Exam, Govt/Pvt, NAAC, City, Rating)
- Tapping a chip toggles it or opens a mini bottom-sheet for that filter category

### Floating Action Buttons
- Two floating pills at bottom-center, always visible while scrolling
- "Filters" button (primary blue) with active filter count badge (red circle)
- "Sort" button (white/outlined) opens sort bottom-sheet

### Filter Drawer (85vh bottom sheet)
- Opens on "Filters" FAB tap
- Drag handle at top
- Header: "Filters" + "Clear all" link
- All filter sections stacked vertically
- Search input at top of drawer
- Checkboxes and chips with 44px+ touch targets
- Sticky "Apply" button at bottom (shows result count: "Show 28 colleges")
- "Reset" button next to Apply

### Featured Cards (Mobile)
- Full-width, stacked vertically
- Campus photo: 150px height, full width
- Logo: 40x40, overlapping bottom-left of photo
- 3-column stat grid (fee, seats, avg package) instead of 4
- Action buttons: View Details (full-width primary), Compare + Save (icon buttons)

### Compact Cards (Mobile)
- Full-width row cards
- Left: rank circle + logo stacked
- Center: name, location, COA inline
- Right: fee + seats stats, chevron ">"
- Entire card is tappable (navigates to detail page)

### Ad Banners (Mobile)
- Full-width, same amber design, slightly less padding
- Appears after featured #2, then every 4 compact cards

## Files to Modify

| File | Change |
|------|--------|
| `apps/marketing/src/components/college-hub/FilterSidebar.tsx` | Add search input, exam filter, city filter with counts, rating filter, new sort options, fee preset chips |
| `apps/marketing/src/components/college-hub/CollegeListingCard.tsx` | Deprecate (replaced by FeaturedCollegeCard + CompactCollegeCard) |
| `apps/marketing/src/lib/college-hub/types.ts` | Add `exam`, `city`, `rating` to `CollegeFilters`; add new sort options |
| `apps/marketing/src/lib/college-hub/queries.ts` | Add `exam` filter, `city` filter, `rating` filter, `placement_high` sort, update query logic |
| `apps/marketing/src/app/[locale]/colleges/[state]/page.tsx` | Update to use tiered layout: FeaturedCollegeCard for top 5, CompactCollegeCard for rest, ad banners |

## Files to Create

| File | Purpose |
|------|---------|
| `apps/marketing/src/components/college-hub/FeaturedCollegeCard.tsx` | Large card for top 5 ranked colleges |
| `apps/marketing/src/components/college-hub/CompactCollegeCard.tsx` | Slim row card for remaining colleges |
| `apps/marketing/src/components/college-hub/SponsoredBanner.tsx` | Ad banner component |
| `apps/marketing/src/components/college-hub/CollegeSearch.tsx` | Debounced search input (shared between sidebar and content area) |
| `apps/marketing/src/components/college-hub/ActiveFilterPills.tsx` | Active filter display with remove buttons |

## CollegeFilters Type Update

```typescript
export interface CollegeFilters {
  state?: string;
  type?: string;           // "Government" | "Private" | "Deemed" | "Government Aided"
  counselingSystem?: CounselingSystem;
  exam?: 'NATA' | 'JEE_PAPER_2';  // NEW
  city?: string;                     // NEW: city_slug
  rating?: number;                   // NEW: minimum rating (3 or 4)
  minFee?: number;
  maxFee?: number;
  naacGrade?: string;
  coa?: boolean;
  search?: string;                   // renamed from q for clarity
  sortBy?: 'arch_index' | 'nirf_rank' | 'fee_low' | 'fee_high' | 'name' | 'placement_high' | 'naac_grade';  // NEW options
  page?: number;
  limit?: number;
}
```

## Exam Data Correction

Update the `accepted_exams` field for colleges in the database:
- Most state-counseling colleges: `["NATA"]`
- NITs, IITs, SPAs (JoSAA colleges): `["JEE_PAPER_2"]` or `["NATA", "JEE_PAPER_2"]` if they accept both
- Remove incorrect "JEE Main Paper 2" labels from state-counseling-only colleges

This can be done via a migration or a one-time SQL update script.

## Ad Banner Strategy

- **Phase 1 (now)**: Static placeholder banners with generic B.Arch admission CTAs
- **Phase 2 (future)**: College-sponsored banners stored in DB (colleges pay for premium placement)
- **Placement rules**: After featured card #2, then every 5 compact cards on desktop (every 4 on mobile)
- **Labeling**: Always show "Sponsored" label for transparency

## Campus Photos

- Use `hero_image_url` from the colleges table (already exists)
- Fallback: gradient background (#1e3a5f to #2d5a87) with large college initial letter
- Photos should be loaded via `next/image` with `sizes` prop for responsive loading
- Priority loading for top 2 cards, lazy loading for rest

## Verification

1. Run `pnpm dev:marketing` and navigate to `/colleges/tamil-nadu`
2. Verify desktop layout: filter sidebar on left (280px sticky), search bar, featured cards top 5, compact cards below, ad banners
3. Verify filter interactions: each filter updates URL params and re-fetches results
4. Verify search: type college name, results filter in real-time (300ms debounce)
5. Verify sort: all sort options produce correct ordering
6. Resize to 375px: filter sidebar disappears, floating FAB appears, filter drawer opens on tap
7. Mobile: horizontal chip bar scrolls, featured cards stack vertically, compact cards show chevron
8. Mobile: all touch targets are 44px+, no horizontal overflow
9. Check that COA, NAAC, fee, exam badges display correctly based on data
10. Verify ad banners appear at correct intervals

## Visual Mockups

Interactive mockups saved in `.superpowers/brainstorm/5132-1776427178/content/`:
- `full-layout-mockup.html`: Desktop layout with filter sidebar + tiered cards
- `mobile-mockup.html`: Mobile phone frames showing listing view + filter drawer
