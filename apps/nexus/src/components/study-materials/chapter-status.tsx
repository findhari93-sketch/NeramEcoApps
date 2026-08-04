'use client';

/**
 * How a chapter's state is shown, in one place.
 *
 * The two halves are named separately on purpose. Before the video existed,
 * everything between "opened" and "done" was "studying", which told a tutor
 * nothing about which nudge to send. "Needs the video" and "needs the test" are
 * different conversations with different students.
 */

import { Chip, Tooltip, Box, Typography } from '@neram/ui';

export type ChapterStatus =
  | 'not_opened'
  | 'studying'
  | 'video_pending'
  | 'test_pending'
  | 'completed';

export const STATUS_META: Record<
  ChapterStatus,
  { label: string; short: string; color: 'default' | 'success' | 'warning' | 'info'; hint: string }
> = {
  completed: {
    label: 'Completed',
    short: '✓',
    color: 'success',
    hint: 'Watched a recording and passed the chapter test.',
  },
  test_pending: {
    label: 'Needs the test',
    short: 'T',
    color: 'warning',
    hint: 'Finished a recording. The chapter test is open and not yet passed.',
  },
  video_pending: {
    label: 'Needs the video',
    short: 'V',
    color: 'warning',
    hint: 'Passed the test but has not watched a recording through.',
  },
  studying: { label: 'Studying', short: '·', color: 'info', hint: 'Opened it, nothing finished yet.' },
  not_opened: { label: 'Not opened', short: '', color: 'default', hint: 'Has never opened this chapter.' },
};

export function ChapterStatusChip({ status }: { status: ChapterStatus }) {
  const meta = STATUS_META[status];
  return (
    <Tooltip title={meta.hint}>
      <Chip size="small" color={meta.color} variant={status === 'completed' ? 'filled' : 'outlined'} label={meta.label} />
    </Tooltip>
  );
}

/** One cell of the cohort matrix. Small enough that ten fit on a phone row. */
export function ChapterStatusCell({
  status,
  score,
}: {
  status: ChapterStatus;
  score: number | null;
}) {
  const meta = STATUS_META[status];
  const bg =
    status === 'completed'
      ? 'success.main'
      : status === 'not_opened'
        ? 'action.hover'
        : status === 'studying'
          ? 'info.light'
          : 'warning.light';
  return (
    <Tooltip title={`${meta.label}${score != null ? ` · ${Math.round(score)}%` : ''}`}>
      <Box
        sx={{
          width: 34,
          height: 34,
          borderRadius: 1,
          bgcolor: bg,
          color: status === 'completed' ? 'success.contrastText' : 'text.primary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {status === 'completed' && score != null ? Math.round(score) : meta.short}
      </Box>
    </Tooltip>
  );
}

/**
 * Watch honesty, read as a signal rather than a verdict.
 *
 * A rewatch on a phone with a fat thumb produces a couple of refused seeks
 * honestly. It is worth a conversation at eleven, not at two, so only a run of
 * them is coloured.
 */
export function WatchHonesty({
  watchedSeconds,
  blockedSeeks,
  attempts,
}: {
  watchedSeconds: number;
  blockedSeeks: number;
  attempts: number;
}) {
  const mins = Math.round(watchedSeconds / 60);
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
      <Typography variant="caption" color="text.secondary">
        {mins > 0 ? `${mins}m watched` : 'not watched'}
      </Typography>
      {blockedSeeks > 0 && (
        <Tooltip title="Tried to skip past a checkpoint and was stopped. A few is normal on a phone.">
          <Chip
            size="small"
            variant="outlined"
            color={blockedSeeks >= 5 ? 'warning' : 'default'}
            label={`${blockedSeeks} skips blocked`}
          />
        </Tooltip>
      )}
      {attempts > 0 && (
        <Tooltip title="Checkpoint quiz attempts, including retries.">
          <Chip size="small" variant="outlined" label={`${attempts} tries`} />
        </Tooltip>
      )}
    </Box>
  );
}
