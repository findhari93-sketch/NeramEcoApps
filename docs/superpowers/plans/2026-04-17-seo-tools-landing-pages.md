# SEO Tool Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform marketing tool pages into SEO-optimized landing pages with teaser interactions that funnel users to the real tools in the app. 11 pages total (1 hub + 10 tool pages).

**Architecture:** Shared `ToolLandingPage` template component with per-tool config objects. Each tool provides a `ToolConfig` with content data and a custom teaser widget (client component with hardcoded data, no API calls). All pages are fully static.

**Tech Stack:** Next.js 14 App Router, MUI v5 (via `@neram/ui`), next-intl, `@/lib/seo/schemas` for JSON-LD

**Spec:** `docs/superpowers/specs/2026-04-17-seo-tools-landing-pages-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `apps/marketing/src/lib/tools/types.ts` | ToolConfig interface and related types |
| `apps/marketing/src/lib/tools/configs/cutoff-calculator.ts` | Config for cutoff calculator |
| `apps/marketing/src/lib/tools/configs/college-predictor.ts` | Config for college predictor |
| `apps/marketing/src/lib/tools/configs/rank-predictor.ts` | Config for rank predictor |
| `apps/marketing/src/lib/tools/configs/question-bank.ts` | Config for question bank |
| `apps/marketing/src/lib/tools/configs/exam-centers.ts` | Config for exam centers |
| `apps/marketing/src/lib/tools/configs/eligibility-checker.ts` | Config for eligibility checker |
| `apps/marketing/src/lib/tools/configs/exam-planner.ts` | Config for exam planner |
| `apps/marketing/src/lib/tools/configs/coa-checker.ts` | Config for COA checker |
| `apps/marketing/src/lib/tools/configs/cost-calculator.ts` | Config for cost calculator |
| `apps/marketing/src/lib/tools/configs/counseling-insights.ts` | Config for counseling insights |
| `apps/marketing/src/lib/tools/configs/index.ts` | Re-exports all configs + ALL_TOOLS array |
| `apps/marketing/src/components/tools/ToolLandingPage.tsx` | Shared template orchestrator |
| `apps/marketing/src/components/tools/ToolHero.tsx` | Hero section sub-component |
| `apps/marketing/src/components/tools/ToolTeaser.tsx` | Teaser wrapper sub-component |
| `apps/marketing/src/components/tools/ToolHowItWorks.tsx` | Steps section |
| `apps/marketing/src/components/tools/ToolFeatures.tsx` | Features grid section |
| `apps/marketing/src/components/tools/ToolScreenshots.tsx` | App preview screenshots |
| `apps/marketing/src/components/tools/ToolContext.tsx` | Keyword-rich content section |
| `apps/marketing/src/components/tools/ToolFAQ.tsx` | Accordion FAQ section |
| `apps/marketing/src/components/tools/ToolCTA.tsx` | Final CTA section |
| `apps/marketing/src/components/tools/ToolRelatedTools.tsx` | Related tools cross-links |
| `apps/marketing/src/components/tools/teasers/CutoffTeaser.tsx` | Cutoff calculator teaser |
| `apps/marketing/src/components/tools/teasers/CollegePredictorTeaser.tsx` | College predictor teaser |
| `apps/marketing/src/components/tools/teasers/RankPredictorTeaser.tsx` | Rank predictor teaser |
| `apps/marketing/src/components/tools/teasers/QuestionBankTeaser.tsx` | Question bank teaser |
| `apps/marketing/src/components/tools/teasers/ExamCentersTeaser.tsx` | Exam centers teaser |
| `apps/marketing/src/components/tools/teasers/EligibilityTeaser.tsx` | Eligibility checker teaser |
| `apps/marketing/src/components/tools/teasers/ExamPlannerTeaser.tsx` | Exam planner teaser |
| `apps/marketing/src/components/tools/teasers/COACheckerTeaser.tsx` | COA checker teaser |
| `apps/marketing/src/components/tools/teasers/CostCalculatorTeaser.tsx` | Cost calculator teaser |
| `apps/marketing/src/components/tools/teasers/CounselingInsightsTeaser.tsx` | Counseling insights teaser |
| `apps/marketing/src/app/[locale]/tools/page.tsx` | Tools hub page |
| `apps/marketing/src/app/[locale]/tools/rank-predictor/page.tsx` | Rank predictor page |
| `apps/marketing/src/app/[locale]/tools/eligibility-checker/page.tsx` | Eligibility checker page |
| `apps/marketing/src/app/[locale]/tools/exam-planner/page.tsx` | Exam planner page |
| `apps/marketing/src/app/[locale]/tools/coa-checker/page.tsx` | COA checker page |
| `apps/marketing/src/app/[locale]/tools/cost-calculator/page.tsx` | Cost calculator page |
| `apps/marketing/src/app/[locale]/tools/counseling-insights/page.tsx` | Counseling insights page |

### Modified Files

| File | Changes |
|------|---------|
| `apps/marketing/src/app/[locale]/tools/cutoff-calculator/page.tsx` | Replace CutoffCalculatorContent with ToolLandingPage template |
| `apps/marketing/src/app/[locale]/tools/college-predictor/page.tsx` | Replace inline sections with ToolLandingPage template |
| `apps/marketing/src/app/[locale]/tools/exam-centers/page.tsx` | Replace inline sections with ToolLandingPage template |
| `apps/marketing/src/app/[locale]/tools/question-bank/page.tsx` | Replace inline sections with ToolLandingPage template |
| `apps/marketing/src/app/sitemap.ts:46-49` | Add 7 new tool entries after existing tools |
| `apps/marketing/src/lib/search-index.ts:459-494` | Add 7 new entries in Free Tools section |
| `apps/marketing/src/components/Header.tsx:133-242` | Add "Free Tools" nav link |
| `apps/marketing/src/components/Footer.tsx` | Add "Free Tools" in resources column |

### Deleted Files

| File | Reason |
|------|--------|
| `apps/marketing/src/components/CutoffCalculatorContent.tsx` | Replaced by template + teaser pattern |

---

## Sequencing

```
Task 1 (types) ──┐
                  ├── Task 2 (template components) ──┐
                  │                                    ├── Tasks 3-6 (parallel: 4 existing tools)
                  │                                    │      │
                  │                                    │      ├── Task 7 (configs index)
                  │                                    │      │      │
                  │                                    │      │      ├── Tasks 8-13 (parallel: 6 new tools)
                  │                                    │      │      │      │
                  │                                    │      │      │      ├── Task 14 (tools hub)
                  │                                    │      │      │      │      │
                  │                                    │      │      │      │      └── Task 15 (nav/sitemap)
```

**Parallelizable groups:**
- Tasks 3, 4, 5, 6 can run in parallel after Tasks 1+2
- Tasks 8, 9, 10, 11, 12, 13 can run in parallel after Task 7
- Task 14 and Task 15 must wait for all tool pages

---

## Key Implementation Notes

1. **Gradient colors by category** (ToolHero derives from `config.category`):
   - nata: Blue `linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)`
   - counseling: Green `linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)`
   - insights: Purple `linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)`

2. **Teaser components are values, not JSX**: Config files import the component and assign: `teaserComponent: CutoffTeaser`

3. **Circular import avoidance**: Config files do NOT import from configs/index.ts. Only ToolRelatedTools imports from the index to look up related tools by slug.

4. **Screenshots placeholder**: Use a grey `Box` with "Screenshot coming soon" text for initial implementation. Real WebP screenshots go in `public/images/tools/` later.

5. **No i18n flag on sitemap entries**: Existing tool pages have no `i18n: true`. New pages follow same pattern.

6. **Breadcrumb label**: Use "Free Tools" (not "Tools") as the breadcrumb label.

7. **Content writing rule**: NEVER use em dashes, double dashes, or &mdash; in any user-visible content. Use commas, colons, periods, or parentheses instead.

8. **MUI imports**: Server components import from `@neram/ui`. Client components also import from `@neram/ui`. Accordion and ExpandMoreIcon are available via `@neram/ui`.

---

## Task 1: Foundation Types

**Files:**
- Create: `apps/marketing/src/lib/tools/types.ts`

- [ ] **Step 1: Create the ToolConfig types file**

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
  desktop: string;
  mobile: string;
  caption: string;
  alt: string;
}

export interface ToolConfig {
  slug: string;
  title: string;
  subtitle: string;
  category: 'nata' | 'counseling' | 'insights';
  appUrl: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string[];
  ogImageTitle: string;
  ogImageSubtitle: string;
  trustBadges: string[];
  steps: ToolStep[];
  features: ToolFeature[];
  screenshots: ToolScreenshot;
  contextHeading: string;
  contextContent: string;
  faqs: ToolFAQ[];
  relatedToolSlugs: string[];
  teaserComponent: ComponentType;
}

export interface ToolCardData {
  slug: string;
  title: string;
  description: string;
  category: 'nata' | 'counseling' | 'insights';
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/lib/tools/types.ts
git commit -m "feat(marketing): add ToolConfig types for SEO tool landing pages"
```

---

## Task 2: Template Sub-Components

**Files:**
- Create: `apps/marketing/src/components/tools/ToolHero.tsx`
- Create: `apps/marketing/src/components/tools/ToolTeaser.tsx`
- Create: `apps/marketing/src/components/tools/ToolHowItWorks.tsx`
- Create: `apps/marketing/src/components/tools/ToolFeatures.tsx`
- Create: `apps/marketing/src/components/tools/ToolScreenshots.tsx`
- Create: `apps/marketing/src/components/tools/ToolContext.tsx`
- Create: `apps/marketing/src/components/tools/ToolFAQ.tsx`
- Create: `apps/marketing/src/components/tools/ToolCTA.tsx`
- Create: `apps/marketing/src/components/tools/ToolRelatedTools.tsx`
- Create: `apps/marketing/src/components/tools/ToolLandingPage.tsx`

- [ ] **Step 1: Create ToolHero.tsx**

Server component. Renders H1, subtitle, trust badges (as Chip components), and primary CTA button. Gradient color derived from `config.category`:
- nata: `linear-gradient(135deg, #1565C0 0%, #0D47A1 100%)`
- counseling: `linear-gradient(135deg, #2E7D32 0%, #1B5E20 100%)`
- insights: `linear-gradient(135deg, #7B1FA2 0%, #4A148C 100%)`

Props: `{ config: ToolConfig }`. Pattern from existing college-predictor page lines 127-184. Container maxWidth `md`, H1 fontSize `{ xs: '1.75rem', md: '2.5rem' }`, fontWeight 800.

CTA button text: "Use This Tool Free" with right arrow. White background, colored text matching the gradient.

Trust badges appear as `Chip` components in a horizontal `Stack` with `direction="row"` and `flexWrap="wrap"` between the subtitle and CTA.

- [ ] **Step 2: Create ToolTeaser.tsx**

Simple wrapper that renders `config.teaserComponent` inside a styled container:

```tsx
// apps/marketing/src/components/tools/ToolTeaser.tsx
import { ToolConfig } from '@/lib/tools/types';
import { Box, Container } from '@neram/ui';

export default function ToolTeaser({ config }: { config: ToolConfig }) {
  const TeaserWidget = config.teaserComponent;
  return (
    <Box sx={{ py: { xs: 4, md: 6 }, bgcolor: '#FAFAFA' }}>
      <Container maxWidth="sm">
        <TeaserWidget />
      </Container>
    </Box>
  );
}
```

- [ ] **Step 3: Create ToolHowItWorks.tsx**

Server component. Renders steps in 2-column grid using Card + CardContent with numbered circles. Pattern from college-predictor page lines 188-260.

Props: `{ steps: ToolStep[], toolName: string }`. H2: "How {toolName} Works".

Container maxWidth `md`, py `{ xs: 5, md: 8 }`. Grid container with `spacing={3}`. Each step card: numbered circle (40x40px, border-radius 50%, primary bgcolor), H3 title, description text.

- [ ] **Step 4: Create ToolFeatures.tsx**

Server component. 6 feature cards in 2-column grid using Paper with border styling. Pattern from college-predictor page lines 265-330.

Props: `{ features: ToolFeature[] }`. H2: "Key Features". Background `#FAFAFA`.

Paper: elevation 0, p 3, `border: '1px solid #E0E0E0'`, borderRadius 2. H3 title bold, description text secondary.

- [ ] **Step 5: Create ToolScreenshots.tsx**

Server component. Shows desktop and mobile screenshots. For initial implementation, gracefully handles missing images with a placeholder.

Props: `{ screenshots: ToolScreenshot }`.

Layout: Container maxWidth `md`. H2: "See It in Action". On desktop: two-column grid (desktop screenshot left, mobile screenshot right). On mobile: stacked, mobile screenshot first.

Use `next/image` with `width={1200}` `height={800}` for desktop, `width={375}` `height={812}` for mobile. Both with `style={{ width: '100%', height: 'auto' }}` and `loading="lazy"`.

Placeholder fallback: If image path is empty or starts with `/images/tools/placeholder`, render a grey Box (200px height) with centered "Screenshot coming soon" text.

Caption text below the images in `Typography` with `color="text.secondary"`.

CTA button below caption linking to `appUrl`.

- [ ] **Step 6: Create ToolContext.tsx**

Server component. Renders contextHeading as H2 and contextContent via `dangerouslySetInnerHTML`. CTA button at the bottom.

Props: `{ contextHeading: string, contextContent: string, appUrl: string }`.

Container maxWidth `md`, py `{ xs: 5, md: 8 }`. The HTML content should be wrapped in a `Box` with `sx={{ '& p': { mb: 2, lineHeight: 1.8, color: 'text.secondary' }, '& strong': { color: 'text.primary' } }}` for consistent styling.

- [ ] **Step 7: Create ToolFAQ.tsx**

Client component (`'use client'`). Uses MUI Accordion with expand/collapse.

Props: `{ faqs: ToolFAQ[] }`.

H2: "Frequently Asked Questions". Background `#FAFAFA`, py `{ xs: 5, md: 8 }`. Container maxWidth `md`.

Each FAQ: `Accordion` with `disableGutters`, `elevation={0}`, `sx={{ '&:before': { display: 'none' }, border: '1px solid #E0E0E0', borderRadius: '8px !important', mb: 1 }}`. AccordionSummary with `ExpandMoreIcon`. H3 question as summary, answer as details.

Important: This component does NOT render JSON-LD. FAQ schema is rendered in the page.tsx alongside other schemas.

- [ ] **Step 8: Create ToolCTA.tsx**

Server component. Full-width section with primary-colored background, white text. H2: "Ready to use [tool]?". Two buttons: "Use This Tool Free" (white, links to appUrl) and "Join Coaching" (outlined white, links to /apply).

Props: `{ appUrl: string }`.

Background: `primary.main`, color `white`, textAlign `center`, py `{ xs: 6, md: 10 }`. Buttons in a flex row with gap 2 and flexWrap wrap.

- [ ] **Step 9: Create ToolRelatedTools.tsx**

Server component. 3 related tool cards with title, description, and "Try Now" link.

Props: `{ relatedToolSlugs: string[] }`.

Imports `TOOL_BY_SLUG` from `@/lib/tools/configs` to look up tool data. 3-column grid on desktop, 1-column on mobile. Each card: `Paper` with elevation 0, border, title (H3), description, and Link to `/tools/{slug}`.

H2: "More Free Tools". Container maxWidth `md`, py `{ xs: 5, md: 8 }`.

- [ ] **Step 10: Create ToolLandingPage.tsx**

Server component orchestrator:

```tsx
// apps/marketing/src/components/tools/ToolLandingPage.tsx
import { ToolConfig } from '@/lib/tools/types';
import ToolHero from './ToolHero';
import ToolTeaser from './ToolTeaser';
import ToolHowItWorks from './ToolHowItWorks';
import ToolFeatures from './ToolFeatures';
import ToolScreenshots from './ToolScreenshots';
import ToolContext from './ToolContext';
import ToolRelatedTools from './ToolRelatedTools';
import ToolFAQ from './ToolFAQ';
import ToolCTA from './ToolCTA';
import { Divider } from '@neram/ui';

export default function ToolLandingPage({ config }: { config: ToolConfig }) {
  return (
    <>
      <ToolHero config={config} />
      <ToolTeaser config={config} />
      <ToolHowItWorks steps={config.steps} toolName={config.title} />
      <Divider />
      <ToolFeatures features={config.features} />
      <Divider />
      <ToolScreenshots screenshots={config.screenshots} />
      <Divider />
      <ToolContext
        contextHeading={config.contextHeading}
        contextContent={config.contextContent}
        appUrl={config.appUrl}
      />
      <Divider />
      <ToolRelatedTools relatedToolSlugs={config.relatedToolSlugs} />
      <Divider />
      <ToolFAQ faqs={config.faqs} />
      <ToolCTA appUrl={config.appUrl} />
    </>
  );
}
```

- [ ] **Step 11: Commit**

```bash
git add apps/marketing/src/components/tools/
git commit -m "feat(marketing): add shared ToolLandingPage template with 9 sub-components"
```

---

## Task 3: Cutoff Calculator (Redesign)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/CutoffTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/cutoff-calculator.ts`
- Modify: `apps/marketing/src/app/[locale]/tools/cutoff-calculator/page.tsx`
- Delete: `apps/marketing/src/components/CutoffCalculatorContent.tsx`

- [ ] **Step 1: Create CutoffTeaser.tsx**

Client component (`'use client'`). Score input (0-200), "Check" button, result showing percentile, CTA to app.

Hardcoded percentile map:
```typescript
const PERCENTILE_MAP: Array<{ minScore: number; percentile: number }> = [
  { minScore: 180, percentile: 1 },
  { minScore: 170, percentile: 3 },
  { minScore: 160, percentile: 5 },
  { minScore: 150, percentile: 10 },
  { minScore: 140, percentile: 15 },
  { minScore: 130, percentile: 25 },
  { minScore: 120, percentile: 35 },
  { minScore: 110, percentile: 45 },
  { minScore: 100, percentile: 55 },
  { minScore: 90, percentile: 65 },
  { minScore: 80, percentile: 75 },
  { minScore: 70, percentile: 85 },
  { minScore: 60, percentile: 92 },
  { minScore: 50, percentile: 96 },
  { minScore: 0, percentile: 99 },
];
```

Logic: Find the first entry where `score >= minScore`, return that percentile.

UI: `Paper` card with `Typography` heading "Quick Score Check", `TextField` (type number, min 0, max 200, fullWidth, min-height 48px), `Button` "Check" (fullWidth, min-height 48px), result area showing "Your score of {x} puts you in the top {100-percentile}% of NATA applicants", CTA `Button` "See college matches and full analysis" linking to `https://app.neramclasses.com/tools/nata/cutoff-calculator`.

- [ ] **Step 2: Create cutoff-calculator.ts config**

Full ToolConfig object. Export as `cutoffCalculatorConfig`.

Key values:
- slug: `'cutoff-calculator'`
- title: `'NATA Cutoff Calculator 2026'`
- subtitle: 2-3 sentences about estimating cutoff score and checking college chances
- category: `'nata'`
- appUrl: `'https://app.neramclasses.com/tools/nata/cutoff-calculator'`
- metaTitle: `'NATA Cutoff Calculator 2026: Score & College Chances'`
- metaDescription: `'Free NATA cutoff calculator. Enter your scores to calculate total marks, percentile, and check admission chances at top architecture colleges across India.'`
- keywords: `['NATA cutoff calculator 2026', 'JEE Paper 2 cutoff calculator', 'B.Arch cutoff 2026', 'NATA score calculator', 'NATA percentile calculator', 'architecture college cutoff', 'NATA cutoff marks', 'NATA college cutoff', 'NATA expected cutoff', 'B.Arch admission cutoff']`
- trustBadges: `['Free', 'No Login Required', 'Updated for 2026']`
- 4 steps describing the calculation flow
- 6 features (board marks conversion, multi-attempt support, category-wise cutoffs, historical data, college matching, eligibility check)
- screenshots: placeholder paths `'/images/tools/cutoff-calculator-desktop.webp'` and mobile
- contextContent: HTML paragraphs about NATA scoring, cutoff calculation, board marks conversion, and college admission process
- 6-8 FAQs about cutoff calculation, scoring system, board marks, and college eligibility
- relatedToolSlugs: `['college-predictor', 'rank-predictor', 'eligibility-checker']`
- teaserComponent: imported CutoffTeaser

- [ ] **Step 3: Rewrite cutoff-calculator/page.tsx**

Replace entire file with template pattern:

```typescript
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import ToolLandingPage from '@/components/tools/ToolLandingPage';
import { cutoffCalculatorConfig } from '@/lib/tools/configs';

const baseUrl = 'https://neramclasses.com';
const config = cutoffCalculatorConfig;

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: config.metaTitle,
    description: config.metaDescription,
    keywords: config.keywords.join(', '),
    alternates: buildAlternates(locale, `/tools/${config.slug}`),
    openGraph: {
      title: config.metaTitle,
      description: config.metaDescription,
      url: locale === 'en'
        ? `${baseUrl}/tools/${config.slug}`
        : `${baseUrl}/${locale}/tools/${config.slug}`,
      type: 'website',
      images: [{ url: buildOgImage(config.ogImageTitle, config.ogImageSubtitle, 'tool') }],
    },
  };
}

export default function CutoffCalculatorPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  return (
    <>
      <JsonLd
        data={[
          generateBreadcrumbSchema([
            { name: 'Home', url: baseUrl },
            { name: 'Free Tools', url: `${baseUrl}/tools` },
            { name: config.title, url: `${baseUrl}/tools/${config.slug}` },
          ]),
          generateWebApplicationSchema({
            name: config.title,
            description: config.metaDescription,
            url: `${baseUrl}/tools/${config.slug}`,
            applicationCategory: 'EducationalApplication',
          }),
          generateFAQSchema(config.faqs),
        ]}
      />
      <ToolLandingPage config={config} />
    </>
  );
}
```

- [ ] **Step 4: Delete CutoffCalculatorContent.tsx**

Verify no other files import it: `grep -r "CutoffCalculatorContent" apps/marketing/src/`

Delete `apps/marketing/src/components/CutoffCalculatorContent.tsx`.

- [ ] **Step 5: Verify build**

Run: `cd apps/marketing && pnpm build`

- [ ] **Step 6: Commit**

```bash
git add -A apps/marketing/src/components/tools/teasers/CutoffTeaser.tsx apps/marketing/src/lib/tools/configs/cutoff-calculator.ts apps/marketing/src/app/\[locale\]/tools/cutoff-calculator/page.tsx
git rm apps/marketing/src/components/CutoffCalculatorContent.tsx
git commit -m "feat(marketing): redesign cutoff calculator as SEO landing page with teaser, remove fake calculator"
```

---

## Task 4: College Predictor (Refresh)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/CollegePredictorTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/college-predictor.ts`
- Modify: `apps/marketing/src/app/[locale]/tools/college-predictor/page.tsx`

- [ ] **Step 1: Create CollegePredictorTeaser.tsx**

Client component. Inputs: score (0-200) + state dropdown. Result: "{n} colleges match your score in {state}". CTA: "View full college list with fees and cutoffs" linking to app.

Hardcoded data: `COLLEGES_BY_STATE` map with approximate counts per score range per state. States include: Tamil Nadu, Karnataka, Maharashtra, Delhi, Kerala, Telangana, Uttar Pradesh, West Bengal, Rajasthan, Gujarat, All India.

- [ ] **Step 2: Create college-predictor.ts config**

Migrate existing content from current `college-predictor/page.tsx`:
- FAQs from lines 27-58
- Steps from lines 201-221
- Features from lines 280-303
- Context paragraphs from lines 337-387

Add screenshots, trust badges, related tools. Export as `collegePredictorConfig`.

- [ ] **Step 3: Rewrite college-predictor/page.tsx**

Replace the 430-line page with the ~40-line template pattern (same as Task 3 Step 3 but using `collegePredictorConfig`).

- [ ] **Step 4: Verify build**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(marketing): refresh college predictor page with ToolLandingPage template and teaser"
```

---

## Task 5: Exam Centers (Refresh)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/ExamCentersTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/exam-centers.ts`
- Modify: `apps/marketing/src/app/[locale]/tools/exam-centers/page.tsx`

- [ ] **Step 1: Create ExamCentersTeaser.tsx**

Client component. Input: state dropdown. Result: "{n} exam centers across {m} cities in {state}".

Hardcoded data:
```typescript
const CENTERS_BY_STATE: Record<string, { centers: number; cities: number }> = {
  'Tamil Nadu': { centers: 12, cities: 5 },
  'Maharashtra': { centers: 15, cities: 7 },
  'Karnataka': { centers: 8, cities: 4 },
  'Uttar Pradesh': { centers: 10, cities: 6 },
  'Delhi': { centers: 6, cities: 1 },
  'West Bengal': { centers: 5, cities: 3 },
  'Rajasthan': { centers: 4, cities: 3 },
  'Gujarat': { centers: 4, cities: 3 },
  'Telangana': { centers: 4, cities: 2 },
  'Kerala': { centers: 4, cities: 3 },
  'Andhra Pradesh': { centers: 3, cities: 2 },
  'Madhya Pradesh': { centers: 3, cities: 2 },
  'Bihar': { centers: 2, cities: 1 },
  'Odisha': { centers: 2, cities: 1 },
  'Punjab': { centers: 2, cities: 2 },
  'Jharkhand': { centers: 2, cities: 1 },
  'Assam': { centers: 1, cities: 1 },
  'Uttarakhand': { centers: 1, cities: 1 },
  'Goa': { centers: 1, cities: 1 },
  'Chandigarh': { centers: 1, cities: 1 },
};
```

- [ ] **Step 2: Create exam-centers.ts config**

Migrate from current page. Export as `examCentersConfig`. Category: `'nata'`.

- [ ] **Step 3: Rewrite exam-centers/page.tsx**

Template pattern.

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): refresh exam centers page with ToolLandingPage template and teaser"
```

---

## Task 6: Question Bank (Refresh)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/QuestionBankTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/question-bank.ts`
- Modify: `apps/marketing/src/app/[locale]/tools/question-bank/page.tsx`

- [ ] **Step 1: Create QuestionBankTeaser.tsx**

Client component. Input: subject dropdown. Result: "{n} practice questions available in {subject}".

```typescript
const QUESTIONS_BY_SUBJECT: Record<string, number> = {
  'Mathematics': 450,
  'General Aptitude': 380,
  'Drawing & Design': 200,
  'Physics': 320,
  'Logical Reasoning': 250,
};
```

- [ ] **Step 2: Create question-bank.ts config**

Migrate from current page. Export as `questionBankConfig`. Category: `'nata'`.

- [ ] **Step 3: Rewrite question-bank/page.tsx**

Template pattern.

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): refresh question bank page with ToolLandingPage template and teaser"
```

---

## Task 7: Configs Index

**Files:**
- Create: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create configs index**

Re-exports all config objects, creates `ALL_TOOLS` array and `TOOL_BY_SLUG` lookup map, and `TOOL_CARDS` for the hub page.

Initially includes only the 4 tools created so far. New configs are added as Tasks 8-13 complete.

```typescript
export { cutoffCalculatorConfig } from './cutoff-calculator';
export { collegePredictorConfig } from './college-predictor';
export { examCentersConfig } from './exam-centers';
export { questionBankConfig } from './question-bank';

import { cutoffCalculatorConfig } from './cutoff-calculator';
import { collegePredictorConfig } from './college-predictor';
import { examCentersConfig } from './exam-centers';
import { questionBankConfig } from './question-bank';
import type { ToolConfig, ToolCardData } from '../types';

export const ALL_TOOLS: ToolConfig[] = [
  cutoffCalculatorConfig,
  collegePredictorConfig,
  examCentersConfig,
  questionBankConfig,
];

export const TOOL_BY_SLUG: Record<string, ToolConfig> =
  Object.fromEntries(ALL_TOOLS.map((t) => [t.slug, t]));

export const TOOL_CARDS: ToolCardData[] = ALL_TOOLS.map((t) => ({
  slug: t.slug,
  title: t.title,
  description: t.metaDescription,
  category: t.category,
}));
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(marketing): add tools configs index with ALL_TOOLS registry"
```

---

## Task 8: Rank Predictor (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/RankPredictorTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/rank-predictor.ts`
- Create: `apps/marketing/src/app/[locale]/tools/rank-predictor/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create RankPredictorTeaser.tsx**

Client component. Input: score (0-200). Result: "Estimated rank: {x} to {y}".

```typescript
const RANK_RANGES: Array<{ minScore: number; rankLow: number; rankHigh: number }> = [
  { minScore: 180, rankLow: 1, rankHigh: 50 },
  { minScore: 170, rankLow: 50, rankHigh: 200 },
  { minScore: 160, rankLow: 200, rankHigh: 500 },
  { minScore: 150, rankLow: 500, rankHigh: 1500 },
  { minScore: 140, rankLow: 1500, rankHigh: 3000 },
  { minScore: 130, rankLow: 3000, rankHigh: 5000 },
  { minScore: 120, rankLow: 5000, rankHigh: 8000 },
  { minScore: 110, rankLow: 8000, rankHigh: 12000 },
  { minScore: 100, rankLow: 12000, rankHigh: 18000 },
  { minScore: 90, rankLow: 18000, rankHigh: 25000 },
  { minScore: 80, rankLow: 25000, rankHigh: 35000 },
  { minScore: 70, rankLow: 35000, rankHigh: 45000 },
  { minScore: 0, rankLow: 45000, rankHigh: 70000 },
];
```

- [ ] **Step 2: Create rank-predictor.ts config**

Export as `rankPredictorConfig`. Category: `'counseling'`. appUrl: `'https://app.neramclasses.com/tools/counseling/rank-predictor'`. Keywords from spec. relatedToolSlugs: `['cutoff-calculator', 'college-predictor', 'cost-calculator']`.

- [ ] **Step 3: Create rank-predictor/page.tsx**

Template pattern using `rankPredictorConfig`.

- [ ] **Step 4: Add to configs/index.ts**

Add import, export, and append to `ALL_TOOLS` array.

- [ ] **Step 5: Verify build and commit**

```bash
git commit -m "feat(marketing): add rank predictor SEO landing page"
```

---

## Task 9: Eligibility Checker (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/EligibilityTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/eligibility-checker.ts`
- Create: `apps/marketing/src/app/[locale]/tools/eligibility-checker/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create EligibilityTeaser.tsx**

Client component. Inputs: board dropdown (CBSE, ICSE, State Board) + percentage input. Result: "You are eligible for NATA 2026" (green) or "You may not meet the minimum criteria" (amber).

Logic: General category needs 50% in PCM aggregate. SC/ST needs 45%. The teaser uses 50% as the threshold (General).

- [ ] **Step 2: Create eligibility-checker.ts config**

Export as `eligibilityCheckerConfig`. Category: `'nata'`. appUrl: `'https://app.neramclasses.com/tools/nata/eligibility-checker'`. Keywords from spec. FAQs about age limits, board requirements, minimum percentage, category-wise criteria.

- [ ] **Step 3: Create eligibility-checker/page.tsx and update index**

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): add eligibility checker SEO landing page"
```

---

## Task 10: Exam Planner (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/ExamPlannerTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/exam-planner.ts`
- Create: `apps/marketing/src/app/[locale]/tools/exam-planner/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create ExamPlannerTeaser.tsx**

Client component. No user input. Auto-calculates days until NATA 2026 Session 1 (April 12, 2026). Displays: "NATA 2026 exam is in {n} days". Uses `useState` + `useEffect` for client-side date calculation.

```typescript
const NATA_EXAM_DATE = new Date('2026-04-12T09:00:00+05:30');
```

- [ ] **Step 2: Create exam-planner.ts config**

Export as `examPlannerConfig`. Category: `'nata'`. appUrl: `'https://app.neramclasses.com/tools/nata/exam-planner'`. Keywords about exam dates, preparation timeline, study plan.

- [ ] **Step 3: Create page and update index**

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): add exam planner SEO landing page"
```

---

## Task 11: COA Checker (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/COACheckerTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/coa-checker.ts`
- Create: `apps/marketing/src/app/[locale]/tools/coa-checker/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create COACheckerTeaser.tsx**

Client component. Input: college name text field. Shows a search prompt with CTA linking to app with query param: `https://app.neramclasses.com/tools/counseling/coa-checker?q={encoded_query}`. No local data lookup.

- [ ] **Step 2: Create coa-checker.ts config**

Export as `coaCheckerConfig`. Category: `'counseling'`. Keywords about COA approved colleges, Council of Architecture approval.

- [ ] **Step 3: Create page and update index**

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): add COA checker SEO landing page"
```

---

## Task 12: Cost Calculator (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/CostCalculatorTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/cost-calculator.ts`
- Create: `apps/marketing/src/app/[locale]/tools/cost-calculator/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create CostCalculatorTeaser.tsx**

Client component. Input: college type dropdown (Government, Private, Deemed University, NIT/IIT). Result: "Average annual fee for {type}: {range}".

```typescript
const FEE_BY_TYPE: Record<string, string> = {
  'Government': '₹20,000 to ₹1,50,000 per year',
  'Private': '₹1,50,000 to ₹5,00,000 per year',
  'Deemed University': '₹2,00,000 to ₹6,00,000 per year',
  'NIT/IIT': '₹1,00,000 to ₹2,50,000 per year',
};
```

- [ ] **Step 2: Create cost-calculator.ts config**

Export as `costCalculatorConfig`. Category: `'counseling'`. appUrl: `'https://app.neramclasses.com/tools/nata/cost-calculator'`. Keywords about B.Arch fees, education cost.

- [ ] **Step 3: Create page and update index**

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): add cost calculator SEO landing page"
```

---

## Task 13: Counseling Insights (New)

**Files:**
- Create: `apps/marketing/src/components/tools/teasers/CounselingInsightsTeaser.tsx`
- Create: `apps/marketing/src/lib/tools/configs/counseling-insights.ts`
- Create: `apps/marketing/src/app/[locale]/tools/counseling-insights/page.tsx`
- Modify: `apps/marketing/src/lib/tools/configs/index.ts`

- [ ] **Step 1: Create CounselingInsightsTeaser.tsx**

Client component. Input: state dropdown. Result: Key stat for that state (e.g., "Tamil Nadu: 45 B.Arch colleges, TNEA counseling, avg cutoff 110").

```typescript
const INSIGHTS_BY_STATE: Record<string, string> = {
  'Tamil Nadu': '45 B.Arch colleges participate in TNEA counseling. Average cutoff: 110.',
  'Karnataka': '22 B.Arch colleges. KCET and COMEDK counseling. Average cutoff: 105.',
  'Maharashtra': '35 B.Arch colleges. Centralised CAP counseling. Average cutoff: 100.',
  'Delhi': '8 B.Arch colleges including SPA Delhi. JoSAA + Delhi state counseling.',
  'Kerala': '12 B.Arch colleges. KEAM counseling. Strong government college options.',
  'Telangana': '10 B.Arch colleges. TSEAMCET and EAMCET counseling.',
  'Uttar Pradesh': '18 B.Arch colleges. UPSEE counseling for state quota.',
  'West Bengal': '8 B.Arch colleges. WBJEE counseling for state seats.',
  'Rajasthan': '6 B.Arch colleges. REAP counseling process.',
  'Gujarat': '12 B.Arch colleges. ACPC counseling for B.Arch seats.',
};
```

- [ ] **Step 2: Create counseling-insights.ts config**

Export as `counselingInsightsConfig`. Category: `'insights'`. appUrl: `'https://app.neramclasses.com/tools/counseling/insights'`. Keywords about counselling guide, state-wise process.

- [ ] **Step 3: Create page and update index (final: all 10 configs now in array)**

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat(marketing): add counseling insights SEO landing page"
```

---

## Task 14: Tools Hub Page

**Files:**
- Create: `apps/marketing/src/app/[locale]/tools/page.tsx`

- [ ] **Step 1: Create the tools hub page**

Standalone page (does NOT use ToolLandingPage template). Imports `TOOL_CARDS` from configs index.

Page structure:
1. Hero: H1 "Free NATA & B.Arch Admission Tools 2026", subtitle, trust stat
2. Tool Categories: 3 sections with cards grouped by category
   - NATA Preparation (filter `category === 'nata'`): 6 tools
   - Counseling & Admission (`category === 'counseling'`): 3 tools
   - Analysis & Insights (`category === 'insights'`): 1 tool
3. Why Use Our Tools: 4 trust signal cards
4. Hub-level FAQ: 6 questions about the tools ecosystem
5. CTA: Link to /apply

Tool card layout: `Grid` with 1 column on xs, 2 on sm, 3 on md+. Each card: `Paper` with title (H3), 1-line description, "Try Now" link to `/tools/{slug}`.

SEO metadata:
- Title: `'Free NATA & B.Arch Admission Tools 2026 | Neram Classes'`
- Description: `'10+ free tools for NATA and JEE Paper 2 B.Arch aspirants. Calculate cutoffs, predict colleges, estimate rank, find exam centers, and plan your architecture career.'`
- Keywords: `'NATA tools, NATA preparation tools, B.Arch admission tools, free NATA tools 2026'`

JSON-LD: BreadcrumbList (Home > Free Tools) + ItemList (all tools with name, description, URL) + FAQPage (hub FAQs).

The `generateItemListSchema` may need to be created if it doesn't exist in schemas.ts. Check first. If not, create a simple inline schema in the page.

- [ ] **Step 2: Verify build and commit**

```bash
git commit -m "feat(marketing): add /tools hub page with 10 tool cards"
```

---

## Task 15: Navigation, Sitemap, Search Index

**Files:**
- Modify: `apps/marketing/src/app/sitemap.ts:46-49`
- Modify: `apps/marketing/src/lib/search-index.ts:459-494`
- Modify: `apps/marketing/src/components/Header.tsx:133-242`
- Modify: `apps/marketing/src/components/Footer.tsx`

- [ ] **Step 1: Update sitemap.ts**

After line 49 (after `/tools/question-bank`), add:

```typescript
  { path: '/tools', lastModified: '2026-04-17' },
  { path: '/tools/rank-predictor', lastModified: '2026-04-17' },
  { path: '/tools/eligibility-checker', lastModified: '2026-04-17' },
  { path: '/tools/exam-planner', lastModified: '2026-04-17' },
  { path: '/tools/coa-checker', lastModified: '2026-04-17' },
  { path: '/tools/cost-calculator', lastModified: '2026-04-17' },
  { path: '/tools/counseling-insights', lastModified: '2026-04-17' },
```

Update existing 4 tool entries' `lastModified` to `'2026-04-17'`.

- [ ] **Step 2: Update search-index.ts**

After line 487 (after exam-centers entry, before `// ── Counseling ──`), add 7 entries for hub + 6 new tools. Each with path, title, description, keywords, category: 'tool'.

- [ ] **Step 3: Update Header.tsx**

Add "Free Tools" link. Desktop: Add a `Button` component with `component={Link} href="/tools"` in the nav bar area. Mobile: Add `ListItemButton` in the drawer.

- [ ] **Step 4: Update Footer.tsx**

Add `{ label: 'Free Tools', href: '/tools' }` to the resources section, near existing tool links.

- [ ] **Step 5: Verify full build**

```bash
cd apps/marketing && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(marketing): add tool pages to sitemap, search index, header, and footer"
```

---

## Verification Checklist (Post-Implementation)

- [ ] `pnpm build` passes for marketing app
- [ ] All 11 pages render at 375px, 768px, 1280px
- [ ] Each page has correct `<title>`, `<meta description>`, OG tags
- [ ] JSON-LD validates (BreadcrumbList + WebApplication + FAQPage per tool, ItemList on hub)
- [ ] All "Use This Tool Free" CTAs link to correct app URLs
- [ ] "Free Tools" link appears in header (desktop + mobile) and footer
- [ ] All 11 pages appear in sitemap.xml output
- [ ] Cutoff calculator page has NO embedded calculator, only teaser widget
- [ ] `CutoffCalculatorContent.tsx` is deleted
- [ ] No em dashes in any user-visible content
