'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, useMediaQuery, useTheme } from '@neram/ui';
import { LAYOUT } from './timetable-theme';
import CalendarToolbar from './CalendarToolbar';
import MiniCalendarRail from './MiniCalendarRail';
import type { TimetableViewState } from '@/hooks/useTimetableView';

interface CalendarShellProps {
  state: TimetableViewState;
  /** Teachers see the list view as "Plan", since that is what it is for them. */
  agendaLabel?: string;
  /** Right-hand toolbar group, before the overflow button. */
  toolbarActions?: ReactNode;
  overflowMenu?: (close: () => void) => ReactNode;
  viewMenuExtras?: (close: () => void) => ReactNode;
  overflowBadge?: number;
  /** Rail header subtitle, e.g. the classroom name. */
  railSubtitle?: string;
  railFooter?: ReactNode;
  /** Dates with at least one class, for the mini calendar's dots. */
  markedDates?: Set<string>;
  holidayDates?: Set<string>;
  /**
   * A slim urgent strip above the toolbar, e.g. the student's live-class join
   * banner. Kept deliberately narrow: anything taller belongs in the rail.
   */
  banner?: ReactNode;
  /** The calendar view. Owns its own scrolling. */
  children: ReactNode;
}

/**
 * The full-height frame every timetable view sits in.
 *
 * The whole point of the redesign is that the calendar fills the screen, so
 * this box is sized off the viewport rather than growing with its content, and
 * each view scrolls internally. The page itself must not scroll.
 *
 * Height maths: the teacher/student/parent layouts leave only the TopBar above
 * and (on mobile) the BottomNav below once the timetable route drops its
 * Container padding. Those two numbers are LAYOUT.shellChrome.
 */
export default function CalendarShell({
  state,
  agendaLabel,
  toolbarActions,
  overflowMenu,
  viewMenuExtras,
  overflowBadge,
  railSubtitle,
  railFooter,
  markedDates,
  holidayDates,
  banner,
  children,
}: CalendarShellProps) {
  const theme = useTheme();
  /**
   * The rail is drawn at lg and up, matching exactly where the toolbar's toggle
   * button is shown.
   *
   * This used to be `up('xl')` while the button appeared from `up('lg')`, so
   * between 1200px and 1535px the button was visible and clicking it did
   * nothing at all: the state flipped, the preference was saved, and no rail
   * ever appeared. That band covers most laptops, including a 1080p screen at
   * 125% Windows scaling (~1513 CSS px).
   *
   * Whether it starts open still depends on the viewport, but that belongs in
   * useTimetableView with the rest of the stored preferences, not here.
   */
  const wideEnoughForRail = useMediaQuery(theme.breakpoints.up('lg'));
  const railVisible = state.railOpen && wideEnoughForRail;
  const isMobile = !useMediaQuery(theme.breakpoints.up('md'));

  /**
   * How far down the page the calendar actually starts.
   *
   * LAYOUT.shellChrome covers the fixed chrome (top bar, bottom nav), but the
   * layouts also render conditional banners above the page: an unregistered
   * device warning, the impersonation bar. Measuring the real offset means the
   * calendar shrinks to fit whatever is above it instead of being pushed off
   * the bottom of the screen. The constant stays as the first-paint value, so
   * there is no jump before the measurement lands.
   */
  const rootRef = useRef<HTMLDivElement>(null);
  const [topOffset, setTopOffset] = useState<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      setTopOffset(Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY)));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('resize', schedule);

    // The banners that shift this element down are SIBLINGS that mount once
    // their own data arrives, so watching only our parent would never fire:
    // its size does not change, only its position. The body's height does.
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
      {/* The visible title now lives in the rail, which is not always drawn.
          Screen readers and deep links still need a page heading. */}
      {/* Explicit px, not the shorthand: MUI's sx reads a bare `width: 1` as
          100%, which would make this a full-height invisible block and push the
          page into scrolling. */}
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
        Timetable
      </Box>

      {banner}

      <CalendarToolbar
        state={state}
        agendaLabel={agendaLabel}
        actions={toolbarActions}
        overflowMenu={overflowMenu}
        viewMenuExtras={viewMenuExtras}
        overflowBadge={overflowBadge}
      />

      <Box sx={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0 }}>
        {railVisible && (
          <MiniCalendarRail
            state={state}
            subtitle={railSubtitle}
            markedDates={markedDates}
            holidayDates={holidayDates}
            footer={railFooter}
          />
        )}

        {/* minHeight and minWidth 0 are load-bearing: without them a flex item
            takes its min-content size and the child's overflow never engages,
            so the page scrolls instead of the calendar. */}
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
    </Box>
  );
}
