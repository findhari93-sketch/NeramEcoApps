'use client';

import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
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
import NotificationBell from '@/components/NotificationBell';
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
    activeClassroom,
    classrooms,
    setActiveClassroom,
    signOut,
    getToken,
  } = useNexusAuthContext();

  const { sidebarState, expand } = useSidebarContext();
  const { activePanel, setActivePanel, availablePanels } = usePanelContext();
  const pathname = usePathname();
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [classroomAnchor, setClassroomAnchor] = useState<null | HTMLElement>(null);

  // Drawing reviews are not classroom-scoped (review queue is shared across classrooms),
  // so hide the chip there to avoid implying a filter that doesn't exist.
  const isDrawingReviewRoute = pathname?.startsWith('/teacher/drawing-reviews') ?? false;

  // Show classroom selector for students (always) and teachers only on the Teaching panel,
  // except on drawing-review routes for teachers.
  const showClassroomSelector =
    !!activeClassroom &&
    (nexusRole === 'student' || (activePanel === 'teaching' && !isDrawingReviewRoute));

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
      <Toolbar sx={{ minHeight: { xs: 52, sm: 56 }, px: { xs: 1.5, sm: 2 } }}>
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

        {/* Brand - Mobile only (desktop has sidebar). Taps → home dashboard */}
        <Typography
          variant="h6"
          component="button"
          onClick={() => router.push(nexusRole === 'student' ? '/student/dashboard' : '/teacher/dashboard')}
          aria-label="Go to dashboard"
          sx={{
            display: { xs: 'block', md: 'none' },
            fontWeight: 800,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mr: 1.5,
            letterSpacing: '-0.3px',
            // Make it a clean tappable button
            border: 'none',
            p: 0,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            '&:active': { opacity: 0.7 },
          }}
        >
          Nexus
        </Typography>

        {/* Active Classroom Chip - shown for students (always) and teachers on Teaching panel */}
        {showClassroomSelector && (
          <Box
            component="button"
            onClick={classrooms.length > 1 ? (e: React.MouseEvent<HTMLButtonElement>) => setClassroomAnchor(e.currentTarget) : undefined}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1.25,
              py: 0.5,
              borderRadius: 1.5,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              bgcolor: alpha(theme.palette.primary.main, 0.06),
              cursor: classrooms.length > 1 ? 'pointer' : 'default',
              maxWidth: { xs: 160, sm: 260 },
              transition: 'background-color 200ms ease',
              '&:hover': classrooms.length > 1 ? { bgcolor: alpha(theme.palette.primary.main, 0.12) } : {},
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
                {activeClassroom.type} &middot; {activeClassroom.enrollmentRole}
              </Typography>
            </Box>
            {classrooms.length > 1 && (
              <SwapHorizIcon sx={{ fontSize: '0.85rem', color: 'text.secondary', flexShrink: 0, ml: 0.25 }} />
            )}
          </Box>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Notification Bell */}
        <NotificationBell />

        {/* ── Unified Profile Button ── */}
        <Box
          component="button"
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => setProfileAnchor(e.currentTarget)}
          aria-label="Open profile menu"
          sx={{
            ml: 1,
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
          {/* Avatar with role-colored ring */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <GraphAvatar
              self
              name={user?.name}
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
                      {c.type} &middot; {c.enrollmentRole}
                    </Typography>
                  </Box>
                  {selected && <CheckIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />}
                </MenuItem>
              );
            })}
          </Menu>
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
      </Toolbar>
    </AppBar>
  );
}
