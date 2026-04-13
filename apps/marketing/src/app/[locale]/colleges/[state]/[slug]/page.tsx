import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCollegeDetailMetadata } from '@/lib/college-hub/seo';
import {
  generateCollegeOrUniversitySchema,
  generateCollegeBreadcrumbSchema,
  generateCollegeFAQSchema,
} from '@/lib/college-hub/schema-markup';
import { getCollegeBySlug, getAllCollegeSlugs, getSimilarColleges } from '@/lib/college-hub/queries';
import CollegePageTemplate from '@/components/college-hub/CollegePageTemplate';

export const revalidate = 3600;

type Props = { params: { locale: string; state: string; slug: string } };

export async function generateStaticParams() {
  const slugs = await getAllCollegeSlugs();
  const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
  return locales.flatMap((locale) =>
    slugs.map(({ state, slug }) => ({ locale, state, slug }))
  );
}

export async function generateMetadata({ params: { locale, slug } }: Props): Promise<Metadata> {
  const college = await getCollegeBySlug(slug);
  if (!college) return { title: 'College Not Found' };
  return generateCollegeDetailMetadata(locale, college);
}

export default async function CollegeDetailPage({ params: { locale, state, slug } }: Props) {
  setRequestLocale(locale);

  const college = await getCollegeBySlug(slug);
  if (!college) notFound();

  const similarColleges = await getSimilarColleges({
    id: college.id,
    state_slug: college.state_slug,
    type: college.type,
    annual_fee_approx: college.annual_fee_approx,
  });

  const collegeSchema = generateCollegeOrUniversitySchema(college) as Record<string, unknown>;
  const breadcrumbSchema = generateCollegeBreadcrumbSchema(college) as Record<string, unknown>;
  const faqSchema = generateCollegeFAQSchema(college) as Record<string, unknown>;

  return (
    <>
      <JsonLd data={collegeSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      <CollegePageTemplate college={college} similarColleges={similarColleges} />
    </>
  );
}
