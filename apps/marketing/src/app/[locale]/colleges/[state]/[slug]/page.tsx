import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import dynamic from 'next/dynamic';
import { JsonLd } from '@/components/seo/JsonLd';

const PageViewTracker = dynamic(
  () => import('@/components/college-hub/PageViewTracker'),
  { ssr: false }
);
import { generateCollegeDetailMetadata } from '@/lib/college-hub/seo';
import {
  generateCollegeOrUniversitySchema,
  generateCollegeBreadcrumbSchema,
  generateCollegeFAQSchema,
} from '@/lib/college-hub/schema-markup';
import { getCollegeBySlug, getAllCollegeSlugs, getSimilarColleges } from '@/lib/college-hub/queries';
import CollegePageTemplate from '@/components/college-hub/CollegePageTemplate';

// College fees, rankings and accreditation are seasonal data, not hourly data.
// This route is the largest prerendered surface on the site, so an hourly window
// here was the single biggest source of ISR writes on the account.
export const revalidate = 86400;

type Props = { params: { locale: string; state: string; slug: string } };

// English only. The college hub content is hardcoded English, so the ta/hi/kn/ml
// variants were 4/5 of a ~930 path prerender for duplicate content that
// next.config.js now marks noindex. dynamicParams defaults to true, so those URLs
// still resolve, they just render on demand instead of being built and then
// revalidated forever. Same tradeoff already documented in rankings/nirf/[collegeSlug].
export async function generateStaticParams() {
  try {
    const slugs = await getAllCollegeSlugs();
    return slugs.map(({ state, slug }) => ({ locale: 'en', state, slug }));
  } catch {
    return [];
  }
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
      <PageViewTracker collegeId={college.id} />
      <JsonLd data={collegeSchema} />
      <JsonLd data={breadcrumbSchema} />
      <JsonLd data={faqSchema} />
      <CollegePageTemplate college={college} similarColleges={similarColleges} />
    </>
  );
}
