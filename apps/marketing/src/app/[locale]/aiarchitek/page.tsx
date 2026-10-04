import type { Metadata } from 'next';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { Box, Container, Typography, Button } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import { Section, FactTable, FaqList, LinkGrid } from '@/components/coaching-location/parts';
import { AiArchitekHero, HERO_BG } from '@/components/aiarchitek/AiArchitekHero';
import { ToolCard } from '@/components/aiarchitek/ToolCard';
import { AiFeatureCard } from '@/components/aiarchitek/AiFeatureCard';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { APP_URL, BASE_URL } from '@/lib/seo/constants';
import {
  generateAiArchitekAppSchema,
  generateBreadcrumbSchema,
  generateFAQSchema,
  generateOrganizationSchema,
} from '@/lib/seo/schemas';
import {
  AI_FEATURES,
  AUDIENCE,
  CITY_LINKS,
  FAQS,
  JOURNEY,
  LIVE_TOOLS,
  RESOURCE_LINKS,
  SOON_TOOLS,
} from '@/lib/aiarchitek/content';

/**
 * /aiarchitek: the product hub for aiArchitek, the Neram tools app.
 * English only (see ENGLISH_ONLY_SECTIONS), fully static, server components only.
 */

const PATH = '/aiarchitek';
const TITLE = 'aiArchitek by Neram Classes: AI-Powered NATA Preparation';
const DESCRIPTION =
  'Prepare for NATA and B.Arch admission with aiArchitek by Neram Classes. Free cutoff calculator, college predictor, exam centre finder, question practice and AI-powered learning.';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  const image = buildOgImage('aiArchitek', 'AI-powered NATA and B.Arch preparation', 'tool');
  return {
    title: { absolute: TITLE },
    description: DESCRIPTION,
    alternates: buildAlternates(locale, PATH),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      url: `${BASE_URL}${PATH}`,
      type: 'website',
      siteName: 'Neram Classes',
      images: [{ url: image, width: 1200, height: 630, alt: 'aiArchitek: AI-powered NATA and B.Arch preparation by Neram Classes' }],
    },
    twitter: {
      card: 'summary_large_image',
      title: TITLE,
      description: DESCRIPTION,
      images: [image],
    },
  };
}

const nataTools = LIVE_TOOLS.filter((t) => t.track === 'nata');
const counselingTools = LIVE_TOOLS.filter((t) => t.track === 'counseling');
const toolBySlug = Object.fromEntries(LIVE_TOOLS.map((t) => [t.slug, t]));

const gridSx = {
  display: 'grid',
  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
  gap: 2,
  listStyle: 'none',
  p: 0,
  m: 0,
} as const;

const h3Sx = { fontSize: { xs: '1.125rem', md: '1.25rem' }, fontWeight: 700, mt: 3, mb: 1.5 } as const;
const bodySx = { fontSize: '1rem', lineHeight: 1.7, color: 'text.primary', mb: 2 } as const;
const inlineLinkSx = {
  color: 'primary.main',
  fontWeight: 600,
  textUnderlineOffset: '3px',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
} as const;

export default function AiArchitekPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const schemas = [
    generateOrganizationSchema(),
    generateAiArchitekAppSchema(LIVE_TOOLS.map((t) => t.name)),
    generateBreadcrumbSchema([
      { name: 'Home', url: BASE_URL },
      { name: 'aiArchitek', url: `${BASE_URL}${PATH}` },
    ]),
    generateFAQSchema(FAQS),
  ];

  return (
    <>
      <JsonLd data={schemas} />
      <AiArchitekHero />

      <Section id="what-is" title="What is aiArchitek?">
        <Typography sx={bodySx}>
          <strong>aiArchitek</strong> is the AI-powered architecture entrance platform from Neram Classes. It gives NATA and
          B.Arch aspirants free, practical tools for every step from eligibility to college choice, and it powers the Neram
          classroom where enrolled students learn with AI alongside their teachers.
        </Typography>
        <Typography sx={bodySx}>
          Every tool answers your question for free without signing in. Signing in with Google, also free, unlocks the full
          result and saves your work across devices. aiArchitek runs in any browser and can be installed on your phone like an
          app.
        </Typography>
        <FactTable
          caption="aiArchitek at a glance"
          rows={[
            { label: 'Made by', value: 'Neram Classes, architecture entrance coaching since 2009' },
            { label: 'For', value: 'NATA and JEE Main Paper 2 (B.Arch) aspirants, and their parents' },
            { label: 'Price', value: 'Free tools; the AI classroom is part of Neram coaching' },
            { label: 'Works on', value: 'Phone, tablet and computer, installable on Android and iOS' },
            { label: 'Available', value: 'Across India, online' },
            {
              label: 'Open it',
              value: (
                <Box component="a" href={`${APP_URL}/tools`} sx={inlineLinkSx}>
                  app.neramclasses.com
                </Box>
              ),
            },
          ]}
        />
      </Section>

      <Section id="tools" title="Free NATA preparation tools" muted>
        <Typography sx={bodySx}>
          Twelve tools are live today. Tap a tool name for its full guide, or open it straight away in aiArchitek.
        </Typography>

        <Typography component="h3" sx={h3Sx}>
          NATA exam tools
        </Typography>
        <Box component="ul" sx={gridSx}>
          {nataTools.map((t) => (
            <li key={t.slug}>
              <ToolCard tool={t} />
            </li>
          ))}
        </Box>

        <Typography component="h3" sx={h3Sx}>
          B.Arch counselling and college tools
        </Typography>
        <Box component="ul" sx={gridSx}>
          {counselingTools.map((t) => (
            <li key={t.slug}>
              <ToolCard tool={t} />
            </li>
          ))}
        </Box>

        <Typography component="h3" sx={h3Sx}>
          Coming soon
        </Typography>
        <Box component="ul" sx={{ ...gridSx, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>
          {SOON_TOOLS.map((t) => (
            <Box
              component="li"
              key={t.name}
              sx={{ p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}
            >
              <Typography component="span" sx={{ display: 'block', fontWeight: 700 }}>
                {t.name}
              </Typography>
              <Typography component="span" sx={{ display: 'block', fontSize: '0.9375rem', color: 'text.secondary' }}>
                {t.definition}
              </Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Section id="ai-learning" title="AI-powered learning for NATA and architecture entrance preparation">
        <Typography sx={bodySx}>
          Each feature below is labelled honestly. <strong>Free for everyone</strong> means you can use it today without an
          account. <strong>In the Neram classroom</strong> means it runs for enrolled students inside Nexus, the Neram
          learning platform. <strong>Coming soon</strong> means it is being built and is not available yet.
        </Typography>
        <Box component="ul" sx={gridSx}>
          {AI_FEATURES.map((f) => (
            <li key={f.name}>
              <AiFeatureCard feature={f} />
            </li>
          ))}
        </Box>
      </Section>

      <Section id="how-it-helps" title="How aiArchitek helps you, step by step" muted>
        <Box component="ol" sx={{ p: 0, m: 0, listStyle: 'none', counterReset: 'step', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {JOURNEY.map((j) => (
            <Box
              component="li"
              key={j.step}
              sx={{
                counterIncrement: 'step',
                display: 'grid',
                gridTemplateColumns: '40px 1fr',
                gap: 1.5,
                alignItems: 'start',
                '&::before': {
                  content: 'counter(step)',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  bgcolor: 'primary.main',
                  color: 'primary.contrastText',
                  fontWeight: 700,
                  display: 'grid',
                  placeItems: 'center',
                },
              }}
            >
              <Box>
                <Typography component="h3" sx={{ fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.4 }}>
                  {j.step}
                </Typography>
                <Typography sx={{ fontSize: '1rem', lineHeight: 1.6, color: 'text.secondary' }}>
                  {j.text}{' '}
                  <Box component={Link} href={`/tools/${j.slug}`} sx={inlineLinkSx}>
                    {toolBySlug[j.slug]?.name}
                  </Box>
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Section>

      <Section id="who-for" title="Who is aiArchitek for?">
        <Box component="ul" sx={{ ...gridSx, gap: 1.5 }}>
          {AUDIENCE.map((a) => (
            <Box component="li" key={a.who} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
              <Typography component="h3" sx={{ fontSize: '1.0625rem', fontWeight: 700 }}>
                {a.who}
              </Typography>
              <Typography sx={{ fontSize: '1rem', lineHeight: 1.6, color: 'text.secondary' }}>{a.why}</Typography>
            </Box>
          ))}
        </Box>
      </Section>

      <Section id="classroom" title="aiArchitek and the Neram AI classroom" muted>
        <Typography sx={bodySx}>
          The free tools are for every architecture aspirant. Students who join Neram Classes also learn in Nexus, the Neram
          classroom, where live classes, tests, drawing reviews and the AI learning features come together: an AI Maths
          Teacher, question paper analysis, AI answer explanations and AI class recaps, all alongside the teachers who run
          the batch.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
          <Button component={Link} href="/nata-online-coaching" variant="contained" sx={{ minHeight: 48, fontWeight: 700 }}>
            See NATA online coaching
          </Button>
          <Button component={Link} href="/demo-class" variant="outlined" sx={{ minHeight: 48, fontWeight: 700 }}>
            Book a free demo class
          </Button>
        </Box>
      </Section>

      <Section id="resources" title="NATA and B.Arch preparation resources">
        <LinkGrid items={RESOURCE_LINKS.map((r) => ({ label: r.label, href: r.href, hint: r.hint }))} />
      </Section>

      <Section id="across-india" title="Available across India" muted>
        <Typography sx={bodySx}>
          aiArchitek works anywhere in India on any phone or computer, and Neram runs live NATA classes online for students
          in every state. Classroom batches run in Tamil Nadu and Bangalore. For local test centres, colleges and coaching
          options, see your city:
        </Typography>
        <LinkGrid items={CITY_LINKS} />
      </Section>

      <Section id="faq" title="Frequently asked questions about aiArchitek">
        <FaqList faqs={FAQS} />
      </Section>

      <Box component="section" aria-labelledby="cta-title" sx={{ py: { xs: 5, md: 7 }, background: HERO_BG, color: '#FFFFFF' }}>
        <Container maxWidth="md" sx={{ textAlign: { xs: 'left', sm: 'center' } }}>
          <Typography id="cta-title" component="h2" sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 800, mb: 1.5 }}>
            Start your NATA preparation with aiArchitek
          </Typography>
          <Typography sx={{ fontSize: '1.0625rem', lineHeight: 1.6, mb: 3 }}>
            Free tools for every step, and an AI classroom when you are ready for coaching.
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'center', gap: 1.5 }}>
            <Button
              component="a"
              href={`${APP_URL}/tools`}
              variant="contained"
              sx={{
                minHeight: 48,
                px: 3,
                fontWeight: 700,
                // `background`, not bgcolor: the theme paints a gradient image on contained buttons.
                background: '#FFFFFF',
                color: '#0D47A1',
                '&:hover': { background: '#E3F2FD' },
                '&:focus-visible': { outline: '3px solid #FFFFFF', outlineOffset: 2 },
              }}
            >
              Try aiArchitek free
            </Button>
            <Button
              component={Link}
              href="/apply"
              variant="outlined"
              sx={{
                minHeight: 48,
                px: 3,
                fontWeight: 700,
                color: '#FFFFFF',
                borderColor: 'rgba(255,255,255,0.8)',
                '&:hover': { borderColor: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.1)' },
                '&:focus-visible': { outline: '3px solid #FFFFFF', outlineOffset: 2 },
              }}
            >
              Start NATA preparation
            </Button>
          </Box>
        </Container>
      </Box>
    </>
  );
}
