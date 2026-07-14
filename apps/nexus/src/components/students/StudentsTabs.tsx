'use client';

import { Box, Typography, useTheme, alpha } from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [
  { label: 'All Students', href: '/teacher/students', Icon: PeopleOutlinedIcon },
  { label: 'City-Wise', href: '/teacher/students/city-wise', Icon: MapOutlinedIcon },
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

  const onTopLevel =
    pathname === '/teacher/students' || pathname === '/teacher/students/city-wise';
  if (!onTopLevel) return null;

  return (
    <Box sx={{ mb: 2.5 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 800, mb: 1.5, letterSpacing: '-0.01em' }}>
        Students
      </Typography>

      <Box
        role="tablist"
        aria-label="Students views"
        sx={{
          display: 'inline-flex',
          gap: 0.5,
          p: 0.5,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.primary.main, 0.06),
          border: `1px solid ${theme.palette.divider}`,
          maxWidth: '100%',
        }}
      >
        {TABS.map(({ label, href, Icon }) => {
          const active = pathname === href;
          return (
            <Box
              key={href}
              role="tab"
              aria-selected={active}
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
                px: { xs: 1.75, sm: 2.5 },
                py: 1,
                minHeight: 40,
                borderRadius: 2,
                fontWeight: 700,
                fontSize: '0.875rem',
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
              {label}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
