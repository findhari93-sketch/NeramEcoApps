import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateJoSAAMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string } };

export async function generateMetadata({ params: { locale } }: Props): Promise<Metadata> {
  const colleges = await getJoSAAColleges();
  return generateJoSAAMetadata(locale, colleges.length);
}

export default async function JoSAACollegesPage({ params: { locale } }: Props) {
  setRequestLocale(locale);

  const colleges = await getJoSAAColleges();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: 'JoSAA Colleges', path: '/colleges/josaa' },
  ]);

  if (colleges.length === 0) {
    return (
      <>
        <JsonLd data={breadcrumb} />
        <Box sx={{ maxWidth: 720, mx: 'auto', px: 2, py: 8, textAlign: 'center' }}>
          <Box component="h1" sx={{ m: 0, fontSize: '1.75rem', fontWeight: 800 }}>JoSAA B.Arch Colleges 2026: NITs and IITs</Box>
          <Box component="p" sx={{ color: 'text.secondary' }}>No JoSAA colleges are listed yet. Browse every college in the meantime.</Box>
          <Box component="a" href="/colleges#browse" sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, px: 3, borderRadius: 1.5, bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 700, textDecoration: 'none' }}>
            Browse all colleges
          </Box>
        </Box>
      </>
    );
  }
  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: 'JoSAA Colleges' }]}
          category={{
            eyebrow: 'Category · Counselling',
            title: 'JoSAA B.Arch Colleges 2026: NITs and IITs',
            shortTitle: 'JoSAA colleges',
            subtitle: `${colleges.length} NIT and IIT programmes admit through JoSAA counselling (JEE Main Paper 2).`,
            why: {
              label: 'How JoSAA works',
              text: 'JoSAA (Joint Seat Allocation Authority) handles admissions to B.Arch programmes at NITs, IITs and other centrally funded institutions. You need a JEE Main Paper 2 score, and most programmes also ask for a valid NATA score.',
            },
            related: relatedCategories('/colleges/josaa'),
          }}
          locked={{ label: 'JoSAA counselling', changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
