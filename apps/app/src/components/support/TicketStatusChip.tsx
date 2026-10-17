'use client';

/**
 * The student-facing status as a chip: the words carry the meaning, a coloured
 * dot adds the tone. The text stays text.primary so it reads at 4.5:1 on any
 * tone (warning orange on white does not).
 */

import { Chip, useTheme } from '@neram/ui';
import CircleIcon from '@mui/icons-material/Circle';
import { ticketStatusMeta } from '@neram/database/support-ticket-status';

export default function TicketStatusChip({ status }: { status: string }) {
  const theme = useTheme();
  const meta = ticketStatusMeta(status);
  const dot =
    meta.color === 'warning'
      ? theme.palette.warning.main
      : meta.color === 'info'
        ? theme.palette.info.main
        : meta.color === 'success'
          ? theme.palette.success.main
          : theme.palette.text.disabled;
  return (
    <Chip
      size="small"
      variant="outlined"
      label={meta.studentLabel}
      icon={<CircleIcon aria-hidden="true" sx={{ fontSize: '10px !important', color: `${dot} !important` }} />}
      sx={{ fontWeight: 600, color: 'text.primary', borderColor: meta.turn === 'student' ? dot : 'divider' }}
    />
  );
}
