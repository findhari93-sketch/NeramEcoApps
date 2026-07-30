'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Skeleton,
  Button,
  LinearProgress,
  Divider,
  Snackbar,
} from '@neram/ui';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ViewAsStudentButton from '@/components/ViewAsStudentButton';
import ParentAccessCard from '@/components/parent/ParentAccessCard';
import ClassifyDrawer, { type ClassifyMode } from '@/components/students/ClassifyDrawer';
import StudentStageAvatar from '@/components/students/StudentStageAvatar';
import ExamYearChip from '@/components/students/ExamYearChip';
import { DormantChip, StudentStageChip } from '@/components/students/StudentStageChip';
import { stageKeyOf, type StageKey } from '@/lib/student-stage';
import { expectedYearForStage } from '@neram/database';

interface StudentDetail {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  enrollment_date: string | null;
  study_stage: string | null;
  participation_status: 'active' | 'dormant';
  dormant_since: string | null;
  dormant_reason: string | null;
  academic_year: string | null;
  pair_status: string | null;
  attendance: {
    attended: number;
    total: number;
    percentage: number;
  };
  checklist: {
    completed: number;
    total: number;
    percentage: number;
  };
  topics: {
    completed: number;
    total: number;
  };
}

export default function StudentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { activeClassroom, getToken, can } = useNexusAuthContext();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState<ClassifyMode | null>(null);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [currentBatch, setCurrentBatch] = useState<string | null>(null);
  const [examYears, setExamYears] = useState<string[]>([]);

  // Any teaching staff may set a class or exam year; only a manager or admin may
  // mark someone dormant. See staff-capabilities.ts for why the two differ.
  const canSetStage = can('coord.student.stage');
  const canSetDormancy = can('coord.student.dormancy');
  const studentId = params.id as string;

  // The selectable exam-year cohorts, from the same read-only registry the
  // students list uses, so both editors offer identical options.
  useEffect(() => {
    async function loadExamYears() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/batches', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        setExamYears(((data.batches || []) as { code: string }[]).map((b) => b.code));
        if (data.current?.code) setCurrentBatch(data.current.code);
      } catch {
        /* non-fatal: the drawer just offers no years */
      }
    }
    loadExamYears();
  }, [getToken]);

  useEffect(() => {
    if (!activeClassroom || !studentId) return;

    async function fetchStudent() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/students/${studentId}?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          const s = data.student || data;
          const att = data.attendanceSummary || {};
          const cl = data.checklistProgress || {};
          const tp = data.topicProgress || {};
          if (data.currentBatch) setCurrentBatch(data.currentBatch);
          setStudent({
            id: s.id,
            name: s.name,
            email: s.email,
            avatar_url: s.avatar_url,
            enrollment_date: s.enrolled_at || s.enrollment_date || null,
            study_stage: s.study_stage ?? null,
            participation_status: s.participation_status ?? 'active',
            dormant_since: s.dormant_since ?? null,
            dormant_reason: s.dormant_reason ?? null,
            academic_year: s.academic_year ?? null,
            pair_status: s.pair_status ?? null,
            attendance: {
              attended: att.attended || 0,
              total: att.total || 0,
              percentage: att.percentage || 0,
            },
            checklist: {
              completed: cl.completed || 0,
              total: cl.total || 0,
              percentage: cl.total > 0 ? Math.round((cl.completed / cl.total) * 100) : 0,
            },
            topics: {
              completed: tp.completed || 0,
              total: tp.total || 0,
            },
          });
        }
      } catch (err) {
        console.error('Failed to load student:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudent();
  }, [activeClassroom, studentId, getToken, reloadKey]);

  /**
   * The same PATCH the bulk bar uses, with a one-element id list. One editor and
   * one endpoint for both entry points, so the rules cannot diverge.
   */
  async function applyClassification(payload: {
    studyStage?: StageKey | null;
    academicYear?: string | null;
    participationStatus?: 'active' | 'dormant';
    reason?: string;
  }) {
    if (!activeClassroom || !student) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/students/classification', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          classroomId: activeClassroom.id,
          studentIds: [student.id],
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="circular" width={80} height={80} sx={{ mx: 'auto', mb: 2 }} />
        <Skeleton variant="rectangular" height={24} sx={{ borderRadius: 1, mb: 1, mx: 'auto', maxWidth: 200 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1, mb: 2 }} />
        <Skeleton variant="rectangular" height={80} sx={{ borderRadius: 1 }} />
      </Box>
    );
  }

  if (!student) {
    return (
      <Box>
        <Button
          onClick={() => router.push('/teacher/students')}
          sx={{ textTransform: 'none', minHeight: 48, mb: 2 }}
        >
          &#8592; Back to Students
        </Button>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            Student not found.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      {/* Back Button */}
      <Button
        onClick={() => router.push('/teacher/students')}
        sx={{ textTransform: 'none', minHeight: 48, mb: 2 }}
      >
        &#8592; Back to Students
      </Button>

      {/* Student Header */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2, textAlign: 'center' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
          <StudentStageAvatar
            stage={stageKeyOf(student.study_stage)}
            dormant={student.participation_status === 'dormant'}
            src={student.avatar_url}
            name={student.name}
            size={80}
          />
        </Box>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          {student.name}
        </Typography>
        {student.email && (
          <Typography variant="body2" color="text.secondary">
            {student.email}
          </Typography>
        )}

        {/* Classification. Separate chips, never one: they answer different
            questions and a student can legitimately be all three. */}
        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center', flexWrap: 'wrap', mt: 1.25 }}>
          <StudentStageChip stage={stageKeyOf(student.study_stage)} density="detailed" />
          <ExamYearChip
            academicYear={student.academic_year}
            pairStatus={student.pair_status}
            studyStage={student.study_stage}
            expectedYear={
              currentBatch ? expectedYearForStage(stageKeyOf(student.study_stage), currentBatch) : null
            }
            density="detailed"
          />
          {student.participation_status === 'dormant' && (
            <DormantChip
              since={student.dormant_since}
              reason={student.dormant_reason}
              density="detailed"
            />
          )}
          {canSetStage && (
            <Button
              size="small"
              startIcon={<EditOutlinedIcon sx={{ fontSize: '0.9rem' }} />}
              onClick={() => setDrawer('stage')}
              sx={{ minHeight: 32, py: 0, fontSize: '0.72rem', fontWeight: 700 }}
            >
              Edit
            </Button>
          )}
        </Box>

        {/* Spell out the missing half rather than leaving a gap where a chip
            would be. "No exam year" is actionable; an absence is not. */}
        {!student.academic_year && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
            No exam year set, so this student belongs to no cohort.
          </Typography>
        )}

        {student.enrollment_date && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Enrolled: {formatDate(student.enrollment_date)}
          </Typography>
        )}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <ViewAsStudentButton
            studentId={student.id}
            reason={`Student detail: ${student.name}`}
            variant="contained"
          />
          {canSetDormancy && (
            <Button
              variant="outlined"
              color={student.participation_status === 'dormant' ? 'success' : 'warning'}
              onClick={() => setDrawer(student.participation_status === 'dormant' ? 'reactivate' : 'dormant')}
              sx={{ minHeight: 48, fontWeight: 700 }}
            >
              {student.participation_status === 'dormant' ? 'Bring back' : 'Mark dormant'}
            </Button>
          )}
        </Box>
      </Paper>

      {/* Parent access. Renders nothing for staff without the capability. */}
      <ParentAccessCard
        studentId={student.id}
        studentName={student.name}
        classroomId={activeClassroom?.id ?? null}
      />

      {/* Attendance Summary */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Attendance
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {student.attendance.attended} / {student.attendance.total} classes
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(student.attendance.percentage)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={student.attendance.percentage}
          color={student.attendance.percentage >= 75 ? 'success' : 'warning'}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {/* Checklist Progress */}
      <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Checklist Progress
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {student.checklist.completed} / {student.checklist.total} items
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {Math.round(student.checklist.percentage)}%
          </Typography>
        </Box>
        <LinearProgress
          variant="determinate"
          value={student.checklist.percentage}
          color={student.checklist.percentage >= 50 ? 'info' : 'warning'}
          sx={{ height: 8, borderRadius: 4 }}
        />
      </Paper>

      {/* Topic Progress */}
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
          Topic Progress
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            Topics completed
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {student.topics.completed} / {student.topics.total}
          </Typography>
        </Box>
      </Paper>

      <ClassifyDrawer
        open={!!drawer}
        mode={drawer ?? 'stage'}
        names={[student.name]}
        busy={saving}
        examYears={examYears}
        currentBatch={currentBatch}
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
