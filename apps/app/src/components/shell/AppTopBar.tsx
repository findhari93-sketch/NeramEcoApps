'use client';

import { AppBar, Toolbar, Typography, IconButton, Box, MenuIcon } from '@neram/ui';
import { neramTokens } from '@neram/ui';
import Link from 'next/link';
import UserNotificationBell from '@/components/UserNotificationBell';

interface AppTopBarProps {
  onMenuToggle: () => void;
  phoneVerified: boolean;
}

export default function AppTopBar({ onMenuToggle, phoneVerified }: AppTopBarProps) {
  return (
    <AppBar
      position="fixed"
      elevation={0}
      sx={{
        display: { xs: 'block', sm: 'none' },
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ minHeight: 48, px: 1.5 }}>
        <IconButton color="inherit" edge="start" onClick={onMenuToggle} sx={{ mr: 1 }}>
          <MenuIcon />
        </IconButton>
        <Typography
          component={Link}
          href="/dashboard"
          sx={{
            fontFamily: 'var(--font-dm-sans), "DM Sans", sans-serif',
            fontSize: '1.15rem',
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
        {phoneVerified && <UserNotificationBell />}
      </Toolbar>
    </AppBar>
  );
}
