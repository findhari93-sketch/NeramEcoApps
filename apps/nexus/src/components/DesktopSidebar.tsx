'use client';

import { useRef, useCallback, useState, useEffect, useMemo } from 'react';
import { usePathname } from 'next/navigation';
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
import { IMPERSONATION_BANNER_HEIGHT } from './ImpersonationBanner';
import { useSidebarContext, SIDEBAR_EXPANDED, SIDEBAR_ICONS } from './SidebarProvider';
import { COURSE_PLANS_PATH, COURSE_PLAN_SUBNAV } from '@/lib/nav-config';
import { examFromPathname, useRememberedQBExam } from '@/lib/qb-exam-routes';
import { useNavBadges } from './NavBadgeProvider';
import { NavLink } from './NavigationProgress';

// Re-export for backward compat (layouts import this)
export const SIDEBAR_WIDTH = SIDEBAR_EXPANDED;

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  /** A folder: rendered as an expandable row with these links under it. */
  children?: NavItem[];
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
  const theme = useTheme();
  const { user, nexusRole, impersonation } = useNexusAuthContext();
  const { sidebarState, cycle, toggle, expand } = useSidebarContext();
  const { getBadgeCount } = useNavBadges();

  // Collapsed groups (by label) — empty set means all expanded
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Folders the user closed (by path). Open by default: a folder of two links
  // that hides them until clicked is a folder nobody finds.
  const [closedFolders, setClosedFolders] = useState<Set<string>>(new Set());
  const rememberedQBExam = useRememberedQBExam();

  // Course Plans left-rail sub-nav: which plan its screens point at.
  const onCoursePlans = pathname.startsWith(COURSE_PLANS_PATH);
  const currentPlanId = useMemo(() => {
    const m = pathname.match(/^\/teacher\/course-plans\/([^/]+)/);
    return m ? m[1] : null;
  }, [pathname]);
  const [lastPlanId, setLastPlanId] = useState<string | null>(null);
  const [coursePlansOpen, setCoursePlansOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('nexus_last_course_plan');
    if (stored) setLastPlanId(stored);
  }, []);
  useEffect(() => {
    if (currentPlanId) {
      localStorage.setItem('nexus_last_course_plan', currentPlanId);
      setLastPlanId(currentPlanId);
    }
  }, [currentPlanId]);
  // Auto-open the section when the user enters it.
  useEffect(() => {
    if (onCoursePlans) setCoursePlansOpen(true);
  }, [onCoursePlans]);
  // Same for any folder: arriving inside one reopens it, so the current page's
  // link is never hidden in a folder closed earlier.
  useEffect(() => {
    setClosedFolders((prev) => {
      const entered = Array.from(prev).filter((p) => pathname === p || pathname.startsWith(p + '/'));
      if (entered.length === 0) return prev;
      const next = new Set(prev);
      entered.forEach((p) => next.delete(p));
      return next;
    });
  }, [pathname]);

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
      // A real link (PERF-0029): Next prefetches it, it opens in a new tab, and a
      // screen reader hears a link to a page rather than an unlabelled action.
      <ListItemButton
        key={item.path}
        component={NavLink}
        href={item.path}
        aria-current={active ? 'page' : undefined}
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
          '&.Mui-focusVisible': { outline: `2px solid ${alpha('#fff', 0.8)}`, outlineOffset: -2 },
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

  // Course Plans as an expandable folder (design's left rail): Overview + the
  // five plan screens, which resolve against the open plan (or the last one).
  const renderCoursePlans = (icon: React.ReactNode) => {
    const resolvePlanPath = (suffix: string) => {
      const id = currentPlanId || lastPlanId;
      return id ? `${COURSE_PLANS_PATH}/${id}${suffix}` : COURSE_PLANS_PATH;
    };
    const childActive = (item: (typeof COURSE_PLAN_SUBNAV)[number]) => {
      if (!item.planScreen) return pathname === COURSE_PLANS_PATH;
      if (!currentPlanId) return false;
      const base = `${COURSE_PLANS_PATH}/${currentPlanId}`;
      if (item.suffix === '') return pathname === base;
      return pathname === base + item.suffix || pathname.startsWith(base + item.suffix + '/');
    };
    return (
      <Box key={COURSE_PLANS_PATH}>
        <ListItemButton
          component={NavLink}
          href={COURSE_PLANS_PATH}
          aria-current={pathname === COURSE_PLANS_PATH ? 'page' : undefined}
          sx={{
            borderRadius: 2.5,
            mb: 0.5,
            px: 1.5,
            py: 1,
            minHeight: 44,
            bgcolor: onCoursePlans ? alpha('#fff', 0.14) : 'transparent',
            color: onCoursePlans ? '#fff' : alpha('#fff', 0.7),
            '&:hover': { bgcolor: alpha('#fff', 0.08) },
            transition: TRANSITION,
          }}
        >
          <ListItemIcon
            sx={{ minWidth: 36, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: '1.25rem' } }}
          >
            {icon}
          </ListItemIcon>
          <ListItemText
            primary="Course Plans"
            primaryTypographyProps={{ variant: 'body2', fontWeight: onCoursePlans ? 600 : 500 }}
          />
          <ExpandMoreIcon
            onClick={(e) => {
              // Inside the row's link: open or close the list without following it.
              e.preventDefault();
              e.stopPropagation();
              setCoursePlansOpen((o) => !o);
            }}
            sx={{
              fontSize: '1.1rem',
              color: alpha('#fff', 0.5),
              transform: coursePlansOpen ? 'rotate(0)' : 'rotate(-90deg)',
              transition: 'transform 200ms ease',
            }}
          />
        </ListItemButton>
        <Collapse in={coursePlansOpen} timeout={200}>
          <Box sx={{ ml: 2.5, pl: 1, borderLeft: `2px solid ${alpha('#fff', 0.15)}`, mb: 0.5 }}>
            {COURSE_PLAN_SUBNAV.map((s) => {
              const active = childActive(s);
              return (
                <ListItemButton
                  key={s.key}
                  component={NavLink}
                  href={s.planScreen ? resolvePlanPath(s.suffix) : COURSE_PLANS_PATH}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    borderRadius: 2,
                    mb: 0.25,
                    px: 1.25,
                    py: 0.6,
                    minHeight: 36,
                    bgcolor: active ? alpha('#fff', 0.16) : 'transparent',
                    color: active ? '#fff' : alpha('#fff', 0.62),
                    '&:hover': { bgcolor: alpha('#fff', 0.08) },
                    transition: TRANSITION,
                  }}
                >
                  <ListItemText
                    primary={s.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontSize: '0.8rem',
                      fontWeight: active ? 600 : 500,
                    }}
                  />
                </ListItemButton>
              );
            })}
          </Box>
        </Collapse>
      </Box>
    );
  };

  /**
   * A folder row with its links indented under it (Question Bank, with one link
   * per exam). Same visual language as the Course Plans rail above.
   *
   * The row itself opens and closes the folder rather than navigating: its path
   * is only a redirect, and the links it would redirect to are right there.
   */
  const renderNavFolder = (item: NavItem) => {
    const children = item.children ?? [];
    const insideFolder = isActive(item.path);
    const open = !closedFolders.has(item.path);
    const onAnyChild = children.some((c) => isActive(c.path));
    const childActive = (child: NavItem) => {
      if (isActive(child.path)) return true;
      // On a page both exams share (question search, a paper), no child path
      // matches. The exam the person came from stands in, so the sidebar still
      // says where Back will take them.
      if (!insideFolder || onAnyChild) return false;
      const exam = examFromPathname(child.path);
      return exam !== null && exam === rememberedQBExam;
    };
    const toggleFolder = () =>
      setClosedFolders((prev) => {
        const next = new Set(prev);
        if (open) next.add(item.path);
        else next.delete(item.path);
        return next;
      });
    const listId = `nav-folder-${item.path.replace(/[^a-z0-9]+/gi, '-')}`;

    return (
      <Box key={item.path}>
        <ListItemButton
          onClick={toggleFolder}
          aria-expanded={open}
          aria-controls={listId}
          sx={{
            borderRadius: 2.5,
            mb: 0.5,
            px: 1.5,
            py: 1,
            minHeight: 44,
            bgcolor: insideFolder ? alpha('#fff', 0.14) : 'transparent',
            color: insideFolder ? '#fff' : alpha('#fff', 0.7),
            '&:hover': { bgcolor: alpha('#fff', 0.08) },
            '&.Mui-focusVisible': { outline: `2px solid ${alpha('#fff', 0.8)}`, outlineOffset: -2 },
            transition: TRANSITION,
          }}
        >
          <ListItemIcon
            sx={{ minWidth: 36, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: '1.25rem' } }}
          >
            {/* The folder's own count (the Question Bank's reported questions),
                so it shows whether the folder is open or closed. */}
            <Badge
              badgeContent={getBadgeCount(item.path)}
              color="error"
              max={99}
              sx={{ '& .MuiBadge-badge': { fontSize: '0.625rem', height: 18, minWidth: 18, padding: '0 4px' } }}
            >
              {item.icon}
            </Badge>
          </ListItemIcon>
          <ListItemText
            primary={item.label}
            primaryTypographyProps={{ variant: 'body2', fontWeight: insideFolder ? 600 : 500 }}
          />
          <ExpandMoreIcon
            aria-hidden
            sx={{
              fontSize: '1.1rem',
              color: alpha('#fff', 0.5),
              transform: open ? 'rotate(0)' : 'rotate(-90deg)',
              transition: 'transform 200ms ease',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </ListItemButton>
        <Collapse in={open} timeout={200}>
          <Box
            id={listId}
            sx={{ ml: 2.5, pl: 1, borderLeft: `2px solid ${alpha('#fff', 0.15)}`, mb: 0.5 }}
          >
            {children.map((child) => {
              const active = childActive(child);
              return (
                <ListItemButton
                  key={child.path}
                  component={NavLink}
                  href={child.path}
                  aria-current={active ? 'page' : undefined}
                  sx={{
                    borderRadius: 2,
                    mb: 0.25,
                    px: 1.25,
                    py: 0.75,
                    minHeight: 44,
                    bgcolor: active ? alpha('#fff', 0.18) : 'transparent',
                    color: active ? '#fff' : alpha('#fff', 0.7),
                    '&:hover': { bgcolor: active ? alpha('#fff', 0.22) : alpha('#fff', 0.08) },
                    '&.Mui-focusVisible': { outline: `2px solid ${alpha('#fff', 0.8)}`, outlineOffset: -2 },
                    transition: TRANSITION,
                  }}
                >
                  <ListItemText
                    primary={child.label}
                    primaryTypographyProps={{
                      variant: 'body2',
                      fontSize: '0.8125rem',
                      fontWeight: active ? 600 : 500,
                    }}
                  />
                  {active && (
                    <Box sx={{ width: 4, height: 18, borderRadius: 2, bgcolor: '#fff', ml: 1 }} />
                  )}
                </ListItemButton>
              );
            })}
          </Box>
        </Collapse>
      </Box>
    );
  };

  const renderNavContent = () => {
    // Icon-only mode or flat items: render flat list
    if (isIcons || !groups) {
      return (
        <List sx={{ px: isExpanded ? 1.5 : 0.75 }}>
          {flatItems.map((item) =>
            isExpanded && item.path === COURSE_PLANS_PATH
              ? renderCoursePlans(item.icon)
              : isExpanded && item.children?.length
                ? renderNavFolder(item)
                : renderNavItem(item),
          )}
        </List>
      );
    }

    // Expanded mode with groups: render collapsible sections
    return (
      <Box sx={{ px: 1.5 }}>
        {groups.map((group, gi) => {
          const isGroupCollapsed = collapsedGroups.has(group.label);
          const groupHasActive = group.items.some(item => isActive(item.path));
          const listId = `nav-group-${group.label.replace(/\s+/g, '-').toLowerCase()}`;

          return (
            <Box key={group.label} sx={{ mb: 0.5 }}>
              {/* Group header. A ListItemButton rather than a Box so it is
                  reachable by keyboard and announces its own expanded state;
                  staff now navigate by these headings, not just students. */}
              <ListItemButton
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!isGroupCollapsed}
                aria-controls={listId}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1,
                  py: 0.75,
                  minHeight: 44,
                  mt: gi > 0 ? 1 : 0,
                  borderRadius: 1.5,
                  userSelect: 'none',
                  '&:hover': { bgcolor: alpha('#fff', 0.06) },
                  '&.Mui-focusVisible': {
                    outline: `2px solid ${alpha('#fff', 0.7)}`,
                    outlineOffset: 2,
                    bgcolor: alpha('#fff', 0.08),
                  },
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
              </ListItemButton>

              {/* Group items. Course Plans keeps its own sub-nav here too; the
                  flat branch above special-cases it, and a group heading is no
                  reason for staff to lose Schedule, Class Day and Health. */}
              <Collapse in={!isGroupCollapsed} timeout={200}>
                <List disablePadding id={listId}>
                  {group.items.map((item) =>
                    item.path === COURSE_PLANS_PATH
                      ? renderCoursePlans(item.icon)
                      : item.children?.length
                        ? renderNavFolder(item)
                        : renderNavItem(item),
                  )}
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
          // While impersonating, drop below the full-width "View as Student" banner
          // so it never overlaps the sidebar brand.
          height: impersonation.active
            ? `calc(100vh - ${IMPERSONATION_BANNER_HEIGHT}px)`
            : '100vh',
          position: 'fixed',
          top: impersonation.active ? IMPERSONATION_BANNER_HEIGHT : 0,
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
                  component={NavLink}
                  href={homePath}
                  aria-label="Home"
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
