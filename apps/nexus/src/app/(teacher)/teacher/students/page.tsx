'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Fab,
  IconButton,
  Typography,
  Paper,
  Chip,
  Snackbar,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  useTheme,
  useMediaQuery,
  alpha,
} from '@neram/ui';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import DensitySmallOutlinedIcon from '@mui/icons-material/DensitySmallOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import ViewAgendaOutlinedIcon from '@mui/icons-material/ViewAgendaOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import PeopleSearchField from '@/components/PeopleSearchField';
import RemoveStudentDialog from '@/components/RemoveStudentDialog';
import AddStudentSheet from '@/components/students/AddStudentSheet';
import ApplicationFormSheet from '@/components/students/ApplicationFormSheet';
import CreateAccountForm, { type AccountPrefill } from '@/components/students/CreateAccountForm';
import ResetPasswordSheet, { type ResetPasswordTarget } from '@/components/students/ResetPasswordSheet';
import BulkSelectBar from '@/components/students/BulkSelectBar';
import ClassifyDrawer, { type ClassifyMode } from '@/components/students/ClassifyDrawer';
import NeedsAttentionCard from '@/components/students/NeedsAttentionCard';
import PrefillReviewSheet, {
  type PrefillSuggestion,
} from '@/components/students/PrefillReviewSheet';
import { DormantIcon } from '@/components/students/StageGlyph';
import StudentFilterSheet, { ActiveFilterChips } from '@/components/students/StudentFilterSheet';
import StudentListSkeleton from '@/components/students/StudentListSkeleton';
import StudentRowMenu, { type RowMenuItem } from '@/components/students/StudentRowMenu';
import StudentSegmentBar from '@/components/students/StudentSegmentBar';
import StudentSortMenu from '@/components/students/StudentSortMenu';
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
import {
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  FILTERS_STORAGE_KEY,
  SORT_STORAGE_KEY,
  activeFilterCount,
  matchesFilters,
  parseStoredFilters,
  parseStoredSort,
  sortStudents,
  type RosterFilters,
  type RosterSort,
} from '@/lib/student-roster-view';
import type { AttentionActionKey } from '@/lib/student-attention';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { usePresence } from '@/hooks/usePresence';
import { rankPeople, suggestPeople } from '@/lib/people-search';

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
  /** Has a Microsoft account and has never opened Nexus. Excludes dormant students. */
  neverSignedIn: number;
  /** Last opened Nexus 14 or more days ago. Excludes dormant students. */
  notSeen14d: number;
  /** No application form on their own record. Excludes dormant students. */
  noForm: number;
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
  neverSignedIn: 0,
  notSeen14d: 0,
  noForm: 0,
};

export default function TeacherStudents() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const pathname = usePathname();
  const { activeClassroom, getToken, can, isTeacher, impersonation, startImpersonation } = useNexusAuthContext();

  // can() is fail-closed: an unknown capability, or a payload from before this
  // rollout, returns false. So a stale /api/auth/me hides the controls rather
  // than offering an action the server will refuse.
  //
  // Any teaching staff can set a class or an exam year: data entry after speaking
  // to a student, visible and self-correcting. Only a manager or admin can mark
  // someone dormant, because that removes them from every metric and reminder with
  // nothing on screen turning red. Adding and removing change who holds Nexus
  // access, so they follow the same enrolment capabilities the routes enforce.
  const canSetStage = can('coord.student.stage');
  const canSetDormancy = can('coord.student.dormancy');
  const canAddStudents = can('structure.enrollment.add');
  const canRemoveStudents = can('structure.enrollment.remove');
  // A new Microsoft account uses a paid license, and a reset locks a student out
  // until the new password reaches them, so both are internal-team work.
  const canCreateAccounts = can('structure.student.account');

  /** Set when "Create Microsoft account" was chosen for a student already on the roster. */
  const [accountPrefill, setAccountPrefill] = useState<AccountPrefill | null>(null);
  const [resetTarget, setResetTarget] = useState<ResetPasswordTarget | null>(null);
  /** A new password is on screen that nobody has copied yet, so closing the sheet asks first. */
  const [passwordPending, setPasswordPending] = useState(false);

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
  const [sort, setSort] = useState<RosterSort>(DEFAULT_SORT);
  const [filters, setFilters] = useState<RosterFilters>(DEFAULT_FILTERS);
  /** One clock per load, so every row's "Seen 2h ago" agrees. */
  const [now, setNow] = useState(0);

  // The landing filter: the students who actually sit the exam this year. This
  // makes the priority the default daily experience instead of something a
  // teacher has to remember to filter for.
  const [segment, setSegment] = useState<StudentSegment>(DEFAULT_SEGMENT);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Set only by an attention action, so a manual Select starts empty. */
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const [drawer, setDrawer] = useState<{ mode: ClassifyMode } | null>(null);
  /** Set when the classify drawer was opened from ONE row's menu, not a selection. */
  const [drawerTargetIds, setDrawerTargetIds] = useState<string[] | null>(null);
  const [removeTarget, setRemoveTarget] = useState<EnrolledStudent | null>(null);
  const [addOpen, setAddOpen] = useState(false);
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
  /** Count only, so the attention card can hide the prefill button when there is nothing. */
  const [suggestionCount, setSuggestionCount] = useState(0);
  /** The application-form review: everyone without a form, or one student from their row. */
  const [formSheet, setFormSheet] = useState<{ open: boolean; studentId: string | null }>({
    open: false,
    studentId: null,
  });

  // Preferences are read AFTER mount, not during render: reading localStorage
  // while rendering a client page produces a hydration mismatch.
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
      setSort(parseStoredSort(localStorage.getItem(SORT_STORAGE_KEY)));
      setFilters(parseStoredFilters(localStorage.getItem(FILTERS_STORAGE_KEY)));
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

  const handleSortChange = useCallback((next: RosterSort) => {
    setSort(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      /* non-fatal */
    }
  }, []);

  const handleFiltersChange = useCallback((next: RosterFilters) => {
    setFilters(next);
    try {
      localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* non-fatal */
    }
  }, []);

  // Load the exam-year batch list once (for the filter sheet).
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
        setNow(Date.now());
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
   * `stage.unset`: a dormant student cannot be prioritised or targeted anyway, so
   * the smaller number is the actionable one and it matches the pill.
   */
  const unsetTotal = segmentTotals.unset ?? localCounts.segments.unset;

  // Never land on an empty list. A remembered segment can legitimately go to
  // zero between visits, and restoring it would show a teacher an empty screen
  // with no clue that 28 students are one tap away.
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

  const trimmedQuery = searchQuery.trim();

  // A typed name searches the WHOLE roster, ranked by closeness, and keeps that
  // relevance order. Browsing uses the chosen sort. The sign-in and account
  // filters apply either way, and always show as chips, so a narrowed list is
  // never a mystery.
  const visibleStudents = useMemo(() => {
    let rows: EnrolledStudent[];
    if (trimmedQuery && !mismatchOnly) {
      rows = rankPeople(students, trimmedQuery);
    } else {
      rows = students.filter((s) => {
        if (mismatchOnly) return s.pair_status === 'mismatch';
        return matchesSegment(
          { stage: stageKeyOf(s.study_stage), dormant: s.participation_status === 'dormant' },
          segment,
        );
      });
      if (trimmedQuery) rows = rankPeople(rows, trimmedQuery);
    }
    rows = rows.filter((s) => matchesFilters(s, filters, now));
    return trimmedQuery ? rows : sortStudents(rows, sort);
  }, [students, segment, trimmedQuery, mismatchOnly, filters, sort, now]);

  // Offered only when the search found nobody, so a near miss is one tap away.
  const searchSuggestions = useMemo(
    () => (trimmedQuery && visibleStudents.length === 0 ? suggestPeople(students, trimmedQuery) : []),
    [students, trimmedQuery, visibleStudents.length],
  );

  /** Records with no Microsoft account that look like a second record for someone. */
  const duplicateCount = useMemo(
    () =>
      students.filter((s) => s.participation_status !== 'dormant' && !s.ms_oid && s.possible_duplicate_of).length,
    [students],
  );
  const filtersActive = activeFilterCount(filters) > 0;

  const headerCaption = [
    `${counts.tracked} tracked`,
    counts.dormant > 0 ? `${counts.dormant} dormant` : null,
    counts.awaitingMicrosoft > 0 ? `${counts.awaitingMicrosoft} without Microsoft` : null,
    currentBatch ? `Batch ${currentBatch}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const copyEmail = useCallback(async (email: string) => {
    try {
      await navigator.clipboard.writeText(email);
      setSnackbar({ message: `Copied ${email}` });
    } catch {
      setSnackbar({ message: 'Could not copy the email' });
    }
  }, []);

  const viewAsStudent = useCallback(
    async (student: EnrolledStudent) => {
      try {
        await startImpersonation(student.id, { reason: `Student list: ${student.name}`, returnUrl: pathname });
        router.push('/student/dashboard');
      } catch (err) {
        setSnackbar({ message: err instanceof Error ? err.message : 'Could not open the student view' });
      }
    },
    [startImpersonation, pathname, router],
  );

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

  const openClassifyFor = useCallback((mode: ClassifyMode, student: EnrolledStudent) => {
    setDrawerTargetIds([student.id]);
    setDrawer({ mode });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setDrawerTargetIds(null);
  }, []);

  /** One tap from the "N not set" row to about-to-fix-them-all. */
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

  // Probe for suggestions in the background so the attention card knows whether
  // to offer the button at all. Only worth asking when something is missing.
  useEffect(() => {
    if (!canSetStage) return;
    if (unsetTotal <= 0 && counts.noYear <= 0) {
      setSuggestionCount(0);
      return;
    }
    loadSuggestions(false);
  }, [canSetStage, unsetTotal, counts.noYear, loadSuggestions]);

  // Selecting everyone has to wait for the segment switch and the refetch to
  // land, so it runs off the rendered list rather than being folded into the
  // action that asked for it.
  //
  // Gated on the flag, NOT just on being in select mode: a manager who taps
  // "Select" themselves must start from an EMPTY selection, because the very next
  // control is "Mark dormant" and silently pre-selecting the whole segment turns
  // one tap into a bulk change nobody asked for.
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
   * `payload` + ids applies the same value to many students (the bulk-fix gesture,
   * or one row's menu). `assignments` applies a different value per student, which
   * is what the application-form prefill produces. The API accepts exactly one.
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

        closeDrawer();
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
            // The API rejects an assignment with no fields, so drop any student
            // whose previous state held nothing we touched.
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
    [activeClassroom, getToken, selectedIds, exitSelectMode, fetchStudents, closeDrawer],
  );

  /** Who the classify drawer is about: one row's student from its menu, or the selection. */
  const drawerNames = useMemo(() => {
    const ids = new Set(drawerTargetIds ?? Array.from(selectedIds));
    return students.filter((s) => ids.has(s.id)).map((s) => s.name);
  }, [students, selectedIds, drawerTargetIds]);

  /**
   * Selectable exam years for the drawer. The registry plus whatever the roster
   * already carries, so a cohort that exists on students but has no batch row is
   * still pickable rather than silently unavailable.
   */
  const examYears = useMemo(() => {
    const codes = new Set<string>(examBatches.map((b) => b.code));
    for (const student of students) {
      if (student.exam_batch) codes.add(student.exam_batch);
    }
    if (currentBatch) codes.add(currentBatch);
    return Array.from(codes).sort().reverse();
  }, [examBatches, students, currentBatch]);

  /**
   * Each attention row defines its own view, so a leftover search or sign-in
   * filter cannot make "14 have no class set" open a list of three.
   */
  const handleAttentionAction = useCallback(
    (key: AttentionActionKey) => {
      setSearchQuery('');
      switch (key) {
        case 'review_mismatches':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          reviewMismatches();
          break;
        case 'fix_stages':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          startFixingUnset();
          break;
        case 'fix_years':
          handleFiltersChange({ ...DEFAULT_FILTERS });
          startFixingYears();
          break;
        case 'prefill':
          loadSuggestions(true);
          break;
        case 'review_forms':
          setFormSheet({ open: true, studentId: null });
          break;
        case 'show_never_signed_in':
          setMismatchOnly(false);
          handleSegmentChange('all_active');
          handleFiltersChange({ signIn: 'never', account: 'any', form: 'any' });
          break;
        case 'review_duplicates':
          setMismatchOnly(false);
          setExamBatchFilter('all');
          handleSegmentChange('all_active');
          handleFiltersChange({ signIn: 'any', account: 'possible_duplicate', form: 'any' });
          break;
      }
    },
    [handleFiltersChange, reviewMismatches, startFixingUnset, startFixingYears, loadSuggestions, handleSegmentChange],
  );

  /** One student's actions, each shown only to someone the server would allow. */
  const menuItemsFor = useCallback(
    (student: EnrolledStudent): RowMenuItem[] => {
      const dormant = student.participation_status === 'dormant';
      const items: RowMenuItem[] = [
        {
          key: 'open',
          label: 'Open profile',
          icon: <PersonOutlineIcon fontSize="small" />,
          onClick: () => router.push(`/teacher/students/${student.id}`),
        },
      ];
      if (student.email) {
        const email = student.email;
        items.push({
          key: 'copy',
          label: 'Copy email',
          icon: <ContentCopyOutlinedIcon fontSize="small" />,
          onClick: () => copyEmail(email),
        });
      }
      // Same rule as ViewAsStudentButton, and only for someone who can sign in.
      if (isTeacher && !impersonation.active && student.ms_oid) {
        items.push({
          key: 'view-as',
          label: 'View as student',
          icon: <VisibilityOutlinedIcon fontSize="small" />,
          onClick: () => viewAsStudent(student),
        });
      }
      if (canSetStage) {
        items.push({
          key: 'classify',
          label: 'Set class and exam year',
          icon: <EditOutlinedIcon fontSize="small" />,
          onClick: () => openClassifyFor('stage', student),
          dividerBefore: true,
        });
      }
      if (canSetDormancy) {
        items.push(
          dormant
            ? {
                key: 'reactivate',
                label: 'Bring back',
                icon: <ReplayOutlinedIcon fontSize="small" />,
                onClick: () => openClassifyFor('reactivate', student),
                dividerBefore: !canSetStage,
              }
            : {
                key: 'dormant',
                label: 'Mark dormant',
                icon: <DormantIcon fontSize="small" />,
                onClick: () => openClassifyFor('dormant', student),
                tone: 'warning',
                dividerBefore: !canSetStage,
              },
        );
      }
      // The one account action this student needs: a login they do not have yet,
      // or a new password for the one they do.
      if (canCreateAccounts) {
        items.push(
          student.ms_oid
            ? {
                key: 'reset-password',
                label: 'Reset password',
                icon: <LockResetOutlinedIcon fontSize="small" />,
                onClick: () => setResetTarget({ id: student.id, name: student.name }),
                dividerBefore: !canSetStage && !canSetDormancy,
              }
            : {
                key: 'create-account',
                label: 'Create Microsoft account',
                icon: <ManageAccountsOutlinedIcon fontSize="small" />,
                onClick: () => {
                  const [first = '', ...rest] = (student.name || '').trim().split(/\s+/);
                  setAccountPrefill({
                    attachToUserId: student.id,
                    name: student.name,
                    firstName: first,
                    lastName: rest.join(' '),
                  });
                  setAddOpen(true);
                },
                dividerBefore: !canSetStage && !canSetDormancy,
              },
        );
      }
      // Their form sits on another record, or they never filled one in. Anyone can
      // look; the sheet offers linking only to someone allowed to do it.
      if (student.has_application_form === false) {
        items.push({
          key: 'application-form',
          label: 'Find application form',
          icon: <AssignmentLateOutlinedIcon fontSize="small" />,
          onClick: () => setFormSheet({ open: true, studentId: student.id }),
          dividerBefore: true,
        });
      }
      if (canRemoveStudents && student.enrollment_id) {
        items.push({
          key: 'remove',
          label: 'Remove from class',
          icon: <PersonRemoveOutlinedIcon fontSize="small" />,
          onClick: () => setRemoveTarget(student),
          tone: 'error',
          dividerBefore: true,
        });
      }
      return items;
    },
    [
      router,
      copyEmail,
      isTeacher,
      impersonation.active,
      viewAsStudent,
      canSetStage,
      canSetDormancy,
      canCreateAccounts,
      canRemoveStudents,
      openClassifyFor,
    ],
  );

  const fabVisible = canAddStudents && !selectMode && !!activeClassroom;
  const examYearLocked = segment === 'unset' || segment === 'dormant';

  const emptyTitle = trimmedQuery
    ? `No student matches "${trimmedQuery}"`
    : filtersActive
      ? 'No students match these filters'
      : segment === 'dormant'
        ? 'Nobody is marked dormant'
        : segment === 'unset'
          ? 'Every student has a study stage'
          : `No students in ${SEGMENT_LABEL[segment]}`;

  return (
    <Box sx={{ pb: selectMode ? 12 : fabVisible ? { xs: 9, sm: 0 } : 0 }}>
      {/* Header: what the numbers count, and the page's two actions */}
      <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, flex: '1 1 200px' }}>
          <PeopleOutlinedIcon aria-hidden sx={{ fontSize: 20, color: 'primary.main', mr: 0.75, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
            {loading && !students.length ? 'Loading students' : headerCaption}
          </Typography>
          <Tooltip
            title="Tracked students count in attendance, submissions, prep readiness and the watchlist. Dormant students are left out of all of those. A student without a Microsoft account cannot sign in to Nexus yet."
            arrow
            enterTouchDelay={0}
            leaveTouchDelay={5000}
          >
            <IconButton
              aria-label="What these numbers mean"
              sx={{ width: 48, height: 48, flexShrink: 0, color: 'text.secondary' }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 'auto' }}>
          {canSetStage && !selectMode && (
            <Button
              startIcon={<ChecklistOutlinedIcon />}
              onClick={() => setSelectMode(true)}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              Select
            </Button>
          )}
          {selectMode && (
            <Button onClick={exitSelectMode} sx={{ minHeight: 48, fontWeight: 700 }}>
              Done
            </Button>
          )}
          {fabVisible && (
            <Button
              variant="contained"
              startIcon={<PersonAddAltOutlinedIcon />}
              onClick={() => setAddOpen(true)}
              sx={{ display: { xs: 'none', sm: 'inline-flex' }, minHeight: 48, fontWeight: 700 }}
            >
              Add student
            </Button>
          )}
        </Box>
      </Box>

      {/* Sticky: search, categories, then how the list is narrowed and ordered */}
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
        {/* The shared people search: one-tap clear, Escape clears, 16px text, and
            the match count read out once typing pauses. */}
        <PeopleSearchField
          value={searchQuery}
          onChange={setSearchQuery}
          label="Search students by name or email"
          placeholder="Search by name or email..."
          resultCount={trimmedQuery ? visibleStudents.length : undefined}
          sx={{ mb: 1 }}
        />
        {trimmedQuery && !mismatchOnly && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: -0.5, mb: 1 }}>
            Searching every student in this classroom, in all categories.
          </Typography>
        )}

        <Box sx={{ mb: 1 }}>
          <StudentSegmentBar value={segment} counts={segmentTotals} onChange={handleSegmentChange} />
        </Box>

        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <StudentFilterSheet
            filters={filters}
            examBatchFilter={examBatchFilter}
            batchFilter={batchFilter}
            onFiltersChange={handleFiltersChange}
            onExamBatchFilterChange={setExamBatchFilter}
            onBatchFilterChange={setBatchFilter}
            examBatches={examBatches}
            examYearLocked={examYearLocked}
            batches={batches}
          />
          <StudentSortMenu value={sort} onChange={handleSortChange} />

          {/* Density switch: dense scan list / avatar cards / roomy rows */}
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={handleViewModeChange}
            size="small"
            aria-label="Student list layout"
            sx={{
              ml: 'auto',
              bgcolor: 'background.paper',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                minWidth: 44,
                minHeight: 48,
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

        <ActiveFilterChips
          filters={filters}
          examBatchFilter={examBatchFilter}
          batchFilter={batchFilter}
          onFiltersChange={handleFiltersChange}
          onExamBatchFilterChange={setExamBatchFilter}
          onBatchFilterChange={setBatchFilter}
          batches={batches}
        />
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
            sx={{ fontWeight: 700, minHeight: 40 }}
          />
        </Box>
      )}

      {!loading && !mismatchOnly && !selectMode && (
        <Box sx={{ mb: 1.5 }}>
          <NeedsAttentionCard
            // A row whose list is already on screen only costs vertical space.
            duplicateCount={filters.account === 'possible_duplicate' ? 0 : duplicateCount}
            mismatchCount={counts.mismatch}
            neverSignedInCount={filters.signIn === 'never' ? 0 : counts.neverSignedIn}
            noFormCount={filters.form === 'missing' ? 0 : counts.noForm}
            noStageCount={segment === 'unset' ? 0 : unsetTotal}
            noYearCount={counts.noYear}
            suggestionCount={suggestionCount}
            canEdit={canSetStage}
            onAction={handleAttentionAction}
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
            {emptyTitle}
          </Typography>
          {trimmedQuery && searchSuggestions.length > 0 ? (
            <Box
              sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', alignItems: 'center' }}
            >
              <Typography variant="body2" color="text.secondary">
                Did you mean
              </Typography>
              {searchSuggestions.map((suggestion) => (
                <Chip
                  key={suggestion.id}
                  label={suggestion.name}
                  onClick={() => setSearchQuery(suggestion.name)}
                  sx={{ height: 'auto', minHeight: 48, px: 1, fontWeight: 600, borderRadius: 6 }}
                />
              ))}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {trimmedQuery
                ? 'Try part of the first name, or the email.'
                : filtersActive
                  ? 'Clear the filters to see everyone in this category.'
                  : segment === 'exam_this_year'
                    ? 'Break Year and Class 12 students appear here once their stage is set.'
                    : 'Try another category, or All active to see everyone.'}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap', mt: 1.5 }}>
            {trimmedQuery && examBatchFilter !== 'all' && (
              <Button onClick={() => setExamBatchFilter('all')} sx={{ minHeight: 48, fontWeight: 700 }}>
                Search every exam year
              </Button>
            )}
            {filtersActive && (
              <Button onClick={() => handleFiltersChange({ ...DEFAULT_FILTERS })} sx={{ minHeight: 48, fontWeight: 700 }}>
                Clear filters
              </Button>
            )}
          </Box>
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
              now,
              query: trimmedQuery,
              selectMode,
              selected: selectedIds.has(student.id),
              onToggleSelect: () => toggleSelect(student.id),
              onOpen: () => router.push(`/teacher/students/${student.id}`),
              actions: <StudentRowMenu title={student.name} items={menuItemsFor(student)} />,
            };

            if (viewMode === 'compact') return <CompactRow key={student.id} {...rowProps} />;
            if (viewMode === 'cards') return <StudentCard key={student.id} {...rowProps} />;
            return <DetailedRow key={student.id} {...rowProps} />;
          })}
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

      {fabVisible && (
        <Fab
          color="primary"
          aria-label="Add student"
          onClick={() => setAddOpen(true)}
          sx={{
            display: { xs: 'flex', sm: 'none' },
            position: 'fixed',
            // Clears the mobile bottom navigation, like every other Nexus FAB.
            bottom: 'calc(80px + env(safe-area-inset-bottom))',
            right: 16,
          }}
        >
          <PersonAddAltOutlinedIcon />
        </Fab>
      )}

      <ClassifyDrawer
        open={!!drawer}
        mode={drawer?.mode ?? 'stage'}
        names={drawerNames}
        busy={saving}
        examYears={examYears}
        currentBatch={currentBatch}
        onClose={closeDrawer}
        onApply={(payload) => applyClassification(payload, drawerTargetIds ?? undefined)}
      />

      <PrefillReviewSheet
        open={prefill.open}
        loading={prefill.loading}
        busy={saving}
        suggestions={prefill.suggestions}
        onClose={() => setPrefill({ open: false, loading: false, suggestions: [] })}
        onApply={(assignments) => applyClassification({}, undefined, false, assignments)}
      />

      {activeClassroom && (
        <ApplicationFormSheet
          open={formSheet.open}
          classroomId={activeClassroom.id}
          studentId={formSheet.studentId}
          getToken={getToken}
          onClose={() => setFormSheet({ open: false, studentId: null })}
          onChanged={() => {
            fetchStudents();
            if (canSetStage) loadSuggestions(false);
          }}
        />
      )}

      {activeClassroom && removeTarget && removeTarget.enrollment_id && (
        <RemoveStudentDialog
          open
          onClose={() => setRemoveTarget(null)}
          students={[
            {
              enrollmentId: removeTarget.enrollment_id,
              userId: removeTarget.id,
              name: removeTarget.name,
              email: removeTarget.email,
              avatar_url: removeTarget.avatar_url,
            },
          ]}
          classroomId={activeClassroom.id}
          getToken={getToken}
          onRemoved={() => {
            setSnackbar({ message: `Removed ${removeTarget.name} from this class` });
            fetchStudents();
          }}
        />
      )}

      {activeClassroom && canAddStudents && (
        <AddStudentSheet
          open={addOpen}
          onClose={() => {
            setAddOpen(false);
            setAccountPrefill(null);
            setPasswordPending(false);
          }}
          classroomId={activeClassroom.id}
          getToken={getToken}
          onEnrolled={fetchStudents}
          // For a student already on the roster, only the creator: adding some
          // other directory account is not what anyone opened this for.
          createOnly={!!accountPrefill}
          title={accountPrefill ? 'Create Microsoft account' : 'Add student'}
          guardClose={passwordPending}
          createAccount={
            canCreateAccounts
              ? ({ showExisting }) => (
                  <CreateAccountForm
                    key={accountPrefill?.attachToUserId ?? 'new'}
                    classroomId={activeClassroom.id}
                    getToken={getToken}
                    examYears={examYears}
                    currentBatch={currentBatch}
                    batches={batches}
                    prefill={accountPrefill}
                    onUseExisting={accountPrefill ? undefined : showExisting}
                    onCreated={fetchStudents}
                    onDone={() => {
                      setAddOpen(false);
                      setAccountPrefill(null);
                      setPasswordPending(false);
                    }}
                    onPendingPasswordChange={setPasswordPending}
                  />
                )
              : undefined
          }
        />
      )}

      {canCreateAccounts && (
        <ResetPasswordSheet target={resetTarget} getToken={getToken} onClose={() => setResetTarget(null)} />
      )}

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
          // Above the bottom navigation and the Add button on a phone.
          bottom: { xs: selectMode ? 96 : fabVisible ? 148 : 88, md: selectMode ? 96 : 24 },
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
