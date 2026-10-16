'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box } from '@mui/material';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { compareHref, useCompareList } from '@/lib/college-hub/compare-store';
import { tokens } from '@/design-system';

/**
 * Phone bottom nav for the College Hub (canvas: Mobile · Results). Only on
 * /colleges pages and only below 900px; a spacer keeps the footer clear of it.
 */
export default function HubBottomNav() {
  const pathname = usePathname() ?? '';
  const { list, count } = useCompareList();
  const path = pathname.replace(/^\/[a-z]{2}(?=\/)/, '');

  const items = [
    { href: '/colleges', label: 'Colleges', Icon: SchoolOutlinedIcon, current: path === '/colleges' || (/^\/colleges\/[^/]+(\/[^/]+)?$/.test(path) && !/^\/colleges\/(saved|compare)/.test(path)) },
    { href: '/colleges/saved', label: 'Saved', Icon: FavoriteBorderIcon, current: path.startsWith('/colleges/saved') },
    { href: count ? compareHref(list) : '/colleges/compare', label: 'Compare', Icon: CompareArrowsIcon, current: path.startsWith('/colleges/compare'), badge: count },
    { href: '/nata-hub', label: 'Exams', Icon: MenuBookOutlinedIcon, current: false },
  ];

  return (
    <>
      <Box aria-hidden sx={{ display: { xs: 'block', md: 'none' }, height: 'calc(64px + env(safe-area-inset-bottom))' }} />
      <Box
        component="nav"
        aria-label="College hub"
        sx={{
          display: { xs: 'grid', md: 'none' },
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          position: 'fixed',
          zIndex: 1150,
          left: 0,
          right: 0,
          bottom: 0,
          height: 'calc(64px + env(safe-area-inset-bottom))',
          pb: 'env(safe-area-inset-bottom)',
          boxSizing: 'border-box',
          bgcolor: tokens.surface,
          borderTop: '1px solid',
          borderColor: tokens.line,
        }}
      >
        {items.map(({ href, label, Icon, current, badge }) => (
          <Box
            key={label}
            component={Link}
            href={href}
            aria-current={current ? 'page' : undefined}
            sx={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.375,
              color: current ? tokens.navy900 : tokens.inkMuted,
              textDecoration: 'none',
              fontSize: '0.72rem',
              fontWeight: current ? 700 : 600,
              '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: -4 },
            }}
          >
            <Icon aria-hidden sx={{ fontSize: 24 }} />
            {label}
            {badge ? (
              <Box component="span" aria-label={`${badge} added`} sx={{ position: 'absolute', top: 8, left: 'calc(50% + 6px)', minWidth: 18, height: 18, px: 0.5, boxSizing: 'border-box', borderRadius: `${tokens.radiusPill}px`, bgcolor: tokens.navy900, color: tokens.paper, fontSize: '0.66rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {badge}
              </Box>
            ) : null}
          </Box>
        ))}
      </Box>
    </>
  );
}
