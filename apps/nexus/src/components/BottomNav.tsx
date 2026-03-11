'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  useMediaQuery,
  useTheme,
} from '@neram/ui';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  items: NavItem[];
}

/**
 * Mobile-first bottom navigation bar.
 * Only visible on screens smaller than md breakpoint.
 * Touch targets are 48px minimum per Material 3 guidelines.
 */
export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!isMobile) return null;

  // Find the active tab by matching the current path
  const activeIndex = items.findIndex(
    (item) => pathname === item.path || pathname.startsWith(item.path + '/')
  );

  return (
    <Paper
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: theme.zIndex.appBar,
        borderTop: `1px solid ${theme.palette.divider}`,
      }}
      elevation={3}
    >
      <BottomNavigation
        value={activeIndex >= 0 ? activeIndex : 0}
        onChange={(_, newValue) => {
          router.push(items[newValue].path);
        }}
        showLabels
        sx={{
          height: 56,
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            padding: '4px 0',
            minHeight: 48,
            color: 'text.secondary',
            '&.Mui-selected': {
              color: 'primary.main',
            },
            '& .MuiSvgIcon-root': {
              fontSize: '1.35rem',
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.6875rem',
              fontWeight: 500,
              '&.Mui-selected': {
                fontSize: '0.6875rem',
                fontWeight: 600,
              },
            },
          },
        }}
      >
        {items.map((item) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            icon={item.icon}
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
