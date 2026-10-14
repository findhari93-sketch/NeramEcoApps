'use client';

import Link from 'next/link';
import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { collegeHref, examList, ratingLabel, shortName, typeLabel } from '@/lib/college-hub/format';
import CollegeLogo from './CollegeLogo';
import { cardStats, isPaidListing } from './card-stats';
import { coaChipSx, examChipSx, featuredChipSx, hubType, statLabelSx } from './hub-styles';
import type { CompareProps } from './CollegeResultCard';

interface Props extends CompareProps {
  college: ListingCollege;
  rank: number;
}

/** Grid view tile (canvas: Desktop · Grid view). */
export default function CollegeGridTile({ college: c, rank, inCompare, onToggleCompare }: Props) {
  const href = collegeHref(c);
  const rating = ratingLabel(c);
  const stats = [
    ...cardStats(c).filter((s) => s.key === 'fee' || s.key === 'seats' || s.key === 'cutoff' || s.key === 'admission'),
    { key: 'naac', label: 'NAAC', value: c.naac_grade ?? 'Not graded', muted: !c.naac_grade },
  ];
  // Fee, NAAC, cutoff (or admission), seats: the canvas order.
  const order = ['fee', 'naac', 'cutoff', 'admission', 'seats'];
  stats.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

  return (
    <Box
      component="article"
      aria-labelledby={`tile-${c.id}`}
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: inCompare ? 'primary.main' : 'divider',
        borderRadius: 2,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(15, 27, 45, 0.05)',
      }}
    >
      <Box sx={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', gap: 1.25, p: 2, pb: 1.75, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, minHeight: 52 }}>
          <CollegeLogo name={c.name} logoUrl={c.logo_url} size={52} rank={rank} />
          {rating ? (
            <Typography sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.5, height: 30, px: 1.25, borderRadius: 4, bgcolor: (t) => alpha(t.palette.warning.main, 0.12), fontSize: '0.8rem' }}>
              <StarRoundedIcon aria-hidden sx={{ fontSize: 16, color: 'warning.dark' }} />
              <b>{rating}</b>
              <Box component="span" sx={{ color: 'text.secondary' }}>({c.review_count})</Box>
            </Typography>
          ) : isPaidListing(c) ? (
            <Box component="span" sx={featuredChipSx}>Featured · paid</Box>
          ) : null}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          <Typography
            id={`tile-${c.id}`}
            component="h3"
            sx={{
              m: 0,
              fontSize: hubType.tileTitle,
              lineHeight: 1.3,
              fontWeight: 700,
              minHeight: '2.6em',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            <Box component={Link} href={href} sx={{ color: 'text.primary', textDecoration: 'none', '&:hover': { color: 'primary.main' } }}>
              {c.name}
            </Box>
          </Typography>
          <Typography sx={{ m: 0, display: 'flex', alignItems: 'center', gap: 0.75, fontSize: hubType.meta, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <PlaceOutlinedIcon aria-hidden sx={{ fontSize: 15 }} />
            {c.city} · {typeLabel(c.type)}
          </Typography>
        </Box>
        <Box component="ul" aria-label="Approvals and accepted exams" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75, minHeight: 24 }}>
          {c.coa_approved && (
            <Box component="li" sx={{ ...coaChipSx, height: 24, px: 1 }}>
              <CheckIcon aria-hidden sx={{ fontSize: 13 }} />
              COA
            </Box>
          )}
          {examList(c.accepted_exams, 'short').map((e) => (
            <Box component="li" key={e} sx={{ ...examChipSx, height: 24, px: 1 }}>
              {e}
            </Box>
          ))}
        </Box>
        <Box
          component="dl"
          sx={{ m: 0, mt: 'auto', pt: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 12px' }}
        >
          {stats.map((s) => (
            <Box key={s.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.125, minWidth: 0 }}>
              <Box component="dt" sx={{ ...statLabelSx, fontSize: 11 }}>{s.label}</Box>
              <Box component="dd" sx={{ m: 0, fontSize: 14, fontWeight: s.muted ? 500 : 700, color: s.muted ? 'text.secondary' : 'text.primary', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.value}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          py: 0.5,
          pl: 1.75,
          pr: 1,
          borderTop: '1px solid',
          borderColor: 'divider',
          bgcolor: (t) => (inCompare ? alpha(t.palette.primary.main, 0.08) : t.palette.mode === 'light' ? t.palette.grey[50] : 'transparent'),
        }}
      >
        <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, height: 44, fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2, borderRadius: 1 } }}>
          <Box
            component="input"
            type="checkbox"
            checked={inCompare}
            onChange={onToggleCompare}
            aria-label={`Compare ${shortName(c)}`}
            sx={{ width: 18, height: 18, m: 0, accentColor: (t) => t.palette.primary.main, cursor: 'pointer' }}
          />
          Compare
        </Box>
        <Box
          component={Link}
          href={href}
          aria-label={`Details of ${c.name}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: 44, px: 1.25, fontSize: '0.875rem', fontWeight: 600, color: 'primary.dark', textDecoration: 'none', borderRadius: 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
        >
          Details
          <ArrowForwardIcon aria-hidden sx={{ fontSize: 16 }} />
        </Box>
      </Box>
    </Box>
  );
}
