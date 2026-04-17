'use client';

import { Box, Card, Chip, Stack, Typography, IconButton, Button, Tooltip } from '@mui/material';
import Image from 'next/image';
import Link from 'next/link';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import PhoneIcon from '@mui/icons-material/Phone';
import DescriptionIcon from '@mui/icons-material/Description';
import SaveCollegeButton from './SaveCollegeButton';
import CompareButton from './CompareButton';
import type { CollegeListItem } from '@/lib/college-hub/types';

interface FeaturedCollegeCardProps {
  college: CollegeListItem;
  rank: number;
}

function formatFee(approx: number | null, min: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L/yr`
    : `₹${(val / 1000).toFixed(0)}K/yr`;
}

function formatSalary(val: number | null): string {
  if (!val) return 'N/A';
  return `₹${(val / 100000).toFixed(1)}L/yr`;
}

export default function FeaturedCollegeCard({ college, rank }: FeaturedCollegeCardProps) {
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
  const isPremium = college.neram_tier === 'gold' || college.neram_tier === 'platinum';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 4,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 4, borderColor: 'primary.light' },
        mb: 2,
      }}
    >
      {/* Campus Photo */}
      <Box sx={{ position: 'relative', width: '100%', height: { xs: 150, sm: 200 } }}>
        {college.hero_image_url ? (
          <Image
            src={college.hero_image_url}
            alt={`${college.name} campus`}
            fill
            style={{ objectFit: 'cover' }}
            sizes="(max-width: 900px) 100vw, 700px"
            priority={rank <= 2}
          />
        ) : (
          <Box
            sx={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, #1e3a5f, #2d5a87)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Typography sx={{ color: 'rgba(255,255,255,0.15)', fontWeight: 800, fontSize: '5rem' }}>
              {(college.short_name ?? college.name).charAt(0)}
            </Typography>
          </Box>
        )}
        <Box sx={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(transparent, rgba(0,0,0,0.4))' }} />
        {isPremium && (
          <Chip
            label="⭐ Featured"
            size="small"
            sx={{
              position: 'absolute', top: 12, left: 12, zIndex: 2,
              background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white',
              fontWeight: 600, fontSize: '0.65rem', height: 24,
            }}
          />
        )}
        <Box
          sx={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 40, height: 40, borderRadius: '50%', bgcolor: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 16, color: 'primary.main',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          #{rank}
        </Box>
        <Box
          sx={{
            position: 'absolute', bottom: -20, left: 16, zIndex: 3,
            width: 48, height: 48, borderRadius: 2, bgcolor: 'white', border: '2px solid white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)', overflow: 'hidden',
          }}
        >
          {college.logo_url ? (
            <Image src={college.logo_url} alt="" width={40} height={40} style={{ objectFit: 'contain' }} />
          ) : (
            <Typography sx={{ fontWeight: 700, color: 'primary.main', fontSize: 20 }}>
              {(college.short_name ?? college.name).charAt(0)}
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ p: { xs: 2, sm: 2.5 }, pt: { xs: 4, sm: 4 } }}>
        <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography
            variant="h6"
            sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' }, lineHeight: 1.3, '&:hover': { color: 'primary.main' } }}
          >
            {college.name}
          </Typography>
        </Link>
        <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
          <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {college.city}, {college.state}{college.type ? ` · ${college.type}` : ''}
          </Typography>
        </Stack>

        <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1.5 }}>
          {college.coa_approved && (
            <Chip label="✓ COA" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
          )}
          {college.naac_grade && (
            <Chip label={`NAAC ${college.naac_grade}`} size="small" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
          )}
          {college.accepted_exams?.slice(0, 2).map((exam) => (
            <Chip key={exam} label={exam} size="small" sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
          ))}
          {college.counseling_systems?.slice(0, 2).map((sys) => (
            <Chip key={sys} label={sys} size="small" sx={{ bgcolor: '#f3e8ff', color: '#6b21a8', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
          ))}
        </Stack>

        <Box
          sx={{
            mt: 2, pt: 1.5, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'divider', pb: 1.5,
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 1, textAlign: 'center',
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: '#059669' }}>
              {formatFee(college.annual_fee_approx, college.annual_fee_min)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Annual Fee</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {college.total_barch_seats ?? 'N/A'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>B.Arch Seats</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: 'primary.main' }}>
              {formatSalary(college.avg_placement_salary)}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Avg Package</Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' } }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>
              {college.highlights?.[0] ?? 'N/A'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Highlight</Typography>
          </Box>
        </Box>

        <Stack direction="row" gap={1} sx={{ mt: 2 }} alignItems="center" flexWrap="wrap">
          <Button
            component={Link}
            href={href}
            variant="contained"
            size="small"
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', px: 3, borderRadius: 2 }}
          >
            View Details
          </Button>
          <CompareButton slug={college.slug} collegeName={college.name} />
          {college.brochure_url && (
            <Tooltip title="Download Brochure">
              <IconButton component="a" href={college.brochure_url} target="_blank" rel="noopener noreferrer" size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <DescriptionIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
          <SaveCollegeButton slug={college.slug} collegeId={college.id} collegeName={college.name} size="small" />
          {college.admissions_phone && (
            <Tooltip title={`Call ${college.admissions_phone}`}>
              <IconButton component="a" href={`tel:${college.admissions_phone}`} size="small" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
                <PhoneIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </Box>
    </Card>
  );
}
