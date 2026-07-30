'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Typography,
  Paper,
  Chip,
  TextField,
  MenuItem,
  Snackbar,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import DensitySmallOutlinedIcon from '@mui/icons-material/DensitySmallOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import NoAccountsOutlinedIcon from '@mui/icons-material/NoAccountsOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import AvailableStudentsSection from '@/components/AvailableStudentsSection';
import BulkSelectBar from '@/components/students/BulkSelectBar';
import ClassifyDrawer, { type ClassifyMode } from '@/components/students/ClassifyDrawer';
import ClassYearIssues from '@/components/students/ClassYearIssues';
import PrefillReviewSheet, {
  type PrefillSuggestion,
} from '@/components/students/PrefillReviewSheet';
import StudentListSkeleton from '@/components/students/StudentListSkeleton';
import StudentSegmentBar from '@/components/students/StudentSegmentBar';
import { CompactRow, StudentCard, DetailedRow } from '@/components/students/StudentRows';
import {
  VIEW_STORAGE_KEY,
  type EnrolledStudent,
  type StudentBatch,
  type ViewMode,
} from '@/components/students/studentRow.types';
import {
  DEFAULT_SEGMENT,
  SEGMENT_LABEL,
  SEGMENT_STORAGE_KEY,
  matchesSegment,
  segmentCounts,
  stageCounts,
  stageKeyOf,
  type StageKey,
  type StudentSegment,
} from '@/lib/student-stage';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { usePresence } from '@/hooks/usePresence';

const SEGMENTS: StudentSegment[] = [
  'exam_this_year',
  'all_active',
  '11th',
  'lower',
  'unset',
  'dormant',
];

interface StudentCounts {
  total: number;
  active: number;
  awaitingMicrosoft: number;
  tracked: number;
  dormant: number;
  stage: Record<StageKey, number>;
  segments: Record<StudentSegment, number>;
  /** Class and exam year contradict each other. Excludes dormant students. */
  mismatch: number;
  /** No exam year at all. Excludes dormant students. */
  noYear: number;
}

/** Snackbar verb for a class and/or exam year edit, naming what actually changed. */
function describeFieldChange(payload: {
  studyStage?: string | null;
  academicYear?: string | null;
}): string {
  const touchedStage = 'studyStage' in payload;
  const touchedYear = 'academicYear' in payload;
  if (touchedStage && touchedYear) return 'Class and exam year set';
  if (touchedYear) return payload.academicYear === null ? 'Cleared exam year' : 'Exam year set';
  return payload.studyStage === null ? 'Cleared class' : 'Class set';
}

const EMPTY_COUNTS: StudentCounts = {
  total: 0,
  active: 0,
  awaitingMicrosoft: 0,
  tracked: 0,
  dormant: 0,
  stage: { gap_year: 0, '12th': 0, '11th': 0, '10th': 0, unset: 0 },
  segments: { exam_this_year: 0, all_active: 0, '11th': 0, lower: 0, unset: 0, dormant: 0 },
  mismatch: 0,
  noYear: 0,
};

export default function TeacherStudents() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const { activeClassroom, getToken, can } = useNexusAuthContext();

  // can() is fail-closed: an unknown capability, or a payload from before this
  // rollout, returns false. So a stale /api/auth/me hides the controls rather
  // than offering an action the server will refuse.
  //
  // Two capabilities, deliberately asymmetric. Any teaching staff can set a class
  // or an exam year, because that is data entry after speaking to a student and a
  // wrong value is visible and self-correcting. Only a manager or admin can mark
  // someone dormant, because that removes them from every metric and every
  // reminder with nothing on screen turning red.
  const canSetStage = can('coord.student.stage');
  const canSetDormancy = can('coord.student.dormancy');

  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [counts, setCounts] = useState<StudentCounts>(EMPTY_COUNTS);
  const [batches, setBatches] = useState<StudentBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [batchFilter, setBatchFilter] = useState<string | null>(null);
  const [examBatches, setExamBatches] = useState<{ code: string }[]>([]);
  // Default 'current' = the current exam-year cohort PLUS any upcoming years
  // (and untagged), so the primary view is the batch the teacher runs now
  // together with students already enrolled for a future batch.
  const [examBatchFilter, setExamBatchFilter] = useState<string>('current');
  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ message: string; undo?: () => void } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('compact');

  // The landing filter: the students who actually sit the exam this year. This
  // makes the priority the default daily experience instead of something a
  // teacher has to remember to filter for.
  const [segment, setSegment] = useState<StudentSegment>(DEFAULT_SEGMENT);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Set only by the "N not set" banner, so a manual Select starts empty. */
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const [drawer, setDrawer] = useState<{ mode: ClassifyMode } | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * A transient narrowing to the students whose class and exam year disagree.
   * Sits alongside the segment rather than inside it, because a mismatch can occur
   * in any segment, and it is always rendered as a removable chip so the narrowing
   * is never invisible.
   */
  const [mismatchOnly, setMismatchOnly] = useState(false);

  const [prefill, setPrefill] = useState<{
    open: boolean;
    loading: boolean;
    suggestions: PrefillSuggestion[];
  }>({ open: false, loading: false, suggestions: [] });
  /** Count only, so the banner can hide the prefill button when there is nothing. */
  const [suggestionCount, setSuggestionCount] = useState(0);

  // Both preferences are read AFTER mount, not during render: reading
  // localStorage while rendering a client page produces a hydration mismatch.
  useEffect(() => {
    try {
      const savedView = localStorage.getItem(VIEW_STORAGE_KEY);
      if (savedView === 'compact' || savedView === 'cards' || savedView === 'detailed') {
        setViewMode(savedView);
      }
      const savedSegment = localStorage.getItem(SEGMENT_STORAGE_KEY);
      if (savedSegment && (SEGMENTS as string[]).includes(savedSegment)) {
        setSegment(savedSegment as StudentSegment);
      }
    } catch {
      /* localStorage unavailable, keep defaults */
    }
  }, []);

  const handleViewModeChange = useCallback((_e: React.MouseEvent<HTMLElement>, next: ViewMode | null) => {
    if (!next) return; // ignore de-select (a mode is always active)
    setViewMode(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleSegmentChange = useCallback((next: StudentSegment) => {
    setSegment(next);
    setSelectedIds(new Set());
    try {
      localStorage.setItem(SEGMENT_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  // Load the exam-year batch list once (for the filter dropdown).
  useEffect(() => {
    async function loadExamBatches() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/batches', { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          setExamBatches(data.batches || []);
          if (data.current?.code) setCurrentBatch(data.current.code);
        }
      } catch {
        /* non-fatal */
      }
    }
    loadExamBatches();
  }, [getToken]);

  const fetchStudents = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // The exam-year cohort filter is deliberately dropped for the two
      // data-hygiene segments. users.academic_year is noisy (one classroom
      // spans NULL, 2025-26, 2026-27, 2027-28 and 2028-29), so leaving it on
      // would hide some of the very students those segments exist to surface,
      // and the pill count would not match the list.
      const cohortFree = segment === 'unset' || segment === 'dormant';
      const examParam = cohortFree ? 'all' : examBatchFilter;

      let url = `/api/students?classroom=${activeClassroom.id}`;
      if (batchFilter) url += `&batch=${batchFilter}`;
      if (examParam && examParam !== 'all') url += `&examBatch=${examParam}`;

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        if (data.counts) setCounts({ ...EMPTY_COUNTS, ...data.counts });
        if (data.batches) setBatches(data.batches);
        if (data.currentBatch) setCurrentBatch(data.currentBatch);
      }
    } catch (err) {
      console.error('Failed to load students:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken, batchFilter, examBatchFilter, segment]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Bulk presence for all loaded students
  const { presenceMap } = usePresence(students.map((s) => s.ms_oid));

  // Counts come from the server over the COMPLETE roster; these local ones only
  // exist so the pills stay honest while a request is in flight or if an older
  // payload arrives without them.
  const localCounts = useMemo(() => {
    const facts = students.map((s) => ({
      stage: stageKeyOf(s.study_stage),
      dormant: s.participation_status === 'dormant',
    }));
    return { segments: segmentCounts(facts), stage: stageCounts(facts) };
  }, [students]);

  const segmentTotals = counts.segments ?? localCounts.segments;
  /**
   * Non-dormant students with no class, which is `segments.unset` rather than
   * `stage.unset`. Both are correct and that was the problem: stageCounts files a
   * dormant student under their own stage, segmentCounts excludes them entirely, so
   * the banner said 15 while the pill beside it said 13. A dormant student cannot
   * be prioritised or targeted anyway, so the smaller number is the actionable one
   * and it now matches the pill.
   */
  const unsetTotal = segmentTotals.unset ?? localCounts.segments.unset;

  // Never land on an empty list. A remembered segment can legitimately go to
  // zero between visits (the last dormant student came back, every stage got
  // set), and restoring it would show a teacher an empty screen with no clue
  // that 28 students are one tap away. Falls back to the first segment that
  // actually has somebody, preferring the default.
  useEffect(() => {
    if (loading || counts.total === 0) return;
    // While reviewing mismatches the segment is not what is on screen, so moving
    // it would silently drop the review the moment the last one was fixed.
    if (mismatchOnly) return;
    if (segmentTotals[segment] > 0) return;
    const fallback =
      segmentTotals[DEFAULT_SEGMENT] > 0
        ? DEFAULT_SEGMENT
        : SEGMENTS.find((s) => segmentTotals[s] > 0);
    if (fallback && fallback !== segment) handleSegmentChange(fallback);
  }, [loading, counts.total, segmentTotals, segment, handleSegmentChange, mismatchOnly]);

  // Segment first, then the free-text search, so the count on the active pill
  // and the length of the list agree except when the user is searching.
  const visibleStudents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return students.filter((s) => {
      // The mismatch review deliberately overrides the segment: a contradictory
      // pair can occur at any stage, so narrowing within a segment would show only
      // some of them and quietly imply the rest were fine.
      if (mismatchOnly) {
        if (s.pair_status !== 'mismatch') return false;
      } else {
        const inSegment = matchesSegment(
          { stage: stageKeyOf(s.study_stage), dormant: s.participation_status === 'dormant' },
          segment,
        );
        if (!inSegment) return false;
      }
      if (!query) return true;
      return (
        s.name.toLowerCase().includes(query) ||
        (!!s.email && s.email.toLowerCase().includes(query))
      );
    });
  }, [students, segment, searchQuery, mismatchOnly]);

  const awaitingCount = visibleStudents.filter((s) => s.awaiting_microsoft).length;

  const handleCopyEmail = useCallback((e: React.MouseEvent, email: string) => {
    e.stopPropagation(); // Don't navigate to student detail
    navigator.clipboard.writeText(email).then(() => {
      setSnackbar({ message: `Copied ${email}` });
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setAutoSelectPending(false);
  }, []);

  /** One tap from the "N not set" banner to about-to-fix-them-all. */
  const startFixingUnset = useCallback(() => {
    setMismatchOnly(false);
    handleSegmentChange('unset');
    setSelectMode(true);
    setAutoSelectPending(true);
  }, [handleSegmentChange]);

  /**
   * Review the students whose class and exam year contradict each other.
   *
   * Forces the cohort filter to "all" first. The mismatch count is computed inside
   * the cohort filter like every other count on this page, so under the default
   * "Current + upcoming" a student parked on a past year is not even in the payload.
   * Reviewing a subset while the banner counts a different set is worse than not
   * offering the review at all.
   */
  const reviewMismatches = useCallback(() => {
    setExamBatchFilter('all');
    setMismatchOnly(true);
    setSelectMode(true);
    setAutoSelectPending(true);
  }, []);

  /** The students with a class but no cohort. */
  const startFixingYears = useCallback(() => {
    setMismatchOnly(false);
    setExamBatchFilter('none');
    handleSegmentChange('all_active');
    setSelectMode(true);
    setAutoSelectPending(true);
  }, [handleSegmentChange]);

  const loadSuggestions = useCallback(
    async (openSheet: boolean) => {
      if (!activeClassroom) return;
      if (openSheet) setPrefill((p) => ({ ...p, open: true, loading: true }));
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/students/classification/suggestions?classroom=${activeClassroom.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          setSuggestionCount(0);
          if (openSheet) setPrefill({ open: true, loading: false, suggestions: [] });
          return;
        }
        const data = await res.json();
        const suggestions = (data.suggestions || []) as PrefillSuggestion[];
        setSuggestionCount(suggestions.length);
        if (openSheet) setPrefill({ open: true, loading: false, suggestions });
      } catch {
        setSuggestionCount(0);
        if (openSheet) setPrefill({ open: true, loading: false, suggestions: [] });
      }
    },
    [activeClassroom, getToken],
  );

  // Probe for suggestions in the background so the banner knows whether to offer
  // the button at all. Only worth asking when something is actually missing.
  useEffect(() => {
    if (!canSetStage) return;
    if (unsetTotal <= 0 && counts.noYear <= 0) {
      setSuggestionCount(0);
      return;
    }
    loadSuggestions(false);
  }, [canSetStage, unsetTotal, counts.noYear, loadSuggestions]);

  // Selecting everyone has to wait for the segment switch and the refetch to
  // land, so it runs off the rendered list rather than being folded into
  // startFixingUnset.
  //
  // Gated on the banner flag, NOT just on being in select mode on this segment:
  // a manager who taps "Select" themselves must start from an EMPTY selection,
  // because the very next control is "Mark dormant" and silently pre-selecting
  // the whole segment turns one tap into a bulk change nobody asked for.
  useEffect(() => {
    if (!autoSelectPending) return;
    if (loading || !visibleStudents.length) return;
    setSelectedIds(new Set(visibleStudents.map((s) => s.id)));
    setAutoSelectPending(false);
  }, [autoSelectPending, loading, visibleStudents]);

  interface ClassifyPayload {
    studyStage?: StageKey | null;
    academicYear?: string | null;
    participationStatus?: 'active' | 'dormant';
    reason?: string;
  }

  interface Assignment {
    studentId: string;
    studyStage?: string | null;
    academicYear?: string | null;
  }

  /**
   * One writer for both request shapes.
   *
   * `payload` + ids applies the same value to many students (the bulk-fix gesture).
   * `assignments` applies a different value per student, which is what the
   * application-form prefill produces. The API accepts exactly one of the two.
   */
  const applyClassification = useCallback(
    async (
      payload: ClassifyPayload,
      ids?: string[],
      silent = false,
      assignments?: Assignment[],
    ) => {
      if (!activeClassroom) return;
      const studentIds = ids ?? Array.from(selectedIds);
      if (!assignments && !studentIds.length) return;
      if (assignments && !assignments.length) return;

      setSaving(true);
      try {
        const token = await getToken();
        if (!token) return;

        const body = assignments
          ? { classroomId: activeClassroom.id, assignments }
          : { classroomId: activeClassroom.id, studentIds, ...payload };

        const res = await fetch('/api/students/classification', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) {
          setSnackbar({ message: data?.error || 'Could not update those students' });
          return;
        }

        setDrawer(null);
        setPrefill({ open: false, loading: false, suggestions: [] });
        exitSelectMode();
        await fetchStudents();

        if (silent) return;

        const skipped = (data.skipped || []).length;
        const what = assignments
          ? 'Filled in'
          : payload.participationStatus === 'dormant'
            ? 'Marked dormant'
            : payload.participationStatus === 'active'
              ? 'Brought back'
              : describeFieldChange(payload);
        const message = skipped
          ? `${what} for ${data.updated}. ${skipped} skipped (not in this classroom).`
          : `${what} for ${data.updated} student${data.updated === 1 ? '' : 's'}.`;

        // A bulk write over thirteen rows needs a way back that does not involve
        // redoing the whole selection by hand.
        //
        // Undo rebuilds from EACH student's own `previous`, not from the first
        // one's. A prefill applies different values per student, so reverting them
        // all to the first student's old class would be worse than no undo at all.
        const returned = (data.students || []) as Array<{
          id: string;
          previous: Record<string, unknown>;
        }>;

        let undo: (() => void) | undefined;
        if (returned.length) {
          const touchedParticipation = returned.some((r) => 'participation_status' in (r.previous || {}));
          if (touchedParticipation) {
            // Participation is uniform by construction (the API refuses it per
            // student), so the flat shape is correct and is the only one that can
            // carry the required reason.
            const first = returned[0]?.previous || {};
            const revert: ClassifyPayload = {
              participationStatus: (first.participation_status as 'active' | 'dormant') ?? 'active',
            };
            if (revert.participationStatus === 'dormant') revert.reason = 'Undo';
            undo = () => applyClassification(revert, returned.map((r) => r.id), true);
          } else {
            const revertAssignments: Assignment[] = returned.map((r) => ({
              studentId: r.id,
              ...('study_stage' in (r.previous || {})
                ? { studyStage: (r.previous.study_stage as string | null) ?? null }
                : {}),
              ...('academic_year' in (r.previous || {})
                ? { academicYear: (r.previous.academic_year as string | null) ?? null }
                : {}),
            }));
            // A revert to "no exam year" is a real edit, but the API rejects an
            // assignment with no fields, so drop any student whose previous state
            // held nothing we touched.
            const usable = revertAssignments.filter((a) => 'studyStage' in a || 'academicYear' in a);
            if (usable.length) undo = () => applyClassification({}, undefined, true, usable);
          }
        }

        setSnackbar({ message, undo });
      } catch (err) {
        console.error('Classification failed:', err);
        setSnackbar({ message: 'Could not update those students' });
      } finally {
        setSaving(false);
      }
    },
    [activeClassroom, getToken, selectedIds, exitSelectMode, fetchStudents],
  );

  const selectedNames = useMemo(
    () => students.filter((s) => selectedIds.has(s.id)).map((s) => s.name),
    [students, selectedIds],
  );

  /**
   * Selectable exam years for the drawer. The registry plus whatever the roster
   * already carries, so a cohort that exists on students but has no batch row
   * (which is how this classroom ended up spanning five different years) is still
   * pickable rather than silently unavailable.
   */
  const examYears = useMemo(() => {
    const codes = new Set<string>(examBatches.map((b) => b.code));
    for (const student of students) {
      if (student.exam_batch) codes.add(student.exam_batch);
    }
    if (currentBatch) codes.add(currentBatch);
    return Array.from(codes).sort().reverse();
  }, [examBatches, students, currentBatch]);

  return (
    <Box sx={{ pb: selectMode ? 12 : 0 }}>
      {/* Context header: what the numbers on this page are counting */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Tooltip
          title="Students counted in attendance, submissions, prep readiness and the watchlist. Dormant students are excluded from all of those."
          arrow
          enterTouchDelay={0}
          leaveTouchDelay={4000}
        >
          <Chip
            icon={<PeopleOutlinedIcon sx={{ fontSize: 18 }} />}
            label={loading ? 'Loading…' : `${counts.tracked} tracked`}
            color="primary"
            sx={{ fontWeight: 700, cursor: 'help' }}
          />
        </Tooltip>
        {/* Dormant shrank the denominator of every metric on this page; hiding
            that is how people stop trusting the numbers. */}
        {!loading && counts.dormant > 0 && (
          <Chip
            label={`${counts.dormant} dormant`}
            variant="outlined"
            onClick={() => handleSegmentChange('dormant')}
            sx={{ fontWeight: 700, cursor: 'pointer' }}
          />
        )}
        {!loading && awaitingCount > 0 && (
          <Tooltip
            title="Enrolled and paid, but they have no @neramclasses.com account yet, so they cannot sign in to Nexus. Create the account in Entra, then use Refresh from Entra in Admin."
            arrow
            enterTouchDelay={0}
            leaveTouchDelay={4000}
          >
            <Chip
              icon={<NoAccountsOutlinedIcon sx={{ fontSize: 18 }} />}
              label={`${awaitingCount} awaiting Microsoft`}
              color="error"
              variant="outlined"
              sx={{ fontWeight: 700, cursor: 'help' }}
            />
          </Tooltip>
        )}
        {currentBatch && (
          <Chip
            icon={<EventAvailableOutlinedIcon sx={{ fontSize: 18 }} />}
            label={`Current batch ${currentBatch}`}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
        )}
        {canSetStage && !selectMode && (
          <Button
            size="small"
            startIcon={<ChecklistOutlinedIcon />}
            onClick={() => setSelectMode(true)}
            sx={{ ml: { sm: 'auto' }, minHeight: 40, fontWeight: 700 }}
          >
            Select
          </Button>
        )}
        {selectMode && (
          <Button size="small" onClick={exitSelectMode} sx={{ ml: { sm: 'auto' }, minHeight: 40 }}>
            Done
          </Button>
        )}
      </Box>

      {/* Sticky filters */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          pt: 0.5,
          pb: 1,
          mb: 1,
          bgcolor: (t) => (t.palette.mode === 'light' ? '#FAFAFA' : t.palette.background.default),
        }}
      >
        <Box sx={{ mb: 1 }}>
          <StudentSegmentBar value={segment} counts={segmentTotals} onChange={handleSegmentChange} />
        </Box>

        <TextField
          fullWidth
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: 'background.paper' } }}
          inputProps={{ style: { minHeight: 24 } }}
        />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Exam-year cohort filter (users.academic_year) */}
          <TextField
            select
            size="small"
            label="Exam year"
            value={examBatchFilter}
            onChange={(e) => setExamBatchFilter(e.target.value)}
            disabled={segment === 'unset' || segment === 'dormant'}
            helperText={
              segment === 'unset' || segment === 'dormant'
                ? 'Showing all exam years for this view'
                : undefined
            }
            sx={{ minWidth: 190, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: 'background.paper' } }}
          >
            <MenuItem value="current">Current + upcoming</MenuItem>
            <MenuItem value="all">All with access</MenuItem>
            {examBatches.map((b) => (
              <MenuItem key={b.code} value={b.code}>
                {b.code}
              </MenuItem>
            ))}
            <MenuItem value="none">No exam year set</MenuItem>
          </TextField>

          {/* Classroom section (nexus_batches) filter chips */}
          {batches.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, overflowX: 'auto', pb: 0.5, '&::-webkit-scrollbar': { display: 'none' } }}>
              <Chip
                label="All sections"
                size="small"
                variant={batchFilter === null ? 'filled' : 'outlined'}
                color={batchFilter === null ? 'primary' : 'default'}
                onClick={() => setBatchFilter(null)}
                sx={{ minHeight: 32, flexShrink: 0 }}
              />
              {batches.map((b) => (
                <Chip
                  key={b.id}
                  label={b.name}
                  size="small"
                  variant={batchFilter === b.id ? 'filled' : 'outlined'}
                  color={batchFilter === b.id ? 'primary' : 'default'}
                  onClick={() => setBatchFilter(b.id)}
                  sx={{ minHeight: 32, flexShrink: 0 }}
                />
              ))}
              <Chip
                label="Unassigned"
                size="small"
                variant={batchFilter === 'unassigned' ? 'filled' : 'outlined'}
                color={batchFilter === 'unassigned' ? 'warning' : 'default'}
                onClick={() => setBatchFilter('unassigned')}
                sx={{ minHeight: 32, flexShrink: 0 }}
              />
            </Box>
          )}

          {/* Density switch: dense scan list / avatar cards / roomy rows */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="Student list layout"
            sx={{
              ml: { sm: 'auto' },
              bgcolor: 'background.paper',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                minWidth: 44,
                minHeight: 40,
                px: 1.25,
                borderRadius: 2,
                color: 'text.secondary',
              },
              '& .Mui-selected': {
                bgcolor: (t) => alpha(t.palette.primary.main, 0.14),
                color: 'primary.main',
                '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.2) },
              },
            }}
          >
            <ToggleButton value="compact" aria-label="Compact list">
              <Tooltip title="Compact" arrow>
                <DensitySmallOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="cards" aria-label="Card grid">
              <Tooltip title="Cards" arrow>
                <GridViewOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="detailed" aria-label="Detailed rows">
              <Tooltip title="Detailed" arrow>
                <ViewAgendaOutlinedIcon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      </Box>

      {mismatchOnly && (
        <Box sx={{ mb: 1.5 }}>
          <Chip
            label={`Showing ${visibleStudents.length} that need a year check`}
            onDelete={() => {
              setMismatchOnly(false);
              exitSelectMode();
            }}
            color="warning"
            sx={{ fontWeight: 700, minHeight: 36 }}
          />
        </Box>
      )}

      {!loading && !mismatchOnly && (
        <Box sx={{ mb: 1.5 }}>
          <ClassYearIssues
            mismatchCount={counts.mismatch}
            // Hidden while already looking at the unset segment: the list below IS
            // the answer, so restating it just costs a row of vertical space.
            noStageCount={segment === 'unset' ? 0 : unsetTotal}
            noYearCount={counts.noYear}
            suggestionCount={suggestionCount}
            canEdit={canSetStage}
            onReviewMismatches={reviewMismatches}
            onFixStages={startFixingUnset}
            onFixYears={startFixingYears}
            onPrefill={() => loadSuggestions(true)}
          />
        </Box>
      )}

      {/* Student List */}
      {loading ? (
        <StudentListSkeleton viewMode={viewMode} />
      ) : visibleStudents.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PeopleOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            {searchQuery
              ? 'No students match your search'
              : segment === 'dormant'
                ? 'Nobody is marked dormant'
                : segment === 'unset'
                  ? 'Every student has a study stage'
                  : `No students in ${SEGMENT_LABEL[segment]}`}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {searchQuery
              ? 'Try a different name or email.'
              : segment === 'exam_this_year'
                ? 'Break Year and Class 12 students appear here once their stage is set.'
                : 'Try another category, or All active to see everyone.'}
          </Typography>
        </Paper>
      ) : (
        <Box
          role={selectMode ? 'listbox' : undefined}
          aria-multiselectable={selectMode || undefined}
          sx={
            viewMode === 'cards'
              ? { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 1.5 }
              : { display: 'flex', flexDirection: 'column', gap: viewMode === 'compact' ? 1 : 1.5 }
          }
        >
          {visibleStudents.map((student) => {
            const checklistPct = student.checklist.total > 0
              ? Math.round((student.checklist.completed / student.checklist.total) * 100)
              : 0;
            const attColor = student.attendance.percentage >= 75 ? theme.palette.success.main : theme.palette.warning.main;
            const doneColor = checklistPct >= 50 ? theme.palette.info.main : theme.palette.text.disabled;
            const presenceStatus = student.ms_oid ? presenceMap[student.ms_oid]?.availability : undefined;

            const rowProps = {
              student,
              checklistPct,
              attColor,
              doneColor,
              presenceStatus,
              currentBatch,
              isMobile,
              selectMode,
              selected: selectedIds.has(student.id),
              onToggleSelect: () => toggleSelect(student.id),
              onOpen: () => router.push(`/teacher/students/${student.id}`),
              onCopy: handleCopyEmail,
            };

            if (viewMode === 'compact') return <CompactRow key={student.id} {...rowProps} />;
            if (viewMode === 'cards') return <StudentCard key={student.id} {...rowProps} />;
            return <DetailedRow key={student.id} {...rowProps} />;
          })}
        </Box>
      )}

      {/* Add students who are not yet in this classroom (reads the live Microsoft
          directory, so their @neramclasses.com address shows correctly). */}
      {activeClassroom && !selectMode && (
        <Box sx={{ mt: 2 }}>
          <AvailableStudentsSection
            classroomId={activeClassroom.id}
            getToken={getToken}
            onEnrolled={fetchStudents}
          />
        </Box>
      )}

      {selectMode && (
        <BulkSelectBar
          selectedCount={selectedIds.size}
          visibleCount={visibleStudents.length}
          canClassify={canSetStage}
          canSetDormancy={canSetDormancy}
          onSelectAll={() => setSelectedIds(new Set(visibleStudents.map((s) => s.id)))}
          onClear={() => setSelectedIds(new Set())}
          onSetStage={() => setDrawer({ mode: 'stage' })}
          onMarkDormant={() => setDrawer({ mode: 'dormant' })}
          onReactivate={() => setDrawer({ mode: 'reactivate' })}
          showReactivate={segment === 'dormant'}
        />
      )}

      <ClassifyDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'stage'}
        names={selectedNames}
        busy={saving}
        examYears={examYears}
        currentBatch={currentBatch}
        onClose={() => setDrawer(null)}
        onApply={(payload) => applyClassification(payload)}
      />

      <PrefillReviewSheet
        open={prefill.open}
        loading={prefill.loading}
        busy={saving}
        suggestions={prefill.suggestions}
        onClose={() => setPrefill({ open: false, loading: false, suggestions: [] })}
        onApply={(assignments) => applyClassification({}, undefined, false, assignments)}
      />

      <Snackbar
        open={!!snackbar}
        autoHideDuration={snackbar?.undo ? 8000 : 2500}
        onClose={() => setSnackbar(null)}
        message={snackbar?.message}
        action={
          snackbar?.undo ? (
            <Button
              size="small"
              color="secondary"
              onClick={() => {
                snackbar.undo?.();
                setSnackbar(null);
              }}
            >
              Undo
            </Button>
          ) : undefined
        }
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          bottom: { xs: selectMode ? 96 : 16 },
          '& .MuiSnackbarContent-root': {
            minWidth: 'auto',
            borderRadius: 2,
            fontSize: '0.85rem',
          },
        }}
      />
    </Box>
  );
}
