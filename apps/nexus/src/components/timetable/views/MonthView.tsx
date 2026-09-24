'use client';

import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, alpha, darken, useMediaQuery, useTheme } from '@neram/ui';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { type ClassCardData } from '../ClassCard';
import {
  announceForecast,
  awayLabel,
  expectedLabel,
  forecastVerdict,
  likelyLabel,
  likelySentence,
} from '@/lib/class-availability';
import type { DayForecast } from '@/lib/class-forecast';
import type { RsvpSummary } from '@/app/api/timetable/rsvp-dashboard/route';
import {
  formatDateISO,
  formatTimeCompact,
  isSameMonth,
  isToday,
  type HolidayInfo,
  type MonthGrid,
} from '../date-utils';
import { RADIUS, pulseAnimation, statusColor, tagSx } from '../timetable-theme';
import CalendarEmptyState from './CalendarEmptyState';
import CatchupBadge, { CatchupDot } from '../CatchupBadge';
import { catchupSentence } from '../catchup-badge';
import type { CalendarClass } from '@/lib/catchup-calendar';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Chips drawn before the cell collapses into "+N more".
 *
 * Hardcoded rather than measured. On a 900px-tall laptop a six-row month leaves
 * about 85px of chip space per cell, which fits three 20px chips and the
 * overflow line. Measuring with a ResizeObserver would thrash during the app
 * sidebar's 250ms width transition, and Neram runs about one class a day, so
 * overflow is close to theoretical anyway.
 */
const MAX_CHIPS = 3;

interface MonthViewProps {
  classes: ClassCardData[];
  month: MonthGrid;
  loading?: boolean;
  holidays?: Record<string, HolidayInfo>;
  role: 'teacher' | 'student' | 'parent';
  /** The date the calendar is anchored on, ringed in the grid. */
  anchorISO: string;
  onClassClick?: (cls: ClassCardData) => void;
  /** "+N more" and, on mobile, picking a day. */
  onOpenDay?: (iso: string) => void;
  /** Teacher: tapping the empty part of a cell offers schedule / mark holiday. */
  onDayMenu?: (iso: string, event: React.MouseEvent) => void;
  /** Student: an opted-out class reads as dimmed. */
  myRsvps?: Record<string, 'attending' | 'not_attending'>;
  /**
   * Expected headcount per class id, and the realistic headcount per DATE.
   *
   * The headcount is per class but the forecast is per day, and that is not an
   * inconsistency. A month chip is 20px tall with a clamped title in a
   * minmax(0, 1fr) column: there is no room for a ratio on it, and below md
   * this view is not a grid of chips at all. So the grid cell carries one
   * day-level figure and the per-class ratio lives in the day list, where rows
   * are 56px.
   */
  availability?: Record<string, RsvpSummary>;
  /**
   * How many students are realistically coming, per date.
   *
   * Replaced the old `awayByDate` count, which repeated the word "away" in all
   * 35 cells and answered the wrong question: a teacher is deciding whether to
   * hold a class, which is a question about who will be there, not who will not.
   */
  forecastByDate?: Record<string, DayForecast>;
  /** Today in IST. Past cells carry no forecast; a finished day cannot be predicted. */
  todayISO?: string;
  /** Tapping the day-level figure. The one tap target this feature adds. */
  onOpenDayAvailability?: (iso: string) => void;
  /**
   * Staff only: catch-up status for past classes, already filtered to the ones
   * worth a badge. A 20px chip only has room for a dot (the words go in its
   * label and title); the phone day list shows the full badge. Absent on the
   * student timetable, which renders exactly as before.
   */
  catchupByClassId?: Map<string, CalendarClass>;
}

/**
 * The month as a calendar grid, in the shape of the Teams month view.
 *
 * Below md this is unreadable as a grid, so it becomes a compact month of dots
 * over a list of the selected day. The selected day is local state, not the
 * shared anchor, so tapping around a month costs no network requests.
 */
export default function MonthView({
  classes,
  month,
  loading,
  holidays,
  role,
  anchorISO,
  onClassClick,
  onOpenDay,
  onDayMenu,
  myRsvps,
  availability,
  forecastByDate,
  todayISO,
  onOpenDayAvailability,
  catchupByClassId,
}: MonthViewProps) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));

  // A forecast is only ever offered for today or later. The register holds what
  // actually happened on a past night, and predicting it from a window that
  // includes that very class would be both wrong and pointless. This is also
  // what empties the grid of the repeated grey text the whole change is about.
  const today = todayISO || formatDateISO(new Date());
  const forecastOn = (iso: string): DayForecast | null =>
    role === 'teacher' && iso >= today ? forecastByDate?.[iso] ?? null : null;
  const catchupOf = (id: string): CalendarClass | undefined =>
    role === 'teacher' ? catchupByClassId?.get(id) : undefined;

  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) (map[cls.scheduled_date] ||= []).push(cls);
    for (const list of Object.values(map)) list.sort((a, b) => a.start_time.localeCompare(b.start_time));
    return map;
  }, [classes]);

  // Only meaningful in the compact layout. Kept out of the shared anchor so
  // browsing days inside a loaded month never refetches.
  const [selectedISO, setSelectedISO] = useState<string>(() => {
    const today = formatDateISO(new Date());
    return today >= month.start && today <= month.end ? today : anchorISO;
  });

  if (loading) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, p: 1 }}>
        <Skeleton variant="rectangular" height="100%" sx={{ borderRadius: RADIUS.card }} />
      </Box>
    );
  }

  const weekdayHeader = (
    <Box
      sx={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
        borderBottom: `1px solid ${theme.palette.divider}`,
      }}
    >
      {DAY_SHORT.map((d) => (
        <Typography
          key={d}
          sx={{
            py: 0.75,
            textAlign: 'center',
            fontSize: '0.625rem',
            fontWeight: 700,
            letterSpacing: '.04em',
            textTransform: 'uppercase',
            color: 'text.disabled',
          }}
        >
          {isCompact ? d.charAt(0) : d}
        </Typography>
      ))}
    </Box>
  );

  // ── Compact: a month of dots, then the selected day as a list ──────────────
  if (isCompact) {
    const dayClasses = classesByDate[selectedISO] ?? [];
    const dayHoliday = holidays?.[selectedISO];
    const selectedDate = new Date(`${selectedISO}T00:00:00`);

    return (
      <Box
        data-testid="calendar-grid"
        sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
      >
        {weekdayHeader}
        <Box
          sx={{
            flex: '0 0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          {month.days.map((day) => {
            const iso = formatDateISO(day);
            const outside = !isSameMonth(day, month.monthStart);
            const today = isToday(day);
            const selected = iso === selectedISO;
            const count = classesByDate[iso]?.length ?? 0;
            const holiday = !!holidays?.[iso];

            return (
              <Box
                key={iso}
                component="button"
                type="button"
                data-testid="month-cell"
                // The dots stay dots. Extending the label is how the forecast
                // reaches a screen reader on a 44px cell that has room for
                // nothing else.
                aria-label={`${day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${count} ${count === 1 ? 'class' : 'classes'}${
                  forecastOn(iso) ? `, ${likelySentence(forecastOn(iso)!)}` : ''
                }`}
                aria-pressed={selected}
                onClick={() => setSelectedISO(iso)}
                sx={{
                  height: 44,
                  border: 0,
                  p: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 0.25,
                  bgcolor: selected ? alpha(theme.palette.primary.main, 0.12) : 'transparent',
                  color: today
                    ? 'primary.main'
                    : outside || holiday
                      ? 'text.disabled'
                      : 'text.primary',
                  fontWeight: today || selected ? 800 : 500,
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: -2,
                  },
                }}
              >
                <Box component="span" sx={{ fontSize: '0.8125rem', lineHeight: 1 }}>
                  {day.getDate()}
                </Box>
                <Box aria-hidden sx={{ display: 'flex', gap: 0.25, height: 4 }}>
                  {Array.from({ length: Math.min(count, 2) }).map((_, i) => (
                    <Box
                      key={i}
                      sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'primary.main' }}
                    />
                  ))}
                  {count === 0 && holiday && (
                    <Box
                      sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'text.disabled' }}
                    />
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>

        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 1.5, pb: 9 }}>
          <Typography
            sx={{
              mb: 1,
              fontSize: '0.75rem',
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'text.disabled',
            }}
          >
            {selectedDate.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Typography>

          {dayHoliday && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box component="span" sx={tagSx(theme, 'neutral')}>
                Holiday
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                {dayHoliday.title}
              </Typography>
            </Box>
          )}

          {/* Full width and 44px, so there is no crowding against the class
              rows below and no target gymnastics. */}
          {(() => {
            const forecast = forecastOn(selectedISO);
            if (!forecast || !onOpenDayAvailability) return null;
            const verdict = forecastVerdict(forecast.likely, forecast.onRoll);
            const thin = verdict.key === 'thin' || verdict.key === 'very_thin';
            return (
              <Box
                component="button"
                type="button"
                onClick={() => onOpenDayAvailability(selectedISO)}
                aria-label={announceForecast(
                  forecast,
                  selectedDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
                  forecast.scheduled,
                )}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: '100%',
                  minHeight: 44,
                  px: 1.5,
                  mb: 1.5,
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  border: `1px solid ${thin ? theme.palette.warning.main : theme.palette.divider}`,
                  borderRadius: RADIUS.control,
                  bgcolor: 'background.paper',
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 2,
                  },
                }}
              >
                {thin && (
                  <WarningAmberOutlinedIcon
                    aria-hidden
                    sx={{ fontSize: 16, color: 'warning.dark' }}
                  />
                )}
                <Typography aria-hidden variant="body2" sx={{ fontWeight: 700 }}>
                  {likelySentence(forecast)}
                </Typography>
                <Typography aria-hidden variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
                  See who
                </Typography>
              </Box>
            );
          })()}

          {dayClasses.length === 0 && !dayHoliday ? (
            <CalendarEmptyState role={role} period="day" />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {dayClasses.map((cls) => {
                const catchup = catchupOf(cls.id);
                const row = (
                <Box
                  key={cls.id}
                  component="button"
                  type="button"
                  onClick={() => onClassClick?.(cls)}
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 0.25,
                    width: '100%',
                    minHeight: 56,
                    px: 1.5,
                    py: 1.25,
                    // The catch-up badge is laid over the row's foot as a
                    // sibling link (a link inside a button is invalid), so the
                    // row keeps a 44px strip clear for its tap target.
                    ...(catchup && { pb: '52px' }),
                    textAlign: 'left',
                    font: 'inherit',
                    cursor: 'pointer',
                    border: `1px solid ${theme.palette.divider}`,
                    borderLeft: `3px solid ${statusColor(theme, cls.status)}`,
                    borderRadius: RADIUS.control,
                    bgcolor: 'background.paper',
                    opacity: cls.status === 'cancelled' ? 0.55 : 1,
                    '&:focus-visible': {
                      outline: `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {cls.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {formatTimeCompact(cls.start_time)} to {formatTimeCompact(cls.end_time)}
                  </Typography>
                  {role === 'teacher' && availability?.[cls.id] && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                      {expectedLabel(availability[cls.id])}
                      {availability[cls.id].away > 0
                        ? ` · ${awayLabel(availability[cls.id].away)}`
                        : ''}
                    </Typography>
                  )}
                </Box>
                );
                if (!catchup) return row;
                return (
                  <Box key={cls.id} sx={{ position: 'relative' }}>
                    {row}
                    <CatchupBadge
                      c={catchup}
                      size="row"
                      sx={{
                        position: 'absolute',
                        left: 15,
                        bottom: 10,
                        maxWidth: 'calc(100% - 27px)',
                      }}
                    />
                  </Box>
                );
              })}
            </Box>
          )}
        </Box>
      </Box>
    );
  }

  // ── Full month grid ───────────────────────────────────────────────────────
  return (
    <Box
      data-testid="calendar-grid"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        bgcolor: 'background.paper',
      }}
    >
      {weekdayHeader}

      {/* minmax(0, 1fr) on BOTH axes: without it one long class title makes its
          column, and one busy day makes its row, grow past the viewport. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${month.weeks.length}, minmax(0, 1fr))`,
        }}
      >
        {month.days.map((day) => {
          const iso = formatDateISO(day);
          const outside = !isSameMonth(day, month.monthStart);
          const today = isToday(day);
          const anchored = iso === anchorISO;
          const holiday = holidays?.[iso];
          const dayClasses = classesByDate[iso] ?? [];
          const shown = dayClasses.slice(0, MAX_CHIPS);
          const overflow = dayClasses.length - shown.length;

          return (
            <Box
              key={iso}
              data-testid="month-cell"
              sx={{
                position: 'relative',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 0.25,
                p: 0.5,
                overflow: 'hidden',
                borderRight: `1px solid ${theme.palette.divider}`,
                borderBottom: `1px solid ${theme.palette.divider}`,
                bgcolor: outside
                  ? alpha(theme.palette.text.primary, 0.015)
                  : holiday
                    ? alpha(theme.palette.text.primary, 0.03)
                    : 'transparent',
              }}
            >
              {/* The empty area of the cell is the click target, sitting BEHIND
                  the chips rather than wrapping them: a button inside a button
                  is both invalid and unusable with a keyboard. */}
              {onDayMenu && !outside && (
                <Box
                  component="button"
                  type="button"
                  aria-label={`Schedule on ${day.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}`}
                  onClick={(e) => onDayMenu(iso, e)}
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 0,
                    border: 0,
                    p: 0,
                    bgcolor: 'transparent',
                    cursor: 'pointer',
                    transition: theme.transitions.create(['background-color'], { duration: 150 }),
                    '&:hover': { bgcolor: theme.palette.action.hover },
                    '&:focus-visible': {
                      outline: `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: -2,
                    },
                  }}
                />
              )}

              <Box
                sx={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  pointerEvents: 'none',
                }}
              >
                <Box
                  sx={{
                    minWidth: 24,
                    height: 24,
                    px: 0.75,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 999,
                    fontSize: '0.75rem',
                    fontWeight: today || anchored ? 800 : 600,
                    bgcolor: today ? 'primary.main' : 'transparent',
                    color: today
                      ? 'primary.contrastText'
                      : outside
                        ? 'text.disabled'
                        : 'text.primary',
                    boxShadow:
                      anchored && !today ? `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
                  }}
                >
                  {/* The 1st names its month, so the spill days are unambiguous. */}
                  {day.getDate() === 1
                    ? day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                    : day.getDate()}
                </Box>
              </Box>

              {/* The day's realistic headcount, and the only tap target this
                  feature adds. It is NOT attached to a class chip: those are
                  20px buttons already, and a button inside a button is both
                  invalid and unusable with a keyboard, which is the same reason
                  the "+N more" affordance is structured the way it is.

                  Quiet by default, loud only when thin. Thirty-five cells all
                  shouting is thirty-five cells saying nothing, which is exactly
                  what the old "N away" pill did: the same word, the same grey,
                  in every cell including the ones already in the past. On a
                  normal day this now reads as a caption, and the warning tone
                  plus the glyph appear on the handful of nights actually worth
                  a second look, which is what makes them findable at a glance. */}
              {(() => {
                const forecast = forecastOn(iso);
                if (!forecast || !onOpenDayAvailability) return null;
                const verdict = forecastVerdict(forecast.likely, forecast.onRoll);
                const thin = verdict.key === 'thin' || verdict.key === 'very_thin';
                return (
                <Box
                  component="button"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDayAvailability(iso);
                  }}
                  data-turnout={verdict.key}
                  aria-label={announceForecast(
                    forecast,
                    day.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }),
                    forecast.scheduled,
                  )}
                  sx={{
                    ...tagSx(theme, 'neutral'),
                    position: 'relative',
                    zIndex: 1,
                    maxWidth: '100%',
                    border: 0,
                    cursor: 'pointer',
                    justifyContent: 'center',
                    px: 0.5,
                    // fontFamily, never the `font` shorthand. That is a
                    // shorthand and resets every longhand it covers, so the
                    // size and weight declared after it would survive but
                    // anything before it would be silently thrown away.
                    fontFamily: 'inherit',
                    fontSize: '0.6875rem',
                    fontWeight: thin ? 700 : 600,
                    ...(thin
                      ? {
                          // Measured on the rendered screen, not assumed.
                          // warning.main on this tint is about 3.5:1 and
                          // warning.dark only reaches 4.23:1 at 11px, which is
                          // under AA and drops to 3.70:1 once the hover
                          // deepens the tint. Darkened off the same token
                          // rather than hardcoded, so it still tracks the brand
                          // amber: 5.94:1 at rest and 5.20:1 on hover.
                          bgcolor: alpha(theme.palette.warning.main, 0.16),
                          color: darken(theme.palette.warning.dark, 0.2),
                        }
                      : {
                          bgcolor: 'transparent',
                          color: theme.palette.text.secondary,
                        }),
                    // The pill itself is short, so the 44px target is expanded
                    // around it rather than drawn at that height, which would
                    // swamp a month cell.
                    '&::after': {
                      content: '""',
                      position: 'absolute',
                      top: '50%',
                      left: 0,
                      right: 0,
                      height: 44,
                      transform: 'translateY(-50%)',
                    },
                    // It sits ABOVE the cell's invisible "schedule here" button,
                    // so that button's hover never fires while the pointer is
                    // over this. Without its own hover the quiet version is
                    // plain text that happens to be clickable, which is not an
                    // affordance anyone can find.
                    transition: theme.transitions.create(['background-color'], { duration: 150 }),
                    '&:hover': {
                      bgcolor: thin
                        ? alpha(theme.palette.warning.main, 0.28)
                        : theme.palette.action.hover,
                    },
                    '&:focus-visible': {
                      outline: `2px solid ${theme.palette.primary.main}`,
                      outlineOffset: 2,
                    },
                  }}
                >
                  {thin && <WarningAmberOutlinedIcon aria-hidden sx={{ fontSize: 12 }} />}
                  <Box component="span" aria-hidden>
                    {likelyLabel(forecast)}
                  </Box>
                </Box>
                );
              })()}

              {/* A holiday sits ABOVE the chips, it does not replace them. This
                  was a ternary, so marking a day as a holiday hid every class
                  scheduled on it: a makeup class on a public holiday, or a
                  holiday added after the fact, simply disappeared from Month
                  view while still showing in Week. */}
              {holiday && (
                <Box
                  component="span"
                  sx={{ ...tagSx(theme, 'neutral'), position: 'relative', zIndex: 1, maxWidth: '100%' }}
                  title={holiday.title}
                >
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {holiday.title}
                  </Box>
                </Box>
              )}
              <>
                  {shown.map((cls) => {
                    const live = cls.status === 'live';
                    const declined = myRsvps?.[cls.id] === 'not_attending';
                    const catchup = catchupOf(cls.id);
                    // A 20px chip has room for a dot and nothing else, so the
                    // words ride on the label and the hover title instead.
                    const chipTitle = `${formatTimeCompact(cls.start_time)} ${cls.title}`;
                    return (
                      <Box
                        key={cls.id}
                        component="button"
                        type="button"
                        onClick={() => onClassClick?.(cls)}
                        title={catchup ? `${chipTitle}. ${catchupSentence(catchup)}` : chipTitle}
                        aria-label={catchup ? `${chipTitle}, ${catchupSentence(catchup)}` : undefined}
                        data-catchup={catchup?.health}
                        sx={{
                          position: 'relative',
                          zIndex: 1,
                          flex: '0 0 auto',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.5,
                          width: '100%',
                          height: 20,
                          px: 0.75,
                          border: 0,
                          borderLeft: `3px solid ${statusColor(theme, cls.status)}`,
                          borderLeftStyle: declined ? 'dashed' : 'solid',
                          borderRadius: 0.5,
                          bgcolor: alpha(statusColor(theme, cls.status), 0.1),
                          cursor: 'pointer',
                          font: 'inherit',
                          textAlign: 'left',
                          opacity: cls.status === 'cancelled' ? 0.5 : declined ? 0.6 : 1,
                          textDecoration: cls.status === 'cancelled' ? 'line-through' : 'none',
                          '&:hover': { bgcolor: alpha(statusColor(theme, cls.status), 0.2) },
                          '&:focus-visible': {
                            outline: `2px solid ${theme.palette.primary.main}`,
                            outlineOffset: 1,
                          },
                        }}
                      >
                        {live ? (
                          <FiberManualRecordIcon
                            sx={{
                              fontSize: 8,
                              color: 'error.main',
                              flexShrink: 0,
                              ...pulseAnimation('monthChipPulse'),
                              '@keyframes monthChipPulse': {
                                '0%, 100%': { opacity: 1 },
                                '50%': { opacity: 0.35 },
                              },
                            }}
                          />
                        ) : (
                          <Box
                            component="span"
                            sx={{
                              flexShrink: 0,
                              fontSize: '0.625rem',
                              fontWeight: 700,
                              color: 'text.secondary',
                            }}
                          >
                            {formatTimeCompact(cls.start_time)}
                          </Box>
                        )}
                        <Box
                          component="span"
                          sx={{
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '0.6875rem',
                            fontWeight: 600,
                          }}
                        >
                          {cls.title}
                        </Box>
                        {catchup && <CatchupDot c={catchup} sx={{ ml: 'auto' }} />}
                      </Box>
                    );
                  })}

                  {overflow > 0 && (
                    <Box
                      component="button"
                      type="button"
                      onClick={() => onOpenDay?.(iso)}
                      sx={{
                        position: 'relative',
                        zIndex: 1,
                        alignSelf: 'flex-start',
                        border: 0,
                        px: 0.75,
                        bgcolor: 'transparent',
                        cursor: 'pointer',
                        font: 'inherit',
                        fontSize: '0.625rem',
                        fontWeight: 700,
                        color: 'primary.main',
                        '&:hover': { textDecoration: 'underline' },
                        '&:focus-visible': {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 1,
                        },
                      }}
                    >
                      +{overflow} more
                    </Box>
                  )}
              </>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
