'use client';

/**
 * Every class in a month, each one saying how its catch-up stands.
 *
 * Replaces the endless "Classes and recaps" list. Over a year that list was
 * sixty cards to scroll to find "the class on 11 Sept"; a month grid finds it
 * by date, which is how a teacher remembers a class.
 *
 * Phone first: a compact month of dots (one per class, coloured by health) with
 * the chosen day's classes listed underneath as full-width rows. From md up: a
 * real month grid with a chip per class. Colour is never the only signal: every
 * chip and row carries its words ("3 to catch up", "Recap missing").
 *
 * Presentational. The page owns the month, the fetch and the drawer.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CardActionArea,
  IconButton,
  Skeleton,
  Stack,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { getMonthGrid } from '@/components/timetable/date-utils';
import { RADIUS } from '@/components/timetable/timetable-theme';
import {
  HEALTH_META,
  healthShortText,
  type CalendarClass,
  type ClassHealth,
} from '@/lib/catchup-calendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "Sep 2026", for the phone's month bar where the full name wrapped to two lines. */
export function shortMonthTitle(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${y}`;
}

export function useHealthColor() {
  const theme = useTheme();
  return (h: ClassHealth): string => {
    const tone = HEALTH_META[h].tone;
    if (tone === 'success') return theme.palette.success.main;
    if (tone === 'warning') return theme.palette.warning.dark;
    if (tone === 'error') return theme.palette.error.main;
    return theme.palette.text.disabled;
  };
}

/** Legend, so the colours are learnable and never the only cue. */
function Legend() {
  const color = useHealthColor();
  const shown: ClassHealth[] = ['recap_missing', 'catching_up', 'all_caught_up', 'not_taught'];
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mt: 1.5 }}>
      {shown.map((h) => (
        <Stack key={h} direction="row" spacing={0.75} alignItems="center">
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color(h) }} />
          <Typography variant="caption" color="text.secondary">
            {HEALTH_META[h].label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export interface CatchupCalendarProps {
  month: string;
  classes: CalendarClass[] | null;
  today: string;
  onMonth: (next: string) => void;
  onOpenClass: (id: string) => void;
  /** Rendered on the right of the month bar (the Calendar / List toggle). */
  trailing?: React.ReactNode;
}

export default function CatchupCalendar({
  month,
  classes,
  today,
  onMonth,
  onOpenClass,
  trailing,
}: CatchupCalendarProps) {
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));
  const color = useHealthColor();

  const grid = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    return getMonthGrid(new Date(y, m - 1, 1));
  }, [month]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarClass[]>();
    for (const c of classes || []) {
      const list = map.get(c.scheduled_date) || [];
      list.push(c);
      map.set(c.scheduled_date, list);
    }
    return map;
  }, [classes]);

  // The day shown under the phone grid: today when it is in this month,
  // otherwise the latest day in the month that had a class.
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (today.slice(0, 7) === month) {
      setPicked(today);
      return;
    }
    const days = [...byDay.keys()].filter((d) => d.slice(0, 7) === month).sort();
    setPicked(days[days.length - 1] ?? `${month}-01`);
  }, [month, today, byDay]);

  const [y, m] = month.split('-').map(Number);
  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    onMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const monthBar = (
    <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
      <IconButton aria-label="Previous month" onClick={() => shift(-1)} sx={{ width: 44, height: 44 }}>
        <ChevronLeftIcon />
      </IconButton>
      <Typography
        component="h2"
        aria-live="polite"
        noWrap
        aria-label={monthTitle(month)}
        sx={{ fontWeight: 800, fontSize: { xs: '1rem', sm: '1.125rem' }, minWidth: 0, textAlign: 'center', flex: { xs: 1, sm: '0 0 auto' }, px: { sm: 1 } }}
      >
        {wide ? monthTitle(month) : shortMonthTitle(month)}
      </Typography>
      <IconButton aria-label="Next month" onClick={() => shift(1)} sx={{ width: 44, height: 44 }}>
        <ChevronRightIcon />
      </IconButton>
      {today.slice(0, 7) !== month && (
        <Button
          size="small"
          onClick={() => onMonth(today.slice(0, 7))}
          sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700 }}
        >
          Today
        </Button>
      )}
      <Box sx={{ flex: { sm: 1 } }} />
      {trailing}
    </Stack>
  );

  if (!classes) {
    return (
      <Box>
        {monthBar}
        <Skeleton variant="rounded" height={wide ? 520 : 300} sx={{ borderRadius: RADIUS.card }} />
      </Box>
    );
  }

  const weekdayHeader = (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', mb: 0.5 }}>
      {WEEKDAYS.map((d) => (
        <Typography
          key={d}
          variant="caption"
          sx={{ textAlign: 'center', fontWeight: 700, color: 'text.secondary', py: 0.5 }}
        >
          {wide ? d : d.charAt(0)}
        </Typography>
      ))}
    </Box>
  );

  const monthClassCount = (classes || []).filter((c) => c.scheduled_date.slice(0, 7) === month).length;

  // ── Phone: a compact month of dots, then the picked day as rows ──────────
  if (!wide) {
    const dayClasses = picked ? byDay.get(picked) || [] : [];
    return (
      <Box>
        {monthBar}
        {weekdayHeader}
        <Box
          role="grid"
          aria-label={`${monthTitle(month)}, ${monthClassCount} classes`}
          sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}
        >
          {grid.days.map((d) => {
            const key = ymd(d);
            const inMonth = key.slice(0, 7) === month;
            const list = byDay.get(key) || [];
            const on = key === picked;
            const isToday = key === today;
            return (
              <CardActionArea
                key={key}
                role="gridcell"
                aria-selected={on}
                aria-label={`${d.getDate()} ${MONTHS[d.getMonth()]}, ${list.length ? list.map((c) => `${c.title || 'Class'}: ${healthShortText(c)}`).join('; ') : 'no class'}`}
                onClick={() => setPicked(key)}
                sx={{
                  minWidth: 0,
                  minHeight: 48,
                  borderRadius: 1.5,
                  flexDirection: 'column',
                  gap: 0.5,
                  py: 0.5,
                  border: '1px solid',
                  borderColor: on ? 'primary.main' : 'transparent',
                  bgcolor: on ? alpha(theme.palette.primary.main, 0.08) : 'transparent',
                  opacity: inMonth ? 1 : 0.4,
                  '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                }}
              >
                <Typography
                  sx={{
                    fontSize: '0.8125rem',
                    fontWeight: isToday ? 800 : 600,
                    color: isToday ? 'primary.main' : 'text.primary',
                    lineHeight: 1,
                  }}
                >
                  {d.getDate()}
                </Typography>
                <Stack direction="row" spacing={0.25} sx={{ minHeight: 6 }}>
                  {list.slice(0, 3).map((c) => (
                    <Box key={c.id} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color(c.health) }} />
                  ))}
                </Stack>
              </CardActionArea>
            );
          })}
        </Box>
        <Legend />

        <Typography sx={{ fontWeight: 800, fontSize: '0.9375rem', mt: 2, mb: 1 }}>
          {picked ? `${Number(picked.slice(8, 10))} ${MONTHS[Number(picked.slice(5, 7)) - 1]}` : ''}
        </Typography>
        {dayClasses.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No class on this day.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {dayClasses.map((c) => (
              <ClassRow key={c.id} c={c} onOpen={() => onOpenClass(c.id)} />
            ))}
          </Stack>
        )}
      </Box>
    );
  }

  // ── md and up: the month grid with a chip per class ──────────────────────
  return (
    <Box>
      {monthBar}
      {weekdayHeader}
      <Box
        role="grid"
        aria-label={`${monthTitle(month)}, ${monthClassCount} classes`}
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: RADIUS.card,
          overflow: 'hidden',
        }}
      >
        {grid.days.map((d, i) => {
          const key = ymd(d);
          const inMonth = key.slice(0, 7) === month;
          const list = byDay.get(key) || [];
          const isToday = key === today;
          return (
            <Box
              key={key}
              role="gridcell"
              sx={{
                minWidth: 0,
                minHeight: 112,
                p: 0.75,
                borderRight: (i + 1) % 7 === 0 ? 'none' : '1px solid',
                borderBottom: i >= grid.days.length - 7 ? 'none' : '1px solid',
                borderColor: 'divider',
                bgcolor: inMonth ? 'background.paper' : alpha(theme.palette.text.disabled, 0.04),
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: isToday ? 800 : 600,
                  color: isToday ? 'primary.contrastText' : inMonth ? 'text.secondary' : 'text.disabled',
                  bgcolor: isToday ? 'primary.main' : 'transparent',
                  borderRadius: 99,
                  width: 22,
                  height: 22,
                  display: 'grid',
                  placeItems: 'center',
                  mb: 0.5,
                }}
              >
                {d.getDate()}
              </Typography>
              <Stack spacing={0.5}>
                {list.map((c) => (
                  <CardActionArea
                    key={c.id}
                    onClick={() => onOpenClass(c.id)}
                    aria-label={`${c.title || 'Class'}, ${healthShortText(c)}`}
                    sx={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      minHeight: 44,
                      px: 0.75,
                      py: 0.5,
                      borderRadius: 1,
                      borderLeft: `3px solid ${color(c.health)}`,
                      bgcolor: alpha(color(c.health), 0.08),
                      opacity: inMonth ? 1 : 0.6,
                      transition: 'background-color 150ms ease',
                      '&:hover': { bgcolor: alpha(color(c.health), 0.16) },
                      '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        lineHeight: 1.25,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {c.title || 'Class'}
                    </Typography>
                    <Typography sx={{ fontSize: '0.6875rem', fontWeight: 600, color: 'text.secondary', lineHeight: 1.3 }} noWrap>
                      {healthShortText(c)}
                    </Typography>
                  </CardActionArea>
                ))}
              </Stack>
            </Box>
          );
        })}
      </Box>
      <Legend />
    </Box>
  );
}

/** One class as a full-width row: the phone's day list, and reused by the List mode. */
export function ClassRow({ c, onOpen }: { c: CalendarClass; onOpen: () => void }) {
  const theme = useTheme();
  const color = useHealthColor()(c.health);
  const counts =
    c.health === 'upcoming'
      ? 'Not taught yet'
      : `${c.present} present · ${c.missed} missed · ${c.caughtUp} caught up`;
  return (
    <CardActionArea
      onClick={onOpen}
      sx={{
        display: 'flex',
        width: '100%',
        textAlign: 'left',
        alignItems: 'stretch',
        gap: 1.25,
        p: 1.5,
        minHeight: 64,
        borderRadius: RADIUS.card,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        '&:hover': { borderColor: alpha(theme.palette.primary.main, 0.4) },
        '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 },
      }}
    >
      <Box sx={{ width: 4, borderRadius: 2, bgcolor: color, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: '0.9375rem',
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {c.title || 'Class'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {counts}
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, color: c.health === 'upcoming' || c.health === 'not_taught' ? 'text.secondary' : color }}>
          {healthShortText(c)}
        </Typography>
      </Box>
      <ChevronRightIcon sx={{ color: 'text.disabled', alignSelf: 'center' }} />
    </CardActionArea>
  );
}
