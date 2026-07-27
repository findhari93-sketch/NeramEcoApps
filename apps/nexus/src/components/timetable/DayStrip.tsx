'use client';

import { useEffect, useRef } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import { formatDateISO, isToday } from './date-utils';

const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface DayStripProps {
  days: Date[];
  selectedISO: string;
  onSelect: (d: Date) => void;
  /** Dates with at least one class. Drawn as a dot under the number. */
  markedDates?: Set<string>;
  holidayDates?: Set<string>;
}

/**
 * A horizontal row of day pills, for picking one day out of a week.
 *
 * Lifted from the day scroller the legacy WeeklyCalendarGrid used on mobile,
 * with its hardcoded 'primary.50' / 'error.50' remapped onto the theme, and the
 * auto-scroll-into-view behaviour from the exam schedule's DateRail so the
 * selected pill is never left off-screen after navigating.
 *
 * Used by the Day view at every width. It is deliberately NOT added to the week
 * grid on mobile: that grid already scrolls sideways through the same seven
 * days, and two competing day pickers would be worse than one.
 */
export default function DayStrip({
  days,
  selectedISO,
  onSelect,
  markedDates,
  holidayDates,
}: DayStripProps) {
  const theme = useTheme();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    const pill = activeRef.current;
    if (!container || !pill) return;
    const target = pill.offsetLeft - container.offsetWidth / 2 + pill.offsetWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [selectedISO]);

  return (
    <Box
      ref={scrollRef}
      role="tablist"
      aria-label="Pick a day"
      sx={{
        flex: '0 0 auto',
        display: 'flex',
        gap: 0.75,
        px: 1.5,
        py: 1,
        overflowX: 'auto',
        borderBottom: `1px solid ${theme.palette.divider}`,
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {days.map((day, idx) => {
        const iso = formatDateISO(day);
        const selected = iso === selectedISO;
        const today = isToday(day);
        const holiday = holidayDates?.has(iso);
        const marked = markedDates?.has(iso);

        return (
          <Box
            key={iso}
            component="button"
            type="button"
            role="tab"
            ref={selected ? activeRef : undefined}
            aria-selected={selected}
            aria-label={day.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            onClick={() => onSelect(day)}
            sx={{
              flex: '0 0 auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.125,
              minWidth: 52,
              minHeight: 56,
              px: 1,
              border: 0,
              borderRadius: 2,
              cursor: 'pointer',
              font: 'inherit',
              position: 'relative',
              bgcolor: selected
                ? 'primary.main'
                : holiday
                  ? alpha(theme.palette.error.main, 0.08)
                  : today
                    ? alpha(theme.palette.primary.main, 0.1)
                    : 'transparent',
              color: selected
                ? 'primary.contrastText'
                : holiday
                  ? 'error.main'
                  : 'text.primary',
              transition: theme.transitions.create(['background-color'], { duration: 150 }),
              '&:hover': {
                bgcolor: selected ? 'primary.dark' : theme.palette.action.hover,
              },
              '&:focus-visible': {
                outline: `2px solid ${theme.palette.primary.main}`,
                outlineOffset: 2,
              },
            }}
          >
            <Typography
              component="span"
              sx={{
                fontSize: '0.65rem',
                fontWeight: 600,
                lineHeight: 1.2,
                color: selected ? 'inherit' : holiday ? 'error.main' : 'text.secondary',
              }}
            >
              {DAY_SHORT[(day.getDay() + 6) % 7] ?? DAY_SHORT[idx % 7]}
            </Typography>
            <Typography component="span" sx={{ fontWeight: 800, fontSize: '1rem', lineHeight: 1.2 }}>
              {day.getDate()}
            </Typography>
            <Box
              aria-hidden
              sx={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                bgcolor:
                  marked || holiday
                    ? selected
                      ? 'primary.contrastText'
                      : holiday
                        ? 'error.main'
                        : 'primary.main'
                    : 'transparent',
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
