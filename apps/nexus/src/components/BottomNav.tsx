'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Box,
  alpha,
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
 * Mobile bottom navigation with Material 3 active indicator pill.
 * Hidden on desktop (md+) where DesktopSidebar takes over.
 */
export default function BottomNav({ items }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!isMobile) return null;

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
        borderTop: 'none',
        boxShadow: `0 -1px 12px ${alpha(theme.palette.common.black, 0.06)}`,
      }}
      elevation={0}
    >
      <BottomNavigation
        value={activeIndex >= 0 ? activeIndex : 0}
        onChange={(_, newValue) => {
          router.push(items[newValue].path);
        }}
        showLabels
        sx={{
          height: 64,
          bgcolor: alpha(theme.palette.background.paper, 0.95),
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          '& .MuiBottomNavigationAction-root': {
            minWidth: 0,
            padding: '6px 0 4px',
            minHeight: 48,
            color: 'text.secondary',
            transition: 'color 200ms ease',
            position: 'relative',
            '&.Mui-selected': {
              color: 'primary.main',
            },
            '& .MuiSvgIcon-root': {
              fontSize: '1.3rem',
              position: 'relative',
              zIndex: 1,
            },
            '& .MuiBottomNavigationAction-label': {
              fontSize: '0.6875rem',
              fontWeight: 500,
              marginTop: '2px',
              position: 'relative',
              zIndex: 1,
              transition: 'font-weight 200ms ease',
              '&.Mui-selected': {
                fontSize: '0.6875rem',
                fontWeight: 700,
              },
            },
          },
        }}
      >
        {items.map((item, index) => (
          <BottomNavigationAction
            key={item.path}
            label={item.label}
            icon={
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* M3 Active Indicator Pill */}
                {activeIndex === index && (
                  <Box
                    sx={{
                      position: 'absolute',
                      width: 56,
                      height: 28,
                      borderRadius: 14,
                      bgcolor: alpha(theme.palette.primary.main, 0.12),
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                      transition: 'all 250ms cubic-bezier(0.2, 0, 0, 1)',
                    }}
                  />
                )}
                {item.icon}
              </Box>
            }
          />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
