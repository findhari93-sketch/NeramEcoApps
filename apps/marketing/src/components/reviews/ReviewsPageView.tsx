/**
 * /reviews, /reviews/nata and /reviews/jee (and their /page/N pages).
 *
 * Server component. Mobile first: one column at 375px, the rating summary above
 * the list, two review columns from 900px. Pagination is plain links so every
 * page is a cacheable ISR page and works without JavaScript.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Box, Button, Container, LinearProgress, Paper, Stack, Typography } from '@neram/ui';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates, buildOgImage } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';
import { getReviewSummary } from '@/lib/review-stats';
import { loadRatingDistribution, loadReviewsPage } from '@/lib/reviews/data';
import { buildReviewsPageJsonLd } from '@/lib/reviews/json-ld';
import {
  MIN_RATINGS_FOR_AGGREGATE,
  aggregateRatingFromSummary,
  hasEnoughRatings,
  localePath,
  reviewsPath,
  shouldIndexReviewsPage,
  totalPages,
  type ReviewExam,
  type ReviewSummary,
} from '@/lib/reviews/rules';
import { EmptyState, LinkButtons, ReviewCard, Stars, focusRing } from './ReviewParts';

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

function RatingSummaryCard({
  summary,
  distribution,
  t,
}: {
  summary: ReviewSummary | null;
  distribution: Array<{ stars: number; count: number }> | null;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const enough = hasEnoughRatings(summary);
  const max = distribution ? Math.max(1, ...distribution.map((d) => d.count)) : 1;
  return (
    <Paper component="section" aria-labelledby="rating-summary-title" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
      <Typography id="rating-summary-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 2 }}>
        {t('summaryTitle')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2.5, sm: 4 }} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Box sx={{ minWidth: { sm: 200 } }}>
          {enough ? (
            <>
              <Typography component="p" aria-hidden="true" sx={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1 }}>
                {summary.average.toFixed(1)}
              </Typography>
              <Stars rating={summary.average} label={t('averageOutOf', { average: summary.average.toFixed(1) })} size={24} />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('basedOn', { count: summary.ratingCount })}
              </Typography>
            </>
          ) : (
            <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
              {t('notEnoughRatings', { min: MIN_RATINGS_FOR_AGGREGATE, count: summary?.ratingCount ?? 0 })}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 600 }}>
            {t('reviewCount', { count: summary?.reviewCount ?? 0 })}
          </Typography>
        </Box>

        {distribution && distribution.some((d) => d.count > 0) && (
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography component="h3" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {t('distributionLabel')}
            </Typography>
            <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.75 }}>
              {distribution.map((d) => (
                <Box
                  component="li"
                  key={d.stars}
                  aria-label={t('starRowCount', { stars: d.stars, count: d.count })}
                  sx={{ display: 'grid', gridTemplateColumns: '64px 1fr 32px', alignItems: 'center', gap: 1 }}
                >
                  <Typography variant="body2" aria-hidden="true" sx={{ whiteSpace: 'nowrap' }}>
                    {t('starRow', { stars: d.stars })}
                  </Typography>
                  <LinearProgress
                    variant="determinate"
                    value={(d.count / max) * 100}
                    aria-hidden="true"
                    sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { bgcolor: 'warning.main', borderRadius: 4 } }}
                  />
                  <Typography variant="body2" aria-hidden="true" sx={{ textAlign: 'right' }}>
                    {d.count}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}

export default async function ReviewsPageView({ locale, exam, page }: { locale: string; exam: ReviewExam; page: number }) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'reviews' });

  const [summary, pageData, distribution] = await Promise.all([
    getReviewSummary(exam),
    loadReviewsPage(exam, page, locale),
    loadRatingDistribution(exam),
  ]);

  const pages = totalPages(pageData.total);
  // A /page/N beyond the last page is not a page.
  if (page > 1 && page > pages) notFound();

  const aggregateRating = aggregateRatingFromSummary(summary);
  const pageUrl = absoluteUrl(locale, reviewsPath(exam, page));
  const reviewsJsonLd = buildReviewsPageJsonLd({ reviews: pageData.reviews, aggregateRating, inLanguage: locale });

  const crumbs = [
    { name: t('breadcrumbHome'), url: absoluteUrl(locale, '/'), href: localePath(locale, '/') },
    { name: t('breadcrumbReviews'), url: absoluteUrl(locale, '/reviews'), href: localePath(locale, '/reviews') },
    ...(exam !== 'all'
      ? [{ name: t(exam === 'nata' ? 'filterNata' : 'filterJee'), url: absoluteUrl(locale, reviewsPath(exam)), href: localePath(locale, reviewsPath(exam)) }]
      : []),
  ];
  if (page > 1) crumbs.push({ name: t('pageSuffix', { page }), url: pageUrl, href: localePath(locale, reviewsPath(exam, page)) });

  const cardLabels = {
    stars: (rating: number) => t('starsLabel', { rating }),
    joined: (college: string) => t('joined', { college }),
    featured: t('featured'),
  };

  const filters: Array<{ exam: ReviewExam; label: string }> = [
    { exam: 'all', label: t('filterAll') },
    { exam: 'nata', label: t('filterNata') },
    { exam: 'jee', label: t('filterJee') },
  ];

  const more = [
    { href: localePath(locale, '/learner-stories'), label: t('ctaStories') },
    { href: localePath(locale, '/achievements'), label: t('ctaResults') },
    { href: localePath(locale, '/demo-class'), label: t('ctaDemo'), primary: true },
  ];

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema(crumbs.map(({ name, url }) => ({ name, url })))} />
      {reviewsJsonLd && <JsonLd data={reviewsJsonLd} />}

      <Box sx={{ bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
        <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 } }}>
          <Breadcrumbs items={crumbs.map(({ name, href }, i) => ({ name, href: i === crumbs.length - 1 ? undefined : href }))} />

          <Typography component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, lineHeight: 1.2, mb: 1.5 }}>
            {t(TITLE_KEY[exam])}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '1rem', lineHeight: 1.6, maxWidth: '65ch', mb: 3 }}>
            {t(INTRO_KEY[exam])}
          </Typography>

          <Box component="nav" aria-label={t('filterLabel')} sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {filters.map((f) => {
                const active = f.exam === exam;
                return (
                  <Button
                    key={f.exam}
                    component={Link}
                    href={localePath(locale, reviewsPath(f.exam))}
                    aria-current={active ? 'page' : undefined}
                    variant={active ? 'contained' : 'outlined'}
                    sx={{ minHeight: 48, borderRadius: 999, px: 2.5, textTransform: 'none', fontWeight: 600, ...focusRing }}
                  >
                    {f.label}
                  </Button>
                );
              })}
            </Stack>
          </Box>

          <Box sx={{ mb: { xs: 3, md: 4 } }}>
            <RatingSummaryCard summary={summary} distribution={distribution} t={t} />
          </Box>

          {pageData.reviews.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              actions={[
                { href: localePath(locale, '/learner-stories'), label: t('ctaStories') },
                { href: localePath(locale, '/demo-class'), label: t('ctaDemo'), primary: true },
              ]}
            />
          ) : (
            <Box component="section" aria-labelledby="reviews-list-title">
              <Typography id="reviews-list-title" component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700, mb: 2 }}>
                {t('listTitle')}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                {pageData.reviews.map((review) => (
                  <ReviewCard key={review.id} review={review} labels={cardLabels} />
                ))}
              </Box>

              {pages > 1 && (
                <Box
                  component="nav"
                  aria-label={t('pagination')}
                  sx={{ mt: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}
                >
                  {page > 1 ? (
                    <Button
                      component={Link}
                      href={localePath(locale, reviewsPath(exam, page - 1))}
                      rel="prev"
                      variant="outlined"
                      sx={{ minHeight: 48, minWidth: 96, textTransform: 'none', ...focusRing }}
                    >
                      {t('previous')}
                    </Button>
                  ) : (
                    <Box sx={{ minWidth: 96 }} />
                  )}
                  <Typography variant="body2" color="text.secondary" aria-current="page" sx={{ textAlign: 'center' }}>
                    {t('pageOf', { page, total: pages })}
                  </Typography>
                  {page < pages ? (
                    <Button
                      component={Link}
                      href={localePath(locale, reviewsPath(exam, page + 1))}
                      rel="next"
                      variant="outlined"
                      sx={{ minHeight: 48, minWidth: 96, textTransform: 'none', ...focusRing }}
                    >
                      {t('next')}
                    </Button>
                  ) : (
                    <Box sx={{ minWidth: 96 }} />
                  )}
                </Box>
              )}
            </Box>
          )}

          <Paper component="section" aria-labelledby="how-collected-title" variant="outlined" sx={{ mt: { xs: 4, md: 5 }, p: { xs: 2, sm: 3 }, borderRadius: 3 }}>
            <Typography id="how-collected-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1 }}>
              {t('howTitle')}
            </Typography>
            <Box component="ul" sx={{ pl: 2.5, m: 0, '& li': { mb: 0.75, lineHeight: 1.6 } }}>
              <li>{t('how1')}</li>
              <li>{t('how2')}</li>
              <li>{t('how3')}</li>
            </Box>
          </Paper>

          <Box component="section" aria-labelledby="more-title" sx={{ mt: 4 }}>
            <Typography id="more-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1.5 }}>
              {t('moreTitle')}
            </Typography>
            <LinkButtons actions={more} />
          </Box>
        </Container>
      </Box>
    </>
  );
}
