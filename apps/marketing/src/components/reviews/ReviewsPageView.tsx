/**
 * /reviews, /reviews/nata and /reviews/jee (and their /page/N pages).
 *
 * The site's source of truth for reviews, on the T8 social-proof template: a
 * dark PageHero with real counts and exam tabs, a sticky filter bar, then the
 * facts block and a masonry review wall on the light ground, how reviews are
 * collected, and a closing CtaBand. Server component. Mobile first: one review
 * column at 375px, up to three from ~960px. Pagination is plain links so every
 * page is a cacheable ISR page and works without JavaScript; the year, city,
 * mode and college filters are a small client layer over the edge-cached
 * search API.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Box } from '@neram/ui';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';
import { getReviewSummary } from '@/lib/review-stats';
import { loadAllPublishedReviews, loadCentreProfiles, loadReviewsPage } from '@/lib/reviews/data';
import { buildReviewsPageJsonLd } from '@/lib/reviews/json-ld';
import {
  localePath,
  reviewsPath,
  shouldIndexReviewsPage,
  totalPages,
  type ReviewExam,
} from '@/lib/reviews/rules';
import {
  combinedGoogleRating,
  facetOptions,
  factsSentence,
  quotableGoogleRatings,
  sameAsUrls,
  topColleges,
} from '@/lib/reviews/hub';
import { CheckList, CtaBand, CtaButton, EmptyState, PageHero, ReviewWall, Section, type StatItem } from '@/design-system';
import ReviewHubPanel from './ReviewHubPanel';
import ReviewFilters, { ExamTabs } from './ReviewFilters';
import ReviewWallCard from './ReviewWallCard';

const TITLE_KEY = { all: 'titleAll', nata: 'titleNata', jee: 'titleJee' } as const;
const META_TITLE_KEY = { all: 'metaTitleAll', nata: 'metaTitleNata', jee: 'metaTitleJee' } as const;
const META_DESC_KEY = { all: 'metaDescriptionAll', nata: 'metaDescriptionNata', jee: 'metaDescriptionJee' } as const;
const INTRO_KEY = { all: 'introAll', nata: 'introNata', jee: 'introJee' } as const;

function absoluteUrl(locale: string, path: string) {
  return `${BASE_URL}${localePath(locale, path) === '/' ? '' : localePath(locale, path)}`;
}

export async function buildReviewsMetadata(locale: string, exam: ReviewExam, page: number): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'reviews' });
  const summary = await getReviewSummary(exam);
  // Out-of-range /page/N: 404 here, before the page streams (a notFound() in
  // the page body after the loading skeleton has flushed would answer 200).
  if (page > 1 && page > totalPages(summary?.reviewCount ?? 0)) notFound();
  const suffix = page > 1 ? ` (${t('pageSuffix', { page })})` : '';
  const title = `${t(META_TITLE_KEY[exam])}${suffix}`;
  const description = t(META_DESC_KEY[exam]);
  const path = reviewsPath(exam, page);
  // Indexed only in English (review text is mostly English) and only once the
  // rating is backed by enough published ratings. Otherwise noindex, follow.
  const indexable = locale === 'en' && shouldIndexReviewsPage(summary);
  return {
    title,
    description,
    alternates: buildAlternates(locale, path),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      type: 'website',
      url: absoluteUrl(locale, path),
      images: [{ url: buildOgImage(t(META_TITLE_KEY[exam]), undefined, 'default'), width: 1200, height: 630 }],
    },
  };
}

export default async function ReviewsPageView({ locale, exam, page }: { locale: string; exam: ReviewExam; page: number }) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'reviews' });

  const [summary, pageData, allPublished, profiles] = await Promise.all([
    getReviewSummary(exam),
    loadReviewsPage(exam, page, locale),
    loadAllPublishedReviews(locale),
    loadCentreProfiles(),
  ]);
  const inScope = allPublished.filter((r) =>
    exam === 'nata' ? r.examType === 'NATA' || r.examType === 'BOTH' : exam === 'jee' ? r.examType === 'JEE_PAPER_2' || r.examType === 'BOTH' : true,
  );
  const googleRatings = quotableGoogleRatings(profiles.centres);
  const sentence = factsSentence({
    publishedCount: inScope.length,
    verifiedCount: inScope.filter((r) => r.isVerified).length,
    google: combinedGoogleRating(googleRatings),
    colleges: topColleges(inScope),
  });
  const sameAs = sameAsUrls([...profiles.centres.map((c) => c.google_business_url), ...profiles.directoryUrls]);

  const pages = totalPages(pageData.total);
  // A /page/N beyond the last page is not a page.
  if (page > 1 && page > pages) notFound();

  const pageUrl = absoluteUrl(locale, reviewsPath(exam, page));
  // No AggregateRating: staff choose what is published, so an average of it is
  // self-serving (and Google shows no stars for it). sameAs ties the Google
  // profiles and directory listings to this organization for answer engines.
  const reviewsJsonLd = buildReviewsPageJsonLd({ reviews: pageData.reviews, aggregateRating: null, inLanguage: locale, sameAs });

  const crumbs = [
    { name: t('breadcrumbHome'), url: absoluteUrl(locale, '/'), href: '/' },
    { name: t('breadcrumbReviews'), url: absoluteUrl(locale, '/reviews'), href: '/reviews' },
    ...(exam !== 'all'
      ? [{ name: t(exam === 'nata' ? 'filterNata' : 'filterJee'), url: absoluteUrl(locale, reviewsPath(exam)), href: reviewsPath(exam) }]
      : []),
  ];
  if (page > 1) crumbs.push({ name: t('pageSuffix', { page }), url: pageUrl, href: reviewsPath(exam, page) });

  const modes = { online: t('modeOnline'), hybrid: t('modeHybrid'), offline: t('modeOffline') };
  // Templates for the cards: next-intl fills {college} with the literal
  // placeholder, and the card fills it per review (server and client alike).
  const cardLabels = {
    joinedTemplate: t('joined', { college: '{college}' }),
    featured: t('featured'),
    verified: t('verifiedLabel'),
    modes,
  };
  const filterLabels = {
    heading: t('filterHeading'),
    year: t('filterYear'),
    city: t('filterCity'),
    mode: t('filterMode'),
    college: t('filterCollege'),
    any: t('filterAny'),
    clear: t('filterClear'),
    matches: t('filterMatches', { count: '{count}' }),
    matchesOne: t('filterMatchesOne'),
    noMatchTitle: t('filterNoMatchTitle'),
    noMatchBody: t('filterNoMatchBody'),
    listTitle: t('listTitle'),
    card: cardLabels,
  };

  const filters: Array<{ exam: ReviewExam; label: string }> = [
    { exam: 'all', label: t('filterAll') },
    { exam: 'nata', label: t('filterNata') },
    { exam: 'jee', label: t('filterJee') },
  ];

  // Hero numbers: only what the data gives. The published count is the same
  // number the facts block states; verified and Google appear only when present.
  const publishedCount = summary?.reviewCount ?? inScope.length;
  const verifiedCount = inScope.filter((r) => r.isVerified).length;
  const google = combinedGoogleRating(googleRatings);
  const stats: StatItem[] = [
    { value: publishedCount.toLocaleString('en-IN'), label: t('breadcrumbReviews') },
    ...(verifiedCount > 0 ? [{ value: verifiedCount.toLocaleString('en-IN'), label: t('verifiedLabel') }] : []),
    ...(google ? [{ value: google.rating.toFixed(1), label: t('googleTitle') }] : []),
  ];

  // Design-system links are locale-aware, so crumb hrefs carry no locale prefix.
  const breadcrumb = crumbs.map(({ name, href }, i) => ({ name, href: i === crumbs.length - 1 ? undefined : href }));

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema(crumbs.map(({ name, url }) => ({ name, url })))} />
      {reviewsJsonLd && <JsonLd data={reviewsJsonLd} />}

      <PageHero
        breadcrumb={breadcrumb}
        eyebrow={t('breadcrumbReviews')}
        title={t(TITLE_KEY[exam])}
        lede={t(INTRO_KEY[exam])}
        stats={stats}
        bottom={
          <ExamTabs
            label={t('filterLabel')}
            tabs={filters.map((f) => ({ href: reviewsPath(f.exam), label: f.label, active: f.exam === exam }))}
          />
        }
      />

      <ReviewFilters
        exam={exam}
        locale={locale}
        facets={page === 1 ? facetOptions(inScope) : facetOptions([])}
        labels={filterLabels}
        lead={
          <ReviewHubPanel
            sentence={sentence}
            google={googleRatings}
            labels={{
              factsTitle: t('factsTitle'),
              reviewCount: t('reviewCount', { count: publishedCount }),
              googleTitle: t('googleTitle'),
              googleIntro: t('googleIntro'),
              googleRating: (rating: string) => t('googleRating', { rating }),
              googleReviews: (count: number) => t('googleReviews', { count }),
              googleOpen: t('googleOpen'),
            }}
          />
        }
        pagination={
          pages > 1
            ? {
                label: t('pagination'),
                pageOf: t('pageOf', { page, total: pages }),
                prevHref: page > 1 ? reviewsPath(exam, page - 1) : null,
                nextHref: page < pages ? reviewsPath(exam, page + 1) : null,
                prevLabel: t('previous'),
                nextLabel: t('next'),
              }
            : null
        }
      >
        {pageData.reviews.length === 0 ? (
          <EmptyState
            icon={<VerifiedOutlinedIcon />}
            title={t('emptyTitle')}
            titleAs="h3"
            body={t('emptyBody')}
            action={
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
                <CtaButton href="/demo-class">{t('ctaDemo')}</CtaButton>
                <CtaButton variant="outline" href="/learner-stories">
                  {t('ctaStories')}
                </CtaButton>
              </Box>
            }
          />
        ) : (
          <ReviewWall>
            {pageData.reviews.map((review) => (
              <ReviewWallCard key={review.id} review={review} labels={cardLabels} />
            ))}
          </ReviewWall>
        )}
      </ReviewFilters>

      <Section tone="white" width="narrow" id="how-collected" header={{ title: t('howTitle'), align: 'start', size: 'article' }} gap={3}>
        <CheckList items={[t('how1'), t('how2'), t('how3')]} columnMin={240} />
      </Section>

      <CtaBand
        eyebrow={null}
        title={t('moreTitle')}
        actions={
          <>
            <CtaButton href="/demo-class">{t('ctaDemo')}</CtaButton>
            <CtaButton variant="link" href="/learner-stories">
              {t('ctaStories')}
            </CtaButton>
            <CtaButton variant="link" href="/achievements">
              {t('ctaResults')}
            </CtaButton>
          </>
        }
      />
    </>
  );
}
