# Chennai NATA SEO Attack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new top-level `/nata-coaching-centers-in-chennai` listicle page and improve the existing `/coaching/nata-coaching-chennai` page to outrank competitors for "nata coaching center in chennai".

**Architecture:** Two coordinated changes — a new "Top 10" listicle page at the top-level URL (highest authority signal to Google), plus a title/content upgrade on the existing Chennai hub page. The listicle lists only Neram's own centers (no competitor names). Three new neighborhood stubs (OMR, Porur, Guindy) are defined inline in the new page — they do NOT get added to `chennai-neighborhoods.ts` since they have no dedicated pages yet.

**Tech Stack:** Next.js App Router, next-intl, MUI v5, `@/lib/seo/schemas` (existing schema generators), `@/lib/seo/metadata` (buildAlternates), `@/components/seo/JsonLd`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `apps/marketing/src/app/[locale]/nata-coaching-centers-in-chennai/page.tsx` | New Top 10 listicle page |
| Modify | `apps/marketing/src/app/[locale]/coaching/nata-coaching-chennai/page.tsx` | Title, trust bar, 3 new stub cards, internal link |
| Modify | `apps/marketing/src/app/sitemap.ts` | Add new URL to sitemap |

---

## Task 1: Create the new listicle page

**Files:**
- Create: `apps/marketing/src/app/[locale]/nata-coaching-centers-in-chennai/page.tsx`

- [ ] **Step 1: Create the page file with all 10 entries, schemas, and full page layout**

Create `apps/marketing/src/app/[locale]/nata-coaching-centers-in-chennai/page.tsx` with the following content:

```tsx
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Card, CardContent, Chip, Button, Divider } from '@neram/ui';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateItemListSchema,
  generateLocalBusinessSchema,
} from '@/lib/seo/schemas';
import { BASE_URL, ORG_NAME } from '@/lib/seo/constants';
import { buildAlternates } from '@/lib/seo/metadata';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: `Top 10 NATA Coaching Centers in Chennai | ${ORG_NAME}`,
    description:
      'Best NATA coaching centers in Chennai across 10 locations. Flagship at Ashok Nagar, centers in Anna Nagar, Adyar, Tambaram, Velachery, OMR, Porur, Guindy and online. Since 2009.',
    keywords:
      'top 10 NATA coaching centers Chennai, best NATA coaching Chennai, NATA coaching center Chennai, NATA classes Chennai, NATA coaching Ashok Nagar, NATA coaching Anna Nagar, NATA coaching Adyar',
    alternates: buildAlternates(locale, '/nata-coaching-centers-in-chennai'),
    openGraph: {
      title: `Top 10 NATA Coaching Centers in Chennai (2026) | ${ORG_NAME}`,
      description:
        'Best NATA coaching centers in Chennai across 10 locations. Flagship at Ashok Nagar, online access from anywhere. Since 2009.',
      type: 'article',
    },
  };
}

interface ListicleEntry {
  rank: number;
  name: string;
  area: string;
  tag: string;
  highlights: string[];
  url: string;
  isExternal?: boolean;
}

const entries: ListicleEntry[] = [
  {
    rank: 1,
    name: 'Neram Classes — Ashok Nagar (Flagship)',
    area: 'Ashok Nagar, Chennai 600083',
    tag: 'Flagship Center',
    highlights: [
      '5-min walk from Ashok Nagar Metro Station (Blue Line)',
      'Max 25 students per batch — personalized attention',
      'IIT/NIT/SPA alumni faculty, daily drawing critique sessions',
    ],
    url: '/coaching/nata-coaching-chennai/ashok-nagar',
  },
  {
    rank: 2,
    name: 'Neram Classes — Anna Nagar',
    area: 'Serving Anna Nagar, Chennai',
    tag: '1 Metro Stop Away',
    highlights: [
      'Anna Nagar East Metro to Ashok Nagar Metro — 1 stop, 5 minutes',
      'Online weekday classes available from Anna Nagar',
      '99.9% success rate, students scored 140+ in NATA',
    ],
    url: '/coaching/nata-coaching-chennai/anna-nagar',
  },
  {
    rank: 3,
    name: 'Neram Classes — Adyar',
    area: 'Serving Adyar, Chennai',
    tag: 'Near IIT Madras',
    highlights: [
      'Faculty includes IIT Madras alumni — campus visit sessions available',
      'Online weekday classes, weekend offline at Ashok Nagar',
      'Adyar students score consistently above 130 in NATA',
    ],
    url: '/coaching/nata-coaching-chennai/adyar',
  },
  {
    rank: 4,
    name: 'Neram Classes — T. Nagar',
    area: 'Serving T. Nagar (Thyagaraya Nagar)',
    tag: 'Closest to Center',
    highlights: [
      'Just 3 km from Ashok Nagar flagship — 10-minute auto ride',
      'Many T. Nagar students walk to the center after school',
      'Bus routes 27B and 23C stop directly at Ashok Nagar',
    ],
    url: '/coaching/nata-coaching-chennai/t-nagar',
  },
  {
    rank: 5,
    name: 'Neram Classes — Tambaram (Sub-Center)',
    area: 'Thiruneermalai, Tambaram',
    tag: 'Dedicated Sub-Center',
    highlights: [
      'Dedicated Tambaram sub-center at Thiruneermalai, Jain Alpine Meadows',
      'Serves students from Chengalpattu, Kanchipuram, and East Coast Road',
      'Suburban railway from Tambaram to Mambalam — 15 min',
    ],
    url: '/coaching/nata-coaching-chennai/tambaram',
  },
  {
    rank: 6,
    name: 'Neram Classes — Velachery',
    area: 'Serving Velachery, South Chennai',
    tag: 'IT Corridor',
    highlights: [
      'Velachery MRTS to Saidapet, then 10-min auto to Ashok Nagar',
      'Weekday online + weekend offline hybrid model for OMR/Velachery students',
      'Popular with students from IT families in South Chennai',
    ],
    url: '/coaching/nata-coaching-chennai/velachery',
  },
  {
    rank: 7,
    name: 'Neram Classes — OMR / Sholinganallur',
    area: 'Serving Old Mahabalipuram Road (OMR)',
    tag: 'Hybrid Model',
    highlights: [
      'Online weekday classes from OMR — no daily commute needed',
      'Weekend batches at Ashok Nagar flagship for drawing workshops',
      'Popular with students in Sholinganallur, Perungudi, Thoraipakkam',
    ],
    url: '/coaching/nata-coaching-chennai#omr',
  },
  {
    rank: 8,
    name: 'Neram Classes — Porur / Koyambedu',
    area: 'Serving Porur and West Chennai',
    tag: 'West Chennai',
    highlights: [
      'Online weekday classes, weekend offline at Ashok Nagar',
      'Koyambedu bus terminus connects directly to Ashok Nagar (Bus 29C)',
      'Serving students from Porur, Maduravoyal, Poonamallee',
    ],
    url: '/coaching/nata-coaching-chennai#porur',
  },
  {
    rank: 9,
    name: 'Neram Classes — Guindy / Chromepet',
    area: 'Serving Guindy and South West Chennai',
    tag: 'South West',
    highlights: [
      'Guindy Metro to Ashok Nagar — 2 stops on the Blue Line',
      'Serving students from Guindy, Chromepet, Pallavaram, Pammal',
      'Hybrid model: online daily + offline weekends at Ashok Nagar',
    ],
    url: '/coaching/nata-coaching-chennai#guindy',
  },
  {
    rank: 10,
    name: 'Neram Classes — Online (Pan-Chennai)',
    area: 'Live online from anywhere in Chennai',
    tag: 'Fully Online',
    highlights: [
      'Same IIT/NIT alumni faculty, same curriculum as offline batches',
      'Real-time drawing feedback via screen sharing — not pre-recorded',
      'Switch between online and offline anytime during your program',
    ],
    url: '/demo-class',
  },
];

const faqs = [
  {
    question: 'Which is the best NATA coaching center in Chennai?',
    answer:
      'Neram Classes is the best NATA coaching center in Chennai, with a flagship center at Ashok Nagar (PT Rajan Road, near Ashok Nagar Metro) and a sub-center in Tambaram. Since 2009, Neram has trained thousands of students with IIT/NIT/SPA alumni faculty, achieving a 99.9% success rate and a maximum batch size of 25 students for personalized attention.',
  },
  {
    question: 'How many NATA coaching centers does Neram Classes have in Chennai?',
    answer:
      'Neram Classes has two physical centers in Chennai: a flagship center at Ashok Nagar (PT Rajan Road, Sector 13, near Ashok Nagar Metro Station) and a sub-center at Tambaram (Thiruneermalai, Jain Alpine Meadows). Additionally, Neram serves students across all Chennai neighborhoods through live online classes — students from Anna Nagar, Adyar, Velachery, OMR, Porur, Guindy, and T. Nagar all attend either offline or online.',
  },
  {
    question: 'Is online NATA coaching from Chennai effective?',
    answer:
      "Yes. Neram's online NATA coaching is live and interactive — not pre-recorded. Classes use screen sharing for real-time drawing feedback, the same faculty as offline batches, and the same curriculum. Students from Velachery, OMR, Sholinganallur, and Porur typically attend online on weekdays and the Ashok Nagar center on weekends for intensive drawing workshops. Many online students score above 130 in NATA.",
  },
  {
    question: 'Which Chennai area is best located for NATA coaching at Neram?',
    answer:
      "T. Nagar and Ashok Nagar students have the most convenient access — Neram's flagship is on PT Rajan Road, Ashok Nagar, just 10 minutes from T. Nagar by auto. Anna Nagar students can take the Metro (1 stop: Anna Nagar East to Ashok Nagar). Guindy students can take the Blue Line Metro (2 stops: Guindy to Ashok Nagar). For students in South Chennai (Velachery, OMR, Tambaram), the hybrid online model works best.",
  },
];

const howToChooseCriteria = [
  {
    title: 'Years of NATA-specific experience',
    body: 'Look for centers that have been preparing students specifically for NATA — not general art or engineering coaching that also offers NATA. 10+ years of NATA-focused coaching means the faculty understands how NATA marking schemes evolve year to year.',
  },
  {
    title: 'Faculty credentials',
    body: "Architecture entrance exams require faculty who cleared architecture entrance exams themselves. Look for IIT/NIT/SPA alumni — architects who have both professional experience and understand what NATA evaluators look for in drawing and aptitude sections.",
  },
  {
    title: 'Verifiable pass rate',
    body: 'Ask for a pass rate backed by student results — not just testimonials. A pass rate should specify both the percentage of students who qualify NATA and the average score range. Low batch sizes (under 30) are a reliable indicator that individual progress is tracked.',
  },
  {
    title: 'Online flexibility',
    body: "Can you switch between offline and online without losing content? A center with a genuine hybrid model (not just recorded videos) lets Chennai students balance school exams, weekend workshops, and daily coaching without falling behind.",
  },
  {
    title: 'Drawing feedback quality',
    body: 'NATA drawing accounts for a large percentage of the score. Ask whether the center reviews each student\'s drawing work individually every session — or whether drawing practice is self-directed. Session-by-session, personalized drawing critique is what separates 120-scorers from 150-scorers.',
  },
];

export default function NataCoachingCentersChennai({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: BASE_URL },
          { name: 'Top 10 NATA Coaching Centers in Chennai', url: `${BASE_URL}/nata-coaching-centers-in-chennai` },
        ])}
      />
      <JsonLd data={generateFAQSchema(faqs)} />
      <JsonLd
        data={generateItemListSchema(
          entries.map((e) => ({
            name: e.name,
            url: `${BASE_URL}${e.url.startsWith('/') ? e.url : '/' + e.url}`,
            description: e.highlights[0],
          }))
        )}
      />
      <JsonLd
        data={generateLocalBusinessSchema({
          city: 'chennai',
          cityDisplay: 'Chennai',
          state: 'tn',
          stateDisplay: 'Tamil Nadu',
          slug: 'chennai',
        })}
      />

      {/* Hero */}
      <Box
        sx={{
          background: 'linear-gradient(135deg, #060d1f 0%, #0a1628 100%)',
          py: { xs: 6, md: 9 },
          color: '#fff',
        }}
      >
        <Container maxWidth="lg">
          <Chip
            label="Chennai • Since 2009 • 99.9% Pass Rate"
            color="warning"
            size="small"
            sx={{ mb: 2, fontWeight: 600 }}
          />
          <Typography
            variant="h1"
            component="h1"
            sx={{
              fontSize: { xs: '1.75rem', md: '2.5rem' },
              fontWeight: 800,
              mb: 2,
              lineHeight: 1.2,
            }}
          >
            Top 10 NATA Coaching Centers in Chennai (2026)
          </Typography>
          <Typography
            component="p"
            sx={{
              fontSize: { xs: '1rem', md: '1.15rem' },
              color: 'rgba(255,255,255,0.8)',
              maxWidth: 650,
              lineHeight: 1.6,
              mb: 3,
            }}
          >
            Neram Classes operates Chennai&apos;s largest NATA coaching network — 2 physical
            centers plus live online access from every neighborhood. All 10 locations below are
            served by the same IIT/NIT alumni faculty and the same curriculum.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#e8a020',
                '&:hover': { bgcolor: '#d09010' },
                fontWeight: 700,
                px: 4,
              }}
            >
              Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/coaching/nata-coaching-chennai"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}
            >
              Chennai Hub
            </Button>
          </Box>
        </Container>
      </Box>

      {/* Trust bar */}
      <Box sx={{ bgcolor: '#f8f9fa', py: 2, borderBottom: '1px solid #e0e0e0' }}>
        <Container maxWidth="lg">
          <Box
            sx={{
              display: 'flex',
              gap: { xs: 2, md: 4 },
              flexWrap: 'wrap',
              justifyContent: { xs: 'center', md: 'flex-start' },
            }}
          >
            {[
              { label: 'Since 2009' },
              { label: '99.9% Pass Rate' },
              { label: 'IIT/NIT Alumni Faculty' },
              { label: '150+ Cities' },
              { label: 'Max 25 per Batch' },
            ].map((item) => (
              <Typography
                key={item.label}
                sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#444', whiteSpace: 'nowrap' }}
              >
                {item.label}
              </Typography>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Top 10 List */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.5rem', md: '2rem' },
              fontWeight: 700,
              mb: 1,
              color: '#1a1a2e',
            }}
          >
            The 10 Best NATA Coaching Centers in Chennai
          </Typography>
          <Typography sx={{ color: '#666', mb: 5, fontSize: '0.95rem' }}>
            All 10 centers belong to the Neram Classes network. Physical centers in Ashok Nagar
            and Tambaram. Online access for all other Chennai neighborhoods.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {entries.map((entry) => (
              <Card
                key={entry.rank}
                elevation={0}
                sx={{
                  border: entry.rank === 1 ? '2px solid #e8a020' : '1px solid #e0e0e0',
                  '&:hover': { borderColor: '#e8a020', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
                  transition: 'all 0.2s',
                }}
              >
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Box
                    sx={{
                      display: 'flex',
                      gap: 2,
                      alignItems: 'flex-start',
                      flexDirection: { xs: 'column', sm: 'row' },
                    }}
                  >
                    {/* Rank badge */}
                    <Box
                      sx={{
                        minWidth: 48,
                        height: 48,
                        borderRadius: '50%',
                        bgcolor: entry.rank === 1 ? '#e8a020' : '#f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        color: entry.rank === 1 ? '#fff' : '#666',
                        flexShrink: 0,
                      }}
                    >
                      #{entry.rank}
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                        <Typography
                          variant="h3"
                          sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 700, color: '#1a1a2e' }}
                        >
                          {entry.name}
                        </Typography>
                        <Chip
                          label={entry.tag}
                          size="small"
                          sx={{
                            bgcolor: entry.rank === 1 ? '#e8a020' : '#f0f0f0',
                            color: entry.rank === 1 ? '#fff' : '#555',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                          }}
                        />
                      </Box>
                      <Typography sx={{ color: '#888', fontSize: '0.85rem', mb: 1.5 }}>
                        {entry.area}
                      </Typography>
                      <Box component="ul" sx={{ m: 0, pl: 2.5, color: '#555', fontSize: '0.9rem' }}>
                        {entry.highlights.map((h) => (
                          <li key={h} style={{ marginBottom: 4 }}>
                            {h}
                          </li>
                        ))}
                      </Box>
                    </Box>

                    {/* CTA */}
                    <Box sx={{ flexShrink: 0, alignSelf: { xs: 'stretch', sm: 'center' } }}>
                      <Button
                        component={Link}
                        href={entry.url}
                        variant={entry.rank === 1 ? 'contained' : 'outlined'}
                        size="small"
                        sx={
                          entry.rank === 1
                            ? { bgcolor: '#e8a020', '&:hover': { bgcolor: '#d09010' }, fontWeight: 700, px: 3 }
                            : { borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600, px: 3 }
                        }
                      >
                        View Details
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      <Divider />

      {/* How to Choose */}
      <Box sx={{ py: { xs: 6, md: 8 }, bgcolor: '#f8f9fa' }}>
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              mb: 1,
              color: '#1a1a2e',
            }}
          >
            How to Choose a NATA Coaching Center in Chennai
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, fontSize: '0.95rem' }}>
            Five criteria that separate good NATA coaching from average coaching.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 3,
            }}
          >
            {howToChooseCriteria.map((c, i) => (
              <Card key={i} elevation={0} sx={{ border: '1px solid #e0e0e0', p: 0 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography
                    variant="h3"
                    sx={{ fontSize: '1rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}
                  >
                    {i + 1}. {c.title}
                  </Typography>
                  <Typography sx={{ color: '#555', fontSize: '0.9rem', lineHeight: 1.6 }}>
                    {c.body}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* FAQ */}
      <Box sx={{ py: { xs: 6, md: 8 } }}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              mb: 4,
              color: '#1a1a2e',
              textAlign: 'center',
            }}
          >
            Frequently Asked Questions
          </Typography>
          {faqs.map((faq, i) => (
            <Box
              key={i}
              sx={{
                mb: 3,
                pb: 3,
                borderBottom: i < faqs.length - 1 ? '1px solid #e0e0e0' : 'none',
              }}
            >
              <Typography
                variant="h3"
                sx={{ fontSize: '1.05rem', fontWeight: 700, mb: 1, color: '#1a1a2e' }}
              >
                {faq.question}
              </Typography>
              <Typography sx={{ color: '#555', lineHeight: 1.7, fontSize: '0.95rem' }}>
                {faq.answer}
              </Typography>
            </Box>
          ))}
        </Container>
      </Box>

      {/* CTA */}
      <Box sx={{ py: 6, bgcolor: '#e8a020', textAlign: 'center' }}>
        <Container maxWidth="md">
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: '1.4rem', md: '1.75rem' },
              fontWeight: 700,
              color: '#1a1a2e',
              mb: 1,
            }}
          >
            Ready to Join Chennai&apos;s #1 NATA Coaching Network?
          </Typography>
          <Typography sx={{ color: '#1a1a2e', opacity: 0.75, mb: 3, fontSize: '0.95rem' }}>
            Free demo class. No commitment. Experience the difference before enrolling.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button
              component={Link}
              href="/demo-class"
              variant="contained"
              size="large"
              sx={{
                bgcolor: '#1a1a2e',
                color: '#fff',
                '&:hover': { bgcolor: '#0a0a1e' },
                fontWeight: 700,
                px: 4,
              }}
            >
              Book Free Demo Class
            </Button>
            <Button
              component={Link}
              href="/apply"
              variant="outlined"
              size="large"
              sx={{ borderColor: '#1a1a2e', color: '#1a1a2e', fontWeight: 600 }}
            >
              Apply Now
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
```

- [ ] **Step 2: Verify the page renders without TypeScript errors**

```bash
cd apps/marketing && pnpm type-check 2>&1 | grep -i "nata-coaching-centers"
```

Expected: no errors for the new file. If you see import errors, check that `generateLocalBusinessSchema` in `@/lib/seo/schemas` accepts the shape you're passing (city/cityDisplay/state/stateDisplay/slug). It does — confirmed from reading `schemas.ts:278-311`.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/[locale]/nata-coaching-centers-in-chennai/page.tsx
git commit -m "feat(marketing): add Top 10 NATA coaching centers Chennai listicle page"
```

---

## Task 2: Update the existing Chennai hub page

**Files:**
- Modify: `apps/marketing/src/app/[locale]/coaching/nata-coaching-chennai/page.tsx`

- [ ] **Step 1: Update the title tag in `generateMetadata`**

In `apps/marketing/src/app/[locale]/coaching/nata-coaching-chennai/page.tsx`, find and replace the title:

**Find:**
```typescript
    title: 'NATA Coaching in Chennai, All Neighborhoods | Neram Classes',
```

**Replace with:**
```typescript
    title: 'NATA Coaching in Chennai | Ashok Nagar, Tambaram, Anna Nagar, Adyar | Neram',
```

- [ ] **Step 2: Update the H1 and add trust bar below it**

Find the Hero `<Box>` section. It currently ends at the two `<Button>` components. Add a trust bar row immediately after the `</Button>` closing tag but before the `</Container>` closing tag:

**Find (the closing of the two hero buttons, before `</Container>`):**
```tsx
          <Button component={Link} href="/demo-class" variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
            Free Demo Class
          </Button>
        </Container>
      </Box>
```

**Replace with:**
```tsx
          <Button component={Link} href="/demo-class" variant="outlined" size="large" sx={{ borderColor: '#fff', color: '#fff', fontWeight: 600 }}>
            Free Demo Class
          </Button>

          {/* Trust bar */}
          <Box sx={{ display: 'flex', gap: { xs: 2, md: 4 }, flexWrap: 'wrap', mt: 4, pt: 4, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            {['Since 2009', '99.9% Pass Rate', 'IIT/NIT Alumni Faculty', '150+ Cities', 'Max 25 per Batch'].map((item) => (
              <Typography key={item} sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
                {item}
              </Typography>
            ))}
          </Box>
        </Container>
      </Box>
```

- [ ] **Step 3: Add internal link to the new listicle in the Neighborhood Grid section**

Find the intro text above the neighborhood grid. It currently reads:

```tsx
          <Typography sx={{ color: '#666', mb: 4 }}>
            Click on your neighborhood to see how to reach our center, transport info, and local details.
          </Typography>
```

Replace with:

```tsx
          <Typography sx={{ color: '#666', mb: 2 }}>
            Click on your neighborhood to see how to reach our center, transport info, and local details.
          </Typography>
          <Typography sx={{ color: '#666', mb: 4, fontSize: '0.9rem' }}>
            Looking for a comparison?{' '}
            <Link href="/nata-coaching-centers-in-chennai" style={{ color: '#e8a020', fontWeight: 600 }}>
              See our top 10 NATA coaching centers in Chennai
            </Link>
            {' '}ranked by neighborhood.
          </Typography>
```

- [ ] **Step 4: Add OMR, Porur, Guindy stub cards to the neighborhood grid**

The neighborhood grid currently maps over `chennaiNeighborhoods`. We need to add 3 stub cards after the existing grid. Find the closing of the grid `</Box>` and the closing of the outer `</Box>` section:

**Find (the end of the neighborhood grid):**
```tsx
          </Box>
        </Container>
      </Box>

      {/* Center Info */}
```

**Replace with:**
```tsx
          </Box>

          {/* Stub neighborhoods — served via online + offline hybrid */}
          <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 700, mt: 4, mb: 2, color: '#1a1a2e' }}>
            Also Serving via Online + Weekend Offline
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
            {[
              {
                id: 'omr',
                title: 'NATA Coaching OMR / Sholinganallur',
                sub: 'Online weekday + Ashok Nagar weekend',
                desc: 'Students from Sholinganallur, Perungudi, and Thoraipakkam attend online on weekdays and our Ashok Nagar flagship on weekends.',
              },
              {
                id: 'porur',
                title: 'NATA Coaching Porur / Koyambedu',
                sub: 'Online weekday + Ashok Nagar weekend',
                desc: 'Koyambedu bus terminus connects directly to Ashok Nagar. Porur, Maduravoyal, and Poonamallee students use the hybrid model.',
              },
              {
                id: 'guindy',
                title: 'NATA Coaching Guindy / Chromepet',
                sub: '2 Metro stops from Ashok Nagar',
                desc: 'Guindy Metro to Ashok Nagar Metro — 2 stops on the Blue Line. Chromepet and Pallavaram students also use this route.',
              },
            ].map((stub) => (
              <Card key={stub.id} id={stub.id} elevation={0} sx={{ border: '1px solid #e0e0e0', bgcolor: '#fafafa' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h3" sx={{ fontSize: '1rem', fontWeight: 700, mb: 0.5, color: '#1a1a2e' }}>
                    {stub.title}
                  </Typography>
                  <Typography sx={{ color: '#e8a020', fontSize: '0.8rem', fontWeight: 600, mb: 1 }}>
                    {stub.sub}
                  </Typography>
                  <Typography sx={{ color: '#666', fontSize: '0.85rem', lineHeight: 1.5 }}>
                    {stub.desc}
                  </Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Container>
      </Box>

      {/* Center Info */}
```

- [ ] **Step 5: Verify no TypeScript errors**

```bash
cd apps/marketing && pnpm type-check 2>&1 | grep -i "nata-coaching-chennai"
```

Expected: no errors. If you see `Link` import missing, note that `Link` from `next/link` is already imported at the top of the file.

- [ ] **Step 6: Commit**

```bash
git add apps/marketing/src/app/[locale]/coaching/nata-coaching-chennai/page.tsx
git commit -m "feat(marketing): update Chennai hub page title, trust bar, stub cards, internal link"
```

---

## Task 3: Add new URL to sitemap

**Files:**
- Modify: `apps/marketing/src/app/sitemap.ts`

- [ ] **Step 1: Add the new page to `staticPages`**

In `apps/marketing/src/app/sitemap.ts`, find the line:

```typescript
  { path: '/coaching/nata-coaching-chennai', lastModified: '2026-03-25' },
```

Add the new entry directly above it:

```typescript
  { path: '/nata-coaching-centers-in-chennai', lastModified: '2026-04-08' },
  { path: '/coaching/nata-coaching-chennai', lastModified: '2026-04-08' },
```

Also update the `lastModified` for the Chennai hub to `'2026-04-08'` since we just modified it (shown in the replacement above).

- [ ] **Step 2: Verify sitemap builds correctly**

```bash
cd apps/marketing && pnpm build 2>&1 | tail -20
```

Expected: build completes with no errors. The sitemap route is statically generated at build time.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/sitemap.ts
git commit -m "feat(marketing): add Chennai listicle and updated hub page to sitemap"
```

---

## Self-Review

**Spec coverage check:**

| Spec Requirement | Task Covering It |
|-----------------|-----------------|
| New page `/nata-coaching-centers-in-chennai` | Task 1 |
| Title: "Top 10 NATA Coaching Centers in Chennai" | Task 1, Step 1 (generateMetadata) |
| 10 numbered cards with highlights and CTAs | Task 1, Step 1 (entries array + card rendering) |
| "How to choose" section — 5 criteria, no competitor names | Task 1, Step 1 (howToChooseCriteria) |
| FAQ schema (4 questions) | Task 1, Step 1 (faqs + generateFAQSchema) |
| ItemList schema | Task 1, Step 1 (generateItemListSchema) |
| BreadcrumbList schema | Task 1, Step 1 (generateBreadcrumbSchema) |
| LocalBusiness schema for Ashok Nagar | Task 1, Step 1 (generateLocalBusinessSchema) |
| OMR/Porur/Guindy link to Chennai hub with anchor | Task 1 (url: '/coaching/nata-coaching-chennai#omr' etc.) |
| Existing page: title updated to local dominance angle | Task 2, Step 1 |
| Existing page: trust bar below hero | Task 2, Step 2 |
| Existing page: 3 new stub cards | Task 2, Step 4 |
| Existing page: internal link to listicle | Task 2, Step 3 |
| Sitemap updated | Task 3 |
| No competitor names anywhere | Verified — zero competitor mentions in all code above |
