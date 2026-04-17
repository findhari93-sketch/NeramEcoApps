import { Metadata } from 'next';
import {
  Container, Typography, Box, Table, TableHead, TableBody,
  TableRow, TableCell, Paper, Chip, Button,
} from '@mui/material';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getNIRFRankedColleges } from '@/lib/college-hub/queries';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'NIRF Ranked B.Arch Colleges 2026 — Architecture Rankings | Neram',
    description: 'NIRF 2025 Architecture ranking of B.Arch colleges in India. Compare NIRF ranked architecture colleges with fees, cutoffs, placements, and ArchIndex scores.',
  };
}

export default async function NIRFRankingsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getNIRFRankedColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Breadcrumbs items={[
        { name: 'Colleges', href: '/colleges' },
        { name: 'NIRF Architecture Rankings' },
      ]} />
      <Box sx={{ mb: 3 }}>
        <Chip label="NIRF 2025" color="primary" sx={{ mb: 1, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          NIRF Architecture Rankings 2026
        </Typography>
        <Typography color="text.secondary" variant="body2">
          National Institutional Ranking Framework (NIRF) rankings for B.Arch Architecture discipline.
          Sorted by NIRF rank. {colleges.length} ranked colleges found.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ overflow: 'auto', borderRadius: 2 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>NIRF Rank</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>College</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>ArchIndex</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Annual Fee</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {colleges.map((college) => (
              <TableRow key={college.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    #{college.nirf_rank_architecture}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{college.name}</Typography>
                  {college.naac_grade && (
                    <Chip
                      label={`NAAC ${college.naac_grade}`}
                      size="small"
                      sx={{ mt: 0.25, height: 18, fontSize: '0.65rem' }}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{college.city}, {college.state}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary">{college.type}</Typography>
                </TableCell>
                <TableCell>
                  {college.arch_index_score ? (
                    <Chip
                      label={`${college.arch_index_score}/100`}
                      size="small"
                      color="success"
                      sx={{ fontWeight: 700 }}
                    />
                  ) : '—'}
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college.annual_fee_approx
                      ? `₹${(college.annual_fee_approx / 100000).toFixed(1)}L/yr`
                      : 'N/A'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    component={Link}
                    href={`/colleges/${college.state_slug}/${college.slug}`}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      {colleges.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            NIRF ranking data will be updated after the annual NIRF rankings release.
          </Typography>
        </Box>
      )}
    </Container>
  );
}
