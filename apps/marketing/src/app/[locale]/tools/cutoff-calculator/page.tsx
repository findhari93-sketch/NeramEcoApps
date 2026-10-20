import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
  generateHowToSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import ToolLandingPage from '@/components/tools/ToolLandingPage';
import { cutoffCalculatorConfig } from '@/lib/tools/configs/cutoff-calculator';

// The closing-marks table reads the latest allotments; refresh it daily.
export const revalidate = 86400;

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
      url:
        locale === 'en'
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
          generateHowToSchema({
            name: 'How to calculate your NATA cutoff out of 400',
            description:
              'Convert your 12th marks to a score out of 200, add your best NATA score out of 200, and check the 45% rule.',
            totalTime: 'PT2M',
            steps: config.steps.map((s) => ({ name: s.title, text: s.desc })),
          }),
          generateFAQSchema(config.faqs),
        ]}
      />
      <ToolLandingPage config={config} />
    </>
  );
}
