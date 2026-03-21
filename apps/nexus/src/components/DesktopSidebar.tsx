'use client';

import { useRef, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Badge,
  Box,
  Typography,
  Avatar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useSidebarContext, SIDEBAR_EXPANDED, SIDEBAR_ICONS } from './SidebarProvider';
import { usePanelContext } from './PanelProvider';
import { useNavBadges } from './NavBadgeProvider';

// Re-export for backward compat (layouts import this)
export const SIDEBAR_WIDTH = SIDEBAR_EXPANDED;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

interface DesktopSidebarProps {
  items: NavItem[];
}

const TRANSITION = 'all 250ms cubic-bezier(0.2, 0, 0, 1)';

export default function DesktopSidebar({ items }: DesktopSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const { user, nexusRole } = useNexusAuthContext();
  const { sidebarState, cycle, toggle, expand } = useSidebarContext();
  const { currentPanelTitle } = usePanelContext();
  const { getBadgeCount } = useNavBadges();

  // Click delay pattern: single click waits 250ms, double-click cancels and fires toggle
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCollapseClick = useCallback(() => {
    if (clickTimer.current) {
      // Second click arrived within window → double-click → toggle (jump to extreme)
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggle();
    } else {
      // First click → wait to see if a second click follows
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        cycle();
      }, 250);
    }
  }, [cycle, toggle]);

  const isExpanded = sidebarState === 'expanded';
  const isIcons = sidebarState === 'icons';
  const isHidden = sidebarState === 'hidden';

  const isActive = (path: string) =>
    pathname === path || pathname.startsWith(path + '/');

  const currentWidth = isExpanded ? SIDEBAR_EXPANDED : isIcons ? SIDEBAR_ICONS : 0;

  return (
    <>
      {/* Main sidebar */}
      <Box
        component="nav"
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          width: currentWidth,
          minHeight: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: theme.zIndex.drawer,
          background: `linear-gradient(180deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.dark} 100%)`,
          color: '#fff',
          borderRight: 'none',
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: TRANSITION,
          transform: isHidden ? 'translateX(-100%)' : 'translateX(0)',
          opacity: isHidden ? 0 : 1,
        }}
      >
        {/* Brand */}
        <Box sx={{ px: isExpanded ? 2.5 : 0, pt: 3, pb: 1, textAlign: isIcons ? 'center' : 'left' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: '#fff',
              fontSize: isIcons ? '1.25rem' : undefined,
            }}
          >
            {isExpanded ? 'Nexus' : 'N'}
          </Typography>
          {isExpanded && (
            <Typography
              variant="caption"
              sx={{ color: alpha('#fff', 0.6), fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.625rem' }}
            >
              {currentPanelTitle}
            </Typography>
          )}
        </Box>

        <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: isExpanded ? 2 : 1, my: 1.5 }} />

        {/* Navigation */}
        <List sx={{ px: isExpanded ? 1.5 : 0.75, flex: 1 }}>
          {items.map((item) => {
            const active = isActive(item.path);
            const badgeCount = getBadgeCount(item.path);
            const button = (
              <ListItemButton
                key={item.path}
                onClick={() => router.push(item.path)}
                sx={{
                  borderRadius: 2.5,
                  mb: 0.5,
                  px: isExpanded ? 1.5 : 0,
                  py: 1,
                  minHeight: 44,
                  justifyContent: isIcons ? 'center' : 'flex-start',
                  bgcolor: active ? alpha('#fff', 0.18) : 'transparent',
                  color: active ? '#fff' : alpha('#fff', 0.7),
                  '&:hover': {
                    bgcolor: active ? alpha('#fff', 0.22) : alpha('#fff', 0.08),
                  },
                  transition: TRANSITION,
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: isIcons ? 0 : 36,
                    color: 'inherit',
                    justifyContent: 'center',
                    '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
                  }}
                >
                  <Badge
                    badgeContent={badgeCount}
                    color="error"
                    max={99}
                    sx={{
                      '& .MuiBadge-badge': {
                        fontSize: '0.625rem',
                        height: 18,
                        minWidth: 18,
                        padding: '0 4px',
                      },
                    }}
                  >
                    {item.icon}
                  </Badge>
                </ListItemIcon>
                {isExpanded && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontWeight: active ? 600 : 500,
                      letterSpacing: active ? '0.01em' : 0,
                    }}
                  />
                )}
                {isExpanded && active && (
                  <Box
                    sx={{
                      width: 4,
                      height: 20,
                      borderRadius: 2,
                      bgcolor: '#fff',
                      ml: 1,
                    }}
                  />
                )}
              </ListItemButton>
            );

            // Wrap in tooltip for icon-only mode
            if (isIcons) {
              return (
                <Tooltip key={item.path} title={item.label} placement="right" arrow>
                  {button}
                </Tooltip>
              );
            }
            return button;
          })}
        </List>

        {/* Single collapse toggle */}
        <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: isExpanded ? 2 : 1 }} />
        <Box
          sx={{
            display: 'flex',
            justifyContent: isExpanded ? 'flex-end' : 'center',
            px: isExpanded ? 1.5 : 0,
            py: 1,
          }}
        >
          <Tooltip title="Click: cycle · Double-click: hide/show" placement={isIcons ? 'right' : 'left'} arrow>
            <IconButton
              onClick={handleCollapseClick}
              size="small"
              sx={{ color: alpha('#fff', 0.7), '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.1) } }}
            >
              <MenuOpenIcon sx={{ fontSize: '1.25rem' }} />
            </IconButton>
          </Tooltip>
        </Box>

        {/* User section */}
        <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: isExpanded ? 2 : 1 }} />
        <Box sx={{ p: isExpanded ? 2 : 1, display: 'flex', alignItems: 'center', gap: isExpanded ? 1.5 : 0, justifyContent: isIcons ? 'center' : 'flex-start' }}>
          <Tooltip title={isIcons ? `${user?.name || 'User'} (${nexusRole || 'member'})` : ''} placement="right" arrow>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: alpha('#fff', 0.2),
                color: '#fff',
                fontSize: '0.875rem',
                fontWeight: 600,
                border: `2px solid ${alpha('#fff', 0.3)}`,
              }}
            >
              {user?.name?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>
          </Tooltip>
          {isExpanded && (
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.2 }} noWrap>
                {user?.name || 'User'}
              </Typography>
              <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), textTransform: 'capitalize', fontSize: '0.6875rem' }}>
                {nexusRole || 'member'}
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Floating reopen tab when sidebar is hidden */}
      {isHidden && (
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            position: 'fixed',
            top: '50%',
            left: 0,
            transform: 'translateY(-50%)',
            zIndex: theme.zIndex.drawer + 1,
          }}
        >
          <Tooltip title="Open sidebar" placement="right" arrow>
            <IconButton
              onClick={expand}
              sx={{
                width: 28,
                height: 48,
                borderRadius: '0 8px 8px 0',
                background: `linear-gradient(180deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
                color: '#fff',
                '&:hover': {
                  background: `linear-gradient(180deg, ${theme.palette.primary.dark}, ${theme.palette.primary.main})`,
                },
                boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
              }}
            >
              <ChevronRightIcon sx={{ fontSize: '1.1rem' }} />
            </IconButton>
          </Tooltip>
        </Box>
      )}
    </>
  );
}
