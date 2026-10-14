import { Metadata } from 'next';
import { Box } from '@mui/material';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCollegesByFeeRange, FEE_RANGES, type FeeRangeKey } from '@/lib/college-hub/queries';
import DirectoryListing from '@/components/college-hub/directory/DirectoryListing';
import { toListingCollege } from '@/lib/college-hub/listing-filter';
import { CATEGORY_INDEX_HREF, relatedCategories } from '@/lib/college-hub/categories';

export const revalidate = 86400;

export async function generateStaticParams() {
  return Object.keys(FEE_RANGES).map((range) => ({ range }));
}

export async function generateMetadata({
  params,
}: {
  params: { range: string; locale: string };
}): Promise<Metadata> {
  const rangeInfo = FEE_RANGES[params.range as FeeRangeKey];
  if (!rangeInfo) return {};
  return {
    title: `B.Arch Colleges ${rangeInfo.label}, India`,
    description: `List of COA-approved B.Arch colleges in India with annual fees ${rangeInfo.label.toLowerCase()}. Compare fees, placements, and cutoffs.`,
    // College pages are English only; without this Google picked its own canonical.
    alternates: { canonical: `/colleges/fees/${params.range}` },
  };
}

export default async function CollegeFeeRangePage({
  params,
}: {
  params: { range: string; locale: string };
}) {
  setRequestLocale(params.locale);
  const rangeInfo = FEE_RANGES[params.range as FeeRangeKey];
  if (!rangeInfo) notFound();

  const colleges = await getCollegesByFeeRange(params.range as FeeRangeKey);
  // The other fee bands lead the "Also browse" chips.
  const otherRanges = Object.entries(FEE_RANGES)
    .filter(([key]) => key !== params.range)
    .map(([key, info]) => ({ label: info.label, href: `/colleges/fees/${key}` }));

  return (
    <Box>
      <DirectoryListing
        mode="category"
        colleges={colleges.map(toListingCollege)}
        breadcrumbs={[{ name: 'Colleges', href: '/colleges' }, { name: rangeInfo.label }]}
        category={{
          eyebrow: 'Category · Annual fee',
          title: `B.Arch Colleges ${rangeInfo.label}`,
          shortTitle: rangeInfo.label,
          subtitle: `${colleges.length} B.Arch colleges in India with annual fees ${rangeInfo.label.toLowerCase()}. Fees are tuition only.`,
          related: relatedCategories(`/colleges/fees/${params.range}`, otherRanges, 6),
        }}
        hide={['fee']}
        locked={{ label: `Fee: ${rangeInfo.label}`, changeHref: CATEGORY_INDEX_HREF }}
      />
    </Box>
  );
}
