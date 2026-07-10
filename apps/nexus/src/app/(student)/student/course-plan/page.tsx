'use client';

/**
 * Student course-plan timeline: the classes that have happened (plus today and
 * one upcoming preview), each with its recorded catch-up (the gated recap) and
 * the assignment given, with the student's own submission status and marks.
 * Late joiners see everything and can still submit.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Chip,
  Button,
  Skeleton,
  Snackbar,
  Alert,
  alpha,
} from '@neram/ui';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import { useAuthFetch } from '@/components/curriculum/shared';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import StudentAssignmentDialog from '@/components/assignments/StudentAssignmentDialog';
import RecordingPlayerDialog from '@/components/course-plan/RecordingPlayerDialog';

type MyStatus = 'missing' | 'submitted' | 'late' | 'reviewed' | 'redo';

interface DayAssignment {
  id: string;
  title: string;
  due_at: string | null;
  max_marks: number;
  my_status: MyStatus;
  marks: number | null;
}
interface PlanDay {
  date: string;
  is_today: boolean;
  is_test: boolean;
  is_task: boolean;
  task: { title: string; description: string | null; time: string | null } | null;
  test_title: string | null;
  topic: { title: string; module_color: string | null } | null;
  session_label: string | null;
  teacher: { name: string | null } | null;
  recap: { id: string } | null;
  recording: { youtube_id: string } | null;
  recording_pending: boolean;
  assignments: DayAssignment[];
}
interface PlanSection {
  classroom: { id: string; name: string | null; type: string | null };
  plan: { id: string; title: string; exam_type: string; start_date: string; expected_end_date: string };
  days: PlanDay[];
  upcoming: PlanDay[];
}

const ASSIGN_STATUS: Record<MyStatus, { label: (m: DayAssignment) => string; color: string; bg: string }> = {
  missing: { label: () => 'Submit', color: '#5B21B6', bg: alpha('#7C3AED', 0.12) },
  submitted: { label: () => 'Submitted', color: '#1565C0', bg: alpha('#1565C0', 0.1) },
  late: { label: () => 'Submitted late', color: '#B54700', bg: alpha('#EF6C00', 0.14) },
  reviewed: { label: (m) => `Marks ${m.marks} / ${m.max_marks}`, color: '#1B5E20', bg: alpha('#2E7D32', 0.12) },
  redo: { label: () => 'Redo requested', color: '#B54700', bg: alpha('#EF6C00', 0.14) },
};

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtTaskTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 || 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function StudentCoursePlanPage() {
  const router = useRouter();
  const authFetch = useAuthFetch();
  const { loading: authLoading, getToken } = useNexusAuthContext();

  const [sections, setSections] = useState<PlanSection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ youtubeId: string; title: string } | null>(null);
  const [snack, setSnack] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/student/course-plan');
      setSections(res.plans as PlanSection[]);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load your course plan');
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  const renderDay = (day: PlanDay, upcoming = false) => {
    // Info task (a no-class day): read-only title, details and time.
    if (day.is_task && day.task) {
      const t = day.task;
      const accent = '#B26A00';
      return (
        <Box key={`${day.date}-task-${t.title}`} sx={{ display: 'flex', gap: 1.5, opacity: upcoming ? 0.72 : 1 }}>
          <Stack alignItems="center" sx={{ pt: 0.5 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
            <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', mt: 0.5 }} />
          </Stack>
          <Box
            sx={{
              flex: 1,
              mb: 2,
              p: 2,
              borderRadius: 3,
              border: '1px solid',
              borderColor: day.is_today ? alpha(accent, 0.5) : 'divider',
              bgcolor: 'background.paper',
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }} flexWrap="wrap" useFlexGap>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', color: 'text.secondary', textTransform: 'uppercase' }}>
                {day.is_today ? 'Today · ' : ''}
                {fmtDate(day.date)}
              </Typography>
              <Chip label="Task" size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 800, bgcolor: alpha(accent, 0.14), color: accent }} />
              {t.time && (
                <Typography variant="caption" sx={{ fontWeight: 700, color: accent }}>
                  {fmtTaskTime(t.time)}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <AssignmentOutlinedIcon sx={{ fontSize: 20, color: accent, mt: 0.2, flexShrink: 0 }} />
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.02rem', lineHeight: 1.3 }}>{t.title}</Typography>
                {t.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    {t.description}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
        </Box>
      );
    }
    const accent = day.is_test ? '#1565C0' : day.topic?.module_color || '#7C3AED';
    return (
      <Box
        key={`${day.date}-${day.is_test ? 'test' : day.topic?.title}`}
        sx={{
          display: 'flex',
          gap: 1.5,
          opacity: upcoming ? 0.72 : 1,
        }}
      >
        {/* Timeline rail */}
        <Stack alignItems="center" sx={{ pt: 0.5 }}>
          <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: accent, flexShrink: 0 }} />
          <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', mt: 0.5 }} />
        </Stack>

        <Box
          sx={{
            flex: 1,
            mb: 2,
            p: 2,
            borderRadius: 3,
            border: '1px solid',
            borderColor: day.is_today ? alpha(accent, 0.5) : 'divider',
            bgcolor: 'background.paper',
            borderLeft: `3px solid ${accent}`,
          }}
        >
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.04em', color: 'text.secondary', textTransform: 'uppercase' }}>
              {day.is_today ? 'Today · ' : ''}
              {fmtDate(day.date)}
            </Typography>
            {upcoming && <Chip label="Up next" size="small" sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700 }} />}
          </Stack>

          <Typography sx={{ fontWeight: 700, fontSize: '1.02rem', lineHeight: 1.3 }}>
            {day.is_test ? day.test_title || 'Test' : day.topic?.title || 'Class'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {day.session_label ? `${day.session_label}` : ''}
            {day.session_label && day.teacher?.name ? ' · ' : ''}
            {day.teacher?.name || ''}
          </Typography>

          {!upcoming && (
            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }} flexWrap="wrap" useFlexGap>
              {day.recap ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SmartDisplayOutlinedIcon sx={{ fontSize: 17 }} />}
                  onClick={() => router.push(`/student/class-recap/${day.recap!.id}`)}
                  sx={{ minHeight: 40, textTransform: 'none' }}
                >
                  Guided recap
                </Button>
              ) : day.recording ? (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<PlayCircleOutlineIcon sx={{ fontSize: 18 }} />}
                  onClick={() => setPlaying({ youtubeId: day.recording!.youtube_id, title: day.topic?.title || 'Class recording' })}
                  sx={{ minHeight: 40, textTransform: 'none' }}
                >
                  Watch recording
                </Button>
              ) : day.recording_pending ? (
                <Chip
                  icon={<HourglassEmptyOutlinedIcon sx={{ fontSize: 15 }} />}
                  label="Recording being prepared"
                  size="small"
                  sx={{ height: 30, bgcolor: 'action.hover', color: 'text.secondary' }}
                />
              ) : null}

              {day.assignments.map((a) => {
                const meta = ASSIGN_STATUS[a.my_status];
                return (
                  <Button
                    key={a.id}
                    size="small"
                    onClick={() => setOpenAssignment(a.id)}
                    startIcon={<AssignmentOutlinedIcon sx={{ fontSize: 17 }} />}
                    sx={{
                      minHeight: 40,
                      textTransform: 'none',
                      fontWeight: 700,
                      color: meta.color,
                      bgcolor: meta.bg,
                      '&:hover': { bgcolor: meta.bg },
                    }}
                  >
                    {meta.label(a)}
                  </Button>
                );
              })}
            </Stack>
          )}
        </Box>
      </Box>
    );
  };

  if (loadError) {
    return (
      <Box sx={{ p: 3, maxWidth: 480, mx: 'auto', textAlign: 'center', mt: 6 }}>
        <Typography sx={{ fontWeight: 700 }}>Could not load your course plan</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {loadError}
        </Typography>
        <Button variant="outlined" onClick={() => load()} sx={{ mt: 2, minHeight: 44 }}>
          Try again
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 680, mx: 'auto' }}>
      <Typography variant="h5" sx={{ fontSize: { xs: '1.3rem', sm: '1.5rem' }, mb: 0.5 }}>
        Course plan
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        Classes that happened, their recordings and your assignments.
      </Typography>

      {!sections ? (
        <Stack spacing={2}>
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
          <Skeleton variant="rounded" height={120} sx={{ borderRadius: 3 }} />
        </Stack>
      ) : sections.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6, border: '1.5px dashed', borderColor: 'divider', borderRadius: 3 }}>
          <ScheduleOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No active course plan yet. Your classes will show up here once they begin.
          </Typography>
        </Box>
      ) : (
        sections.map((section) => {
          const pastNewestFirst = [...section.days].reverse();
          return (
            <Box key={section.plan.id} sx={{ mb: 4 }}>
              <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', mb: 0.25 }}>{section.plan.title}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                {section.classroom.name || section.plan.exam_type.toUpperCase()}
              </Typography>

              {section.upcoming.map((d) => renderDay(d, true))}
              {pastNewestFirst.length === 0 && section.upcoming.length === 0 ? (
                <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                  No classes have happened yet.
                </Typography>
              ) : (
                pastNewestFirst.map((d) => renderDay(d))
              )}
            </Box>
          );
        })
      )}

      {openAssignment && (
        <StudentAssignmentDialog
          open={!!openAssignment}
          onClose={() => setOpenAssignment(null)}
          assignmentId={openAssignment}
          authFetch={authFetch}
          getToken={getToken}
          onChanged={() => {
            setSnack('Submission saved.');
            load();
          }}
        />
      )}

      {playing && (
        <RecordingPlayerDialog
          open={!!playing}
          onClose={() => setPlaying(null)}
          youtubeId={playing.youtubeId}
          title={playing.title}
        />
      )}

      <Snackbar
        open={!!snack}
        autoHideDuration={3000}
        onClose={() => setSnack(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSnack(null)}>
          {snack}
        </Alert>
      </Snackbar>
    </Box>
  );
}
