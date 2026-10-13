import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { JsonLd } from '@/components/seo/JsonLd';

const PageViewTracker = dynamic(
  () => import('@/components/college-hub/PageViewTracker'),
  { ssr: false }
);
import {
  TITLE_SUFFIX,
  buildCollegeDescription,
  buildCollegeTitle,
  collegeNotFoundMetadata,
  generateCollegeDetailMetadata,
} from '@/lib/college-hub/seo';
import { buildCollegeDetailGraph, resolveCollegeFaqs } from '@/lib/college-hub/schema-markup';
import {
  getCollegeBySlug,
  getAllCollegeSlugs,
  getSimilarColleges,
  getCollegeFaqs,
  getCollegeReviewsFirstPage,
  getCollegeCommentsFirstPage,
  getActiveCities,
} from '@/lib/college-hub/queries';
import {
  buildCollegeBreadcrumbs,
  buildCollegeSummary,
  buildCutoffTables,
  buildInternalLinks,
  buildSources,
  formatIstDate,
  lastUpdatedIso,
  latestCutoffYear,
  localePrefix,
} from '@/lib/college-hub/detail-content';
import { collegeLastModified } from '@/lib/college-hub/sitemap-lastmod';
import { COUNSELING_LABELS, admissionYear } from '@/lib/college-hub/constants';
import { ROUTED_HUB_SLUGS } from '@/data/counselling-2026';
import { getState } from '@/data/geo';
import { EXAMS } from '@/lib/seo/exam-config';
import { citySegment, lookupCity } from '@/lib/seo/location-pages';
import CollegePageTemplate from '@/components/college-hub/CollegePageTemplate';
import type { CollegeDetail } from '@/lib/college-hub/types';

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
  if (!college) return collegeNotFoundMetadata();
  return generateCollegeDetailMetadata(locale, college);
}

/** NATA coaching page for the college's city, else its state, when one exists. */
function coachingPaths(college: CollegeDetail): { city: string | null; state: string | null } {
  let city: string | null = null;
  if (college.city_slug) {
    const found = lookupCity('nata', citySegment('nata', college.city_slug.toLowerCase()));
    if (found.kind === 'page') city = EXAMS.nata.cityPath(found.place.slug);
    else if (found.kind === 'redirect') city = found.to;
  }
  const state = college.state_slug && getState(college.state_slug) ? EXAMS.nata.statePath(college.state_slug) : null;
  return { city, state };
}

export default async function CollegeDetailPage({ params: { locale, state, slug } }: Props) {
  setRequestLocale(locale);

  const college = await getCollegeBySlug(slug);
  if (!college) notFound();

  // One URL per college: /colleges/<any-state>/<slug> goes to the real state.
  const canonicalState = college.state_slug ?? 'india';
  if (state !== canonicalState) {
    permanentRedirect(`${localePrefix(locale)}/colleges/${canonicalState}/${college.slug}`);
  }

  // All inside this ISR render (cached client, revalidated daily): no API routes.
  const [similarColleges, faqRows, initialReviews, initialComments, activeCities] = await Promise.all([
    getSimilarColleges({
      id: college.id,
      state_slug: college.state_slug,
      type: college.type,
      annual_fee_approx: college.annual_fee_approx,
    }),
    getCollegeFaqs(college.id),
    getCollegeReviewsFirstPage(college.id),
    getCollegeCommentsFirstPage(college.id),
    getActiveCities().catch(() => []),
  ]);

  const year = admissionYear();
  const faqs = resolveCollegeFaqs(faqRows, { ...college, hasFeeBreakdown: college.fees.length > 0 });
  const cutoffTables = buildCutoffTables(college.cutoffs, college.counseling_systems);
  const summary = buildCollegeSummary(college);
  const sources = buildSources(college, cutoffTables.map((t) => t.system));
  const updatedIso = lastUpdatedIso(college);
  const crumbs = buildCollegeBreadcrumbs(college);
  const prefix = localePrefix(locale);
  const coaching = coachingPaths(college);
  const links = buildInternalLinks(college, {
    locale,
    similar: similarColleges,
    cityListingSlugs: new Set(activeCities.map((c) => c.city_slug)),
    routedGuideSlugs: new Set(ROUTED_HUB_SLUGS),
    counselingListingKeys: new Set(Object.keys(COUNSELING_LABELS)),
    cityCoachingPath: coaching.city,
    stateCoachingPath: coaching.state,
  });

  const graph = buildCollegeDetailGraph({
    college,
    faqs,
    breadcrumbs: crumbs,
    reviews: initialReviews,
    pageTitle: `${buildCollegeTitle(college, year)}${TITLE_SUFFIX}`,
    description: buildCollegeDescription(college),
    dateModified: collegeLastModified(college).toISOString(),
  });

  return (
    <>
      <PageViewTracker collegeId={college.id} />
      <JsonLd data={graph} />
      <CollegePageTemplate
        college={college}
        similarColleges={similarColleges}
        content={{
          summary,
          faqs,
          cutoffTables,
          cutoffYear: latestCutoffYear(cutoffTables),
          sources,
          updated: updatedIso ? { iso: updatedIso.slice(0, 10), label: formatIstDate(updatedIso) } : null,
          breadcrumbs: crumbs.map((c, i) => ({
            name: c.name,
            href: i === crumbs.length - 1 ? undefined : `${prefix}${c.path === '/' ? '' : c.path}` || '/',
          })),
          links,
          initialReviews,
          initialComments,
          admissionYear: year,
        }}
      />
    </>
  );
}
