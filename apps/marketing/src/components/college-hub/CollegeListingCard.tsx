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
import {
  COURSE_DURATION_YEARS,
  CITY_TIER_LIVING_COST,
  DEFAULT_LIVING_COST,
  MATERIALS_TRAVEL_COST,
} from '@/lib/college-hub/constants';

interface CollegeListingCardProps {
  college: CollegeListItem;
  compact?: boolean;
}

function formatFee(min: number | null, max: number | null, approx: number | null): string {
  const val = approx ?? min;
  if (!val) return 'N/A';
  return val >= 100000
    ? `₹${(val / 100000).toFixed(1)}L/yr`
    : `₹${(val / 1000).toFixed(0)}K/yr`;
}

function calcROI(college: CollegeListItem) {
  const annualFee = college.annual_fee_approx ?? college.annual_fee_min;
  const avgPkg = college.avg_placement_salary;
  if (!annualFee || !avgPkg) return null;

  const livingCost = CITY_TIER_LIVING_COST[college.city_slug ?? ''] ?? DEFAULT_LIVING_COST;
  const totalCost = (annualFee + livingCost + MATERIALS_TRAVEL_COST) * COURSE_DURATION_YEARS;
  const paybackYears = totalCost / avgPkg;

  return {
    totalCost,
    avgPkg,
    paybackYears: Math.round(paybackYears * 10) / 10,
  };
}

function formatLakhs(val: number): string {
  return `₹${(val / 100000).toFixed(0)}L`;
}

export default function CollegeListingCard({ college, compact }: CollegeListingCardProps) {
  const roi = calcROI(college);
  const href = `/colleges/${college.state_slug ?? 'india'}/${college.slug}`;
  const isPremium = college.neram_tier === 'gold' || college.neram_tier === 'platinum';

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        overflow: 'hidden',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        '&:hover': { boxShadow: 3, borderColor: 'primary.light' },
      }}
    >
      <Stack direction={{ xs: 'column', sm: compact ? 'column' : 'row' }}>
        {/* Campus photo */}
        {!compact && (
          <Box
            sx={{
              position: 'relative',
              width: { xs: '100%', sm: 180 },
              height: { xs: 140, sm: 'auto' },
              minHeight: { sm: 200 },
              bgcolor: '#1e293b',
              flexShrink: 0,
            }}
          >
            {college.hero_image_url ? (
              <Image
                src={college.hero_image_url}
                alt={`${college.name} campus`}
                fill
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 600px) 100vw, 180px"
              />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <Typography variant="h3" sx={{ color: 'rgba(255,255,255,0.2)', fontWeight: 800 }}>
                  {(college.short_name ?? college.name).charAt(0)}
                </Typography>
              </Box>
            )}
            {/* Logo overlay */}
            {college.logo_url && (
              <Box
                sx={{
                  position: 'absolute',
                  bottom: 8,
                  left: 8,
                  width: 40,
                  height: 40,
                  bgcolor: 'white',
                  borderRadius: 1.5,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image src={college.logo_url} alt="" width={36} height={36} style={{ objectFit: 'contain' }} />
              </Box>
            )}
            {/* Featured badge */}
            {isPremium && (
              <Chip
                label="Featured"
                size="small"
                sx={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  bgcolor: '#f97316',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: '0.65rem',
                  height: 22,
                }}
              />
            )}
          </Box>
        )}

        {/* Info section */}
        <Box sx={{ p: { xs: 1.5, sm: 2 }, flex: 1, minWidth: 0 }}>
          {/* Name & location */}
          <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.9rem', sm: '0.95rem' },
                lineHeight: 1.3,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                '&:hover': { color: 'primary.main' },
              }}
            >
              {college.name}
            </Typography>
          </Link>
          <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
            <LocationOnIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {college.city}, {college.state}
              {college.type ? ` · ${college.type}` : ''}
            </Typography>
          </Stack>

          {/* Badges */}
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 1 }}>
            {college.coa_approved && (
              <Chip label="COA ✓" size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontSize: '0.65rem', height: 22, fontWeight: 500 }} />
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

          {/* ROI snapshot */}
          {roi && !compact && (
            <Box
              sx={{
                mt: 1.5,
                p: 1,
                bgcolor: '#f0fdf4',
                border: '1px solid',
                borderColor: '#bbf7d0',
                borderRadius: 1.5,
              }}
            >
              <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Total {COURSE_DURATION_YEARS}yr Cost</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#dc2626', fontSize: '0.8rem' }}>
                    {formatLakhs(roi.totalCost)}
                  </Typography>
                </Box>
                <Typography color="text.disabled" sx={{ fontSize: '0.8rem' }}>→</Typography>
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>Avg Package</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#16a34a', fontSize: '0.8rem' }}>
                    {formatLakhs(roi.avgPkg)}/yr
                  </Typography>
                </Box>
                <Chip
                  label={`~${roi.paybackYears}yr payback`}
                  size="small"
                  sx={{ bgcolor: '#1e40af', color: 'white', fontWeight: 600, fontSize: '0.65rem', height: 24 }}
                />
              </Stack>
            </Box>
          )}

          {/* Fee display for compact mode or when no ROI */}
          {(!roi || compact) && (
            <Typography variant="body2" sx={{ mt: 1, fontWeight: 600, color: 'primary.main' }}>
              {formatFee(college.annual_fee_min, college.annual_fee_max, college.annual_fee_approx)}
              {college.total_barch_seats ? ` · ${college.total_barch_seats} seats` : ''}
            </Typography>
          )}

          {/* Action buttons */}
          {!compact && (
            <Stack direction="row" gap={0.75} sx={{ mt: 1.5 }} alignItems="center">
              <Button
                component={Link}
                href={href}
                variant="contained"
                size="small"
                sx={{ flex: 1, textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', py: 0.75 }}
              >
                View Details
              </Button>
              {college.admissions_phone && (
                <Tooltip title={`Call ${college.admissions_phone}`}>
                  <IconButton
                    component="a"
                    href={`tel:${college.admissions_phone}`}
                    size="small"
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
                  >
                    <PhoneIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              {college.brochure_url && (
                <Tooltip title="Download Brochure">
                  <IconButton
                    component="a"
                    href={college.brochure_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}
                  >
                    <DescriptionIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              )}
              <CompareButton slug={college.slug} collegeName={college.name} />
              <SaveCollegeButton slug={college.slug} collegeId={college.id} collegeName={college.name} size="small" />
            </Stack>
          )}
        </Box>
      </Stack>
    </Card>
  );
}
