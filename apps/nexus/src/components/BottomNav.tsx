'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Badge,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  Box,
  alpha,
  useMediaQuery,
  useTheme,
  SwipeableDrawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@neram/ui';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import { useNavBadges } from './NavBadgeProvider';

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface BottomNavProps {
  items: NavItem[];
  overflowItems?: NavItem[];
}

/**
 * Mobile bottom navigation with Material 3 active indicator pill.
 * Hidden on desktop (md+) where DesktopSidebar takes over.
 * When overflowItems are provided, a "More" button opens a bottom sheet drawer.
 */
export default function BottomNav({ items, overflowItems = [] }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { getBadgeCount } = useNavBadges();

  // Total badge count across overflow items (to show on "More" button)
  const overflowBadgeTotal = overflowItems.reduce(
    (sum, item) => sum + getBadgeCount(item.path), 0,
  );

  if (!isMobile) return null;

  const hasOverflow = overflowItems.length > 0;

  const activeIndex = items.findIndex(
    (item) => pathname === item.path || pathname.startsWith(item.path + '/')
  );

  // Check if current page is in the overflow items (to highlight "More")
  const isOverflowActive = overflowItems.some(
    (item) => pathname === item.path || pathname.startsWith(item.path + '/')
  );

  // Total nav items count: primary items + "More" (if overflow exists)
  const totalCount = items.length + (hasOverflow ? 1 : 0);
  const moreIndex = hasOverflow ? items.length : -1;

  // Determine the active value for BottomNavigation
  const activeValue = activeIndex >= 0
    ? activeIndex
    : isOverflowActive
      ? moreIndex
      : false;

  return (
    <>
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
          value={activeValue}
          onChange={(_, newValue) => {
            if (hasOverflow && newValue === moreIndex) {
              setDrawerOpen(true);
            } else {
              router.push(items[newValue].path);
            }
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
          {items.map((item, index) => {
            const badgeCount = getBadgeCount(item.path);
            return (
              <BottomNavigationAction
                key={item.path}
                label={item.label}
                icon={
                  <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                    <Badge badgeContent={badgeCount} color="error" max={99} sx={{ '& .MuiBadge-badge': { fontSize: '0.575rem', height: 16, minWidth: 16, padding: '0 3px' } }}>
                      {item.icon}
                    </Badge>
                  </Box>
                }
              />
            );
          })}
          {hasOverflow && (
            <BottomNavigationAction
              key="__more__"
              label="More"
              icon={
                <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isOverflowActive && (
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
                  <Badge badgeContent={overflowBadgeTotal} color="error" max={99} sx={{ '& .MuiBadge-badge': { fontSize: '0.575rem', height: 16, minWidth: 16, padding: '0 3px' } }}>
                    <MoreHorizIcon />
                  </Badge>
                </Box>
              }
            />
          )}
        </BottomNavigation>
      </Paper>

      {/* Overflow Drawer */}
      {hasOverflow && (
        <SwipeableDrawer
          anchor="bottom"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onOpen={() => setDrawerOpen(true)}
          disableSwipeToOpen
          swipeAreaWidth={0}
          slotProps={{
            backdrop: {
              sx: { bgcolor: alpha(theme.palette.common.black, 0.3) },
            },
          }}
          PaperProps={{
            sx: {
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '60vh',
              bgcolor: theme.palette.background.paper,
            },
          }}
        >
          {/* Puller handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
            <Box
              sx={{
                width: 32,
                height: 4,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.secondary, 0.3),
              }}
            />
          </Box>

          <Typography
            variant="caption"
            sx={{
              px: 2,
              pt: 0.5,
              pb: 1,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: '0.625rem',
              color: 'text.secondary',
              display: 'block',
            }}
          >
            More
          </Typography>

          <List sx={{ px: 1, pb: 2 }}>
            {overflowItems.map((item) => {
              const isActive = pathname === item.path || pathname.startsWith(item.path + '/');
              const badgeCount = getBadgeCount(item.path);
              return (
                <ListItemButton
                  key={item.path}
                  onClick={() => {
                    setDrawerOpen(false);
                    router.push(item.path);
                  }}
                  sx={{
                    borderRadius: 2,
                    mb: 0.5,
                    py: 1.25,
                    px: 2,
                    bgcolor: isActive ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                    '&:hover': {
                      bgcolor: isActive
                        ? alpha(theme.palette.primary.main, 0.12)
                        : alpha(theme.palette.action.hover, 0.04),
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      minWidth: 36,
                      color: isActive ? 'primary.main' : 'text.secondary',
                      '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                    }}
                  >
                    <Badge badgeContent={badgeCount} color="error" max={99} sx={{ '& .MuiBadge-badge': { fontSize: '0.575rem', height: 16, minWidth: 16, padding: '0 3px' } }}>
                      {item.icon}
                    </Badge>
                  </ListItemIcon>
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'primary.main' : 'text.primary',
                    }}
                  />
                </ListItemButton>
              );
            })}
          </List>
        </SwipeableDrawer>
      )}
    </>
  );
}
