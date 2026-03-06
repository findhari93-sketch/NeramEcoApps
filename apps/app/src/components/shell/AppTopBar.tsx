'use client';

import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Avatar,
  Box,
  Menu,
  MenuItem,
  MenuIcon,
  useScrollDirection,
} from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import UserNotificationBell from '@/components/UserNotificationBell';

interface AppTopBarProps {
  userName: string;
  userAvatar?: string | null;
  phoneVerified: boolean;
  onMenuToggle: () => void;
  mobileOpen: boolean;
  anchorEl: HTMLElement | null;
  onProfileMenuOpen: (event: React.MouseEvent<HTMLElement>) => void;
  onProfileMenuClose: () => void;
  onSignOut: () => void;
}

export default function AppTopBar({
  userName,
  userAvatar,
  phoneVerified,
  onMenuToggle,
  mobileOpen,
  anchorEl,
  onProfileMenuOpen,
  onProfileMenuClose,
  onSignOut,
}: AppTopBarProps) {
  const { scrollDirection, isAtTop } = useScrollDirection();
  const firstName = userName?.split(' ')[0] || 'Student';

  return (
    <>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          transform:
            scrollDirection === 'down' && !isAtTop && !mobileOpen
              ? 'translateY(-100%)'
              : 'translateY(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          '@media (prefers-reduced-motion: reduce)': {
            transition: 'none',
          },
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 56, sm: 56 }, px: { xs: 1.5, sm: 2 } }}>
          {/* Mobile hamburger */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={onMenuToggle}
            sx={{ mr: 1, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* Logo */}
          <Typography
            component={Link}
            href="/dashboard"
            sx={{
              fontFamily: 'var(--font-cormorant), "Cormorant Garamond", serif',
              fontSize: '1.35rem',
              fontWeight: 700,
              color: 'text.primary',
              textDecoration: 'none',
              mr: 'auto',
              lineHeight: 1,
            }}
          >
            ai
            <Box component="span" sx={{ color: neramTokens.gold[500] }}>
              Architek
            </Box>
          </Typography>

          {/* Right section */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
            {phoneVerified && <UserNotificationBell />}
            <IconButton onClick={onProfileMenuOpen} sx={{ p: 0.5 }}>
              <Avatar
                alt={userName || 'User'}
                src={userAvatar || undefined}
                sx={{
                  width: 32,
                  height: 32,
                  fontSize: '0.85rem',
                  bgcolor: neramTokens.gold[500],
                  color: neramTokens.navy[900],
                  fontWeight: 700,
                }}
              >
                {firstName[0]?.toUpperCase()}
              </Avatar>
            </IconButton>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Profile Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={onProfileMenuClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { mt: 0.5, minWidth: 160 },
          },
        }}
      >
        <MenuItem component={Link} href="/profile" onClick={onProfileMenuClose}>
          Profile
        </MenuItem>
        <MenuItem onClick={onSignOut}>Sign Out</MenuItem>
      </Menu>
    </>
  );
}
