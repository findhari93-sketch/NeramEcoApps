import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import { Link } from '@/i18n/routing';
import { JsonLd } from '@/components/seo/JsonLd';
import { toolIcon } from '@/components/tools/toolIcons';
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
  AI_STATUS_LABEL,
  AUDIENCE,
  CITY_LINKS,
  FAQS,
  JOURNEY,
  LIVE_TOOLS,
  RESOURCE_LINKS,
  SOON_TOOLS,
  appToolUrl,
  type AiFeature,
  type LiveTool,
} from '@/lib/aiarchitek/content';
import {
  CheckList,
  CtaBand,
  CtaButton,
  FactGrid,
  FaqList,
  LinkTile,
  PageHero,
  Section,
  StepList,
  iconTileSx,
  tokens as t,
  v,
} from '@/design-system';

/**
 * /aiarchitek: the product hub for aiArchitek, the Neram tools app.
 * English only (see ENGLISH_ONLY_SECTIONS), fully static, server components only.
 * tests/e2e/aiarchitek-marketing.spec.ts reads `#tools article` (h4 a + "Open the" link)
 * and `#ai-learning article` (status label), so keep those elements.
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

const nataTools = LIVE_TOOLS.filter((tool) => tool.track === 'nata');
const counselingTools = LIVE_TOOLS.filter((tool) => tool.track === 'counseling');
const toolBySlug = Object.fromEntries(LIVE_TOOLS.map((tool) => [tool.slug, tool]));

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
  gap: { xs: 2, md: 2.5 },
  listStyle: 'none',
  p: 0,
  m: 0,
} as const;

const bodySx = { m: 0, maxWidth: 760, fontSize: '1rem', lineHeight: 1.7, color: v.fg } as const;
const groupTitleSx = { m: 0, fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.3, color: v.fg } as const;
const inlineLinkStyle = { color: t.gold800, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' } as const;

const cardSx = {
  height: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 1.5,
  p: { xs: 2.5, sm: 3 },
  bgcolor: v.card,
  border: `1px solid ${v.line}`,
  borderRadius: `${t.radius}px`,
  color: v.fg,
} as const;

function Badge({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        flexShrink: 0,
        fontSize: '0.75rem',
        fontWeight: 700,
        lineHeight: 1.4,
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radiusPill}px`,
        px: 1.25,
        py: '3px',
        color: v.muted,
      }}
    >
      {children}
    </Box>
  );
}

/** One live tool: the title links to the marketing guide, the button opens the working tool on the app. */
function LiveToolCard({ tool }: { tool: LiveTool }) {
  const rows: [string, string][] = [
    ['For', tool.whoFor],
    ['You enter', tool.input],
    ['You get', tool.output],
    ['Free', tool.free],
    ['Sign in adds', tool.signedIn],
  ];
  return (
    <Box component="article" sx={cardSx}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box aria-hidden sx={iconTileSx}>
          {toolIcon(tool.slug)}
        </Box>
        <Badge>Live</Badge>
      </Box>
      <Box component="h4" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
        <Link
          href={`/tools/${tool.slug}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            color: 'inherit',
            textDecoration: 'underline',
            textDecorationColor: t.gold500,
            textUnderlineOffset: '4px',
          }}
        >
          {tool.name}
        </Link>
      </Box>
      <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.55, color: v.fg }}>
        {tool.definition}
      </Typography>
      <Box
        component="dl"
        sx={{
          m: 0,
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          columnGap: 1.5,
          rowGap: 0.75,
          fontSize: '0.9375rem',
          lineHeight: 1.5,
          borderTop: `1px solid ${v.line}`,
          pt: 1.5,
          '& dt': { fontWeight: 600, color: v.fg },
          '& dd': { m: 0, color: v.muted, overflowWrap: 'anywhere' },
        }}
      >
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'contents' }}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 'auto', pt: 0.5, display: 'flex' }}>
        <CtaButton
          variant="outline"
          size="md"
          external
          href={appToolUrl(tool)}
          aria-label={`Open the ${tool.name} on aiArchitek`}
          sx={{ width: { xs: '100%', sm: 'auto' } }}
        >
          Open tool
        </CtaButton>
      </Box>
    </Box>
  );
}

function AiFeatureCard({ feature }: { feature: AiFeature }) {
  const soon = feature.status === 'coming-soon';
  return (
    <Box component="article" sx={{ ...cardSx, borderStyle: soon ? 'dashed' : 'solid' }}>
      <Box>
        <Badge>{AI_STATUS_LABEL[feature.status]}</Badge>
      </Box>
      <Typography component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.35 }}>
        {feature.name}
      </Typography>
      <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.55, color: v.fg }}>
        {feature.summary}
      </Typography>
      <CheckList variant="compact" items={feature.points} />
    </Box>
  );
}

function ToolGroup({ title, tools }: { title: string; tools: LiveTool[] }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography component="h3" sx={groupTitleSx}>
        {title}
      </Typography>
      <Box component="ul" sx={gridSx}>
        {tools.map((tool) => (
          <li key={tool.slug}>
            <LiveToolCard tool={tool} />
          </li>
        ))}
      </Box>
    </Box>
  );
}

function TileGrid({ items, icon }: { items: { label: string; href: string; hint: string }[]; icon?: () => ReactNode }) {
  return (
    <Box
      component="ul"
      sx={{ ...gridSx, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 1.5 }}
    >
      {items.map((item) => (
        <li key={item.href}>
          <LinkTile href={item.href} title={item.label} meta={item.hint} icon={icon?.()} />
        </li>
      ))}
    </Box>
  );
}

export default function AiArchitekPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);

  const schemas = [
    generateOrganizationSchema(),
    generateAiArchitekAppSchema(LIVE_TOOLS.map((tool) => tool.name)),
    generateBreadcrumbSchema([
      { name: 'Home', url: BASE_URL },
      { name: 'aiArchitek', url: `${BASE_URL}${PATH}` },
    ]),
    generateFAQSchema(FAQS),
  ];

  return (
    <>
      <JsonLd data={schemas} />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'aiArchitek' }]}
        eyebrow="By Neram Classes"
        title={<>aiArchitek: India&apos;s First AI-Powered NATA Coaching Classroom</>}
        lede="Prepare smarter for NATA and B.Arch admission with free tools, real practice questions, college discovery and AI-assisted learning, all built by the team that teaches the classes."
        actions={
          <>
            <CtaButton href={`${APP_URL}/tools`} external>
              Try aiArchitek free
            </CtaButton>
            <CtaButton variant="outline" href="#tools" endIcon={null}>
              Explore NATA tools
            </CtaButton>
          </>
        }
      >
        <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', color: t.paperSubtle }}>
          Built by Neram Classes · Architecture-focused · Available across India
        </Typography>
      </PageHero>

      <Section id="what-is" tone="light" gap={3} header={{ title: 'What is aiArchitek?', align: 'start' }}>
        <Typography component="p" sx={bodySx}>
          <strong>aiArchitek</strong> is the AI-powered architecture entrance platform from Neram Classes. It gives NATA and
          B.Arch aspirants free, practical tools for every step from eligibility to college choice, and it powers the Neram
          classroom where enrolled students learn with AI alongside their teachers.
        </Typography>
        <Typography component="p" sx={bodySx}>
          Every tool answers your question for free without signing in. Signing in with Google, also free, unlocks the full
          result and saves your work across devices. aiArchitek runs in any browser and can be installed on your phone like an
          app.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
          <Typography component="h3" sx={groupTitleSx}>
            aiArchitek at a glance
          </Typography>
          <FactGrid
            cellMin={260}
            items={[
              { label: 'Made by', value: 'Neram Classes, architecture entrance coaching since 2009' },
              { label: 'For', value: 'NATA and JEE Main Paper 2 (B.Arch) aspirants, and their parents' },
              { label: 'Price', value: 'Free tools; the AI classroom is part of Neram coaching' },
              { label: 'Works on', value: 'Phone, tablet and computer, installable on Android and iOS' },
              { label: 'Available', value: 'Across India, online' },
              {
                label: 'Open it',
                value: (
                  <a href={`${APP_URL}/tools`} style={inlineLinkStyle}>
                    app.neramclasses.com
                  </a>
                ),
              },
            ]}
          />
        </Box>
      </Section>

      <Section id="tools" tone="white" gap={3} header={{ title: 'Free NATA preparation tools', align: 'start' }}>
        <Typography component="p" sx={bodySx}>
          Twelve tools are live today. Tap a tool name for its full guide, or open it straight away in aiArchitek.
        </Typography>

        <ToolGroup title="NATA exam tools" tools={nataTools} />
        <ToolGroup title="B.Arch counselling and college tools" tools={counselingTools} />

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography component="h3" sx={groupTitleSx}>
            Coming soon
          </Typography>
          <Box component="ul" sx={{ ...gridSx, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' }}>
            {SOON_TOOLS.map((tool) => (
              <Box component="li" key={tool.name} sx={{ ...cardSx, gap: 1, borderStyle: 'dashed' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                  <Typography component="span" sx={{ fontWeight: 700, lineHeight: 1.35 }}>
                    {tool.name}
                  </Typography>
                  <Badge>Coming soon</Badge>
                </Box>
                <Typography component="span" sx={{ fontSize: '0.9375rem', lineHeight: 1.5, color: v.muted }}>
                  {tool.definition}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Section>

      <Section
        id="ai-learning"
        tone="light"
        gap={3}
        header={{ title: 'AI-powered learning for NATA and architecture entrance preparation', align: 'start' }}
      >
        <Typography component="p" sx={bodySx}>
          Each feature below is labelled honestly. <strong>Free for everyone</strong> means you can use it today without an
          account. <strong>In the Neram classroom</strong> means it runs for enrolled students inside Nexus, the Neram
          learning platform. <strong>Coming soon</strong> means it is being built and is not available yet.
        </Typography>
        <Box component="ul" sx={gridSx}>
          {AI_FEATURES.map((feature) => (
            <li key={feature.name}>
              <AiFeatureCard feature={feature} />
            </li>
          ))}
        </Box>
      </Section>

      <Section id="how-it-helps" tone="white" gap={3} header={{ title: 'How aiArchitek helps you, step by step', align: 'start' }}>
        <StepList
          columnMin={200}
          items={JOURNEY.map((j) => ({
            title: j.step,
            body: (
              <>
                {j.text}{' '}
                <Link href={`/tools/${j.slug}`} style={inlineLinkStyle}>
                  {toolBySlug[j.slug]?.name}
                </Link>
              </>
            ),
          }))}
        />
      </Section>

      <Section id="who-for" tone="light" gap={3} header={{ title: 'Who is aiArchitek for?', align: 'start' }}>
        <CheckList variant="ruled" columnMin={300} titleAs="h3" items={AUDIENCE.map((a) => ({ title: a.who, body: a.why }))} />
      </Section>

      <Section id="classroom" tone="white" gap={3} header={{ title: 'aiArchitek and the Neram AI classroom', align: 'start' }}>
        <Typography component="p" sx={bodySx}>
          The free tools are for every architecture aspirant. Students who join Neram Classes also learn in Nexus, the Neram
          classroom, where live classes, tests, drawing reviews and the AI learning features come together: an AI Maths
          Teacher, question paper analysis, AI answer explanations and AI class recaps, all alongside the teachers who run
          the batch.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
          <CtaButton href="/nata-online-coaching">See NATA online coaching</CtaButton>
          <CtaButton variant="outline" href="/demo-class">
            Book a free demo class
          </CtaButton>
        </Box>
      </Section>

      <Section id="resources" tone="light" gap={3} header={{ title: 'NATA and B.Arch preparation resources', align: 'start' }}>
        <TileGrid items={RESOURCE_LINKS} />
      </Section>

      <Section id="across-india" tone="white" gap={3} header={{ title: 'Available across India', align: 'start' }}>
        <Typography component="p" sx={bodySx}>
          aiArchitek works anywhere in India on any phone or computer, and Neram runs live NATA classes online for students
          in every state. Classroom batches run in Tamil Nadu and Bangalore. For local test centres, colleges and coaching
          options, see your city:
        </Typography>
        <TileGrid items={CITY_LINKS} icon={() => <LocationOnOutlinedIcon />} />
      </Section>

      <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently asked questions about aiArchitek' }}>
        <FaqList items={FAQS} />
      </Section>

      <CtaBand
        title="Start your NATA preparation with aiArchitek"
        lede="Free tools for every step, and an AI classroom when you are ready for coaching."
        actions={
          <>
            <CtaButton href={`${APP_URL}/tools`} external>
              Try aiArchitek free
            </CtaButton>
            <CtaButton variant="link" href="/apply">
              Start NATA preparation
            </CtaButton>
          </>
        }
      />
    </>
  );
}
