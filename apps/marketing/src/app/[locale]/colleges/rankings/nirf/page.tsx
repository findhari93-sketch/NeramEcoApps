import type { Metadata } from 'next';
import { Container } from '@mui/material';
import { setRequestLocale } from 'next-intl/server';
import {
  getNIRFRankings,
  getAvailableNIRFYears,
  getNIRFStatesAndCities,
} from '@/lib/college-hub/queries';
import { toPublicNIRFRow } from '@/lib/college-hub/nirf-client-filter';
import { buildNIRFInsights, nirfMeta } from '@/lib/college-hub/nirf-insights';
import { localePrefix } from '@/lib/college-hub/detail-content';
import { generateBreadcrumbSchema, generateFAQSchema } from '@/lib/seo/schemas';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import NIRFRankingsExplorer from '@/components/college-hub/NIRFRankingsExplorer';
import NIRFInsights from '@/components/college-hub/NIRFInsights';

export const revalidate = 86400;

const SITE = 'https://neramclasses.com';
// One object so React.cache (keyed by argument identity) dedupes across
// generateMetadata and the page.
const ALL_ROWS = { limit: 500, sort: 'rank_asc' } as const;

// Every row once (about 170 across all years). Filters apply in the browser
// (NIRFRankingsExplorer), so this page no longer reads searchParams and the
// daily revalidate actually holds. The queries are React.cache wrapped, so
// generateMetadata and the page share one fetch.
async function loadNIRF() {
  const [availableYears, { data: allRows }, geo] = await Promise.all([
    getAvailableNIRFYears(),
    getNIRFRankings(ALL_ROWS),
    getNIRFStatesAndCities(),
  ]);
  const rows = allRows.map(toPublicNIRFRow);
  return { availableYears, rows, geo, insights: buildNIRFInsights(rows, availableYears) };
}

export async function generateMetadata(): Promise<Metadata> {
  const { insights } = await loadNIRF();
  const { title, description } = nirfMeta(insights);
  return {
    title,
    description,
    alternates: {
      canonical: '/colleges/rankings/nirf',
    },
    openGraph: { title, description, url: `${SITE}/colleges/rankings/nirf`, type: 'website' },
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function NIRFRankingsPage({
  params: { locale },
}: PageProps) {
  setRequestLocale(locale);
  const prefix = localePrefix(locale);
  const { availableYears, rows, geo, insights } = await loadNIRF();

  const yearRangeLabel = availableYears.length
    ? `${Math.min(...availableYears)}–${Math.max(...availableYears)}`
    : '2020–2025';

  // Rendered as plain <script> tags (JsonLd), not next/script, so they are in
  // the server HTML. Canonical URLs carry no /en prefix.
  const schemas: Record<string, unknown>[] = [
    generateBreadcrumbSchema([
      { name: 'Home', url: SITE },
      { name: 'Colleges', url: `${SITE}/colleges` },
      { name: 'NIRF Architecture Rankings', url: `${SITE}/colleges/rankings/nirf` },
    ]),
  ];
  if (insights) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `NIRF ${insights.year} Architecture Rankings`,
      numberOfItems: insights.ranked.length,
      itemListOrder: 'https://schema.org/ItemListOrderAscending',
      itemListElement: insights.ranked.map((r) => ({
        '@type': 'ListItem',
        position: r.rank,
        name: r.name,
        ...(r.slug && { url: `${SITE}/colleges/rankings/nirf/${r.slug}` }),
      })),
    });
    schemas.push(generateFAQSchema(insights.faqs));
  }

  return (
    <Container
      maxWidth="lg"
      sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}
    >
      <JsonLd data={schemas} />

      <Breadcrumbs
        items={[
          { name: 'Colleges', href: `${prefix}/colleges` },
          { name: 'NIRF Architecture Rankings' },
        ]}
      />

      <NIRFRankingsExplorer
        rows={rows}
        availableYears={availableYears}
        states={geo.states}
        cities={geo.cities}
        locale={locale}
        yearRangeLabel={yearRangeLabel}
      />

      {insights && <NIRFInsights insights={insights} prefix={prefix} />}
    </Container>
  );
}
