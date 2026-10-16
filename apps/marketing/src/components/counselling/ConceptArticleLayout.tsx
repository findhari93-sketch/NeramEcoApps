import type { ReactNode } from 'react';
import { createElement } from 'react';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import CompareArrowsOutlinedIcon from '@mui/icons-material/CompareArrowsOutlined';
import ArchitectureOutlinedIcon from '@mui/icons-material/ArchitectureOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PercentOutlinedIcon from '@mui/icons-material/PercentOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';

import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema, generateFAQSchema, generateArticleSchema } from '@/lib/seo/schemas';
import { GuidePills } from '@/components/exam-hub/sections/GuideBlocks';
import { ArticleSection, CtaBand, CtaButton, FaqList, GuideArticle, type GuideNavProps } from '@/design-system';

const baseUrl = 'https://neramclasses.com';

/** The counselling concept articles (the guide rail and "Also read"). */
export const COUNSELLING_CONCEPTS = [
  {
    slug: 'freeze-float-slide',
    title: 'Freeze vs Float vs Slide',
    summary: 'JoSAA decision matrix with worked examples. Should you freeze your seat or try for higher preference?',
    Icon: AccountTreeOutlinedIcon,
  },
  {
    slug: 'josaa-vs-csab',
    title: 'JoSAA vs CSAB',
    summary: 'Three CSAB verticals (Special, NEUT, Supernumerary) and the rule that cancels your JoSAA seat.',
    Icon: CompareArrowsOutlinedIcon,
  },
  {
    slug: 'aat-explained',
    title: 'AAT Explained',
    summary: 'AAT is Pass or Fail. Why JEE Advanced AIR drives final IIT B.Arch allotment, not AAT score.',
    Icon: ArchitectureOutlinedIcon,
  },
  {
    slug: 'nata-vs-jee-paper-2',
    title: 'NATA vs JEE Paper 2',
    summary: 'Exam comparison, state acceptance map, and dual-attempt strategy for maximum coverage.',
    Icon: QuizOutlinedIcon,
  },
  {
    slug: 'eligibility-45-vs-50-rule',
    title: '45% vs 50% PCM Rule',
    summary: 'COA 2024 norm clarifies 45% PCM. Some states still apply 50%. Diploma route works too.',
    Icon: PercentOutlinedIcon,
  },
] as const;

function conceptNav(slug: string): GuideNavProps {
  return {
    title: 'Counselling concepts',
    current: `/counseling/concepts/${slug}`,
    items: [
      { label: 'All counsellings', href: '/counseling', icon: createElement(HubOutlinedIcon) },
      ...COUNSELLING_CONCEPTS.map((c) => ({
        label: c.title,
        href: `/counseling/concepts/${c.slug}`,
        icon: createElement(c.Icon),
      })),
    ],
  };
}

export interface ConceptArticleProps {
  slug: string;
  title: string;
  subtitle: string;
  publishedAt: string;
  modifiedAt?: string;
  readingMinutes?: number;
  tags?: string[];
  faqs: Array<{ question: string; answer: string }>;
  locale: string;
  children: ReactNode;
}

const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * T2 article for counselling concept pages: white DocHeader with tag pills,
 * the concepts rail, the article column, Quick FAQs, "Also read", then the
 * dark closing CtaBand. Keeps the Breadcrumb, Article and FAQPage JSON-LD.
 */
export default function ConceptArticleLayout({
  slug,
  title,
  subtitle,
  publishedAt,
  modifiedAt,
  readingMinutes = 5,
  tags = [],
  faqs,
  locale,
  children,
}: ConceptArticleProps) {
  const localePrefix = locale === 'en' ? '' : `/${locale}`;
  const url = `${baseUrl}${localePrefix}/counseling/concepts/${slug}`;

  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: locale === 'en' ? baseUrl : `${baseUrl}/${locale}` },
    { name: 'Counselling', url: `${baseUrl}${localePrefix}/counseling` },
    { name: title, url },
  ]);

  const articleSchema = generateArticleSchema({
    title,
    description: subtitle,
    url,
    publishedAt,
    modifiedAt: modifiedAt ?? publishedAt,
    author: 'Neram Classes',
    category: 'B.Arch Counselling Concepts',
  });

  const faqSchema = faqs.length > 0 ? generateFAQSchema(faqs) : null;

  const verified =
    modifiedAt && modifiedAt !== publishedAt
      ? `Published ${fmt(publishedAt)} · Updated ${fmt(modifiedAt)}`
      : `Published ${fmt(publishedAt)}`;

  const related = COUNSELLING_CONCEPTS.filter((c) => c.slug !== slug).map((c) => ({
    label: c.title,
    href: `/counseling/concepts/${c.slug}`,
    desc: c.summary,
  }));

  return (
    <>
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={articleSchema} />
      {faqSchema && <JsonLd data={faqSchema} />}

      <GuideArticle
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Counselling', href: '/counseling' }, { name: title }]}
        eyebrow={`Counselling concept · ${readingMinutes} min read`}
        title={title}
        lede={subtitle}
        verified={verified}
        headerExtra={tags.length > 0 ? <GuidePills label="Topics" items={tags} /> : undefined}
        nav={conceptNav(slug)}
        related={related}
        back={{ label: 'Back to Counselling', href: '/counseling' }}
      >
        {children}

        {faqs.length > 0 && (
          <ArticleSection id="faq" title="Quick FAQs">
            <FaqList items={faqs} defaultOpen={-1} />
          </ArticleSection>
        )}
      </GuideArticle>

      <CtaBand
        title="Need help with your B.Arch counselling decision?"
        lede="Talk to a Neram counsellor about your specific situation. Free, no obligation."
        actions={
          <>
            <CtaButton href="/apply">Get a free counselling call</CtaButton>
            <CtaButton variant="link" href="/counseling">
              Browse all 28 counsellings
            </CtaButton>
          </>
        }
      />
    </>
  );
}
