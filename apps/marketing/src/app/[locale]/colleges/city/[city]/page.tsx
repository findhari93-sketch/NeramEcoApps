import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateCityMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByCity, getActiveCities } from '@/lib/college-hub/queries';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; city: string } };

export async function generateStaticParams() {
  try {
    const cities = await getActiveCities();
    const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
    return locales.flatMap((locale) =>
      cities.map((c) => ({ locale, city: c.city_slug }))
    );
  } catch {
    return [];
  }
}

export async function generateMetadata({ params: { locale, city } }: Props): Promise<Metadata> {
  const colleges = await getCollegesByCity(city);
  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return generateCityMetadata(locale, cityName, colleges.length);
}

export default async function CityCollegesPage({ params: { locale, city } }: Props) {
  setRequestLocale(locale);

  const colleges = await getCollegesByCity(city);
  if (colleges.length === 0) notFound();

  const cityName = colleges[0]?.city ?? city.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${cityName} Colleges`, path: `/colleges/city/${city}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `Architecture Colleges in ${cityName}` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            Architecture Colleges in {cityName}
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} B.Arch colleges in {cityName}
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
