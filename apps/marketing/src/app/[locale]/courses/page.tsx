import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import CoursesPageContent from '@/components/CoursesPageContent';

export const revalidate = 86400;

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'NATA & Architecture Entrance Courses - Neram Classes',
    description:
      'Explore our comprehensive NATA coaching, JEE Paper 2, and Revit Architecture courses. Year-long, crash course, and foundation programs with expert faculty.',
    keywords:
      'NATA courses, JEE Paper 2 course, architecture entrance courses, NATA coaching program, Revit training',
    alternates: buildAlternates(locale, '/courses'),
    openGraph: {
      title: 'NATA & Architecture Entrance Courses - Neram Classes',
      description:
        'Explore our comprehensive NATA coaching, JEE Paper 2, and Revit Architecture courses. Expert faculty, flexible programs.',
      type: 'website',
      url: locale === 'en' ? `${baseUrl}/courses` : `${baseUrl}/${locale}/courses`,
    },
  };
}

export default function CoursesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Courses', url: `${baseUrl}/courses` },
        ])}
      />
      <CoursesPageContent />
    </>
  );
}
