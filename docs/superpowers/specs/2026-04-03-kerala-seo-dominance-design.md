# Kerala SEO/AEO Dominance — Design Spec

## Context

Neram Classes currently has zero search visibility for "NATA coaching" queries in Kerala cities (Kochi, Trivandrum, Calicut, Thrissur, Kannur). The Chennai hub-and-spoke SEO pattern (state hub + city hub + neighborhood pages) has proven effective. This spec replicates and generalizes that pattern across Kerala's top 5 cities, with physical centers planned.

**Goal**: Dominate Google search and AI answer engines for NATA coaching queries in Kerala — every major city and neighborhood should surface Neram Classes.

---

## Page Architecture

### URL Structure (~32 pages total)

```
/coaching/nata-coaching-kerala/                    ← State Hub (1)
├── /coaching/nata-coaching-kochi/                  ← City Hub (5)
│   ├── /coaching/nata-coaching-kochi/edappally
│   ├── /coaching/nata-coaching-kochi/kakkanad
│   ├── /coaching/nata-coaching-kochi/marine-drive
│   ├── /coaching/nata-coaching-kochi/aluva
│   └── /coaching/nata-coaching-kochi/tripunithura
├── /coaching/nata-coaching-trivandrum/
│   ├── .../kowdiar
│   ├── .../pattom
│   ├── .../technopark
│   ├── .../kazhakkoottam
│   └── .../vattiyoorkavu
├── /coaching/nata-coaching-calicut/
│   ├── .../mavoor-road
│   ├── .../palayam
│   ├── .../feroke
│   ├── .../nadakkavu
│   └── .../beypore
├── /coaching/nata-coaching-thrissur/
│   ├── .../round-south
│   ├── .../ollur
│   ├── .../poothole
│   └── .../ayyanthole
└── /coaching/nata-coaching-kannur/
    ├── .../city-center
    ├── .../thavakkara
    ├── .../thalassery
    └── .../mattannur
```

**URL naming**: Use popular search names, not official names — `calicut` (not `kozhikode`), `trivandrum` (not `thiruvananthapuram`). Redirect official names to popular names.

### Language Support

Every page gets English (default) + Malayalam (`/ml/...`) variants with proper `hreflang` tags.

---

## Content Strategy

### State Hub — `/coaching/nata-coaching-kerala/`

**Target keywords**: "NATA coaching Kerala", "best NATA coaching in Kerala 2026", "NATA classes Kerala"

**Sections**:
1. **Hero**: "Best NATA Coaching in Kerala — Online + Classroom | Since 2009"
2. **Kerala stats panel**: Architecture colleges in Kerala (NIT Calicut, CET Trivandrum, TKM Kollam, GEC Thrissur, MES Kuttippuram), NATA cutoffs for Kerala colleges, number of Kerala students trained
3. **City grid**: Cards for each of the 5 cities with quick stats, linking to city hubs
4. **Why Neram for Kerala students**: Hybrid model (online now + physical centers coming), IIT/NIT alumni faculty, free AI study app, 99.9% success rate
5. **Course offerings**: NATA 2026 coaching packages with Kerala-relevant pricing
6. **FAQ section** (8-10 questions): "Is NATA coaching available in Kerala?", "Which is the best NATA coaching center in Kerala?", "Can I attend NATA coaching online from Kerala?", "What are the top architecture colleges in Kerala?", "What NATA score is needed for NIT Calicut?"
7. **CTA**: Book free demo class / Apply now

### City Hub — `/coaching/nata-coaching-[city]/`

**Target keywords**: "NATA coaching [city]", "NATA coaching center in [city]", "best NATA classes [city]"

**Sections**:
1. **Hero**: "Best NATA Coaching in [City] 2026 | Neram Classes"
2. **Neighborhood grid**: Cards for each area with distance/transport info
3. **City context**: Nearby architecture colleges, why [city] students choose architecture, local landmarks relevant to sketching/design practice
4. **How it works**: Online live classes now + physical center coming soon to [city]
5. **Course details**: Batch timings suited to Kerala academic calendar
6. **Student success stories**: Placeholder section for future Kerala testimonials
7. **FAQ section** (6-8 city-specific questions)
8. **CTA**: Book free demo class

### Neighborhood Page — `/coaching/nata-coaching-[city]/[area]`

**Target keywords**: "NATA coaching [area]", "NATA classes near [area] [city]", "architecture coaching [area]"

**Sections**:
1. **Hero**: "Best NATA Coaching in [Area], [City] 2026"
2. **Area description**: Local character, educational institutions, landmarks
3. **Transport & access**: How to reach the center from this area (bus routes, metro, auto), distance and travel time
4. **Nearby schools**: Schools in the area whose students benefit from NATA coaching
5. **Local landmarks**: Sketching/design-relevant landmarks for practice
6. **Why students from [area] choose Neram**: Personalized pitch
7. **FAQ** (4-6 hyper-local questions)
8. **Breadcrumb**: Home > Coaching > Kerala > [City] > [Area]

---

## Technical Architecture

### Generalized Data Model

Replace Chennai-specific code with a generic city/neighborhood system.

**New file**: `src/lib/seo/city-neighborhoods.ts`

```typescript
export interface CityNeighborhood {
  slug: string;
  name: string;
  displayName: string;
  distanceFromCenter: string;
  transportInfo: string;
  landmarks: string[];
  nearbySchools: string[];
  description: string;
  whyStudentsChoose: string;
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
}

export interface CityData {
  slug: string;                    // URL slug: "kochi", "trivandrum", "calicut"
  officialName: string;            // "Kozhikode" (for redirects)
  displayName: string;             // "Calicut (Kozhikode)"
  state: string;                   // "Kerala"
  stateSlug: string;               // "kerala"
  centerAddress: string;           // Physical center address (or "Coming Soon")
  centerCoords: { lat: number; lng: number };
  nearbyColleges: string[];        // Architecture colleges nearby
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
  neighborhoods: CityNeighborhood[];
}
```

**Data files**:
- `src/lib/seo/kerala-cities.ts` — All 5 Kerala cities with neighborhoods
- Keep `src/lib/seo/chennai-neighborhoods.ts` as-is (backward compat), but future cities use new format

### Generalized Component

**Rename/generalize**: `ChennaiNeighborhoodPage` → `CityNeighborhoodPage`

The component accepts `CityData` + `CityNeighborhood` props and renders the same rich layout. Chennai pages should be migrated to use this component too (but can be done later).

### New Components

| Component | Purpose |
|-----------|---------|
| `StateHubPage` | Kerala state hub with city grid, stats, FAQ |
| `CityHubPage` | City hub with neighborhood grid, local context |
| `CityNeighborhoodPage` | Generalized neighborhood page (from Chennai pattern) |

### Route Structure

```
src/app/[locale]/coaching/
├── nata-coaching-kerala/
│   └── page.tsx                   ← State hub (static)
├── nata-coaching-kochi/
│   ├── page.tsx                   ← City hub (static)
│   └── [slug]/page.tsx            ← Neighborhood pages (static via generateStaticParams)
├── nata-coaching-trivandrum/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── nata-coaching-calicut/
│   ├── page.tsx
│   └── [slug]/page.tsx
├── nata-coaching-thrissur/
│   ├── page.tsx
│   └── [slug]/page.tsx
└── nata-coaching-kannur/
    ├── page.tsx
    └── [slug]/page.tsx
```

Each city gets its own route folder (not dynamic `[city]`) for maximum SEO control — exact-match URLs rank better than dynamic catch-alls.

### Redirects (next.config.js)

Add redirects for alternate city name spellings:
- `/coaching/nata-coaching-kozhikode/:path*` → `/coaching/nata-coaching-calicut/:path*`
- `/coaching/nata-coaching-thiruvananthapuram/:path*` → `/coaching/nata-coaching-trivandrum/:path*`
- `/coaching/nata-coaching-ernakulam/:path*` → `/coaching/nata-coaching-kochi/:path*`
- `/coaching/nata-coaching-cochin/:path*` → `/coaching/nata-coaching-kochi/:path*`
- `/coaching/nata-coaching-trichur/:path*` → `/coaching/nata-coaching-thrissur/:path*`
- `/coaching/nata-coaching-cannanore/:path*` → `/coaching/nata-coaching-kannur/:path*`

---

## SEO & AEO Implementation

### Structured Data (JSON-LD) per page type

**State Hub**:
- `EducationalOrganization` with `areaServed: "Kerala"`
- `BreadcrumbList`: Home > Coaching > NATA Coaching Kerala
- `FAQPage` schema

**City Hub**:
- `LocalBusiness` with city geo coordinates
- `EducationalOrganization` with `areaServed: "[City]"`
- `BreadcrumbList`: Home > Coaching > Kerala > [City]
- `FAQPage` schema

**Neighborhood Page**:
- `LocalBusiness` with neighborhood-specific coords
- `BreadcrumbList`: Home > Coaching > Kerala > [City] > [Area]
- `FAQPage` schema

### Sitemap Updates

Add all Kerala pages to `sitemap.ts`:
- State hub: priority 0.9, weekly
- City hubs: priority 0.9, weekly
- Neighborhood pages: priority 0.8, weekly

Auto-generate from `kerala-cities.ts` data — no hardcoding.

### Open Graph

Dynamic OG images via existing `/api/og` endpoint:
- State hub: "Best NATA Coaching in Kerala 2026 | Neram Classes"
- City hub: "NATA Coaching in [City] 2026 | Neram Classes"
- Neighborhood: "NATA Coaching in [Area], [City] | Neram Classes"

### Internal Linking Strategy

- **Breadcrumb navigation** on every page (visible + schema)
- **State hub** links to all 5 city hubs
- **City hub** links to all its neighborhoods + back to state hub
- **Neighborhood** links back to city hub + to adjacent neighborhoods
- **Homepage** coaching section links to Kerala state hub
- **Existing coaching pages** cross-link to Kerala pages where relevant

### AEO (AI Answer Engine Optimization)

- FAQ content written in conversational Q&A format (optimized for AI extraction)
- "People Also Ask" style questions per page
- GPTBot, PerplexityBot, ClaudeBot already allowed in robots.txt
- Content structured with clear headers and concise answers

---

## Malayalam (ml) Localization

- Add translation keys to `messages/ml.json` for all Kerala page content
- Kerala-specific content (neighborhood descriptions, FAQ answers) translated to Malayalam
- `hreflang` alternates: `en` + `ml` for every Kerala page
- Malayalam meta titles and descriptions for better regional search ranking

---

## Files to Create/Modify

### New Files
| File | Purpose |
|------|---------|
| `src/lib/seo/city-neighborhoods.ts` | Generic `CityData` + `CityNeighborhood` interfaces |
| `src/lib/seo/kerala-cities.ts` | All 5 Kerala cities with neighborhood data |
| `src/components/seo/StateHubPage.tsx` | Kerala state hub component |
| `src/components/seo/CityHubPage.tsx` | Generic city hub component |
| `src/components/seo/CityNeighborhoodPage.tsx` | Generic neighborhood component (from Chennai pattern) |
| `src/app/[locale]/coaching/nata-coaching-kerala/page.tsx` | State hub route |
| `src/app/[locale]/coaching/nata-coaching-kochi/page.tsx` | Kochi city hub |
| `src/app/[locale]/coaching/nata-coaching-kochi/[slug]/page.tsx` | Kochi neighborhoods |
| `src/app/[locale]/coaching/nata-coaching-trivandrum/page.tsx` | Trivandrum city hub |
| `src/app/[locale]/coaching/nata-coaching-trivandrum/[slug]/page.tsx` | Trivandrum neighborhoods |
| `src/app/[locale]/coaching/nata-coaching-calicut/page.tsx` | Calicut city hub |
| `src/app/[locale]/coaching/nata-coaching-calicut/[slug]/page.tsx` | Calicut neighborhoods |
| `src/app/[locale]/coaching/nata-coaching-thrissur/page.tsx` | Thrissur city hub |
| `src/app/[locale]/coaching/nata-coaching-thrissur/[slug]/page.tsx` | Thrissur neighborhoods |
| `src/app/[locale]/coaching/nata-coaching-kannur/page.tsx` | Kannur city hub |
| `src/app/[locale]/coaching/nata-coaching-kannur/[slug]/page.tsx` | Kannur neighborhoods |

### Modified Files
| File | Change |
|------|--------|
| `src/lib/seo/schemas.ts` | Add `generateStateHubSchema()`, `generateCityHubSchema()`, generalize `generateChennaiNeighborhoodSchema()` |
| `src/app/sitemap.ts` | Auto-include Kerala pages from data file |
| `next.config.js` | Add alternate spelling redirects |
| `messages/en.json` | Add Kerala page translation keys |
| `messages/ml.json` | Add Malayalam translations for Kerala content |

---

## Verification Plan

1. **Build check**: `pnpm build` — all new pages render without errors
2. **SEO audit**: Check each page has correct `<title>`, `<meta description>`, `<link rel="canonical">`, `hreflang`, OG tags
3. **Schema validation**: Test JSON-LD output with Google Rich Results Test for each page type
4. **Sitemap check**: Verify all ~32 new pages appear in `sitemap.xml` with correct priority
5. **Redirect test**: Verify `/coaching/nata-coaching-kozhikode/` redirects to `/coaching/nata-coaching-calicut/`
6. **Malayalam check**: Verify `/ml/coaching/nata-coaching-kerala/` renders Malayalam content
7. **Mobile test**: All pages pass mobile viewport test (375px, no horizontal scroll)
8. **Internal links**: Verify breadcrumb navigation works across all levels
9. **Lighthouse**: Run Lighthouse on state hub + one city hub + one neighborhood page — target 90+ SEO score
