'use client';

import { Box } from '@mui/material';
import { alpha } from '@mui/material/styles';
import CheckIcon from '@mui/icons-material/Check';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { useCompareList } from '@/lib/college-hub/compare-store';
import { ctaButtonSx } from '../directory/hub-styles';

interface Props {
  slug: string;
  name: string;
  shortName: string;
  stateSlug: string | null;
}

/**
 * Phone action bar of the college page (canvas: Mobile · College page, bottom):
 * Compare and "Get admission help". Replaces the hub bottom nav on this page.
 */
export default function MobileActionBar({ slug, name, shortName, stateSlug }: Props) {
  const compare = useCompareList();
  const on = compare.has(slug);
  return (
    <>
      <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: 'calc(76px + env(safe-area-inset-bottom))' }} />
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          zIndex: 1150,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          gap: 1.25,
          px: 1.5,
          pt: 1.25,
          pb: 'max(14px, env(safe-area-inset-bottom))',
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          boxShadow: '0 -6px 18px rgba(15, 27, 45, 0.08)',
        }}
      >
        <Box
          component="button"
          type="button"
          aria-pressed={on}
          onClick={() => compare.toggle({ slug, name, shortName, stateSlug })}
          sx={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            height: 50,
            px: 1.75,
            border: '1px solid',
            borderColor: on ? 'primary.main' : 'grey.400',
            borderRadius: 1.5,
            bgcolor: (t) => (on ? alpha(t.palette.primary.main, 0.08) : t.palette.background.paper),
            color: on ? 'primary.dark' : 'text.primary',
            font: 'inherit',
            fontSize: '0.9rem',
            fontWeight: 700,
            cursor: 'pointer',
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          {on ? <CheckIcon aria-hidden sx={{ fontSize: 18 }} /> : <CompareArrowsIcon aria-hidden sx={{ fontSize: 18 }} />}
          {on ? 'Added' : 'Compare'}
        </Box>
        <Box
          component="a"
          href="#admission-help"
          sx={{ ...ctaButtonSx, flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 50, borderRadius: 1.5, fontSize: '1rem', textDecoration: 'none', '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
        >
          Get admission help
        </Box>
      </Box>
    </>
  );
}
