'use client';

import { Box, Button, Collapse, Typography, alpha, useTheme } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import StudentAvatar from '@/components/students/StudentAvatar';
import { coveringWindow, describeWindow } from '@/lib/away-windows';
import { describeReason } from '@/lib/rsvp-reasons';
import {
  announceForecast,
  attendanceRecordLabel,
  forecastBreakdownLabel,
  forecastVerdict,
  likelyLabel,
  reasonSummaryLabel,
  steppedOutLabel,
  UNASKED_NOTE,
} from '@/lib/class-availability';
import type { DayForecast, ForecastStudent, RarelyComes } from '@/lib/class-forecast';
import type {
  AwayStudentRow,
  DeclinedStudentRow,
  RsvpClassSummary,
  RsvpDaySummary,
} from '@/app/api/timetable/rsvp-dashboard/route';
import { formatTimeCompact, hasClassEnded, relativeDayLabel } from './date-utils';
import { RADIUS, REDUCED_MOTION_QUERY, tagSx } from './timetable-theme';
import ExpectedBar from './ExpectedBar';
import TurnoutChip from './TurnoutChip';

/**
 * One day, as the decision it actually is.
 *
 * A teacher does not decide "do I run class #4", they decide "do I run
 * Thursday". So the day is the unit here, and it exists for every date in the
 * horizon rather than only for the dates that already have a class on them:
 * checking who is free BEFORE creating the class and its Teams meeting is the
 * whole reason this screen was rebuilt.
 *
 * Three lines answer the question, in the order a teacher asks it. How many
 * (the count and the verdict), why (the reason line), and then who (expanded
 * only on request, because twenty-eight names buried the four that mattered in
 * the version this replaces).
 */

export interface DayForecastCardProps {
  day: RsvpDaySummary;
  /** The day's classes, already filtered by the caller. */
  classes: RsvpClassSummary[];
  today: string;
  /** Passed in so one render cannot disagree with itself about "finished". */
  now: Date;
  awayById: Map<string, AwayStudentRow>;
  declinedById: Map<string, DeclinedStudentRow>;
  /**
   * The realistic headcount. Absent when the attendance record could not be
   * read, in which case the card falls back to the entitled count and offers
   * no opinion, which is the behaviour that shipped before this existed.
   */
  forecast?: DayForecast | null;
  /** Expected students whose record says they will not be there. */
  rarelyComing?: RarelyComes[];
  /** On the roll, too recently to judge. Named, never discounted. */
  newcomers?: ForecastStudent[];
  expanded: boolean;
  onToggle: () => void;
  onOpenClass?: (classId: string) => void;
  onSchedule?: (date: string) => void;
}

/** Separates the three reasons a chair is empty, which are not the same event. */
const GROUP_LABEL = {
  display: 'block',
  mt: 1,
  mb: 0.25,
  fontSize: '0.625rem',
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase' as const,
  color: 'text.disabled',
} as const;

function PersonRow({
  id,
  name,
  avatarUrl,
  line,
  tag,
}: {
  id: string;
  name: string;
  avatarUrl: string | null;
  line?: string;
  tag?: string;
}) {
  const theme = useTheme();
  return (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', minHeight: 44, py: 0.5 }}>
      {/* 32, and NOT the 26 this used to be. StudentStageAvatar hides the stage
          glyph and the language mark below MIN_GLYPH_SIZE (28), so at 26 the
          info ring drew a coloured circle that said nothing: the exam year, the
          paused state and the spoken language were all silently dropped. This
          is the whole reason the avatars here looked plain next to every other
          teacher screen. */}
      <StudentAvatar userId={id} src={avatarUrl} name={name} size={32} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {name}
          </Typography>
          {tag && (
            <Box component="span" sx={tagSx(theme, 'neutral')}>
              {tag}
            </Box>
          )}
        </Box>
        {line && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', overflowWrap: 'anywhere' }}
          >
            {line}
          </Typography>
        )}
      </Box>
    </Box>
  );
}

export default function DayForecastCard({
  day,
  classes,
  today,
  now,
  awayById,
  declinedById,
  forecast,
  rarelyComing,
  newcomers,
  expanded,
  onToggle,
  onOpenClass,
  onSchedule,
}: DayForecastCardProps) {
  const theme = useTheme();

  const scheduled = day.class_ids.length > 0;
  // A 7 PM class read at 9 PM is not a decision any more. It stays on the card,
  // muted, because it explains where the evening went, but it stops being the
  // thing the day is asking about.
  const allEnded = scheduled && classes.length > 0 && classes.every((c) => hasClassEnded(c, now));
  const decidable = scheduled && !allEnded;

  // Away reasons and opt-out reasons are different events and are never summed:
  // a student on exam leave and a student who tapped "exam clash" on one night
  // are not the same fact, and folding them would make the total unexplainable.
  const awayReasons = reasonSummaryLabel(day.away_tally);
  const declinedReasons = reasonSummaryLabel(day.reason_tally);

  // The realistic count, or the entitled one when the record could not be read.
  // Shaped here rather than at every call site so a missing forecast and a
  // forecast with nothing to discount take the same path through the render.
  const f: DayForecast = forecast ?? {
    date: day.date,
    expected: day.summary.attending,
    onRoll: day.summary.on_roll,
    away: day.summary.away,
    declined: day.summary.not_attending,
    atRisk: 0,
    likely: day.summary.attending,
    estimated: false,
    newcomers: [],
    scheduled,
  };
  const atRisk = rarelyComing ?? [];
  const joiners = newcomers ?? [];

  const hasDetail =
    day.away_ids.length > 0 || day.declined_ids.length > 0 || atRisk.length > 0 || joiners.length > 0;

  // "expected" is a claim about a reply. On a date with no class nobody was
  // ever asked, so the same figure has to be worded as availability instead.
  const headline = decidable ? `${likelyLabel(f)} likely` : `${likelyLabel(f)} available`;
  const alsoDeclined = new Set(day.also_declined_ids);
  const detailId = `day-detail-${day.date}`;

  return (
    <Box
      component="section"
      data-day={day.date}
      aria-label={announceForecast(f, relativeDayLabel(day.date, today), decidable)}
      sx={{
        border: 1,
        borderColor: 'divider',
        borderRadius: RADIUS.card,
        p: 1.5,
        bgcolor: day.date === today ? alpha(theme.palette.primary.main, 0.04) : 'transparent',
      }}
    >
      {/* Wraps rather than switching on a breakpoint. An sx xs/md rule would
          measure the WINDOW, not this sheet, so on a 1440px screen it would
          resolve to the desktop branch inside a 600px dialog and overflow it. */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
        <Typography
          variant="body2"
          sx={{ fontWeight: 700, color: day.date === today ? 'primary.dark' : 'text.primary' }}
        >
          {relativeDayLabel(day.date, today)}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700, ml: 'auto' }}>
          {headline}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75, flexWrap: 'wrap' }}>
        <Box sx={{ flex: '1 1 140px', minWidth: 120 }}>
          <ExpectedBar
            summary={day.summary}
            atRisk={f.atRisk}
            label={announceForecast(f, relativeDayLabel(day.date, today), decidable)}
            height={8}
          />
        </Box>
        {!allEnded && <TurnoutChip verdict={forecastVerdict(f.likely, f.onRoll)} />}
      </Box>

      {/* The sum behind the headline, in the order it is subtracted. The
          founder's ask was to be able to check the number rather than trust
          it, and this is the line that makes that possible. */}
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.5, overflowWrap: 'anywhere' }}
      >
        {forecastBreakdownLabel(f)}
      </Typography>

      {/* The line that turns a number into a decision. Nine out on a school
          exam clash is a class to move; nine out unwell is not. */}
      {hasDetail ? (
        <Box
          component="button"
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={detailId}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
            width: '100%',
            minHeight: 44,
            mt: 0.5,
            px: 0,
            border: 0,
            bgcolor: 'transparent',
            fontFamily: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
            color: 'text.secondary',
            borderRadius: 1,
            '&:hover': { color: 'text.primary' },
            '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          }}
        >
          <Typography variant="caption" sx={{ flex: 1, minWidth: 0, lineHeight: 1.5 }}>
            {day.summary.away > 0 && (
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {day.summary.away} away
                </Box>
                {awayReasons ? `: ${awayReasons}` : ''}
              </>
            )}
            {day.summary.away > 0 && day.summary.not_attending > 0 && ' · '}
            {day.summary.not_attending > 0 && (
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {steppedOutLabel(day.summary.not_attending)}
                </Box>
                {declinedReasons ? `: ${declinedReasons}` : ''}
              </>
            )}
            {(day.summary.away > 0 || day.summary.not_attending > 0) && atRisk.length > 0 && ' · '}
            {atRisk.length > 0 && (
              <>
                <Box component="span" sx={{ fontWeight: 700 }}>
                  {atRisk.length} rarely come
                </Box>
                {': no reason given'}
              </>
            )}
          </Typography>
          <ExpandMoreIcon
            aria-hidden
            sx={{
              fontSize: 18,
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 180ms',
              [REDUCED_MOTION_QUERY]: { transition: 'none' },
            }}
          />
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
          {decidable ? 'Everybody is in.' : 'Nobody is away.'}
        </Typography>
      )}

      <Collapse in={expanded} unmountOnExit>
        <Box id={detailId} sx={{ pt: 0.5 }}>
          {day.away_ids.map((id) => {
            const student = awayById.get(id);
            if (!student) return null;
            const w = coveringWindow(student.windows, day.date) || student.windows[0];
            return (
              <PersonRow
                key={id}
                id={id}
                name={student.name}
                avatarUrl={student.avatar_url}
                line={
                  w
                    ? `${describeWindow(w, day.date)}: ${describeReason(w.reason_code, w.reason_note)}`
                    : undefined
                }
                tag={alsoDeclined.has(id) ? 'Also stepped out' : undefined}
              />
            );
          })}
          {day.declined_ids.map((id) => {
            const student = declinedById.get(id);
            if (!student) return null;
            return (
              <PersonRow
                key={id}
                id={id}
                name={student.name}
                avatarUrl={student.avatar_url}
                line="Stepped out of this class"
              />
            );
          })}

          {/* The group this screen was rebuilt for. These students said
              nothing at all: no window, no opt-out. On paper they are coming.
              The register says otherwise, and the sentence beside each one is
              the evidence, so the teacher can disagree with it rather than
              having to take it on faith. */}
          {atRisk.length > 0 && (
            <>
              <Typography variant="caption" sx={{ ...GROUP_LABEL }}>
                Rarely comes, no reason given
              </Typography>
              {atRisk.map((s) => (
                <PersonRow
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  avatarUrl={s.avatar_url}
                  line={attendanceRecordLabel(s.record)}
                />
              ))}
            </>
          )}

          {joiners.length > 0 && (
            <>
              <Typography variant="caption" sx={{ ...GROUP_LABEL }}>
                Just joined
              </Typography>
              {joiners.map((s) => (
                <PersonRow
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  avatarUrl={s.avatar_url}
                  tag="New"
                  line="Too recent to read anything into the record"
                />
              ))}
            </>
          )}
        </Box>
      </Collapse>

      {/* What is on, and what the teacher can do about it. */}
      <Box sx={{ mt: 1 }}>
        {classes.map((c) => {
          const ended = hasClassEnded(c, now);
          return (
            <Box
              key={c.class_id}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 24 }}
            >
              <Typography
                variant="caption"
                sx={{ color: ended ? 'text.disabled' : 'text.secondary', flexShrink: 0 }}
              >
                {formatTimeCompact(c.start_time)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: ended ? 'text.disabled' : 'text.secondary', minWidth: 0 }}
                noWrap
              >
                {c.title}
              </Typography>
              {ended && (
                <Box component="span" sx={{ ...tagSx(theme, 'neutral'), flexShrink: 0 }}>
                  Finished
                </Box>
              )}
            </Box>
          );
        })}

        {!scheduled && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
            {UNASKED_NOTE}
          </Typography>
        )}

        <Box sx={{ display: 'flex', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          {scheduled && onOpenClass && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => onOpenClass(day.class_ids[0])}
              sx={{ minHeight: 44, flex: '1 1 auto' }}
            >
              Open class
            </Button>
          )}
          {!scheduled && onSchedule && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => onSchedule(day.date)}
              sx={{ minHeight: 44, flex: '1 1 auto' }}
            >
              Schedule a class
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}
