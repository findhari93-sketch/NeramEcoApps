import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCityMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCity, getActiveCities } from '@/lib/college-hub/queries';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string; city: string } };

// English only. See colleges/[state]/[slug] for the rationale; non-English variants
// stay reachable via on-demand rendering.
export async function generateStaticParams() {
  try {
    const cities = await getActiveCities();
    return cities.map((c) => ({ locale: 'en', city: c.city_slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, city } }: Props): Promise<Metadata> {
  const colleges = await getCollegesByCity(city);
  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return generateCityMetadata(locale, cityName, colleges.length);
}

export default async function CityCollegesPage({ params: { locale, city } }: Props) {
  setRequestLocale(locale);

  const colleges = await getCollegesByCity(city);
  if (colleges.length === 0) notFound();

  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${cityName} Colleges`, path: `/colleges/city/${city}` },
  ]);

  const stateSlug = colleges[0]?.state_slug;
  const stateName = colleges[0]?.state;
  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: `Architecture Colleges in ${cityName}` }]}
          category={{
            eyebrow: 'Category · City',
            title: `Architecture Colleges in ${cityName}`,
            shortTitle: cityName,
            subtitle: `${colleges.length} B.Arch ${colleges.length === 1 ? 'college' : 'colleges'} in ${cityName}.`,
            related: relatedCategories(
              `/colleges/city/${city}`,
              stateSlug && stateName ? [{ label: `All colleges in ${stateName}`, href: `/colleges/${stateSlug}` }] : []
            ),
          }}
          hide={['city', 'state']}
          stateFilter={false}
          locked={{ label: `City: ${cityName}`, changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
