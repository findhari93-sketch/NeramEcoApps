'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Fab, Snackbar, Alert, Button, useMediaQuery, useTheme, Menu, MenuItem, ListItemIcon, ListItemText, ListSubheader } from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EventIcon from '@mui/icons-material/Event';
import EventBusyIcon from '@mui/icons-material/EventBusy';
import AssessmentIcon from '@mui/icons-material/Assessment';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
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
import PlannerWeekList from '@/components/timetable/views/PlannerWeekList';
import TimetableToolbar from '@/components/timetable/views/TimetableToolbar';
import ClassEditPanel from '@/components/timetable/ClassEditPanel';
import LinkAssignmentDialog from '@/components/timetable/LinkAssignmentDialog';
import NewAssignmentDialog from '@/components/assignments/NewAssignmentDialog';
import { useAuthFetch } from '@/components/curriculum/shared';
import ClassCreateDialog from '@/components/timetable/ClassCreateDialog';
import AttendanceSheet from '@/components/timetable/AttendanceSheet';
import ClassDetailPanel from '@/components/timetable/ClassDetailPanel';
import HolidayManager from '@/components/timetable/HolidayManager';
import RsvpDashboard from '@/components/timetable/RsvpDashboard';
import TimetableNotificationBell from '@/components/timetable/TimetableNotificationBell';
import { type ClassCardData } from '@/components/timetable/ClassCard';
import { type HolidayInfo } from '@/components/timetable/date-utils';
import { type PlanShape } from '@/lib/plan-shape';

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface BatchOption {
  id: string;
  name: string;
}

interface ClassroomWithBatches {
  id: string;
  name: string;
  type: string;
  ms_team_id?: string | null;
  batches: BatchOption[];
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
  const { week, band, view, setWeekOffset } = viewState;

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
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [classroomsWithBatches, setClassroomsWithBatches] = useState<ClassroomWithBatches[]>([]);
  // Pre-fill data for calendar slot click
  const [prefillDate, setPrefillDate] = useState<string>('');
  const [prefillTime, setPrefillTime] = useState<string>('');

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassCardData | null>(null);
  const [attendanceClass, setAttendanceClass] = useState<ClassCardData | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassCardData | null>(null);
  const [holidayManagerOpen, setHolidayManagerOpen] = useState(false);
  const [rsvpDashboardOpen, setRsvpDashboardOpen] = useState(false);
  const [rsvpDashboardClassId, setRsvpDashboardClassId] = useState<string | undefined>();

  // Holidays
  const [holidays, setHolidays] = useState<Record<string, HolidayInfo>>({});

  // RSVP data
  const [rsvpData, setRsvpData] = useState<Record<string, { attending: number; total: number }>>({});
  // Rating data
  const [averageRatings, setAverageRatings] = useState<Record<string, number>>({});

  // Toolbar overflow menu (mobile)
  const [toolbarMenuAnchor, setToolbarMenuAnchor] = useState<HTMLElement | null>(null);

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

  const fetchClasses = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable?classroom=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const fetchedClasses = data.classes || [];
        setClasses(fetchedClasses);
        setPlanShapes(data.planShapes || []);

        // Fetch RSVP summaries and ratings for each class
        if (fetchedClasses.length > 0) {
          fetchRsvpAndRatings(fetchedClasses, token);
        }
      }
    } catch (err) {
      console.error('Failed to load timetable:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, week.start, week.end, getToken]);

  const fetchHolidays = useCallback(async () => {
    if (!activeClassroom) return;
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/timetable/holidays?classroom_id=${activeClassroom.id}&start=${week.start}&end=${week.end}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        const map: Record<string, HolidayInfo> = {};
        for (const h of data.holidays || []) {
          map[h.holiday_date] = { title: h.title, description: h.description };
        }
        setHolidays(map);
      }
    } catch {
      // ignore
    }
  }, [activeClassroom, week.start, week.end, getToken]);

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

    const [rsvpResults, ratingResults] = await Promise.all([
      Promise.all(rsvpPromises),
      Promise.all(ratingPromises),
    ]);

    const rsvpMap: Record<string, { attending: number; total: number }> = {};
    const ratingMap: Record<string, number> = {};

    classIds.forEach((id, i) => {
      if (rsvpResults[i]?.summary) {
        rsvpMap[id] = rsvpResults[i].summary;
      }
      if (ratingResults[i]?.summary?.average) {
        ratingMap[id] = ratingResults[i].summary.average;
      }
    });

    setRsvpData(rsvpMap);
    setAverageRatings(ratingMap);
  };

  useEffect(() => {
    fetchClasses();
    fetchHolidays();
  }, [fetchClasses, fetchHolidays]);

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
    if (view !== 'agenda' || classes.length === 0) return;
    let cancelled = false;

    (async () => {
      const token = await getToken();
      if (!token) return;
      const entries = await Promise.all(
        classes.map(async (c) => {
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
  }, [view, classes, getToken, assignmentRefreshKey]);

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
        fetchClasses();
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

  // Fetch topics and batches for create dialog (batches for ALL classrooms)
  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchMeta() {
      try {
        const token = await getToken();
        if (!token) return;

        // Fetch topics for active classroom
        const topicsRes = await fetch(`/api/topics?classroom=${activeClassroom!.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (topicsRes.ok) {
          const data = await topicsRes.json();
          setTopics(data.topics || []);
        }

        // Fetch batches for active classroom (legacy)
        const batchesRes = await fetch(`/api/classrooms/${activeClassroom!.id}/batches`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (batchesRes.ok) {
          const data = await batchesRes.json();
          setBatches(data.batches || []);
        }

        // Fetch batches for ALL classrooms (for the new classroom selector)
        const nonCommonClassrooms = classrooms.filter((c) => c.type !== 'common');
        const batchPromises = nonCommonClassrooms.map((c) =>
          fetch(`/api/classrooms/${c.id}/batches`, {
            headers: { Authorization: `Bearer ${token}` },
          }).then((r) => r.ok ? r.json() : { batches: [] }).catch(() => ({ batches: [] }))
        );
        const batchResults = await Promise.all(batchPromises);

        const cwb: ClassroomWithBatches[] = [];
        // Add common classroom first (no batches)
        const common = classrooms.find((c) => c.type === 'common');
        if (common) {
          cwb.push({ id: common.id, name: common.name, type: common.type, ms_team_id: common.ms_team_id, batches: [] });
        }
        // Add regular classrooms with their batches
        nonCommonClassrooms.forEach((c, i) => {
          cwb.push({
            id: c.id,
            name: c.name,
            type: c.type,
            ms_team_id: c.ms_team_id,
            batches: (batchResults[i].batches || []).map((b: any) => ({ id: b.id, name: b.name })),
          });
        });
        setClassroomsWithBatches(cwb);
      } catch (err) {
        console.error('Failed to load metadata:', err);
      }
    }

    fetchMeta();
  }, [activeClassroom, classrooms, getToken]);

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
            fetchClasses();
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
        fetchClasses();
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
        fetchClasses();
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
        fetchClasses();
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
        if (data.imported > 0) fetchClasses();
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
        setSnackbar({
          open: true,
          message: data.alreadyExists ? 'Meeting already exists' : 'Teams meeting created!',
          severity: 'success',
        });
        fetchClasses();
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
        setSnackbar({ open: true, message: 'Teams meeting created!', severity: 'success' });
        fetchClasses();
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
        fetchHolidays();
      }
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh' }}>
      {/* One action bar. Six competing buttons became a primary action plus a
          menu grouped by the job it does, because "Holidays / RSVP / Sync
          Members / Sync from Teams" side by side gave no clue which mattered.
          Everything in the menu is also reachable in context: tap a day to mark
          a holiday, open a class for its RSVP. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 2,
          gap: 1,
        }}
      >
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          Timetable
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1 } }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setEditingClass(null);
              setPrefillDate('');
              setPrefillTime('');
              setCreateDialogOpen(true);
            }}
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 700, whiteSpace: 'nowrap' }}
          >
            {isDesktop ? 'Schedule class' : 'Schedule'}
          </Button>

          <Button
            variant="outlined"
            onClick={(e) => setToolbarMenuAnchor(e.currentTarget)}
            endIcon={<MoreVertIcon />}
            aria-label="More timetable actions"
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600, px: isDesktop ? 2 : 1.25 }}
          >
            {isDesktop ? 'More' : ''}
          </Button>

          {activeClassroom && (
            <TimetableNotificationBell classroomId={activeClassroom.id} getToken={getToken} />
          )}
        </Box>
      </Box>

      <Menu
        anchorEl={toolbarMenuAnchor}
        open={Boolean(toolbarMenuAnchor)}
        onClose={() => setToolbarMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { minWidth: 250 } }}
      >
        <ListSubheader sx={{ lineHeight: '32px', fontSize: '0.6875rem', letterSpacing: '.08em' }}>
          THIS WEEK
        </ListSubheader>
        <MenuItem
          onClick={() => {
            setToolbarMenuAnchor(null);
            router.push('/teacher/timetable/import');
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon><CloudUploadIcon fontSize="small" /></ListItemIcon>
          <ListItemText>Upload week</ListItemText>
        </MenuItem>
        {draftCount > 0 && (
          <MenuItem
            onClick={() => {
              setToolbarMenuAnchor(null);
              handlePublishWeek();
            }}
            disabled={publishing}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon><PublishIcon fontSize="small" color="primary" /></ListItemIcon>
            <ListItemText
              primary={publishing ? 'Publishing...' : 'Publish week'}
              secondary={`${draftCount} draft${draftCount === 1 ? '' : 's'} waiting`}
            />
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setToolbarMenuAnchor(null);
            setHolidayManagerOpen(true);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon><EventBusyIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Mark a holiday" secondary="Or tap an empty day" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setToolbarMenuAnchor(null);
            setRsvpDashboardClassId(undefined);
            setRsvpDashboardOpen(true);
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon><AssessmentIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Who is attending" secondary="Opt-outs across the week" />
        </MenuItem>
        <MenuItem
          onClick={() => {
            setToolbarMenuAnchor(null);
            router.push('/teacher/recordings');
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon><SmartDisplayOutlinedIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Recordings" secondary="Search past classes by tag" />
        </MenuItem>

        <ListSubheader sx={{ lineHeight: '32px', fontSize: '0.6875rem', letterSpacing: '.08em' }}>
          SETUP
        </ListSubheader>
        {/* Class hours live on the course plan, which already owns the dates
            that make a season a season. There is no second place to set them. */}
        <MenuItem
          onClick={() => {
            setToolbarMenuAnchor(null);
            router.push(
              activePlanId
                ? `/teacher/course-plans/${activePlanId}`
                : '/teacher/course-plans',
            );
          }}
          sx={{ minHeight: 48 }}
        >
          <ListItemIcon><DateRangeIcon fontSize="small" /></ListItemIcon>
          <ListItemText
            primary="Class hours and days"
            secondary={
              activePlanName
                ? `Set on the course plan, ${activePlanName}`
                : 'Set on the course plan'
            }
          />
        </MenuItem>

        {activeClassroom?.ms_team_id && (
          <ListSubheader sx={{ lineHeight: '32px', fontSize: '0.6875rem', letterSpacing: '.08em' }}>
            TEAMS
          </ListSubheader>
        )}
        {activeClassroom?.ms_team_id && (
          <MenuItem
            onClick={() => {
              setToolbarMenuAnchor(null);
              handleSyncMembers();
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon><SyncIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Sync members" secondary="Add enrolled students to the Team" />
          </MenuItem>
        )}
        {activeClassroom?.ms_team_id && (
          <MenuItem
            onClick={() => {
              setToolbarMenuAnchor(null);
              handleSyncFromTeams();
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon><CloudDownloadIcon fontSize="small" /></ListItemIcon>
            <ListItemText primary="Import from Teams" secondary="Pull meetings already scheduled there" />
          </MenuItem>
        )}
      </Menu>

      <TimetableToolbar state={viewState} agendaLabel="Plan" />

      {view === 'grid' ? (
        <GridView
          classes={classes}
          week={week}
          band={band}
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
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <PlannerWeekList
            classes={classes}
            week={week}
            loading={loading}
            holidays={holidays}
            selectedId={panelClass?.id ?? null}
            assignmentCounts={assignmentCounts}
            onSelect={setPanelClass}
            onAssignmentClick={openAssignmentMenu}
            onAddClass={(date) => {
              setPrefillDate(date);
              setPrefillTime('');
              setEditingClass(null);
              setCreateDialogOpen(true);
            }}
          />
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
      )}

      {/* Mobile only: the header button is the desktop equivalent, and two
          identical actions on one screen is one too many. */}
      {!isDesktop && (
        <Fab
          color="primary"
          aria-label="Schedule a class"
          onClick={() => {
            setEditingClass(null);
            setPrefillDate('');
            setPrefillTime('');
            setCreateDialogOpen(true);
          }}
          sx={{ position: 'fixed', bottom: 80, right: 16, width: 56, height: 56 }}
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
        averageRating={selectedClass ? averageRatings[selectedClass.id] : null}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDeletePermanent={handleDeletePermanent}
        onViewAttendance={setAttendanceClass}
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
        topics={topics}
        classrooms={classroomsWithBatches}
        defaultClassroomId={activeClassroom?.id || ''}
        getToken={getToken}
        onSaved={() => {
          setSnackbar({ open: true, message: editingClass ? 'Class updated' : 'Class created', severity: 'success' });
          fetchClasses();
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
        onHolidaysChanged={() => { fetchHolidays(); fetchClasses(); }}
        getClassesOnDate={getClassesOnDate}
        onCancelClass={handleCancelClassForHoliday}
        prefillDate={prefillDate}
      />

      {/* RSVP Dashboard */}
      <RsvpDashboard
        open={rsvpDashboardOpen}
        onClose={() => {
          setRsvpDashboardOpen(false);
          setRsvpDashboardClassId(undefined);
        }}
        classroomId={activeClassroom?.id || ''}
        getToken={getToken}
        classId={rsvpDashboardClassId}
        startDate={week.start}
        endDate={week.end}
      />

      {/* Attendance Sheet */}
      {attendanceClass && (
        <AttendanceSheet
          open={!!attendanceClass}
          onClose={() => setAttendanceClass(null)}
          classId={attendanceClass.id}
          classTitle={attendanceClass.title}
          classroomId={activeClassroom?.id || ''}
          teamsMeetingId={attendanceClass.teams_meeting_id}
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
