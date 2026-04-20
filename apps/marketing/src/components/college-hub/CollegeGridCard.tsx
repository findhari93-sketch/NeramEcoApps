'use client';

import { Box, Card, Chip, Stack, Typography } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CollegeGridCardProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000 ? `₹${(val / 100000).toFixed(1)}L` : `₹${(val / 1000).toFixed(0)}K`;
}

export default function CollegeGridCard({ college, rank }: CollegeGridCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  return (
    <Card
      component={Link}
      href={href}
      variant="outlined"
      sx={{
        borderRadius: 2,
        p: 1.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.2s, border-color 0.2s, transform 0.2s',
        height: '100%',
        '&:hover': { boxShadow: 2, borderColor: 'primary.light', transform: 'translateY(-1px)' },
      }}
    >
      <Stack direction="row" alignItems="center" gap={1}>
        <Box
          sx={{
            width: 22, height: 22, borderRadius: '50%', bgcolor: 'action.hover',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 11, color: 'text.secondary', flexShrink: 0,
          }}
        >
          {rank}
        </Box>
        <Box
          sx={{
            width: 36, height: 36, borderRadius: 1.5, bgcolor: '#f8fafc',
            border: '1px solid', borderColor: 'divider',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, overflow: 'hidden',
          }}
        >
          {college.logo_url ? (
            <Image src={college.logo_url} alt="" width={30} height={30} style={{ objectFit: 'contain' }} />
          ) : (
            <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: 13 }}>
              {(college.short_name ?? college.name).charAt(0)}
            </Typography>
          )}
        </Box>
        <Typography
          sx={{
            fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.2,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {college.name}
        </Typography>
      </Stack>

      <Stack direction="row" gap={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
        <LocationOnIcon sx={{ fontSize: 12 }} />
        <Typography variant="caption" sx={{ fontSize: '0.68rem' }}>
          {college.city}{college.type ? ` · ${college.type}` : ''}
        </Typography>
      </Stack>

      <Stack direction="row" gap={0.5} flexWrap="wrap">
        {college.coa_approved && (
          <Chip label="COA" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#dcfce7', color: '#166534', fontWeight: 600 }} />
        )}
        {college.naac_grade && (
          <Chip label={`NAAC ${college.naac_grade}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#fef3c7', color: '#854d0e', fontWeight: 600 }} />
        )}
      </Stack>

      <Box sx={{ mt: 'auto', pt: 0.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between' }}>
        <Box>
          <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#059669' }}>
            {formatFee(college.annual_fee_approx, college.annual_fee_min)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem' }}>Fee/yr</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.78rem' }}>
            {college.total_barch_seats ?? '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem' }}>Seats</Typography>
        </Box>
      </Box>
    </Card>
  );
}
