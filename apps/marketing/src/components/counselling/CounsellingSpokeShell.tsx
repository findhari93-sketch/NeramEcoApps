import { Box, Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import AintraTopicChat from '@/components/aintra/AintraTopicChat';
import { toolIcon } from '@/components/tools/toolIcons';
import { CtaButton, DocHeader, DocLayout, LinkTile, NavCard } from '@/design-system';
import CallbackDrawer, { type CallbackDrawerProps } from './CallbackDrawer';

const baseUrl = 'https://neramclasses.com';

export interface CounsellingSpokeShellProps {
  locale: string;
  hubPath: string;
  hubLabel: string;
  spokeSlug: string;
  topicTitle: string;
  topicSubtitle: string;
  spokeChip?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  related?: Array<{ label: string; href: string }>;
  ctaSecondary?: { label: string; href: string };
  callback: Pick<
    CallbackDrawerProps,
    | 'ctaLabel'
    | 'drawerTitle'
    | 'drawerIntro'
    | 'successHeading'
    | 'successMessage'
    | 'context'
    | 'queryType'
    | 'courseInterest'
    | 'cutoffCalculatorUrl'
    | 'collegePredictorUrl'
    | 'prefillNotes'
  >;
  aintra: {
    topic: string;
    endpoint: string;
    title: string;
    subtitle: string;
    greeting: string;
    suggestions: string[];
    disclaimerSource?: string;
  };
  children: React.ReactNode;
}

/**
 * T5 shell for the TNEA and KEAM spoke pages (eligibility, dates, how to
 * apply...): light DocHeader, the article beside a rail of the hub's other
 * guides and two free tools, the call-back box, and the Aintra panel.
 */
export default function CounsellingSpokeShell({
  locale,
  hubPath,
  hubLabel,
  spokeSlug,
  topicTitle,
  topicSubtitle,
  spokeChip,
  jsonLd,
  related = [],
  ctaSecondary,
  callback,
  aintra,
  children,
}: CounsellingSpokeShellProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const hubUrl = `${baseUrl}${localePrefix}${hubPath}`;
  const spokeUrl = `${baseUrl}${localePrefix}${hubPath}/${spokeSlug}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counseling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: hubLabel, url: hubUrl },
    { name: topicTitle, url: spokeUrl },
  ]);

  const jsonLdArray = jsonLd ? (Array.isArray(jsonLd) ? [breadcrumbSchema, ...jsonLd] : [breadcrumbSchema, jsonLd]) : [breadcrumbSchema];

  const rail = (
    <>
      <NavCard
        title={`${hubLabel} guides`}
        links={[
          { label: `${hubLabel} overview`, href: hubPath },
          ...related.map((r) => ({ label: r.label, href: `${hubPath}/${r.href}`, current: r.href === spokeSlug })),
        ]}
      />
      <Box sx={{ bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        <Typography component="span" sx={{ fontFamily: t.fontMono, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.inkMuted }}>
          Free tools
        </Typography>
        <LinkTile href="/tools/college-predictor" icon={toolIcon('college-predictor')} title="College Predictor" />
        <LinkTile href="/tools/cutoff-calculator" icon={toolIcon('cutoff-calculator')} title="Cutoff Calculator" />
      </Box>
    </>
  );

  return (
    <>
      {jsonLdArray.map((data, idx) => (
        <JsonLd key={idx} data={data} />
      ))}

      <DocHeader
        breadcrumb={[
          { name: 'Home', href: '/' },
          { name: 'Counseling', href: '/counseling' },
          { name: hubLabel, href: hubPath },
          { name: spokeChip || topicTitle },
        ]}
        eyebrow={spokeChip}
        title={topicTitle}
        lede={topicSubtitle}
      />

      <Box sx={{ bgcolor: t.ground, pb: { xs: 10, md: 0 } }}>
        <DocLayout aside={rail}>
          <Box sx={{ minWidth: 0 }}>{children}</Box>

          <CallbackDrawer
            variant="sticky"
            card={{
              title: 'Not sure which colleges to fill first?',
              body: 'A counsellor calls you back with a choice list for your rank. Free, no obligation.',
            }}
            {...callback}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1.5 }}>
            <CtaButton variant="outline" href={hubPath} size="md" endIcon={null}>
              Back to {hubLabel} hub
            </CtaButton>
            {ctaSecondary && (
              <CtaButton variant="link" href={`${hubPath}/${ctaSecondary.href}`} size="md">
                {ctaSecondary.label}
              </CtaButton>
            )}
          </Box>
        </DocLayout>
      </Box>

      <AintraTopicChat
        topic={aintra.topic}
        endpoint={aintra.endpoint}
        title={aintra.title}
        subtitle={aintra.subtitle}
        greeting={aintra.greeting}
        suggestions={aintra.suggestions}
        primaryColor={t.navy900}
        primaryColorDark={t.navy700}
        disclaimerSource={aintra.disclaimerSource}
      />
    </>
  );
}
