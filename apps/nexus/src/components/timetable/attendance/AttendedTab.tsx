'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { HOMEWORK_REMIND_EVERY_DAYS, shortIstDate } from '@/lib/homework-reminders';
import { knownStageKey } from '@/lib/student-stage';
import { rankByTimeInRoom } from '@/lib/attendance-quality';
import type { AttendanceTabProps, StudentInsight } from './types';
import InsightsLoadError from './InsightsLoadError';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import type { FilterSection } from '@/components/students/list/FilterMenu';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';

const INSIGHT_ACCESSORS: ListAccessors<StudentInsight> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
  dormant: (s) => s.dormant,
};
const TIME_IN_ROOM = [suggestedOrder<StudentInsight>('Shortest time in the room first')];

/**
 * Who came, ranked by how long they were actually in the room.
 *
 * The order IS the analysis. The people at the top left early, dropped out or
 * never really settled; the people at the bottom sat through the whole thing.
 * A flat alphabetical list of thirty names hides both.
 *
 * The bar next to each row is a div, not a chart. This tab used to pull recharts
 * behind a dynamic ssr:false import to draw thirty bars, which at 375px was
 * unreadable and cost a separate chunk on a screen a teacher opens after every
 * class. A sorted list with a proportional bar says the same thing, wraps
 * properly, and reads as a ranking rather than as a graph nobody asked for.
 */

function formatDuration(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * One number in the stat line. Five bordered tiles took two rows of a 480px
 * drawer before a single name; the same five numbers read as one sentence.
 */
function Stat({ value, label, tone = 'default' }: { value: string | number; label: string; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const color = { default: 'text.primary', good: 'success.main', warn: 'warning.dark', bad: 'error.main' }[tone];
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      <Box component="span" sx={{ fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Box>{' '}
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {label}
      </Box>
    </Box>
  );
}

/** Came, but not for all of it: late, left early, dropped out, or barely there. */
function isPartly(s: StudentInsight): boolean {
  return !!(s.joinedLate || s.leftEarly || s.droppedMidClass || s.barelyAttended);
}

/** Owes the class's homework: at least one assignment neither on time nor late. */
export function homeworkMissing(s: StudentInsight): boolean {
  return !!s.work && s.work.total > 0 && s.work.handedIn < s.work.total;
}

type AttendedFilter = 'all' | 'not_handed_in' | 'partly';

function WorkChip({ student }: { student: StudentInsight }) {
  const w = student.work;
  if (!w || w.total === 0) return null;
  if (w.handedIn === w.total) {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        label={w.late ? 'Homework in, late' : 'Homework in'}
      />
    );
  }
  if (w.redo) return <Chip size="small" color="warning" variant="outlined" label="Homework sent back" />;
  return <Chip size="small" color="error" variant="outlined" label="Homework not in" />;
}

/**
 * One line above the list: who came and still owes the homework, and the one
 * thing to do about it. Once reminders are running it says when the next one
 * goes, so the schedule is never invisible, and offers Stop.
 */
function HomeworkStrip({
  owing,
  onRemind,
  onStop,
  busy,
}: {
  owing: StudentInsight[];
  onRemind: (ids: string[]) => void;
  onStop?: () => void;
  busy?: boolean;
}) {
  const theme = useTheme();
  const running = owing.filter((s) => s.homeworkReminder?.active);
  const notYet = owing.filter((s) => !s.homeworkReminder?.active);
  const nextOn = running
    .map((s) => s.homeworkReminder?.nextOn)
    .filter((d): d is string => !!d)
    .sort()[0];
  const tone = running.length ? theme.palette.primary.main : theme.palette.error.main;
  const Icon = running.length ? NotificationsActiveOutlinedIcon : AssignmentLateOutlinedIcon;

  return (
    <Box
      role="region"
      aria-label="Homework reminders"
      data-testid="homework-strip"
      sx={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        columnGap: 1,
        rowGap: 0.5,
        px: 1.5,
        py: 0.75,
        mb: 1,
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(tone, 0.35),
        bgcolor: alpha(tone, 0.05),
      }}
    >
      <Icon fontSize="small" sx={{ color: tone }} aria-hidden />
      <Typography variant="body2" sx={{ flex: '1 1 200px', minWidth: 0 }}>
        {running.length === 0 ? (
          <>
            <b>{owing.length}</b> came but {owing.length === 1 ? 'has' : 'have'} not handed in the homework
          </>
        ) : (
          <>
            Reminding <b>{running.length === owing.length ? owing.length : `${running.length} of ${owing.length}`}</b>{' '}
            every {HOMEWORK_REMIND_EVERY_DAYS} days until they hand it in
            {nextOn ? `. Next ${shortIstDate(nextOn)}` : ''}
          </>
        )}
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.5, ml: 'auto' }}>
        {running.length > 0 && onStop && (
          <Button
            size="small"
            color="inherit"
            onClick={onStop}
            disabled={busy}
            sx={{ minHeight: 44, textTransform: 'none' }}
            data-testid="homework-stop"
          >
            Stop
          </Button>
        )}
        {notYet.length > 0 && (
          <Button
            size="small"
            variant={running.length ? 'outlined' : 'contained'}
            onClick={() => onRemind(notYet.map((s) => s.id))}
            disabled={busy}
            sx={{ minHeight: 44, textTransform: 'none', whiteSpace: 'nowrap' }}
            data-testid="homework-remind"
          >
            {running.length ? `Remind ${notYet.length} more` : 'Remind them'}
          </Button>
        )}
      </Box>
    </Box>
  );
}

function AttendedRow({
  student,
  longest,
  scheduled,
  selected,
  onSelect,
}: {
  student: StudentInsight;
  longest: number;
  scheduled: number;
  selected: boolean;
  onSelect: (id: string, next: boolean) => void;
}) {
  const theme = useTheme();
  const minutes = student.duration_minutes;
  const known = minutes != null && Number.isFinite(minutes);
  const width = known && longest > 0 ? Math.max(2, ((minutes as number) / longest) * 100) : 0;
  const tone = student.barelyAttended
    ? theme.palette.error.main
    : student.leftEarly || student.droppedMidClass || student.joinedLate
      ? theme.palette.warning.main
      : theme.palette.success.main;

  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 0.5,
        py: 0.75,
        minHeight: 48,
        borderRadius: 1,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <Checkbox
        checked={selected}
        onChange={(e) => onSelect(student.id, e.target.checked)}
        sx={{ p: 1.25 }}
        inputProps={{ 'aria-label': `Select ${student.name}` }}
      />
      <StudentStageAvatar
        stage={knownStageKey(student.study_stage)}
        dormant={student.dormant}
        userId={student.id}
        name={student.name}
        src={student.avatar_url}
        size={32}
        tapToView={false}
      />
      <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {student.name}
        </Typography>
        {known ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, minWidth: 46, fontVariantNumeric: 'tabular-nums' }}
            >
              {formatDuration(minutes)}
            </Typography>
            <Box
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 99,
                bgcolor: alpha(theme.palette.text.disabled, 0.15),
                overflow: 'hidden',
              }}
            >
              <Box sx={{ width: `${width}%`, height: '100%', bgcolor: tone }} />
            </Box>
            {scheduled > 0 && (
              <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                of {scheduled}m
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="caption" color="text.disabled">
            Duration not reported by Teams
          </Typography>
        )}
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
          {student.barelyAttended && (
            <Chip size="small" color="error" variant="outlined" label="Barely attended" />
          )}
          {student.joinedLate && <Chip size="small" color="warning" variant="outlined" label="Late" />}
          {student.leftEarly && <Chip size="small" color="warning" variant="outlined" label="Left early" />}
          {student.droppedMidClass && (
            <Chip size="small" color="warning" variant="outlined" label="Dropped and rejoined" />
          )}
          {student.rsvp === 'not_attending' && (
            <Chip size="small" color="info" variant="outlined" label="Came anyway" />
          )}
          <WorkChip student={student} />
          {student.homeworkReminder?.active && homeworkMissing(student) && (
            <Chip
              size="small"
              variant="outlined"
              icon={<NotificationsActiveOutlinedIcon />}
              label={`Reminding, next ${shortIstDate(student.homeworkReminder.nextOn)}`}
              data-testid="homework-reminder-chip"
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function AttendedTab({
  insights,
  insightsLoading,
  insightsError,
  insightsRetrying,
  onRetryInsights,
  selected,
  onSelect,
  initialFilter,
  onRemindHomework,
  onStopHomeworkReminders,
  homeworkBusy,
}: AttendanceTabProps) {
  const start: AttendedFilter =
    initialFilter === 'not_handed_in' ? 'not_handed_in' : initialFilter === 'partly' ? 'partly' : 'all';
  const theme = useTheme();
  const [filter, setFilter] = useState<AttendedFilter>(start);
  useEffect(() => setFilter(start), [start]);

  const everyone = useMemo(
    () => rankByTimeInRoom((insights?.students ?? []).filter((s) => s.attended)),
    [insights],
  );
  const owing = useMemo(() => everyone.filter(homeworkMissing), [everyone]);
  const missingCount = owing.length;
  const partlyCount = everyone.filter(isPartly).length;
  const ranked = useMemo(
    () =>
      filter === 'not_handed_in'
        ? everyone.filter(homeworkMissing)
        : filter === 'partly'
          ? everyone.filter(isPartly)
          : everyone,
    [everyone, filter],
  );
  // The order IS the analysis here, so the shared list keeps it by default and
  // adds search, the stage filter and the other sorts on top.
  const view = useStudentListView<StudentInsight, 'suggested'>({
    rows: ranked,
    accessors: INSIGHT_ACCESSORS,
    extraSorts: TIME_IN_ROOM,
    defaultSort: 'suggested',
    urlKeys: false,
  });

  // Who came is not the end of it: the class set homework, and a student who
  // sat through the class and handed nothing in needs the same nudge as one
  // catching up. Offered only when there is something to filter to.
  const filters: FilterSection[] =
    missingCount > 0 || partlyCount > 0
      ? [
          {
            id: 'attended',
            title: 'Show only',
            mode: 'single',
            allLabel: 'Everyone who came',
            value: filter === 'all' ? [] : [filter],
            onToggle: (key) => setFilter((cur) => (cur === key ? 'all' : (key as AttendedFilter))),
            onClear: () => setFilter('all'),
            hideEmpty: true,
            options: [
              { key: 'not_handed_in', label: 'Homework not in', count: missingCount, color: theme.palette.error.main },
              { key: 'partly', label: 'Partly there', count: partlyCount, color: theme.palette.warning.main },
            ],
          },
        ]
      : [];

  // Before the loading check: SWR reports loading again on every retry, and this
  // tab used to hold skeletons over a failed load with nothing to press.
  if (insightsError && !insights) {
    return <InsightsLoadError message={insightsError} retrying={insightsRetrying} onRetry={onRetryInsights} />;
  }

  if (insightsLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (!insights) return <Alert severity="info">Could not load this class.</Alert>;

  const s = insights.summary;
  const longest = ranked.reduce(
    (max, r) => (r.duration_minutes != null && r.duration_minutes > max ? r.duration_minutes : max),
    0,
  );

  return (
    <>
      <Typography
        component="p"
        variant="body2"
        data-testid="attended-stats"
        sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.25, mb: 1 }}
      >
        <Stat value={`${s.present} of ${s.rosterSize}`} label="came" tone="good" />
        <Stat value={`${s.avgDuration} min`} label="average stay" />
        <Stat value={s.lateCount} label="joined late" tone={s.lateCount ? 'warn' : 'default'} />
        <Stat value={s.leftEarlyCount} label="left early" tone={s.leftEarlyCount ? 'warn' : 'default'} />
        <Stat value={s.barelyAttendedCount} label="barely there" tone={s.barelyAttendedCount ? 'bad' : 'default'} />
      </Typography>

      {everyone.length === 0 ? (
        <Alert severity="warning" sx={{ borderRadius: 2 }}>
          Nobody is recorded as having attended. If that is wrong, open Register and either sync
          from Teams or mark the class by hand.
        </Alert>
      ) : (
        <>
          {/* The order is the sort ("Shortest time in the room first"), which the
              Sort button names; the homework and partly-there filters sit with
              search and stage, as chips on a wide screen and inside the one
              Filter button in a drawer. */}
          {onRemindHomework && owing.length > 0 && (
            <HomeworkStrip
              owing={owing}
              onRemind={onRemindHomework}
              onStop={onStopHomeworkReminders}
              busy={homeworkBusy}
            />
          )}
          <StudentListToolbar view={view} filters={filters} />
          {s.barelyAttendedCount > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              Anyone in for under {s.barelyAttendedCutoff} minutes of a {s.scheduledMinutes} minute
              class is flagged. They still count as present.
            </Typography>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {view.shown.map((student) => (
              <AttendedRow
                key={student.id}
                student={student}
                longest={longest}
                scheduled={s.scheduledMinutes}
                selected={selected.has(student.id)}
                onSelect={onSelect}
              />
            ))}
          </Box>
          <PausedFootnote count={view.pausedHidden} />
        </>
      )}
    </>
  );
}
