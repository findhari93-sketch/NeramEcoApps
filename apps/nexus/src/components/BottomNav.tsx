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

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface BottomNavProps {
  items: NavItem[];
  /** Flat "More" sheet. Use `overflowGroups` instead when there are headings. */
  overflowItems?: NavItem[];
  /**
   * The "More" sheet under section headings. Preferred over `overflowItems`:
   * this sheet now holds everything the desktop sidebar shows minus the four
   * promoted tabs, which for Management is fourteen links, and fourteen
   * undifferentiated rows is how someone scrolls past the one they wanted.
   *
   * A group with an empty label renders its items with no heading.
   */
  overflowGroups?: NavGroup[];
}

/**
 * Mobile bottom navigation with Material 3 active indicator pill.
 * Hidden on desktop (md+) where DesktopSidebar takes over.
 * When overflow items are provided, a "More" button opens a bottom sheet drawer.
 */
export default function BottomNav({ items, overflowItems, overflowGroups }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { getBadgeCount } = useNavBadges();

  // One internal shape whichever prop the caller passed.
  const groups: NavGroup[] =
    overflowGroups && overflowGroups.length > 0
      ? overflowGroups.filter((g) => g.items.length > 0)
      : overflowItems && overflowItems.length > 0
        ? [{ label: '', items: overflowItems }]
        : [];
  const flatOverflow = groups.flatMap((g) => g.items);

  // Total badge count across overflow items (to show on "More" button)
  const overflowBadgeTotal = flatOverflow.reduce(
    (sum, item) => sum + getBadgeCount(item.path), 0,
  );

  if (!isMobile) return null;

  const hasOverflow = flatOverflow.length > 0;

  const activeIndex = items.findIndex(
    (item) => pathname === item.path || pathname.startsWith(item.path + '/')
  );

  // Check if current page is in the overflow items (to highlight "More")
  const isOverflowActive = flatOverflow.some(
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
              // 72vh, not 60: this sheet is now the ONLY way to reach most of
              // the app on a phone, so it earns the extra rows.
              maxHeight: '72vh',
              bgcolor: theme.palette.background.paper,
              // Stated rather than inherited. The sheet scrolls by design now,
              // and a default is a poor thing to rest a whole navigation on.
              overflowY: 'auto',
              overscrollBehavior: 'contain',
            },
          }}
        >
          {/* Puller handle. Sticks so the sheet still reads as a sheet once the
              list is long enough to scroll under it. */}
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              bgcolor: theme.palette.background.paper,
              display: 'flex',
              justifyContent: 'center',
              pt: 1.5,
              pb: 1,
            }}
          >
            <Box
              sx={{
                width: 32,
                height: 4,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.text.secondary, 0.3),
              }}
            />
          </Box>

          {/* The last row has to clear the iOS home indicator, or it sits under
              the gesture bar and cannot be tapped. */}
          <Box sx={{ pb: `calc(16px + env(safe-area-inset-bottom, 0px))` }}>
            {groups.map((group, gi) => (
              <Box key={group.label || `group-${gi}`}>
                {group.label && (
                  <Typography
                    variant="caption"
                    sx={{
                      px: 2.5,
                      pt: gi === 0 ? 0 : 1.5,
                      pb: 0.5,
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      fontSize: '0.625rem',
                      color: 'text.secondary',
                      display: 'block',
                    }}
                  >
                    {group.label}
                  </Typography>
                )}
                <List sx={{ px: 1, py: 0 }} disablePadding>
                  {group.items.map((item) => {
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
                          mb: 0.25,
                          py: 1.25,
                          px: 2,
                          // Material 3 minimum. The rows are comfortably above
                          // this already, but a shorter label must not shrink one.
                          minHeight: 48,
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
              </Box>
            ))}
          </Box>
        </SwipeableDrawer>
      )}
    </>
  );
}
