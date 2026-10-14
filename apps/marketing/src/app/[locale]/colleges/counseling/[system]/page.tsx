import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateCounselingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCounseling, getActiveCounselingSystems } from '@/lib/college-hub/queries';
import { COUNSELING_LABELS, COUNSELING_SLUGS } from '@/lib/college-hub/constants';
import { Box } from '@mui/material';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

type Props = { params: { locale: string; system: string } };

// English only. See colleges/[state]/[slug] for the rationale.
export async function generateStaticParams() {
  try {
    const systems = await getActiveCounselingSystems();
    return systems.map((s) => ({
      locale: 'en',
      system: s.system.toLowerCase().replace(/_/g, '-'),
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, system } }: Props): Promise<Metadata> {
  const systemKey = COUNSELING_SLUGS[system];
  if (!systemKey) return { title: 'Not Found' };
  const colleges = await getCollegesByCounseling(systemKey);
  return generateCounselingMetadata(locale, systemKey, colleges.length);
}

export default async function CounselingCollegesPage({ params: { locale, system } }: Props) {
  setRequestLocale(locale);

  const systemKey = COUNSELING_SLUGS[system];
  if (!systemKey) notFound();

  const colleges = await getCollegesByCounseling(systemKey);
  if (colleges.length === 0) notFound();

  const label = COUNSELING_LABELS[systemKey] ?? systemKey;

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${label} Colleges`, path: `/colleges/counseling/${system}` },
  ]);

  const short = label.replace(/\s*\(.*\)$/, '');
  return (
    <>
      <JsonLd data={breadcrumb} />
      <Box>
        <DirectoryListing
          mode="category"
          colleges={colleges.map(toListingCollege)}
          breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: `${label} Colleges` }]}
          category={{
            eyebrow: 'Category · Counselling',
            title: `B.Arch Colleges under ${label} Counseling`,
            shortTitle: `${short} colleges`,
            subtitle: `${colleges.length} architecture ${colleges.length === 1 ? 'college admits' : 'colleges admit'} through ${short} counselling.`,
            related: relatedCategories(`/colleges/counseling/${system}`),
          }}
          locked={{ label: `${short} counselling`, changeHref: CATEGORY_INDEX_HREF }}
        />
      </Box>
    </>
  );
}
