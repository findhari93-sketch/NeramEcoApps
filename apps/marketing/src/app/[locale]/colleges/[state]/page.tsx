import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateStateListingMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getStateColleges, getActiveStates } from '@/lib/college-hub/queries';
import { STATE_NAMES } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

export const revalidate = 3600;

type Props = { params: { locale: string; state: string } };

export async function generateStaticParams() {
  try {
    const states = await getActiveStates();
    const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
    return locales.flatMap((locale) =>
      states.map((s) => ({ locale, state: s.state_slug }))
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, state } }: Props): Promise<Metadata> {
  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const colleges = await getStateColleges(state);
  return generateStateListingMetadata(locale, state, stateName, colleges.length);
}

export default async function StateCollegesPage({ params: { locale, state } }: Props) {
  setRequestLocale(locale);

  const colleges = await getStateColleges(state);
  if (colleges.length === 0) notFound();

  const stateName = STATE_NAMES[state] ?? state.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `B.Arch in ${stateName}`, path: `/colleges/${state}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: stateName },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            Best B.Arch Colleges in {stateName}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} colleges — compare fees, NATA cutoffs, NAAC grades, and placements
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {colleges.map((college) => (
            <Grid key={college.id} item xs={12} sm={6} md={4}>
              <CollegeListingCard college={college} />
            </Grid>
          ))}
        </Grid>
      </Container>
    </>
  );
}
