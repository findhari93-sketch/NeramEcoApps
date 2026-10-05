'use client';

/**
 * Who is where, by name, on request: the class strip's numbers opened up.
 *
 * Founder, 2026-10-04: "I see 1 of 1 answered but nowhere can I see who that
 * one person is and who has not answered. It doesn't have to sit on the screen
 * all the time." So the console shows the counts, and this sheet, one tap away,
 * shows the people behind each one, with the one thing a teacher does next:
 *
 *   * Not answered: Nudge the class, accept or turn down a reason;
 *   * No pad (in the meeting, pad never opened): remind them, or, after asking
 *     them aloud, mark "Can't use the pad" so they stop counting as not answered;
 *   * Excused: Undo;
 *   * Away: why, read only.
 *
 * It stays open while the class goes on and updates with every snapshot.
 */

import { useEffect, useState } from 'react';
import { Box, Button, Chip, CircularProgress, Drawer, IconButton, Stack, Tooltip, Typography } from '@neram/ui';
import BackHandRounded from '@mui/icons-material/BackHandRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import DoneAllRounded from '@mui/icons-material/DoneAllRounded';
import NotificationsActiveRounded from '@mui/icons-material/NotificationsActiveRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import StudentAvatar from '@/components/students/StudentAvatar';
import { PAD_PROBLEM_LABEL, reasonLabel } from '@/lib/pad/client/format';
import { FUNNEL_GROUPS, funnelGroupLabel, funnelItems, type ClassFunnel, type FunnelGroup, type FunnelPerson } from '@/lib/pad/client/teacher-view';
import { HideNamesButton, useHideNames } from './HideNames';

export interface NudgeControl {
  secondsLeft: number;
  busy: boolean;
  message: string | null;
  onNudge: () => void;
}

/** Enough to scan in a 300px panel; the rest is one tap away. */
const FIRST_ROWS = 30;

export interface PeopleActions {
  /** Mark (true) or unmark (false) "Can't use the pad" for the rest of the round. */
  onCantUsePad: (studentId: string, on: boolean) => void;
  /** Accept (true), turn down (false) or undo (null) the reasons given; absent without a question on screen. */
  onDecide?: (studentIds: string[], approve: boolean | null) => void;
  /** Nudge everyone here who has not answered; an open question only. */
  nudge: NudgeControl | null;
  /** The meeting bot's reminder to open the pad; absent without the bot. */
  remind: { busy: boolean; message: string | null; onRemind: () => void } | null;
  disabled: boolean;
}

/** The chip a sheet opens on: who the teacher most likely wants to see now. */
export function defaultGroup(funnel: ClassFunnel): FunnelGroup {
  if (funnel.asking && funnel.groups.waiting.length > 0) return 'waiting';
  if (funnel.groups.no_pad.length > 0) return 'no_pad';
  if (funnel.asking) return 'answered';
  return 'waiting';
}

function emptyText(group: FunnelGroup, funnel: ClassFunnel): string {
  switch (group) {
    case 'answered':
      return 'No answers yet.';
    case 'waiting':
      return funnel.asking ? 'Everyone here has answered.' : 'Nobody has the pad open yet.';
    case 'no_pad':
      return funnel.meetingList
        ? 'Everyone in the meeting has opened the pad.'
        : 'Teams is not sharing who is in the meeting yet, so a student without the pad shows under Not here.';
    case 'excused':
      return 'Nobody is excused.';
    case 'not_here':
      return 'Everyone expected is here.';
    case 'away':
      return 'Nobody said they are away today.';
  }
}

function caption(person: FunnelPerson, asking: boolean): string | null {
  switch (person.group) {
    case 'answered':
      return null;
    case 'waiting':
      if (person.reason) return `Said: ${reasonLabel(person.reason)}${person.note ? `, ${person.note}` : ''}${person.approval === 'rejected' ? ' (not now)' : ''}`;
      return asking ? 'No answer yet' : 'Pad open';
    case 'no_pad':
      return 'In the meeting, pad not open';
    case 'excused':
      if (person.marked) return PAD_PROBLEM_LABEL;
      return person.reason ? `Said: ${reasonLabel(person.reason)}, accepted` : 'Excused';
    case 'not_here':
      return null;
    case 'away':
      return person.awayLabel ?? 'Away today';
  }
}

export default function PeopleSheet({
  open,
  onClose,
  funnel,
  startGroup,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  funnel: ClassFunnel;
  /** The chip to open on; the console's best guess when absent. */
  startGroup?: FunnelGroup | null;
  actions: PeopleActions;
}) {
  const [group, setGroup] = useState<FunnelGroup>(startGroup ?? defaultGroup(funnel));
  const [showAll, setShowAll] = useState(false);
  const [hidden, setHidden] = useHideNames();

  // Each time it opens, it opens where the console points.
  useEffect(() => {
    if (open) {
      setGroup(startGroup ?? defaultGroup(funnel));
      setShowAll(false);
    }
    // Only on opening: a refresh while it is open keeps the teacher's chip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startGroup]);

  const rows = funnel.groups[group];
  const shown = showAll ? rows : rows.slice(0, FIRST_ROWS);
  const visibleGroups = FUNNEL_GROUPS.filter(
    (key) => key === group || funnel.groups[key].length > 0 || key === 'waiting' || (key === 'answered' && funnel.asking),
  );
  const undecided = rows.filter((person) => person.reason && !person.approval).map((person) => person.student_id);
  const nudgeable = funnel.groups.waiting.filter((person) => !person.reason).length + funnel.groups.no_pad.filter((person) => !person.reason).length;

  return (
    <Drawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '88vh', maxWidth: 560, mx: 'auto' } }}
    >
      <Stack spacing={1.25} sx={{ p: 2, pb: 'calc(16px + env(safe-area-inset-bottom))' }} role="dialog" aria-label="Who is here">
        <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: 'divider', alignSelf: 'center' }} aria-hidden />
        <Stack direction="row" alignItems="flex-start" spacing={1}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography component="h2" variant="subtitle1" fontWeight={800}>
              Who is here
            </Typography>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {`${funnel.enrolled} in class · ${funnelItems(funnel).filter((item) => !item.endsWith('in class')).join(' · ')}`}
            </Typography>
          </Box>
          <HideNamesButton hidden={hidden} onChange={setHidden} />
        </Stack>

        <Box role="tablist" aria-label="Show" sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.5, mx: -0.5, px: 0.5 }}>
          {visibleGroups.map((key) => {
            const selected = key === group;
            return (
              <Chip
                key={key}
                role="tab"
                aria-selected={selected}
                label={`${funnelGroupLabel(key, funnel.asking)} ${funnel.groups[key].length}`}
                color={selected ? 'primary' : 'default'}
                variant={selected ? 'filled' : 'outlined'}
                onClick={() => {
                  setGroup(key);
                  setShowAll(false);
                }}
                sx={{ minHeight: 44, borderRadius: 22, flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: selected ? 700 : 500 }}
              />
            );
          })}
        </Box>

        {/* What a teacher does with this group, above its names. */}
        {group === 'waiting' && funnel.asking && (actions.nudge || (actions.onDecide && undecided.length > 1)) && (
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            {actions.nudge && nudgeable > 0 && (
              <Button
                variant="outlined"
                onClick={actions.nudge.onNudge}
                disabled={actions.disabled || actions.nudge.secondsLeft > 0}
                startIcon={actions.nudge.busy ? <CircularProgress size={18} color="inherit" aria-hidden /> : <BackHandRounded />}
                sx={{ minHeight: 44, fontWeight: 700 }}
              >
                {actions.nudge.secondsLeft > 0 ? `Nudge again in ${actions.nudge.secondsLeft}s` : `Nudge ${nudgeable}`}
              </Button>
            )}
            {actions.onDecide && undecided.length > 1 && (
              <Button variant="text" onClick={() => actions.onDecide?.(undecided, true)} disabled={actions.disabled} startIcon={<DoneAllRounded />} sx={{ minHeight: 44 }}>
                {`Accept all ${undecided.length} reasons`}
              </Button>
            )}
          </Stack>
        )}
        {group === 'waiting' && actions.nudge?.message && (
          <Typography variant="body2" color="text.secondary" role="status">
            {actions.nudge.message}
          </Typography>
        )}
        {group === 'no_pad' && rows.length > 0 && (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              {"Ask them to open Answer Pad in the meeting. If it will not open, mark them so they don't count as not answered."}
            </Typography>
            {actions.remind && (
              <Button
                variant="outlined"
                onClick={actions.remind.onRemind}
                disabled={actions.disabled}
                startIcon={actions.remind.busy ? <CircularProgress size={18} color="inherit" aria-hidden /> : <NotificationsActiveRounded />}
                sx={{ minHeight: 44, alignSelf: 'flex-start' }}
              >
                Remind them to open the pad
              </Button>
            )}
            {actions.remind?.message && (
              <Typography variant="body2" color="text.secondary" role="status">
                {actions.remind.message}
              </Typography>
            )}
          </Stack>
        )}

        <Box sx={{ overflowY: 'auto', minHeight: 120 }}>
          {rows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              {emptyText(group, funnel)}
            </Typography>
          ) : hidden ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              {`${rows.length} ${rows.length === 1 ? 'student' : 'students'}. Names are hidden.`}
            </Typography>
          ) : (
            <Stack component="ul" spacing={0.25} sx={{ listStyle: 'none', m: 0, p: 0 }} aria-label={funnelGroupLabel(group, funnel.asking)}>
              {shown.map((person) => (
                <PersonRow key={person.student_id} person={person} asking={funnel.asking} actions={actions} />
              ))}
            </Stack>
          )}
          {!hidden && rows.length > FIRST_ROWS && (
            <Button variant="text" onClick={() => setShowAll(!showAll)} aria-expanded={showAll} sx={{ minHeight: 44 }}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </Button>
          )}
        </Box>

        <Typography variant="caption" color="text.secondary">
          Teachers are not counted. Expected is the class list less students who told us they are away today.
        </Typography>
        <Button variant="outlined" onClick={onClose} sx={{ minHeight: 48 }}>
          Done
        </Button>
      </Stack>
    </Drawer>
  );
}

function PersonRow({ person, asking, actions }: { person: FunnelPerson; asking: boolean; actions: PeopleActions }) {
  const name = person.name ?? 'Unnamed student';
  const line = caption(person, asking);
  const undecided = !!person.reason && !person.approval && person.group !== 'excused';
  const canMark = person.group === 'no_pad' || person.group === 'not_here' || (person.group === 'waiting' && asking && !undecided);

  return (
    <Stack component="li" direction="row" spacing={1} alignItems="center" sx={{ minHeight: 52 }}>
      <StudentAvatar userId={person.student_id} name={name} size={32} sx={{ flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={600} noWrap>
          {name}
        </Typography>
        {line && (
          <Typography
            variant="caption"
            noWrap
            component="p"
            sx={{
              // The darker orange on a light panel, the lighter on a dark one: 4.5:1 on both.
              color: (t) => (person.group === 'no_pad' ? (t.palette.mode === 'dark' ? t.palette.warning.light : t.palette.warning.dark) : t.palette.text.secondary),
            }}
          >
            {line}
          </Typography>
        )}
      </Box>

      {undecided && actions.onDecide && (
        <>
          <Tooltip title="Accept: excused from this question">
            <IconButton aria-label={`Accept ${name}'s reason`} onClick={() => actions.onDecide?.([person.student_id], true)} disabled={actions.disabled} sx={{ width: 44, height: 44 }}>
              <CheckRounded />
            </IconButton>
          </Tooltip>
          <Tooltip title="Not now: still counts as not answered">
            <IconButton aria-label={`Turn down ${name}'s reason`} onClick={() => actions.onDecide?.([person.student_id], false)} disabled={actions.disabled} sx={{ width: 44, height: 44 }}>
              <CloseRounded />
            </IconButton>
          </Tooltip>
        </>
      )}
      {canMark && (
        <Button
          size="small"
          variant="text"
          onClick={() => actions.onCantUsePad(person.student_id, true)}
          disabled={actions.disabled}
          aria-label={`${name} can't use the pad`}
          sx={{ minHeight: 44, flexShrink: 0, whiteSpace: 'nowrap', px: 1 }}
        >
          {"Can't use pad"}
        </Button>
      )}
      {person.group === 'excused' && (
        <Button
          size="small"
          variant="text"
          color="inherit"
          startIcon={<UndoRounded />}
          onClick={() => (person.marked ? actions.onCantUsePad(person.student_id, false) : actions.onDecide?.([person.student_id], null))}
          disabled={actions.disabled || (!person.marked && !actions.onDecide)}
          aria-label={`Undo for ${name}`}
          sx={{ minHeight: 44, flexShrink: 0 }}
        >
          Undo
        </Button>
      )}
    </Stack>
  );
}
