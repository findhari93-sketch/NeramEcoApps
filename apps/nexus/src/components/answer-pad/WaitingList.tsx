'use client';

/**
 * Who has not answered yet, by name, while the question is open (founder,
 * 2026-09-30: "that is more priority"). Only students who joined this round are
 * listed; a student on the class list who never opened the pad is not waited on.
 *
 * Ordered the way the teacher acts: reasons waiting for a decision first (Accept
 * or Not now), then reasons turned down, then students who have said nothing,
 * who are the ones Nudge reaches. Accepted reasons fold away under Excused and
 * leave the question's count.
 */

import { useState } from 'react';
import { Box, Button, Chip, CircularProgress, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from '@neram/ui';
import BackHandRounded from '@mui/icons-material/BackHandRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { SKIP_REASON_LABELS } from '@/lib/pad/client/format';
import { waitingView } from '@/lib/pad/client/teacher-view';
import type { WaitingStudent } from '@/lib/pad/client/types';
import { HideNamesButton, useHideNames } from './HideNames';

/** Enough to scan at a glance in a 320px panel; the rest is one tap away. */
const FIRST_ROWS = 8;

export interface NudgeControl {
  secondsLeft: number;
  busy: boolean;
  message: string | null;
  onNudge: () => void;
}

export default function WaitingList({
  rows,
  open,
  disabled,
  onDecide,
  nudge,
}: {
  rows: WaitingStudent[] | undefined;
  /** Nudge is for an open question only. */
  open: boolean;
  disabled: boolean;
  /** true accepts the reasons (excused), false turns them down, null undoes the decision. */
  onDecide: (studentIds: string[], approve: boolean | null) => void;
  nudge: NudgeControl | null;
}) {
  const [hidden, setHidden] = useHideNames();
  const [showAll, setShowAll] = useState(false);
  const [showExcused, setShowExcused] = useState(false);
  const view = waitingView(rows);
  // A server without the list (an older deploy) sends nothing: say nothing rather than "everyone answered".
  if (!rows) return null;
  const undecidedIds = view.waiting.filter((row) => row.reason && row.approval === null).map((row) => row.student_id);
  const shown = showAll ? view.waiting : view.waiting.slice(0, FIRST_ROWS);

  const nobodyWaiting = view.waiting.length === 0;

  return (
    <Paper variant="outlined" component="section" aria-labelledby="pad-waiting-heading" sx={{ p: 1.5, width: '100%' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography id="pad-waiting-heading" variant="subtitle2" component="h2" fontWeight={800} sx={{ flex: 1 }}>
          {nobodyWaiting ? 'Everyone who joined has answered' : `Waiting on ${view.waiting.length}`}
        </Typography>
        {!nobodyWaiting && <HideNamesButton hidden={hidden} onChange={setHidden} />}
      </Stack>

      {(open && nudge && view.nudgeable > 0) || undecidedIds.length > 1 ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
          {open && nudge && view.nudgeable > 0 && (
            <Button
              variant="outlined"
              onClick={nudge.onNudge}
              disabled={disabled || nudge.secondsLeft > 0}
              startIcon={nudge.busy ? <CircularProgress size={18} color="inherit" aria-hidden /> : <BackHandRounded />}
              sx={{ minHeight: 44, fontWeight: 700 }}
            >
              {nudge.secondsLeft > 0 ? `Nudge again in ${nudge.secondsLeft}s` : `Nudge ${view.nudgeable}`}
            </Button>
          )}
          {undecidedIds.length > 1 && (
            <Button variant="text" onClick={() => onDecide(undecidedIds, true)} disabled={disabled} startIcon={<DoneAllRounded />} sx={{ minHeight: 44 }}>
              {`Accept all ${undecidedIds.length} reasons`}
            </Button>
          )}
        </Stack>
      ) : null}
      {nudge?.message && (
        <Typography variant="body2" color="text.secondary" role="status" sx={{ mt: 0.75 }}>
          {nudge.message}
        </Typography>
      )}

      {!nobodyWaiting &&
        (hidden ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            {`${view.waiting.length - view.nudgeable} gave a reason, ${view.nudgeable} ${view.nudgeable === 1 ? 'has' : 'have'} not answered. Names are hidden.`}
          </Typography>
        ) : (
          <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, mt: 1, p: 0 }}>
            {shown.map((row) => (
              <WaitingRow key={row.student_id} row={row} disabled={disabled} onDecide={onDecide} />
            ))}
          </Stack>
        ))}
      {!hidden && view.waiting.length > FIRST_ROWS && (
        <Button variant="text" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} sx={{ minHeight: 44, mt: 0.5 }}>
          {showAll ? 'Show fewer' : `Show all ${view.waiting.length}`}
        </Button>
      )}

      {view.excused.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Button
            variant="text"
            onClick={() => setShowExcused(!showExcused)}
            aria-expanded={showExcused}
            endIcon={<ExpandMoreRounded sx={{ transform: showExcused ? 'rotate(180deg)' : 'none', transition: 'transform 150ms', '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }} />}
            sx={{ minHeight: 44 }}
          >
            {`Excused (${view.excused.length})`}
          </Button>
          <Collapse in={showExcused && !hidden} unmountOnExit>
            <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {view.excused.map((row) => (
                <WaitingRow key={row.student_id} row={row} disabled={disabled} onDecide={onDecide} />
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Paper>
  );
}

function WaitingRow({ row, disabled, onDecide }: { row: WaitingStudent; disabled: boolean; onDecide: (ids: string[], approve: boolean | null) => void }) {
  const name = row.name ?? 'Unnamed student';
  const reason = row.reason ? `${SKIP_REASON_LABELS[row.reason]}${row.note ? `: ${row.note}` : ''}` : null;
  return (
    <Stack component="li" direction="row" spacing={1} alignItems="center" sx={{ minHeight: 48 }}>
      <StudentAvatar userId={row.student_id} name={name} size={32} sx={{ flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} sx={{ overflowWrap: 'anywhere' }}>
          {name}
        </Typography>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
          {reason ? (
            <Chip
              size="small"
              variant="outlined"
              color={row.approval === 'approved' ? 'success' : row.approval === 'rejected' ? 'default' : 'warning'}
              label={row.approval === 'rejected' ? `Asked to try: ${reason}` : reason}
              sx={{ maxWidth: '100%', height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }}
            />
          ) : (
            <Typography variant="caption" color="text.secondary">
              No answer yet
            </Typography>
          )}
          {row.nudged_at && !row.reason && (
            <Typography variant="caption" color="text.secondary">
              Nudged
            </Typography>
          )}
          {!row.pad_open && (
            <Typography variant="caption" color="text.secondary">
              Pad closed
            </Typography>
          )}
        </Stack>
      </Box>
      {row.reason && row.approval !== 'approved' && (
        <Tooltip title="Accept: this question won't count for them">
          <span>
            <IconButton aria-label={`Accept ${name}'s reason`} color="success" disabled={disabled} onClick={() => onDecide([row.student_id], true)} sx={{ width: 44, height: 44 }}>
              <CheckRounded />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {row.reason && row.approval === null && (
        <Tooltip title="Not now: ask them to try">
          <span>
            <IconButton aria-label={`Turn down ${name}'s reason`} disabled={disabled} onClick={() => onDecide([row.student_id], false)} sx={{ width: 44, height: 44 }}>
              <CloseRounded />
            </IconButton>
          </span>
        </Tooltip>
      )}
      {row.approval === 'approved' && (
        <Tooltip title="Undo: count this question again">
          <span>
            <IconButton aria-label={`Undo excusing ${name}`} disabled={disabled} onClick={() => onDecide([row.student_id], null)} sx={{ width: 44, height: 44 }}>
              <UndoRounded />
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Stack>
  );
}
