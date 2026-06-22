'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Avatar,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from '@neram/ui';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';

interface ClassroomOption {
  id: string;
  name: string;
  active_students: number;
}

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  is_alumni: boolean;
  academic_year: string | null;
}

interface GraduateBatchDialogProps {
  open: boolean;
  onClose: () => void;
  /** Resolves with the counts returned by the graduate API. */
  onConfirm: (userIds: string[], academicYear: string, reason: string) => Promise<void>;
}

const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

/** "NATA 2026" -> exam year 2026 -> academic year "2025-26". */
function deriveCohortFromClassroomName(name: string): string {
  const match = name.match(/(20\d{2})/);
  if (!match) return '';
  const examYear = parseInt(match[1], 10);
  const startYear = examYear - 1;
  return `${startYear}-${String(examYear % 100).padStart(2, '0')}`;
}

/**
 * Graduate a whole batch to alumni. Caution, but reversible: picks a classroom,
 * previews its students, sets the cohort year, then revokes Nexus access for the
 * selected students and preserves their work.
 */
export default function GraduateBatchDialog({ open, onClose, onConfirm }: GraduateBatchDialogProps) {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [classroomId, setClassroomId] = useState('');
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [academicYear, setAcademicYear] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset everything when closed.
  useEffect(() => {
    if (!open) {
      setClassroomId('');
      setStudents([]);
      setSelected(new Set());
      setAcademicYear('');
      setReason('');
      setError('');
    }
  }, [open]);

  // Load classrooms on open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setClassroomsLoading(true);
    fetch('/api/crm/alumni/classrooms')
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setClassrooms(d.classrooms || []);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load classrooms');
      })
      .finally(() => {
        if (!cancelled) setClassroomsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedClassroom = useMemo(
    () => classrooms.find((c) => c.id === classroomId) || null,
    [classrooms, classroomId],
  );

  // When a classroom is picked, load its students and default the cohort year.
  const handleClassroomChange = useCallback(
    async (id: string) => {
      setClassroomId(id);
      setStudents([]);
      setSelected(new Set());
      setError('');
      const cls = classrooms.find((c) => c.id === id);
      if (cls) setAcademicYear(deriveCohortFromClassroomName(cls.name));
      if (!id) return;
      setStudentsLoading(true);
      try {
        const res = await fetch(`/api/crm/alumni/classrooms/${id}/students`);
        const data = await res.json();
        const rows: StudentRow[] = data.students || [];
        setStudents(rows);
        // Pre-select everyone not already an alumnus.
        setSelected(new Set(rows.filter((s) => !s.is_alumni).map((s) => s.id)));
      } catch {
        setError('Failed to load students');
      } finally {
        setStudentsLoading(false);
      }
    },
    [classrooms],
  );

  const toggleStudent = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableCount = students.filter((s) => !s.is_alumni).length;
  const allSelected = selectableCount > 0 && selected.size === selectableCount;

  const toggleSelectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(students.filter((s) => !s.is_alumni).map((s) => s.id)));
  };

  const yearValid = ACADEMIC_YEAR_REGEX.test(academicYear);
  const canConfirm = selected.size > 0 && yearValid && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(
        Array.from(selected),
        academicYear,
        reason.trim() || `Graduated to alumni (${academicYear})`,
      );
    } catch (err: any) {
      setError(err?.message || 'Failed to graduate batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <HistoryEduIcon sx={{ color: '#B45309' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Graduate Batch to Alumni
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Reversible. Revokes Nexus access and preserves their work.
          </Typography>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="warning" sx={{ mb: 2 }}>
          The selected students will be <strong>locked out of Nexus</strong> and their
          classroom enrollments deactivated. Their data and drawings are kept, and their
          best work can be featured in the Alumni Hall of Fame. You can restore them anytime.
        </Alert>

        {/* Classroom picker */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Batch (Nexus classroom)
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          value={classroomId}
          onChange={(e) => handleClassroomChange(e.target.value)}
          disabled={classroomsLoading || submitting}
          helperText={classroomsLoading ? 'Loading classrooms...' : 'Pick the cohort to graduate, e.g. "NATA 2026"'}
          sx={{ mb: 2 }}
        >
          <MenuItem value="">
            <em>Select a classroom</em>
          </MenuItem>
          {classrooms.map((c) => (
            <MenuItem key={c.id} value={c.id}>
              {c.name} ({c.active_students} students)
            </MenuItem>
          ))}
        </TextField>

        {/* Cohort year */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Cohort year
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="2025-26"
          value={academicYear}
          onChange={(e) => setAcademicYear(e.target.value.trim())}
          disabled={submitting}
          error={academicYear.length > 0 && !yearValid}
          helperText={
            academicYear.length > 0 && !yearValid
              ? 'Use YYYY-YY format, e.g. 2025-26'
              : 'Stamped on each graduate as their cohort'
          }
          sx={{ mb: 2 }}
        />

        {/* Student preview */}
        {classroomId && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                Students {studentsLoading ? '' : `(${selected.size} selected)`}
              </Typography>
              {selectableCount > 0 && (
                <FormControlLabel
                  control={<Checkbox size="small" checked={allSelected} onChange={toggleSelectAll} disabled={submitting} />}
                  label={<Typography variant="caption">Select all</Typography>}
                  sx={{ mr: 0 }}
                />
              )}
            </Box>

            {studentsLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : students.length === 0 ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                No active students in this classroom.
              </Alert>
            ) : (
              <Box
                sx={{
                  maxHeight: 240,
                  overflowY: 'auto',
                  border: '1px solid',
                  borderColor: 'grey.200',
                  borderRadius: 0.75,
                  mb: 2,
                }}
              >
                {students.map((s, idx) => (
                  <Box
                    key={s.id}
                    onClick={() => !s.is_alumni && !submitting && toggleStudent(s.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      cursor: s.is_alumni ? 'default' : 'pointer',
                      opacity: s.is_alumni ? 0.5 : 1,
                      borderBottom: idx < students.length - 1 ? '1px solid' : 'none',
                      borderColor: 'grey.100',
                      transition: 'background-color 0.15s',
                      '&:hover': { bgcolor: s.is_alumni ? 'transparent' : 'grey.50' },
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={s.is_alumni || selected.has(s.id)}
                      disabled={s.is_alumni || submitting}
                      sx={{ p: 0.5 }}
                    />
                    <Avatar src={s.avatar_url || undefined} sx={{ width: 30, height: 30, fontSize: 13 }}>
                      {s.name?.charAt(0)?.toUpperCase() || '?'}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={500} noWrap>
                        {s.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {s.email || 'No email'}
                      </Typography>
                    </Box>
                    {s.is_alumni && (
                      <Chip
                        label={s.academic_year ? `Alumni ${s.academic_year}` : 'Already alumni'}
                        size="small"
                        sx={{ height: 22, fontSize: 10, bgcolor: 'rgba(217,119,6,0.12)', color: '#B45309', fontWeight: 600 }}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </>
        )}

        {/* Reason */}
        <Typography variant="body2" sx={{ mb: 1 }}>
          Reason (optional)
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. Completed 2025-26 NATA exam cycle"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={submitting}
        />
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={!canConfirm}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <HistoryEduIcon sx={{ fontSize: 18 }} />}
          sx={{ textTransform: 'none', minWidth: 180 }}
        >
          {submitting ? 'Graduating...' : `Graduate ${selected.size || ''} to Alumni`.replace('  ', ' ').trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
