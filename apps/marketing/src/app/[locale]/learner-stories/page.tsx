import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Box, Button, Card, CardContent, Chip, Container, Stack, Typography } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { EmptyState, LinkButtons, PersonAvatar, focusRing } from '@/components/reviews/ReviewParts';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import { BASE_URL } from '@/lib/seo/constants';
import { loadLearnerStories } from '@/lib/reviews/data';
import { buildOutcomesItemListJsonLd, type PublicOutcome } from '@/lib/reviews/json-ld';
import { MIN_ITEMS_FOR_INDEX, examLabel, localePath } from '@/lib/reviews/rules';

// ISR: outcomes are published by staff a few times a year.
export const revalidate = 86400;

interface PageProps {
  params: { locale: string };
}

const abs = (locale: string, path: string) => `${BASE_URL}${localePath(locale, path) === '/' ? '' : localePath(locale, path)}`;

export async function generateMetadata({ params: { locale } }: PageProps): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'learnerStories' });
  const { outcomes } = await loadLearnerStories();
  // Thin until staff have published enough verified outcomes: render, but noindex.
  const indexable = locale === 'en' && outcomes.length >= MIN_ITEMS_FOR_INDEX;
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: buildAlternates(locale, '/learner-stories'),
    robots: indexable ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: t('metaTitle'),
      description: t('metaDescription'),
      type: 'website',
      url: abs(locale, '/learner-stories'),
    },
  };
}

function OutcomeCard({ outcome, locale, t }: { outcome: PublicOutcome; locale: string; t: (k: string, v?: Record<string, string | number>) => string }) {
  const exam = examLabel(outcome.exam);
  const heading = [exam, outcome.examYear ? String(outcome.examYear) : ''].filter(Boolean).join(' ');
  const facts: string[] = [];
  if (outcome.score != null && outcome.maxScore != null) facts.push(t('score', { score: outcome.score, max: outcome.maxScore }));
  else if (outcome.score != null) facts.push(t('scoreOnly', { score: outcome.score }));
  if (outcome.rank != null) facts.push(t('rank', { rank: outcome.rank }));

  return (
    <Card component="article" variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, display: 'flex', flexDirection: 'column', gap: 1.25, flexGrow: 1, '&:last-child': { pb: { xs: 2, sm: 2.5 } } }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <PersonAvatar name={outcome.displayName} photo={null} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h3" sx={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>
              {outcome.displayName}
            </Typography>
            {heading && (
              <Typography variant="body2" color="text.secondary">
                {heading}
              </Typography>
            )}
          </Box>
        </Stack>
        {facts.length > 0 && <Typography sx={{ fontWeight: 600 }}>{facts.join(', ')}</Typography>}
        {outcome.college && <Typography sx={{ overflowWrap: 'anywhere' }}>{t('college', { college: outcome.college })}</Typography>}
        <Box sx={{ flexGrow: 1 }} />
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" useFlexGap flexWrap="wrap">
          <Chip
            size="small"
            color="success"
            variant="outlined"
            icon={<VerifiedIcon aria-hidden="true" />}
            label={t('verified')}
          />
          {outcome.slug && (
            <Button
              component={Link}
              href={localePath(locale, `/achievements/${outcome.slug}`)}
              aria-label={t('viewResultFor', { name: outcome.displayName })}
              variant="text"
              sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600, ...focusRing }}
            >
              {t('viewResult')}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default async function LearnerStoriesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const [t, tr] = await Promise.all([
    getTranslations({ locale, namespace: 'learnerStories' }),
    getTranslations({ locale, namespace: 'reviews' }),
  ]);
  const { outcomes } = await loadLearnerStories();

  const crumbs = [
    { name: tr('breadcrumbHome'), url: abs(locale, '/'), href: localePath(locale, '/') },
    { name: t('breadcrumb'), url: abs(locale, '/learner-stories'), href: undefined },
  ];
  const itemList = buildOutcomesItemListJsonLd(outcomes, (slug) => abs(locale, `/achievements/${slug}`));

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema(crumbs.map(({ name, url }) => ({ name, url })))} />
      {itemList && <JsonLd data={itemList} />}

      <Box sx={{ bgcolor: 'background.default', py: { xs: 3, md: 6 } }}>
        <Container maxWidth="md" sx={{ px: { xs: 2, sm: 3 } }}>
          <Breadcrumbs items={crumbs.map(({ name, href }) => ({ name, href }))} />
          <Typography component="h1" sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, lineHeight: 1.2, mb: 1.5 }}>
            {t('title')}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: '1rem', lineHeight: 1.6, maxWidth: '65ch', mb: 3 }}>
            {t('intro')}
          </Typography>

          {outcomes.length === 0 ? (
            <EmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              actions={[
                { href: localePath(locale, '/reviews'), label: tr('ctaAllReviews') },
                { href: localePath(locale, '/achievements'), label: tr('ctaResults'), primary: true },
              ]}
            />
          ) : (
            <Box component="section" aria-labelledby="outcomes-title">
              <Stack direction="row" alignItems="baseline" justifyContent="space-between" useFlexGap flexWrap="wrap" sx={{ mb: 2, gap: 1 }}>
                <Typography id="outcomes-title" component="h2" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  {t('listTitle')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('count', { count: outcomes.length })}
                </Typography>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
                {outcomes.map((o) => (
                  <OutcomeCard key={o.id} outcome={o} locale={locale} t={t} />
                ))}
              </Box>
            </Box>
          )}

          <Box component="section" aria-labelledby="more-title" sx={{ mt: 4 }}>
            <Typography id="more-title" component="h2" sx={{ fontSize: '1.125rem', fontWeight: 700, mb: 1.5 }}>
              {tr('moreTitle')}
            </Typography>
            <LinkButtons
              actions={[
                { href: localePath(locale, '/reviews'), label: tr('ctaAllReviews') },
                { href: localePath(locale, '/achievements'), label: tr('ctaResults') },
                { href: localePath(locale, '/demo-class'), label: tr('ctaDemo'), primary: true },
              ]}
            />
          </Box>
        </Container>
      </Box>
    </>
  );
}
