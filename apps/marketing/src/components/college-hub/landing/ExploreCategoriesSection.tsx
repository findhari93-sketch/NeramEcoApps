import { Box, Container, Grid, Paper, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { COUNSELING_LABELS, COLLEGE_TYPE_SLUGS, ACCREDITATION_FILTERS } from '@/lib/college-hub/constants';
import { FEE_RANGES } from '@/lib/college-hub/queries';

interface ExploreCategoriesSectionProps {
  stateData: Array<{ state_slug: string; state: string; count: number }>;
  counselingData: Array<{ system: string; count: number }>;
  cityData: Array<{ city_slug: string; city: string; count: number }>;
}

function CategoryColumn({
  title,
  items,
  viewAllHref,
  viewAllLabel,
}: {
  title: string;
  items: Array<{ label: string; href: string; count?: number }>;
  viewAllHref?: string;
  viewAllLabel?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2.5, height: '100%' }}>
      <Typography
        variant="caption"
        sx={{ fontWeight: 700, color: 'warning.main', textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}
      >
        {title}
      </Typography>
      <Stack gap={0.5}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.primary',
                '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                py: 0.25,
              }}
            >
              {item.label}
              {item.count != null && (
                <Typography component="span" variant="caption" sx={{ color: 'text.disabled', ml: 0.75 }}>
                  ({item.count})
                </Typography>
              )}
            </Typography>
          </Link>
        ))}
        {viewAllHref && (
          <Link href={viewAllHref} style={{ textDecoration: 'none' }}>
            <Typography variant="body2" sx={{ color: 'primary.main', mt: 1, fontSize: '0.8rem' }}>
              {viewAllLabel ?? 'View all'} →
            </Typography>
          </Link>
        )}
      </Stack>
    </Paper>
  );
}

export default function ExploreCategoriesSection({ stateData, counselingData, cityData }: ExploreCategoriesSectionProps) {
  const stateItems = stateData.slice(0, 10).map((s) => ({
    label: s.state,
    href: `/colleges/${s.state_slug}`,
    count: s.count,
  }));

  const counselingItems = counselingData.slice(0, 10).map((c) => ({
    label: COUNSELING_LABELS[c.system] ?? c.system,
    href: `/colleges/counseling/${c.system.toLowerCase().replace(/_/g, '-')}`,
    count: c.count,
  }));

  const cityItems = cityData.slice(0, 8).map((c) => ({
    label: c.city,
    href: `/colleges/city/${c.city_slug}`,
    count: c.count,
  }));

  const rankingItems = [
    { label: 'NIRF Architecture Rankings', href: '/colleges/rankings/nirf' },
    { label: 'ArchIndex Top Rated', href: '/colleges/rankings/archindex' },
    ...Object.entries(ACCREDITATION_FILTERS).map(([key, val]) => ({
      label: val.label,
      href: `/colleges/accreditation/${key}`,
    })),
  ];

  const feeItems = Object.entries(FEE_RANGES).map(([key, range]) => ({
    label: range.label,
    href: `/colleges/fees/${key}`,
  }));

  const typeItems = Object.entries(COLLEGE_TYPE_SLUGS).map(([slug, name]) => ({
    label: `${name} Colleges`,
    href: `/colleges/type/${slug}`,
  }));

  return (
    <Box sx={{ py: { xs: 4, sm: 6 }, bgcolor: '#f8fafc' }}>
      <Container maxWidth="lg">
        <Box sx={{ textAlign: 'center', mb: { xs: 3, sm: 4 } }}>
          <Typography variant="h2" sx={{ fontSize: { xs: '1.4rem', sm: '1.75rem' }, fontWeight: 800 }}>
            Explore Architecture Colleges
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 0.75 }}>
            Browse by state, counseling, rankings, fees, and more
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <CategoryColumn title="📍 By State" items={stateItems} viewAllHref="/colleges" viewAllLabel="All states" />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <CategoryColumn title="📝 By Counseling" items={counselingItems} />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack gap={2}>
              <CategoryColumn title="🏆 Rankings" items={rankingItems} />
              <CategoryColumn title="🏙️ By City" items={cityItems} />
            </Stack>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Stack gap={2}>
              <CategoryColumn title="💰 By Fee Range" items={feeItems} />
              <CategoryColumn title="🏫 By Type" items={typeItems} />
            </Stack>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
