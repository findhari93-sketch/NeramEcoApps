'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, IconButton, Typography, alpha, useMediaQuery, useTheme } from '@neram/ui';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { LAYOUT, RADIUS } from '@/components/timetable/timetable-theme';

/**
 * The full-height frame the parent calendar sits in.
 *
 * Mirrors components/timetable/CalendarShell.tsx: the calendar is sized off the
 * viewport rather than growing with its content, each view scrolls internally,
 * and the page itself never scrolls. Kept separate because that shell hard-wires
 * CalendarToolbar's four view modes and MiniCalendarRail, and a parent has two
 * views and no rail. Bending it would mean threading a `modes` option through
 * the toolbar, the shell and useTimetableView, all of which are load-bearing for
 * the student and teacher calendars.
 *
 * The height maths IS copied deliberately, including the measured top offset:
 * the parent layout renders the same conditional banners above the content, and
 * getting this wrong pushes the calendar off the bottom of a phone screen.
 */

export type ParentCalendarView = 'agenda' | 'month';

interface ParentCalendarShellProps {
  view: ParentCalendarView;
  onViewChange: (view: ParentCalendarView) => void;
  /** e.g. "July 2026" */
  periodLabel: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** A slim strip above the toolbar, e.g. the enrolment notice. */
  banner?: ReactNode;
  children: ReactNode;
}

const VIEWS: { id: ParentCalendarView; label: string; icon: typeof ViewAgendaOutlinedIcon }[] =
  [
    { id: 'agenda', label: 'List', icon: ViewAgendaOutlinedIcon },
    { id: 'month', label: 'Month', icon: CalendarMonthOutlinedIcon },
  ];

export default function ParentCalendarShell({
  view,
  onViewChange,
  periodLabel,
  onPrev,
  onNext,
  onToday,
  banner,
  children,
}: ParentCalendarShellProps) {
  const theme = useTheme();
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'));

  const rootRef = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      setTopOffset(
        Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
      );
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);

    // The banners that shift this element down are SIBLINGS that mount once
    // their own data arrives, so watching only our parent would never fire: its
    // size does not change, only its position. The body's height does.
    const observer = new ResizeObserver(schedule);
    observer.observe(document.body);
    if (rootRef.current?.parentElement) observer.observe(rootRef.current.parentElement);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      observer.disconnect();
    };
  }, []);

  const bottomChrome = isMobile ? 64 : 0; // the fixed BottomNav
  const measuredHeight =
    topOffset === null ? null : `calc(100svh - ${topOffset + bottomChrome}px)`;

  return (
    <Box
      ref={rootRef}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minHeight: 420,
        // svh rather than dvh: dvh changes as a mobile browser's address bar
        // collapses, which would resize the month grid's 1fr rows mid-scroll.
        ...(measuredHeight
          ? { height: measuredHeight }
          : {
              height: {
                xs: `calc(100vh - ${LAYOUT.shellChrome.xs}px)`,
                sm: `calc(100vh - ${LAYOUT.shellChrome.sm}px)`,
                md: `calc(100vh - ${LAYOUT.shellChrome.md}px)`,
              },
              '@supports (height: 100svh)': {
                height: {
                  xs: `calc(100svh - ${LAYOUT.shellChrome.xs}px)`,
                  sm: `calc(100svh - ${LAYOUT.shellChrome.sm}px)`,
                  md: `calc(100svh - ${LAYOUT.shellChrome.md}px)`,
                },
              },
            }),
        bgcolor: 'background.paper',
      }}
    >
      {/* The visible heading lives in the toolbar; screen readers and deep links
          still need a page heading. Explicit px, not the shorthand: MUI reads a
          bare `width: 1` as 100%, which would push the page into scrolling. */}
      <Box
        component="h1"
        sx={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        Classes
      </Box>

      {banner && <Box sx={{ px: { xs: 1.5, md: 2 }, pt: 1.5 }}>{banner}</Box>}

      {/* Toolbar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: { xs: 1, sm: 1.5 },
          py: 1,
          borderBottom: `1px solid ${theme.palette.divider}`,
          flexShrink: 0,
        }}
      >
        <IconButton
          onClick={onPrev}
          aria-label="Previous month"
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ChevronLeftIcon />
        </IconButton>

        <Box
          component="button"
          onClick={onToday}
          aria-label={`${periodLabel}. Go to today`}
          sx={{
            flex: 1,
            minWidth: 0,
            border: 'none',
            bgcolor: 'transparent',
            cursor: 'pointer',
            textAlign: 'center',
            minHeight: 44,
            borderRadius: RADIUS.control,
            '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
            '&:focus-visible': {
              outline: `2px solid ${theme.palette.primary.main}`,
              outlineOffset: -2,
            },
          }}
        >
          <Typography sx={{ fontWeight: 700, fontSize: 15 }} noWrap>
            {periodLabel}
          </Typography>
        </Box>

        <IconButton
          onClick={onNext}
          aria-label="Next month"
          sx={{ minWidth: 44, minHeight: 44 }}
        >
          <ChevronRightIcon />
        </IconButton>

        {/* Two views only. A week grid does not fit a phone, and a parent is
            reviewing rather than scheduling, so a day column has nothing to add
            that the list does not already say more clearly. */}
        <Box
          role="radiogroup"
          aria-label="Calendar view"
          sx={{
            display: 'flex',
            gap: 0.25,
            ml: 0.5,
            p: 0.25,
            borderRadius: RADIUS.control,
            bgcolor: alpha(theme.palette.text.primary, 0.05),
            flexShrink: 0,
          }}
        >
          {VIEWS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <Box
                key={item.id}
                component="button"
                role="radio"
                aria-checked={active}
                aria-label={item.label}
                onClick={() => onViewChange(item.id)}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  minWidth: 44,
                  minHeight: 36,
                  px: 1,
                  border: 'none',
                  borderRadius: RADIUS.control,
                  cursor: 'pointer',
                  bgcolor: active ? 'background.paper' : 'transparent',
                  color: active ? 'primary.main' : 'text.secondary',
                  boxShadow: active ? '0 1px 2px rgba(16,32,64,.10)' : 'none',
                  transition: 'background-color 180ms ease, color 180ms ease',
                  '&:focus-visible': {
                    outline: `2px solid ${theme.palette.primary.main}`,
                    outlineOffset: 1,
                  },
                }}
              >
                <Icon sx={{ fontSize: 18 }} />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    display: { xs: 'none', sm: 'block' },
                  }}
                >
                  {item.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* minHeight 0 is load-bearing: without it a flex item takes its
          min-content size, the child's overflow never engages, and the page
          scrolls instead of the calendar. */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
