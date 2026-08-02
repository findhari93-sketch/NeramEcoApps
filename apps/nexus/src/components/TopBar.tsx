'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import ViewAsStudentDialog from '@/components/ViewAsStudentDialog';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Box,
  Divider,
  Chip,
  alpha,
  useTheme,
  ListItemIcon,
  ListItemText,
} from '@neram/ui';
import GraphAvatar from '@/components/GraphAvatar';
import NexusMark from '@/components/NexusMark';
import NotificationBell from '@/components/NotificationBell';
import PanelSwitcher from '@/components/PanelSwitcher';
import ZoneSwitcher from '@/components/ZoneSwitcher';
import ClassroomSwitchSheet from '@/components/ClassroomSwitchSheet';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import CheckIcon from '@mui/icons-material/Check';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import MenuIcon from '@mui/icons-material/Menu';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useSidebarContext } from '@/components/SidebarProvider';
import { usePanelContext } from '@/components/PanelProvider';
import { useStudentZoneContext } from '@/components/StudentZoneProvider';
import { IMPERSONATION_BANNER_HEIGHT } from '@/components/ImpersonationBanner';
import { getRoleDashboard, hasProfilePages } from '@/lib/role-home';

/* Role → color mapping for the ring & badge */
const ROLE_COLORS: Record<string, string> = {
  teacher: '#1976d2',
  admin: '#7b1fa2',
  student: '#2e7d32',
  parent: '#ed6c02',
};

/**
 * Top app bar for Nexus with glassmorphism effect.
 * On desktop: slim bar offset by sidebar width.
 * On mobile: full-width translucent bar.
 */
export default function TopBar() {
  const router = useRouter();
  const theme = useTheme();
  const {
    user,
    nexusRole,
    isTeacher,
    activeClassroom,
    classrooms,
    setActiveClassroom,
    signOut,
    getToken,
    impersonation,
    children: linkedChildren,
    activeChildId,
  } = useNexusAuthContext();

  const { sidebarState, expand } = useSidebarContext();
  const { activePanel, setActivePanel, availablePanels } = usePanelContext();
  const { activeZone, setActiveZone, availableZones } = useStudentZoneContext();
  const pathname = usePathname();
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [viewAsOpen, setViewAsOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [classroomAnchor, setClassroomAnchor] = useState<null | HTMLElement>(null);
  // Phones switch classroom through a bottom sheet instead of the anchored menu.
  const [classroomSheetOpen, setClassroomSheetOpen] = useState(false);

  // Drawing reviews are not classroom-scoped (review queue is shared across classrooms),
  // so hide the chip there to avoid implying a filter that doesn't exist.
  const isDrawingReviewRoute = pathname?.startsWith('/teacher/drawing-reviews') ?? false;

  // Show classroom selector for students (always) and teachers only on the Teaching panel,
  // except on drawing-review routes for teachers.
  // Never for a parent. `classrooms` holds the CHILD's classroom, and this chip
  // labels it with the viewer's own enrolment role, so a parent saw
  // "E2E Test Classroom / Nata - Student" as though they were the student. The
  // parent's own chip below names the child instead. Without the explicit
  // exclusion this slipped through on the `activePanel === 'teaching'` arm,
  // which is the default panel and has nothing to do with being a teacher.
  const showClassroomSelector =
    nexusRole !== 'parent' &&
    !!activeClassroom &&
    (nexusRole === 'student' || (activePanel === 'teaching' && !isDrawingReviewRoute));

  // One classroom is context, not a control. On a phone that distinction is the
  // difference between a bar that fits and one that does not: the labelled chip
  // costs ~190px of a 360px row, and it is the reason the bell and the avatar
  // used to be pushed off the right edge of the screen. So below sm the chip is
  // replaced by an icon button, and only when there is somewhere to switch to.
  // The classroom name is still on screen: every dashboard prints it under the
  // greeting, and the page header names it elsewhere.
  const canSwitchClassrooms = classrooms.length > 1;

  // The child a parent is currently looking at. Falls back to the first link so
  // the chip still names someone if activeChildId ever arrives empty.
  const activeChild =
    linkedChildren.find((c) => c.id === activeChildId) || linkedChildren[0] || null;

  const handleLogout = async () => {
    setProfileAnchor(null);
    await signOut();
    router.push('/login');
  };

  const roleAccent = ROLE_COLORS[nexusRole || ''] || theme.palette.primary.main;

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        // Park below the impersonation banner when viewing as a student.
        top: impersonation.active ? `${IMPERSONATION_BANNER_HEIGHT}px` : 0,
        bgcolor: alpha(theme.palette.background.paper, 0.92),
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        color: 'text.primary',
        borderBottom: 'none',
        borderRadius: 0,
        boxShadow: `0 1px 3px ${alpha('#000', 0.04)}, 0 4px 12px ${alpha('#000', 0.02)}`,
        width: '100%',
      }}
    >
      <Toolbar
        sx={{
          minHeight: { xs: 52, sm: 56 },
          px: { xs: 1, sm: 2 },
          gap: { xs: 0.75, sm: 1 },
          // The guard rail. Every child below is shrink-safe, but a future
          // addition that is not should crop at the edge rather than push the
          // avatar off screen and give the whole document a sideways scroll.
          // `clip` and not `hidden`: hidden would make this a scroll container.
          // Both menus render through a portal, so neither is affected.
          overflowX: 'clip',
        }}
      >
        {/* Hamburger - desktop only, when sidebar is hidden */}
        {sidebarState === 'hidden' && (
          <IconButton
            onClick={expand}
            size="small"
            sx={{
              display: { xs: 'none', md: 'flex' },
              mr: 1,
              color: 'text.secondary',
            }}
          >
            <MenuIcon />
          </IconButton>
        )}

        {/* Brand - Mobile only (desktop has sidebar). Taps → home dashboard.
            The logo mark, not a wordmark: it is the same artwork the PWA puts
            on the home screen, and it costs 28px where "Nexus" cost 55. */}
        <Box
          component="button"
          type="button"
          onClick={() => router.push(getRoleDashboard(nexusRole))}
          aria-label="Go to dashboard"
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            flexShrink: 0,
            border: 'none',
            p: 0,
            borderRadius: 2,
            bgcolor: 'transparent',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            '&:active': { opacity: 0.7 },
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: 2,
            },
          }}
        >
          <NexusMark size={28} />
        </Box>

        {/* Left group: workspace/zone switcher, then classroom context. Shares
            one shrink-safe track so nothing here can push the right cluster off
            screen: minWidth:0 removes the flex min-content floor, which is the
            rule that used to keep the classroom chip at its full text width. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.75, sm: 1 },
            minWidth: 0,
            flex: '1 1 auto',
          }}
        >
          {/* Staff see the Teaching / Management / Admin pill; students see the
              Study Zone / Classroom pill. Each self-hides when it has nothing
              to switch, so only the relevant one shows. */}
          <PanelSwitcher accent={roleAccent} />
          <ZoneSwitcher accent={roleAccent} />

          {/* Active classroom - students always, teachers on the Teaching panel */}
          {showClassroomSelector && (
            <>
              {/* Phone: icon button → bottom sheet, and only when there is more
                  than one classroom to move between. */}
              {canSwitchClassrooms && (
                <IconButton
                  onClick={() => setClassroomSheetOpen(true)}
                  aria-label={`Switch classroom, currently ${activeClassroom.name}`}
                  data-testid="classroom-switch-mobile"
                  sx={{
                    display: { xs: 'inline-flex', sm: 'none' },
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    color: theme.palette.primary.main,
                    bgcolor: alpha(theme.palette.primary.main, 0.06),
                    border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                    borderRadius: 2,
                    '& .MuiSvgIcon-root': { fontSize: '1.15rem' },
                  }}
                >
                  <SchoolOutlinedIcon />
                </IconButton>
              )}

              {/* sm and up: the labelled chip, which now truncates instead of
                  refusing to shrink. */}
              <Box
                component={canSwitchClassrooms ? 'button' : 'div'}
                onClick={
                  canSwitchClassrooms
                    ? (e: React.MouseEvent<HTMLElement>) => setClassroomAnchor(e.currentTarget)
                    : undefined
                }
                sx={{
                  display: { xs: 'none', sm: 'flex' },
                  alignItems: 'center',
                  gap: 0.75,
                  px: 1.25,
                  py: 0.5,
                  borderRadius: 1.5,
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                  bgcolor: alpha(theme.palette.primary.main, 0.06),
                  cursor: canSwitchClassrooms ? 'pointer' : 'default',
                  maxWidth: 260,
                  minWidth: 0,
                  flexShrink: 1,
                  transition: 'background-color 200ms ease',
                  '&:hover': canSwitchClassrooms
                    ? { bgcolor: alpha(theme.palette.primary.main, 0.12) }
                    : {},
                  outline: 'none',
                }}
              >
                <SchoolOutlinedIcon sx={{ fontSize: '0.95rem', color: theme.palette.primary.main, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      display: 'block',
                      fontWeight: 600,
                      fontSize: '0.7rem',
                      lineHeight: 1.2,
                      color: 'text.primary',
                    }}
                  >
                    {activeClassroom.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      display: 'block',
                      fontSize: '0.6rem',
                      lineHeight: 1.2,
                      color: 'text.secondary',
                      textTransform: 'capitalize',
                    }}
                  >
                    {activeClassroom.type && activeClassroom.type !== 'common'
                      ? `${activeClassroom.type} · ${activeClassroom.enrollmentRole}`
                      : activeClassroom.enrollmentRole}
                  </Typography>
                </Box>
                {canSwitchClassrooms && (
                  <SwapHorizIcon sx={{ fontSize: '0.85rem', color: 'text.secondary', flexShrink: 0, ml: 0.25 }} />
                )}
              </Box>
            </>
          )}

          {/*
            Who a parent is looking at.

            Occupies the same slot as the classroom chip, but is deliberately
            NOT the classroom chip: `classrooms` holds the CHILD's classroom for
            a parent, so labelling it as theirs would read as "you are enrolled
            in JEE B.Arch Session 1". Static in Phase 1 because a parent has
            exactly one linked child; when siblings arrive this becomes the
            switcher.

            Kept at every width, unlike the classroom chip. A parent has no
            workspace pill next to it, so it is competing with nothing for the
            row, and it now shrinks and truncates rather than holding the bar
            open at its full text width. Dropping it on a phone left a parent
            looking at an app bar containing a logo and their own avatar.
          */}
          {nexusRole === 'parent' && activeChild && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: 1.5,
                border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                bgcolor: alpha(theme.palette.primary.main, 0.06),
                maxWidth: 260,
                minWidth: 0,
                flexShrink: 1,
              }}
            >
              <SchoolOutlinedIcon
                sx={{ fontSize: '0.95rem', color: theme.palette.primary.main, flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    display: 'block',
                    fontWeight: 600,
                    fontSize: '0.7rem',
                    lineHeight: 1.2,
                    color: 'text.primary',
                  }}
                >
                  {activeChild.name || 'Your child'}
                </Typography>
                {activeChild.classroom_name && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      display: 'block',
                      fontSize: '0.6rem',
                      lineHeight: 1.2,
                      color: 'text.secondary',
                    }}
                  >
                    {activeChild.classroom_name}
                  </Typography>
                )}
              </Box>
            </Box>
          )}
        </Box>
        {/* ── end left group ── */}

        {/* Right cluster. Never shrinks, never wraps: the bell and the avatar
            are the two controls that must survive every viewport. */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: { xs: 0.25, sm: 0.5 },
            flexShrink: 0,
            ml: 'auto',
          }}
        >
        {/* Notification Bell */}
        {/*
          Not for parents. /api/notifications authenticates with verifyMsToken
          and no allowParent option, so it rejects a par_ token by design, and
          the bell fired a 500 into the console on EVERY parent page load. There
          is no parent notification feed to show yet, so the honest fix is to not
          render the control rather than to widen the route's gate.
        */}
        {nexusRole !== 'parent' && <NotificationBell />}

        {/* ── Unified Profile Button ── */}
        <Box
          component="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setProfileAnchor(e.currentTarget)}
          aria-label="Open profile menu"
          sx={{
            flexShrink: 0,
            borderRadius: 50,
            px: { xs: 0.5, sm: 1 },
            py: 0.5,
            gap: 1,
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
            border: 'none',
            bgcolor: 'transparent',
            outline: 'none',
            transition: 'background-color 200ms ease',
            '&:hover': {
              bgcolor: alpha(theme.palette.action.hover, 0.08),
            },
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: 2,
            },
          }}
        >
          {/* Avatar with role-colored ring. tapToView=false so a tap opens the
              profile / panel-switch menu; long-press still views the photo. */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <GraphAvatar
              self
              tapToView={false}
              name={user?.name}
              fallbackSrc={user?.avatar_url}
              size={36}
              sx={{
                border: `2px solid ${roleAccent}`,
                boxShadow: `0 0 0 1.5px ${alpha(roleAccent, 0.12)}`,
                transition: 'box-shadow 200ms ease',
              }}
            />
            {/* Small role dot indicator */}
            <Box
              sx={{
                position: 'absolute',
                bottom: -1,
                right: -1,
                width: 12,
                height: 12,
                borderRadius: '50%',
                bgcolor: roleAccent,
                border: `2px solid ${theme.palette.background.paper}`,
              }}
            />
          </Box>

          {/* Name + Role (desktop only) */}
          <Box
            sx={{
              display: { xs: 'none', sm: 'flex' },
              flexDirection: 'column',
              alignItems: 'flex-start',
              minWidth: 0,
              maxWidth: 140,
            }}
          >
            <Typography
              variant="body2"
              noWrap
              sx={{
                fontWeight: 600,
                lineHeight: 1.3,
                color: 'text.primary',
                maxWidth: '100%',
              }}
            >
              {user?.name?.split(' ')[0] || 'User'}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{
                lineHeight: 1.2,
                color: roleAccent,
                fontWeight: 500,
                textTransform: 'capitalize',
                fontSize: '0.675rem',
              }}
            >
              {nexusRole || 'Member'}
            </Typography>
          </Box>

          {/* Dropdown arrow (desktop only) */}
          <KeyboardArrowDownIcon
            sx={{
              display: { xs: 'none', sm: 'flex' },
              fontSize: '1.1rem',
              color: 'text.secondary',
              transition: 'transform 200ms ease',
              transform: profileAnchor ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          />
        </Box>
        </Box>
        {/* ── end right cluster ── */}

        {/* ── Profile Dropdown Menu ── */}
        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1.5,
                minWidth: 260,
                maxWidth: 300,
                borderRadius: 3,
                border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                boxShadow: `0 10px 40px ${alpha('#000', 0.12)}, 0 2px 8px ${alpha('#000', 0.06)}`,
                bgcolor: alpha(theme.palette.background.paper, 0.95),
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                overflow: 'visible',
                '&::before': {
                  content: '""',
                  display: 'block',
                  position: 'absolute',
                  top: -6,
                  right: 20,
                  width: 12,
                  height: 12,
                  bgcolor: alpha(theme.palette.background.paper, 0.95),
                  transform: 'rotate(45deg)',
                  border: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                  borderBottom: 'none',
                  borderRight: 'none',
                },
              },
            },
          }}
        >
          {/* Profile Header Card */}
          <Box
            sx={{
              px: 2.5,
              pt: 2,
              pb: 1.5,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <GraphAvatar
              self
              name={user?.name}
              fallbackSrc={user?.avatar_url}
              size={48}
              sx={{
                border: `2px solid ${roleAccent}`,
                boxShadow: `0 0 0 1.5px ${alpha(roleAccent, 0.1)}`,
                flexShrink: 0,
              }}
            />
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="subtitle2"
                noWrap
                sx={{ fontWeight: 700, lineHeight: 1.3 }}
              >
                {user?.name || 'User'}
              </Typography>
              <Typography
                variant="caption"
                noWrap
                sx={{
                  color: 'text.secondary',
                  lineHeight: 1.3,
                  display: 'block',
                }}
              >
                {user?.email || ''}
              </Typography>
              {nexusRole && (
                <Chip
                  label={nexusRole}
                  size="small"
                  sx={{
                    mt: 0.5,
                    height: 20,
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    textTransform: 'capitalize',
                    bgcolor: alpha(roleAccent, 0.12),
                    color: roleAccent,
                    border: `1px solid ${alpha(roleAccent, 0.2)}`,
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              )}
            </Box>
          </Box>

          <Divider sx={{ my: 0.75, mx: 1.5 }} />

          {/* Panel Switcher */}
          {availablePanels.length > 1 && (
            <>
              <Box sx={{ px: 2.5, py: 0.75 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    fontSize: '0.6rem',
                  }}
                >
                  Switch Panel
                </Typography>
              </Box>
              {availablePanels.map((panel) => {
                const isActive = panel.id === activePanel;
                return (
                  <MenuItem
                    key={panel.id}
                    onClick={() => {
                      setProfileAnchor(null);
                      if (!isActive) setActivePanel(panel.id);
                    }}
                    sx={{
                      py: 1,
                      px: 2.5,
                      mx: 1,
                      borderRadius: 2,
                      gap: 1.5,
                      minHeight: 42,
                      bgcolor: isActive ? alpha(roleAccent, 0.08) : 'transparent',
                      '&:hover': {
                        bgcolor: isActive
                          ? alpha(roleAccent, 0.12)
                          : alpha(theme.palette.action.hover, 0.06),
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 0,
                        color: isActive ? roleAccent : 'text.secondary',
                      }}
                    >
                      {panel.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={panel.label}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? roleAccent : 'text.primary',
                      }}
                    />
                    {isActive && (
                      <CheckIcon sx={{ fontSize: '0.95rem', color: roleAccent }} />
                    )}
                  </MenuItem>
                );
              })}
              <Divider sx={{ my: 0.75, mx: 1.5 }} />
            </>
          )}

          {/* Zone Switcher — students only (Classroom ⇄ Study Zone) */}
          {nexusRole === 'student' && availableZones.length > 1 && (
            <>
              <Box sx={{ px: 2.5, py: 0.75 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                    fontSize: '0.6rem',
                  }}
                >
                  Switch Zone
                </Typography>
              </Box>
              {availableZones.map((zone) => {
                const isActive = zone.id === activeZone;
                return (
                  <MenuItem
                    key={zone.id}
                    onClick={() => {
                      setProfileAnchor(null);
                      if (!isActive) setActiveZone(zone.id);
                    }}
                    sx={{
                      py: 1,
                      px: 2.5,
                      mx: 1,
                      borderRadius: 2,
                      gap: 1.5,
                      minHeight: 42,
                      bgcolor: isActive ? alpha(roleAccent, 0.08) : 'transparent',
                      '&:hover': {
                        bgcolor: isActive
                          ? alpha(roleAccent, 0.12)
                          : alpha(theme.palette.action.hover, 0.06),
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, color: isActive ? roleAccent : 'text.secondary' }}>
                      {zone.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={zone.label}
                      primaryTypographyProps={{
                        variant: 'body2',
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? roleAccent : 'text.primary',
                      }}
                    />
                    {isActive && <CheckIcon sx={{ fontSize: '0.95rem', color: roleAccent }} />}
                  </MenuItem>
                );
              })}
              <Divider sx={{ my: 0.75, mx: 1.5 }} />
            </>
          )}

          {/*
            Profile and Guide build their paths from the role string, and there
            is no /parent/profile or /parent/guide page, so for a parent both
            items were a guaranteed 404. Hidden until those pages exist: a
            missing menu item is better than one that breaks.
          */}
          {hasProfilePages(nexusRole) && (
            <>
              {/* Profile Link */}
              <MenuItem
                onClick={() => {
                  setProfileAnchor(null);
                  router.push(`/${nexusRole}/profile`);
                }}
                sx={{
                  py: 1,
                  px: 2.5,
                  mx: 1,
                  borderRadius: 2,
                  gap: 1.5,
                  minHeight: 42,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.action.hover, 0.06),
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, color: 'text.secondary' }}>
                  <PersonOutlinedIcon sx={{ fontSize: '1.2rem' }} />
                </ListItemIcon>
                <ListItemText
                  primary="My Profile"
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </MenuItem>

              {/* Guide */}
              <MenuItem
                onClick={() => {
                  setProfileAnchor(null);
                  router.push(`/${nexusRole}/guide`);
                }}
                sx={{
                  py: 1,
                  px: 2.5,
                  mx: 1,
                  borderRadius: 2,
                  gap: 1.5,
                  minHeight: 42,
                  '&:hover': {
                    bgcolor: alpha(theme.palette.action.hover, 0.06),
                  },
                }}
              >
                <ListItemIcon sx={{ minWidth: 0, color: 'text.secondary' }}>
                  <HelpOutlineIcon sx={{ fontSize: '1.2rem' }} />
                </ListItemIcon>
                <ListItemText
                  primary="Guide"
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </MenuItem>
            </>
          )}

          {/* View as student — teachers/admins only, not while already impersonating */}
          {isTeacher && !impersonation.active && (
            <MenuItem
              onClick={() => {
                setProfileAnchor(null);
                setViewAsOpen(true);
              }}
              sx={{
                py: 1,
                px: 2.5,
                mx: 1,
                borderRadius: 2,
                gap: 1.5,
                minHeight: 42,
                '&:hover': {
                  bgcolor: alpha(theme.palette.warning.main, 0.06),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, color: 'warning.main' }}>
                <VisibilityOutlinedIcon sx={{ fontSize: '1.2rem' }} />
              </ListItemIcon>
              <ListItemText
                primary="View as student"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </MenuItem>
          )}

          {/* Report Issue — students only */}
          {nexusRole === 'student' && (
            <MenuItem
              onClick={() => {
                setProfileAnchor(null);
                setReportIssueOpen(true);
              }}
              sx={{
                py: 1,
                px: 2.5,
                mx: 1,
                borderRadius: 2,
                gap: 1.5,
                minHeight: 42,
                '&:hover': {
                  bgcolor: alpha(theme.palette.warning.main, 0.06),
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 0, color: 'warning.main' }}>
                <BugReportOutlinedIcon sx={{ fontSize: '1.2rem' }} />
              </ListItemIcon>
              <ListItemText
                primary="Report Issue"
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </MenuItem>
          )}

          <Divider sx={{ my: 0.75, mx: 1.5 }} />

          {/* Logout */}
          <MenuItem
            onClick={handleLogout}
            sx={{
              py: 1,
              px: 2.5,
              mx: 1,
              mb: 0.5,
              borderRadius: 2,
              gap: 1.5,
              minHeight: 42,
              '&:hover': {
                bgcolor: alpha(theme.palette.error.main, 0.06),
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 0, color: 'error.main' }}>
              <LogoutIcon sx={{ fontSize: '1.2rem' }} />
            </ListItemIcon>
            <ListItemText
              primary="Sign Out"
              primaryTypographyProps={{
                variant: 'body2',
                color: 'error.main',
                fontWeight: 500,
              }}
            />
          </MenuItem>
        </Menu>

        {/* Classroom Switcher Menu */}
        {showClassroomSelector && (
          <Menu
            anchorEl={classroomAnchor}
            open={Boolean(classroomAnchor)}
            onClose={() => setClassroomAnchor(null)}
            slotProps={{
              paper: {
                sx: {
                  mt: 1,
                  minWidth: 240,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
                },
              },
            }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', fontSize: '0.625rem' }}>
                Your Classrooms
              </Typography>
            </Box>
            {classrooms.map((c) => {
              const selected = c.id === activeClassroom?.id;
              return (
                <MenuItem
                  key={c.id}
                  selected={selected}
                  onClick={() => {
                    setActiveClassroom(c);
                    setClassroomAnchor(null);
                  }}
                  sx={{
                    py: 1,
                    px: 2,
                    borderRadius: 1.5,
                    mx: 0.5,
                    gap: 1,
                    bgcolor: selected ? alpha(theme.palette.primary.main, 0.06) : 'transparent',
                    '&:hover': {
                      bgcolor: selected
                        ? alpha(theme.palette.primary.main, 0.1)
                        : alpha(theme.palette.action.hover, 0.06),
                    },
                  }}
                >
                  <SchoolOutlinedIcon
                    sx={{
                      fontSize: '1.1rem',
                      color: selected ? 'primary.main' : 'text.secondary',
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>{c.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize', fontSize: '0.65rem' }}>
                      {c.type && c.type !== 'common'
                        ? `${c.type} · ${c.enrollmentRole}`
                        : c.enrollmentRole}
                    </Typography>
                  </Box>
                  {selected && <CheckIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />}
                </MenuItem>
              );
            })}
          </Menu>
        )}

        {/* Classroom switcher, phone shape */}
        {showClassroomSelector && canSwitchClassrooms && (
          <ClassroomSwitchSheet
            open={classroomSheetOpen}
            onClose={() => setClassroomSheetOpen(false)}
            items={classrooms}
            activeId={activeClassroom?.id ?? null}
            onSelect={setActiveClassroom}
          />
        )}

        {/* Report Issue Dialog */}
        {nexusRole === 'student' && (
          <ReportIssueDialog
            open={reportIssueOpen}
            onClose={() => setReportIssueOpen(false)}
            getToken={getToken}
            pageUrl={pathname}
          />
        )}
        {/* View as Student picker — teachers/admins */}
        {isTeacher && (
          <ViewAsStudentDialog open={viewAsOpen} onClose={() => setViewAsOpen(false)} />
        )}
      </Toolbar>
    </AppBar>
  );
}
