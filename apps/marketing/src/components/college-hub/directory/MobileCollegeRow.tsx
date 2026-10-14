'use client';

import Link from 'next/link';
import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import CheckIcon from '@mui/icons-material/Check';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import type { ListingCollege } from '@/lib/college-hub/listing-filter';
import { collegeHref, feeLabel, naacLabel, ratingLabel, seatsLabel, shortName, typeLabel } from '@/lib/college-hub/format';
import CollegeLogo from './CollegeLogo';
import { isPaidListing } from './card-stats';
import type { CompareProps } from './CollegeResultCard';

interface Props extends CompareProps {
  college: ListingCollege;
}

/** Compact phone row (canvas: Mobile · Results). Every view renders these below 900px. */
export default function MobileCollegeRow({ college: c, inCompare, onToggleCompare }: Props) {
  const fee = feeLabel(c, 'short');
  const seats = seatsLabel(c, 'short');
  const rating = ratingLabel(c);
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        py: 1.5,
        pl: 2,
        pr: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: (t) => (inCompare ? alpha(t.palette.primary.main, 0.06) : t.palette.background.paper),
      }}
    >
      <Box
        component={Link}
        href={collegeHref(c)}
        sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.primary', textDecoration: 'none', borderRadius: 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' } }}
      >
        <CollegeLogo name={c.name} logoUrl={c.logo_url} size={44} />
        <Box sx={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
          {isPaidListing(c) && (
            <Box component="span" sx={{ fontSize: '0.7rem', fontWeight: 700, color: (t) => t.palette.secondary.dark }}>
              Featured · paid
            </Box>
          )}
          <Box component="span" sx={{ fontSize: '0.95rem', fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.name}
          </Box>
          <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {c.city} · {typeLabel(c.type, 'short')} · {naacLabel(c.naac_grade)}
          </Box>
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.82rem', color: 'text.secondary', flexWrap: 'wrap' }}>
            {!fee.startsWith('₹') && seats === 'Not published' ? (
              <span>Fee and seats not published</span>
            ) : (
              <>
                <Box component="b" sx={{ color: fee.startsWith('₹') ? 'text.primary' : 'text.secondary', fontWeight: fee.startsWith('₹') ? 700 : 500 }}>{fee}</Box>
                <span aria-hidden>·</span>
                <span>{seats}</span>
              </>
            )}
            {rating && (
              <>
                <span aria-hidden>·</span>
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                  <StarRoundedIcon aria-hidden sx={{ fontSize: 14, color: 'warning.dark' }} />
                  <Box component="b" sx={{ color: 'text.primary' }}>{rating}</Box>
                </Box>
              </>
            )}
          </Box>
        </Box>
      </Box>
      <Box
        component="button"
        type="button"
        aria-pressed={inCompare}
        aria-label={`Compare ${shortName(c)}`}
        onClick={onToggleCompare}
        sx={{
          flex: '0 0 44px',
          width: 44,
          height: 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 0,
          bgcolor: 'transparent',
          cursor: 'pointer',
          borderRadius: '50%',
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main' },
        }}
      >
        <Box
          component="span"
          sx={{
            width: 32,
            height: 32,
            boxSizing: 'border-box',
            borderRadius: '50%',
            border: '1.5px solid',
            borderColor: inCompare ? 'primary.main' : 'grey.400',
            bgcolor: inCompare ? 'primary.main' : 'background.paper',
            color: inCompare ? 'primary.contrastText' : 'text.secondary',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {inCompare ? <CheckIcon aria-hidden sx={{ fontSize: 17 }} /> : <AddIcon aria-hidden sx={{ fontSize: 17 }} />}
        </Box>
      </Box>
    </Box>
  );
}
