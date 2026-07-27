'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMediaQuery, useTheme } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  DEFAULT_WINDOW,
  type TimetableWindow,
  type IsoWeekday,
} from '@/lib/timetable-window';
import {
  addDays,
  addMonths,
  formatDateISO,
  formatRangeLabel,
  getMonthGrid,
  getWeekDatesFor,
  isSameMonth,
  resolveBand,
  startOfDay,
  startOfMonth,
  type MonthGrid,
  type ResolvedBand,
  type WeekDates,
} from '@/components/timetable/date-utils';
import { resolvePlanShapeForDates, type PlanShape } from '@/lib/plan-shape';

/**
 * View state for the calendar: which view, how tall the band is, which dates.
 *
 * Navigation is anchored on a DATE, not a week offset. An offset cannot express
 * "which month", and month navigation from an offset would drift (31 Jan, 28
 * Feb, 28 Mar). Everything the views need is derived from `anchorDate`.
 *
 * View, density and the rail are a personal preference, not shared data, so
 * they live in localStorage keyed by user id rather than costing a DB write and
 * a function invocation on every toggle. The anchor is deliberately NOT
 * persisted: opening the timetable should always land on today.
 */

/**
 * 'agenda' is the list view: labelled "Plan" for teachers, "Agenda" for
 * students. The other three are the Teams-shaped calendar views.
 */
export type TimetableViewMode = 'day' | 'week' | 'month' | 'agenda';

/**
 * 'compact' draws only the admin-configured evening window.
 * 'full' opens the band out to a normal teaching day, for the rare week with
 * a morning mock test or an off-hours session.
 */
export type TimetableDensity = 'compact' | 'full';

/** The band used when the user asks for the full day. */
const FULL_DAY_WINDOW: Pick<TimetableWindow, 'start' | 'end'> = { start: '08:00', end: '21:00' };

const VIEW_KEY = 'nexus_timetable_view';
const DENSITY_KEY = 'nexus_timetable_density';
const RAIL_KEY = 'nexus_timetable_rail';

const VIEW_MODES = ['day', 'week', 'month', 'agenda'] as const;

/**
 * The view mode used to be 'agenda' | 'grid'. Anyone whose preference is still
 * stored as 'grid' should land on Week, not be silently bounced to the default.
 */
const VIEW_ALIASES: Record<string, TimetableViewMode> = { grid: 'week' };

function readStored<T extends string>(
  key: string,
  userId: string | null,
  allowed: readonly T[],
  fallback: T,
  aliases: Record<string, T> = {},
): T {
  if (typeof window === 'undefined' || !userId) return fallback;
  try {
    const raw = window.localStorage.getItem(`${key}:${userId}`);
    if (raw && aliases[raw]) return aliases[raw];
    return allowed.includes(raw as T) ? (raw as T) : fallback;
  } catch {
    // Private browsing and storage-blocked contexts: fall back silently.
    return fallback;
  }
}

function writeStored(key: string, userId: string | null, value: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    window.localStorage.setItem(`${key}:${userId}`, value);
  } catch {
    /* preference is best-effort */
  }
}

interface TimedClass {
  scheduled_date: string;
  start_time: string;
  end_time: string;
}

/** What the current view draws, and therefore what needs fetching. */
export interface DateRange {
  /** Every date drawn, in order: 1 for day, 7 for week/agenda, 35 or 42 for month. */
  days: Date[];
  /** First date to fetch (YYYY-MM-DD). For a month this includes the leading spill. */
  start: string;
  /** Last date to fetch (YYYY-MM-DD). */
  end: string;
  /** "Monday, 27 July 2026" | "20 to 26 July 2026" | "July 2026" */
  label: string;
  /** The 375px variant of the same. */
  shortLabel: string;
  /** Present only in month mode. MonthView takes this instead of `week`. */
  month?: MonthGrid;
}

export interface TimetableViewState {
  view: TimetableViewMode;
  setView: (v: TimetableViewMode) => void;
  density: TimetableDensity;
  setDensity: (d: TimetableDensity) => void;
  toggleDensity: () => void;

  /** Whether the mini-calendar rail is open. Only meaningful at lg and up. */
  railOpen: boolean;
  toggleRail: () => void;

  /** Local-midnight date the whole view hangs off. */
  anchorDate: Date;
  setAnchorDate: (d: Date) => void;
  goToToday: () => void;
  /** One day, week or month back, according to the current mode. */
  previous: () => void;
  next: () => void;
  /** True when the period on screen contains today, so "Today" is a no-op. */
  showingToday: boolean;

  /** What the current view draws AND what to fetch. */
  range: DateRange;
  /**
   * The Monday-anchored week containing `anchorDate`, with columns filtered to
   * the days in play. Unchanged in shape, so GridView, AgendaView and
   * PlannerWeekList need no migration.
   */
  week: WeekDates;
  /** The drawn time band, already expanded for any out-of-window class. */
  band: ResolvedBand;
  /** The admin-configured window, before density or expansion is applied. */
  configuredWindow: TimetableWindow;
  /** True when the band is wider than configured because a class forced it. */
  isBandExpanded: boolean;
  /**
   * Course plans covering the visible week, e.g. ["Regular year"] or, across a
   * changeover week, ["Regular year", "Crash course"]. Empty when the classroom
   * has no plan covering it, in which case the global window is in use.
   */
  activePlanNames: string[];
}

/**
 * @param classes The classes currently loaded. Passed in so the band and the
 *   day columns can expand to cover anything scheduled outside the norm: a
 *   configured window narrows the default view, it must never hide real data.
 * @param defaultView Agenda on mobile, where a six-column grid does not fit.
 */
export function useTimetableView(
  classes: TimedClass[] = [],
  defaultView: TimetableViewMode = 'agenda',
  plans: PlanShape[] = [],
): TimetableViewState {
  const { user, timetableWindow } = useNexusAuthContext();
  const userId = user?.id ?? null;

  const theme = useTheme();
  /**
   * Whether the rail should be open when the user has never said otherwise.
   *
   * The rail costs 248px. At xl and above that is spare change; at lg it would
   * leave the seven day columns cramped, so it starts closed there and the
   * toolbar button opens it on demand. A stored preference always wins over
   * this, which is why it is only ever used as `readStored`'s fallback.
   */
  const railOpenByDefault = useMediaQuery(theme.breakpoints.up('xl'));

  const [view, setViewState] = useState<TimetableViewMode>(defaultView);
  const [density, setDensityState] = useState<TimetableDensity>('compact');
  const [railOpen, setRailOpenState] = useState(false);
  // Lazy initialiser: computing the date during render would run on every
  // re-render, and on the server it would produce a different value than the
  // client.
  const [anchorDate, setAnchorDateState] = useState<Date>(() => startOfDay(new Date()));
  const [hydrated, setHydrated] = useState(false);

  // Read preferences after mount. Reading during render would produce different
  // markup on the server and the client and trip a hydration mismatch.
  useEffect(() => {
    if (!userId) return;
    setViewState(readStored(VIEW_KEY, userId, VIEW_MODES, defaultView, VIEW_ALIASES));
    setDensityState(readStored(DENSITY_KEY, userId, ['compact', 'full'] as const, 'compact'));
    setHydrated(true);
  }, [userId, defaultView]);

  // The rail is hydrated separately because its default depends on the viewport,
  // so this has to re-run on a resize across xl. Folding it into the effect above
  // would re-read view and density on every such resize for no reason.
  useEffect(() => {
    if (!userId) return;
    setRailOpenState(
      readStored(
        RAIL_KEY,
        userId,
        ['open', 'closed'] as const,
        railOpenByDefault ? 'open' : 'closed',
      ) === 'open',
    );
  }, [userId, railOpenByDefault]);

  const setAnchorDate = useCallback((d: Date) => setAnchorDateState(startOfDay(d)), []);

  const setView = useCallback(
    (v: TimetableViewMode) => {
      // Leaving month view, the anchor is usually the 1st, which would drop the
      // user on a week they were not looking at. Snap to today when today is in
      // the month on screen, which is what Teams does.
      if (view === 'month' && v !== 'month') {
        setAnchorDateState((anchor) => {
          const today = startOfDay(new Date());
          return isSameMonth(anchor, today) ? today : anchor;
        });
      }
      setViewState(v);
      writeStored(VIEW_KEY, userId, v);
    },
    [userId, view],
  );

  const setDensity = useCallback(
    (d: TimetableDensity) => {
      setDensityState(d);
      writeStored(DENSITY_KEY, userId, d);
    },
    [userId],
  );

  const toggleDensity = useCallback(() => {
    setDensity(density === 'compact' ? 'full' : 'compact');
  }, [density, setDensity]);

  const toggleRail = useCallback(() => {
    setRailOpenState((open) => {
      writeStored(RAIL_KEY, userId, open ? 'closed' : 'open');
      return !open;
    });
  }, [userId]);

  const configuredWindow = timetableWindow ?? DEFAULT_WINDOW;

  // Columns: every day of the week, always. Neram schedules classes on any day,
  // Sunday included, so the planner must offer all seven as schedulable slots.
  // Narrowing to the plan's/window's class_days used to drop Sunday entirely,
  // which left no way to schedule a Sunday class inline (the empty "Schedule a
  // class" row never appeared). The time band still comes from the plan/window,
  // so the day stays evening-only; only the set of day columns is now full.
  const weekdays = useMemo<IsoWeekday[]>(() => [1, 2, 3, 4, 5, 6, 7], []);

  const week = useMemo(() => getWeekDatesFor(anchorDate, weekdays), [anchorDate, weekdays]);

  const monthGrid = useMemo(
    () => (view === 'month' ? getMonthGrid(anchorDate) : null),
    [view, anchorDate],
  );

  const range = useMemo<DateRange>(() => {
    if (view === 'month' && monthGrid) {
      const { label, shortLabel } = formatRangeLabel('month', monthGrid.days);
      return {
        days: monthGrid.days,
        start: monthGrid.start,
        end: monthGrid.end,
        label,
        shortLabel,
        month: monthGrid,
      };
    }

    if (view === 'day') {
      const iso = formatDateISO(anchorDate);
      const { label, shortLabel } = formatRangeLabel('day', [anchorDate]);
      return { days: [anchorDate], start: iso, end: iso, label, shortLabel };
    }

    // Week and agenda both show the Monday week. The range spans all seven days
    // even when fewer are drawn, so nothing scheduled is missed by the query.
    const { label, shortLabel } = formatRangeLabel('week', week.allDays);
    return { days: week.allDays, start: week.start, end: week.end, label, shortLabel };
  }, [view, monthGrid, anchorDate, week]);

  const showingToday = useMemo(() => {
    const now = new Date();
    // A month GRID runs from a Monday to a Sunday, so August's grid still
    // contains the last days of July. Comparing against the range would leave
    // "Today" disabled after paging into the next month, which reads as broken.
    // What matters is the month on screen.
    if (view === 'month') return isSameMonth(anchorDate, now);
    const today = formatDateISO(now);
    return today >= range.start && today <= range.end;
  }, [view, anchorDate, range.start, range.end]);

  const goToToday = useCallback(() => setAnchorDateState(startOfDay(new Date())), []);

  const previous = useCallback(() => {
    setAnchorDateState((anchor) =>
      view === 'month'
        ? // Recompute from the 1st rather than stepping the anchor, so a run of
          // clicks cannot drift (31 Jan, 28 Feb, 28 Mar).
          startOfMonth(addMonths(startOfMonth(anchor), -1))
        : addDays(anchor, view === 'day' ? -1 : -7),
    );
  }, [view]);

  const next = useCallback(() => {
    setAnchorDateState((anchor) =>
      view === 'month'
        ? startOfMonth(addMonths(startOfMonth(anchor), 1))
        : addDays(anchor, view === 'day' ? 1 : 7),
    );
  }, [view]);

  /**
   * The course plan decides the shape of the day: evening only during the
   * regular year, mornings too once the crash course starts. A classroom with
   * no plan covering this week falls back to the single global window, which is
   * exactly the behaviour before plans carried hours, so nothing breaks before
   * they are configured.
   *
   * Resolved over the WEEK, not the range: in month view a single 6 AM mock
   * test would otherwise reshape the band for the whole month, and the reshape
   * would still be there after switching back to Week.
   */
  const resolved = useMemo(
    () => resolvePlanShapeForDates(plans, week.allDays.map(formatDateISO)),
    [plans, week],
  );

  const hasPlanShape = resolved.bands.length > 0;

  // Same reasoning: the band auto-expands to fit any class outside the window,
  // so it must only ever see the week's classes. A month's worth would let one
  // outlier blow the band open permanently.
  const bandClasses = useMemo(
    () => classes.filter((c) => c.scheduled_date >= week.start && c.scheduled_date <= week.end),
    [classes, week.start, week.end],
  );

  const band = useMemo(() => {
    if (density === 'full') {
      return resolveBand({ ...FULL_DAY_WINDOW, days: configuredWindow.days }, bandClasses);
    }
    return resolveBand(hasPlanShape ? resolved.bands : configuredWindow, bandClasses);
  }, [density, hasPlanShape, resolved.bands, configuredWindow, bandClasses]);

  // Only call it "expanded" in compact mode. In full-day mode the band is wide
  // because the user asked for it, which needs no explanation.
  const isBandExpanded = density === 'compact' && band.expandedFor > 0;

  return {
    // Before hydration, render the caller's default rather than a stored value
    // we have not read yet, so the first paint is stable.
    view: hydrated ? view : defaultView,
    setView,
    density,
    setDensity,
    toggleDensity,

    railOpen,
    toggleRail,

    anchorDate,
    setAnchorDate,
    goToToday,
    previous,
    next,
    showingToday,

    range,
    week,
    band,
    configuredWindow,
    isBandExpanded,
    activePlanNames: resolved.planNames,
  };
}
