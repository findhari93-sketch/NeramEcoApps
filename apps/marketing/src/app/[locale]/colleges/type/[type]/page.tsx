import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container, Grid, Typography, Box } from '@mui/material';
import { JsonLd } from '@/components/seo/JsonLd';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { generateTypeMetadata } from '@/lib/college-hub/seo';
import { generateListingBreadcrumbSchema } from '@/lib/college-hub/schema-markup';
import { getCollegesByType } from '@/lib/college-hub/queries';
import { COLLEGE_TYPE_SLUGS } from '@/lib/college-hub/constants';
import CollegeListingCard from '@/components/college-hub/CollegeListingCard';

export const revalidate = 3600;

type Props = { params: { locale: string; type: string } };

export async function generateStaticParams() {
  const locales = ['en', 'ta', 'hi', 'kn', 'ml'];
  const types = Object.keys(COLLEGE_TYPE_SLUGS);
  return locales.flatMap((locale) => types.map((type) => ({ locale, type })));
}

export async function generateMetadata({ params: { locale, type } }: Props): Promise<Metadata> {
  if (!COLLEGE_TYPE_SLUGS[type]) return { title: 'Not Found' };
  const colleges = await getCollegesByType(COLLEGE_TYPE_SLUGS[type]);
  return generateTypeMetadata(locale, type, colleges.length);
}

export default async function TypeCollegesPage({ params: { locale, type } }: Props) {
  setRequestLocale(locale);

  const typeName = COLLEGE_TYPE_SLUGS[type];
  if (!typeName) notFound();

  const colleges = await getCollegesByType(typeName);
  if (colleges.length === 0) notFound();

  const breadcrumb = generateListingBreadcrumbSchema([
    { name: 'Home', path: '' },
    { name: 'Colleges', path: '/colleges' },
    { name: `${typeName} Colleges`, path: `/colleges/type/${type}` },
  ]);

  return (
    <>
      <JsonLd data={breadcrumb} />
      <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
        <Breadcrumbs items={[
          { name: 'Colleges', href: '/colleges' },
          { name: `${typeName} Architecture Colleges` },
        ]} />
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 800 }}>
            {typeName} Architecture Colleges in India
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            {colleges.length} {typeName.toLowerCase()} B.Arch colleges across India
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
