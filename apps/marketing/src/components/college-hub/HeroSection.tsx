import { Box, Chip, Stack, Typography, Link as MuiLink } from '@mui/material';
import Image from 'next/image';
import VerifiedIcon from '@mui/icons-material/Verified';
import HandshakeIcon from '@mui/icons-material/Handshake';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import BadgePills from './BadgePills';
import ArchIndexRing from './ArchIndexRing';
import { TIER_CONFIG } from '@/lib/college-hub/constants';
import type { College } from '@/lib/college-hub/types';

interface HeroSectionProps {
  college: College;
  /** Answer-first summary under the H1 (detail page). id="college-summary" is the speakable target. */
  summary?: string;
  /** "Last updated" date (pre-formatted on the server) and the sources shown on the page. */
  updated?: { iso: string; label: string } | null;
  sources?: string[];
  /** CC BY credit on the cover photo. Detail page only. */
  showPhotoCredit?: boolean;
}

export default function HeroSection({ college, summary, updated, sources = [], showPhotoCredit = false }: HeroSectionProps) {
  const credit = showPhotoCredit ? college.hero_image_credit?.trim() : null;
  const creditHref = college.hero_image_source_url?.trim() || null;
  const tier = TIER_CONFIG[college.neram_tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.free;
  const hasHero = !!college.hero_image_url;

  return (
    <Box>
      {/* Hero banner */}
      {hasHero && (
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: { xs: 180, sm: 240, md: 300 },
            bgcolor: '#1e293b',
            overflow: 'hidden',
          }}
        >
          <Image
            src={college.hero_image_url!}
            alt={`${college.name} campus`}
            fill
            priority
            style={{ objectFit: 'cover', opacity: 0.85 }}
            sizes="100vw"
          />
          {credit && (
            <Typography
              component="p"
              sx={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                m: 0,
                px: 1,
                py: 0.25,
                maxWidth: '100%',
                fontSize: '0.75rem',
                lineHeight: 1.6,
                color: '#fff',
                bgcolor: 'rgba(15, 23, 42, 0.72)',
                borderTopLeftRadius: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Photo:{' '}
              {creditHref ? (
                <MuiLink
                  href={creditHref}
                  target="_blank"
                  rel="nofollow noopener"
                  sx={{
                    color: 'inherit',
                    textDecorationColor: 'rgba(255,255,255,0.7)',
                    display: 'inline-block',
                    py: 0.5,
                    '&:focus-visible': { outline: '2px solid #fff', outlineOffset: 2 },
                  }}
                >
                  {credit}
                </MuiLink>
              ) : (
                credit
              )}
            </Typography>
          )}
        </Box>
      )}

      {/* Main info block */}
      <Box sx={{ px: { xs: 2, sm: 3, md: 4 }, py: { xs: 2.5, sm: 3 } }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          gap={2}
          alignItems={{ xs: 'flex-start', sm: 'flex-start' }}
        >
          {/* Logo */}
          <Box
            sx={{
              width: { xs: 64, sm: 80 },
              height: { xs: 64, sm: 80 },
              borderRadius: 2,
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
                width={80}
                height={80}
                style={{ objectFit: 'contain' }}
              />
            ) : (
              <Typography variant="h4" sx={{ color: 'text.disabled', fontWeight: 700 }}>
                {(college.short_name ?? college.name).charAt(0)}
              </Typography>
            )}
          </Box>

          {/* Name + meta */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '1.35rem', sm: '1.6rem', md: '1.875rem' },
                  fontWeight: 800,
                  lineHeight: 1.2,
                  color: 'text.primary',
                }}
              >
                {college.name}
              </Typography>
              {college.verified && (
                <VerifiedIcon sx={{ color: '#2563eb', fontSize: 20 }} titleAccess="Verified by Neram" />
              )}
              {college.partnership_page_status === 'approved' && (
                <Chip
                  icon={<HandshakeIcon sx={{ fontSize: 13, '&&': { color: '#15803d' } }} />}
                  label="Neram Partner"
                  size="small"
                  sx={{
                    bgcolor: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    fontWeight: 600,
                    fontSize: '0.68rem',
                  }}
                />
              )}
              <Chip
                label={tier.label}
                size="small"
                sx={{
                  bgcolor: tier.bgColor,
                  color: tier.color,
                  border: `1px solid ${tier.borderColor}`,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                }}
              />
            </Stack>

            {/* Location */}
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
              <LocationOnIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2" color="text.secondary">
                {[college.city, college.state].filter(Boolean).join(', ')}
                {college.type && ` · ${college.type}`}
                {college.established_year && ` · Est. ${college.established_year}`}
              </Typography>
            </Stack>

            {/* Affiliation */}
            {(college.affiliated_university ?? college.affiliation) && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                Affiliated to {college.affiliated_university ?? college.affiliation}
              </Typography>
            )}

            {/* Badges */}
            <Box sx={{ mt: 1.5 }}>
              <BadgePills
                coa_approved={college.coa_approved}
                naac_grade={college.naac_grade}
                nba_accredited={college.nba_accredited}
                nirf_rank_architecture={college.nirf_rank_architecture}
                accepted_exams={college.accepted_exams}
                counseling_systems={college.counseling_systems}
                maxVisible={5}
              />
            </Box>
          </Box>

          {/* ArchIndex ring */}
          {college.arch_index_score !== null && college.arch_index_score !== undefined && (
            <Box sx={{ flexShrink: 0, display: { xs: 'none', sm: 'block' } }}>
              <ArchIndexRing score={college.arch_index_score} size={88} />
            </Box>
          )}
        </Stack>

        {/* Mobile ArchIndex */}
        {college.arch_index_score !== null && college.arch_index_score !== undefined && (
          <Box sx={{ display: { xs: 'flex', sm: 'none' }, mt: 2, alignItems: 'center', gap: 2 }}>
            <ArchIndexRing score={college.arch_index_score} size={72} />
            <Typography variant="caption" color="text.secondary">
              Neram ArchIndex: composite rating based on studio, faculty, placements, and more.
            </Typography>
          </Box>
        )}

        {/* Answer-first summary (server-rendered facts) */}
        {summary && (
          <Typography
            id="college-summary"
            component="p"
            sx={{ mt: 2, fontSize: '1rem', lineHeight: 1.6, color: 'text.primary', maxWidth: 720 }}
          >
            {summary}
          </Typography>
        )}
        {updated && (
          <Typography component="p" sx={{ mt: 1, fontSize: '0.875rem', lineHeight: 1.5, color: 'text.secondary' }}>
            Last updated <time dateTime={updated.iso}>{updated.label}</time>
            {sources.length > 0 && ` · Sources: ${sources.join(', ')}`}
          </Typography>
        )}

        {/* Website link */}
        {college.website && (
          <Box sx={{ mt: 2 }}>
            <MuiLink
              href={college.website}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.875rem' }}
            >
              Visit official website <OpenInNewIcon sx={{ fontSize: 14 }} />
            </MuiLink>
          </Box>
        )}
      </Box>
    </Box>
  );
}
