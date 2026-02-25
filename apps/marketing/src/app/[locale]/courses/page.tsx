import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import CoursesPageContent from '@/components/CoursesPageContent';

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
    alternates: {
      canonical: `${baseUrl}/${locale}/courses`,
      languages: {
        en: `${baseUrl}/en/courses`,
        ta: `${baseUrl}/ta/courses`,
        hi: `${baseUrl}/hi/courses`,
        kn: `${baseUrl}/kn/courses`,
        ml: `${baseUrl}/ml/courses`,
        'x-default': `${baseUrl}/en/courses`,
      },
    },
    openGraph: {
      title: 'NATA & Architecture Entrance Courses - Neram Classes',
      description:
        'Explore our comprehensive NATA coaching, JEE Paper 2, and Revit Architecture courses. Expert faculty, flexible programs.',
      type: 'website',
      url: `${baseUrl}/${locale}/courses`,
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
          { name: 'Courses', url: `${baseUrl}/en/courses` },
        ])}
      />
      <CoursesPageContent />
    </>
  );
}
