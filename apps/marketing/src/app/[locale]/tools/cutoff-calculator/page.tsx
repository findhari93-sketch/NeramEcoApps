import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
} from '@/lib/seo/schemas';
import CutoffCalculatorContent from '@/components/CutoffCalculatorContent';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA Cutoff Calculator 2026 - Check Your Score & College Chances',
    description:
      'Free NATA cutoff calculator. Enter your section scores to calculate total marks, percentile, and check admission chances at top architecture colleges across India.',
    keywords:
      'NATA cutoff calculator, NATA score calculator, NATA percentile calculator, architecture college cutoff, NATA 2026 cutoff',
    alternates: {
      canonical: `${baseUrl}/${locale}/tools/cutoff-calculator`,
      languages: {
        en: `${baseUrl}/en/tools/cutoff-calculator`,
        ta: `${baseUrl}/ta/tools/cutoff-calculator`,
        hi: `${baseUrl}/hi/tools/cutoff-calculator`,
        kn: `${baseUrl}/kn/tools/cutoff-calculator`,
        ml: `${baseUrl}/ml/tools/cutoff-calculator`,
        'x-default': `${baseUrl}/en/tools/cutoff-calculator`,
      },
    },
    openGraph: {
      title: 'NATA Cutoff Calculator 2026 - Check Your Score & College Chances',
      description:
        'Free NATA cutoff calculator. Enter your section scores to calculate total marks, percentile, and check admission chances at top architecture colleges.',
      url: `${baseUrl}/${locale}/tools/cutoff-calculator`,
      type: 'website',
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
            { name: 'Tools', url: `${baseUrl}/en/tools` },
            {
              name: 'Cutoff Calculator',
              url: `${baseUrl}/en/tools/cutoff-calculator`,
            },
          ]),
          generateWebApplicationSchema({
            name: 'NATA Cutoff Calculator',
            description:
              'Free NATA cutoff calculator to estimate your rank and check admission chances at top architecture colleges across India.',
            url: `${baseUrl}/en/tools/cutoff-calculator`,
            applicationCategory: 'EducationalApplication',
          }),
        ]}
      />
      <CutoffCalculatorContent />
    </>
  );
}
