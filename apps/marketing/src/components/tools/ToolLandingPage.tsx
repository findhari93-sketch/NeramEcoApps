import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import type { ToolConfig } from '@/lib/tools/types';
import { TOOL_BY_SLUG } from '@/lib/tools/configs';
import { Link } from '@/i18n/routing';
import { CheckList, CtaBand, CtaButton, FaqList, LinkTile, PageHero, Section, StepList } from '@/design-system';
import { toolIcon } from './toolIcons';

const SITE = 'https://neramclasses.com';

/** Same-site URLs become paths (locale-aware Link); app.neramclasses.com stays external. */
function toolHref(url: string): { href: string; external: boolean } {
  if (url.startsWith(SITE)) return { href: url.slice(SITE.length) || '/', external: false };
  return { href: url, external: /^https?:\/\//.test(url) };
}

/**
 * T7 Tool page: dark hero with the quick check in its aside, then how it
 * works, features as a ruled list, the long-form context, related tools, FAQ
 * and the closing band. One shell for all 13 /tools/[slug] pages.
 */
export default function ToolLandingPage({ config }: { config: ToolConfig }) {
  const QuickCheckWidget = config.teaserComponent;
  const ExtraSections = config.extraSections;
  const full = toolHref(config.appUrl);
  const related = config.relatedToolSlugs.map((slug) => TOOL_BY_SLUG[slug]).filter(Boolean);

  return (
    <>
      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Free Tools', href: '/tools' }, { name: config.title }]}
        pills={config.trustBadges}
        title={config.title}
        lede={config.subtitle}
        asideMin={440}
        aside={<QuickCheckWidget />}
        actions={
          <CtaButton variant="outline" href={full.href} external={full.external}>
            Open the full tool
          </CtaButton>
        }
      >
        {/* Ties every tool guide back to the aiArchitek product hub. */}
        <Typography component="p" sx={{ m: 0, fontSize: '0.875rem', lineHeight: 1.6, color: t.paperSubtle }}>
          Part of{' '}
          <Link href="/aiarchitek" style={{ color: t.paper, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
            aiArchitek
          </Link>
          , free AI-powered NATA preparation tools by Neram Classes
        </Typography>
      </PageHero>

      <Section
        id="how-it-works"
        tone="light"
        rule={false}
        header={{ eyebrow: 'How it works', title: `How the ${config.title} works`, align: 'start' }}
      >
        <StepList items={config.steps.map((s) => ({ title: s.title, body: s.desc }))} />
      </Section>

      {ExtraSections && <ExtraSections />}

      <Section id="features" tone="white" header={{ eyebrow: 'Features', title: 'Key features', align: 'start' }}>
        <CheckList variant="ruled" columnMin={320} items={config.features.map((f) => ({ title: f.title, body: f.desc }))} />
      </Section>

      <Section id="about-tool" tone="light" width="article" header={{ title: config.contextHeading, align: 'start', size: 'article' }}>
        <Box
          // Trusted HTML from lib/tools/configs (paragraphs and <strong> only).
          dangerouslySetInnerHTML={{ __html: config.contextContent }}
          sx={{
            fontSize: '1rem',
            lineHeight: 1.7,
            color: t.inkMuted,
            '& p': { m: 0, mb: 2 },
            '& p:last-child': { mb: 0 },
            '& strong': { color: t.ink },
            '& a': { color: t.gold800, textDecoration: 'underline', textUnderlineOffset: '2px' },
          }}
        />
        <Box>
          <CtaButton variant="navy" href={full.href} external={full.external}>
            Get started free
          </CtaButton>
        </Box>
      </Section>

      {related.length > 0 && (
        <Section id="related-tools" tone="white" gap={2} header={{ eyebrow: 'Related tools', title: 'More free tools', align: 'start', size: 'article' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 2 }}>
            {related.map((tool) => (
              <LinkTile key={tool.slug} href={`/tools/${tool.slug}`} icon={toolIcon(tool.slug)} title={tool.title} />
            ))}
          </Box>
        </Section>
      )}

      {config.faqs.length > 0 && (
        <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'FAQ', title: 'Frequently asked questions' }}>
          <FaqList items={config.faqs} />
        </Section>
      )}

      <CtaBand
        eyebrow="Full tool"
        title="Save your results and track every attempt"
        lede="Sign in to the Neram app with Google to keep your history. Free, like every tool here."
        actions={
          <>
            <CtaButton href={full.href} external={full.external}>
              {full.external ? 'Open in the Neram app' : 'Open the full tool'}
            </CtaButton>
            <CtaButton variant="link" href="/apply">
              Join coaching
            </CtaButton>
          </>
        }
      />
    </>
  );
}
