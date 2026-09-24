'use client';

import { useId, useState } from 'react';
import { Box, Button, Collapse, Typography, useMediaQuery, useTheme } from '@neram/ui';
import NotificationsOffOutlinedIcon from '@mui/icons-material/NotificationsOffOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import AutoRemindersNotice from './AutoRemindersNotice';

/**
 * How reminders reach this class, as one line.
 *
 * Reminders always come from Neram Assistant (founder, 2026-09-24): no teacher
 * connects their own Teams any more, because 200 automated threads buried the
 * teacher's real chats. So when reminders are on there is nothing to set up and
 * the screen says so in one quiet line.
 *
 * When they are off, the notice wraps to four lines at 375px and pushed the
 * first student below the fold, so on a phone it folds behind one 48px line that
 * still says the state in words, in warning colour. From 600px up it shows as is.
 */
export default function ReminderSetup({ classroomId: _classroomId }: { classroomId: string }) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('sm'), { noSsr: true });
  const { isFeatureEnabled } = useNexusAuthContext();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (isFeatureEnabled('staff.sketchbook-reminders')) {
    return (
      <Box
        data-testid="reminder-setup-on"
        role="status"
        sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, minHeight: 32 }}
      >
        <NotificationsActiveOutlinedIcon aria-hidden sx={{ color: 'success.dark', fontSize: 20, flexShrink: 0 }} />
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0 }}>
          Reminders reach students from Neram Assistant in Teams and on the Nexus bell.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mb: 1.5 }}>
      {!wide && (
        <Button
          fullWidth
          color="inherit"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          data-testid="reminder-setup-toggle"
          sx={{
            minHeight: 48, px: 1.5, gap: 1, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none',
            borderRadius: 2, border: 1, borderColor: 'warning.main', bgcolor: 'background.paper',
            '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
          }}
        >
          <NotificationsOffOutlinedIcon aria-hidden sx={{ color: 'warning.dark', fontSize: 20 }} />
          <Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: 'warning.dark' }}>
            Automatic reminders are off
          </Typography>
          <Typography component="span" variant="body2" color="primary" sx={{ fontWeight: 600, flexShrink: 0 }}>
            {open ? 'Hide' : 'Details'}
          </Typography>
          <ExpandMoreRoundedIcon
            aria-hidden
            sx={{
              color: 'primary.main', flexShrink: 0, transition: 'transform 200ms ease',
              transform: open ? 'rotate(180deg)' : 'none',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Button>
      )}
      <Collapse in={wide || open} id={panelId} timeout={wide ? 0 : 'auto'}>
        {/* The notice brings its own bottom margin; the fold adds the gap under the toggle. */}
        <Box sx={{ pt: wide ? 0 : 1, mb: -1.5 }}>
          <AutoRemindersNotice />
        </Box>
      </Collapse>
    </Box>
  );
}
