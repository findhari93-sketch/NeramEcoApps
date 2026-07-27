'use client';

import { useMemo, useState } from 'react';
import { Box, Skeleton, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import { type ClassCardData } from '../ClassCard';
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
}: MonthViewProps) {
  const theme = useTheme();
  const isCompact = useMediaQuery(theme.breakpoints.down('md'));

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
                aria-label={`${day.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${count} ${count === 1 ? 'class' : 'classes'}`}
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

          {dayClasses.length === 0 && !dayHoliday ? (
            <CalendarEmptyState role={role} period="day" />
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {dayClasses.map((cls) => (
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
                </Box>
              ))}
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
                    return (
                      <Box
                        key={cls.id}
                        component="button"
                        type="button"
                        onClick={() => onClassClick?.(cls)}
                        title={`${formatTimeCompact(cls.start_time)} ${cls.title}`}
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
