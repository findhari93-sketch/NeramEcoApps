'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Divider, IconButton, Typography, alpha, useTheme } from '@neram/ui';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { LAYOUT, RADIUS } from './timetable-theme';
import {
  addMonths,
  formatDateISO,
  getMonthGrid,
  isSameMonth,
  isToday,
  startOfMonth,
} from './date-utils';
import type { TimetableViewState } from '@/hooks/useTimetableView';

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

interface MiniCalendarRailProps {
  state: TimetableViewState;
  /** Shown under the title, e.g. the classroom name. */
  subtitle?: string;
  /** Dates with at least one class, drawn as a dot. */
  markedDates?: Set<string>;
  holidayDates?: Set<string>;
  /**
   * The Teams "My calendars" slot. Deliberately role-specific and supplied by
   * the page: the student's classroom list, the teacher's week context.
   */
  footer?: ReactNode;
}

/**
 * The left rail, in the shape of the Teams calendar rail.
 *
 * Only drawn at lg and up. Below that the width simply is not there: at
 * lg (1200px) with the app sidebar expanded the content column is about 876px,
 * and giving 248 of it to the rail would leave roughly 87px per day column.
 * That is why it starts CLOSED at lg and open only at xl (see
 * useTimetableView's railOpenByDefault), while still being openable at lg for
 * anyone who wants it. The grid keeps a minimum column width, so at lg with the
 * rail open the band scrolls sideways rather than crushing the columns.
 */
export default function MiniCalendarRail({
  state,
  subtitle,
  markedDates,
  holidayDates,
  footer,
}: MiniCalendarRailProps) {
  const theme = useTheme();
  const { anchorDate, setAnchorDate, goToToday, range } = state;

  // The rail browses months independently of the main view, so flicking through
  // to check a date in October does not refetch anything until a day is picked.
  const [miniAnchor, setMiniAnchor] = useState<Date>(() => startOfMonth(anchorDate));

  // Follow the main view when it moves to a different month, so the two never
  // disagree about where the user is.
  useEffect(() => {
    setMiniAnchor((current) => (isSameMonth(current, anchorDate) ? current : startOfMonth(anchorDate)));
  }, [anchorDate]);

  const grid = useMemo(() => getMonthGrid(miniAnchor), [miniAnchor]);
  const anchorISO = formatDateISO(anchorDate);

  return (
    <Box
      component="aside"
      aria-label="Calendar navigation"
      data-testid="cal-rail"
      sx={{
        flex: '0 0 auto',
        width: LAYOUT.rail,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        px: 2,
        py: 2,
        borderRight: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      {/* The page's real h1 is the visually hidden one in CalendarShell, so this
          is a paragraph: one h1 per page, and the title still reads here. */}
      <Box>
        <Typography component="p" sx={{ fontWeight: 800, fontSize: '1.125rem', lineHeight: 1.3 }}>
          Timetable
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary" noWrap title={subtitle}>
            {subtitle}
          </Typography>
        )}
      </Box>

      {/* Month header. Up and down rather than left and right, so the rail's
          navigation is never mistaken for the toolbar's. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }}>{grid.label}</Typography>
        <Box sx={{ display: 'flex' }}>
          <IconButton
            size="small"
            aria-label="Previous month"
            onClick={() => setMiniAnchor((m) => startOfMonth(addMonths(m, -1)))}
            sx={{ width: 32, height: 32 }}
          >
            <KeyboardArrowUpIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Next month"
            onClick={() => setMiniAnchor((m) => startOfMonth(addMonths(m, 1)))}
            sx={{ width: 32, height: 32 }}
          >
            <KeyboardArrowDownIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', mb: 0.5 }}>
          {DAY_INITIALS.map((d, i) => (
            <Typography
              key={i}
              aria-hidden
              sx={{
                textAlign: 'center',
                fontSize: '0.625rem',
                fontWeight: 700,
                color: 'text.disabled',
              }}
            >
              {d}
            </Typography>
          ))}
        </Box>

        <Box
          role="grid"
          aria-label={`${grid.label} calendar`}
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', rowGap: 0.25 }}
        >
          {grid.days.map((day) => {
            const iso = formatDateISO(day);
            const outside = !isSameMonth(day, grid.monthStart);
            const today = isToday(day);
            const selected = iso === anchorISO;
            // The whole visible period, not just the anchor: in week mode the
            // rail should show which week you are on, not one day of it.
            const inRange = iso >= range.start && iso <= range.end;
            const marked = markedDates?.has(iso);
            const holiday = holidayDates?.has(iso);

            return (
              <Box
                key={iso}
                component="button"
                type="button"
                role="gridcell"
                data-testid="mini-cal-day"
                aria-label={day.toLocaleDateString('en-IN', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                aria-current={today ? 'date' : undefined}
                aria-selected={selected}
                onClick={() => setAnchorDate(day)}
                sx={{
                  // 30px is below the 44px touch minimum, deliberately: the rail
                  // only exists at lg and up, i.e. pointer-fine, and every
                  // calendar this borrows from uses ~30px mini cells. Do not
                  // "fix" this by growing them, it would cost two grid columns.
                  position: 'relative',
                  height: 30,
                  border: 0,
                  p: 0,
                  cursor: 'pointer',
                  font: 'inherit',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  bgcolor: today
                    ? 'primary.main'
                    : inRange
                      ? alpha(theme.palette.primary.main, 0.1)
                      : 'transparent',
                  color: today
                    ? 'primary.contrastText'
                    : outside || holiday
                      ? 'text.disabled'
                      : 'text.primary',
                  fontWeight: today || selected ? 800 : outside ? 400 : 500,
                  boxShadow: selected && !today ? `inset 0 0 0 1px ${theme.palette.primary.main}` : 'none',
                  transition: theme.transitions.create(['background-color'], { duration: 150 }),
                  '&:hover': {
                    bgcolor: today ? 'primary.dark' : alpha(theme.palette.primary.main, 0.16),
                  },
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 1,
                  },
                }}
              >
                <Box component="span" sx={{ fontSize: '0.75rem', lineHeight: 1 }}>
                  {day.getDate()}
                </Box>
                <Box
                  aria-hidden
                  sx={{
                    position: 'absolute',
                    bottom: 3,
                    width: 4,
                    height: 4,
                    borderRadius: '50%',
                    bgcolor: marked
                      ? today
                        ? 'primary.contrastText'
                        : 'primary.main'
                      : 'transparent',
                  }}
                />
              </Box>
            );
          })}
        </Box>
      </Box>

      <Button
        onClick={() => {
          goToToday();
          setMiniAnchor(startOfMonth(new Date()));
        }}
        sx={{
          alignSelf: 'flex-start',
          minHeight: 44,
          px: 1,
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: RADIUS.control,
        }}
      >
        Today
      </Button>

      {footer && (
        <>
          <Divider />
          <Box sx={{ minWidth: 0 }}>{footer}</Box>
        </>
      )}
    </Box>
  );
}
