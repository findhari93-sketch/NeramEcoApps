'use client';

/**
 * How the pad knows who is here, and the way in for anyone without it: the
 * checks and the room code, one tap away (Class details in the menu), as a sheet
 * from the bottom of the panel. The names are in the People sheet, from the
 * class strip.
 */

import type { ReactNode } from 'react';
import { Box, Button, Divider, Drawer, Stack, Typography, useTheme } from '@neram/ui';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import type { PadHost } from '@/lib/pad/client/pad-host';
import type { RealtimeState } from '@/lib/pad/client/poll-policy';
import { hereSummary } from '@/lib/pad/client/teacher-view';
import type { TeacherSnapshot } from '@/lib/pad/client/types';

function CheckRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <Box sx={{ display: 'flex', mt: '2px', color: ok ? theme.palette.success.main : theme.palette.warning.dark }} aria-hidden>
        {ok ? <CheckCircleRounded fontSize="small" /> : <ErrorOutlineRounded fontSize="small" />}
      </Box>
      <Typography variant="body2">{children}</Typography>
    </Stack>
  );
}

export function RoomCode({ code }: { code: string }) {
  return (
    <Typography
      component="p"
      variant="h5"
      fontWeight={800}
      aria-label={`Room code ${code.split('').join(' ')}`}
      sx={{ letterSpacing: '0.08em', fontVariantNumeric: 'tabular-nums' }}
    >
      {`${code.slice(0, 3)} ${code.slice(3)}`}
    </Typography>
  );
}

export default function ClassDetailsSheet({
  open,
  onClose,
  snapshot,
  host,
  realtime,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: TeacherSnapshot;
  host: PadHost;
  realtime: RealtimeState;
}) {
  const here = hereSummary(snapshot);
  const padAddress = typeof window !== 'undefined' ? `${window.location.host}/pad` : 'nexus.neramclasses.com/pad';

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85vh', maxWidth: 560, mx: 'auto' } }}
    >
      <Stack spacing={1.5} sx={{ p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }} role="dialog" aria-label="Class details">
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', alignSelf: 'center' }} aria-hidden />
        <Typography component="h2" variant="subtitle1" fontWeight={800}>
          Class details
        </Typography>

        <Stack spacing={0.75}>
          <CheckRow ok={here.meetingList}>
            {here.meetingList
              ? 'Meeting list on: everyone in the meeting counts'
              : 'Meeting list off: Teams is not sharing who is in the meeting yet, so only students who opened the pad count.'}
          </CheckRow>
          <CheckRow ok={host.kind !== 'browser'}>{host.kind === 'browser' ? 'Opened outside Teams' : 'Teams connected'}</CheckRow>
          <CheckRow ok={realtime === 'subscribed'}>{realtime === 'subscribed' ? 'Live updates on' : 'Updating every few seconds'}</CheckRow>
          <CheckRow ok={snapshot.session.bot_in_meeting}>
            {snapshot.session.bot_in_meeting ? 'Reminders on' : 'No reminders: the meeting bot is not in this meeting'}
          </CheckRow>
        </Stack>

        <Divider />
        <Box>
          <Typography variant="body2">{`Without the pad? Open ${padAddress} and enter`}</Typography>
          <RoomCode code={snapshot.session.room_code} />
        </Box>

        <Button variant="outlined" onClick={onClose} sx={{ minHeight: 48 }}>
          Done
        </Button>
      </Stack>
    </Drawer>
  );
}
