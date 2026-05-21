import type { Metadata } from 'next';
import Link from 'next/link';
import Script from 'next/script';
import { notFound } from 'next/navigation';
import {
  Container,
  Typography,
  Box,
  Chip,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Stack,
  Button,
  Alert,
  LinearProgress,
} from '@mui/material';
import { setRequestLocale } from 'next-intl/server';
import {
  getNIRFRankingByCollege,
  getNIRFRankedCollegeSlugs,
} from '@/lib/college-hub/queries';
import Breadcrumbs from '@/components/seo/Breadcrumbs';

export const revalidate = 86400;
export const dynamicParams = true;

export async function generateStaticParams() {
  const slugs = await getNIRFRankedCollegeSlugs();
  return slugs.map((collegeSlug) => ({ collegeSlug }));
}

interface PageProps {
  params: { locale: string; collegeSlug: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const rows = await getNIRFRankingByCollege(params.collegeSlug);
  const c = rows[0]?.college;
  const name = c?.name ?? 'College';
  const years = rows.map((r) => r.year).sort();
  const yearRange = years.length
    ? `${years[0]} to ${years[years.length - 1]}`
    : '';
  return {
    title: `${name}: NIRF Architecture Ranking History ${yearRange} | Neram`,
    description:
      rows.length > 0
        ? `Year-by-year NIRF Architecture ranking for ${name}. ${rows.length} years of data including overall score and parameter breakdown (TLR, RPC, GO, OI, PR).`
        : `NIRF Architecture ranking history for ${name}.`,
    alternates: {
      canonical: `/colleges/rankings/nirf/${params.collegeSlug}`,
    },
  };
}

function bestRank(rows: { rank: number }[]) {
  if (!rows.length) return null;
  return rows.reduce((m, r) => (r.rank < m ? r.rank : m), rows[0].rank);
}

export default async function NIRFCollegeHistoryPage({ params }: PageProps) {
  const { locale, collegeSlug } = params;
  setRequestLocale(locale);

  const rows = await getNIRFRankingByCollege(collegeSlug);
  if (rows.length === 0) {
    notFound();
  }
  const college = rows[0].college!;
  const best = bestRank(rows);
  const maxRank = Math.max(...rows.map((r) => r.rank), 50);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: college.name,
    address: {
      '@type': 'PostalAddress',
      addressLocality: college.city,
      addressRegion: college.state,
      addressCountry: 'IN',
    },
    url: `https://neramclasses.com/${locale}/colleges/${college.state_slug}/${college.slug}`,
  };

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
      <Script
        id="nirf-college-jsonld"
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Breadcrumbs
        items={[
          { name: 'Colleges', href: `/${locale}/colleges` },
          { name: 'NIRF Rankings', href: `/${locale}/colleges/rankings/nirf` },
          { name: college.name },
        ]}
      />

      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.5 }}>
          <Chip label="NIRF Architecture" color="primary" sx={{ fontWeight: 700 }} />
          {college.type && (
            <Chip
              label={college.type}
              size="small"
              variant="outlined"
              sx={{ textTransform: 'capitalize' }}
            />
          )}
          {college.neram_tier && (
            <Chip label={college.neram_tier} size="small" color="success" variant="outlined" />
          )}
          {college.naac_grade && (
            <Chip label={`NAAC ${college.naac_grade}`} size="small" variant="outlined" />
          )}
        </Stack>
        <Typography
          variant="h1"
          sx={{ fontSize: { xs: '1.5rem', sm: '2rem' }, fontWeight: 900, mb: 0.5 }}
        >
          {college.name}
        </Typography>
        <Typography color="text.secondary" variant="body2">
          {college.city}, {college.state}
        </Typography>

        <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
          {best !== null && (
            <Paper
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 2, minWidth: 120 }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                Best rank
              </Typography>
              <Typography variant="h5" fontWeight={800} color="primary.main">
                #{best}
              </Typography>
            </Paper>
          )}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, minWidth: 120 }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Years ranked
            </Typography>
            <Typography variant="h5" fontWeight={800}>
              {rows.length}
            </Typography>
          </Paper>
        </Stack>
      </Box>

      {/* Rank-over-time bars */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1.5 }}>
          Rank trajectory
        </Typography>
        <Stack spacing={1.25}>
          {[...rows].sort((a, b) => a.year - b.year).map((r) => {
            // Invert: lower rank = better; scale to 0-100 where 1=100%
            const pct = Math.max(5, 100 - ((r.rank - 1) / maxRank) * 100);
            return (
              <Box key={r.id}>
                <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.25 }}>
                  <Typography variant="body2" fontWeight={600}>
                    {r.year}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    #{r.rank} {r.score !== null && `(score ${r.score.toFixed(2)})`}
                  </Typography>
                </Stack>
                <LinearProgress
                  variant="determinate"
                  value={pct}
                  sx={{ height: 10, borderRadius: 4 }}
                />
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* Yearly breakdown table */}
      <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto', mb: 3 }}>
        <Table size="small" sx={{ minWidth: 560 }}>
          <TableHead sx={{ bgcolor: '#f8fafc' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 700 }}>Year</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Rank</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">Score</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">TLR</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">RPC</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">GO</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">OI</TableCell>
              <TableCell sx={{ fontWeight: 700 }} align="right">PR</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={600}>
                    {r.year}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    #{r.rank}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{r.score?.toFixed(2) ?? '.'}</Typography>
                </TableCell>
                <TableCell align="right">{r.tlr?.toFixed(1) ?? '.'}</TableCell>
                <TableCell align="right">{r.rpc?.toFixed(1) ?? '.'}</TableCell>
                <TableCell align="right">{r.go?.toFixed(1) ?? '.'}</TableCell>
                <TableCell align="right">{r.oi?.toFixed(1) ?? '.'}</TableCell>
                <TableCell align="right">{r.pr?.toFixed(1) ?? '.'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <Alert severity="info" sx={{ mb: 3, fontSize: '0.8rem' }}>
        NIRF parameter weights changed in 2023 (sub-parameters within TLR, RPC, GO, OI,
        and PR were re-weighted). Scores are comparable as percentages but raw parameter
        values across versions should be interpreted with that in mind.
      </Alert>

      <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button
          component={Link}
          href={`/${locale}/colleges/${college.state_slug}/${college.slug}`}
          variant="contained"
          sx={{ minHeight: 48 }}
        >
          View full college profile
        </Button>
        <Button
          component={Link}
          href={`/${locale}/colleges/rankings/nirf`}
          variant="outlined"
          sx={{ minHeight: 48 }}
        >
          Back to all NIRF rankings
        </Button>
      </Stack>
    </Container>
  );
}
