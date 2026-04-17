# SEO Tool Landing Pages: Design Specification

## Context

The marketing site (`neramclasses.com`) has 4 tool pages under `/tools/`. Three of them (College Predictor, Exam Centers, Question Bank) are already SEO landing pages that link to the real tool in the app. However, the **Cutoff Calculator** page has a basic, hardcoded calculator embedded that gives misleading results instead of following the same SEO landing page pattern.

Additionally, the app (`app.neramclasses.com`) has 6 more tools with **no marketing SEO presence** at all: Rank Predictor, COA Checker, Exam Planner, Eligibility Checker, Cost Calculator, and Counseling Insights.

**Goal**: Transform all marketing tool pages into SEO/AEO-optimized landing pages that drive organic search traffic and funnel users to the real tools in the app. No tool should duplicate functionality from the app. Instead, each page provides rich informational content, a lightweight teaser interaction, and a clear CTA to the app.

**Why now**: Students searching for "NATA cutoff calculator", "NATA rank predictor", "B.Arch college predictor" etc. should land on our marketing pages. These pages need to rank well on Google, appear in AI search results (Perplexity, ChatGPT, Google AI Overviews), and convert visitors to app users.

## Scope

### Pages to create/modify

| # | Page | Route | Action | App Tool URL |
|---|------|-------|--------|-------------|
| 1 | Tools Hub | `/tools` | **CREATE** | N/A (index page) |
| 2 | Cutoff Calculator | `/tools/cutoff-calculator` | **REDESIGN** (remove fake calculator) | `app.neramclasses.com/tools/nata/cutoff-calculator` |
| 3 | College Predictor | `/tools/college-predictor` | **REFRESH** (add teaser, screenshots) | `app.neramclasses.com/tools/counseling/college-predictor` |
| 4 | Exam Centers | `/tools/exam-centers` | **REFRESH** (add teaser, screenshots) | `app.neramclasses.com/tools/nata/exam-centers` |
| 5 | Question Bank | `/tools/question-bank` | **REFRESH** (add teaser, screenshots) | `app.neramclasses.com/tools/nata/question-bank` |
| 6 | Rank Predictor | `/tools/rank-predictor` | **CREATE** | `app.neramclasses.com/tools/counseling/rank-predictor` |
| 7 | Eligibility Checker | `/tools/eligibility-checker` | **CREATE** | `app.neramclasses.com/tools/nata/eligibility-checker` |
| 8 | Exam Planner | `/tools/exam-planner` | **CREATE** | `app.neramclasses.com/tools/nata/exam-planner` |
| 9 | COA Checker | `/tools/coa-checker` | **CREATE** | `app.neramclasses.com/tools/counseling/coa-checker` |
| 10 | Cost Calculator | `/tools/cost-calculator` | **CREATE** | `app.neramclasses.com/tools/nata/cost-calculator` |
| 11 | Counseling Insights | `/tools/counseling-insights` | **CREATE** | `app.neramclasses.com/tools/counseling/insights` |

### Supporting changes

- **Header.tsx**: Add "Free Tools" link pointing to `/tools` hub page. Keep existing tool links in NATA Prep and Counseling dropdowns.
- **Sitemap**: Add all new tool pages with `priority: 0.8`, `changefreq: weekly`.
- **Search index**: Add all new tool pages to `STATIC_INDEX` in `search-index.ts`.
- **Footer**: Add "Free Tools" link in the Resources column.

## Architecture

### Approach: Shared Template with Per-Tool Config

A reusable `ToolLandingPage` component renders the page layout. Each tool provides a `ToolConfig` object with its content. The teaser widget is the only custom component per tool.

### File structure

```
apps/marketing/src/
├── components/
│   ├── tools/
│   │   ├── ToolLandingPage.tsx        # Shared template component
│   │   ├── ToolHero.tsx               # Hero section
│   │   ├── ToolTeaser.tsx             # Teaser wrapper (holds custom widget)
│   │   ├── ToolHowItWorks.tsx         # Steps section
│   │   ├── ToolFeatures.tsx           # Features grid
│   │   ├── ToolScreenshots.tsx        # App preview screenshots
│   │   ├── ToolFAQ.tsx               # FAQ accordion with JSON-LD
│   │   ├── ToolCTA.tsx               # Final CTA section
│   │   ├── ToolRelatedTools.tsx       # Related tools cards
│   │   └── teasers/                   # Per-tool teaser widgets
│   │       ├── CutoffTeaser.tsx
│   │       ├── CollegePredictorTeaser.tsx
│   │       ├── RankPredictorTeaser.tsx
│   │       ├── QuestionBankTeaser.tsx
│   │       ├── ExamCentersTeaser.tsx
│   │       ├── EligibilityTeaser.tsx
│   │       ├── ExamPlannerTeaser.tsx
│   │       ├── COACheckerTeaser.tsx
│   │       ├── CostCalculatorTeaser.tsx
│   │       └── CounselingInsightsTeaser.tsx
│   └── CutoffCalculatorContent.tsx     # DELETE (replaced by template)
├── lib/
│   └── tools/
│       ├── types.ts                    # ToolConfig interface
│       └── configs/                    # Per-tool config objects
│           ├── cutoff-calculator.ts
│           ├── college-predictor.ts
│           ├── rank-predictor.ts
│           ├── question-bank.ts
│           ├── exam-centers.ts
│           ├── eligibility-checker.ts
│           ├── exam-planner.ts
│           ├── coa-checker.ts
│           ├── cost-calculator.ts
│           ├── counseling-insights.ts
│           └── index.ts               # Re-exports all configs + ALL_TOOLS array
├── app/[locale]/tools/
│   ├── page.tsx                        # Tools Hub page (CREATE)
│   ├── cutoff-calculator/page.tsx      # Redesigned
│   ├── college-predictor/page.tsx      # Refreshed
│   ├── exam-centers/page.tsx           # Refreshed
│   ├── question-bank/page.tsx          # Refreshed
│   ├── rank-predictor/page.tsx         # New
│   ├── eligibility-checker/page.tsx    # New
│   ├── exam-planner/page.tsx           # New
│   ├── coa-checker/page.tsx            # New
│   ├── cost-calculator/page.tsx        # New
│   └── counseling-insights/page.tsx    # New
└── public/images/tools/                # Screenshot images
    ├── cutoff-calculator-desktop.webp
    ├── cutoff-calculator-mobile.webp
    ├── college-predictor-desktop.webp
    ├── college-predictor-mobile.webp
    └── ... (desktop + mobile per tool)
```

### ToolConfig Interface

```typescript
// apps/marketing/src/lib/tools/types.ts

import { ComponentType } from 'react';

export interface ToolStep {
  title: string;
  desc: string;
}

export interface ToolFeature {
  title: string;
  desc: string;
}

export interface ToolFAQ {
  question: string;
  answer: string;
}

export interface ToolScreenshot {
  desktop: string;       // Path relative to /public
  mobile: string;        // Path relative to /public
  caption: string;
  alt: string;
}

export interface ToolConfig {
  // Identity
  slug: string;                    // URL slug: "cutoff-calculator"
  title: string;                   // H1: "NATA Cutoff Calculator 2026"
  subtitle: string;                // Hero subtitle (2-3 sentences, keyword-rich)
  category: 'nata' | 'counseling' | 'insights';

  // Links
  appUrl: string;                  // Full URL to the tool in the app

  // SEO
  metaTitle: string;               // <title> tag (under 60 chars)
  metaDescription: string;         // <meta description> (150-160 chars)
  keywords: string[];              // 10-15 keywords
  ogImageTitle: string;            // For dynamic OG image
  ogImageSubtitle: string;

  // Trust
  trustBadges: string[];           // e.g. ["Free", "No Login Required", "10K+ Used"]

  // Content sections
  steps: ToolStep[];               // 3-4 "How it works" steps
  features: ToolFeature[];         // 6 feature cards
  screenshots: ToolScreenshot;     // Desktop + mobile screenshots
  contextHeading: string;          // H2 for the data/context section
  contextContent: string;          // HTML string rendered via dangerouslySetInnerHTML
  faqs: ToolFAQ[];                 // 6-8 FAQ items

  // Connections
  relatedToolSlugs: string[];      // 3 related tool slugs
  teaserComponent: ComponentType;  // Custom teaser widget
}
```

### ToolLandingPage Component

Receives a ToolConfig and renders the full page using sub-components in this order:

1. `<ToolHero>` with H1, subtitle, trust badges, primary CTA
2. `<config.teaserComponent />` custom teaser widget
3. `<ToolHowItWorks>` with 3-4 step cards
4. `<ToolFeatures>` with 6 feature cards in a 2-column grid
5. `<ToolScreenshots>` showing desktop + mobile screenshots of the real app tool
6. `<ToolContext>` with rich, keyword-dense content specific to the tool
7. `<ToolRelatedTools>` with 3 cross-links to other tool landing pages
8. `<ToolFAQ>` with accordion and JSON-LD FAQPage schema
9. `<ToolCTA>` with final "Use This Tool Free" and "Join Coaching" buttons

Each page.tsx file:
1. Exports `generateMetadata()` using config values
2. Renders `<JsonLd>` with BreadcrumbList + WebApplication + FAQPage schemas
3. Renders `<ToolLandingPage config={toolConfig} />`

## Teaser Widgets (Per-Tool)

Each teaser is a client component with minimal, self-contained logic. No API calls, no database access. The teaser gives a partial result to hook the user, then shows a CTA to the full tool.

### Teaser Specifications

| Tool | Input(s) | Teaser Result | CTA Text |
|------|----------|---------------|----------|
| Cutoff Calculator | Score (0-200) | "Your score of {x} puts you in the top {y}% of NATA applicants" | "See college matches and full analysis" |
| College Predictor | Score + State dropdown | "{n} colleges match your score in {state}" | "View full college list with fees and cutoffs" |
| Rank Predictor | Score (0-200) | "Estimated rank: {x} to {y}" | "Get detailed rank analysis with trends" |
| Question Bank | Subject dropdown | "{n} practice questions available in {subject}" | "Start practicing with detailed solutions" |
| Exam Centers | State dropdown | "{n} exam centers across {m} cities in {state}" | "Find centers with addresses and directions" |
| Eligibility Checker | Board dropdown + Percentage | "You {are/are not} eligible for NATA 2026" | "Check complete eligibility with all criteria" |
| Exam Planner | No input (auto) | "NATA 2026 exam is in {n} days" | "Get a personalized study plan" |
| COA Checker | College name (text) | Shows a search prompt linking to the app (no local data lookup) | "Check full approval details and history" |
| Cost Calculator | College type dropdown | "Average annual fee for {type}: {range}" | "Calculate total 5-year education cost" |
| Counseling Insights | State dropdown | "Key counseling stat for {state}" | "Get personalized counseling recommendations" |

### Teaser data

Teasers use hardcoded data maps (not API calls) for instant results. Examples:

**Cutoff Calculator teaser data:**
```typescript
const PERCENTILE_MAP: Record<number, number> = {
  // score threshold -> approximate percentile
  180: 1, 170: 3, 160: 5, 150: 10, 140: 15,
  130: 25, 120: 35, 110: 45, 100: 55, 90: 65,
  80: 75, 70: 85, 60: 92, 50: 96, 40: 99,
};
```

**Exam Centers teaser data:**
```typescript
const CENTERS_BY_STATE: Record<string, { centers: number; cities: number }> = {
  'Tamil Nadu': { centers: 12, cities: 5 },
  'Maharashtra': { centers: 15, cities: 7 },
  'Karnataka': { centers: 8, cities: 4 },
  // ... all states
};
```

**Question Bank teaser data:**
```typescript
const QUESTIONS_BY_SUBJECT: Record<string, number> = {
  'Mathematics': 450,
  'General Aptitude': 380,
  'Drawing & Design': 200,
  'Physics': 320,
  'Logical Reasoning': 250,
};
```

## Tools Hub Page

### Route
`/tools` (also accessible via `/[locale]/tools` for non-English locales)

### SEO
- Title: "Free NATA & B.Arch Admission Tools 2026 | Neram Classes"
- Description: "10+ free tools for NATA and JEE Paper 2 B.Arch aspirants. Calculate cutoffs, predict colleges, estimate rank, find exam centers, practice questions, and plan your architecture career."
- Keywords: "NATA tools, NATA preparation tools, B.Arch admission tools, NATA calculator, architecture entrance tools, free NATA tools 2026"
- JSON-LD: BreadcrumbList + ItemList (listing all tools) + WebSite SearchAction

### Page structure

1. **Hero**: H1 "Free NATA & B.Arch Admission Tools 2026", subtitle describing the tools ecosystem, trust stat ("Used by 10,000+ students")
2. **Tool Categories**: Three sections with tool cards
   - NATA Preparation (6 tools): Cutoff Calculator, Rank Predictor, Question Bank, Exam Centers, Eligibility Checker, Exam Planner
   - Counseling & Admission (3 tools): College Predictor, COA Checker, Cost Calculator
   - Analysis & Insights (1 tool): Counseling Insights
3. **Tool Card**: Each card shows icon, title, 1-line description, and "Try Now" link to individual landing page
4. **Why Use Our Tools**: 4 trust signals (Free, Real Data, Updated, 10K+ users)
5. **FAQ**: 6 questions about the tools ecosystem
6. **CTA**: Link to `/apply` for coaching

## SEO Strategy

### Keyword Targeting (per page)

Each page targets both NATA and JEE Paper 2 B.Arch keywords where relevant.

**Cutoff Calculator:**
- Primary: "NATA cutoff calculator 2026"
- Secondary: "JEE Paper 2 cutoff calculator", "B.Arch cutoff 2026", "NATA score calculator", "architecture entrance cutoff", "NATA percentile calculator", "NATA cutoff marks", "NATA college cutoff", "NATA expected cutoff", "B.Arch admission cutoff"

**College Predictor:**
- Primary: "NATA college predictor 2026"
- Secondary: "JEE B.Arch college list", "architecture colleges by NATA score", "B.Arch college predictor", "NATA score wise college list", "NATA counselling predictor", "best architecture colleges for my score"

**Rank Predictor:**
- Primary: "NATA rank predictor 2026"
- Secondary: "JEE Paper 2 rank estimator", "B.Arch rank calculator", "NATA rank from score", "NATA All India Rank estimator", "expected NATA rank"

**Question Bank:**
- Primary: "NATA question bank 2026"
- Secondary: "NATA practice questions", "NATA mock test", "JEE Paper 2 B.Arch questions", "NATA previous year questions", "architecture entrance practice", "NATA drawing questions"

**Exam Centers:**
- Primary: "NATA exam centers 2026"
- Secondary: "NATA test center list", "NATA exam center near me", "TCS iON NATA centers", "JEE Paper 2 exam centers"

**Eligibility Checker:**
- Primary: "NATA eligibility criteria 2026"
- Secondary: "NATA eligibility checker", "am I eligible for NATA", "NATA minimum marks", "B.Arch eligibility", "NATA age limit", "NATA qualification required"

**Exam Planner:**
- Primary: "NATA exam date 2026"
- Secondary: "NATA exam schedule", "NATA preparation timeline", "NATA study plan", "B.Arch entrance exam dates", "NATA important dates"

**COA Checker:**
- Primary: "COA approved colleges 2026"
- Secondary: "Council of Architecture approved colleges", "COA approval check", "is my college COA approved", "B.Arch COA recognition"

**Cost Calculator:**
- Primary: "B.Arch fees calculator"
- Secondary: "architecture college fees India", "NATA college fees comparison", "B.Arch education cost", "cheapest B.Arch colleges", "B.Arch total cost"

**Counseling Insights:**
- Primary: "NATA counselling guide 2026"
- Secondary: "B.Arch counselling process", "TNEA counselling", "JoSAA B.Arch", "architecture admission counselling", "NATA counselling dates"

### Structured Data (JSON-LD)

Every tool landing page includes:
1. **BreadcrumbList**: `Home > Free Tools > [Tool Name]`
2. **WebApplication**: `applicationCategory: "EducationalApplication"`, `offers: { price: "0" }`, `operatingSystem: "Web"`
3. **FAQPage**: All FAQ items as Q&A pairs

Tools Hub includes:
1. **BreadcrumbList**: `Home > Free Tools`
2. **ItemList**: All 10 tools as list items with name, description, URL
3. **WebSite**: With SearchAction pointing to the hub

### AEO (AI Engine Optimization)

- robots.txt already allows GPTBot, ClaudeBot, PerplexityBot (existing config)
- FAQ content is written in natural Q&A format that AI assistants can cite
- Context/data sections provide factual, cite-worthy content (cutoff ranges, exam dates, college counts)
- Each page has a clear, authoritative answer to the primary search intent

## Navigation Changes

### Header.tsx modifications

1. Add a "Free Tools" link/button visible on both desktop and mobile
   - Desktop: Appears as a nav item or prominent button linking to `/tools`
   - Mobile: Appears in the mobile drawer navigation
2. Keep existing tool links in NATA Prep and Counseling dropdowns (dual discoverability)
3. Update any dead links (rank-predictor, coa-checker) to point to new marketing pages instead of app URLs

### Footer.tsx modifications

1. Add "Free Tools" entry in the "Resources" column
2. Link to `/tools` hub page

### Sitemap.ts modifications

Add all new tool pages:
```typescript
{ path: '/tools', lastModified: '2026-04-17' },
{ path: '/tools/rank-predictor', lastModified: '2026-04-17' },
{ path: '/tools/eligibility-checker', lastModified: '2026-04-17' },
{ path: '/tools/exam-planner', lastModified: '2026-04-17' },
{ path: '/tools/coa-checker', lastModified: '2026-04-17' },
{ path: '/tools/cost-calculator', lastModified: '2026-04-17' },
{ path: '/tools/counseling-insights', lastModified: '2026-04-17' },
```

### Search index modifications

Add entries to `STATIC_INDEX` in `apps/marketing/src/lib/search-index.ts` for each new tool page.

## Mobile-First Design Rules

All components follow the project's mobile-first mandate:
- Design for 375px viewport first
- Touch targets: 48x48px minimum
- Teaser inputs: full-width on mobile, min-height 48px
- Tool cards on hub: 1 column on mobile, 2 on tablet, 3 on desktop
- Screenshots section: mobile screenshot shown prominently on mobile viewport
- FAQ: Accordion-style (collapsed by default)
- CTAs: Full-width buttons on mobile

## Screenshots

Screenshots of each tool from the app will be captured and stored as static images:
- Format: WebP for size optimization
- Desktop: ~1200px wide screenshot
- Mobile: ~375px wide screenshot
- Stored in: `public/images/tools/[tool-slug]-desktop.webp` and `[tool-slug]-mobile.webp`
- Loaded via `next/image` with responsive sizing and lazy loading

For the initial implementation, placeholder SVG images can be used with a TODO to capture real screenshots once the app tools are running.

## Caching & Performance

- All tool landing pages are **fully static** (`revalidate = false` or ISR with long TTL)
- No API calls on the marketing tool pages
- Teaser widgets are client components but use hardcoded data (no fetch)
- Screenshots lazy-loaded below the fold
- Hub page is fully static

## Files to Delete

- `apps/marketing/src/components/CutoffCalculatorContent.tsx` (replaced by template + teaser)

## Verification Plan

1. **Build check**: `pnpm build` passes with no errors for the marketing app
2. **Visual check**: Each tool page renders correctly at 375px, 768px, and 1280px viewports
3. **SEO check**: Each page has correct metadata (title, description, OG), JSON-LD schemas validate (use Google Rich Results Test)
4. **Link check**: All "Use This Tool Free" CTAs link to the correct app tool URLs
5. **Navigation check**: "Free Tools" link appears in header and footer, all tool pages are accessible from the hub
6. **Sitemap check**: All new pages appear in the generated sitemap.xml
7. **Lighthouse**: Each page scores 90+ on Performance, 100 on SEO, 100 on Accessibility
8. **No duplicate tools**: Cutoff calculator page has NO embedded calculator logic, only the teaser widget
