'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Box, Typography, Skeleton, Alert, Stack, Button } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import EnrollmentNotice from '@/components/parent/EnrollmentNotice';
import ParentCalendarShell, {
  type ParentCalendarView,
} from '@/components/parent/ParentCalendarShell';
import ParentAgenda from '@/components/parent/ParentAgenda';
import ParentMonthGrid from '@/components/parent/ParentMonthGrid';
import ParentClassSheet from '@/components/parent/ParentClassSheet';
import {
  getMonthGrid,
  formatMonthYear,
  addMonths,
  startOfMonth,
} from '@/components/timetable/date-utils';
import type { ParentClass, ParentTimetableResponse } from '@/lib/parent-view-types';

/**
 * The parent's Classes tab.
 *
 * Reads /api/parent/timetable, NOT the shared /api/timetable. That matters for
 * more than tidiness: the shared route takes its scope from a `?classroom=`
 * query parameter and authorises by enrollment, which a parent can never hold.
 * The parent route resolves the classroom from the parent-child link server
 * side, so a parent cannot ask for a classroom that is not their child's.
 *
 * Two views, list and month, because a parent reviews rather than schedules.
 * State lives in the URL (`?view=`, `?month=`, `?class=`) so the Android back
 * button closes the class sheet instead of leaving the app, and so a parent can
 * bookmark or share a month.
 *
 * Every class here carries STATUS ONLY. There is no recording url and no
 * resource link anywhere in this payload, by construction: see the contract and
 * its enforcing test in lib/parent-classes.ts.
 */

function ParentTimetableInner() {
  const { getToken } = useNexusAuthContext();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const view = (params.get('view') === 'month' ? 'month' : 'agenda') as ParentCalendarView;
  const monthParam = params.get('month');
  const openClassId = params.get('class');

  const anchor = useMemo(() => {
    if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [y, m] = monthParam.split('-').map(Number);
      return new Date(y, m - 1, 1);
    }
    return startOfMonth(new Date());
  }, [monthParam]);

  const [data, setData] = useState<ParentTimetableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Replace, not push, for view and month: the back button is for the sheet. */
  const setParam = useCallback(
    (patch: Record<string, string | null>, mode: 'push' | 'replace' = 'replace') => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const url = `${pathname}?${next.toString()}`;
      if (mode === 'push') router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [params, pathname, router]
  );

  // Fetch the whole month grid, spill days included, so the list and the month
  // view are always looking at the same set and switching between them costs
  // nothing.
  const range = useMemo(() => {
    const grid = getMonthGrid(anchor);
    return { start: grid.start, end: grid.end };
  }, [anchor]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/parent/timetable?start=${range.start}&end=${range.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the classes.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the classes.');
    } finally {
      setLoading(false);
    }
  }, [getToken, range.start, range.end]);

  // Refetch when the month changes. Deliberately no polling: a page left open on
  // a phone would otherwise generate serverless invocations all day for data
  // that changes a few times a week.
  useEffect(() => {
    load();
  }, [load]);

  const openClass = useMemo(
    () => data?.classes.find((c) => c.id === openClassId) ?? null,
    [data, openClassId]
  );

  const handleClassClick = useCallback(
    (cls: ParentClass) => setParam({ class: cls.id }, 'push'),
    [setParam]
  );

  const handleDayClick = useCallback(
    (dateISO: string) => {
      // Tapping a day in the month view drops into the list rather than opening
      // a day column: on a phone there is nothing a day column shows that the
      // list does not, and the list keeps the surrounding days in reach.
      setParam({ view: 'agenda', focus: dateISO });
      requestAnimationFrame(() => {
        document
          .getElementById(`parent-day-${dateISO}`)
          ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    },
    [setParam]
  );

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={load}>
              Try again
            </Button>
          }
        >
          {error}
        </Alert>
      </Box>
    );
  }

  return (
    <>
      <ParentCalendarShell
        view={view}
        onViewChange={(next) => setParam({ view: next })}
        periodLabel={formatMonthYear(anchor)}
        onPrev={() => setParam({ month: monthKey(addMonths(anchor, -1)) })}
        onNext={() => setParam({ month: monthKey(addMonths(anchor, 1)) })}
        onToday={() => setParam({ month: monthKey(new Date()) })}
        banner={<EnrollmentNotice notice={data?.notice} />}
      >
        {loading ? (
          <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {/* Sized to the rows they replace, so nothing jumps when data lands. */}
            <Skeleton variant="rounded" height={18} width={120} />
            <Skeleton variant="rounded" height={104} />
            <Skeleton variant="rounded" height={104} />
            <Skeleton variant="rounded" height={18} width={120} />
            <Skeleton variant="rounded" height={104} />
          </Box>
        ) : !data || data.classes.length === 0 ? (
          <EmptyMonth />
        ) : view === 'month' ? (
          <ParentMonthGrid
            anchor={anchor}
            classes={data.classes}
            holidays={data.holidays}
            onDayClick={handleDayClick}
          />
        ) : (
          <>
            <AttendanceSummaryStrip sentence={data.attendanceSentence} />
            <ParentAgenda
              classes={data.classes}
              holidays={data.holidays}
              onClassClick={handleClassClick}
            />
          </>
        )}
      </ParentCalendarShell>

      <ParentClassSheet
        cls={openClass}
        open={!!openClass}
        onClose={() => router.back()}
      />
    </>
  );
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * The data-quality line, distinct from the enrolment notice above it.
 *
 * That banner is about the child's standing. This is about OUR records: it only
 * has anything to say when a class was never synced. Merging the two would make
 * an admin's missed sync look like something the child did.
 */
function AttendanceSummaryStrip({ sentence }: { sentence: string }) {
  return (
    <Box
      sx={{
        px: { xs: 2, md: 2.5 },
        py: 1.25,
        borderBottom: '1px solid',
        borderColor: 'divider',
        flexShrink: 0,
      }}
    >
      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{sentence}</Typography>
    </Box>
  );
}

function EmptyMonth() {
  return (
    <Box
      sx={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        p: 4,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontWeight: 600, fontSize: 16 }}>
        No classes this month
      </Typography>
      <Typography sx={{ fontSize: 14, color: 'text.secondary', maxWidth: 320 }}>
        Nothing was scheduled in this period. Use the arrows above to look at
        another month.
      </Typography>
    </Box>
  );
}

/**
 * useSearchParams needs a Suspense boundary in the App Router, or the whole
 * route opts into client-side rendering at build time.
 */
export default function ParentTimetablePage() {
  return (
    <Suspense
      fallback={
        <Stack spacing={2} sx={{ p: 2 }}>
          <Skeleton variant="rounded" height={44} />
          <Skeleton variant="rounded" height={104} />
          <Skeleton variant="rounded" height={104} />
        </Stack>
      }
    >
      <ParentTimetableInner />
    </Suspense>
  );
}
