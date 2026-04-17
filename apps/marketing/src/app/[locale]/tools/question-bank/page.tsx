import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateWebApplicationSchema,
  generateFAQSchema,
} from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import ToolLandingPage from '@/components/tools/ToolLandingPage';
import { questionBankConfig } from '@/lib/tools/configs/question-bank';

const baseUrl = 'https://neramclasses.com';
const config = questionBankConfig;

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

export default function QuestionBankPage({
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
          generateFAQSchema(config.faqs),
        ]}
      />
      <ToolLandingPage config={config} />
    </>
  );
}
