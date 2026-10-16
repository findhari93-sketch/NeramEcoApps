import { notFound } from 'next/navigation';
import { Box, Typography } from '@neram/ui';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import {
  tokens as t,
  Section,
  Surface,
  SectionHeader,
  PageHero,
  DocHeader,
  CtaButton,
  CtaBand,
  StatStrip,
  FeatureCard,
  ToolCard,
  ProgramCard,
  CourseCard,
  FaqList,
  Breadcrumb,
  eyebrowSx,
} from '@/design-system';
import { contrastRatio } from '@/design-system/contrast';

// The styleguide is for the team: dev and staging only.
export const dynamic = 'force-static';

type Swatch = { name: string; value: string; on: string; use: string };

const darkSwatches: Swatch[] = [
  { name: 'navy900', value: t.navy900, on: t.paper, use: 'Dark ground, header (dark), footer, CTA band' },
  { name: 'navy800', value: t.navy800, on: t.paper, use: 'Cards and inputs on dark' },
  { name: 'navy700', value: t.navy700, on: t.paper, use: 'Avatars, hover on dark buttons' },
  { name: 'paper', value: t.paper, on: t.navy900, use: 'Text on dark' },
  { name: 'gold500', value: t.gold500, on: t.navy900, use: 'Primary action fill only, eyebrows and stats on dark' },
  { name: 'gold300', value: t.gold300, on: t.navy900, use: 'Primary hover, pill text on dark' },
];

const lightSwatches: Swatch[] = [
  { name: 'ground', value: t.ground, on: t.ink, use: 'Page body' },
  { name: 'surface', value: t.surface, on: t.ink, use: 'Cards, alternate bands, header (light)' },
  { name: 'line', value: t.line, on: t.ink, use: 'Card borders, row rules' },
  { name: 'ink', value: t.ink, on: t.surface, use: 'Text' },
  { name: 'inkMuted', value: t.inkMuted, on: t.surface, use: 'Secondary text' },
  { name: 'gold800', value: t.gold800, on: t.surface, use: 'Eyebrows, check icons, gold text on light' },
  { name: 'success', value: t.success, on: t.surface, use: 'Verified, enrolment status, Live rail only' },
];

function SwatchGrid({ swatches, dark }: { swatches: Swatch[]; dark?: boolean }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 2 }}>
      {swatches.map((s) => {
        const ratio = contrastRatio(s.on, s.value);
        return (
          <Box key={s.name} sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box
              sx={{
                height: 64,
                borderRadius: `${t.radius}px`,
                bgcolor: s.value,
                border: `1px solid ${dark ? t.lineDark : t.line}`,
                color: s.on,
                display: 'flex',
                alignItems: 'flex-end',
                p: 1,
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              Aa {ratio.toFixed(1)}:1
            </Box>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>{s.name}</Typography>
            <Typography sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', opacity: 0.8 }}>{s.value}</Typography>
            <Typography sx={{ fontSize: '0.8125rem', lineHeight: 1.4, opacity: 0.8 }}>{s.use}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}

const typeRows: Array<{ variant: 'h1' | 'h2' | 'h3' | 'lede' | 'body1' | 'body2' | 'eyebrow' | 'statValue' | 'statLabel'; spec: string; sample: string }> = [
  { variant: 'h1', spec: '800 · clamp(2rem, 5vw, 3.5rem) · 1.05', sample: 'Crack NATA' },
  { variant: 'h2', spec: '800 · clamp(1.75rem, 3.5vw, 2.5rem) · 1.15', sample: 'Featured Courses' },
  { variant: 'h3', spec: '700 · 20 to 22px · 1.25', sample: 'Year Long Program' },
  { variant: 'lede', spec: '400 · 17 to 18px · 1.55', sample: 'Live classes. Intelligent tools. Real results.' },
  { variant: 'body1', spec: '400 · 16px · 1.6 (never below 16 on phones)', sample: 'Body copy for long-form pages.' },
  { variant: 'body2', spec: '400 · 15px · 1.55 (small, meta)', sample: 'Updated March 13, 2026' },
  { variant: 'eyebrow', spec: 'mono 700 · 12px · 0.2em · uppercase', sample: 'Our programs' },
  { variant: 'statValue', spec: 'mono 700 · 22 to 26px · 1', sample: 'AIR 1' },
  { variant: 'statLabel', spec: '12px · 0.05em · uppercase', sample: 'JEE B.Arch 2024' },
];

const faq = [
  { question: 'Who conducts NATA 2026?', answer: 'The Council of Architecture (CoA) conducts NATA every year.' },
  { question: 'How many times can I take NATA?', answer: 'Up to two attempts in Phase 1; the better score counts.' },
  { question: 'Is the drawing test online?', answer: 'No. Part A (drawing) is offline on paper; Part B is online.' },
];

export default function DesignSystemPage() {
  if (process.env.VERCEL_ENV === 'production') notFound();

  return (
    <Box component="main" sx={{ bgcolor: t.ground, color: t.ink }}>
      <DocHeader
        eyebrow="Neram marketing · design system"
        title="One token set, two surfaces"
        lede="Every marketing page uses only these tokens and components. Tokens live in @neram/ui (site-tokens.ts); components live in apps/marketing/src/design-system. Rules: apps/marketing/DESIGN_SYSTEM.md."
        verified="Source: Marketing Website Design Audit handoff, October 2026"
      />

      <Section id="colour" header={{ eyebrow: 'Tokens', title: 'Colour', align: 'start', lede: 'Each swatch shows the contrast of its paired text colour. Text pairs must be 4.5:1 or more.' }}>
        <Surface tone="dark" component="div" sx={{ borderRadius: `${t.radius}px`, p: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 2 }}>Dark surface: hero, CTA band, header on dark pages, footer</Typography>
          <SwatchGrid swatches={darkSwatches} dark />
        </Surface>
        <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 3 }}>
          <Typography sx={{ fontWeight: 700, mb: 2 }}>Light surface: long-form and SEO body</Typography>
          <SwatchGrid swatches={lightSwatches} />
        </Box>
      </Section>

      <Section tone="white" id="type" header={{ eyebrow: 'Tokens', title: 'Type: Inter + one mono stack', align: 'start' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Box component="table" sx={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', textAlign: 'left' }}>
            <Box component="thead">
              <Box component="tr" sx={{ borderBottom: `2px solid ${t.ink}` }}>
                {['Variant', 'Spec', 'Sample'].map((h) => (
                  <Box component="th" key={h} sx={{ py: 1.25, px: 1.5, fontSize: '0.875rem' }}>
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {typeRows.map((row) => (
                <Box component="tr" key={row.variant} sx={{ borderBottom: `1px solid ${t.line}` }}>
                  <Box component="td" sx={{ py: 1.25, px: 1.5, fontFamily: t.fontMono, fontSize: '0.8125rem' }}>
                    {row.variant}
                  </Box>
                  <Box component="td" sx={{ py: 1.25, px: 1.5, fontSize: '0.875rem', color: t.inkMuted }}>
                    {row.spec}
                  </Box>
                  <Box component="td" sx={{ py: 1.25, px: 1.5 }}>
                    <Typography variant={row.variant} component="span" sx={row.variant === 'eyebrow' ? { color: t.gold800 } : undefined}>
                      {row.sample}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Section>

      <Section id="buttons" header={{ eyebrow: 'Components', title: 'CtaButton', align: 'start', lede: 'Gold fill is for the one primary action. Labels sit flush left; arrows go to the edge in full-width buttons.' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          <CtaButton href="/apply">Apply Now</CtaButton>
          <CtaButton variant="outline" href="/demo-class" startIcon={<VideocamOutlinedIcon aria-hidden />} endIcon={null}>
            Free demo
          </CtaButton>
          <CtaButton variant="navy" href="/tools">Try Our Free App</CtaButton>
          <CtaButton variant="link" href="/tools" external>
            Explore Free Tools
          </CtaButton>
        </Box>
        <Box sx={{ maxWidth: 360 }}>
          <CtaButton variant="outline" size="md" fullWidth href="/courses">
            Explore course
          </CtaButton>
        </Box>
        <Surface tone="dark" component="div" sx={{ borderRadius: `${t.radius}px`, p: 3 }}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="outline" href="/counseling">Book Free Counseling</CtaButton>
            <CtaButton variant="link" href="/contact" external>
              Contact Us
            </CtaButton>
          </Box>
        </Surface>
      </Section>

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Coaching' }]}
        eyebrow="NATA · JEE Paper 2 · B.Arch"
        title={
          <>
            Transform Your Future with <em>Expert Coaching</em>
          </>
        }
        lede="PageHero, tone dark. Breadcrumb, eyebrow, h1 with a gold <em>, lede, actions and a stat band."
        actions={
          <>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="outline" href="/counseling" endIcon={null}>
              Book Free Counseling
            </CtaButton>
          </>
        }
        stats={[
          { value: '1,000+', label: 'Students taught' },
          { value: 'AIR 1', label: 'JEE B.Arch 2024' },
          { value: '10', label: 'Classrooms' },
          { value: null, label: 'Loading example' },
        ]}
      />

      <PageHero
        eyebrow="PageHero with an aside"
        title="Book a free demo class"
        lede="Two auto-fit columns that stack on phones. The aside holds a booking card, quick check or facts."
        pills={['NEW · Live every Saturday']}
        aside={
          <Box sx={{ bgcolor: t.surface, color: t.ink, borderRadius: `${t.radius}px`, p: 3, boxShadow: t.shadowHeroCard }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1.125rem', mb: 1 }}>Aside card</Typography>
            <Typography sx={{ color: t.inkMuted }}>White card, 8px radius, the hero card shadow.</Typography>
          </Box>
        }
        blueprint={false}
      />

      <Section tone="white" id="section-header" header={{ eyebrow: 'Our programs', title: 'SectionHeader', lede: 'Mono eyebrow, h2, lede capped near 560px. Centred on marketing pages, start-aligned on content pages.' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 3 }}>
          <ToolCard href="/tools/cutoff-calculator" icon={<CalculateOutlinedIcon />} title="Cutoff Calculator" body="ToolCard: the whole card links; the border turns gold on hover." />
          <ToolCard href="/tools/college-predictor" icon={<SchoolOutlinedIcon />} title="College Predictor" body="Find architecture colleges based on your expected rank." />
          <FeatureCard icon={<LocationOnOutlinedIcon />} title="FeatureCard" body="Same shape without a link, for 'Why choose' lists." />
        </Box>
      </Section>

      <Section id="cards" header={{ eyebrow: 'Components', title: 'ProgramCard and CourseCard' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 3 }}>
          <ProgramCard
            highlight
            title="Architecture Entrance: Year Long"
            subtitle="NATA + JEE Paper 2 (B.Arch/B.Planning)"
            description="Comprehensive year-long preparation with IIT/NIT architect alumni faculty."
            chips={['1 Year', 'Online', 'Offline']}
            features={['Drawing and Sketching', 'Mathematics and Reasoning', 'General Aptitude', '500+ Practice Questions']}
            cta={{ label: 'Explore Year Long', href: '/courses' }}
          />
          <ProgramCard
            title="Revit Architecture Training"
            subtitle="Professional BIM Software"
            description="Industry-focused Autodesk Revit training for architects and designers."
            chips={['3 Months', 'Online']}
            features={['BIM Fundamentals', 'Architectural Modeling']}
            cta={{ label: 'Explore Revit', href: '/courses' }}
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 3 }}>
          <CourseCard
            title="Architecture Entrance: Crash Course"
            description="Intensive NATA and JEE Paper 2 crash course for quick preparation."
            image="/images/courses/architecture-crash.svg"
            badge="All Levels"
            meta={{ label: 'Duration', value: '2 to 3 Months' }}
            cta={{ label: 'Explore course', href: '/courses' }}
          />
        </Box>
      </Section>

      <Section tone="white" width="narrow" id="faq" header={{ title: 'FaqList', align: 'start', lede: 'Rules, not boxes. One answer open at a time; closed answers stay in the HTML.' }}>
        <FaqList items={faq} />
      </Section>

      <Section id="misc" header={{ eyebrow: 'Components', title: 'Breadcrumb and StatStrip', align: 'start' }}>
        <Breadcrumb items={[{ name: 'Home', href: '/' }, { name: 'NATA 2026', href: '/nata-2026' }, { name: 'Syllabus' }]} />
        <Surface tone="dark" component="div" sx={{ borderRadius: `${t.radius}px`, p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography component="p" sx={eyebrowSx}>
            Compact strip (hero copy column)
          </Typography>
          <StatStrip
            size="compact"
            items={[
              { value: 'AIR 1', label: 'JEE B.Arch · 2024' },
              { value: '1,000+', label: 'Students' },
              { value: '189', label: 'NATA score' },
              { value: '10+', label: 'Years' },
            ]}
          />
        </Surface>
      </Section>

      <Section tone="white" id="header-states" header={{ eyebrow: 'Coming in phase 3', title: 'Site Header states', align: 'start', lede: 'Guest, signed in, demo booked, draft, submitted, approved, enrolled and the /apply state render here once the header state map lands.' }} />

      <CtaBand
        title="CtaBand: Ready to Start Your Journey?"
        lede="The dark closing band on every page, just above the footer."
        actions={
          <>
            <CtaButton href="/apply">Apply Now</CtaButton>
            <CtaButton variant="link" href="/tools" external>
              Explore Free Tools
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
