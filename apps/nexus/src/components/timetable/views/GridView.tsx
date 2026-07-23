'use client';

import { useMemo } from 'react';
import { Box, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import VideocamIcon from '@mui/icons-material/Videocam';
import { type ClassCardData } from '../ClassCard';
import {
  type HolidayInfo,
  BREAK_HEIGHT,
  PX_PER_HOUR,
  blockGeometry,
  classEndDate,
  classStartDate,
  formatCountdown,
  formatDateISO,
  formatHourLabel,
  formatTime,
  isToday,
  type ResolvedBand,
  type WeekDates,
} from '../date-utils';
import {
  LAYOUT,
  RADIUS,
  SHADOW,
  accentGradient,
  pulseAnimation,
  statusColor,
  tagSx,
} from '../timetable-theme';
import { useNow } from '@/hooks/useNow';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Below this the six columns stop being legible, so the grid scrolls instead. */
const MIN_COLUMN_WIDTH = 116;

interface GridViewProps {
  classes: ClassCardData[];
  week: WeekDates;
  band: ResolvedBand;
  loading?: boolean;
  holidays?: Record<string, HolidayInfo>;
  role: 'teacher' | 'student' | 'parent';
  onClassClick?: (cls: ClassCardData) => void;
  /** Teacher only: tapping an empty slot offers "schedule a class" / "mark holiday". */
  onSlotClick?: (date: string, startTime: string, event?: React.MouseEvent) => void;
  /** Teacher only: attending counts shown under the block title. */
  rsvpData?: Record<string, { attending: number; total: number }>;
}

/**
 * The week as a time band: days across, a narrow evening window down.
 *
 * This replaces the old TimeSlotGrid, which laid days out as rows and hours as
 * columns. That shape made sense for a full school day but wasted the screen
 * when every class sits in the same single hour. Here the band is only as tall
 * as the configured window, so a 7 to 8 PM class fills its cell.
 *
 * The band never hides anything: a class outside the window has already
 * expanded it by the time this renders (see resolveBand), and a class on an
 * excluded weekday has already added its column (see effectiveWeekdays).
 */
export default function GridView({
  classes,
  week,
  band,
  loading,
  holidays,
  role,
  onClassClick,
  onSlotClick,
  rsvpData,
}: GridViewProps) {
  const theme = useTheme();

  // Only run a clock while there is something today worth counting down to.
  const hasLiveInterest = useMemo(
    () => classes.some((c) => c.status === 'scheduled' || c.status === 'live'),
    [classes],
  );
  const now = useNow(15_000, hasLiveInterest);

  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      (map[cls.scheduled_date] ||= []).push(cls);
    }
    return map;
  }, [classes]);

  const columns = `${LAYOUT.gridGutter}px repeat(${week.days.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`;

  if (loading) {
    return (
      <Box sx={{ border: `1px solid ${theme.palette.divider}`, borderRadius: RADIUS.card, overflow: 'hidden' }}>
        <Skeleton variant="rectangular" height={44} />
        <Skeleton variant="rectangular" height={band.cellHeight} sx={{ mt: 0.25 }} />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: RADIUS.card,
        overflowX: 'auto',
        overflowY: 'hidden',
        bgcolor: 'background.paper',
        boxShadow: SHADOW.card,
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: columns, minWidth: 'fit-content' }}>
        {/* Header: corner, then one cell per day */}
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            zIndex: 3,
            bgcolor: 'background.paper',
            borderRight: `1px solid ${theme.palette.divider}`,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        />
        {week.days.map((day) => {
          const dateStr = formatDateISO(day);
          const today = isToday(day);
          const holiday = holidays?.[dateStr];

          return (
            <Box
              key={`h-${dateStr}`}
              sx={{
                px: 1.5,
                py: 1.25,
                borderRight: `1px solid ${theme.palette.divider}`,
                borderBottom: today ? `2px solid ${theme.palette.primary.main}` : `1px solid ${theme.palette.divider}`,
                bgcolor: holiday ? alpha(theme.palette.text.primary, 0.02) : 'transparent',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.625rem',
                  fontWeight: today ? 700 : 600,
                  textTransform: 'uppercase',
                  letterSpacing: '.04em',
                  color: today ? 'primary.main' : 'text.disabled',
                }}
              >
                {DAY_SHORT[(day.getDay() + 6) % 7]}
                {today ? ', Today' : ''}
              </Typography>
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: '1.0625rem',
                  lineHeight: 1.2,
                  color: today ? 'primary.dark' : holiday ? 'text.disabled' : 'text.primary',
                }}
              >
                {day.getDate()}
              </Typography>
            </Box>
          );
        })}

        {/* Hour gutter */}
        <Box
          sx={{
            position: 'sticky',
            left: 0,
            zIndex: 3,
            height: band.cellHeight,
            bgcolor: 'background.paper',
            borderRight: `1px solid ${theme.palette.divider}`,
          }}
        >
          {band.segments.map((segment, si) => (
            <Box key={si}>
              {segment.hours.map((h) => (
                <Typography
                  key={h}
                  aria-hidden
                  data-testid="grid-hour-label"
                  sx={{
                    position: 'absolute',
                    top: segment.offset + ((h * 60 - segment.startMin) / 60) * PX_PER_HOUR - 6,
                    right: 7,
                    fontSize: '0.5625rem',
                    color: 'text.disabled',
                    lineHeight: 1,
                  }}
                >
                  {formatHourLabel(h)}
                </Typography>
              ))}
            </Box>
          ))}
        </Box>

        {/* One cell per day, class blocks positioned inside */}
        {week.days.map((day) => {
          const dateStr = formatDateISO(day);
          const holiday = holidays?.[dateStr];
          const dayClasses = classesByDate[dateStr] || [];
          const today = isToday(day);

          return (
            <Box
              key={`b-${dateStr}`}
              sx={{
                position: 'relative',
                height: band.cellHeight,
                borderRight: `1px solid ${theme.palette.divider}`,
                bgcolor: holiday
                  ? alpha(theme.palette.text.primary, 0.02)
                  : today
                    ? alpha(theme.palette.primary.main, 0.03)
                    : 'transparent',
              }}
            >
              {/* Hour lines per segment, plus the break between them. Also the
                  click targets for the teacher's slot menu. */}
              {!holiday &&
                band.segments.map((segment, si) => (
                  <Box key={si}>
                    {segment.hours.slice(0, -1).map((h) => {
                      const top = segment.offset + ((h * 60 - segment.startMin) / 60) * PX_PER_HOUR;
                      return (
                        <Box
                          key={h}
                          onClick={
                            onSlotClick
                              ? (e) => onSlotClick(dateStr, `${String(h).padStart(2, '0')}:00`, e)
                              : undefined
                          }
                          sx={{
                            position: 'absolute',
                            top,
                            left: 0,
                            right: 0,
                            height: PX_PER_HOUR,
                            borderTop: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
                            cursor: onSlotClick ? 'pointer' : 'default',
                            transition: 'background-color 150ms ease',
                            '&:hover': onSlotClick ? { bgcolor: 'action.hover' } : {},
                          }}
                        />
                      );
                    })}

                    {/* The break: the hours between morning and evening that are
                        not taught, drawn as a thin marker instead of six empty
                        rows nobody needs to scroll past. */}
                    {si < band.segments.length - 1 && (
                      <Box
                        aria-hidden
                        sx={{
                          position: 'absolute',
                          top: segment.offset + segment.height,
                          left: 0,
                          right: 0,
                          height: BREAK_HEIGHT,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: alpha(theme.palette.text.primary, 0.025),
                          borderTop: `1px dashed ${theme.palette.divider}`,
                          borderBottom: `1px dashed ${theme.palette.divider}`,
                        }}
                      />
                    )}
                  </Box>
                ))}

              {holiday && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    gap: 0.75,
                    p: 1.5,
                  }}
                >
                  <Box component="span" sx={tagSx(theme, 'neutral')}>
                    Holiday
                  </Box>
                  <Typography sx={{ fontSize: '0.7188rem', fontWeight: 700, lineHeight: 1.3 }}>
                    {holiday.title}
                  </Typography>
                </Box>
              )}

              {dayClasses.map((cls) => {
                const { top, height } = blockGeometry(cls.start_time, cls.end_time, band);
                const start = classStartDate(cls.scheduled_date, cls.start_time);
                const end = classEndDate(cls.scheduled_date, cls.end_time);
                const isLive =
                  cls.status === 'live' ||
                  (cls.status === 'scheduled' && now >= start && now <= end);
                const isCancelled = cls.status === 'cancelled';
                // The design highlights the next class of the day with a gradient
                // fill and a countdown overline. Reserve that for today only.
                const countdown = today && !isCancelled ? formatCountdown(start, now) : null;
                const isFeature = isLive || (!!countdown && today);
                const rsvp = rsvpData?.[cls.id];

                return (
                  <Box
                    key={cls.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${cls.title}, ${formatTime(cls.start_time)} to ${formatTime(cls.end_time)}`}
                    onClick={() => onClassClick?.(cls)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onClassClick?.(cls);
                      }
                    }}
                    sx={{
                      position: 'absolute',
                      top,
                      height,
                      left: 5,
                      right: 5,
                      zIndex: 2,
                      px: 1.125,
                      py: 0.875,
                      borderRadius: RADIUS.control,
                      overflow: 'hidden',
                      cursor: onClassClick ? 'pointer' : 'default',
                      opacity: isCancelled ? 0.5 : 1,
                      transition: 'box-shadow 200ms ease, transform 200ms ease',
                      ...(isFeature
                        ? {
                            background: accentGradient(theme),
                            color: theme.palette.primary.contrastText,
                            boxShadow: SHADOW.lift,
                          }
                        : {
                            bgcolor: alpha(statusColor(theme, cls.status), 0.1),
                            borderLeft: `3px solid ${statusColor(theme, cls.status)}`,
                          }),
                      ...(isCancelled && {
                        backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 4px, ${alpha(
                          theme.palette.text.primary,
                          0.08,
                        )} 4px, ${alpha(theme.palette.text.primary, 0.08)} 8px)`,
                      }),
                      '&:hover': onClassClick ? { boxShadow: SHADOW.lift, transform: 'translateY(-1px)' } : {},
                      '&:focus-visible': {
                        outline: `2px solid ${theme.palette.primary.main}`,
                        outlineOffset: 2,
                      },
                    }}
                  >
                    {(isLive || countdown) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.375, mb: 0.125 }}>
                        {isLive && (
                          <FiberManualRecordIcon
                            sx={{
                              fontSize: 7,
                              color: 'inherit',
                              ...pulseAnimation('gridLiveBlink', '1.5s'),
                              '@keyframes gridLiveBlink': {
                                '0%, 100%': { opacity: 1 },
                                '50%': { opacity: 0.3 },
                              },
                            }}
                          />
                        )}
                        <Typography
                          sx={{
                            fontSize: '0.5625rem',
                            fontWeight: 700,
                            letterSpacing: '.04em',
                            textTransform: 'uppercase',
                            color: 'inherit',
                            opacity: isFeature ? 0.95 : 0.8,
                          }}
                        >
                          {isLive ? 'Live now' : `Starts in ${countdown}`}
                        </Typography>
                      </Box>
                    )}

                    <Typography
                      sx={{
                        fontWeight: 700,
                        fontSize: '0.7188rem',
                        lineHeight: 1.3,
                        color: isFeature ? 'inherit' : 'text.primary',
                        textDecoration: isCancelled ? 'line-through' : 'none',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {cls.title}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.375, mt: 0.125 }}>
                      <Typography
                        sx={{
                          fontSize: '0.625rem',
                          lineHeight: 1.3,
                          color: isFeature ? 'inherit' : 'text.secondary',
                          opacity: isFeature ? 0.9 : 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1,
                        }}
                      >
                        {role === 'teacher' && rsvp
                          ? `${rsvp.attending} of ${rsvp.total} attending`
                          : formatTime(cls.start_time)}
                      </Typography>
                      {cls.teams_meeting_id && (
                        <VideocamIcon
                          sx={{
                            fontSize: 11,
                            flexShrink: 0,
                            color: isFeature ? 'inherit' : 'text.disabled',
                            opacity: isFeature ? 0.85 : 1,
                          }}
                        />
                      )}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
