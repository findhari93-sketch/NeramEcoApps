'use client';

import { Box, Stack, Typography } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CollegeListRowProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000 ? `₹${(val / 100000).toFixed(1)}L` : `₹${(val / 1000).toFixed(0)}K`;
}

export default function CollegeListRow({ college, rank }: CollegeListRowProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  return (
    <Box
      component={Link}
      href={href}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        px: 1.25,
        py: 0.75,
        borderBottom: '1px solid',
        borderColor: 'divider',
        textDecoration: 'none',
        color: 'inherit',
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
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
          width: 28, height: 28, borderRadius: 1, bgcolor: '#f8fafc',
          border: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}
      >
        {college.logo_url ? (
          <Image src={college.logo_url} alt="" width={22} height={22} style={{ objectFit: 'contain' }} />
        ) : (
          <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: 11 }}>
            {(college.short_name ?? college.name).charAt(0)}
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {college.name}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
          {college.city}{college.type ? ` · ${college.type}` : ''}{college.coa_approved ? ' · ✓ COA' : ''}
        </Typography>
      </Box>
      <Stack direction="row" gap={2} sx={{ flexShrink: 0, display: { xs: 'none', sm: 'flex' } }}>
        <Box sx={{ textAlign: 'right', minWidth: 50 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#059669', lineHeight: 1.1 }}>
            {formatFee(college.annual_fee_approx, college.annual_fee_min)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem' }}>Fee/yr</Typography>
        </Box>
        <Box sx={{ textAlign: 'right', minWidth: 40 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.78rem', lineHeight: 1.1 }}>
            {college.total_barch_seats ?? '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.58rem' }}>Seats</Typography>
        </Box>
      </Stack>
      <ChevronRightIcon sx={{ color: 'text.disabled', fontSize: 18, flexShrink: 0 }} />
    </Box>
  );
}
