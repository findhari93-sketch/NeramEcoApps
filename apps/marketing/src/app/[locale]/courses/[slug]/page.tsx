import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  generateBreadcrumbSchema,
  generateCourseSchema,
} from '@/lib/seo/schemas';
import CourseDetailContent, {
  coursesData,
} from '@/components/CourseDetailContent';

const baseUrl = 'https://neramclasses.com';

// Generate static params for all known course slugs
export function generateStaticParams() {
  return Object.keys(coursesData).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}): Promise<Metadata> {
  const course = coursesData[slug];

  if (!course) {
    return {
      title: 'Course Not Found - Neram Classes',
      description: 'The course you are looking for could not be found.',
    };
  }

  const title = `${course.title} | Neram Classes`;
  const description = course.longDescription
    ? course.longDescription.slice(0, 160)
    : course.description;

  return {
    title,
    description,
    keywords: `${course.title}, ${course.category}, NATA coaching, architecture entrance, Neram Classes`,
    alternates: {
      canonical: `${baseUrl}/${locale}/courses/${slug}`,
      languages: {
        en: `${baseUrl}/en/courses/${slug}`,
        ta: `${baseUrl}/ta/courses/${slug}`,
        hi: `${baseUrl}/hi/courses/${slug}`,
        kn: `${baseUrl}/kn/courses/${slug}`,
        ml: `${baseUrl}/ml/courses/${slug}`,
        'x-default': `${baseUrl}/en/courses/${slug}`,
      },
    },
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/courses/${slug}`,
      type: 'website',
    },
  };
}

export default function CourseDetailPage({
  params: { locale, slug },
}: {
  params: { locale: string; slug: string };
}) {
  setRequestLocale(locale);

  const course = coursesData[slug];

  // Build JSON-LD only if the course exists
  const jsonLdData = course
    ? [
        generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Courses', url: `${baseUrl}/en/courses` },
          {
            name: course.title,
            url: `${baseUrl}/en/courses/${slug}`,
          },
        ]),
        generateCourseSchema({
          name: course.title,
          description: course.description,
          url: `${baseUrl}/en/courses/${slug}`,
          duration: course.duration,
          price: course.price
            ? parseInt(course.price.replace(/,/g, ''), 10)
            : undefined,
        }),
      ]
    : [];

  return (
    <>
      {jsonLdData.length > 0 && <JsonLd data={jsonLdData} />}
      <CourseDetailContent slug={slug} locale={locale} />
    </>
  );
}
