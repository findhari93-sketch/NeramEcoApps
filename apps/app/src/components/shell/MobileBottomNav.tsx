'use client';

import { Box, BottomNavigation, BottomNavigationAction } from '@neram/ui';
import { usePathname, useRouter } from 'next/navigation';
import { MOBILE_NAV_TABS } from '@/lib/navigation-data';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  // Determine active tab index based on current path
  const activeIndex = MOBILE_NAV_TABS.findIndex((tab) => {
    if (tab.href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(tab.href);
  });

  return (
    <Box
      sx={{
        display: { xs: 'block', sm: 'none' },
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        borderTop: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <BottomNavigation
        value={activeIndex >= 0 ? activeIndex : 0}
        onChange={(_e, newValue) => {
          router.push(MOBILE_NAV_TABS[newValue].href);
        }}
        showLabels
        sx={{
          height: 56,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            py: 0.5,
            '&.Mui-selected': {
              color: 'primary.main',
            },
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: '0.6rem',
            '&.Mui-selected': {
              fontSize: '0.65rem',
              fontWeight: 600,
            },
          },
        }}
      >
        {MOBILE_NAV_TABS.map((tab) => (
          <BottomNavigationAction
            key={tab.href}
            label={tab.label}
            icon={tab.icon}
          />
        ))}
      </BottomNavigation>
    </Box>
  );
}
