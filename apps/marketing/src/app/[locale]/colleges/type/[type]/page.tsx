import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateTypeMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByType } from '@/lib/college-hub/queries';
import { COLLEGE_TYPE_SLUGS } from '@/lib/college-hub/constants';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string; type: string } };

// English only. See colleges/[state]/[slug] for the rationale.
export async function generateStaticParams() {
  return Object.keys(COLLEGE_TYPE_SLUGS).map((type) => ({ locale: 'en', type }));
}

export async function generateMetadata({ params: { locale, type } }: Props): Promise<Metadata> {
  if (!COLLEGE_TYPE_SLUGS[type]) return { title: 'Not Found' };
  const colleges = await getCollegesByType(COLLEGE_TYPE_SLUGS[type]);
  return generateTypeMetadata(locale, type, colleges.length);
}

export default async function TypeCollegesPage({ params: { locale, type } }: Props) {
  setRequestLocale(locale);

  const typeName = COLLEGE_TYPE_SLUGS[type];
  if (!typeName) notFound();

  const colleges = await getCollegesByType(typeName);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${typeName} Colleges`, path: `/colleges/type/${type}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: `${typeName} Architecture Colleges` }]}
          category={{
            eyebrow: 'Category · College type',
            title: `${typeName} Architecture Colleges in India`,
            shortTitle: `${typeName} colleges`,
            subtitle: `${colleges.length} ${typeName.toLowerCase()} B.Arch colleges across India.`,
            related: relatedCategories(`/colleges/type/${type}`),
          }}
          hide={['type']}
          locked={{ label: `${typeName} colleges`, changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
