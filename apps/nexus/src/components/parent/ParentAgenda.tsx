'use client';

import { useMemo } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { RADIUS, SECTION_LABEL_SX, subjectTint } from '@/components/timetable/timetable-theme';
import { formatTimeCompact } from '@/components/timetable/date-utils';
import StatusPill from './StatusPill';
import {
  headlineStatus,
  describeMinutes,
  workStatus,
  testStatus,
  catchupStatus,
} from '@/lib/parent-status';
import type { ParentClass } from '@/lib/parent-view-types';

/**
 * The parent's class list: one row per class, grouped by day.
 *
 * WHY THIS IS NOT views/AgendaView.tsx
 * ------------------------------------
 * The student agenda is week-scoped (`week: WeekDates`), leads with a hero card
 * carrying a Join button and an RSVP block, and derives its row state from RSVP
 * and prep-gate data. A parent has none of those: no RSVP, no join, no prep
 * gate, and their range is a month rather than a week. Threading four
 * parent-only props plus a fifth row kind through a component already serving
 * two roles is how ClassDetailPanel reached 1,328 lines and became unreusable.
 *
 * What IS shared is everything that makes it look like the same product: the
 * theme tokens, the date helpers, and the pill styling. A parent's row and a
 * student's row are visually siblings without being the same component.
 *
 * Rows are ordered newest first. A parent opens this to find out what just
 * happened, not to plan a week.
 */

interface ParentAgendaProps {
  classes: ParentClass[];
  onClassClick: (cls: ParentClass) => void;
  holidays?: Record<string, { title: string; description: string | null }>;
}

function friendlyDay(ymd: string): { weekday: string; day: string; isToday: boolean } {
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(
    new Date()
  );
  if (!Number.isFinite(ms)) return { weekday: '', day: ymd, isToday: false };
  return {
    weekday: new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(ms),
    day: new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(ms),
    isToday: ymd === todayYmd,
  };
}

function ClassRow({
  cls,
  onClick,
}: {
  cls: ParentClass;
  onClick: (cls: ParentClass) => void;
}) {
  const theme = useTheme();
  const headline = headlineStatus(cls);
  const minutes = describeMinutes(cls);
  const work = workStatus(cls);
  const test = testStatus(cls);
  const catchup = catchupStatus(cls);
  const tint = subjectTint(theme, cls.topicTitle || cls.title);

  const isCancelled = cls.phase === 'cancelled';
  const isLive = cls.phase === 'live';

  // The headline already carries whichever of these is most urgent, so showing
  // it again below would read as the same warning twice.
  const secondary = [work, test, catchup].filter(
    (s) => s && s.label !== headline?.label
  ) as NonNullable<typeof work>[];

  return (
    <Box
      component="button"
      onClick={() => onClick(cls)}
      aria-label={`${cls.title}, ${formatTimeCompact(cls.start_time)}${
        headline ? `, ${headline.label}` : ''
      }`}
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderLeft: '3px solid',
        borderLeftColor: isLive
          ? 'error.main'
          : isCancelled
            ? 'divider'
            : alpha(tint.fg, 0.55),
        borderRadius: RADIUS.control,
        bgcolor: isLive ? alpha(theme.palette.error.main, 0.04) : 'background.paper',
        // 48px floor, but real rows are taller. Material 3 minimum, and the
        // whole row is the target rather than a small chevron.
        minHeight: 48,
        px: { xs: 1.5, sm: 2 },
        py: 1.5,
        cursor: 'pointer',
        opacity: isCancelled ? 0.6 : 1,
        transition: 'background-color 180ms ease',
        '&:hover': {
          bgcolor: alpha(theme.palette.primary.main, 0.04),
        },
        '&:focus-visible': {
          outline: `2px solid ${theme.palette.primary.main}`,
          outlineOffset: -2,
        },
      }}
    >
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontWeight: 600,
            fontSize: 15,
            lineHeight: 1.35,
            textDecoration: isCancelled ? 'line-through' : 'none',
            color: 'text.primary',
          }}
        >
          {cls.title}
        </Typography>

        <Typography
          sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}
        >
          {formatTimeCompact(cls.start_time)} to {formatTimeCompact(cls.end_time)}
          {cls.teacher?.name ? ` · ${cls.teacher.name}` : ''}
        </Typography>

        {/* The minutes answer the question a parent actually asked for: not
            "was he there" but "how long was he there". */}
        {minutes && (
          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.25 }}>
            {minutes}
          </Typography>
        )}

        {(headline || secondary.length > 0) && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
            <StatusPill status={headline} />
            {secondary.map((s) => (
              <StatusPill key={s.label} status={s} />
            ))}
          </Box>
        )}
      </Box>

      <ChevronRightIcon
        aria-hidden
        sx={{ color: 'text.disabled', fontSize: 20, flexShrink: 0, mt: 0.25 }}
      />
    </Box>
  );
}

export default function ParentAgenda({
  classes,
  onClassClick,
  holidays,
}: ParentAgendaProps) {
  const theme = useTheme();

  /** Newest first: a parent opens this to see what just happened. */
  const days = useMemo(() => {
    const byDate = new Map<string, ParentClass[]>();
    for (const cls of classes) {
      const list = byDate.get(cls.scheduled_date) || [];
      list.push(cls);
      byDate.set(cls.scheduled_date, list);
    }
    return [...byDate.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, list]) => ({
        date,
        classes: list.sort((a, b) => b.start_time.localeCompare(a.start_time)),
      }));
  }, [classes]);

  return (
    <Box
      sx={{
        // Scrolls inside the shell rather than growing the page, matching the
        // student calendar's contract: the page itself never scrolls.
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        p: { xs: 1.5, md: 2 },
        pb: { xs: 9, md: 2 },
      }}
    >
      {days.map(({ date, classes: dayClasses }) => {
        const { weekday, day, isToday } = friendlyDay(date);
        const holiday = holidays?.[date];

        return (
          // The id is the scroll target when a parent taps a day in the month
          // view, which is how the two views stay connected without a day column.
          <Box key={date} id={`parent-day-${date}`} sx={{ mb: 2.5, scrollMarginTop: 8 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 1,
                mb: 1,
                px: 0.25,
              }}
            >
              <Typography
                sx={{
                  ...SECTION_LABEL_SX,
                  mb: 0,
                  color: isToday ? 'primary.main' : 'text.disabled',
                }}
              >
                {weekday} {day}
                {isToday ? ' · Today' : ''}
              </Typography>
              {holiday && (
                <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                  {holiday.title}
                </Typography>
              )}
            </Box>

            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                // Cards rather than a bordered ledger: at 375px a ledger's day
                // column eats a third of the width, and every row here already
                // carries its own date in the group header.
                '& > *': {
                  border: `1px solid ${theme.palette.divider}`,
                },
              }}
            >
              {dayClasses.map((cls) => (
                <ClassRow key={cls.id} cls={cls} onClick={onClassClick} />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
