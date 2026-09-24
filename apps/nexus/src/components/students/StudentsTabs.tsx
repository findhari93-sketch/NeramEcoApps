'use client';

import { Box, Typography, useTheme, alpha } from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { usePathname, useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

const WATCHLIST_HREF = '/teacher/students/watchlist';

const TABS = [
  { label: 'All Students', short: 'All', href: '/teacher/students', Icon: PeopleOutlinedIcon, feature: null },
  { label: 'City-Wise', short: 'By city', href: '/teacher/students/city-wise', Icon: MapOutlinedIcon, feature: null },
  {
    label: 'Watchlist',
    short: 'Watchlist',
    href: WATCHLIST_HREF,
    Icon: WarningAmberOutlinedIcon,
    feature: 'staff.students-watchlist',
  },
];

/**
 * Persistent segmented control shared by the Students list and City-Wise views.
 *
 * Lives in the students/ layout so switching views never loses the tab bar
 * (the old design rendered <Tabs> inside the list page only). The active tab is
 * derived from the pathname; drill/detail routes ([id], city-wise/[city]) render
 * their own back + breadcrumb instead, so we return null there.
 */
export default function StudentsTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const { isFeatureEnabled } = useNexusAuthContext();

  const tabs = TABS.filter((t) => !t.feature || isFeatureEnabled(t.feature));
  const onTopLevel = tabs.some((t) => t.href === pathname);
  if (!onTopLevel) return null;

  return (
    <Box sx={{ mb: { xs: 1.5, sm: 2.5 } }}>
      <Typography
        variant="h5"
        component="h1"
        sx={{ fontWeight: 800, mb: { xs: 1, sm: 1.5 }, letterSpacing: '-0.01em', fontSize: { xs: '1.35rem', sm: '1.5rem' } }}
      >
        Students
      </Typography>

      {/* The tabs never wrap, and three of them are wider than a 375px phone.
          The bar may scroll itself; it must never push the page sideways. */}
      <Box
        role="tablist"
        aria-label="Students views"
        sx={{
          // 2026-09-24: on a phone the three tabs share the width equally, with
          // short labels. Their full names ran to about 380px, so "Watchlist"
          // was cut to "Watc" at the edge of a 375px screen.
          display: { xs: 'grid', sm: 'inline-flex' },
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
          width: { xs: '100%', sm: 'auto' },
          gap: 0.5,
          p: 0.5,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          border: `1px solid ${theme.palette.divider}`,
          maxWidth: '100%',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {tabs.map(({ label, short, href, Icon }) => {
          const active = pathname === href;
          return (
            <Box
              key={href}
              role="tab"
              aria-selected={active}
              aria-label={label}
              tabIndex={0}
              onClick={() => !active && router.push(href)}
              onKeyDown={(e) => {
                if (!active && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  router.push(href);
                }
              }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                px: { xs: 0.5, sm: 2.5 },
                py: 1,
                minHeight: 44,
                minWidth: 0,
                flexShrink: 0,
                borderRadius: 2,
                fontWeight: 700,
                fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                whiteSpace: 'nowrap',
                cursor: active ? 'default' : 'pointer',
                color: active ? 'primary.main' : 'text.secondary',
                bgcolor: active ? 'background.paper' : 'transparent',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                transition: 'color .2s, background-color .2s, box-shadow .2s',
                '&:hover': active
                  ? {}
                  : { color: 'text.primary', bgcolor: alpha(theme.palette.primary.main, 0.05) },
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: 2,
                },
              }}
            >
              <Icon sx={{ fontSize: 18 }} />
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{label}</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{short}</Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
