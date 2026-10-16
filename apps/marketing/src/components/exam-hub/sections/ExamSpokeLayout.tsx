import type { ReactNode } from 'react';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { CtaBand, CtaButton, GuideArticle } from '@/design-system';
import { examGuideNav, getExamGuide } from '@/components/exam-hub/examGuides';

export interface SpokeRelated {
  label: string;
  href: string;
}

interface ExamSpokeLayoutProps {
  examName: string;
  examShortName: string;
  examHubHref: string;
  /** Ignored since the design-system move; kept so existing pages compile. */
  examColor?: 'primary' | 'secondary';
  topicTitle: string;
  topicSubtitle: string;
  baseUrl?: string;
  related?: SpokeRelated[];
  /** This page's folder under the hub (e.g. 'syllabus'); marks it current in the guide rail. */
  spokeSlug?: string;
  children: ReactNode;
}

/**
 * T2 "Exam guide article" for exam-hub spokes (AAT 2026, PGETA 2026):
 * white DocHeader, the hub's guide rail, the article column, "Also read",
 * a link back to the hub, then the dark closing CtaBand.
 */
export default function ExamSpokeLayout({
  examShortName,
  examHubHref,
  topicTitle,
  topicSubtitle,
  baseUrl = 'https://neramclasses.com',
  related = [],
  spokeSlug,
  children,
}: ExamSpokeLayoutProps) {
  const breadcrumbSchema = generateBreadcrumbSchema([
    { name: 'Home', url: baseUrl },
    { name: 'Exam Hub', url: `${baseUrl}${examHubHref}` },
    { name: examShortName, url: `${baseUrl}${examHubHref}` },
    { name: topicTitle },
  ]);

  const guide = getExamGuide(examHubHref);

  return (
    <>
      <JsonLd data={breadcrumbSchema} />

      <GuideArticle
        breadcrumb={[
          { name: 'Home', href: '/' },
          { name: 'Exam Hub' },
          { name: examShortName, href: examHubHref },
          { name: topicTitle },
        ]}
        eyebrow={`${examShortName} · Exam guide`}
        title={topicTitle}
        lede={topicSubtitle}
        nav={examGuideNav(examHubHref, spokeSlug)}
        related={related.map((r) => ({ label: r.label, href: r.href }))}
        back={{ label: `Back to ${examShortName} hub`, href: examHubHref }}
      >
        {children}
      </GuideArticle>

      {guide && (
        <CtaBand
          title={guide.cta.title}
          lede={guide.cta.lede}
          actions={
            <>
              <CtaButton href={guide.cta.primary.href}>{guide.cta.primary.label}</CtaButton>
              <CtaButton variant="link" href={guide.cta.secondary.href} external={guide.cta.secondary.external}>
                {guide.cta.secondary.label}
              </CtaButton>
            </>
          }
        />
      )}
    </>
  );
}
