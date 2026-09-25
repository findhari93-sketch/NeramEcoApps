'use client';

import type { ReactNode } from 'react';
import {
  Box,
  Button,
  Chip,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  emptyFollowupTally,
  type FollowupState,
  type FollowupTally,
  type FollowupTone,
} from '@/lib/class-followup';
import type { AssignmentSummary } from '@/lib/class-work';
import { useClassInsights } from '../attendance/useClassInsights';
import FollowupGrid from '../attendance/FollowupGrid';
import type { AttendanceFilter, AttendanceTabKey, Insights } from '../attendance/types';
import { SECTION_LABEL_SX } from '../timetable-theme';

export interface OpenAttendanceOptions {
  tab?: AttendanceTabKey;
  filter?: AttendanceFilter | null;
}

interface ClassOutcomeCardProps {
  classId: string;
  /** The class's OWN classroom (a Common class can sit in another). */
  classroomId: string;
  getToken: () => Promise<string | null>;
  onOpen?: (opts?: OpenAttendanceOptions) => void;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function useTone() {
  const theme = useTheme();
  return (tone: FollowupTone) => (tone === 'neutral' ? theme.palette.grey[500] : theme.palette[tone].main);
}

/** The bar's segments, in reading order: the good news first. */
interface Segment {
  key: string;
  label: string;
  count: number;
  color: string;
}

function segmentsOf(t: FollowupTally, tone: (t: FollowupTone) => string, caughtUpColor: string): Segment[] {
  const came = t.attended + t.partly;
  const caughtUp = t.caught_up + t.caught_up_silent;
  const other = t.waiting_on_us + t.late_joiner + t.excused;
  return [
    { key: 'came', label: 'Came', count: came, color: tone('success') },
    { key: 'caught_up', label: 'Caught up', count: caughtUp, color: caughtUpColor },
    { key: 'catching_up', label: 'Catching up', count: t.catching_up, color: tone('warning') },
    { key: 'needs_call', label: 'Needs a call', count: t.needs_call, color: tone('error') },
    { key: 'other', label: otherLabel(t), count: other, color: tone('neutral') },
  ].filter((s) => s.count > 0);
}

/** The grey segment, named for what is in it when it is one thing. */
function otherLabel(t: FollowupTally): string {
  const parts = [
    t.late_joiner ? 'Joined later' : null,
    t.waiting_on_us ? 'Waiting on us' : null,
    t.excused ? 'Excused' : null,
  ].filter(Boolean) as string[];
  return parts.length === 1 ? parts[0] : 'Other';
}

/**
 * The class's whole roster as one bar, with the words beside it: colour is
 * never the only thing carrying the meaning. A div, not a chart library.
 */
function RosterBar({ segments, total }: { segments: Segment[]; total: number }) {
  const sentence = segments.map((s) => `${s.label} ${s.count}`).join(', ');
  return (
    <Box>
      <Box
        role="img"
        aria-label={`Of ${total} students: ${sentence}`}
        sx={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', gap: '2px', bgcolor: 'action.hover' }}
      >
        {segments.map((s) => (
          <Box key={s.key} sx={{ flexGrow: s.count, flexBasis: 0, minWidth: 4, bgcolor: s.color }} />
        ))}
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5, mt: 1 }} aria-hidden>
        {segments.map((s) => (
          <Box key={s.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: s.color, flexShrink: 0 }} />
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {s.label} {s.count}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function WorkRow({
  work,
  onOpenMissing,
}: {
  work: AssignmentSummary;
  onOpenMissing?: () => void;
}) {
  const theme = useTheme();
  const pct = work.expected ? Math.round((work.handedIn / work.expected) * 100) : 0;
  const prework = work.timing === 'prework';
  const notInCatchingUp = work.missingCatchingUp;
  return (
    <Box sx={{ py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <AssignmentOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap title={work.title}>
          {prework ? 'Prework: ' : 'Homework: '}
          {work.title}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
          {work.handedIn}/{work.expected}
        </Typography>
      </Box>
      <Box
        role="img"
        aria-label={`${work.handedIn} of ${work.expected} handed in`}
        sx={{ height: 6, borderRadius: 99, bgcolor: 'action.hover', overflow: 'hidden', mt: 0.75 }}
      >
        <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: theme.palette.success.main }} />
      </Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
        {work.missingCame > 0 && (
          <Chip
            label={`${work.missingCame} who came have not handed it in`}
            color="error"
            variant="outlined"
            onClick={onOpenMissing}
            icon={onOpenMissing ? <ChevronRightIcon /> : undefined}
            sx={{ minHeight: 44, fontWeight: 600, '& .MuiChip-icon': { order: 1, ml: -0.5, mr: 0.5 } }}
          />
        )}
        {work.missingCaughtUp > 0 && (
          <Chip label={`${work.missingCaughtUp} caught up, not handed in`} variant="outlined" sx={{ minHeight: 44 }} />
        )}
        {notInCatchingUp > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {plural(notInCatchingUp, 'student')} still catching up owe it too.
          </Typography>
        )}
        {work.missingCame === 0 && work.missingCaughtUp === 0 && notInCatchingUp === 0 && (
          <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
            Everyone has handed it in.
          </Typography>
        )}
      </Box>
    </Box>
  );
}

/**
 * "How this class went", on the drawer's After tab.
 *
 * Replaces Expected / Away / Opted in / Attended. That row read its Attended
 * figure from a per-class fan-out the timetable page skips in Month view, so a
 * class opened from the month grid said "Attended 0" beside a dialog that said
 * 20. This reads the same payload as the dialog (one SWR key), so the two can
 * never disagree, and it answers the question a teacher opens a past class
 * with: is anything left to do about it.
 */
export default function ClassOutcomeCard({ classId, classroomId, getToken, onOpen }: ClassOutcomeCardProps) {
  const theme = useTheme();
  const tone = useTone();
  const { data, error, isLoading, mutate } = useClassInsights(classId, classroomId, getToken);
  // Only a payload that looks like class-insights counts. A device cache or a
  // proxy can hand back something else, and a card that throws takes the whole
  // drawer down with it.
  const insights = (data && typeof data === 'object' && (data as Insights).class ? data : null) as Insights | null;

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <PeopleAltIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
      <Typography sx={{ ...SECTION_LABEL_SX, mb: 0, flex: 1 }}>How this class went</Typography>
      {onOpen && (
        <Button
          size="small"
          endIcon={<ChevronRightIcon />}
          onClick={() => onOpen()}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
        >
          View all
        </Button>
      )}
    </Box>
  );

  const frame = (children: ReactNode) => (
    <Box
      component="section"
      aria-label="How this class went"
      sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2 }}
    >
      {header}
      {children}
    </Box>
  );

  if (isLoading && !insights) {
    return frame(
      <Box aria-busy="true" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="rectangular" height={12} sx={{ borderRadius: 99 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={64} sx={{ borderRadius: 1.5 }} />
          ))}
        </Box>
      </Box>,
    );
  }

  if (!insights) {
    return frame(
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {error ? 'Could not load attendance for this class.' : 'No attendance for this class yet.'}
        </Typography>
        {error && (
          <Button size="small" onClick={() => mutate()} sx={{ minHeight: 44, textTransform: 'none' }}>
            Try again
          </Button>
        )}
      </Box>,
    );
  }

  const f = insights.followup;
  const t = f?.tally ?? emptyFollowupTally();
  const came = t.attended + t.partly;
  const missed = f?.missed ?? 0;
  const measured = insights.class.measured !== false;

  if (!measured && missed === 0) {
    return frame(
      <Typography variant="body2" color="text.secondary">
        Attendance has not been synced from Teams yet, so nobody is marked present or missing. Open
        Attendance and follow-up and press Sync from Teams.
      </Typography>,
    );
  }

  const segments = segmentsOf(t, tone, alpha(theme.palette.success.main, 0.5));
  const counted = segments.reduce((n, s) => n + s.count, 0);
  const aside: Array<{ state: FollowupState; text: string; tab?: AttendanceTabKey }> = [];
  if (t.partly) aside.push({ state: 'partly', text: `${t.partly} came late or left early`, tab: 'attended' });
  if (t.waiting_on_us) aside.push({ state: 'waiting_on_us', text: `${t.waiting_on_us} waiting on the recap` });
  if (t.late_joiner) aside.push({ state: 'late_joiner', text: `${t.late_joiner} joined later` });
  if (t.excused) aside.push({ state: 'excused', text: `${t.excused} excused` });

  const timing: string[] = [];
  if (f?.oldestOpenDays != null && (t.needs_call || t.catching_up)) {
    timing.push(`class was ${plural(f.oldestOpenDays, 'day')} ago`);
  }
  if (f?.medianDaysToCatchUp != null) {
    timing.push(
      f.medianDaysToCatchUp === 0
        ? 'most caught up the same day'
        : `typical catch-up took ${plural(f.medianDaysToCatchUp, 'day')}`,
    );
  }

  const open = (filter: AttendanceFilter, tab: AttendanceTabKey = 'missed') =>
    onOpen ? () => onOpen({ tab, filter }) : undefined;

  return frame(
    <>
      <Box>
        <Typography variant="body1" sx={{ fontWeight: 700 }}>
          {came} came{missed > 0 ? `, ${missed} missed` : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {f ? `${f.saidComing} were expected after RSVPs and leave` : null}
        </Typography>
      </Box>

      {counted > 0 && <RosterBar segments={segments} total={counted} />}

      {missed > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, display: 'block', mb: 0.75 }}>
            Of the {missed} who missed it
          </Typography>
          <FollowupGrid
            counts={{
              caught_up: t.caught_up,
              catching_up: t.catching_up,
              caught_up_silent: t.caught_up_silent,
              needs_call: t.needs_call,
            }}
            onSelect={onOpen ? (st) => onOpen({ tab: 'missed', filter: st }) : undefined}
          />

          {timing.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {timing.join(' · ').replace(/^./, (c) => c.toUpperCase())}
            </Typography>
          )}
        </Box>
      )}

      {aside.length > 0 && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {aside.map((a) => (
            <Chip
              key={a.state}
              label={a.text}
              variant="outlined"
              onClick={open(a.state, a.tab)}
              sx={{ minHeight: 44 }}
            />
          ))}
        </Box>
      )}

      {(insights.work?.length ?? 0) > 0 && (
        <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 0.5 }}>
          {insights.work!.map((w) => (
            <WorkRow key={w.id} work={w} onOpenMissing={open('not_handed_in', 'attended')} />
          ))}
        </Box>
      )}
    </>,
  );
}
