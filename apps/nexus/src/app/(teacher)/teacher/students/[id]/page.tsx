'use client';

/**
 * The full student profile.
 *
 * ONE ROUTE, A SECTION STACK, THREE FETCHES.
 *
 * Not tab sub-routes: at 375px ten tabs mean a horizontally scrolling strip
 * where every tap is a route transition, a new skeleton, a lost scroll position,
 * and a Back button that walks through tabs instead of returning to the list.
 * A stack lets a teacher thumb-scroll, and each accordion summary carries its
 * headline number so the common question is answered with zero taps.
 *
 * The three fetches exist so the page paints fast and so the fee gate has
 * somewhere to live:
 *   core         blocking. Identity, application, guardians, documents.
 *   finance      lazy, and only attempted when the caller holds the capability.
 *   performance  lazy, fired when attendance or work first becomes visible.
 *
 * Collapsed sections on mobile fetch nothing.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Paper,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ParentAccessCard from '@/components/parent/ParentAccessCard';
import ClassifyDrawer, { type ClassifyMode } from '@/components/students/ClassifyDrawer';
import ClassStandingCard from '@/components/standing/ClassStandingCard';
import ProfileHeaderCard from '@/components/students/profile/ProfileHeaderCard';
import ProfileSkeleton from '@/components/students/profile/ProfileSkeleton';
import SectionNav, { type NavItem } from '@/components/students/profile/SectionNav';
import IdentitySection from '@/components/students/profile/IdentitySection';
import ClassroomSection from '@/components/students/profile/ClassroomSection';
import ApplicationSection from '@/components/students/profile/ApplicationSection';
import GuardianSection from '@/components/students/profile/GuardianSection';
import DocumentsSection from '@/components/students/profile/DocumentsSection';
import AttendanceSection from '@/components/students/profile/AttendanceSection';
import WorkSection from '@/components/students/profile/WorkSection';
import FeeSection from '@/components/students/profile/FeeSection';
import TimelineSection from '@/components/students/profile/TimelineSection';
import { formatCurrencyINR } from '@/lib/student-profile-fields';
import type { StageKey } from '@/lib/student-stage';
import type {
  ProfileTimelineEvent,
  StudentFinancePayload,
  StudentPerformancePayload,
  StudentProfileCore,
} from '@/lib/student-profile-types';

export default function StudentProfilePage() {
  const params = useParams();
  const router = useRouter();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { activeClassroom, getToken, can } = useNexusAuthContext();

  const studentId = params.id as string;

  const [core, setCore] = useState<StudentProfileCore | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [finance, setFinance] = useState<StudentFinancePayload | null>(null);
  const [financeState, setFinanceState] = useState<FetchState>({ loading: false, error: null });

  const [performance, setPerformance] = useState<StudentPerformancePayload | null>(null);
  const [perfState, setPerfState] = useState<FetchState>({ loading: false, error: null });

  const [drawer, setDrawer] = useState<ClassifyMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [examYears, setExamYears] = useState<string[]>([]);

  const canSetStage = can('coord.student.stage');
  const canSetDormancy = can('coord.student.dormancy');
  const canSeeFinance = can('coord.student.finance');

  // ── Core bundle. The only blocking fetch. ─────────────────────────────────
  useEffect(() => {
    if (!activeClassroom || !studentId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/students/${studentId}?classroom=${activeClassroom.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error('Request failed');
        setCore(await res.json());
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load student profile:', err);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeClassroom, studentId, getToken, reloadKey]);

  // The exam-year registry, from the same source the students list uses so both
  // editors offer identical options.
  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/batches', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setExamYears(((data.batches || []) as { code: string }[]).map((b) => b.code));
      } catch {
        /* non-fatal: the drawer just offers no years */
      }
    })();
  }, [getToken]);

  // Refs, not state, so two callers firing in the same tick cannot both pass
  // the guard. Several sections plus the standing card all want this data, and
  // they must produce exactly one request between them.
  const perfRequested = useRef(false);
  const financeRequested = useRef(false);

  // ── Lazy loaders, fired by a section becoming visible ─────────────────────
  const loadPerformance = useCallback(async () => {
    if (!activeClassroom || perfRequested.current) return;
    perfRequested.current = true;
    setPerfState({ loading: true, error: null });
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/students/${studentId}/performance?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Could not load this student’s progress.');
      setPerformance(await res.json());
      setPerfState({ loading: false, error: null });
    } catch (err) {
      // Allow a retry: a failed fetch must not leave the page permanently blank.
      perfRequested.current = false;
      setPerfState({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not load progress.',
      });
    }
  }, [activeClassroom, studentId, getToken]);

  const loadFinance = useCallback(async () => {
    // Skipping the call for a teacher is a courtesy that avoids a guaranteed
    // 403. It is NOT the gate: the gate is the capability assert on the route.
    if (!canSeeFinance || !activeClassroom || financeRequested.current) return;
    financeRequested.current = true;
    setFinanceState({ loading: true, error: null });
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/students/${studentId}/finance?classroom=${activeClassroom.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Could not load the fee record.');
      setFinance(await res.json());
      setFinanceState({ loading: false, error: null });
    } catch (err) {
      financeRequested.current = false;
      setFinanceState({
        loading: false,
        error: err instanceof Error ? err.message : 'Could not load the fee record.',
      });
    }
  }, [canSeeFinance, activeClassroom, studentId, getToken]);

  // The fee section is only ever mounted for a capable caller, so fetch as soon
  // as we know the caller is capable rather than waiting for an expand.
  useEffect(() => {
    if (core && canSeeFinance) void loadFinance();
  }, [core, canSeeFinance, loadFinance]);

  // Class Standing sits at the top of the page and is the first thing anyone
  // looks at, so it must not wait for a section to be expanded. This is still
  // ONE request: the attendance and work sections read the same payload.
  useEffect(() => {
    if (core) void loadPerformance();
  }, [core, loadPerformance]);

  async function applyClassification(payload: {
    studyStage?: StageKey | null;
    academicYear?: string | null;
    participationStatus?: 'active' | 'dormant';
    reason?: string;
  }) {
    if (!activeClassroom || !core) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/students/classification', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroomId: activeClassroom.id,
          studentIds: [core.student.id],
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSnackbar(data?.error || 'Could not update this student');
        return;
      }
      setDrawer(null);
      setReloadKey((k) => k + 1);
      setSnackbar('Updated');
    } catch {
      setSnackbar('Could not update this student');
    } finally {
      setSaving(false);
    }
  }

  const copyEmail = useCallback((e: React.MouseEvent, email: string) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(email).then(
      () => setSnackbar('Email copied'),
      () => setSnackbar('Could not copy the email'),
    );
  }, []);

  if (loading) return <ProfileSkeleton />;

  if (notFound || !core) {
    return (
      <Box>
        <BackButton onClick={() => router.push('/teacher/students')} />
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            This student is not in the classroom you have selected.
          </Typography>
        </Paper>
      </Box>
    );
  }

  // Payment events join the feed only when the finance fetch succeeded, so a
  // teacher's timeline simply never contains one.
  const timeline = mergeTimeline(core.timeline, finance);

  const navItems: NavItem[] = [
    { id: 'profile-identity', label: 'Identity and contact' },
    { id: 'profile-classroom', label: 'Class and progress' },
    { id: 'profile-attendance', label: 'Attendance' },
    { id: 'profile-work', label: 'Assignments and tests' },
    { id: 'profile-application', label: 'Application form' },
    ...(canSeeFinance ? [{ id: 'profile-fees', label: 'Fees and payments' }] : []),
    { id: 'profile-documents', label: 'Documents' },
    { id: 'profile-guardian', label: 'Parent and guardian' },
    { id: 'profile-timeline', label: 'Activity' },
  ];

  const header = (
    <ProfileHeaderCard
      student={core.student}
      enrollment={core.enrollment}
      record={core.record}
      applicationNumber={core.application?.application_number ?? null}
      currentBatch={core.currentBatch}
      canSetStage={canSetStage}
      canSetDormancy={canSetDormancy}
      onEditStage={() => setDrawer('stage')}
      onToggleDormancy={() =>
        setDrawer(core.enrollment.participation_status === 'dormant' ? 'reactivate' : 'dormant')
      }
    />
  );

  const standingCard = (
    <ClassStandingCard
      standing={performance?.classStanding ?? null}
      audience="staff"
      loading={perfState.loading}
    />
  );

  const sections = (
    <>
      {/* Performance is classroom-scoped while identity and fees are global.
          Saying so stops a teacher reading one classroom's attendance as the
          student's whole record. */}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        Attendance, assignments, tests and catch-up are shown for{' '}
        {core.classroom.name || 'this classroom'}. Identity, application and documents are
        the same everywhere.
      </Alert>

      <IdentitySection student={core.student} record={core.record} onCopyEmail={copyEmail} />

      <ClassroomSection
        enrollment={core.enrollment}
        record={core.record}
        classroom={core.classroom}
        checklist={core.checklist}
        topics={core.topics}
        currentBatch={core.currentBatch}
      />

      <AttendanceSection
        performance={performance}
        loading={perfState.loading}
        error={perfState.error}
        onFirstOpen={loadPerformance}
      />

      <WorkSection
        performance={performance}
        loading={perfState.loading}
        error={perfState.error}
        onFirstOpen={loadPerformance}
      />

      <ApplicationSection application={core.application} />

      {/* Rendered only for a capable caller. The server-side assert is what
          actually protects the data; this keeps a teacher from seeing an
          empty section they can do nothing about. */}
      {canSeeFinance && (
        <FeeSection
          finance={finance}
          loading={financeState.loading}
          error={financeState.error}
        />
      )}

      <DocumentsSection
        documents={core.documents}
        guardian={core.guardian}
        canSeeRestricted={canSeeFinance}
      />

      <GuardianSection guardian={core.guardian} parentAccess={core.parentAccess} />

      <Box sx={{ mb: 2 }}>
        <ParentAccessCard
          studentId={core.student.id}
          studentName={core.student.name || ''}
          classroomId={activeClassroom?.id ?? null}
        />
      </Box>

      <TimelineSection events={timeline} />
    </>
  );

  return (
    <Box>
      <BackButton onClick={() => router.push('/teacher/students')} />

      {isDesktop ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '320px minmax(0, 1fr)',
            gap: 3,
            alignItems: 'start',
          }}
        >
          <Box sx={{ position: 'sticky', top: 88 }}>
            {header}
            <Box sx={{ mt: 2 }}>{standingCard}</Box>
            <SectionNav items={navItems} />
          </Box>
          <Box sx={{ minWidth: 0 }}>{sections}</Box>
        </Box>
      ) : (
        <>
          {header}
          {standingCard}
          {sections}
        </>
      )}

      <ClassifyDrawer
        open={!!drawer}
        mode={drawer ?? 'stage'}
        names={[core.student.name || '']}
        busy={saving}
        examYears={examYears}
        currentBatch={core.currentBatch}
        onClose={() => setDrawer(null)}
        onApply={applyClassification}
      />

      <Snackbar
        open={!!snackbar}
        autoHideDuration={2500}
        onClose={() => setSnackbar(null)}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

interface FetchState {
  loading: boolean;
  error: string | null;
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      startIcon={<ArrowBackIcon />}
      sx={{ textTransform: 'none', minHeight: 48, mb: 2 }}
    >
      Back to Students
    </Button>
  );
}

/** Fold payment events into the activity feed, newest first. */
function mergeTimeline(
  base: ProfileTimelineEvent[],
  finance: StudentFinancePayload | null,
): ProfileTimelineEvent[] {
  if (!finance) return base;

  const payments: ProfileTimelineEvent[] = finance.payments
    .filter((p) => p.paid_at && p.status === 'paid')
    .map((p) => ({
      at: p.paid_at as string,
      kind: 'payment' as const,
      title: `Payment received: ${formatCurrencyINR(p.amount)}`,
      detail: p.receipt_number ? `Receipt ${p.receipt_number}` : null,
    }));

  return [...base, ...payments].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
