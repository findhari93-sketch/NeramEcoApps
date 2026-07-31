'use client';

/**
 * The pieces every catch-up tab draws: the three gates, a stat tile, a student
 * identity block, and the two date helpers.
 *
 * Extracted when the page grew a fourth tab. Keeping `Gates` in one place
 * matters more than the others: it is the same three-dot summary the student
 * sees on their own screen, and the two drifting apart would mean a teacher and
 * a student disagreeing about whether a class is finished.
 */
import { Box, Chip, Stack, Typography, UserAvatar, alpha, useTheme } from '@neram/ui';
import { RADIUS } from '@/components/timetable/timetable-theme';
import type { Item, StudentCard } from './types';

/** A YYYY-MM-DD as "29 Jul", read in IST so an evening class keeps its own date. */
export function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/**
 * How long ago something happened, in the units a person would use out loud.
 * Deliberately coarse: a teacher scanning the feed needs "yesterday", not
 * "19 hours ago".
 */
export function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return shortDate(iso.slice(0, 10));
}

/** Whole days between two ISO-ish dates, floored at 0. */
export function daysBetween(fromYmd: string, toIso: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T00:00:00+05:30`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00+05:30`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** One line summarising what a student owes. Kept in one place so it never drifts. */
export function owedLine(s: {
  missedTotals: { open: number; overdue: number };
  totals: { total: number; completed: number };
}): string {
  const parts: string[] = [];
  if (s.missedTotals.open > 0) parts.push(`${s.missedTotals.open} missed`);
  if (s.missedTotals.overdue > 0) parts.push(`${s.missedTotals.overdue} overdue`);
  const backlogOpen = s.totals.total - s.totals.completed;
  if (backlogOpen > 0) parts.push(`${backlogOpen} before joining`);
  return parts.length ? parts.join(' · ') : 'Nothing outstanding';
}

/** Where an item has got to, in words, for a teacher skimming a feed. */
export function stateLabel(item: Item): { label: string; tone: 'good' | 'warn' | 'bad' | 'idle' } {
  if (item.excused) return { label: 'Excused', tone: 'idle' };
  if (item.caught_up_at) return { label: 'Caught up', tone: 'good' };
  if (item.status === 'blocked') return { label: 'No recording yet', tone: 'idle' };
  if (item.status === 'pending_teacher') return { label: 'Waiting on a recap', tone: 'idle' };
  if (item.overdue) return { label: 'Overdue', tone: 'bad' };
  if (!item.watched) return { label: 'Not started', tone: 'warn' };
  if (item.assignments_outstanding > 0) return { label: 'Work outstanding', tone: 'warn' };
  if (item.has_test && !item.test_passed) return { label: 'Quiz to pass', tone: 'warn' };
  return { label: 'Nearly there', tone: 'warn' };
}

/** The three gates as three dots. Same shape the student sees on their own screen. */
export function Gates({ item }: { item: Item }) {
  const theme = useTheme();
  if (item.excused) {
    return (
      <Typography variant="caption" color="text.disabled">
        excused
      </Typography>
    );
  }
  if (item.status === 'blocked') {
    return (
      <Typography variant="caption" color="text.disabled">
        no rec
      </Typography>
    );
  }
  const gates = [
    { on: item.watched, title: 'Watched' },
    { on: item.assignments_total === 0 || item.assignments_outstanding === 0, title: 'Assignment in' },
    { on: !item.has_test || item.test_passed, title: 'Quiz passed' },
  ];
  return (
    <Stack direction="row" spacing={0.4} justifyContent="center">
      {gates.map((g, i) => (
        <Box
          key={i}
          title={g.title}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            bgcolor: g.on ? theme.palette.success.main : alpha(theme.palette.text.disabled, 0.35),
          }}
        />
      ))}
    </Stack>
  );
}

export function StatTile({
  n,
  label,
  tone,
}: {
  n: number;
  label: string;
  tone?: 'bad' | 'warn' | 'good';
}) {
  const theme = useTheme();
  const color =
    tone === 'bad'
      ? theme.palette.error.main
      : tone === 'warn'
        ? theme.palette.warning.dark
        : tone === 'good'
          ? theme.palette.success.main
          : theme.palette.text.primary;
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: RADIUS.card,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography
        sx={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}
      >
        {n}
      </Typography>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        {label}
      </Typography>
    </Box>
  );
}

export function StudentIdentity({
  student,
  size = 38,
  secondary,
}: {
  student: StudentCard;
  size?: number;
  secondary?: React.ReactNode;
}) {
  return (
    <>
      <UserAvatar src={student.avatar_url} name={student.name || ''} size={size} />
      <Box sx={{ flex: 1, minWidth: 120 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }} noWrap>
          {student.name || student.email || 'Student'}
        </Typography>
        {secondary}
      </Box>
    </>
  );
}

export function StateChip({ item }: { item: Item }) {
  const theme = useTheme();
  const { label, tone } = stateLabel(item);
  const color =
    tone === 'good'
      ? theme.palette.success.main
      : tone === 'bad'
        ? theme.palette.error.main
        : tone === 'warn'
          ? theme.palette.warning.dark
          : theme.palette.text.disabled;
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 700,
        fontSize: '0.7rem',
        color,
        bgcolor: alpha(color, 0.1),
        border: `1px solid ${alpha(color, 0.3)}`,
      }}
    />
  );
}

export const SECTION_HEADING_SX = {
  fontSize: '0.6875rem',
  fontWeight: 800,
  letterSpacing: '.1em',
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
  mb: 1,
};
