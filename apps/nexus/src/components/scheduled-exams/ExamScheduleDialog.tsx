'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

/**
 * Schedule a paper as an exam.
 *
 * Three doors open this: the paper workspace, the test library, and the
 * timetable. All three arrive here, so there is one description of what an exam
 * is and one place where the rules are stated to the teacher.
 *
 * Deliberately NOT a fork of ClassCreateDialog. That dialog is 1226 lines of
 * recurrence, meeting scope, lobby bypass, allowed presenters, topic pickers
 * and cover images, none of which mean anything for an exam: an exam has no
 * Teams meeting at all. Only two of its ideas are reused, the classroom
 * multi-select and the date and time fields, and both are small enough to state
 * plainly here.
 */

interface Classroom {
  id: string;
  name: string;
  academic_year?: string | null;
}

interface LibraryTest {
  id: string;
  title: string;
  question_count?: number;
  duration_minutes?: number | null;
  total_marks?: number | null;
}

export interface ExamScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-selected paper, when opened from a test or a question paper. */
  testId?: string | null;
  testTitle?: string | null;
  /** Pre-selected classroom, when opened from a classroom context. */
  classroomId?: string | null;
  onScheduled?: (result: { series_id: string; exams: Array<{ id: string }> }) => void;
}

/** 09:00 to 21:00 in 15-minute steps. Enough for any sitting anyone schedules. */
function timeOptions(): string[] {
  const out: string[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
}

/** A local date and time in IST, as an instant. */
function toIso(date: string, time: string): string {
  // The school runs on IST and the timetable stores IST wall clock, so the
  // offset is stated rather than inferred from the teacher's laptop: a teacher
  // scheduling from a different timezone must not shift the whole class's exam.
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

export default function ExamScheduleDialog({
  open,
  onClose,
  testId: initialTestId,
  testTitle,
  classroomId: initialClassroomId,
  onScheduled,
}: ExamScheduleDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [tests, setTests] = useState<LibraryTest[]>([]);
  const [selectedClassrooms, setSelectedClassrooms] = useState<Classroom[]>([]);
  const [testId, setTestId] = useState<string>(initialTestId || '');
  const [title, setTitle] = useState<string>(testTitle || '');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('13:00');
  const [duration, setDuration] = useState<string>('');
  const [passingPct, setPassingPct] = useState<string>('40');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authFetch = useCallback(
    async (url: string, init?: RequestInit) => {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          ...(init?.headers || {}),
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Request failed');
      return json;
    },
    [getToken],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const [classroomJson, testJson] = await Promise.all([
          authFetch('/api/classrooms'),
          authFetch('/api/question-bank/tests/library'),
        ]);
        if (cancelled) return;

        const rooms: Classroom[] = classroomJson?.data?.classrooms || classroomJson?.data || [];
        setClassrooms(rooms);
        if (initialClassroomId) {
          const match = rooms.find((c) => c.id === initialClassroomId);
          if (match) setSelectedClassrooms([match]);
        }
        setTests(testJson?.data?.tests || testJson?.data || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authFetch, initialClassroomId]);

  const chosenTest = useMemo(() => tests.find((t) => t.id === testId), [tests, testId]);

  // The window in minutes, so the duration field can be checked against it
  // before the server has to say no.
  const windowMinutes = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }, [startTime, endTime]);

  const durationMinutes = Number(duration) || chosenTest?.duration_minutes || null;
  const durationTooLong = Boolean(durationMinutes && windowMinutes > 0 && durationMinutes > windowMinutes);

  const canSave =
    selectedClassrooms.length > 0 && Boolean(testId) && windowMinutes > 0 && !durationTooLong && !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const json = await authFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          classroom_ids: selectedClassrooms.map((c) => c.id),
          test_id: testId,
          title: title.trim() || chosenTest?.title || 'Exam',
          opens_at: toIso(date, startTime),
          closes_at: toIso(date, endTime),
          duration_minutes: durationMinutes,
          passing_pct: Number(passingPct) || null,
        }),
      });
      onScheduled?.(json.data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not schedule this exam');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 700 }}>Schedule an exam</DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && (
            <Alert severity="error" role="alert" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          <TextField
            select
            label="Paper"
            value={testId}
            onChange={(e) => {
              setTestId(e.target.value);
              const t = tests.find((x) => x.id === e.target.value);
              if (t && !title.trim()) setTitle(t.title);
            }}
            fullWidth
            required
            helperText="Any paper in the library can be set as an exam."
            SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
          >
            {tests.map((t) => (
              <MenuItem key={t.id} value={t.id} sx={{ minHeight: 48 }}>
                {t.title}
                {t.question_count ? ` (${t.question_count} questions)` : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            label="What students will see this called"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            placeholder={chosenTest?.title || 'Exam'}
          />

          <Autocomplete
            multiple
            options={classrooms}
            value={selectedClassrooms}
            onChange={(_, next) => setSelectedClassrooms(next as Classroom[])}
            getOptionLabel={(c) => (c as Classroom).name}
            isOptionEqualToValue={(a, b) => (a as Classroom).id === (b as Classroom).id}
            renderTags={(value, getTagProps) =>
              value.map((c, i) => (
                <Chip
                  label={(c as Classroom).name}
                  size="small"
                  {...getTagProps({ index: i })}
                  key={(c as Classroom).id}
                />
              ))
            }
            renderInput={(paramsInput) => (
              <TextField {...paramsInput} label="Classrooms" required placeholder="Pick one or more" />
            )}
          />

          <Divider />

          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            When it is sat
          </Typography>

          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            InputLabelProps={{ shrink: true }}
          />

          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              select
              label="Opens"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              fullWidth
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
            >
              {timeOptions().map((t) => (
                <MenuItem key={t} value={t} sx={{ minHeight: 48 }}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Closes"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              fullWidth
              error={windowMinutes <= 0}
              helperText={windowMinutes <= 0 ? 'It has to close after it opens' : undefined}
              SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
            >
              {timeOptions().map((t) => (
                <MenuItem key={t} value={t} sx={{ minHeight: 48 }}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              label="Minutes allowed"
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              fullWidth
              placeholder={String(chosenTest?.duration_minutes ?? windowMinutes)}
              error={durationTooLong}
              helperText={
                durationTooLong
                  ? `The window is only ${windowMinutes} minutes long.`
                  : 'The clock starts when each student starts.'
              }
              inputProps={{ inputMode: 'numeric' }}
            />
            <TextField
              label="Pass mark %"
              type="number"
              value={passingPct}
              onChange={(e) => setPassingPct(e.target.value)}
              fullWidth
              inputProps={{ inputMode: 'numeric', min: 0, max: 100 }}
            />
          </Box>

          {/* The rules, stated once, where the decision is made. An exam behaves
              differently from every other test in Nexus and a teacher should not
              have to discover that from a student's complaint. */}
          <Alert severity="info" icon={false}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              How an exam behaves
            </Typography>
            <Typography variant="caption" component="div">
              One attempt each. The door closes at the finish time and a student who did not sit it
              is marked absent, not late. You can grant a second window to anyone who genuinely
              missed it.
            </Typography>
          </Alert>

          {selectedClassrooms.length > 1 && (
            <Alert severity="info">
              This creates one exam in each of the {selectedClassrooms.length} classrooms you picked,
              sharing the same paper and window. Each classroom is ranked and announced separately.
            </Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} sx={{ minHeight: 48 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave} sx={{ minHeight: 48 }}>
          {saving
            ? 'Scheduling...'
            : selectedClassrooms.length > 1
              ? `Schedule in ${selectedClassrooms.length} classrooms`
              : 'Schedule exam'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
