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
  Chip,
  Stack,
} from '@mui/material';
import type { NIRFRankingWithCollege } from '@neram/database';

interface Props {
  rows: NIRFRankingWithCollege[];
  showYear?: boolean;
  locale: string;
}

function scoreColor(score: number | null): 'success' | 'warning' | 'default' {
  if (score === null) return 'default';
  if (score >= 75) return 'success';
  if (score >= 55) return 'warning';
  return 'default';
}

export default function NIRFRankingTable({ rows, showYear = true, locale }: Props) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 760 }}>
        <TableHead sx={{ bgcolor: '#f8fafc' }}>
          <TableRow>
            {showYear && (
              <TableCell sx={{ fontWeight: 700, width: 70 }}>Year</TableCell>
            )}
            <TableCell sx={{ fontWeight: 700, width: 70 }}>Rank</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>College</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>City / State</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 90 }}>Type</TableCell>
            <TableCell sx={{ fontWeight: 700, width: 100 }} align="right">
              Score
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: 70 }} align="right">
              TLR
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: 70 }} align="right">
              RPC
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: 70 }} align="right">
              GO
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: 70 }} align="right">
              OI
            </TableCell>
            <TableCell sx={{ fontWeight: 700, width: 70 }} align="right">
              PR
            </TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const college = r.college;
            const detailHref = college
              ? `/${locale}/colleges/rankings/nirf/${college.slug}`
              : null;
            return (
              <TableRow key={r.id} hover>
                {showYear && (
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {r.year}
                    </Typography>
                  </TableCell>
                )}
                <TableCell>
                  <Typography variant="body2" fontWeight={700} color="primary.main">
                    #{r.rank}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant="body2" fontWeight={600}>
                      {college?.name ?? r.source_name}
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {college?.naac_grade && (
                        <Chip
                          label={`NAAC ${college.naac_grade}`}
                          size="small"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                      {college?.neram_tier && (
                        <Chip
                          label={college.neram_tier}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.65rem' }}
                        />
                      )}
                    </Stack>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {college?.city ?? r.source_city}
                    {(college?.state || r.source_state) && (
                      <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                        , {college?.state ?? r.source_state}
                      </Typography>
                    )}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {college?.type ?? ''}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {r.score !== null ? (
                    <Chip
                      label={r.score.toFixed(2)}
                      size="small"
                      color={scoreColor(r.score)}
                      sx={{ fontWeight: 700, minWidth: 56 }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.disabled">
                      .
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">{fmt(r.tlr)}</TableCell>
                <TableCell align="right">{fmt(r.rpc)}</TableCell>
                <TableCell align="right">{fmt(r.go)}</TableCell>
                <TableCell align="right">{fmt(r.oi)}</TableCell>
                <TableCell align="right">{fmt(r.pr)}</TableCell>
                <TableCell>
                  {detailHref && (
                    <Link
                      href={detailHref}
                      style={{ fontSize: '0.72rem', whiteSpace: 'nowrap', color: 'inherit' }}
                    >
                      View history
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Paper>
  );
}

function fmt(n: number | null) {
  if (n === null) {
    return (
      <Typography variant="caption" color="text.disabled">
        .
      </Typography>
    );
  }
  return <Typography variant="caption">{n.toFixed(1)}</Typography>;
}
