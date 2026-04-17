import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Container, Grid, Typography, Box, Alert } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateJoSAAMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getJoSAAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

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

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: 'JoSAA Colleges' },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            JoSAA B.Arch Colleges 2026 — NITs and IITs
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} NIT and IIT programs admitting through JoSAA counseling (JEE Paper 2)
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          JoSAA (Joint Seat Allocation Authority) handles admissions to B.Arch programs at NITs, IITs, and other centrally funded institutions. Eligibility requires JEE Paper 2 and a valid NATA score.
        </Alert>

        {colleges.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <Typography color="text.secondary">
              JoSAA college data will be updated soon.
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={2}>
            {colleges.map((college) => (
              <Grid key={college.id} item xs={12} sm={6} md={4}>
                <CollegeListingCard college={college} />
              </Grid>
            ))}
          </Grid>
        )}
      </Container>
    </>
  );
}
