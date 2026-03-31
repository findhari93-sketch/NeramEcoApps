'use client';

import { useRef, useCallback, useState } from 'react';
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
  Collapse,
  Divider,
  IconButton,
  Tooltip,
  alpha,
  useTheme,
} from '@neram/ui';
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
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

interface NavGroup {
  label: string;
  items: NavItem[];
}

interface DesktopSidebarProps {
  /** Flat nav items (backward compat for teacher panels) */
  items?: NavItem[];
  /** Grouped nav items with collapsible sections (for student sidebar) */
  groups?: NavGroup[];
  /** Path for standalone home button in brand area (removes Home from nav list) */
  homePath?: string;
}

const TRANSITION = 'all 250ms cubic-bezier(0.2, 0, 0, 1)';

export default function DesktopSidebar({ items, groups, homePath }: DesktopSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const { user, nexusRole } = useNexusAuthContext();
  const { sidebarState, cycle, toggle, expand } = useSidebarContext();
  const { currentPanelTitle } = usePanelContext();
  const { getBadgeCount } = useNavBadges();

  // Collapsed groups (by label) — empty set means all expanded
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Click delay pattern: single click waits 250ms, double-click cancels and fires toggle
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleCollapseClick = useCallback(() => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      toggle();
    } else {
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

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  // Flatten groups to items for icon-only mode
  const flatItems = groups ? groups.flatMap(g => g.items) : items || [];

  const renderNavItem = (item: NavItem) => {
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

    if (isIcons) {
      return (
        <Tooltip key={item.path} title={item.label} placement="right" arrow>
          {button}
        </Tooltip>
      );
    }
    return button;
  };

  const renderNavContent = () => {
    // Icon-only mode or flat items: render flat list
    if (isIcons || !groups) {
      return (
        <List sx={{ px: isExpanded ? 1.5 : 0.75 }}>
          {flatItems.map(renderNavItem)}
        </List>
      );
    }

    // Expanded mode with groups: render collapsible sections
    return (
      <Box sx={{ px: 1.5 }}>
        {groups.map((group, gi) => {
          const isGroupCollapsed = collapsedGroups.has(group.label);
          const groupHasActive = group.items.some(item => isActive(item.path));

          return (
            <Box key={group.label} sx={{ mb: 0.5 }}>
              {/* Group header */}
              <Box
                onClick={() => toggleGroup(group.label)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1,
                  py: 0.75,
                  mt: gi > 0 ? 1 : 0,
                  cursor: 'pointer',
                  borderRadius: 1.5,
                  userSelect: 'none',
                  '&:hover': { bgcolor: alpha('#fff', 0.06) },
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    fontSize: '0.6rem',
                    color: groupHasActive ? alpha('#fff', 0.8) : alpha('#fff', 0.45),
                  }}
                >
                  {group.label}
                </Typography>
                <ExpandMoreIcon
                  sx={{
                    fontSize: '0.9rem',
                    color: alpha('#fff', 0.4),
                    transform: isGroupCollapsed ? 'rotate(-90deg)' : 'rotate(0)',
                    transition: 'transform 200ms ease',
                  }}
                />
              </Box>

              {/* Group items */}
              <Collapse in={!isGroupCollapsed} timeout={200}>
                <List disablePadding>
                  {group.items.map(renderNavItem)}
                </List>
              </Collapse>
            </Box>
          );
        })}
      </Box>
    );
  };

  return (
    <>
      {/* Main sidebar */}
      <Box
        component="nav"
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          width: currentWidth,
          height: '100vh',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: theme.zIndex.drawer,
          background: `linear-gradient(180deg, ${theme.palette.primary.dark} 0%, ${theme.palette.primary.main} 50%, ${theme.palette.primary.dark} 100%)`,
          color: '#fff',
          borderRight: 'none',
          overflow: 'visible',
          transition: TRANSITION,
          transform: isHidden ? 'translateX(-100%)' : 'translateX(0)',
          opacity: isHidden ? 0 : 1,
        }}
      >
        {/* Brand — fixed top */}
        <Box sx={{ px: isExpanded ? 2.5 : 0, pt: 3, pb: 1, textAlign: isIcons ? 'center' : 'left', flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: isIcons ? 'center' : 'space-between' }}>
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
            {homePath && (
              <Tooltip title="Home" placement={isIcons ? 'right' : 'bottom'} arrow>
                <IconButton
                  onClick={() => router.push(homePath)}
                  size="small"
                  sx={{
                    color: isActive(homePath) ? '#fff' : alpha('#fff', 0.7),
                    bgcolor: isActive(homePath) ? alpha('#fff', 0.18) : 'transparent',
                    '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.12) },
                    width: 32,
                    height: 32,
                  }}
                >
                  <HomeOutlinedIcon sx={{ fontSize: '1.15rem' }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
          {isExpanded && (
            <Typography
              variant="caption"
              sx={{ color: alpha('#fff', 0.6), fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.625rem' }}
            >
              {currentPanelTitle}
            </Typography>
          )}
        </Box>

        <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: isExpanded ? 2 : 1, mb: 1, flexShrink: 0 }} />

        {/* Navigation — scrollable */}
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            '&::-webkit-scrollbar': { width: 4 },
            '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: alpha('#fff', 0.15),
              borderRadius: 2,
              '&:hover': { bgcolor: alpha('#fff', 0.25) },
            },
            scrollbarWidth: 'thin',
            scrollbarColor: `${alpha('#fff', 0.15)} transparent`,
          }}
        >
          {renderNavContent()}
        </Box>

        {/* User section + collapse toggle — fixed bottom */}
        <Divider sx={{ borderColor: alpha('#fff', 0.12), mx: isExpanded ? 2 : 1, flexShrink: 0 }} />
        <Box sx={{ position: 'relative', p: isExpanded ? 2 : 1, display: 'flex', alignItems: 'center', gap: isExpanded ? 1.5 : 0, justifyContent: isIcons ? 'center' : 'flex-start', flexShrink: 0, overflow: 'visible' }}>
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
            <>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600, lineHeight: 1.2 }} noWrap>
                  {user?.name || 'User'}
                </Typography>
                <Typography variant="caption" sx={{ color: alpha('#fff', 0.5), textTransform: 'capitalize', fontSize: '0.6875rem' }}>
                  {nexusRole || 'member'}
                </Typography>
              </Box>
              <Tooltip title="Click: cycle · Double-click: hide/show" placement="top" arrow>
                <IconButton
                  onClick={handleCollapseClick}
                  size="small"
                  sx={{ color: alpha('#fff', 0.7), '&:hover': { color: '#fff', bgcolor: alpha('#fff', 0.1) } }}
                >
                  <ChevronLeftIcon sx={{ fontSize: '1.25rem' }} />
                </IconButton>
              </Tooltip>
            </>
          )}
          {/* Half-projecting pull-tab in icons-only mode */}
          {isIcons && (
            <Tooltip title="Click: cycle · Double-click: hide/show" placement="right" arrow>
              <IconButton
                onClick={handleCollapseClick}
                size="small"
                sx={{
                  position: 'absolute',
                  right: -16,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 24,
                  height: 40,
                  borderRadius: '0 8px 8px 0',
                  bgcolor: theme.palette.primary.main,
                  color: alpha('#fff', 0.7),
                  '&:hover': { color: '#fff', bgcolor: theme.palette.primary.dark },
                  boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
                  zIndex: 1,
                }}
              >
                <ChevronLeftIcon sx={{ fontSize: '1rem' }} />
              </IconButton>
            </Tooltip>
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
