'use client';

import Link from 'next/link';
import { Box, Button, Typography } from '@neram/ui';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Class rhythm, when `staff.sketchbook-reminders` is off: say that nobody is
 * being reminded. Without it the screen read as though Nexus was chasing quiet
 * students, and staff were phoning them without knowing whether it had. Renders
 * nothing once reminders are on; each row then says who was reminded and how.
 */
export default function AutoRemindersNotice() {
  const { isFeatureEnabled, isAdmin } = useNexusAuthContext();
  if (isFeatureEnabled('staff.sketchbook-reminders')) return null;

  return (
    <Box
      data-testid="auto-reminders-off"
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        flexWrap: 'wrap',
        p: 1,
        pl: 1.5,
        mb: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'warning.main',
        bgcolor: 'background.paper',
      }}
    >
      <NotificationsOffOutlinedIcon aria-hidden sx={{ color: 'warning.dark', fontSize: 22 }} />
      <Typography variant="body2" sx={{ flex: '1 1 220px', minWidth: 0 }}>
        <Box component="span" sx={{ fontWeight: 700 }}>Automatic reminders are off.</Box>{' '}
        Nexus has not reminded any student, so quiet students hear nothing unless you press Nudge.
        {!isAdmin && ' An admin can switch them on in Features.'}
      </Typography>
      {isAdmin && (
        <Button component={Link} href="/teacher/admin/features" variant="contained" sx={{ minHeight: 44, flexShrink: 0 }}>
          Turn on
        </Button>
      )}
    </Box>
  );
}
