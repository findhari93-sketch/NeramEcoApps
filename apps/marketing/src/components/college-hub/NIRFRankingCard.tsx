import Link from 'next/link';
import { Box, Paper, Typography, Stack, Divider } from '@mui/material';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import type { NIRFRankingWithCollege } from '@neram/database';

interface Props {
  row: NIRFRankingWithCollege;
  locale: string;
  showYear?: boolean;
}

const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  government: { bg: '#dcfce7', fg: '#15803d' },
  private: { bg: '#fef3c7', fg: '#92400e' },
  deemed: { bg: '#e0e7ff', fg: '#3730a3' },
  autonomous: { bg: '#fce7f3', fg: '#9f1239' },
};

function typeChip(type?: string | null) {
  if (!type) return null;
  const key = type.toLowerCase();
  const c = TYPE_COLORS[key] ?? { bg: '#f3f4f6', fg: '#374151' };
  const label = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <Box
      sx={{
        display: 'inline-block',
        bgcolor: c.bg,
        color: c.fg,
        fontSize: '0.68rem',
        fontWeight: 600,
        px: 0.875,
        py: 0.25,
        borderRadius: 1,
        lineHeight: 1.4,
      }}
    >
      {label}
    </Box>
  );
}

export default function NIRFRankingCard({ row, locale, showYear = false }: Props) {
  const c = row.college;
  const detailHref = c ? `/${locale}/colleges/rankings/nirf/${c.slug}` : null;
  const innerCard = (
    <Paper
      variant="outlined"
      sx={{
        px: { xs: 1.75, sm: 2 },
        py: { xs: 1.5, sm: 1.75 },
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        transition: 'border-color 120ms ease, box-shadow 120ms ease',
        '&:hover': detailHref
          ? {
              borderColor: 'text.primary',
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
            }
          : undefined,
      }}
    >
      {/* Top row: rank badge + name/location + score */}
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box
          sx={{
            minWidth: 42,
            height: 42,
            borderRadius: 1,
            bgcolor: '#1a1612',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.8rem',
            flexShrink: 0,
          }}
        >
          #{row.rank}
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: { xs: '0.95rem', sm: '1rem' },
              lineHeight: 1.25,
              color: 'text.primary',
            }}
          >
            {c?.name ?? row.source_name}
          </Typography>
          <Stack
            direction="row"
            spacing={0.75}
            alignItems="center"
            sx={{ mt: 0.4, flexWrap: 'wrap', gap: 0.5 }}
          >
            <LocationOnOutlinedIcon
              sx={{ fontSize: 13, color: 'text.secondary' }}
            />
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: '0.75rem' }}
            >
              {c?.city ?? row.source_city ?? ''}
              {showYear ? ` · NIRF ${row.year}` : ''}
            </Typography>
            <Typography
              component="span"
              sx={{ color: 'text.disabled', fontSize: '0.75rem', mx: 0.25 }}
            >
              ·
            </Typography>
            {typeChip(c?.type)}
          </Stack>
        </Box>

        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: '1.5rem', sm: '1.65rem' },
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {row.score !== null ? row.score.toFixed(2) : '.'}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: 'block',
              fontSize: '0.65rem',
              fontWeight: 600,
              letterSpacing: 0.6,
              textTransform: 'uppercase',
              mt: 0.25,
            }}
          >
            Score
          </Typography>
        </Box>
      </Stack>

      <Divider sx={{ my: 1.25 }} />

      {/* Metric row: 5 columns */}
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
        }}
      >
        <MetricCell label="TLR" value={row.tlr} />
        <MetricCell label="RPC" value={row.rpc} />
        <MetricCell label="GO" value={row.go} />
        <MetricCell label="OI" value={row.oi} />
        <MetricCell label="PR" value={row.pr} />
      </Stack>
    </Paper>
  );

  if (!detailHref) return innerCard;
  return (
    <Link
      href={detailHref}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
      aria-label={`View ${c?.name ?? row.source_name} NIRF history`}
    >
      {innerCard}
    </Link>
  );
}

function MetricCell({ label, value }: { label: string; value: number | null }) {
  return (
    <Box sx={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
      <Typography
        sx={{
          fontWeight: 600,
          fontSize: '0.85rem',
          color: 'text.primary',
          lineHeight: 1.2,
        }}
      >
        {value !== null ? value.toFixed(1) : '.'}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{
          fontSize: '0.62rem',
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}
