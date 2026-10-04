import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import AlumniPageContent from '@/components/AlumniPageContent';
import { loadAlumniStories } from '@/lib/reviews/data';
import { localePath } from '@/lib/reviews/rules';
import ClientIntl from '@/components/i18n/ClientIntl';

// ISR: the stories are published reviews, re-read daily (admin edits purge the
// "reviews" cache tag through /api/revalidate).
export const revalidate = 86400;


const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }): Promise<Metadata> {
  return {
    title: 'Student Success Stories - Neram Classes NATA Toppers & Alumni',
    description: 'Meet our successful NATA toppers and alumni placed in top architecture colleges across India. Read published reviews from students who told us the college they joined.',
    keywords: 'NATA toppers, architecture college alumni, NATA success stories, Neram Classes results, architecture entrance results',
    alternates: {
      canonical: locale === 'en' ? `${baseUrl}/alumni` : `${baseUrl}/${locale}/alumni`,
    },
  };
}

export default async function AlumniPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const stories = await loadAlumniStories(locale);
  return (
    <>
      <JsonLd data={generateBreadcrumbSchema([
        { name: 'Home', url: baseUrl },
        { name: 'Alumni', url: `${baseUrl}/alumni` },
      ])} />
      <ClientIntl locale={locale} namespaces={['alumniStories', 'reviews']}><AlumniPageContent stories={stories} reviewsHref={localePath(locale, '/reviews')} /></ClientIntl>
    </>
  );
}
