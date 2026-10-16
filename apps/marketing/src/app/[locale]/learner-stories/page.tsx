import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Box, Typography } from '@neram/ui';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { JsonLd } from '@/components/seo/JsonLd';
import { CtaBand, CtaButton, EmptyState, PageHero, PersonCard, Section, tokens as t } from '@/design-system';
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

function OutcomeCard({ outcome, t: tl }: { outcome: PublicOutcome; t: (k: string, v?: Record<string, string | number>) => string }) {
  const exam = examLabel(outcome.exam);
  const heading = [exam, outcome.examYear ? String(outcome.examYear) : ''].filter(Boolean).join(' ');
  const facts: string[] = [];
  if (outcome.score != null && outcome.maxScore != null) facts.push(tl('score', { score: outcome.score, max: outcome.maxScore }));
  else if (outcome.score != null) facts.push(tl('scoreOnly', { score: outcome.score }));
  if (outcome.rank != null) facts.push(tl('rank', { rank: outcome.rank }));

  return (
    <Box component="article" sx={{ height: '100%' }}>
      <PersonCard name={outcome.displayName} role={heading || undefined}>
        {facts.length > 0 && (
          <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: '0.9375rem', fontWeight: 700 }}>
            {facts.join(', ')}
          </Typography>
        )}
        {outcome.college && (
          <Typography component="p" sx={{ m: 0, fontSize: '1rem', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
            {tl('college', { college: outcome.college })}
          </Typography>
        )}
        <Box
          sx={{
            mt: 'auto',
            pt: 1.5,
            borderTop: `1px solid ${t.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: '0.875rem', fontWeight: 600, color: t.success }}>
            <VerifiedOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            {tl('verified')}
          </Box>
          {outcome.slug && (
            <CtaButton
              variant="link"
              size="md"
              href={`/achievements/${outcome.slug}`}
              aria-label={tl('viewResultFor', { name: outcome.displayName })}
            >
              {tl('viewResult')}
            </CtaButton>
          )}
        </Box>
      </PersonCard>
    </Box>
  );
}

export default async function LearnerStoriesPage({ params: { locale } }: PageProps) {
  setRequestLocale(locale);
  const [tl, tr] = await Promise.all([
    getTranslations({ locale, namespace: 'learnerStories' }),
    getTranslations({ locale, namespace: 'reviews' }),
  ]);
  const { outcomes } = await loadLearnerStories();

  const crumbs = [
    { name: tr('breadcrumbHome'), url: abs(locale, '/'), href: '/' },
    { name: tl('breadcrumb'), url: abs(locale, '/learner-stories'), href: undefined },
  ];
  const itemList = buildOutcomesItemListJsonLd(outcomes, (slug) => abs(locale, `/achievements/${slug}`));

  return (
    <>
      <JsonLd data={generateBreadcrumbSchema(crumbs.map(({ name, url }) => ({ name, url })))} />
      {itemList && <JsonLd data={itemList} />}

      <PageHero
        breadcrumb={crumbs.map(({ name, href }) => ({ name, href }))}
        title={tl('title')}
        lede={tl('intro')}
        stats={outcomes.length > 0 ? [{ value: outcomes.length, label: tl('listTitle') }] : undefined}
      />

      {outcomes.length === 0 ? (
        <Section width="narrow">
          <EmptyState
            icon={<EmojiEventsOutlinedIcon />}
            title={tl('emptyTitle')}
            body={tl('emptyBody')}
            action={
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, justifyContent: 'center' }}>
                <CtaButton href="/achievements">{tr('ctaResults')}</CtaButton>
                <CtaButton variant="outline" href="/reviews">
                  {tr('ctaAllReviews')}
                </CtaButton>
              </Box>
            }
          />
        </Section>
      ) : (
        <Section id="outcomes" header={{ title: tl('listTitle'), lede: tl('count', { count: outcomes.length }), align: 'start' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
              gap: { xs: 2, md: 2.5 },
            }}
          >
            {outcomes.map((o) => (
              <OutcomeCard key={o.id} outcome={o} t={tl} />
            ))}
          </Box>
        </Section>
      )}

      <CtaBand
        eyebrow={null}
        title={tr('moreTitle')}
        actions={
          <>
            <CtaButton href="/demo-class">{tr('ctaDemo')}</CtaButton>
            <CtaButton variant="link" href="/reviews">
              {tr('ctaAllReviews')}
            </CtaButton>
            <CtaButton variant="link" href="/achievements">
              {tr('ctaResults')}
            </CtaButton>
          </>
        }
      />
    </>
  );
}
