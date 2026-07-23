'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  DEFAULT_WINDOW,
  type TimetableWindow,
  type IsoWeekday,
} from '@/lib/timetable-window';
import {
  effectiveWeekdays,
  formatDateISO,
  getWeekDates,
  resolveBand,
  type ResolvedBand,
  type WeekDates,
} from '@/components/timetable/date-utils';
import { resolvePlanShapeForDates, type PlanShape } from '@/lib/plan-shape';

/**
 * View state for the timetable: which view, how tall the band is, which week.
 *
 * View and density are a personal preference, not shared data, so they live in
 * localStorage keyed by user id rather than costing a DB write and a function
 * invocation on every toggle. The week offset is deliberately NOT persisted:
 * opening the timetable should always land on the current week.
 */

export type TimetableViewMode = 'agenda' | 'grid';

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

function readStored<T extends string>(key: string, userId: string | null, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined' || !userId) return fallback;
  try {
    const raw = window.localStorage.getItem(`${key}:${userId}`);
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

export interface TimetableViewState {
  view: TimetableViewMode;
  setView: (v: TimetableViewMode) => void;
  density: TimetableDensity;
  setDensity: (d: TimetableDensity) => void;
  toggleDensity: () => void;

  weekOffset: number;
  setWeekOffset: (offset: number) => void;
  goToToday: () => void;
  previousWeek: () => void;
  nextWeek: () => void;

  /** Monday-anchored week, with columns filtered to the days in play. */
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

  const [view, setViewState] = useState<TimetableViewMode>(defaultView);
  const [density, setDensityState] = useState<TimetableDensity>('compact');
  const [weekOffset, setWeekOffset] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  // Read preferences after mount. Reading during render would produce different
  // markup on the server and the client and trip a hydration mismatch.
  useEffect(() => {
    if (!userId) return;
    setViewState(readStored(VIEW_KEY, userId, ['agenda', 'grid'] as const, defaultView));
    setDensityState(readStored(DENSITY_KEY, userId, ['compact', 'full'] as const, 'compact'));
    setHydrated(true);
  }, [userId, defaultView]);

  const setView = useCallback(
    (v: TimetableViewMode) => {
      setViewState(v);
      writeStored(VIEW_KEY, userId, v);
    },
    [userId],
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

  const configuredWindow = timetableWindow ?? DEFAULT_WINDOW;

  // The visible week always spans Monday to Sunday, whatever the plan says, so
  // resolving plans does not depend on the columns and there is no circularity.
  const weekDates = useMemo(() => getWeekDates(weekOffset, [1, 2, 3, 4, 5, 6, 7]), [weekOffset]);

  /**
   * The course plan decides the shape of the day: evening only during the
   * regular year, mornings too once the crash course starts. A classroom with
   * no plan covering this week falls back to the single global window, which is
   * exactly the behaviour before plans carried hours, so nothing breaks before
   * they are configured.
   */
  const resolved = useMemo(
    () => resolvePlanShapeForDates(plans, weekDates.allDays.map(formatDateISO)),
    [plans, weekDates],
  );

  const hasPlanShape = resolved.bands.length > 0;

  // Columns: the plan's days (or the global window's), plus any day that
  // actually has a class, so a one-off Sunday session is never hidden.
  const weekdays = useMemo<IsoWeekday[]>(
    () => effectiveWeekdays(hasPlanShape ? resolved.days : configuredWindow.days, classes),
    [hasPlanShape, resolved.days, configuredWindow.days, classes],
  );

  const week = useMemo(() => getWeekDates(weekOffset, weekdays), [weekOffset, weekdays]);

  const band = useMemo(() => {
    if (density === 'full') {
      return resolveBand({ ...FULL_DAY_WINDOW, days: configuredWindow.days }, classes);
    }
    return resolveBand(hasPlanShape ? resolved.bands : configuredWindow, classes);
  }, [density, hasPlanShape, resolved.bands, configuredWindow, classes]);

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

    weekOffset,
    setWeekOffset,
    goToToday: useCallback(() => setWeekOffset(0), []),
    previousWeek: useCallback(() => setWeekOffset((o) => o - 1), []),
    nextWeek: useCallback(() => setWeekOffset((o) => o + 1), []),

    week,
    band,
    configuredWindow,
    isBandExpanded,
    activePlanNames: resolved.planNames,
  };
}
