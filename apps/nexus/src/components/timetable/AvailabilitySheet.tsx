'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Collapse, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StudentAvatar from '@/components/students/StudentAvatar';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import { useAuthSWR } from '@/lib/nexus-swr';
import { describeReason } from '@/lib/rsvp-reasons';
import { addDaysYmd, coveringWindow, describeWindow, formatDay } from '@/lib/away-windows';
import {
  awayLabel,
  expectedLabel,
  onRollLabel,
  steppedOutLabel,
} from '@/lib/class-availability';
import type {
  AwayStudentRow,
  DeclinedStudentRow,
  RsvpClassSummary,
  RsvpDashboardRangeResponse,
  RsvpDaySummary,
} from '@/app/api/timetable/rsvp-dashboard/route';
import { formatDateISO, formatTime, relativeDayLabel } from './date-utils';
import { REDUCED_MOTION_QUERY, tagSx } from './timetable-theme';
import AwayRangeBar from './AwayRangeBar';
import DayForecastCard from './DayForecastCard';
import { InfoRingLegendButton } from '@/components/students/InfoRingLegend';
import {
  newcomersOn,
  rarelyComingOn,
  type DayForecast,
  type ForecastStudent,
} from '@/lib/class-forecast';
import ExpectedBar from './ExpectedBar';
import TurnoutChip from './TurnoutChip';

/**
 * Who is coming, over the days AHEAD.
 *
 * This used to report over whatever the calendar happened to be showing, which
 * on the 20th meant eight rows of meetings that had already happened, followed
 * by a flat roll of everyone away anywhere in the surrounding month grid. It
 * answered a question nobody was asking. The question is a decision, and it is
 * about the future: "the app already knows who declared themselves away, so how
 * many will be in the room on Thursday, and if too many are out, should I run
 * the class at all."
 *
 * So the horizon starts at today, the day is the unit, and every date in the
 * horizon gets a card whether or not anything is scheduled on it. Checking who
 * is free BEFORE creating the class and its Teams meeting is the point; a shape
 * keyed on classes structurally cannot answer it, which is why the route grew
 * per-date rows.
 *
 * Past classes are not gone, they are behind a toggle at the bottom. A teacher
 * who wants to know who was out last week can still ask.
 */

export type AvailabilityScope =
  /** One class, asked from its own panel. */
  | { kind: 'class'; classId: string; date: string }
  /** One date, asked from the month view's away pill. */
  | { kind: 'day'; date: string }
  /**
   * The days ahead. Carries no range on purpose: the horizon is anchored on
   * TODAY and set by the chips inside the sheet, never by where the calendar
   * happens to be parked. That is the whole fix.
   */
  | { kind: 'period' };

/** The horizon chips. 14 is the default: long enough to catch a thin week. */
const HORIZONS = [7, 14, 30] as const;
type Horizon = (typeof HORIZONS)[number];
const DEFAULT_HORIZON: Horizon = 14;

interface AvailabilitySheetProps {
  open: boolean;
  onClose: () => void;
  scope: AvailabilityScope | null;
  /** The page's month-grid payload. Reused whenever it reaches far enough. */
  data: RsvpDashboardRangeResponse | undefined;
  loading: boolean;
  /** Only for the rare fetch, when the calendar is parked on another month. */
  classroomId?: string | null;
  /**
   * The realistic headcount per date, and the attendance records behind it.
   *
   * Passed down from the page rather than fetched here: the calendar already
   * holds both, and a sheet that re-asked would pay for the heaviest request
   * on the screen a second time just to say the same number.
   */
  forecastByDate?: Record<string, DayForecast>;
  standingStudents?: ForecastStudent[] | null;
  onOpenClass?: (classId: string) => void;
  onSchedule?: (date: string) => void;
}

/** Does this payload already hold a day row for every date the planner needs? */
function covers(data: RsvpDashboardRangeResponse | undefined, from: string, to: string): boolean {
  if (!data || data.days.length === 0) return false;
  return data.days[0].date <= from && data.days[data.days.length - 1].date >= to;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      sx={{ fontWeight: 700, display: 'block', mt: 2, mb: 0.5, color: 'text.secondary' }}
    >
      {children}
    </Typography>
  );
}

/** A heading that opens something, sized and labelled as a real control. */
function DisclosureRow({
  label,
  open,
  onToggle,
  id,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  id: string;
}) {
  const theme = useTheme();
  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        minHeight: 44,
        mt: 1.5,
        px: 0,
        border: 0,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'transparent',
        fontFamily: 'inherit',
        cursor: 'pointer',
        textAlign: 'left',
        color: 'text.secondary',
        '&:hover': { color: 'text.primary' },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
        {label}
      </Typography>
      <ExpandMoreIcon
        aria-hidden
        sx={{
          fontSize: 18,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 180ms',
          [REDUCED_MOTION_QUERY]: { transition: 'none' },
        }}
      />
    </Box>
  );
}

export default function AvailabilitySheet({
  open,
  onClose,
  scope,
  data,
  loading,
  classroomId,
  forecastByDate,
  standingStudents,
  onOpenClass,
  onSchedule,
}: AvailabilitySheetProps) {
  const theme = useTheme();

  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON);
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [showAway, setShowAway] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [showClear, setShowClear] = useState(false);

  // Every open is a fresh question. Carrying the last one's expanded rows over
  // would have the sheet open mid-scroll on a day the teacher is not asking about.
  useEffect(() => {
    if (!open) return;
    setHorizon(DEFAULT_HORIZON);
    // One card is not a list to scan, so a day opens already expanded. Set as
    // state rather than forced at render time, or its chevron would be a
    // control that visibly does nothing.
    setExpandedDate(scope?.kind === 'day' ? scope.date : null);
    setShowAway(false);
    setShowPast(false);
    setShowClear(false);
  }, [open, scope]);

  // One clock per open, so nothing in a single render can disagree with itself
  // about whether tonight's class has finished.
  const now = useMemo(() => new Date(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = useMemo(() => formatDateISO(now), [now]);

  const planning = scope?.kind === 'period';
  const from = today;
  const to = addDaysYmd(today, horizon - 1);

  // Almost always false: the page widens its one request to cover the horizon
  // (planningRangeFor), so opening this costs nothing. It goes true only when
  // the calendar is parked on a month that today is nowhere near, and then one
  // narrow request is better than a confidently empty planner.
  const needsFetch = planning && open && !!classroomId && !covers(data, from, to);
  const fallbackKey = needsFetch
    ? `/api/timetable/rsvp-dashboard?classroom_id=${classroomId}&start=${from}&end=${to}`
    : null;
  const { data: fallback, isLoading: fallbackLoading } = useAuthSWR<RsvpDashboardRangeResponse>(
    fallbackKey,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const payload = needsFetch ? fallback : data;
  const pending = needsFetch ? fallbackLoading || !fallback : loading || !data;

  const awayById = useMemo(
    () => new Map((payload?.away_students || []).map((s) => [s.id, s] as const)),
    [payload],
  );
  const declinedById = useMemo(
    () => new Map((payload?.declined_students || []).map((s) => [s.id, s] as const)),
    [payload],
  );
  const classesById = useMemo(
    () => new Map((payload?.classes || []).map((c) => [c.class_id, c] as const)),
    [payload],
  );

  /** The day rows this scope is asking about. */
  const days: RsvpDaySummary[] = useMemo(() => {
    if (!scope || !payload) return [];
    if (scope.kind === 'day') {
      const row = payload.days.find((d) => d.date === scope.date);
      return row ? [row] : [];
    }
    if (scope.kind === 'period') {
      return payload.days.filter((d) => d.date >= from && d.date <= to);
    }
    return [];
  }, [scope, payload, from, to]);

  const classesFor = (day: RsvpDaySummary) =>
    day.class_ids.map((id) => classesById.get(id)).filter((c): c is RsvpClassSummary => !!c);

  // A day with nothing on it and nobody out is the best day to put a class on,
  // but fourteen of them in a row is a wall of "28 of 28 available". They fold
  // into one line that opens, so the list stays scannable without losing the
  // Schedule button on any of them.
  const isClear = (d: RsvpDaySummary) =>
    d.class_ids.length === 0 && d.away_ids.length === 0 && d.declined_ids.length === 0;
  const notable = days.filter((d) => !isClear(d) || d.date === today);
  const clear = days.filter((d) => isClear(d) && d.date !== today);

  /** Everyone out at any point in the horizon, named once. */
  const awayInHorizon: AwayStudentRow[] = useMemo(() => {
    const ids = new Set<string>();
    for (const d of days) for (const id of d.away_ids) ids.add(id);
    return [...ids]
      .map((id) => awayById.get(id))
      .filter((s): s is AwayStudentRow => !!s)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [days, awayById]);

  const pastClasses = useMemo(
    () =>
      (payload?.classes || [])
        .filter((c) => c.scheduled_date < today)
        .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date)),
    [payload, today],
  );

  const single = scope?.kind === 'class' ? classesById.get(scope.classId) : null;

  const scopeLine = !scope
    ? ''
    : scope.kind === 'class'
      ? single
        ? `${single.title}, ${formatTime(single.start_time)} to ${formatTime(single.end_time)}`
        : ''
      : scope.kind === 'day'
        ? relativeDayLabel(scope.date, today)
        : `Next ${horizon} days, ${formatDay(from)} to ${formatDay(to)}`;

  const renderDay = (day: RsvpDaySummary) => (
    <DayForecastCard
      key={day.date}
      day={day}
      classes={classesFor(day)}
      today={today}
      now={now}
      awayById={awayById}
      declinedById={declinedById}
      forecast={forecastByDate?.[day.date] ?? null}
      rarelyComing={rarelyComingOn(day, data?.classes ?? [], standingStudents, today)}
      newcomers={newcomersOn(day, data?.classes ?? [], standingStudents, today)}
      expanded={expandedDate === day.date}
      onToggle={() => setExpandedDate((d) => (d === day.date ? null : day.date))}
      onOpenClass={onOpenClass}
      onSchedule={onSchedule}
    />
  );

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      title="Who is coming"
      description={
        <>
          {scopeLine && (
            <Box component="span" sx={{ display: 'block', fontWeight: 600, color: 'text.primary' }}>
              {scopeLine}
            </Box>
          )}
          Away students are not counted. Of the rest, anyone whose attendance record says they
          rarely turn up is taken off the likely count too.
        </>
      }
    >
      {/* The rings on these faces carry the exam year, the paused state and the
          spoken language. Same control the Students and Attendance screens use,
          so the explanation lives in one place. */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: -1 }}>
        <InfoRingLegendButton label="What the rings on these photos mean" />
      </Box>
      {planning && (
        <Box
          role="group"
          aria-label="How far ahead to look"
          sx={{ display: 'flex', gap: 1, pt: 0.5, pb: 0.5, flexWrap: 'wrap' }}
        >
          {HORIZONS.map((n) => {
            const active = n === horizon;
            return (
              <Box
                key={n}
                component="button"
                type="button"
                aria-pressed={active}
                onClick={() => setHorizon(n)}
                sx={{
                  minHeight: 44,
                  px: 2,
                  borderRadius: 999,
                  border: 1,
                  borderColor: active ? 'primary.main' : 'divider',
                  bgcolor: active ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
                  color: active ? 'primary.dark' : 'text.secondary',
                  fontWeight: active ? 700 : 600,
                  fontSize: '0.8125rem',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {n} days
              </Box>
            );
          })}
        </Box>
      )}

      {pending ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, py: 1 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={132} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : single ? (
        // One class, asked about directly from its panel. It keeps the headline
        // shape: the teacher already knows which day they are looking at.
        <Box sx={{ pt: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {expectedLabel(single.summary)}
            </Typography>
            <TurnoutChip summary={single.summary} />
          </Box>
          <Box sx={{ mt: 1, mb: 0.75 }}>
            <ExpectedBar summary={single.summary} height={10} />
          </Box>
          <Typography variant="caption" color="text.secondary">
            {onRollLabel(single.summary.on_roll)}
            {single.summary.away > 0 ? `, ${awayLabel(single.summary.away)}` : ''}
            {single.summary.not_attending > 0
              ? `, ${steppedOutLabel(single.summary.not_attending)}`
              : ''}
          </Typography>

          {single.away_ids.length === 0 && single.declined_ids.length === 0 ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
              <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
              <Typography variant="body2" color="text.secondary">
                The whole class is in. Nobody is away and nobody has stepped out.
              </Typography>
            </Box>
          ) : (
            <>
              {single.away_ids.length > 0 && (
                <>
                  <SectionHeading>Away ({single.away_ids.length})</SectionHeading>
                  {single.away_ids.map((id) => {
                    const s = awayById.get(id);
                    if (!s) return null;
                    const w = coveringWindow(s.windows, single.scheduled_date);
                    const chosen = w || s.windows[0];
                    return (
                      <Box
                        key={id}
                        sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minHeight: 44, py: 0.5 }}
                      >
                        <StudentAvatar userId={id} src={s.avatar_url} name={s.name} size={28} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {s.name}
                            </Typography>
                            {single.also_declined_ids.includes(id) && (
                              <Box component="span" sx={tagSx(theme, 'neutral')}>
                                Also stepped out
                              </Box>
                            )}
                          </Box>
                          {chosen && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', overflowWrap: 'anywhere' }}
                            >
                              {describeWindow(chosen, single.scheduled_date)}:{' '}
                              {describeReason(chosen.reason_code, chosen.reason_note)}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                </>
              )}
              {single.declined_ids.length > 0 && (
                <>
                  <SectionHeading>Stepped out ({single.declined_ids.length})</SectionHeading>
                  {single.declined_ids.map((id) => {
                    const s = declinedById.get(id);
                    if (!s) return null;
                    return (
                      <Box
                        key={id}
                        sx={{ display: 'flex', gap: 1.25, alignItems: 'center', minHeight: 44, py: 0.5 }}
                      >
                        <StudentAvatar userId={id} src={s.avatar_url} name={s.name} size={28} />
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {s.name}
                        </Typography>
                      </Box>
                    );
                  })}
                </>
              )}
            </>
          )}
        </Box>
      ) : days.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <EventAvailableOutlinedIcon sx={{ fontSize: 32, color: 'text.disabled' }} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Nothing to report for these days yet.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 0.5 }}>
            {notable.map(renderDay)}
          </Box>

          {clear.length > 0 && (
            <>
              <DisclosureRow
                id="clear-days"
                label={`${clear.length} clear ${clear.length === 1 ? 'day' : 'days'}, good to schedule`}
                open={showClear}
                onToggle={() => setShowClear((v) => !v)}
              />
              <Collapse in={showClear} unmountOnExit>
                <Box
                  id="clear-days"
                  sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, pt: 1 }}
                >
                  {clear.map(renderDay)}
                </Box>
              </Collapse>
            </>
          )}

          {awayInHorizon.length > 0 && (
            <>
              <DisclosureRow
                id="away-roll"
                label={`Away in these ${horizon} days (${awayInHorizon.length})`}
                open={showAway}
                onToggle={() => setShowAway((v) => !v)}
              />
              <Collapse in={showAway} unmountOnExit>
                <Box id="away-roll" sx={{ pt: 0.5 }}>
                  {awayInHorizon.map((s) => {
                    const w = coveringWindow(s.windows, from) || s.windows[0];
                    return (
                      <Box
                        key={s.id}
                        sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minHeight: 44, py: 0.5 }}
                      >
                        <StudentAvatar userId={s.id} src={s.avatar_url} name={s.name} size={28} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {s.name}
                          </Typography>
                          {w && (
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              sx={{ display: 'block', overflowWrap: 'anywhere' }}
                            >
                              {describeWindow(w, from)}:{' '}
                              {describeReason(w.reason_code, w.reason_note)}
                            </Typography>
                          )}
                          {/* Measured against the HORIZON, which is what is on
                              screen, not against whatever range was fetched. */}
                          {w && (
                            <Box sx={{ mt: 0.75, maxWidth: 260 }}>
                              <AwayRangeBar
                                rangeStart={from}
                                rangeEnd={to}
                                startsOn={w.starts_on}
                                endsOn={w.ends_on}
                              />
                            </Box>
                          )}
                        </Box>
                      </Box>
                    );
                  })}
                  <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 1 }}>
                    Bars span {formatDay(from)} to {formatDay(to)}.
                  </Typography>
                </Box>
              </Collapse>
            </>
          )}

          {planning && pastClasses.length > 0 && (
            <>
              <DisclosureRow
                id="past-classes"
                label={`Show past classes (${pastClasses.length})`}
                open={showPast}
                onToggle={() => setShowPast((v) => !v)}
              />
              <Collapse in={showPast} unmountOnExit>
                <Box id="past-classes" sx={{ pt: 0.5, opacity: 0.75 }}>
                  {pastClasses.map((c) => (
                    <Box key={c.class_id} sx={{ py: 0.75 }}>
                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'baseline',
                          gap: 1,
                        }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 0 }} noWrap>
                          {c.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                          {expectedLabel(c.summary)}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
                        {formatDay(c.scheduled_date)}, {formatTime(c.start_time)}
                      </Typography>
                      <Box sx={{ mt: 0.5 }}>
                        <ExpectedBar summary={c.summary} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Collapse>
            </>
          )}

          {planning && onSchedule && (
            <Box sx={{ pt: 2 }}>
              <Button
                fullWidth
                variant="contained"
                onClick={() => onSchedule(today)}
                sx={{ minHeight: 48 }}
              >
                Schedule a class
              </Button>
            </Box>
          )}
        </>
      )}
    </ResponsiveSheet>
  );
}
