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
import Link from 'next/link';
import { Alert, Box, Button, Skeleton, Tab, Tabs, Typography } from '@neram/ui';
import PageHeader from '@/components/PageHeader';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import ClassAttendanceCard from '@/components/attendance/ClassAttendanceCard';
import RegisterGrid from '@/components/attendance/RegisterGrid';
import StandingList from '@/components/attendance/StandingList';
import RangeToggle, { toRangeKey, type RangeKey } from '@/components/attendance/RangeToggle';
import { InfoRingLegendButton } from '@/components/students/InfoRingLegend';
import { istRange } from '@/components/attendance/attendance-format';
import { patchQuery } from '@/lib/list-url-state';
import type { RegisterResponse } from '@/app/api/attendance/register/route';
import type { StandingResponse } from '@/app/api/attendance/standing/route';

type ViewKey = 'classes' | 'register' | 'students';

function AttendanceRegisterWorkspace() {
  const searchParams = useSearchParams();
  const { activeClassroom } = useNexusAuthContext();

  const viewParam = searchParams.get('view');
  const initialView: ViewKey =
    viewParam === 'register' || viewParam === 'students' ? viewParam : 'classes';
  const [view, setViewState] = useState<ViewKey>(initialView);
  const [range, setRangeState] = useState<RangeKey>(toRangeKey(searchParams.get('range')));

  /**
   * The URL is kept in step with replaceState rather than router.replace: this
   * page is entirely client rendered, and router.replace would fetch an RSC
   * payload on every tab press. Same reasoning as the catch-up page.
   *
   * Through patchQuery, which does the same replaceState but carries
   * history.state forward (Next's router keeps its own state there, and writing
   * null over it is how a Back press ends up on a page that has forgotten where
   * it was). It also touches only these two keys, so a ?student= deep link
   * survives a tab press instead of being wiped by a rebuilt query string.
   */
  const setView = (next: ViewKey) => {
    setViewState(next);
    patchQuery({ view: next, range: String(range) });
  };
  const setRange = (next: RangeKey) => {
    setRangeState(next);
    patchQuery({ view, range: String(next) });
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
      {/*
        The range rides in the header's action slot, which leaves exactly one
        row of tabs on this page. Picking a window of time is a setting on the
        view you are already in, not a second place to navigate to, and stacking
        two tab rows said the opposite.
      */}
      <PageHeader
        title="Attendance"
        subtitle={activeClassroom?.name || 'Classes that have happened'}
        action={
          /* gap 1, not 0.5: two adjacent touch targets want 8px between them. */
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RangeToggle value={range} onChange={setRange} />
            {/*
              Every list under these tabs is a list of faces wearing the info
              ring, and this is the screen where a ring that reads as absent
              (the dotted grey "Not set") gets noticed. The key lives here.
            */}
            <InfoRingLegendButton label="What the rings on these photos mean" />
          </Box>
        }
      />

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
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No classes have finished in this range.
            </Typography>
            {/* The register only ever shows classes that are over. An empty one
                usually means the range, or the schedule, and the calendar is
                where both are answered. */}
            <Button
              component={Link}
              href="/teacher/timetable"
              size="small"
              sx={{ mt: 1.5, minHeight: 44, textTransform: 'none' }}
            >
              Open the timetable
            </Button>
          </Box>
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
