'use client';

import Link from 'next/link';
import { Box, Typography, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { RADIUS, SHADOW } from '@/components/timetable/timetable-theme';
import type { RegisterClass } from '@/app/api/attendance/register/route';
import { formatClassDate, formatHeldRange } from './attendance-format';

/**
 * One past class, as a row a teacher reads in a second.
 *
 * The bar is four proportional boxes, not a chart: it renders at 375px, costs no
 * JavaScript, and the counts are written out beside it, so the colours are a
 * second reading of the numbers rather than the only one.
 */
export default function ClassAttendanceCard({ cls, href }: { cls: RegisterClass; href: string }) {
  const theme = useTheme();
  const { whole, partly, reason, noReason } = cls.counts;
  const total = whole + partly + reason + noReason;

  const parts: Array<{ key: string; value: number; color: string; label: string }> = [
    { key: 'whole', value: whole, color: theme.palette.success.main, label: `${whole} whole` },
    { key: 'partly', value: partly, color: theme.palette.warning.main, label: `${partly} partly` },
    { key: 'reason', value: reason, color: theme.palette.info.main, label: `${reason} reason` },
    { key: 'no_reason', value: noReason, color: theme.palette.error.main, label: `${noReason} no reason` },
  ];
  const summary = parts.map((p) => p.label).join('   ');

  return (
    <Box
      component={Link}
      href={href}
      sx={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${theme.palette.divider}`,
        boxShadow: SHADOW.card,
        bgcolor: 'background.paper',
        minHeight: 88,
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: 'text.secondary' },
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            {formatClassDate(cls.scheduled_date)}, {formatHeldRange(cls)}
          </Typography>
          <Typography sx={{ fontWeight: 700, lineHeight: 1.3 }}>{cls.title}</Typography>
        </Box>
        <ChevronRightIcon sx={{ color: 'text.disabled' }} />
      </Box>

      {cls.measured && total > 0 ? (
        <>
          <Box
            role="img"
            aria-label={summary}
            sx={{ display: 'flex', gap: '2px', mt: 1.25, height: 8, borderRadius: 99, overflow: 'hidden' }}
          >
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <Box key={p.key} sx={{ flex: p.value, bgcolor: p.color }} />
              ))}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            {summary}
          </Typography>
        </>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.25 }}>
          Attendance not read from Teams yet
        </Typography>
      )}
    </Box>
  );
}
