'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from '@neram/ui';
import GraphAvatar from '@/components/GraphAvatar';
import NotificationBell from '@/components/NotificationBell';
import LogoutIcon from '@mui/icons-material/LogoutOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import CheckIcon from '@mui/icons-material/Check';
import MenuIcon from '@mui/icons-material/Menu';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useSidebarContext } from '@/components/SidebarProvider';
import { usePanelContext } from '@/components/PanelProvider';

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
  } = useNexusAuthContext();

  const { sidebarState, expand } = useSidebarContext();
  const { activePanel, setActivePanel, availablePanels } = usePanelContext();
  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [classroomAnchor, setClassroomAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = async () => {
    setProfileAnchor(null);
    await signOut();
    router.push('/login');
  };

  const roleColor = nexusRole === 'teacher' || nexusRole === 'admin' ? 'primary' : 'default';

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        bgcolor: alpha(theme.palette.background.paper, 0.8),
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        color: 'text.primary',
        borderBottom: `1px solid ${theme.palette.divider}`,
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

        {/* Brand - Mobile only (desktop has sidebar) */}
        <Typography
          variant="h6"
          component="div"
          sx={{
            display: { xs: 'block', md: 'none' },
            fontWeight: 800,
            background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
            backgroundClip: 'text',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            mr: 1.5,
            letterSpacing: '-0.3px',
          }}
        >
          Nexus
        </Typography>

        {/* Active Classroom Chip - only in teaching panel */}
        {activePanel === 'teaching' && activeClassroom && classrooms.length > 1 && (
          <Chip
            label={activeClassroom.name}
            size="small"
            icon={<SwapHorizIcon sx={{ fontSize: '0.9rem !important' }} />}
            onClick={(e) => setClassroomAnchor(e.currentTarget)}
            sx={{
              cursor: 'pointer',
              maxWidth: { xs: 140, sm: 220 },
              bgcolor: alpha(theme.palette.primary.main, 0.08),
              color: 'primary.main',
              fontWeight: 500,
              border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
              '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.14) },
              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
              transition: 'background-color 200ms ease',
            }}
          />
        )}
        {activePanel === 'teaching' && activeClassroom && classrooms.length <= 1 && (
          <Typography
            variant="body2"
            noWrap
            sx={{
              maxWidth: { xs: 140, sm: 220 },
              color: 'text.secondary',
              fontWeight: 500,
            }}
          >
            {activeClassroom.name}
          </Typography>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Notification Bell */}
        <NotificationBell />

        {/* Role Badge - Desktop only */}
        {nexusRole && (
          <Chip
            label={nexusRole}
            size="small"
            color={roleColor}
            variant="outlined"
            sx={{
              mr: 1.5,
              display: { xs: 'none', sm: 'flex' },
              textTransform: 'capitalize',
              fontWeight: 500,
              height: 26,
              fontSize: '0.75rem',
            }}
          />
        )}

        {/* Profile Avatar */}
        <IconButton
          onClick={(e) => setProfileAnchor(e.currentTarget)}
          sx={{ p: 0.5 }}
        >
          <GraphAvatar
            self
            name={user?.name}
            size={34}
            sx={{
              border: `2px solid ${alpha(theme.palette.primary.main, 0.3)}`,
              transition: 'box-shadow 200ms ease',
              '&:hover': {
                boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.15)}`,
              },
            }}
          />
        </IconButton>

        {/* Profile Menu */}
        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              sx: {
                mt: 1,
                minWidth: 220,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              },
            },
          }}
        >
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {user?.name || 'User'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>
              {user?.email || ''}
            </Typography>
          </Box>
          {/* Panel Switcher */}
          {availablePanels.length > 1 && (
            <>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ px: 2, py: 0.75 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontSize: '0.625rem',
                  }}
                >
                  Panels
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
                      px: 2,
                      gap: 1.5,
                      bgcolor: isActive ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                      '&:hover': {
                        bgcolor: isActive
                          ? alpha(theme.palette.primary.main, 0.12)
                          : undefined,
                      },
                    }}
                  >
                    <Box sx={{ color: isActive ? 'primary.main' : 'text.secondary', display: 'flex' }}>
                      {panel.icon}
                    </Box>
                    <Typography
                      variant="body2"
                      sx={{
                        flex: 1,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'primary.main' : 'text.primary',
                      }}
                    >
                      {panel.label}
                    </Typography>
                    {isActive && <CheckIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />}
                  </MenuItem>
                );
              })}
            </>
          )}

          <Divider sx={{ my: 0.5 }} />
          <MenuItem
            onClick={() => {
              setProfileAnchor(null);
              router.push(`/${nexusRole}/profile`);
            }}
            sx={{ py: 1, px: 2, gap: 1.5 }}
          >
            <PersonOutlinedIcon sx={{ fontSize: '1.15rem', color: 'text.secondary' }} />
            <Typography variant="body2">Profile</Typography>
          </MenuItem>
          <MenuItem onClick={handleLogout} sx={{ py: 1, px: 2, gap: 1.5 }}>
            <LogoutIcon sx={{ fontSize: '1.15rem', color: 'error.main' }} />
            <Typography variant="body2" color="error.main">Logout</Typography>
          </MenuItem>
        </Menu>

        {/* Classroom Switcher Menu */}
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
              Switch Classroom
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
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: selected ? 'primary.main' : 'divider',
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>{c.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                    {c.type} &middot; {c.enrollmentRole}
                  </Typography>
                </Box>
                {selected && <CheckIcon sx={{ fontSize: '1rem', color: 'primary.main' }} />}
              </MenuItem>
            );
          })}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
