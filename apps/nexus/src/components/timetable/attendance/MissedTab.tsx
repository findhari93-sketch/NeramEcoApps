'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PhoneIcon from '@mui/icons-material/Phone';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import { knownStageKey } from '@/lib/student-stage';
import { reasonShortLabel } from '@/lib/rsvp-reasons';
import {
  FOLLOWUP_META,
  MISSED_ORDER,
  OUTSTANDING,
  isIrregular,
  stateFromBucket,
  type FollowupState,
  type FollowupTone,
} from '@/lib/class-followup';
import type { AttendanceTabProps, StudentInsight } from './types';
import InsightsLoadError from './InsightsLoadError';
import FollowupGrid from './FollowupGrid';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import { suggestedOrder, type ListAccessors } from '@/lib/student-list-view';

const INSIGHT_ACCESSORS: ListAccessors<StudentInsight> = {
  id: (s) => s.id,
  name: (s) => s.name,
  joinedAt: (s) => s.enrolled_at,
  dormant: (s) => s.dormant,
};
const GROUP_ORDER = [suggestedOrder<StudentInsight>('Grouped by follow-up')];

/**
 * Who was not here, grouped by what is left to do about it.
 *
 * The groups are the corners of one grid, told us why (or not) against caught
 * up (or not), plus the states that sit on neither axis. The order is the
 * teacher's order: the students who said nothing and have not caught up come
 * first because they are the ones to ring; the ones who explained and are
 * still working come second because they need a look, not a call. The recap
 * we have not published comes third, because that one is on us. Everyone who
 * is finished comes last.
 *
 * The picture comes first: the same 2x2 grid as the class card, whose corners
 * are the filter, then every group as one closed line. A teacher sees the
 * whole class on the first screen and opens the group they want, instead of
 * scrolling past chip rows and open lists to find it.
 *
 * "Told us why" is the resolved reason (lib/absence-reason.ts): a declared
 * away window and an RSVP decline count, and the row says which it was. This
 * list used to read only the reason typed after the class, so everyone on exam
 * leave sat under "Told us why" with "No reason given" printed beside them.
 */

function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  } catch {
    return null;
  }
}

/** The state from the server, or worked out from the older bucket field. */
export function stateOf(s: StudentInsight): FollowupState {
  return s.followup ?? stateFromBucket(s.bucket);
}

/**
 * What this student has and has not done about the class, and how long it has
 * been. The server's `catchup.progress` is the catch-up page's own sentence
 * ("40% watched, 2 sittings, last active 5 days ago"); the clock is added here.
 */
export function progressLine(s: StudentInsight): string {
  const a = s.absence;
  const c = s.catchup;

  if (a?.excused_at) return 'Excused by a teacher';
  if (a?.caught_up_at) {
    return c?.cleared_after ? `Caught up ${c.cleared_after}` : 'Caught up';
  }

  // Ours, not theirs. Saying "not started" about a class with no recording
  // blames a student for a gap they cannot close.
  if (c?.status === 'blocked') return 'No recording for them to watch yet';
  if (c?.status === 'pending_teacher') return 'Waiting on the recap being published';

  const hasWatched = c?.watched ?? !!a?.recording_watched_at;
  const where = c?.progress || (hasWatched ? 'Watched the recording' : 'Recording not watched');

  if (c?.overdue && typeof c.days_left === 'number') {
    const over = Math.abs(c.days_left);
    return `${where} · ran over by ${over === 1 ? '1 day' : `${over} days`}`;
  }
  if (c?.active && typeof c.days_left === 'number') {
    return `${where} · ${c.days_left === 1 ? '1 day left' : `${c.days_left} days left`}`;
  }
  // No clock running at all. The window is quoted rather than counted down,
  // because nothing is late until they choose to start. How long the class has
  // been sitting there is what tells a teacher whether that is fine.
  const since = typeof s.days_since_class === 'number' ? daysAgo(s.days_since_class) : null;
  if (c) {
    return since
      ? `${where} · class was ${since}, ${c.window_days} days once they start`
      : `${where} · not started, ${c.window_days} days once they do`;
  }
  return since ? `${where} · class was ${since}` : where;
}

function daysAgo(n: number): string {
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

/**
 * The class-level answer to "did the people who missed this come back, and how
 * fast". Median rather than mean, so one student who cleared it four months
 * later does not describe the group.
 */
export function caughtUpSummary(students: StudentInsight[]): string | null {
  const missed = students.filter((s) => !s.attended && s.absence);
  if (missed.length === 0) return null;
  const cleared = missed.filter((s) => s.absence?.caught_up_at);
  const days = cleared
    .map((s) => s.catchup?.cleared_after)
    .filter((v): v is string => !!v)
    .map((v) => (v === 'same day' ? 0 : v === 'the next day' ? 1 : parseInt(v, 10)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const base = `${cleared.length} of ${missed.length} caught up`;
  if (days.length === 0) return base;
  const mid = Math.floor(days.length / 2);
  const median =
    days.length % 2 === 1 ? days[mid] : Math.round((days[mid - 1] + days[mid]) / 2);
  return `${base} · median ${median === 1 ? '1 day' : `${median} days`}`;
}

/** Most urgent first inside "still catching up": over time, stuck, untouched. */
function urgency(s: StudentInsight): number {
  const c = s.catchup;
  if (c?.overdue) return 0;
  if (c?.stuck) return 1;
  if (!c?.watched && !c?.active && !c?.last_active_at) return 2;
  return 3;
}

/** The reason in one line, whichever route it came by. */
function ReasonLine({ student }: { student: StudentInsight }) {
  const a = student.absence;
  const r = student.reason_resolved;
  const joined = shortDate(student.enrolled_at ?? null);

  if (student.joinedAfterClass) {
    // Never "No reason given". They enrolled after this class ran, so there
    // was nothing for them to explain.
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        Joined after this class{joined && `, enrolled ${joined}`}
      </Typography>
    );
  }

  if (r) {
    const said = shortDate(r.at);
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {r.line}
        {said && r.source !== 'away' && `, ${said}`}
        {r.note && (
          // overflowWrap: a student's own words can be one long unbroken string,
          // and truncating the reason defeats the point of showing it.
          <Box
            component="span"
            sx={{ display: 'block', fontStyle: 'italic', color: 'text.primary', overflowWrap: 'anywhere' }}
          >
            &ldquo;{r.note}&rdquo;
          </Box>
        )}
      </Typography>
    );
  }

  // An older server without the resolved reason: fall back to the row itself.
  const code = a?.reason_code ? reasonShortLabel(a.reason_code) : null;
  if (code || a?.reason_note || student.away_window) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {student.away_window || code}
        {a?.reason_note && (
          <Box component="span" sx={{ display: 'block', fontStyle: 'italic', color: 'text.primary', overflowWrap: 'anywhere' }}>
            &ldquo;{a.reason_note}&rdquo;
          </Box>
        )}
      </Typography>
    );
  }

  return (
    <Typography variant="caption" sx={{ display: 'block', color: 'error.main', fontWeight: 600 }}>
      No reason given
    </Typography>
  );
}

function MissedRow({
  student,
  selected,
  onSelect,
}: {
  student: StudentInsight;
  selected: boolean;
  onSelect: (id: string, next: boolean) => void;
}) {
  const nudged = shortDate(student.absence?.followup_sent_at ?? null);
  const irregular = isIrregular(student.recent);
  const workMissing = !!student.work && student.work.handedIn < student.work.total;
  const done = !!student.absence?.caught_up_at || !!student.absence?.excused_at;

  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.5,
        px: 0.5,
        py: 0.75,
        borderRadius: 1,
        minHeight: 48,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {/* 44px is the floor for the most repeated tap on this screen. The label
          wrapper means the name and the reason are part of the target too. */}
      <Checkbox
        checked={selected}
        onChange={(e) => onSelect(student.id, e.target.checked)}
        sx={{ p: 1.25, mt: -0.5 }}
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
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {student.name}
        </Typography>

        {/* Reason, progress and flags flow onto one line when the drawer is
            wide enough and stack on a phone, with no width measuring: they are
            flex items that wrap. */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.25 }}>
          <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
            <ReasonLine student={student} />
          </Box>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', minWidth: 0 }}>
            {progressLine(student)}
            {nudged && ` · last nudged ${nudged}`}
          </Typography>

          {irregular && student.recent && (
            <Chip
              size="small"
              color="error"
              variant="outlined"
              label={`Missed ${student.recent.missed} of last ${student.recent.of}`}
              title={
                student.recent.unexplained
                  ? `${student.recent.unexplained} of them with no reason`
                  : 'Every one of them with a reason'
              }
            />
          )}
          {student.catchup?.stuck && (
            <Chip size="small" color="warning" variant="outlined" label="Stuck on a check" />
          )}
          {workMissing && !done && <Chip size="small" variant="outlined" label="Homework not in" />}
        </Box>
      </Box>

      {/* A number is the fastest route to a student who has gone quiet, and it
          is one tap on the phone the teacher is already holding. */}
      {student.phone && (
        <IconButton
          component="a"
          href={`tel:${student.phone}`}
          aria-label={`Call ${student.name}`}
          onClick={(e) => e.stopPropagation()}
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <PhoneIcon fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}

/**
 * The line between the picture and the groups: what the list is showing, and
 * one Select all for everyone who still owes work on this class. It covers the
 * students who can act on it; a recap we have not published is not theirs to
 * chase, and a finished student is not to be messaged again. It used to be a
 * 48px tinted bar of its own under a row of filter chips.
 */
function ListHeader({
  ids,
  selected,
  onSelectMany,
  filter,
  onShowAll,
  missed,
}: {
  ids: string[];
  selected: Set<string>;
  onSelectMany: (ids: string[], next: boolean) => void;
  filter: FollowupState | null;
  onShowAll: () => void;
  missed: number;
}) {
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = ids.length > 0 && chosen === ids.length;
  const label = `Select all ${ids.length} not caught up`;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        minHeight: 44,
        mb: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Filtered, the pressed corner already says what is showing; the line
          only offers the way back, which fits beside Select all at 375px. */}
      {filter ? (
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Button
            size="small"
            onClick={onShowAll}
            aria-label={`Showing ${FOLLOWUP_META[filter].short.toLowerCase()} only. Show everyone`}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700, ml: -1 }}
          >
            Show everyone
          </Button>
        </Box>
      ) : (
        <Typography variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
          {`${missed} missed it`}
        </Typography>
      )}
      {ids.length > 0 && (
        <Box
          component="label"
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 44,
            pr: 1,
            borderRadius: 1,
            cursor: 'pointer',
            flexShrink: 0,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Checkbox
            checked={all}
            indeterminate={chosen > 0 && !all}
            onChange={() => onSelectMany(ids, !all)}
            sx={{ p: 1.25 }}
            inputProps={{ 'aria-label': label }}
          />
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {all ? `All ${ids.length} selected` : chosen > 0 ? `${chosen} of ${ids.length}` : `Select all ${ids.length}`}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function useToneColor() {
  const theme = useTheme();
  return (tone: FollowupTone) => (tone === 'neutral' ? theme.palette.grey[600] : theme.palette[tone].main);
}

/**
 * One group as a single 48px line: tone bar, tick-all, name, count, chevron.
 * Closed, a whole class reads as the grid plus a handful of these lines; the
 * group's explanation shows once it is opened, so a closed header never wraps.
 */
function Group({
  state,
  students,
  selected,
  onSelect,
  onSelectMany,
  defaultOpen,
  note,
}: {
  state: FollowupState;
  students: StudentInsight[];
  selected: Set<string>;
  onSelect: (id: string, next: boolean) => void;
  onSelectMany: (ids: string[], next: boolean) => void;
  defaultOpen: boolean;
  note?: string | null;
}) {
  const toneColor = useToneColor();
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => setOpen(defaultOpen), [defaultOpen]);
  if (students.length === 0) return null;

  const meta = FOLLOWUP_META[state];
  const title = meta.label;
  const ids = students.map((s) => s.id);
  const chosen = ids.filter((id) => selected.has(id)).length;
  const all = chosen === ids.length;
  const color = toneColor(meta.tone);

  return (
    <Box sx={{ mb: 0.75 }} data-testid={`followup-group-${state}`}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 48,
          borderRadius: 1,
          bgcolor: alpha(color, 0.08),
          borderLeft: `4px solid ${color}`,
        }}
      >
        {/* Selecting the whole group is the gesture a teacher actually makes:
            "everyone who missed this and said nothing, tell them". */}
        <Checkbox
          checked={all}
          indeterminate={chosen > 0 && !all}
          onChange={() => onSelectMany(ids, !all)}
          sx={{ p: 1.25 }}
          inputProps={{ 'aria-label': `Select everyone in ${title}` }}
        />
        <Box
          component="button"
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={`${title}, ${students.length}. ${open ? 'Collapse' : 'Expand'}`}
          title={meta.hint}
          sx={{
            appearance: 'none',
            font: 'inherit',
            border: 0,
            bgcolor: 'transparent',
            color: 'text.primary',
            cursor: 'pointer',
            textAlign: 'left',
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pr: 0.5,
            borderRadius: 1,
            '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
          }}
        >
          <Typography component="span" variant="body2" sx={{ fontWeight: 700, flex: 1, minWidth: 0 }} noWrap>
            {title}
          </Typography>
          <Box
            component="span"
            sx={{
              minWidth: 28,
              height: 24,
              px: 0.75,
              borderRadius: 99,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
              bgcolor: alpha(color, 0.18),
            }}
          >
            {students.length}
          </Box>
          <ExpandMoreIcon
            aria-hidden
            sx={{
              color: 'text.secondary',
              transform: open ? 'rotate(180deg)' : 'none',
              transition: 'transform 150ms',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
        </Box>
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ pt: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1, pb: 0.25 }}>
            {note || meta.hint}
          </Typography>
          {students.map((s) => (
            <MissedRow key={s.id} student={s} selected={selected.has(s.id)} onSelect={onSelect} />
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

/** The states that sit on neither axis of the grid, as a line of tappable words under it. */
const OFF_GRID: FollowupState[] = ['waiting_on_us', 'late_joiner', 'excused'];
const OFF_GRID_TEXT: Partial<Record<FollowupState, (n: number) => string>> = {
  waiting_on_us: (n) => `${n} waiting on the recap`,
  late_joiner: (n) => `${n} joined later`,
  excused: (n) => `${n} excused`,
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export default function MissedTab({
  insights,
  insightsLoading,
  insightsError,
  insightsRetrying,
  onRetryInsights,
  selected,
  onSelect,
  onSelectMany,
  initialFilter,
}: AttendanceTabProps) {
  // The shared list first (search, stage filter, paused hidden), then the fixed
  // groups over what it shows, so every count and Select all follows the filter.
  const view = useStudentListView<StudentInsight, 'suggested'>({
    rows: insights?.students,
    accessors: INSIGHT_ACCESSORS,
    extraSorts: GROUP_ORDER,
    defaultSort: 'suggested',
    urlKeys: false,
  });

  const startFilter =
    initialFilter && initialFilter !== 'not_handed_in' && MISSED_ORDER.includes(initialFilter)
      ? initialFilter
      : null;
  const [filter, setFilter] = useState<FollowupState | null>(startFilter);
  useEffect(() => setFilter(startFilter), [startFilter]);
  const toggle = (st: FollowupState) => setFilter((cur) => (cur === st ? null : st));

  const groups = useMemo(() => {
    const by = new Map<FollowupState, StudentInsight[]>();
    for (const st of MISSED_ORDER) by.set(st, []);
    for (const s of view.shown) {
      const st = stateOf(s);
      by.get(st)?.push(s);
    }
    by.get('catching_up')?.sort((a, b) => urgency(a) - urgency(b));
    return by;
  }, [view.shown]);

  /** Everyone the actions are for, in the order they are shown. */
  const outstandingIds = useMemo(
    () =>
      OUTSTANDING.filter((st) => !filter || filter === st)
        .flatMap((st) => groups.get(st) || [])
        .map((s) => s.id),
    [groups, filter],
  );

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

  const nobodyMissed = !(insights.students ?? []).some((s) => MISSED_ORDER.includes(stateOf(s)));
  if (nobodyMissed) {
    return (
      <Alert severity="success" sx={{ borderRadius: 2 }}>
        {insights.class.measured === false
          ? 'Attendance for this class has not been synced yet, so nobody is marked as missing it.'
          : 'Everyone on the roster was in this class. Nothing to follow up.'}
      </Alert>
    );
  }

  const turnaroundNote = caughtUpSummary(insights.students);
  const count = (st: FollowupState) => groups.get(st)?.length ?? 0;
  const missed = MISSED_ORDER.reduce((n, st) => n + count(st), 0);
  const visible = MISSED_ORDER.filter((st) => (!filter || filter === st) && count(st) > 0);
  // A group opens itself only when it is the point: the corner that was
  // tapped, or the only group there is. Otherwise the picture comes first and
  // the teacher opens what they want to see.
  const onlyOne = visible.length === 1;

  const f = insights.followup;
  const timing: string[] = [];
  if (f?.oldestOpenDays != null && (count('needs_call') || count('catching_up'))) {
    timing.push(`class was ${plural(f.oldestOpenDays, 'day')} ago`);
  }
  if (f?.medianDaysToCatchUp != null) {
    timing.push(
      f.medianDaysToCatchUp === 0
        ? 'most caught up the same day'
        : `typical catch-up took ${plural(f.medianDaysToCatchUp, 'day')}`,
    );
  }
  const offGrid = OFF_GRID.filter((st) => count(st) > 0);

  return (
    <>
      <StudentListToolbar view={view} />

      {/* The picture first: the same grid as the class card, and here each
          corner IS the filter. Pressed shows that group alone, pressed again
          shows everyone. It replaced a row of chips that told the same story
          less clearly and took two lines to do it. */}
      <FollowupGrid
        density="compact"
        counts={{
          caught_up: count('caught_up'),
          catching_up: count('catching_up'),
          caught_up_silent: count('caught_up_silent'),
          needs_call: count('needs_call'),
        }}
        selected={filter}
        onSelect={toggle}
      />
      {(timing.length > 0 || offGrid.length > 0) && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 0.5, mt: 0.5 }}>
          {timing.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
              {timing.join(' · ').replace(/^./, (c) => c.toUpperCase())}
            </Typography>
          )}
          {offGrid.map((st) => (
            <Button
              key={st}
              size="small"
              onClick={() => toggle(st)}
              aria-pressed={filter === st}
              variant={filter === st ? 'contained' : 'text'}
              disableElevation
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600, px: 1 }}
            >
              {OFF_GRID_TEXT[st]!(count(st))}
            </Button>
          ))}
        </Box>
      )}

      <Box sx={{ mt: 1 }}>
        <ListHeader
          ids={outstandingIds}
          selected={selected}
          onSelectMany={onSelectMany}
          filter={filter}
          onShowAll={() => setFilter(null)}
          missed={missed}
        />
        {visible.map((st) => (
          <Group
            key={st}
            state={st}
            students={groups.get(st) || []}
            selected={selected}
            onSelect={onSelect}
            onSelectMany={onSelectMany}
            defaultOpen={filter === st || onlyOne}
            note={st === 'caught_up' || st === 'caught_up_silent' ? turnaroundNote : null}
          />
        ))}
        {visible.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Nobody here matches the search or stage filter.
          </Typography>
        )}
      </Box>
      <PausedFootnote count={view.pausedHidden} />
    </>
  );
}
