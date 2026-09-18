'use client';

/**
 * The attendance register: a screen staff open only to look.
 *
 * It replaces a page that could not work (it called /api/attendance with
 * parameters that route never accepted, so expanding a class and saving both
 * 400'd) and, with it, the idea that this is where attendance gets marked.
 * Marking and chasing live where they already worked; this is the register.
 */
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Skeleton, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ClassAttendanceCard from '@/components/attendance/ClassAttendanceCard';
import RegisterGrid from '@/components/attendance/RegisterGrid';
import StandingList from '@/components/attendance/StandingList';
import { istRange } from '@/components/attendance/attendance-format';
import type { RegisterResponse } from '@/app/api/attendance/register/route';
import type { StandingResponse } from '@/app/api/attendance/standing/route';

type ViewKey = 'classes' | 'register' | 'students';
const RANGES = [14, 30, 90] as const;
type RangeKey = (typeof RANGES)[number];

function AttendanceRegisterWorkspace() {
  const searchParams = useSearchParams();
  const { activeClassroom } = useNexusAuthContext();

  const viewParam = searchParams.get('view');
  const initialView: ViewKey =
    viewParam === 'register' || viewParam === 'students' ? viewParam : 'classes';
  const initialRange = (RANGES as readonly number[]).includes(Number(searchParams.get('range')))
    ? (Number(searchParams.get('range')) as RangeKey)
    : 30;
  const [view, setViewState] = useState<ViewKey>(initialView);
  const [range, setRangeState] = useState<RangeKey>(initialRange);

  /**
   * The URL is kept in step with replaceState rather than router.replace: this
   * page is entirely client rendered, and router.replace would fetch an RSC
   * payload on every tab press. Same reasoning as the catch-up page.
   */
  const syncUrl = (nextView: ViewKey, nextRange: RangeKey) => {
    if (typeof window === 'undefined') return;
    window.history.replaceState(null, '', `?view=${nextView}&range=${nextRange}`);
  };
  const setView = (next: ViewKey) => {
    setViewState(next);
    syncUrl(next, range);
  };
  const setRange = (next: RangeKey) => {
    setRangeState(next);
    syncUrl(view, next);
  };

  const { from, to } = useMemo(() => istRange(range), [range]);
  const { data, error, isLoading } = useAuthSWR<RegisterResponse>(
    activeClassroom
      ? `/api/attendance/register?classroom_id=${activeClassroom.id}&from=${from}&to=${to}`
      : null,
  );

  const { data: standing, error: standingError } = useAuthSWR<StandingResponse>(
    activeClassroom && view === 'students'
      ? `/api/attendance/standing?classroom_id=${activeClassroom.id}&from=${from}&to=${to}`
      : null,
  );

  const classHref = (classId: string) => `/teacher/attendance/${classId}?view=${view}&range=${range}`;

  return (
    <Box>
      <PageHeader title="Attendance" subtitle={activeClassroom?.name || 'Classes that have happened'} />

      <Tabs
        value={range}
        onChange={(_, v) => setRange(v as RangeKey)}
        sx={{ minHeight: 44, mb: 1 }}
        aria-label="How far back to look"
      >
        {RANGES.map((r) => (
          <Tab key={r} value={r} label={r === 14 ? '2 weeks' : `${r} days`} sx={{ minHeight: 44, textTransform: 'none' }} />
        ))}
      </Tabs>

      <Tabs
        value={view}
        onChange={(_, v) => setView(v as ViewKey)}
        sx={{ minHeight: 48, mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}
        aria-label="Attendance views"
      >
        <Tab value="classes" label="Classes" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
        <Tab value="register" label="Register" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
        <Tab value="students" label="Students" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 700 }} />
      </Tabs>

      {error && (
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {error.message || 'Could not load the register.'}
        </Alert>
      )}

      {isLoading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={104} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {data && view === 'classes' && (
        data.classes.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No classes have finished in this range.
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {data.classes.map((cls) => (
              <ClassAttendanceCard key={cls.id} cls={cls} href={classHref(cls.id)} />
            ))}
          </Box>
        )
      )}

      {data && view === 'register' && (
        <RegisterGrid data={data} classHref={classHref} />
      )}

      {/*
        The standing read resolves the whole catch-up backlog and reads the
        sign-in log, so its SWR key stays null until this view is actually
        opened: the two tabs that already shipped do not get slower because a
        third exists.

        An if/else chain, not three independent conditions.

        As three conditions this rendered NOTHING in the gap before the request
        starts: useAuthSWR reports `isLoading: false` while it is still waiting
        for the token, so error, data and loading were all falsy at once and the
        tab was simply blank. Skeletons are the honest default for "we have not
        got an answer yet", whatever the reason we have not got one.
      */}
      {view === 'students' &&
        (standingError ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            {standingError.message || 'Could not work out where students stand.'}
          </Alert>
        ) : standing ? (
          <StandingList data={standing} />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={92} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        ))}
    </Box>
  );
}

/**
 * useSearchParams needs a Suspense boundary or the whole route opts out of
 * static generation and the build warns. Same reasoning as the catch-up page.
 */
export default function AttendanceRegisterPage() {
  return (
    <Suspense
      fallback={
        <Box>
          <Skeleton variant="rounded" height={44} sx={{ borderRadius: 2, mb: 2, maxWidth: 260 }} />
          <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
        </Box>
      }
    >
      <AttendanceRegisterWorkspace />
    </Suspense>
  );
}
