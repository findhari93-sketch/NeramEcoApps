import { Metadata } from 'next';
import { Container, Typography, Box, Grid, Chip, Button } from '@mui/material';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getCollegesByFeeRange, FEE_RANGES, type FeeRangeKey } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

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
    title: `B.Arch Colleges ${rangeInfo.label} — India | Neram`,
    description: `List of COA-approved B.Arch colleges in India with annual fees ${rangeInfo.label.toLowerCase()}. Compare fees, placements, and cutoffs.`,
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

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Breadcrumbs items={[
        { name: 'Colleges', href: '/colleges' },
        { name: rangeInfo.label },
      ]} />
      <Box sx={{ mb: 3 }}>
        <Chip label="Fee Filter" color="primary" sx={{ mb: 1 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          B.Arch Colleges {rangeInfo.label}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {colleges.length} COA-approved B.Arch colleges in India with annual fees{' '}
          {rangeInfo.label.toLowerCase()}. Sorted by Neram ArchIndex score.
        </Typography>
      </Box>

      {/* Fee range navigation */}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 3 }}>
        {Object.entries(FEE_RANGES).map(([key, info]) => (
          <Button
            key={key}
            size="small"
            variant={key === params.range ? 'contained' : 'outlined'}
            component={Link}
            href={`/colleges/fees/${key}`}
            sx={{ fontSize: '0.75rem' }}
          >
            {info.label}
          </Button>
        ))}
      </Box>

      {colleges.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No colleges found in this fee range yet.</Typography>
        </Box>
      ) : (
        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid item xs={12} sm={6} md={4} key={college.id}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
}
