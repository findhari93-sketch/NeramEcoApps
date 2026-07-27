'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Box, Typography, Fab, Snackbar, Alert, Button, useMediaQuery, useTheme, Menu, MenuItem, ListItemIcon, ListItemText, ListSubheader } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import HistoryIcon from '@mui/icons-material/History';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DateRangeIcon from '@mui/icons-material/DateRange';
import LinkIcon from '@mui/icons-material/Link';
import PublishIcon from '@mui/icons-material/Publish';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import { Dialog, DialogContent, DialogActions } from '@neram/ui';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useTimetableView } from '@/hooks/useTimetableView';
import GridView from '@/components/timetable/views/GridView';
import DayView from '@/components/timetable/views/DayView';
import MonthView from '@/components/timetable/views/MonthView';
import PlannerWeekList from '@/components/timetable/views/PlannerWeekList';
import CalendarShell from '@/components/timetable/CalendarShell';
import ClassEditPanel from '@/components/timetable/ClassEditPanel';
import LinkAssignmentDialog from '@/components/timetable/LinkAssignmentDialog';
import NewAssignmentDialog from '@/components/assignments/NewAssignmentDialog';
import { useAuthFetch } from '@/components/curriculum/shared';
import ClassCreateDialog from '@/components/timetable/ClassCreateDialog';
import AttendanceSheet from '@/components/timetable/AttendanceSheet';
import BackfillFromTeamsDialog from '@/components/timetable/BackfillFromTeamsDialog';
import ClassAttendanceInsights from '@/components/timetable/ClassAttendanceInsights';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import HolidayManager from '@/components/timetable/HolidayManager';
import RsvpDashboard from '@/components/timetable/RsvpDashboard';
import TimetableNotificationBell from '@/components/timetable/TimetableNotificationBell';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import {
  formatDateISO,
  formatRangeLabel,
  monthGridRangeFor,
  type HolidayInfo,
} from '@/components/timetable/date-utils';
import { type PlanShape } from '@/lib/plan-shape';

interface ClassroomOption {
  id: string;
  name: string;
  type: string;
  ms_team_id?: string | null;
  academic_year?: string | null;
}

/** "Mon, 20 Jul". Built in IST so a late-evening class does not shift a day. */
function formatDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function TeacherTimetable() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { activeClassroom, classrooms, getToken, getTeacherToken } = useNexusAuthContext();
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const [classes, setClasses] = useState<ClassCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [planShapes, setPlanShapes] = useState<PlanShape[]>([]);
  // Plan is the teacher default: they arrive to build a week, not read one.
  const viewState = useTimetableView(classes, 'agenda', planShapes);

  // The plan governing the visible week, so "Class hours and days" can open the
  // right one instead of dropping the teacher on the plans index to hunt.
  const activePlanId = planShapes[0]?.id ?? null;
  const activePlanName = planShapes.length === 1 ? planShapes[0].title : null;
  const { week, band, view, anchorDate, setAnchorDate, range, configuredWindow } = viewState;

  /** "20-26 Jul", so Publish names the week even from Month view. */
  const weekRangeLabel = useMemo(
    () => formatRangeLabel('week', week.allDays).shortLabel,
    [week],
  );


  // Planner state
  const [panelClass, setPanelClass] = useState<ClassCardData | null>(null);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  // Attaching work to a class. Both routes in (the card's "+ Assignment" and the
  // panel's buttons) share these, so linking behaves the same either way.
  const [assignmentMenuAnchor, setAssignmentMenuAnchor] = useState<HTMLElement | null>(null);
  const [assignmentMenuClass, setAssignmentMenuClass] = useState<ClassCardData | null>(null);
  const [linkDialogClass, setLinkDialogClass] = useState<ClassCardData | null>(null);
  const [newAssignmentClass, setNewAssignmentClass] = useState<ClassCardData | null>(null);
  const [assignmentRefreshKey, setAssignmentRefreshKey] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [classroomOptions, setClassroomOptions] = useState<ClassroomOption[]>([]);
  // Pre-fill data for calendar slot click
  const [prefillDate, setPrefillDate] = useState<string>('');
  const [prefillTime, setPrefillTime] = useState<string>('');

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassCardData | null>(null);
  const [attendanceClass, setAttendanceClass] = useState<ClassCardData | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [insightsClass, setInsightsClass] = useState<ClassCardData | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);
  const [holidayManagerOpen, setHolidayManagerOpen] = useState(false);
  const [rsvpDashboardOpen, setRsvpDashboardOpen] = useState(false);
  const [rsvpDashboardClassId, setRsvpDashboardClassId] = useState<string | undefined>();

  // Holidays
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});

  /** Dots on the mini calendar and the day strip. */
  const markedDates = useMemo(() => new Set(classes.map((c) => c.scheduled_date)), [classes]);
  const holidayDates = useMemo(() => new Set(Object.keys(holidays)), [holidays]);

  // RSVP data
  const [rsvpData, setRsvpData] = useState<Record<string, { attending: number; total: number }>>({});
  // Real Teams/manual attendance, for past classes only (cheap DB-only read, no Graph call).
  const [attendanceData, setAttendanceData] = useState<Record<string, { present: number; total: number }>>({});
  // Rating data
  const [averageRatings, setAverageRatings] = useState<Record<string, number>>({});

  // The toolbar's "New" split button: class, holiday or a whole imported week.
  const [newMenuAnchor, setNewMenuAnchor] = useState<HTMLElement | null>(null);

  // Slot action menu
  const [slotMenuAnchor, setSlotMenuAnchor] = useState<HTMLElement | null>(null);
  const [slotMenuDate, setSlotMenuDate] = useState('');
  const [slotMenuTime, setSlotMenuTime] = useState('');

  // Snackbar
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' | 'warning' | 'info' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  /**
   * Always load a whole month grid, whatever the view is showing.
   *
   * The endpoint already takes an arbitrary range, so this costs no API change,
   * and it turns week paging and week/month switching inside a loaded month
   * into zero requests. Given the per-class fan-out below, that is a large net
   * reduction in function invocations, not an increase.
   */
  const fetchRange = useMemo(
    () => monthGridRangeFor(anchorDate, range.start, range.end),
    [anchorDate, range.start, range.end],
  );

  /**
   * What is already in `classes`. Guards the refetch on navigation.
   *
   * Every mutation must call fetchClasses(true): without the force flag this
   * cache silently swallows the refresh after publishing, cancelling or syncing.
   */
  const loadedRange = useRef<{ classroomId: string; start: string; end: string } | null>(null);

  const fetchClasses = useCallback(async (force = false) => {
    if (!activeClassroom) return;

    const have = loadedRange.current;
    const covered =
      !force &&
      have !== null &&
      have.classroomId === activeClassroom.id &&
      have.start <= fetchRange.start &&
      have.end >= fetchRange.end;
    if (covered) return;

    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom.id}&start=${fetchRange.start}&end=${fetchRange.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setClasses(data.classes || []);
        setPlanShapes(data.planShapes || []);
        loadedRange.current = {
          classroomId: activeClassroom.id,
          start: fetchRange.start,
          end: fetchRange.end,
        };
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, fetchRange.start, fetchRange.end, getToken]);

  const loadedHolidayRange = useRef<{ classroomId: string; start: string; end: string } | null>(null);

  const fetchHolidays = useCallback(async (force = false) => {
    if (!activeClassroom) return;

    const have = loadedHolidayRange.current;
    if (
      !force &&
      have !== null &&
      have.classroomId === activeClassroom.id &&
      have.start <= fetchRange.start &&
      have.end >= fetchRange.end
    ) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${fetchRange.start}&end=${fetchRange.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const map: Record<string, HolidayInfo> = {};
        for (const h of data.holidays || []) {
          map[h.holiday_date] = { title: h.title, description: h.description };
        }
        setHolidays(map);
        loadedHolidayRange.current = {
          classroomId: activeClassroom.id,
          start: fetchRange.start,
          end: fetchRange.end,
        };
      }
    } catch {
      // ignore
    }
  }, [activeClassroom, fetchRange.start, fetchRange.end, getToken]);

  const fetchRsvpAndRatings = async (fetchedClasses: ClassCardData[], token: string) => {
    if (!activeClassroom || fetchedClasses.length === 0) return;

    // Use the fetched classes directly to get classroom_id (state may not be updated yet)
    const getClassroomId = (classId: string): string => {
      const cls = fetchedClasses.find((c) => c.id === classId);
      return (cls as unknown as Record<string, unknown>)?.classroom_id as string || cls?.classroom?.id || activeClassroom.id;
    };

    const classIds = fetchedClasses.map((c) => c.id);

    const rsvpPromises = classIds.map((id) => {
      const cid = getClassroomId(id);
      return fetch(`/api/timetable/rsvp?class_id=${id}&classroom_id=${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null);
    });

    const ratingPromises = classIds.map((id) => {
      const cid = getClassroomId(id);
      return fetch(`/api/timetable/reviews?class_id=${id}&classroom_id=${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null);
    });

    // Real attendance is only meaningful once a class has ended, and the fetch
    // itself is a plain DB read (no Graph call), so it's cheap to include here.
    const ensureSec = (t: string) => (t && t.length === 5 ? `${t}:00` : t);
    const pastClassIds = classIds.filter((id) => {
      const c = fetchedClasses.find((fc) => fc.id === id);
      if (!c || c.status === 'cancelled') return false;
      const endMs = new Date(`${c.scheduled_date}T${ensureSec(c.end_time)}+05:30`).getTime();
      return !Number.isNaN(endMs) && Date.now() > endMs;
    });

    const attendancePromises = pastClassIds.map((id) => {
      const cid = getClassroomId(id);
      return fetch(`/api/timetable/attendance-report?class_id=${id}&classroom_id=${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null);
    });

    const [rsvpResults, ratingResults, attendanceResults] = await Promise.all([
      Promise.all(rsvpPromises),
      Promise.all(ratingPromises),
      Promise.all(attendancePromises),
    ]);

    const rsvpMap: Record<string, { attending: number; total: number }> = {};
    const ratingMap: Record<string, number> = {};
    const attendanceMap: Record<string, { present: number; total: number }> = {};

    classIds.forEach((id, i) => {
      if (rsvpResults[i]?.summary) {
        rsvpMap[id] = rsvpResults[i].summary;
      }
      if (ratingResults[i]?.summary?.average) {
        ratingMap[id] = ratingResults[i].summary.average;
      }
    });

    pastClassIds.forEach((id, i) => {
      if (attendanceResults[i]?.summary) {
        attendanceMap[id] = attendanceResults[i].summary;
      }
    });

    setRsvpData(rsvpMap);
    setAverageRatings(ratingMap);
    setAttendanceData(attendanceMap);
  };

  // Navigation only: the range guards inside decide whether a request is
  // actually needed, so paging weeks inside a loaded month costs nothing.
  useEffect(() => {
    fetchClasses();
    fetchHolidays();
  }, [fetchClasses, fetchHolidays]);

  /**
   * What the current view actually draws. `classes` holds the whole loaded
   * month, so everything downstream, the views and the per-class fan-out alike,
   * works from this instead.
   */
  const visibleClasses = useMemo(
    () => classes.filter((c) => c.scheduled_date >= range.start && c.scheduled_date <= range.end),
    [classes, range.start, range.end],
  );

  /**
   * The per-class fan-out, deliberately kept off the month.
   *
   * This is three to four requests per class. Over a week that is fine; over a
   * month it would be ninety-odd function invocations for numbers no month chip
   * has room to show anyway.
   */
  useEffect(() => {
    if (view === 'month' || visibleClasses.length === 0) return;
    let cancelled = false;
    (async () => {
      const token = await getToken();
      if (!token || cancelled) return;
      fetchRsvpAndRatings(visibleClasses, token);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, visibleClasses, getToken]);

  /** Re-pull one class's attendance summary, so the detail panel reflects a sync/manual-mark made in the Attendance sheet without re-fetching the whole week. */
  const refreshAttendanceSummary = async (classId: string, classroomId: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/attendance-report?class_id=${classId}&classroom_id=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        if (data.summary) {
          setAttendanceData((prev) => ({ ...prev, [classId]: data.summary }));
        }
      }
    } catch {
      // panel just keeps showing the stale/"not synced" summary
    }
  };

  // How many drafts are waiting in this week, so the Publish button can say so.
  const fetchDraftCount = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(
        `/api/timetable/publish-week?classroom_id=${activeClassroom.id}&week_start=${week.start}&week_end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) setDraftCount((await res.json()).count || 0);
    } catch {
      /* the button just hides */
    }
  }, [activeClassroom, week.start, week.end, getToken]);

  useEffect(() => {
    fetchDraftCount();
  }, [fetchDraftCount, classes]);

  // Assignment counts for the planner tags. One request per class, but only for
  // the handful in view, and only on the planner.
  useEffect(() => {
    if (view !== 'agenda' || visibleClasses.length === 0) return;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) return;
      const entries = await Promise.all(
        visibleClasses.map(async (c) => {
          try {
            const res = await fetch(`/api/timetable/${c.id}/assignments`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return [c.id, 0] as const;
            const data = await res.json();
            return [c.id, (data.assignments || []).length] as const;
          } catch {
            return [c.id, 0] as const;
          }
        }),
      );
      if (!cancelled) setAssignmentCounts(Object.fromEntries(entries));
    })();

    return () => {
      cancelled = true;
    };
  }, [view, visibleClasses, getToken, assignmentRefreshKey]);

  /** Linking or creating changed the picture: refresh the tags and the panel. */
  const refreshAssignments = useCallback(() => {
    setAssignmentRefreshKey((k) => k + 1);
  }, []);

  const openAssignmentMenu = (cls: ClassCardData, anchor: HTMLElement) => {
    setAssignmentMenuClass(cls);
    setAssignmentMenuAnchor(anchor);
  };

  const closeAssignmentMenu = () => {
    setAssignmentMenuAnchor(null);
    setAssignmentMenuClass(null);
  };

  const handlePublishWeek = async () => {
    if (!activeClassroom) return;
    setPublishing(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/timetable/publish-week', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroom_id: activeClassroom.id,
          week_start: week.start,
          week_end: week.end,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        const missing = (data.missingMeeting || []).length;
        setSnackbar({
          open: true,
          message:
            data.published === 0
              ? data.message
              : missing > 0
                ? `Week published to students. ${missing} ${missing === 1 ? 'class still needs' : 'classes still need'} a Teams meeting.`
                : `Week published to students. ${data.published} ${data.published === 1 ? 'class is' : 'classes are'} now visible.`,
          severity: missing > 0 ? 'warning' : 'success',
        });
        fetchClasses(true);
        fetchDraftCount();
      } else {
        setSnackbar({ open: true, message: data.error || 'Could not publish the week', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Could not publish the week', severity: 'error' });
    } finally {
      setPublishing(false);
    }
  };

  // Classroom options for the Add Class dialog's multi-select. Load ALL active
  // classrooms (not just the ones the user is enrolled in) so an admin/teacher can
  // target individual cohorts; fall back to the enrolled list if the fetch fails.
  // Common cohort first, then the rest by name. Batch granularity was dropped; the
  // dialog loads its own Course Plan topics per selection.
  useEffect(() => {
    let cancelled = false;
    const orderCommonFirst = (list: ClassroomOption[]) =>
      [...list].sort((a, b) => {
        if ((a.type === 'common') !== (b.type === 'common')) return a.type === 'common' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    const fallback: ClassroomOption[] = classrooms.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      ms_team_id: c.ms_team_id,
      academic_year: (c as unknown as { academic_year?: string | null }).academic_year ?? null,
    }));

    async function loadClassrooms() {
      try {
        const token = await getToken();
        if (!token) {
          if (!cancelled) setClassroomOptions(orderCommonFirst(fallback));
          return;
        }
        const res = await fetch('/api/classrooms', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) setClassroomOptions(orderCommonFirst(fallback));
          return;
        }
        const data = await res.json();
        const all: ClassroomOption[] = (data.classrooms || []).map((c: {
          id: string; name: string; type: string; ms_team_id?: string | null; academic_year?: string | null;
        }) => ({ id: c.id, name: c.name, type: c.type, ms_team_id: c.ms_team_id, academic_year: c.academic_year ?? null }));
        if (!cancelled) setClassroomOptions(orderCommonFirst(all.length ? all : fallback));
      } catch {
        if (!cancelled) setClassroomOptions(orderCommonFirst(fallback));
      }
    }
    loadClassrooms();
    return () => {
      cancelled = true;
    };
  }, [classrooms, getToken]);

  // Auto-sync from Teams when page loads (background, non-blocking, 5-min cooldown)
  useEffect(() => {
    if (!activeClassroom?.ms_team_id) return;

    const cacheKey = `nexus_last_teams_sync_${activeClassroom.id}`;
    const lastSync = typeof window !== 'undefined' ? sessionStorage.getItem(cacheKey) : null;
    const COOLDOWN_MS = 5 * 60 * 1000;

    if (lastSync && Date.now() - parseInt(lastSync) < COOLDOWN_MS) return;

    (async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/timetable/sync-from-teams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ classroom_id: activeClassroom.id, quick: true }),
        });

        if (typeof window !== 'undefined') {
          sessionStorage.setItem(cacheKey, Date.now().toString());
        }

        if (res.ok) {
          const data = await res.json();
          if (data.imported > 0) {
            setSnackbar({ open: true, message: `Auto-imported ${data.imported} meeting(s) from Teams`, severity: 'info' });
            fetchClasses(true);
          }
        }
      } catch {
        // Silent — background sync should not disrupt the user
      }
    })();
  }, [activeClassroom?.id, activeClassroom?.ms_team_id, getToken]);

  const handleClassClick = (cls: ClassCardData) => {
    setSelectedClass(cls);
  };

  const handleEdit = (cls: ClassCardData) => {
    setSelectedClass(null);
    setEditingClass(cls);
    setCreateDialogOpen(true);
  };

  // Find the actual classroom_id for a class (may differ from activeClassroom for Common Classes)
  const getClassroomIdForClass = (classId: string): string => {
    const cls = classes.find((c) => c.id === classId);
    // Use the class's own classroom_id (from API's SELECT *), fall back to activeClassroom
    return (cls as unknown as Record<string, unknown>)?.classroom_id as string || cls?.classroom?.id || activeClassroom?.id || '';
  };

  const handleDelete = async (classId: string) => {
    if (!activeClassroom) return;
    const classroomId = getClassroomIdForClass(classId);
    try {
      // Use teacher token (extended scopes) for cancel — needs Calendars.ReadWrite to delete Teams events
      const token = await getTeacherToken();
      if (!token) return;

      const res = await fetch('/api/timetable', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: classId, classroom_id: classroomId }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSelectedClass(null);
        if (data.teamsWarning) {
          setSnackbar({ open: true, message: `Class cancelled, but: ${data.teamsWarning}`, severity: 'warning' });
        } else {
          setSnackbar({ open: true, message: 'Class cancelled', severity: 'success' });
        }
        fetchClasses(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to cancel class', severity: 'error' });
      }
    } catch (err) {
      console.error('Failed to cancel class:', err);
      setSnackbar({ open: true, message: 'Failed to cancel class', severity: 'error' });
    }
  };

  const handleDeletePermanent = async (classId: string) => {
    if (!activeClassroom) return;
    const classroomId = getClassroomIdForClass(classId);
    try {
      // Use teacher token (extended scopes) for delete — needs Calendars.ReadWrite to delete Teams events
      const token = await getTeacherToken();
      if (!token) return;

      const res = await fetch('/api/timetable', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: classId, classroom_id: classroomId, permanent: true }),
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSelectedClass(null);
        if (data.teamsWarning) {
          setSnackbar({ open: true, message: `Class deleted, but: ${data.teamsWarning}`, severity: 'warning' });
        } else {
          setSnackbar({ open: true, message: 'Class permanently deleted', severity: 'success' });
        }
        fetchClasses(true);
      }
    } catch (err) {
      console.error('Failed to delete class:', err);
      setSnackbar({ open: true, message: 'Failed to delete class', severity: 'error' });
    }
  };

  const handleSyncRecording = async (cls: ClassCardData) => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/timetable/recording', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: cls.id,
          classroom_id: cls.classroom?.id || getClassroomIdForClass(cls.id),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: data.found ? 'Recording synced!' : 'No recording found yet',
          severity: 'success',
        });
        fetchClasses(true);
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to sync recording', severity: 'error' });
    }
  };

  const handleViewRsvpDashboard = (classId: string) => {
    setRsvpDashboardClassId(classId);
    setRsvpDashboardOpen(true);
  };

  const handleSyncMembers = async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Syncing members to Teams...', severity: 'success' });

      const res = await fetch(`/api/classrooms/${activeClassroom.id}/sync-members`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `Sync complete: ${data.added} added, ${data.alreadyInTeam} already in team, ${data.skipped} skipped`,
          severity: 'success',
        });
      } else {
        setSnackbar({ open: true, message: data.error || 'Sync failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to sync members', severity: 'error' });
    }
  };

  const handleSyncFromTeams = async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Importing meetings from Teams...', severity: 'success' });

      const res = await fetch('/api/timetable/sync-from-teams', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ classroom_id: activeClassroom.id }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar({
          open: true,
          message: `Imported ${data.imported} meeting(s), ${data.skipped} already existed`,
          severity: 'success',
        });
        if (data.imported > 0) fetchClasses(true);
      } else {
        setSnackbar({ open: true, message: data.error || 'Import failed', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to import from Teams', severity: 'error' });
    }
  };

  const handleCreateMeeting = async (cls: ClassCardData) => {
    if (!activeClassroom) return;
    setSelectedClass(null);
    try {
      const token = await getTeacherToken();
      if (!token) return;

      setSnackbar({ open: true, message: 'Creating Teams meeting...', severity: 'success' });

      const res = await fetch('/api/timetable/teams-meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          class_id: cls.id,
          classroom_id: cls.classroom?.id || activeClassroom.id,
          auto: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSnackbar(
          data.degraded
            ? { open: true, message: data.note || 'Meeting link created (standalone).', severity: 'info' }
            : {
                open: true,
                message: data.alreadyExists ? 'Meeting already exists' : 'Teams meeting created!',
                severity: 'success',
              },
        );
        fetchClasses(true);
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to create meeting', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to create meeting', severity: 'error' });
    }
  };

  const handleMeetingError = (error: string) => {
    setSnackbar({ open: true, message: error, severity: 'error' });
  };

  /** Background meeting creation — fired after dialog closes */
  const handleCreateMeetingInBackground = async (classId: string, classroomId: string, meetingScope?: string) => {
    setSnackbar({ open: true, message: 'Setting up Teams meeting...', severity: 'success' });
    try {
      const token = await getTeacherToken();
      if (!token) {
        setSnackbar({ open: true, message: 'Please sign in again to create Teams meetings (extended permissions needed)', severity: 'error' });
        return;
      }

      // If scope is 'auto' or not provided, use auto: true; otherwise pass explicit scope
      const meetingBody: Record<string, unknown> = { class_id: classId, classroom_id: classroomId };
      if (!meetingScope || meetingScope === 'auto') {
        meetingBody.auto = true;
      } else {
        meetingBody.scope = meetingScope;
      }

      const res = await fetch('/api/timetable/teams-meeting', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(meetingBody),
      });
      const data = await res.json();
      if (res.ok) {
        setSnackbar(
          data.degraded
            ? { open: true, message: data.note || 'Meeting link created (standalone).', severity: 'info' }
            : { open: true, message: 'Teams meeting created!', severity: 'success' },
        );
        fetchClasses(true);
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to create Teams meeting', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to create Teams meeting', severity: 'error' });
    }
  };

  const handleSlotClick = (date: string, startTime: string, event?: React.MouseEvent) => {
    setSlotMenuDate(date);
    setSlotMenuTime(startTime);
    setPrefillDate(date);
    setPrefillTime(startTime);
    // Show context menu at click position
    if (event) {
      setSlotMenuAnchor(event.currentTarget as HTMLElement);
    } else {
      // Fallback: open create dialog directly
      setEditingClass(null);
      setCreateDialogOpen(true);
    }
  };

  const handleSlotMenuCreateClass = () => {
    setSlotMenuAnchor(null);
    setEditingClass(null);
    setCreateDialogOpen(true);
  };

  const handleSlotMenuMarkHoliday = () => {
    setSlotMenuAnchor(null);
    setHolidayManagerOpen(true);
  };

  const getClassesOnDate = (date: string) => {
    return classes
      .filter((c) => c.scheduled_date === date && c.status !== 'cancelled')
      .map((c) => ({ id: c.id, title: c.title, start_time: c.start_time, end_time: c.end_time }));
  };

  const handleCancelClassForHoliday = async (classId: string) => {
    if (!activeClassroom) return;
    const token = await getToken();
    if (!token) return;

    const res = await fetch('/api/timetable', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id: classId, classroom_id: getClassroomIdForClass(classId) }),
    });

    if (!res.ok) {
      throw new Error('Failed to cancel class');
    }
  };

  const handleRemoveHolidayForClass = async (date: string) => {
    if (!activeClassroom) return;
    const token = await getToken();
    if (!token) return;

    // Find the holiday id for this date
    const res = await fetch(
      `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${date}&end=${date}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.ok) {
      const data = await res.json();
      const holiday = (data.holidays || []).find((h: { holiday_date: string }) => h.holiday_date === date);
      if (holiday) {
        const delRes = await fetch('/api/timetable/holidays', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ id: holiday.id, classroom_id: activeClassroom.id }),
        });

        if (!delRes.ok) throw new Error('Failed to remove holiday');
        fetchHolidays(true);
      }
    }
  };

  const openCreateDialog = (date = '', time = '') => {
    setEditingClass(null);
    setPrefillDate(date);
    setPrefillTime(time);
    setCreateDialogOpen(true);
  };

  /**
   * Everything that used to be the "More" button's menu, unchanged apart from
   * Publish now naming its week: in Month view the teacher can no longer see
   * which week they would be publishing.
   */
  const overflowMenu = (close: () => void) => [
    <MenuItem key="upload" onClick={() => { close(); router.push('/teacher/timetable/import'); }} sx={{ minHeight: 48 }}>
      <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
      <ListItemText>Upload week</ListItemText>
    </MenuItem>,
    draftCount > 0 ? (
      <MenuItem key="publish" onClick={() => { close(); handlePublishWeek(); }} disabled={publishing} sx={{ minHeight: 48 }}>
        <ListItemIcon><PublishIcon fontSize="small" color="primary" /></ListItemIcon>
        <ListItemText
          primary={publishing ? 'Publishing...' : `Publish ${weekRangeLabel}`}
          secondary={`${draftCount} draft${draftCount === 1 ? '' : 's'} waiting`}
        />
      </MenuItem>
    ) : null,
    <MenuItem key="holiday" onClick={() => { close(); setHolidayManagerOpen(true); }} sx={{ minHeight: 48 }}>
      <ListItemIcon><EventBusyIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary="Mark a holiday" secondary="Or tap an empty day" />
    </MenuItem>,
    <MenuItem key="rsvp" onClick={() => { close(); setRsvpDashboardClassId(undefined); setRsvpDashboardOpen(true); }} sx={{ minHeight: 48 }}>
      <ListItemIcon><AssessmentIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary="Who is attending" secondary="Opt-outs across the week" />
    </MenuItem>,
    <MenuItem key="recordings" onClick={() => { close(); router.push('/teacher/recordings'); }} sx={{ minHeight: 48 }}>
      <ListItemIcon><SmartDisplayOutlinedIcon fontSize="small" /></ListItemIcon>
      <ListItemText primary="Recordings" secondary="Search past classes by tag" />
    </MenuItem>,
    activeClassroom?.ms_team_id ? (
      <ListSubheader key="teams-head" sx={{ lineHeight: '32px', fontSize: '0.6875rem', letterSpacing: '.08em' }}>
        TEAMS
      </ListSubheader>
    ) : null,
    activeClassroom?.ms_team_id ? (
      <MenuItem key="sync-members" onClick={() => { close(); handleSyncMembers(); }} sx={{ minHeight: 48 }}>
        <ListItemIcon><SyncIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary="Sync members" secondary="Add enrolled students to the Team" />
      </MenuItem>
    ) : null,
    activeClassroom?.ms_team_id ? (
      <MenuItem key="import-teams" onClick={() => { close(); handleSyncFromTeams(); }} sx={{ minHeight: 48 }}>
        <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary="Import from Teams" secondary="Pull meetings already scheduled there" />
      </MenuItem>
    ) : null,
    // "Import from Teams" above stays the one-tap quick path. This is the
    // deliberate one: pick a range, review what was found, then write.
    activeClassroom?.ms_team_id ? (
      <MenuItem key="backfill" onClick={() => { close(); setBackfillOpen(true); }} sx={{ minHeight: 48 }}>
        <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon>
        <ListItemText primary="Backfill from Teams" secondary="Past classes, recordings and attendance" />
      </MenuItem>
    ) : null,
  ];

  /* Class hours live on the course plan, which already owns the dates that make
     a season a season. There is no second place to set them, and it sits in the
     view menu because it is what "time scale" means here. */
  const viewMenuExtras = (close: () => void) => (
    <MenuItem
      onClick={() => {
        close();
        router.push(activePlanId ? `/teacher/course-plans/${activePlanId}` : '/teacher/course-plans');
      }}
      sx={{ minHeight: 44 }}
    >
      <ListItemIcon sx={{ minWidth: 32 }}><DateRangeIcon fontSize="small" /></ListItemIcon>
      <ListItemText
        primary="Class hours and days"
        secondary={activePlanName ? `On the course plan, ${activePlanName}` : 'On the course plan'}
      />
    </MenuItem>
  );

  const toolbarActions = (
    <>
      {activeClassroom && (
        <Box sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          <TimetableNotificationBell classroomId={activeClassroom.id} getToken={getToken} />
        </Box>
      )}
      <Button
        variant="contained"
        onClick={(e) => setNewMenuAnchor(e.currentTarget)}
        startIcon={<AddIcon />}
        endIcon={<ExpandMoreIcon />}
        aria-haspopup="menu"
        data-testid="cal-new"
        sx={{
          display: { xs: 'none', sm: 'inline-flex' },
          minHeight: 44,
          ml: 0.5,
          textTransform: 'none',
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        New
      </Button>
      <Menu
        anchorEl={newMenuAnchor}
        open={Boolean(newMenuAnchor)}
        onClose={() => setNewMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 220 } }}
      >
        <MenuItem onClick={() => { setNewMenuAnchor(null); openCreateDialog(); }} sx={{ minHeight: 48 }}>
          <ListItemIcon><EventIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Class</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setNewMenuAnchor(null); setHolidayManagerOpen(true); }} sx={{ minHeight: 48 }}>
          <ListItemIcon><EventBusyIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Holiday</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { setNewMenuAnchor(null); router.push('/teacher/timetable/import'); }} sx={{ minHeight: 48 }}>
          <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Import a week</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );

  /* The Teams "My calendars" slot. Not a classroom list, since the TopBar
     already switches classrooms: the useful week context instead. */
  const railFooter = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography
        sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '.08em', color: 'text.disabled' }}
      >
        THIS WEEK
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {draftCount > 0
          ? `${draftCount} draft${draftCount === 1 ? '' : 's'} waiting`
          : 'Everything published'}
      </Typography>
      {draftCount > 0 && (
        <Button
          size="small"
          variant="outlined"
          onClick={handlePublishWeek}
          disabled={publishing}
          startIcon={<PublishIcon fontSize="small" />}
          sx={{ alignSelf: 'flex-start', minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        >
          {publishing ? 'Publishing...' : `Publish ${weekRangeLabel}`}
        </Button>
      )}
      {activePlanName && (
        <Typography variant="caption" color="text.disabled">
          {activePlanName}
        </Typography>
      )}
    </Box>
  );

  return (
    <Box sx={{ position: 'relative' }}>
      <CalendarShell
        state={viewState}
        agendaLabel="Plan"
        railSubtitle={activeClassroom?.name}
        railFooter={railFooter}
        markedDates={markedDates}
        holidayDates={holidayDates}
        toolbarActions={toolbarActions}
        overflowMenu={overflowMenu}
        viewMenuExtras={viewMenuExtras}
      >
        {view === 'month' && range.month ? (
          <MonthView
            classes={visibleClasses}
            month={range.month}
            loading={loading}
            holidays={holidays}
            role="teacher"
            anchorISO={formatDateISO(anchorDate)}
            onClassClick={handleClassClick}
            onOpenDay={(iso) => {
              setAnchorDate(new Date(`${iso}T00:00:00`));
              viewState.setView('day');
            }}
            onDayMenu={(iso, e) => handleSlotClick(iso, configuredWindow.start, e)}
          />
        ) : view === 'week' ? (
          <GridView
            classes={visibleClasses}
            week={week}
            band={band}
            loading={loading}
            holidays={holidays}
            role="teacher"
            onSlotClick={handleSlotClick}
            onClassClick={handleClassClick}
            rsvpData={rsvpData}
          />
        ) : view === 'day' ? (
          <DayView
            classes={visibleClasses}
            week={week}
            anchorDate={anchorDate}
            band={band}
            onSelectDate={setAnchorDate}
            loading={loading}
            holidays={holidays}
            role="teacher"
            onSlotClick={handleSlotClick}
            onClassClick={handleClassClick}
            rsvpData={rsvpData}
          />
        ) : (
          <Box
            sx={{
              display: 'flex',
              // Side by side once there is room for the 340px rail, stacked
              // below that with the whole column scrolling as one.
              flexDirection: { xs: 'column', lg: 'row' },
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              overflowY: { xs: 'auto', lg: 'hidden' },
            }}
          >
            <PlannerWeekList
              classes={visibleClasses}
              week={week}
              loading={loading}
              holidays={holidays}
              selectedId={panelClass?.id ?? null}
              assignmentCounts={assignmentCounts}
              onSelect={setPanelClass}
              onAssignmentClick={openAssignmentMenu}
              onAddClass={(date) => openCreateDialog(date)}
            />
            <Box
              sx={{
                flex: '0 0 auto',
                width: { xs: 'auto', lg: 340 },
                minHeight: 0,
                overflowY: { xs: 'visible', lg: 'auto' },
                borderLeft: { lg: `1px solid ${theme.palette.divider}` },
                borderTop: { xs: `1px solid ${theme.palette.divider}`, lg: 'none' },
                p: 2,
                pb: { xs: 9, lg: 2 },
              }}
            >
              <ClassEditPanel
                cls={panelClass}
                getToken={getToken}
                getTeacherToken={getTeacherToken}
                refreshKey={assignmentRefreshKey}
                onCreateMeeting={handleCreateMeeting}
                onCreateAssignment={setNewAssignmentClass}
                onLinkExisting={setLinkDialogClass}
                onChanged={fetchClasses}
                onNotify={(message, severity = 'success') =>
                  setSnackbar({ open: true, message, severity })
                }
              />
            </Box>
          </Box>
        )}
      </CalendarShell>

      {/* Mobile only: the toolbar's New button is the desktop equivalent, and
          two identical actions on one screen is one too many. */}
      {!isDesktop && (
        <Fab
          color="primary"
          aria-label="Schedule a class"
          onClick={() => openCreateDialog()}
          sx={{ position: 'fixed', bottom: 80, right: 16, width: 56, height: 56, zIndex: 2 }}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Class Detail Panel */}
      <ClassDetailPanel
        cls={selectedClass}
        open={!!selectedClass}
        onClose={() => setSelectedClass(null)}
        role="teacher"
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        rsvpSummary={selectedClass ? rsvpData[selectedClass.id] : null}
        attendanceSummary={selectedClass ? attendanceData[selectedClass.id] : null}
        averageRating={selectedClass ? averageRatings[selectedClass.id] : null}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeletePermanent={handleDeletePermanent}
        onViewAttendance={setAttendanceClass}
        onViewInsights={setInsightsClass}
        onSyncRecording={handleSyncRecording}
        onViewRsvpDashboard={handleViewRsvpDashboard}
        onCreateMeeting={handleCreateMeeting}
      />

      {/* Create/Edit Dialog */}
      <ClassCreateDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setEditingClass(null);
          setPrefillDate('');
          setPrefillTime('');
        }}
        editingClass={editingClass}
        classrooms={classroomOptions}
        defaultClassroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onSaved={() => {
          setSnackbar({ open: true, message: editingClass ? 'Class updated' : 'Class created', severity: 'success' });
          fetchClasses(true);
          fetchHolidays();
          setPrefillDate('');
          setPrefillTime('');
        }}
        prefillDate={prefillDate}
        prefillTime={prefillTime}
        holidays={holidays}
        onRemoveHoliday={handleRemoveHolidayForClass}
        onMeetingError={handleMeetingError}
        onCreateMeetingInBackground={handleCreateMeetingInBackground}
      />

      {/* Holiday Manager */}
      <HolidayManager
        open={holidayManagerOpen}
        onClose={() => setHolidayManagerOpen(false)}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onHolidaysChanged={() => { fetchHolidays(true); fetchClasses(true); }}
        getClassesOnDate={getClassesOnDate}
        onCancelClass={handleCancelClassForHoliday}
        prefillDate={prefillDate}
      />

      {/* RSVP Dashboard */}
      {/* The range follows what is on screen: asked from Month view, "who is
          attending" should answer for the month, not for one week of it. */}
      <RsvpDashboard
        open={rsvpDashboardOpen}
        onClose={() => {
          setRsvpDashboardOpen(false);
          setRsvpDashboardClassId(undefined);
        }}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        classId={rsvpDashboardClassId}
        startDate={range.start}
        endDate={range.end}
      />

      {/* Attendance Sheet */}
      {attendanceClass && (
        <AttendanceSheet
          open={!!attendanceClass}
          onClose={() => {
            refreshAttendanceSummary(attendanceClass.id, activeClassroom?.id || '');
            setAttendanceClass(null);
          }}
          classId={attendanceClass.id}
          classTitle={attendanceClass.title}
          classroomId={activeClassroom?.id || ''}
          teamsMeetingId={attendanceClass.teams_meeting_id}
          getToken={getToken}
        />
      )}

      {activeClassroom && (
        <BackfillFromTeamsDialog
          open={backfillOpen}
          onClose={() => setBackfillOpen(false)}
          classroomId={activeClassroom.id}
          classroomName={activeClassroom.name}
          getToken={getToken}
          onApplied={fetchClasses}
          onNotify={(message, severity) =>
            setSnackbar({ open: true, message, severity: severity ?? 'success' })
          }
        />
      )}

      {insightsClass && (
        <ClassAttendanceInsights
          open={!!insightsClass}
          onClose={() => setInsightsClass(null)}
          classId={insightsClass.id}
          classroomId={insightsClass.classroom?.id || activeClassroom?.id || ''}
          classTitle={insightsClass.title}
          getToken={getToken}
        />
      )}

      {/* "+ Assignment" on a planner card. Asks which of the two things you
          meant, then does it here. Neither route leaves the timetable. */}
      <Menu
        anchorEl={assignmentMenuAnchor}
        open={!!assignmentMenuAnchor}
        onClose={closeAssignmentMenu}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <MenuItem
          onClick={() => {
            const cls = assignmentMenuClass;
            closeAssignmentMenu();
            if (cls) setLinkDialogClass(cls);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <LinkIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText
            primary="Link existing"
            secondary="An assignment you already made"
          />
        </MenuItem>
        <MenuItem
          onClick={() => {
            const cls = assignmentMenuClass;
            closeAssignmentMenu();
            if (cls) setNewAssignmentClass(cls);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon>
            <AddIcon fontSize="small" color="primary" />
          </ListItemIcon>
          <ListItemText primary="Create new" secondary="Write it now, without leaving" />
        </MenuItem>
      </Menu>

      <LinkAssignmentDialog
        open={!!linkDialogClass}
        cls={linkDialogClass}
        getToken={getToken}
        onClose={() => setLinkDialogClass(null)}
        onLinked={refreshAssignments}
        onCreateInstead={setNewAssignmentClass}
        onNotify={(message, severity = 'success') =>
          setSnackbar({ open: true, message, severity })
        }
      />

      {/* The same dialog the Assignments page uses, opened in place. */}
      {newAssignmentClass && (
        <NewAssignmentDialog
          open
          onClose={() => setNewAssignmentClass(null)}
          classroomId={newAssignmentClass.classroom?.id || activeClassroom?.id || ''}
          authFetch={authFetch}
          getToken={getTeacherToken}
          scheduledClassId={newAssignmentClass.id}
          classContextLabel={`${newAssignmentClass.title}, ${formatDayLabel(newAssignmentClass.scheduled_date)}`}
          onCreated={refreshAssignments}
        />
      )}

      {/* Slot action menu (create class or mark holiday) */}
      <Menu
        anchorEl={slotMenuAnchor}
        open={!!slotMenuAnchor}
        onClose={() => setSlotMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MenuItem onClick={handleSlotMenuCreateClass}>
          <ListItemIcon><EventIcon fontSize="small" color="primary" /></ListItemIcon>
          <ListItemText>Schedule a Class</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleSlotMenuMarkHoliday}>
          <ListItemIcon><EventBusyIcon fontSize="small" color="error" /></ListItemIcon>
          <ListItemText>Mark as Holiday</ListItemText>
        </MenuItem>
      </Menu>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
