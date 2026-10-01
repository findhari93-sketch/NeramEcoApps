import type { Metadata } from 'next';
import Script from 'next/script';
import { Container } from '@mui/material';
import { setRequestLocale } from 'next-intl/server';
import {
  getNIRFRankings,
  getAvailableNIRFYears,
  getNIRFStatesAndCities,
} from '@/lib/college-hub/queries';
import { DEFAULT_FILTERS } from '@/lib/college-hub/nirf-filters';
import { applyNIRFFilters, toPublicNIRFRow } from '@/lib/college-hub/nirf-client-filter';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import NIRFRankingsExplorer from '@/components/college-hub/NIRFRankingsExplorer';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title:
      'NIRF Architecture Rankings 2020 to 2025: Top B.Arch Colleges in India | Neram',
    description:
      'Filter and compare NIRF Architecture rankings from 2020 to 2025 across IITs, NITs, SPAs, and private colleges. Search by state, city, score, and rank with full year-over-year history.',
    alternates: {
      canonical: '/colleges/rankings/nirf',
    },
  };
}

interface PageProps {
  params: { locale: string };
}

export default async function NIRFRankingsPage({
  params: { locale },
}: PageProps) {
  setRequestLocale(locale);
  // Every row once (about 170 across all years). Filters apply in the browser
  // (NIRFRankingsExplorer), so this page no longer reads searchParams and the
  // daily revalidate actually holds.
  const [availableYears, { data: allRows }, geo] = await Promise.all([
    getAvailableNIRFYears(),
    getNIRFRankings({ limit: 500, sort: 'rank_asc' }),
    getNIRFStatesAndCities(),
  ]);
  const latestYear = availableYears[0];
  const rows = allRows.map(toPublicNIRFRow);

  const yearRangeLabel = availableYears.length
    ? `${Math.min(...availableYears)}–${Math.max(...availableYears)}`
    : '2020–2025';

  // JSON-LD top 25 of the default view (latest year, best rank) for SEO
  const top25 = applyNIRFFilters(rows, DEFAULT_FILTERS, latestYear).data.slice(0, 25);
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `NIRF Architecture Rankings ${yearRangeLabel}`,
    itemListElement: top25.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: r.college?.name ?? r.source_name,
      url: r.college
        ? `https://neramclasses.com/${locale}/colleges/rankings/nirf/${r.college.slug}`
        : undefined,
    })),
  };

  return (
    <Container
      maxWidth="lg"
      sx={{ py: { xs: 2, md: 4 }, px: { xs: 2, md: 3 } }}
    >
      <Script
        id="nirf-rankings-jsonld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <Breadcrumbs
        items={[
          { name: 'Colleges', href: `/${locale}/colleges` },
          { name: 'Rankings', href: `/${locale}/colleges/rankings` },
          { name: 'NIRF Architecture' },
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
    </Container>
  );
}
