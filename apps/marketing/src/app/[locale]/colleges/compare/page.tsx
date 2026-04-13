'use client';

import { useState, useEffect, Suspense } from 'react';
import {
  Container, Typography, Box, Grid, Paper, Stack, CircularProgress, Button,
} from '@mui/material';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { CollegeDetail } from '@/lib/college-hub/types';

const COMPARE_ROWS: Array<{
  label: string;
  key: string;
  format?: (v: unknown) => string;
}> = [
  { label: 'Type', key: 'type' },
  { label: 'Established', key: 'established_year' },
  { label: 'COA Approved', key: 'coa_approved', format: (v) => (v ? 'Yes' : 'No') },
  { label: 'NAAC Grade', key: 'naac_grade' },
  {
    label: 'NIRF Rank (Arch)',
    key: 'nirf_rank_architecture',
    format: (v) => (v ? `#${v}` : 'Not ranked'),
  },
  {
    label: 'ArchIndex',
    key: 'arch_index_score',
    format: (v) => (v ? `${v}/100` : 'N/A'),
  },
  {
    label: 'Annual Fee (Approx)',
    key: 'annual_fee_approx',
    format: (v) =>
      v ? `${Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}/yr` : 'N/A',
  },
  { label: 'Total B.Arch Seats', key: 'total_barch_seats' },
  {
    label: 'Accepted Exams',
    key: 'accepted_exams',
    format: (v) => (Array.isArray(v) ? v.join(', ') : (v as string) ?? 'N/A'),
  },
  {
    label: 'Counseling',
    key: 'counseling_systems',
    format: (v) => (Array.isArray(v) ? v.join(', ') : (v as string) ?? 'N/A'),
  },
  { label: 'City', key: 'city' },
  { label: 'State', key: 'state' },
];

function CompareContent() {
  const searchParams = useSearchParams();
  const slugsParam = searchParams.get('slugs') ?? '';
  const slugs = slugsParam.split(',').filter(Boolean).slice(0, 3);

  const [colleges, setColleges] = useState<(CollegeDetail | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slugs.length === 0) {
      setLoading(false);
      return;
    }
    Promise.all(
      slugs.map((slug) =>
        fetch(`/api/colleges/detail?slug=${slug}`)
          .then((r) => r.json())
          .then((j) => j.data ?? null)
          .catch(() => null)
      )
    )
      .then(setColleges)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugsParam]);

  if (loading) {
    return (
      <Container sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (slugs.length < 2) {
    return (
      <Container maxWidth="md" sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          Select colleges to compare
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Browse the college listing and click "Compare" on 2-3 colleges.
        </Typography>
        <Button variant="contained" component={Link} href="/colleges">
          Browse Colleges
        </Button>
      </Container>
    );
  }

  const colSpan = Math.floor(9 / colleges.length) as 3 | 4 | 9;

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Typography variant="h4" fontWeight={800} gutterBottom>
        Compare Colleges
      </Typography>

      {/* College headers */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={3} />
        {colleges.map((college, i) => (
          <Grid item xs={12} sm={colSpan} key={i}>
            {college ? (
              <Paper
                variant="outlined"
                sx={{ p: 2, textAlign: 'center', borderRadius: 2 }}
              >
                <Typography variant="subtitle1" fontWeight={700} sx={{ fontSize: '0.9rem' }}>
                  {college.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {college.city}, {college.state}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Button
                    size="small"
                    component={Link}
                    href={`/colleges/${college.state_slug}/${college.slug}`}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    View Profile
                  </Button>
                </Box>
              </Paper>
            ) : (
              <Paper
                variant="outlined"
                sx={{ p: 2, textAlign: 'center', borderRadius: 2, bgcolor: '#f8fafc' }}
              >
                <Typography color="text.secondary" variant="caption">
                  Not found
                </Typography>
              </Paper>
            )}
          </Grid>
        ))}
      </Grid>

      {/* Comparison rows */}
      {COMPARE_ROWS.map(({ label, key, format }) => (
        <Grid container spacing={2} key={key} sx={{ mb: 1 }}>
          <Grid item xs={12} sm={3}>
            <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', py: 1 }}>
              <Typography variant="body2" color="text.secondary" fontWeight={600}>
                {label}
              </Typography>
            </Box>
          </Grid>
          {colleges.map((college, i) => {
            const raw = college ? (college as unknown as Record<string, unknown>)[key] : null;
            const display =
              raw != null ? (format ? format(raw) : String(raw)) : 'N/A';
            return (
              <Grid item xs={12} sm={colSpan} key={i}>
                <Paper
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: '#fafafa',
                    minHeight: 48,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Typography variant="body2">{display}</Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ))}

      <Stack direction="row" justifyContent="center" sx={{ mt: 3 }}>
        <Button variant="outlined" component={Link} href="/colleges">
          Back to Colleges
        </Button>
      </Stack>
    </Container>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={<Container sx={{ py: 6, textAlign: 'center' }}><CircularProgress /></Container>}>
      <CompareContent />
    </Suspense>
  );
}
