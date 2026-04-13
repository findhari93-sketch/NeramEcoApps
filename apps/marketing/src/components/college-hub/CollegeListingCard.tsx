import { Box, Card, CardActionArea, CardContent, Chip, Stack, Typography } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import VerifiedIcon from '@mui/icons-material/Verified';
import ArchIndexRing from './ArchIndexRing';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CollegeListingCardProps {
  college: CollegeListItem;
  compact?: boolean;
}

function formatFee(min: number | null, max: number | null, approx: number | null): string {
  const val = approx ?? min;
  if (!val) return 'Fee on request';
  if (val >= 100000) return `~₹${(val / 100000).toFixed(1)}L/yr`;
  return `~₹${(val / 1000).toFixed(0)}K/yr`;
}

export default function CollegeListingCard({ college, compact = false }: CollegeListingCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': {
          boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
          borderColor: 'primary.main',
        },
      }}
    >
      <CardActionArea component={Link} href={href} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
        {/* Hero image */}
        {!compact && college.hero_image_url && (
          <Box sx={{ position: 'relative', width: '100%', height: 140, overflow: 'hidden', bgcolor: '#f1f5f9' }}>
            <Image
              src={college.hero_image_url}
              alt={college.name}
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 600px) 100vw, (max-width: 900px) 50vw, 25vw"
            />
          </Box>
        )}

        <CardContent sx={{ flex: 1, p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" gap={1.5} alignItems="flex-start">
            {/* Logo */}
            <Box
              sx={{
                width: compact ? 36 : 44,
                height: compact ? 36 : 44,
                borderRadius: 1.5,
                overflow: 'hidden',
                bgcolor: '#f8fafc',
                border: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {college.logo_url ? (
                <Image
                  src={college.logo_url}
                  alt={`${college.name} logo`}
                  width={compact ? 36 : 44}
                  height={compact ? 36 : 44}
                  style={{ objectFit: 'contain' }}
                />
              ) : (
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.disabled' }}>
                  {(college.short_name ?? college.name).charAt(0)}
                </Typography>
              )}
            </Box>

            {/* Info */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" alignItems="center" gap={0.5}>
                <Typography
                  variant={compact ? 'body2' : 'subtitle2'}
                  sx={{
                    fontWeight: 700,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    lineHeight: 1.3,
                  }}
                >
                  {college.name}
                </Typography>
                {college.verified && (
                  <VerifiedIcon sx={{ fontSize: 14, color: '#2563eb', flexShrink: 0 }} />
                )}
              </Stack>

              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.25 }}>
                <LocationOnIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" noWrap>
                  {college.city}, {college.state}
                </Typography>
              </Stack>
            </Box>

            {/* ArchIndex ring */}
            {college.arch_index_score !== null && college.arch_index_score !== undefined && !compact && (
              <ArchIndexRing score={college.arch_index_score} size={52} showLabel={false} />
            )}
          </Stack>

          {/* Badges row */}
          {!compact && (
            <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1.25 }}>
              {college.coa_approved && (
                <Chip label="COA" size="small" color="success" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
              {college.naac_grade && (
                <Chip label={`NAAC ${college.naac_grade}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
              )}
              {(college.counseling_systems ?? []).map((s) => (
                <Chip key={s} label={s} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', color: '#6b21a8', borderColor: '#c4b5fd' }} />
              ))}
            </Stack>
          )}

          {/* Footer row */}
          <Stack
            direction="row"
            justifyContent="space-between"
            alignItems="center"
            sx={{ mt: compact ? 1 : 1.5 }}
          >
            <Typography
              variant="caption"
              sx={{ fontWeight: 600, color: 'primary.main' }}
            >
              {formatFee(college.annual_fee_min, college.annual_fee_max, college.annual_fee_approx)}
            </Typography>
            {college.total_barch_seats && (
              <Typography variant="caption" color="text.secondary">
                {college.total_barch_seats} seats
              </Typography>
            )}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
