'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { collegeHref, examList, ratingLabel, shortName, typeLabel } from '@/lib/college-hub/format';
import SaveCollegeButton from '../SaveCollegeButton';
import CollegeLogo from './CollegeLogo';
import { cardStats, isPaidListing } from './card-stats';
import {
  coaChipSx,
  examChipSx,
  featuredChipSx,
  naacChipSx,
  noNaacChipSx,
  hubType,
  statLabelSx,
} from './hub-styles';
import { tokens } from '@/design-system';

export interface CompareProps {
  inCompare: boolean;
  onToggleCompare: () => void;
}

interface Props extends CompareProps {
  college: ListingCollege;
  rank: number;
}

/** List view card (canvas: Desktop · List view). */
export default function CollegeResultCard({ college: c, rank, inCompare, onToggleCompare }: Props) {
  const href = collegeHref(c);
  const rating = ratingLabel(c);
  const exams = examList(c.accepted_exams);
  const stats = cardStats(c);
  const paid = isPaidListing(c);

  return (
    <Box
      component="article"
      aria-labelledby={`college-${c.id}`}
      sx={{
        bgcolor: tokens.surface,
        border: '1px solid',
        borderColor: inCompare ? tokens.navy900 : paid ? tokens.goldTintBorder : tokens.line,
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: 'none',
        transition: 'border-color 0.2s',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: { xs: 2, md: 2.5 }, p: { xs: 2, md: 2.5 }, pb: { md: 2 } }}>
        <Box sx={{ display: 'flex', gap: 2, flex: '1 1 440px', minWidth: 0 }}>
          <CollegeLogo name={c.name} logoUrl={c.logo_url} size={56} rank={rank} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 }}>
            {paid && (
              <Box component="span" sx={{ ...featuredChipSx, alignSelf: 'flex-start' }}>
                Featured · paid listing
              </Box>
            )}
            <Typography
              id={`college-${c.id}`}
              component="h3"
              sx={{ m: 0, fontSize: hubType.cardTitle, lineHeight: 1.3, fontWeight: 700, letterSpacing: '-0.01em', textWrap: 'pretty' }}
            >
              <Box
                component={Link}
                href={href}
                sx={{ color: tokens.ink, textDecoration: 'none', '&:hover': { color: tokens.navy900 }, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2, borderRadius: 1 } }}
              >
                {c.name}
              </Box>
            </Typography>
            <Typography sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, fontSize: hubType.meta, color: tokens.inkMuted, m: 0 }}>
              <PlaceOutlinedIcon aria-hidden sx={{ fontSize: 15 }} />
              <span>
                {c.city}, {c.state}
              </span>
              <span aria-hidden>·</span>
              <span>{typeLabel(c.type)}</span>
            </Typography>
            <Box component="ul" aria-label="Approvals and accepted exams" sx={{ listStyle: 'none', m: 0, mt: 0.25, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
              {c.coa_approved && (
                <Box component="li" sx={coaChipSx}>
                  <CheckIcon aria-hidden sx={{ fontSize: 14 }} />
                  COA approved
                </Box>
              )}
              {c.naac_grade ? (
                <Box component="li" sx={naacChipSx}>NAAC {c.naac_grade}</Box>
              ) : (
                <Box component="li" sx={noNaacChipSx}>No NAAC grade</Box>
              )}
              {exams.map((e) => (
                <Box component="li" key={e} sx={examChipSx}>
                  {e}
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {rating && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 0.25, flex: '0 0 auto' }}>
            <Typography sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <StarRoundedIcon aria-hidden sx={{ fontSize: 18, color: tokens.gold800 }} />
              <Box component="span" sx={{ fontSize: 18, fontWeight: 700 }}>{rating}</Box>
              <Box component="span" sx={{ fontSize: 12.5, color: tokens.inkMuted }}>/ 5</Box>
            </Typography>
            <Box component={Link} href={`${href}#reviews`} sx={{ fontSize: 12.5, fontWeight: 500, color: tokens.navy900 }}>
              {c.review_count} student {c.review_count === 1 ? 'review' : 'reviews'}
            </Box>
          </Box>
        )}
      </Box>

      <Box
        sx={{
          borderTop: '1px solid',
          borderColor: tokens.line,
          bgcolor: tokens.ground,
          px: { xs: 2, md: 2.5 },
          py: 1.25,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: { xs: 1.5, md: 2.5 },
        }}
      >
        <Box
          component="dl"
          sx={{ m: 0, flex: '1 1 420px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(110px, 100%), 1fr))', gap: '10px 20px' }}
        >
          {stats.map((s) => (
            <Box key={s.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.25, minWidth: 0 }}>
              <Box component="dt" sx={statLabelSx}>{s.label}</Box>
              <Box
                component="dd"
                sx={{ m: 0, fontSize: hubType.stat, fontWeight: s.muted ? 500 : 700, color: s.muted ? tokens.inkMuted : tokens.ink, fontVariantNumeric: 'tabular-nums' }}
              >
                {s.value}
              </Box>
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.25 }}>
          <Box
            component="label"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              height: 44,
              px: 1.75,
              boxSizing: 'border-box',
              border: '1px solid',
              borderColor: inCompare ? tokens.navy900 : tokens.lineStrong,
              borderRadius: 1,
              bgcolor: inCompare ? tokens.surfaceHover : tokens.surface,
              fontSize: hubType.meta,
              fontWeight: 600,
              cursor: 'pointer',
              '&:focus-within': { outline: tokens.focusOutline, outlineOffset: 2 },
            }}
          >
            <Box
              component="input"
              type="checkbox"
              checked={inCompare}
              onChange={onToggleCompare}
              aria-label={`Compare ${shortName(c)}`}
              sx={{ width: 18, height: 18, m: 0, accentColor: tokens.navy900, cursor: 'pointer' }}
            />
            Compare
          </Box>
          <Box
            sx={{
              width: 44,
              height: 44,
              border: '1px solid',
              borderColor: tokens.lineStrong,
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: tokens.surface,
              '& .MuiIconButton-root': { width: 42, height: 42 },
            }}
          >
            <SaveCollegeButton slug={c.slug} collegeId={c.id} collegeName={c.name} size="small" />
          </Box>
          <Button
            component={Link}
            href={href}
            variant="contained"
            disableElevation
            endIcon={<ArrowForwardIcon />}
            sx={{ minHeight: 44, height: 44, px: 2.25, borderRadius: 1, fontSize: hubType.meta }}
          >
            View details
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
