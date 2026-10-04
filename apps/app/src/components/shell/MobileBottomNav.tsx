'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box } from '@neram/ui';
import { alpha } from '@mui/material/styles';
import { MOBILE_NAV_TABS, isNavActive } from '@/lib/navigation-data';

export const BOTTOM_NAV_HEIGHT = 64;

/**
 * Phone tab bar. Real links (not router.push) so Next prefetches each tab and
 * long-press, open-in-new-tab and screen readers behave like links.
 */
export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        display: { xs: 'block', md: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        pb: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <Box
        component="ul"
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${MOBILE_NAV_TABS.length}, 1fr)`,
          height: BOTTOM_NAV_HEIGHT,
          listStyle: 'none',
          m: 0,
          p: 0,
          maxWidth: 600,
          mx: 'auto',
        }}
      >
        {MOBILE_NAV_TABS.map(({ label, href, Icon, matchPrefix }) => {
          const active = isNavActive(pathname, href, matchPrefix);
          return (
            <li key={href} style={{ display: 'flex' }}>
              <Box
                component={Link}
                href={href}
                aria-current={active ? 'page' : undefined}
                sx={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.5,
                  minWidth: 0,
                  color: active ? 'text.primary' : 'text.secondary',
                  WebkitTapHighlightColor: 'transparent',
                  '&:focus-visible': { outlineOffset: -4, borderRadius: 3 },
                }}
              >
                <Box
                  sx={{
                    width: 56,
                    height: 30,
                    borderRadius: 999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: (theme) => (active ? alpha(theme.palette.primary.main, 0.14) : 'transparent'),
                    color: active ? 'primary.main' : 'inherit',
                    transition: 'background-color 0.2s ease',
                  }}
                >
                  <Icon sx={{ fontSize: 22 }} />
                </Box>
                <Box
                  component="span"
                  sx={{
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    fontWeight: active ? 700 : 500,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                </Box>
              </Box>
            </li>
          );
        })}
      </Box>
    </Box>
  );
}
