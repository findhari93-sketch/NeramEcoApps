'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  Box,
  Divider,
  Chip,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Top app bar for Nexus. Shows branding, active classroom, and profile menu.
 * Compact on mobile, expanded on desktop.
 */
export default function TopBar() {
  const router = useRouter();
  const {
    user,
    nexusRole,
    activeClassroom,
    classrooms,
    setActiveClassroom,
    signOut,
  } = useNexusAuthContext();

  const [profileAnchor, setProfileAnchor] = useState<null | HTMLElement>(null);
  const [classroomAnchor, setClassroomAnchor] = useState<null | HTMLElement>(null);

  const handleLogout = async () => {
    setProfileAnchor(null);
    await signOut();
    router.push('/login');
  };

  return (
    <AppBar
      position="sticky"
      sx={{
        backgroundColor: 'background.paper',
        color: 'text.primary',
        boxShadow: 1,
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 48, sm: 56 } }}>
        {/* Brand */}
        <Typography
          variant="h6"
          component="div"
          sx={{ fontWeight: 700, color: 'primary.main', mr: 1 }}
        >
          Nexus
        </Typography>

        {/* Active Classroom Chip */}
        {activeClassroom && classrooms.length > 1 && (
          <Chip
            label={activeClassroom.name}
            size="small"
            onClick={(e) => setClassroomAnchor(e.currentTarget)}
            sx={{
              cursor: 'pointer',
              maxWidth: { xs: 120, sm: 200 },
              '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
            }}
          />
        )}
        {activeClassroom && classrooms.length <= 1 && (
          <Typography variant="body2" color="text.secondary" noWrap sx={{ maxWidth: { xs: 120, sm: 200 } }}>
            {activeClassroom.name}
          </Typography>
        )}

        <Box sx={{ flexGrow: 1 }} />

        {/* Role Badge */}
        {nexusRole && (
          <Chip
            label={nexusRole}
            size="small"
            color={nexusRole === 'teacher' || nexusRole === 'admin' ? 'primary' : 'default'}
            variant="outlined"
            sx={{ mr: 1, display: { xs: 'none', sm: 'flex' }, textTransform: 'capitalize' }}
          />
        )}

        {/* Profile Avatar */}
        <IconButton onClick={(e) => setProfileAnchor(e.currentTarget)} sx={{ p: 0 }}>
          <Avatar
            sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: '0.875rem' }}
          >
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </Avatar>
        </IconButton>

        {/* Profile Menu */}
        <Menu
          anchorEl={profileAnchor}
          open={Boolean(profileAnchor)}
          onClose={() => setProfileAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <Box sx={{ px: 2, py: 1, minWidth: 200 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {user?.name || 'User'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {user?.email || ''}
            </Typography>
          </Box>
          <Divider />
          <MenuItem onClick={() => { setProfileAnchor(null); router.push(`/${nexusRole}/profile`); }}>
            Profile
          </MenuItem>
          <MenuItem onClick={handleLogout}>Logout</MenuItem>
        </Menu>

        {/* Classroom Switcher Menu */}
        <Menu
          anchorEl={classroomAnchor}
          open={Boolean(classroomAnchor)}
          onClose={() => setClassroomAnchor(null)}
        >
          {classrooms.map((c) => (
            <MenuItem
              key={c.id}
              selected={c.id === activeClassroom?.id}
              onClick={() => {
                setActiveClassroom(c);
                setClassroomAnchor(null);
              }}
            >
              <Box>
                <Typography variant="body2">{c.name}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                  {c.type} &middot; {c.enrollmentRole}
                </Typography>
              </Box>
            </MenuItem>
          ))}
        </Menu>
      </Toolbar>
    </AppBar>
  );
}
