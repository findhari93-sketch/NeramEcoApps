import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateTNEAMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const colleges = await getTNEAColleges();
  return generateTNEAMetadata(locale, colleges.length);
}

export default async function TNEACollegesPage({ params: { locale } }: Props) {
  setRequestLocale(locale);

  const colleges = await getTNEAColleges();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: 'TNEA Colleges', path: '/colleges/tnea' },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: 'TNEA Colleges' }]}
          category={{
            eyebrow: 'Category · Counselling',
            title: 'TNEA B.Arch Colleges 2026',
            shortTitle: 'TNEA colleges',
            subtitle: `${colleges.length} colleges admit B.Arch students through TNEA counselling.`,
            why: {
              label: 'How TNEA works',
              text: 'TNEA (Tamil Nadu Engineering Admissions) allots B.Arch seats in Tamil Nadu colleges based on NATA scores and Class 12 marks. Cutoff ranks are updated after each counselling round.',
            },
            related: relatedCategories('/colleges/tnea', [{ label: 'All colleges in Tamil Nadu', href: '/colleges/tamil-nadu' }]),
          }}
          locked={{ label: 'TNEA counselling', changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
