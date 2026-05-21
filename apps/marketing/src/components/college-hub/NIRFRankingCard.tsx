import Link from 'next/link';
import { Box, Paper, Typography, Chip, Stack, Divider } from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { NIRFRankingWithCollege } from '@neram/database';

interface Props {
  row: NIRFRankingWithCollege;
  locale: string;
  showYear?: boolean;
}

export default function NIRFRankingCard({ row, locale, showYear = true }: Props) {
  const c = row.college;
  const detailHref = c ? `/${locale}/colleges/rankings/nirf/${c.slug}` : null;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <Box
          sx={{
            minWidth: 52,
            minHeight: 52,
            borderRadius: 1.5,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            px: 1,
          }}
        >
          <Typography variant="caption" sx={{ fontSize: '0.6rem', lineHeight: 1 }}>
            RANK
          </Typography>
          <Typography variant="h6" fontWeight={800} sx={{ lineHeight: 1.2 }}>
            #{row.rank}
          </Typography>
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
            {c?.name ?? row.source_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {c?.city ?? row.source_city}
            {(c?.state || row.source_state) && `, ${c?.state ?? row.source_state}`}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
        {showYear && (
          <Chip
            label={`NIRF ${row.year}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 700, fontSize: '0.7rem' }}
          />
        )}
        {row.score !== null && (
          <Chip
            label={`Score ${row.score.toFixed(2)}`}
            size="small"
            color="success"
            sx={{ fontWeight: 700, fontSize: '0.7rem' }}
          />
        )}
        {c?.type && (
          <Chip
            label={c.type}
            size="small"
            variant="outlined"
            sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
          />
        )}
        {c?.naac_grade && (
          <Chip label={`NAAC ${c.naac_grade}`} size="small" sx={{ fontSize: '0.7rem' }} />
        )}
      </Stack>

      <Divider />

      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <MetricChip label="TLR" value={row.tlr} />
        <MetricChip label="RPC" value={row.rpc} />
        <MetricChip label="GO" value={row.go} />
        <MetricChip label="OI" value={row.oi} />
        <MetricChip label="PR" value={row.pr} />
      </Stack>

      {detailHref && (
        <Box sx={{ pt: 0.5 }}>
          <Link
            href={detailHref}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontWeight: 600,
              fontSize: '0.85rem',
              minHeight: 48,
              color: '#1976d2',
            }}
          >
            View history <ArrowForwardIcon fontSize="small" />
          </Link>
        </Box>
      )}
    </Paper>
  );
}

function MetricChip({ label, value }: { label: string; value: number | null }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 56,
        px: 1,
        py: 0.5,
        bgcolor: '#f8fafc',
        borderRadius: 1,
      }}
    >
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700}>
        {value !== null ? value.toFixed(1) : '.'}
      </Typography>
    </Box>
  );
}
