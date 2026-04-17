import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { Container, Grid, Typography, Box, Alert } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateTNEAMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getTNEAColleges } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

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
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: 'TNEA Colleges' },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            TNEA B.Arch Colleges 2026
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} colleges accepting TNEA counseling for B.Arch admissions
          </Typography>
        </Box>

        <Alert severity="info" sx={{ mb: 3 }}>
          TNEA (Tamil Nadu Engineering Admissions) allots B.Arch seats in Tamil Nadu government and aided colleges based on NATA scores and 12th marks. Cutoff ranks are updated after each counseling round.
        </Alert>

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
