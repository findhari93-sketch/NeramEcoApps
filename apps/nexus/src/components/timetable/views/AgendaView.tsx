'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Box, Button, Skeleton, Typography, alpha, useTheme } from '@neram/ui';
import CheckIcon from '@mui/icons-material/Check';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { type ClassCardData } from '../ClassCard';
import {
  type HolidayInfo,
  classEndDate,
  classStartDate,
  formatDateISO,
  formatTime,
  isToday,
  type WeekDates,
} from '../date-utils';
import { LAYOUT, RADIUS, SHADOW, tagSx } from '../timetable-theme';
import { useNow } from '@/hooks/useNow';
import UpNextHero from './UpNextHero';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface AgendaViewProps {
  classes: ClassCardData[];
  week: WeekDates;
  loading?: boolean;
  holidays?: Record<string, HolidayInfo>;
  role: 'teacher' | 'student' | 'parent';
  /** Only opt-outs are stored; a missing entry means the student is attending. */
  myRsvps?: Record<string, 'attending' | 'not_attending'>;
  myRsvpReasons?: Record<string, string | null>;
  myAttendance?: Record<string, boolean>;
  rsvpData?: Record<string, { attending: number; total: number }>;
  onClassClick?: (cls: ClassCardData) => void;
  onDecline?: (cls: ClassCardData) => void;
  onCatchUp?: (cls: ClassCardData) => void;
}

type RowKind = 'holiday' | 'done' | 'missed' | 'now' | 'upcoming' | 'cancelled';

/**
 * The week as a vertical ledger, with the next class promoted to a hero card.
 *
 * This is the default view on every screen size. A six-column grid does not fit
 * a 375px phone, and for a timetable where every class is at the same hour a
 * list answers "what is on, and what do I owe" faster than a grid does anyway.
 */
export default function AgendaView({
  classes,
  week,
  loading,
  holidays,
  role,
  myRsvps,
  myRsvpReasons,
  myAttendance,
  rsvpData,
  onClassClick,
  onDecline,
  onCatchUp,
}: AgendaViewProps) {
  const theme = useTheme();

  const hasLiveInterest = useMemo(
    () => classes.some((c) => c.status === 'scheduled' || c.status === 'live'),
    [classes],
  );
  const now = useNow(15_000, hasLiveInterest);

  const isLiveClass = (cls: ClassCardData) =>
    cls.status === 'live' ||
    (cls.status === 'scheduled' &&
      now >= classStartDate(cls.scheduled_date, cls.start_time) &&
      now <= classEndDate(cls.scheduled_date, cls.end_time));

  /** The live class if there is one, else the soonest class still to come. */
  const heroClass = useMemo(() => {
    const candidates = classes
      .filter((c) => c.status !== 'cancelled')
      .filter((c) => isLiveClass(c) || classEndDate(c.scheduled_date, c.end_time) > now)
      .sort(
        (a, b) =>
          classStartDate(a.scheduled_date, a.start_time).getTime() -
          classStartDate(b.scheduled_date, b.start_time).getTime(),
      );
    return candidates.find(isLiveClass) || candidates[0] || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, now]);

  const classesByDate = useMemo(() => {
    const map: Record<string, ClassCardData[]> = {};
    for (const cls of classes) {
      (map[cls.scheduled_date] ||= []).push(cls);
    }
    return map;
  }, [classes]);

  function rowKind(cls: ClassCardData): RowKind {
    if (cls.status === 'cancelled') return 'cancelled';
    if (isLiveClass(cls)) return 'now';
    const ended = classEndDate(cls.scheduled_date, cls.end_time) < now;
    if (!ended) return 'upcoming';
    // Attendance is only known for students, and only once Teams has synced.
    if (role === 'student' && myAttendance?.[cls.id] === false) return 'missed';
    if (role === 'student' && myRsvps?.[cls.id] === 'not_attending') return 'missed';
    return 'done';
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Skeleton variant="rectangular" height={210} sx={{ borderRadius: 2 }} />
        <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
      </Box>
    );
  }

  const heroIsLive = heroClass ? isLiveClass(heroClass) : false;

  return (
    <Box>
      {heroClass && (
        <UpNextHero
          cls={heroClass}
          now={now}
          isLive={heroIsLive}
          role={role}
          myRsvp={myRsvps?.[heroClass.id]}
          myRsvpReason={myRsvpReasons?.[heroClass.id]}
          onDecline={onDecline}
          onCatchUp={onCatchUp}
          onDetails={onClassClick}
        />
      )}

      <Typography
        sx={{
          mt: heroClass ? 3 : 0,
          mb: 1.25,
          mx: 0.25,
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: 'text.disabled',
        }}
      >
        This week
      </Typography>

      <Box
        sx={{
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: RADIUS.card,
          boxShadow: SHADOW.card,
          bgcolor: 'background.paper',
          overflow: 'hidden',
        }}
      >
        {week.days.map((day, dayIdx) => {
          const dateStr = formatDateISO(day);
          const holiday = holidays?.[dateStr];
          const dayClasses = classesByDate[dateStr] || [];
          const today = isToday(day);
          const dayLabel = `${DAY_SHORT[(day.getDay() + 6) % 7]} ${day.getDate()}`;
          const isLastDay = dayIdx === week.days.length - 1;

          // A holiday takes the whole day row, replacing any class listing.
          if (holiday) {
            return (
              <LedgerRow
                key={dateStr}
                dayLabel={dayLabel}
                stateLabel={null}
                last={isLastDay}
                tinted
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                  <Box component="span" sx={tagSx(theme, 'neutral')}>
                    Holiday
                  </Box>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
                    {holiday.title}
                  </Typography>
                </Box>
                <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                  No class
                </Typography>
              </LedgerRow>
            );
          }

          if (dayClasses.length === 0) return null;

          return dayClasses.map((cls, i) => {
            const kind = rowKind(cls);
            const reason = myRsvpReasons?.[cls.id];
            const rsvp = rsvpData?.[cls.id];
            const last = isLastDay && i === dayClasses.length - 1;

            const stateLabel =
              kind === 'now'
                ? 'Now'
                : kind === 'done'
                  ? 'Done'
                  : kind === 'missed'
                    ? 'You missed'
                    : kind === 'cancelled'
                      ? 'Cancelled'
                      : null;

            return (
              <LedgerRow
                key={cls.id}
                dayLabel={i === 0 ? dayLabel : ''}
                stateLabel={stateLabel}
                stateTone={kind === 'missed' ? 'error' : kind === 'now' ? 'primary' : 'muted'}
                last={last}
                highlighted={kind === 'now'}
                dimmed={kind === 'done' || kind === 'cancelled'}
                onClick={onClassClick ? () => onClassClick(cls) : undefined}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    sx={{
                      fontWeight: 700,
                      fontSize: '0.9063rem',
                      lineHeight: 1.35,
                      textDecoration: kind === 'cancelled' ? 'line-through' : 'none',
                    }}
                  >
                    {cls.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {kind === 'missed' && reason
                      ? `Reason logged: ${reason}`
                      : [cls.teacher?.name, `${formatTime(cls.start_time)} to ${formatTime(cls.end_time)}`]
                          .filter(Boolean)
                          .join(' · ')}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                  {kind === 'missed' && onCatchUp && (
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<PlayArrowIcon />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCatchUp(cls);
                      }}
                      sx={{
                        textTransform: 'none',
                        borderRadius: RADIUS.control,
                        minHeight: 44,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Catch up
                    </Button>
                  )}

                  {kind === 'done' && cls.recording_url && (
                    <Box component="span" sx={tagSx(theme, 'neutral')}>
                      Recording
                    </Box>
                  )}

                  {role === 'student' && kind === 'upcoming' && (
                    <Box
                      component="span"
                      sx={tagSx(theme, myRsvps?.[cls.id] === 'not_attending' ? 'error' : 'success')}
                    >
                      {myRsvps?.[cls.id] === 'not_attending' ? (
                        'Not attending'
                      ) : (
                        <>
                          <CheckIcon sx={{ fontSize: 12 }} />
                          Attending
                        </>
                      )}
                    </Box>
                  )}

                  {role === 'teacher' && rsvp && (
                    <Box component="span" sx={tagSx(theme, 'neutral')}>
                      {rsvp.attending} of {rsvp.total}
                    </Box>
                  )}
                </Box>
              </LedgerRow>
            );
          });
        })}
      </Box>
    </Box>
  );
}

interface LedgerRowProps {
  dayLabel: string;
  stateLabel: string | null;
  stateTone?: 'error' | 'primary' | 'muted';
  children: [ReactNode, ReactNode];
  last?: boolean;
  tinted?: boolean;
  highlighted?: boolean;
  dimmed?: boolean;
  onClick?: () => void;
}

/**
 * One day row.
 *
 * Desktop keeps the design's fixed 92px day column so every title starts on the
 * same x. On mobile that column would eat a quarter of a 375px screen, so the
 * row becomes two lines with the day as an overline.
 */
function LedgerRow({
  dayLabel,
  stateLabel,
  stateTone = 'muted',
  children,
  last,
  tinted,
  highlighted,
  dimmed,
  onClick,
}: LedgerRowProps) {
  const theme = useTheme();
  const [main, trailing] = children;

  return (
    <Box
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: `${LAYOUT.agendaDayCol}px 1fr auto` },
        alignItems: { xs: 'stretch', sm: 'center' },
        gap: { xs: 1, sm: 2 },
        px: { xs: 2, sm: 2.25 },
        py: 1.75,
        borderBottom: last ? 'none' : `1px solid ${theme.palette.divider}`,
        borderLeft: highlighted ? `3px solid ${theme.palette.primary.main}` : '3px solid transparent',
        bgcolor: highlighted
          ? alpha(theme.palette.primary.main, 0.04)
          : tinted
            ? alpha(theme.palette.text.primary, 0.02)
            : 'transparent',
        opacity: dimmed ? 0.72 : 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 150ms ease',
        '&:hover': onClick ? { bgcolor: 'action.hover' } : {},
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: -2,
        },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'row', sm: 'column' },
          alignItems: { xs: 'center', sm: 'flex-start' },
          gap: { xs: 0.75, sm: 0 },
        }}
      >
        {dayLabel && (
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              color: highlighted ? 'primary.dark' : 'text.secondary',
              whiteSpace: 'nowrap',
            }}
          >
            {dayLabel}
          </Typography>
        )}
        {stateLabel && (
          <Typography
            sx={{
              fontSize: '0.6875rem',
              whiteSpace: 'nowrap',
              color:
                stateTone === 'error'
                  ? 'error.dark'
                  : stateTone === 'primary'
                    ? 'primary.dark'
                    : 'text.disabled',
              fontWeight: stateTone === 'muted' ? 400 : 600,
            }}
          >
            {stateLabel}
          </Typography>
        )}
      </Box>

      {main}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: { xs: 'flex-start', sm: 'flex-end' },
          gap: 0.75,
          flexWrap: 'wrap',
        }}
      >
        {trailing}
      </Box>
    </Box>
  );
}
