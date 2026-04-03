'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Skeleton,
  Grid,
  IconButton,
  Divider,
  Snackbar,
  Alert,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublishIcon from '@mui/icons-material/Publish';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import SessionCard, { type SessionData } from '@/components/course-plan/SessionCard';
import SessionEditDialog from '@/components/course-plan/SessionEditDialog';
import PushToTimetableDialog from '@/components/course-plan/PushToTimetableDialog';
import PushWeekDialog from '@/components/course-plan/PushWeekDialog';

const DAY_LABELS: Record<string, string> = {
  sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday',
  thu: 'Thursday', fri: 'Friday', sat: 'Saturday',
};

interface WeekInfo {
  id: string;
  week_number: number;
  title: string;
  goal?: string | null;
  start_date?: string | null;
  end_date?: string | null;
}

export default function WeekDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.planId as string;
  const weekId = params.weekId as string;
  const { activeClassroom, getToken, getTeacherToken } = useNexusAuthContext();

  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [weekInfo, setWeekInfo] = useState<WeekInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editSession, setEditSession] = useState<SessionData | null>(null);
  const [pushSession, setPushSession] = useState<SessionData | null>(null);
  const [pushWeekOpen, setPushWeekOpen] = useState(false);

  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/sessions?week_id=${weekId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, weekId, getToken]);

  // Fetch week info from the plan detail
  const fetchWeekInfo = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const week = (data.plan?.weeks || []).find((w: WeekInfo) => w.id === weekId);
        if (week) setWeekInfo(week);
      }
    } catch (err) {
      console.error('Failed to load week info:', err);
    }
  }, [planId, weekId, getToken]);

  useEffect(() => {
    fetchSessions();
    fetchWeekInfo();
  }, [fetchSessions, fetchWeekInfo]);

  // Group sessions by day_number
  const sessionsByDay = useMemo(() => {
    const groups: Record<number, SessionData[]> = {};
    for (const session of sessions) {
      const day = session.day_number;
      if (!groups[day]) groups[day] = [];
      groups[day].push(session);
    }
    return Object.entries(groups)
      .map(([dayNum, sessions]) => ({
        dayNumber: parseInt(dayNum),
        dayOfWeek: sessions[0]?.day_of_week || null,
        sessions,
      }))
      .sort((a, b) => a.dayNumber - b.dayNumber);
  }, [sessions]);

  const unpushedCount = sessions.filter((s) => s.status === 'planned' && !s.scheduled_class_id).length;

  const handleSessionSaved = () => {
    setSnackbar({ open: true, message: 'Session updated', severity: 'success' });
    fetchSessions();
  };

  const handleSessionPushed = () => {
    setSnackbar({ open: true, message: 'Session pushed to timetable', severity: 'success' });
    fetchSessions();
  };

  const handleWeekPushed = () => {
    setSnackbar({ open: true, message: 'Week pushed to timetable', severity: 'success' });
    fetchSessions();
    fetchWeekInfo();
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={200} height={40} sx={{ mb: 2 }} />
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ mb: 2 }}>
            <Skeleton variant="text" width={120} height={28} sx={{ mb: 1 }} />
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={6}>
                <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Skeleton variant="rounded" height={100} sx={{ borderRadius: 2 }} />
              </Grid>
            </Grid>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton
          onClick={() => router.push(`/teacher/course-plans/${planId}`)}
          sx={{ width: 40, height: 40 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {weekInfo?.title || `Week`}
        </Typography>
      </Box>

      {/* Week meta */}
      <Box sx={{ ml: 6.5, mb: 2 }}>
        {weekInfo?.goal && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {weekInfo.goal}
          </Typography>
        )}
        {weekInfo?.start_date && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1 }}>
            <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              {weekInfo.start_date}{weekInfo.end_date ? ` - ${weekInfo.end_date}` : ''}
            </Typography>
          </Box>
        )}

        {unpushedCount > 0 && (
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            onClick={() => setPushWeekOpen(true)}
            sx={{ textTransform: 'none', minHeight: 48, mt: 1 }}
          >
            Push Entire Week ({unpushedCount} sessions)
          </Button>
        )}
      </Box>

      {/* Sessions grouped by day */}
      {sessionsByDay.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No sessions in this week.
        </Typography>
      ) : (
        sessionsByDay.map((group, groupIdx) => (
          <Box key={group.dayNumber} sx={{ mb: 3 }}>
            {groupIdx > 0 && <Divider sx={{ mb: 2 }} />}
            <Typography
              variant="subtitle1"
              sx={{ fontWeight: 700, mb: 1.5, fontSize: '0.95rem' }}
            >
              Day {group.dayNumber}
              {group.dayOfWeek && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  ({DAY_LABELS[group.dayOfWeek] || group.dayOfWeek})
                </Typography>
              )}
            </Typography>
            <Grid container spacing={1.5}>
              {group.sessions.map((session) => (
                <Grid item xs={12} sm={6} key={session.id}>
                  <SessionCard
                    session={session}
                    onEdit={setEditSession}
                    onPush={setPushSession}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))
      )}

      {/* Edit Session Dialog */}
      <SessionEditDialog
        open={!!editSession}
        onClose={() => setEditSession(null)}
        session={editSession}
        planId={planId}
        classroomId={activeClassroom?.id || ''}
        onSaved={handleSessionSaved}
        getToken={getToken}
      />

      {/* Push Single Session Dialog */}
      <PushToTimetableDialog
        open={!!pushSession}
        onClose={() => setPushSession(null)}
        session={pushSession}
        planId={planId}
        onPushed={handleSessionPushed}
        getTeacherToken={getTeacherToken}
      />

      {/* Push Week Dialog */}
      <PushWeekDialog
        open={pushWeekOpen}
        onClose={() => setPushWeekOpen(false)}
        sessions={sessions}
        weekId={weekId}
        planId={planId}
        onPushed={handleWeekPushed}
        getTeacherToken={getTeacherToken}
      />

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
