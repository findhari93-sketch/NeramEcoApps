import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateCounselingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCounseling, getActiveCounselingSystems } from '@/lib/college-hub/queries';
import { COUNSELING_LABELS, COUNSELING_SLUGS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; system: string } };

export async function generateStaticParams() {
  try {
    const systems = await getActiveCounselingSystems();
    const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
    return locales.flatMap((locale) =>
      systems.map((s) => ({ locale, system: s.system.toLowerCase().replace(/_/g, '-') }))
    );
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

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${label} Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            B.Arch Colleges under {label} Counseling
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} architecture colleges accepting {label} counseling
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} md={6}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
