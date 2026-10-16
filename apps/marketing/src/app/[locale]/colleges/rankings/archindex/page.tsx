import { Metadata } from 'next';
import {
  Container, Typography, Box, Table, TableHead, TableBody,
  TableRow, TableCell, Paper, Chip, Button, Tooltip,
} from '@mui/material';
import Link from 'next/link';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { setRequestLocale } from 'next-intl/server';
import { getArchIndexRankedColleges } from '@/lib/college-hub/queries';
import ArchIndexRing from '@/components/college-hub/ArchIndexRing';
import Breadcrumbs from '@/components/seo/Breadcrumbs';
import { siteTokens } from '@neram/ui/site-tokens';

export const revalidate = 86400;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Neram ArchIndex: Best B.Arch Colleges Ranking 2026',
    description: 'Neram ArchIndex is a composite 0-100 score rating B.Arch colleges on studio quality, faculty strength, placements, infrastructure, and alumni outcomes.',
    alternates: { canonical: '/colleges/rankings/archindex' },
  };
}

export default async function ArchIndexRankingsPage({ params: { locale } }: { params: { locale: string } }) {
  setRequestLocale(locale);
  const colleges = await getArchIndexRankedColleges();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, sm: 4 } }}>
      <Breadcrumbs items={[
        { name: 'Colleges', href: '/colleges' },
        { name: 'ArchIndex Rankings' },
      ]} />
      <Box sx={{ mb: 3 }}>
        <Chip label="Neram Exclusive" color="secondary" sx={{ mb: 1, fontWeight: 700 }} />
        <Typography variant="h1" sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 1 }}>
          ArchIndex Rankings: Best B.Arch Colleges
        </Typography>
        <Typography color={siteTokens.inkMuted} variant="body2" sx={{ maxWidth: 600 }}>
          ArchIndex is Neram&apos;s proprietary 0-100 score for B.Arch colleges, combining studio quality (25%),
          faculty (20%), placements (20%), infrastructure (15%), student satisfaction (10%), and alumni network (10%).
          It goes deeper than NIRF by measuring what matters to architecture students.
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 3, p: 2, bgcolor: siteTokens.ground, border: `1px solid ${siteTokens.line}`, borderRadius: 1 }}>
        <InfoOutlinedIcon sx={{ color: siteTokens.inkMuted, fontSize: 18, mt: 0.25, flexShrink: 0 }} />
        <Typography variant="caption" color={siteTokens.ink}>
          ArchIndex scores are calculated from verified placement data, student surveys, faculty credentials,
          infrastructure audits, and alumni success outcomes. Colleges can provide verified data via their college
          dashboard to improve their score accuracy.
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ overflow: 'auto', borderRadius: 1 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: siteTokens.ground }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700, width: 80 }}>Rank</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>College</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>City</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>
                <Tooltip title="ArchIndex: composite 0-100 score" arrow>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    ArchIndex
                    <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                  </Box>
                </Tooltip>
              </TableCell>
              <TableCell sx={{ fontWeight: 700 }}>NIRF</TableCell>
              <TableCell sx={{ fontWeight: 700 }}>Annual Fee</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {colleges.map((college, i) => (
              <TableRow key={college.id} hover>
                <TableCell>
                  <Typography
                    variant="body2"
                    fontWeight={700}
                    color={i < 3 ? siteTokens.gold800 : siteTokens.ink}
                  >
                    #{i + 1}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>{college.name}</Typography>
                  <Typography variant="caption" color={siteTokens.inkMuted}>{college.type}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{college.city}</Typography>
                </TableCell>
                <TableCell>
                  <ArchIndexRing score={college.arch_index_score!} size={48} showLabel={false} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college.nirf_rank_architecture ? `#${college.nirf_rank_architecture}` : '—'}
                  </Typography>
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
          <Typography color={siteTokens.inkMuted}>
            ArchIndex scores are being calculated. Data coming soon.
          </Typography>
        </Box>
      )}
    </Container>
  );
}
