'use client';

import { Box, Card, Chip, Stack, Typography, Button } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface CompactCollegeCardProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L`
    : `₹${(val / 1000).toFixed(0)}K`;
}

export default function CompactCollegeCard({ college, rank }: CompactCollegeCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;

  return (
    <Card
      component={Link}
      href={href}
      variant="outlined"
      sx={{
        borderRadius: 3,
        p: { xs: 1.5, sm: 2 },
        mb: 1.5,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1.5, sm: 2 },
        textDecoration: 'none',
        color: 'inherit',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 2, borderColor: 'primary.light' },
      }}
    >
      <Box
        sx={{
          width: 32, height: 32, borderRadius: '50%', bgcolor: 'action.hover',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: 14, color: 'text.secondary', flexShrink: 0,
        }}
      >
        {rank}
      </Box>
      <Box
        sx={{
          width: 44, height: 44, borderRadius: 2, bgcolor: '#f8fafc',
          border: '1px solid', borderColor: 'divider',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, overflow: 'hidden',
        }}
      >
        {college.logo_url ? (
          <Image src={college.logo_url} alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
        ) : (
          <Typography sx={{ fontWeight: 600, color: 'primary.main', fontSize: 16 }}>
            {(college.short_name ?? college.name).charAt(0)}
          </Typography>
        )}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{ fontWeight: 600, fontSize: { xs: '0.85rem', sm: '0.9rem' }, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {college.name}
        </Typography>
        <Stack direction="row" gap={0.5} alignItems="center" sx={{ mt: 0.3 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
            📍 {college.city}{college.type ? ` · ${college.type}` : ''}
            {college.coa_approved ? ' · ' : ''}
          </Typography>
          {college.coa_approved && (
            <Typography variant="caption" sx={{ color: '#166534', fontWeight: 500, fontSize: '0.7rem' }}>✓ COA</Typography>
          )}
        </Stack>
      </Box>
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.5, flexShrink: 0 }}>
        {college.accepted_exams?.slice(0, 1).map((exam) => (
          <Chip key={exam} label={exam} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.6rem', height: 20, fontWeight: 500 }} />
        ))}
      </Box>
      <Stack direction="row" gap={{ xs: 2, sm: 3 }} sx={{ flexShrink: 0 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', color: '#059669' }}>
            {formatFee(college.annual_fee_approx, college.annual_fee_min)}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Fee/yr</Typography>
        </Box>
        <Box sx={{ textAlign: 'center' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
            {college.total_barch_seats ?? '-'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>Seats</Typography>
        </Box>
      </Stack>
      <Box sx={{ display: { xs: 'none', sm: 'block' }, flexShrink: 0 }}>
        <Button size="small" variant="contained" sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderRadius: 1.5, px: 2 }}>
          Details
        </Button>
      </Box>
      <ChevronRightIcon sx={{ display: { xs: 'block', sm: 'none' }, color: 'text.disabled', fontSize: 22, flexShrink: 0 }} />
    </Card>
  );
}
