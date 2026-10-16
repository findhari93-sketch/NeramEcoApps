import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Typography } from '@neram/ui';
import { siteTokens as t } from '@neram/ui/site-tokens';
import { Link } from '@/i18n/routing';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { ALL_TOOLS } from '@/lib/tools/configs';
import type { ToolConfig } from '@/lib/tools/types';
import { toolIcon } from '@/components/tools/toolIcons';
import { CheckList, CtaBand, CtaButton, FaqList, HubIndex, Section } from '@/design-system';

const baseUrl = 'https://neramclasses.com';

const HUB_FAQS = [
  {
    question: 'Are all these tools free?',
    answer:
      'Yes, completely free. Every tool on this page is available at no cost. No hidden charges, no subscription, no credit card required. The quick check on each page works instantly without any payment.',
  },
  {
    question: 'Do I need to create an account?',
    answer:
      'No, the quick check on each page works without login. For the full tool with detailed results, saving your data, and accessing your history, you can sign in to the Neram Classes app with your Google account.',
  },
  {
    question: 'Which tool should I use first?',
    answer:
      'Start with the Eligibility Checker to confirm you qualify for NATA 2026. Then use the Cutoff Calculator to estimate your score. Once you have a target score, use the College Predictor to find colleges that match your profile.',
  },
  {
    question: 'How accurate is the data?',
    answer:
      'Based on historical data from 500+ colleges across India, updated after every counselling round and exam cycle. Predictions are strong reference points built on actual admission records from 2020 to 2025. Actual cutoffs vary each year based on difficulty and seat availability.',
  },
  {
    question: 'Do these tools work for JEE Paper 2 B.Arch?',
    answer:
      'Yes, the cutoff and college data covers both NATA and JEE Paper 2 B.Arch aspirants. Most colleges accept both exam scores, and our tools reflect that. Where NATA-specific logic applies (like the score formula), it is clearly indicated.',
  },
  {
    question: 'Can I use these tools on my phone?',
    answer:
      'Yes, all tools are mobile-friendly and designed to work on any device. The interface adapts to your screen size, so you get the same experience whether you are on a phone, tablet, or desktop.',
  },
];

const TRUST_POINTS = [
  {
    label: '100% Free',
    desc: 'No hidden charges, no credit card, no sign-up required',
  },
  {
    label: 'Real Data',
    desc: 'Built on actual cutoff data from 500+ colleges across India',
  },
  {
    label: 'Updated Regularly',
    desc: 'Refreshed after every counselling round and exam cycle',
  },
  {
    label: 'Free to try',
    desc: 'Every tool works before you sign in',
  },
];

const CATEGORIES: { label: string; key: ToolConfig['category'] }[] = [
  { label: 'NATA Preparation', key: 'nata' },
  { label: 'Counseling and Admission', key: 'counseling' },
  { label: 'Analysis and Insights', key: 'insights' },
];

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Free NATA and B.Arch Admission Tools 2026',
    description:
      '10+ free tools for NATA and JEE Paper 2 B.Arch aspirants. Calculate cutoffs, predict colleges, estimate rank, find exam centers, and plan your architecture career.',
    keywords:
      'NATA tools, NATA preparation tools, B.Arch admission tools, NATA calculator, architecture entrance tools, free NATA tools 2026',
    alternates: buildAlternates(locale, '/tools'),
    openGraph: {
      title: 'Free NATA and B.Arch Admission Tools 2026',
      description: '10+ free tools for architecture entrance aspirants.',
      url: locale === 'en' ? `${baseUrl}/tools` : `${baseUrl}/${locale}/tools`,
      type: 'website',
    },
  };
}

export default function ToolsHubPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Free Tools', url: `${baseUrl}/tools` },
  ]);
  const faqSchema = generateFAQSchema(HUB_FAQS);

  const groups = CATEGORIES.map(({ label, key }) => ({
    key,
    label,
    items: ALL_TOOLS.filter((tool) => tool.category === key).map((tool) => ({
      href: `/tools/${tool.slug}`,
      title: tool.title,
      desc: tool.metaDescription,
      icon: toolIcon(tool.slug),
      badge: 'Free',
      keywords: tool.keywords.join(' '),
    })),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      <JsonLd data={[breadcrumbSchema, faqSchema]} />

      <HubIndex
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Free Tools' }]}
        eyebrow="Free tools · Part of aiArchitek"
        title="Free NATA and B.Arch Admission Tools 2026"
        lede="Everything you need for your architecture entrance journey, from score calculation to college selection."
        intro={
          <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.6, color: t.paperSubtle }}>
            These tools are part of{' '}
            <Link href="/aiarchitek" style={{ color: t.paper, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
              aiArchitek
            </Link>
            , our AI-powered NATA preparation platform.
          </Typography>
        }
        searchPlaceholder="Find a tool, e.g. cutoff, predictor, resizer"
        allLabel="All tools"
        countNoun="tools"
        cardCta="Try now"
        groups={groups}
      >
        <Section id="why-tools" tone="white" py={{ xs: 7, md: 8 }} gap={3} header={{ title: 'Why Use Our Tools', align: 'start', size: 'article' }}>
          <CheckList variant="ruled" columnMin={240} items={TRUST_POINTS.map(({ label, desc }) => ({ title: label, body: desc }))} />
        </Section>

        <Section id="faq" tone="light" width="narrow" header={{ eyebrow: 'Questions', title: 'Frequently Asked Questions' }}>
          <FaqList items={HUB_FAQS} />
        </Section>

        <CtaBand
          title="Start Your Architecture Journey"
          lede="Use our tools to plan your path and join thousands of students who qualified their dream architecture college."
          actions={
            <>
              <CtaButton href="/apply">Apply for Coaching</CtaButton>
              <CtaButton variant="link" href="/courses">
                Explore Courses
              </CtaButton>
            </>
          }
        />
      </HubIndex>
    </>
  );
}
