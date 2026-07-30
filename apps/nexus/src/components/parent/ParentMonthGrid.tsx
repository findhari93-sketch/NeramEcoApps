'use client';

import { useMemo } from 'react';
import { Box, Typography, alpha, useTheme, type Theme } from '@neram/ui';
import { getMonthGrid, formatDateISO, isToday } from '@/components/timetable/date-utils';
import { headlineStatus } from '@/lib/parent-status';
import type { ParentClass } from '@/lib/parent-view-types';
import type { StatusTone } from '@/lib/parent-status';

/**
 * A month at a glance: which days had classes, and how they went.
 *
 * The point of this view is pattern, not detail. A parent scanning a month
 * should see at once that the amber dots cluster on Tuesdays, or that a run of
 * red started three weeks ago. Anything they want to act on, they tap into.
 *
 * Each day shows at most three dots plus an overflow count. More than that on a
 * 375px cell is unreadable, and the exact number of classes on a day is not the
 * question this view answers.
 *
 * Reuses getMonthGrid from the timetable date utilities so the grid geometry,
 * week start and spill-day handling match the student calendar exactly.
 */

interface ParentMonthGridProps {
  anchor: Date;
  classes: ParentClass[];
  onDayClick: (dateISO: string) => void;
  holidays?: Record<string, { title: string; description: string | null }>;
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Dot colour per state. Paired with a count, never colour alone. */
function toneColor(theme: Theme, tone: StatusTone | null): string {
  switch (tone) {
    case 'success':
      return theme.palette.success.main;
    case 'warning':
      return theme.palette.warning.main;
    case 'error':
      return theme.palette.error.main;
    case 'primary':
      return theme.palette.primary.main;
    default:
      return theme.palette.text.disabled;
  }
}

export default function ParentMonthGrid({
  anchor,
  classes,
  onDayClick,
  holidays,
}: ParentMonthGridProps) {
  const theme = useTheme();
  const grid = useMemo(() => getMonthGrid(anchor), [anchor]);

  const byDate = useMemo(() => {
    const map = new Map<string, ParentClass[]>();
    for (const cls of classes) {
      const list = map.get(cls.scheduled_date) || [];
      list.push(cls);
      map.set(cls.scheduled_date, list);
    }
    return map;
  }, [classes]);

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        p: { xs: 1, md: 1.5 },
        pb: { xs: 9, md: 1.5 },
      }}
    >
      {/* Weekday header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 0.5,
          mb: 0.5,
          flexShrink: 0,
        }}
      >
        {WEEKDAY_LABELS.map((label) => (
          <Typography
            key={label}
            sx={{
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              color: 'text.disabled',
              textAlign: 'center',
            }}
          >
            {/* One letter on a phone: "Wed" in a 48px cell wraps. */}
            <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
              {label}
            </Box>
            <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
              {label[0]}
            </Box>
          </Typography>
        ))}
      </Box>

      {/* The grid itself. 1fr rows so the month always fills the frame without
          the page scrolling, which is the same contract the student calendar
          holds itself to. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: '1fr',
          gap: 0.5,
        }}
      >
        {grid.days.map((day) => {
          const iso = formatDateISO(day);
          const dayClasses = byDate.get(iso) || [];
          const inMonth = day.getMonth() === anchor.getMonth();
          const today = isToday(day);
          const holiday = holidays?.[iso];

          const dots = dayClasses.slice(0, 3).map((cls) => ({
            id: cls.id,
            tone: headlineStatus(cls)?.tone ?? null,
          }));
          const overflow = dayClasses.length - dots.length;

          const interactive = dayClasses.length > 0;

          return (
            <Box
              key={iso}
              component={interactive ? 'button' : 'div'}
              onClick={interactive ? () => onDayClick(iso) : undefined}
              aria-label={
                interactive
                  ? `${iso}, ${dayClasses.length} ${
                      dayClasses.length === 1 ? 'class' : 'classes'
                    }`
                  : undefined
              }
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 0.5,
                minHeight: 48,
                p: 0.5,
                border: '1px solid',
                borderColor: today ? 'primary.main' : 'divider',
                borderRadius: 1.5,
                bgcolor: holiday
                  ? alpha(theme.palette.warning.main, 0.06)
                  : today
                    ? alpha(theme.palette.primary.main, 0.05)
                    : 'background.paper',
                opacity: inMonth ? 1 : 0.4,
                cursor: interactive ? 'pointer' : 'default',
                transition: 'background-color 180ms ease',
                '&:hover': interactive
                  ? { bgcolor: alpha(theme.palette.primary.main, 0.08) }
                  : {},
                '&:focus-visible': {
                  outline: `2px solid ${theme.palette.primary.main}`,
                  outlineOffset: -2,
                },
              }}
            >
              <Typography
                sx={{
                  fontSize: 12,
                  fontWeight: today ? 700 : 500,
                  color: today ? 'primary.main' : 'text.primary',
                  lineHeight: 1.2,
                }}
              >
                {day.getDate()}
              </Typography>

              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                  gap: 0.375,
                }}
              >
                {dots.map((dot) => (
                  <Box
                    key={dot.id}
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: toneColor(theme, dot.tone),
                    }}
                  />
                ))}
                {overflow > 0 && (
                  <Typography
                    sx={{ fontSize: 9, color: 'text.disabled', lineHeight: 1 }}
                  >
                    +{overflow}
                  </Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Colour is never the only signal, so the month view says what each
          colour means rather than assuming it is obvious. */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          mt: 1,
          px: 0.5,
          flexShrink: 0,
        }}
      >
        {[
          { tone: 'success' as const, label: 'All good' },
          { tone: 'warning' as const, label: 'Needs a look' },
          { tone: 'error' as const, label: 'Missed' },
          { tone: 'neutral' as const, label: 'Not recorded' },
        ].map((item) => (
          <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                bgcolor: toneColor(theme, item.tone),
              }}
            />
            <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
