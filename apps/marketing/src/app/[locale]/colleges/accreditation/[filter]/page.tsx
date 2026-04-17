import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateAccreditationMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByAccreditation } from '@/lib/college-hub/queries';
import { ACCREDITATION_FILTERS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; filter: string } };

export async function generateStaticParams() {
  const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
  const filters = Object.keys(ACCREDITATION_FILTERS);
  return locales.flatMap((locale) => filters.map((filter) => ({ locale, filter })));
}

export async function generateMetadata({ params: { locale, filter } }: Props): Promise<Metadata> {
  if (!ACCREDITATION_FILTERS[filter]) return { title: 'Not Found' };
  const colleges = await getCollegesByAccreditation(filter);
  return generateAccreditationMetadata(locale, filter, colleges.length);
}

export default async function AccreditationCollegesPage({ params: { locale, filter } }: Props) {
  setRequestLocale(locale);

  const filterConfig = ACCREDITATION_FILTERS[filter];
  if (!filterConfig) notFound();

  const colleges = await getCollegesByAccreditation(filter);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: filterConfig.label, path: `/colleges/accreditation/${filter}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${filterConfig.label} Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            {filterConfig.label} Architecture Colleges
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} colleges. {filterConfig.description}
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
