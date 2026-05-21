import Link from 'next/link';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
} from '@mui/material';
import type { NIRFRankingWithCollege } from '@neram/database';

interface Props {
  rows: NIRFRankingWithCollege[];
  years: number[];
  locale: string;
}

/**
 * Pivot view: one row per college, one column per year, cell = rank.
 * Useful for spotting movement across years at a glance.
 */
export default function NIRFCompareTable({ rows, years, locale }: Props) {
  // Group rows by college slug
  const byCollege = new Map<string, { college: NIRFRankingWithCollege['college']; perYear: Map<number, NIRFRankingWithCollege> }>();
  for (const r of rows) {
    if (!r.college) continue;
    const slug = r.college.slug;
    if (!byCollege.has(slug)) {
      byCollege.set(slug, { college: r.college, perYear: new Map() });
    }
    byCollege.get(slug)!.perYear.set(r.year, r);
  }

  const sortedYears = [...years].sort((a, b) => b - a);
  const latestYear = sortedYears[0];

  // Sort colleges by latest-year rank (ascending), fallback by best-rank-ever
  const collegeList = Array.from(byCollege.values()).sort((a, b) => {
    const aRank = a.perYear.get(latestYear)?.rank ?? Math.min(...Array.from(a.perYear.values()).map((r) => r.rank));
    const bRank = b.perYear.get(latestYear)?.rank ?? Math.min(...Array.from(b.perYear.values()).map((r) => r.rank));
    return aRank - bRank;
  });

  if (collegeList.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No colleges match the current filters.</Typography>
      </Box>
    );
  }

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 100 + sortedYears.length * 90 }}>
        <TableHead sx={{ bgcolor: '#f8fafc' }}>
          <TableRow>
            <TableCell sx={{ fontWeight: 700, position: 'sticky', left: 0, bgcolor: '#f8fafc', zIndex: 1 }}>
              College
            </TableCell>
            {sortedYears.map((y) => (
              <TableCell key={y} align="center" sx={{ fontWeight: 700 }}>
                {y}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {collegeList.map(({ college, perYear }) => (
            <TableRow key={college!.slug} hover>
              <TableCell sx={{ position: 'sticky', left: 0, bgcolor: 'background.paper', zIndex: 1 }}>
                <Link
                  href={`/${locale}/colleges/rankings/nirf/${college!.slug}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  <Typography variant="body2" fontWeight={600}>
                    {college!.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {college!.city}, {college!.state}
                  </Typography>
                </Link>
              </TableCell>
              {sortedYears.map((y) => {
                const r = perYear.get(y);
                if (!r) {
                  return (
                    <TableCell key={y} align="center">
                      <Typography variant="caption" color="text.disabled">
                        .
                      </Typography>
                    </TableCell>
                  );
                }
                return (
                  <TableCell key={y} align="center">
                    <Box>
                      <Typography variant="body2" fontWeight={700} color="primary.main">
                        #{r.rank}
                      </Typography>
                      {r.score !== null && (
                        <Typography variant="caption" color="text.secondary">
                          {r.score.toFixed(1)}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
}
