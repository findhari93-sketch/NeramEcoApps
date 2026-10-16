import Link from 'next/link';
import { localePrefix } from '@/lib/college-hub/detail-content';
import {
  Box,
  Paper,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Stack,
} from '@mui/material';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import type { NIRFRankingWithCollege } from '@neram/database';
import { siteTokens } from '@neram/ui/site-tokens';

interface Props {
  rows: NIRFRankingWithCollege[];
  showYear?: boolean;
  locale: string;
}

const TYPE_COLORS: Record<string, { bg: string; fg: string; ring?: string }> = {
  government: { bg: siteTokens.surface, fg: siteTokens.success, ring: siteTokens.success },
  private: { bg: siteTokens.goldTintBg, fg: siteTokens.gold800 },
  deemed: { bg: siteTokens.surfaceHover, fg: siteTokens.ink },
  autonomous: { bg: siteTokens.surface, fg: siteTokens.navy900, ring: siteTokens.lineStrong },
};

function typeChip(type?: string | null) {
  if (!type) return null;
  const key = type.toLowerCase();
  const c = TYPE_COLORS[key] ?? { bg: siteTokens.surfaceHover, fg: siteTokens.ink };
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        bgcolor: c.bg,
        color: c.fg,
        boxShadow: 'ring' in c && c.ring ? `inset 0 0 0 1px ${c.ring}` : 'none',
        fontSize: '0.65rem',
        fontWeight: 600,
        px: 0.75,
        py: 0.125,
        borderRadius: 1,
        lineHeight: 1.4,
      }}
    >
      {label}
    </Box>
  );
}

export default function NIRFRankingTable({ rows, showYear = false, locale }: Props) {
  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 1,
        overflowX: 'auto',
        border: '1px solid',
        borderColor: siteTokens.line,
      }}
    >
      <Table size="small" sx={{ minWidth: 880 }}>
        <TableHead sx={{ bgcolor: siteTokens.ground }}>
          <TableRow>
            <HCell width={64}>Rank</HCell>
            {showYear && <HCell width={64}>Year</HCell>}
            <HCell>College</HCell>
            <HCell width={140}>City / State</HCell>
            <HCell width={92} align="right">
              Score
            </HCell>
            <HCell width={56} align="right">
              TLR
            </HCell>
            <HCell width={56} align="right">
              RPC
            </HCell>
            <HCell width={56} align="right">
              GO
            </HCell>
            <HCell width={56} align="right">
              OI
            </HCell>
            <HCell width={56} align="right">
              PR
            </HCell>
            <TableCell sx={{ width: 90, py: 1 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => {
            const college = r.college;
            const detailHref = college
              ? `${localePrefix(locale)}/colleges/rankings/nirf/${college.slug}`
              : null;
            return (
              <TableRow
                key={r.id}
                hover
                sx={{ '& td': { borderColor: siteTokens.line, py: 1.25 } }}
              >
                <TableCell>
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 36,
                      height: 36,
                      px: 0.75,
                      borderRadius: 1,
                      bgcolor: siteTokens.navy900,
                      color: siteTokens.paper,
                      fontWeight: 700,
                      fontSize: '0.78rem',
                    }}
                  >
                    #{r.rank}
                  </Box>
                </TableCell>
                {showYear && (
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.82rem' }}>
                      {r.year}
                    </Typography>
                  </TableCell>
                )}
                <TableCell>
                  <Stack spacing={0.4}>
                    <Typography
                      variant="body2"
                      fontWeight={600}
                      sx={{ fontSize: '0.88rem', lineHeight: 1.25 }}
                    >
                      {college?.name ?? r.source_name}
                    </Typography>
                    <Stack
                      direction="row"
                      spacing={0.75}
                      alignItems="center"
                      sx={{ flexWrap: 'wrap', gap: 0.5 }}
                    >
                      {typeChip(college?.type)}
                      {college?.naac_grade && (
                        <Typography
                          variant="caption"
                          color={siteTokens.inkMuted}
                          sx={{ fontSize: '0.68rem' }}
                        >
                          NAAC {college.naac_grade}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <LocationOnOutlinedIcon
                      sx={{ fontSize: 14, color: siteTokens.inkMuted }}
                    />
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
                      {college?.city ?? r.source_city ?? '.'}
                      {(college?.state || r.source_state) && (
                        <Typography
                          component="span"
                          variant="caption"
                          color={siteTokens.inkMuted}
                          sx={{ ml: 0.5, fontSize: '0.72rem' }}
                        >
                          {college?.state ?? r.source_state}
                        </Typography>
                      )}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {r.score !== null ? r.score.toFixed(2) : '.'}
                  </Typography>
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
                      style={{
                        fontSize: '0.75rem',
                        whiteSpace: 'nowrap',
                        color: siteTokens.ink,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      View history →
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

function HCell({
  children,
  width,
  align,
}: {
  children: React.ReactNode;
  width?: number;
  align?: 'right' | 'left' | 'center';
}) {
  return (
    <TableCell
      align={align}
      sx={{
        width,
        py: 1,
        fontSize: '0.7rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: siteTokens.inkMuted,
        borderColor: siteTokens.line,
      }}
    >
      {children}
    </TableCell>
  );
}

function fmt(n: number | null) {
  if (n === null) {
    return (
      <Typography variant="caption" color={siteTokens.inkMuted} sx={{ fontSize: '0.78rem' }}>
        .
      </Typography>
    );
  }
  return (
    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>
      {n.toFixed(1)}
    </Typography>
  );
}
