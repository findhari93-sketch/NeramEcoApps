'use client';

import { AppBar, Toolbar, IconButton, Box } from '@neram/ui';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import Link from 'next/link';
import UserNotificationBell from '@/components/UserNotificationBell';
import BrandMark from './BrandMark';

export const TOP_BAR_HEIGHT = 56;

interface AppTopBarProps {
  onMenuToggle: () => void;
  phoneVerified: boolean;
}

/** Phone and small tablet only. Laptop uses the sidebar header instead. */
export default function AppTopBar({ onMenuToggle, phoneVerified }: AppTopBarProps) {
  return (
    <AppBar
      position="fixed"
      sx={{
        display: { xs: 'block', md: 'none' },
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: '1px solid',
        borderColor: 'divider',
        pt: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <Toolbar disableGutters sx={{ minHeight: `${TOP_BAR_HEIGHT}px !important`, px: 1, gap: 0.5 }}>
        <IconButton
          color="inherit"
          onClick={onMenuToggle}
          aria-label="Open menu"
          sx={{ width: 44, height: 44 }}
        >
          <MenuRoundedIcon />
        </IconButton>
        <Box
          component={Link}
          href="/dashboard"
          aria-label="aiArchitek home"
          sx={{ display: 'flex', alignItems: 'center', minHeight: 44, mr: 'auto', borderRadius: 2, px: 0.5 }}
        >
          <BrandMark size="sm" />
        </Box>
        {phoneVerified && <UserNotificationBell />}
      </Toolbar>
    </AppBar>
  );
}
