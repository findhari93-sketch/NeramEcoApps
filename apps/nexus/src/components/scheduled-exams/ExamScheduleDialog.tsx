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
  SwipeableDrawer,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import EligibilityRosterPanel from './EligibilityRosterPanel';

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

interface CandidateClass {
  id: string;
  title: string;
  scheduled_date: string;
}

interface LibraryTest {
  id: string;
  title: string;
  question_count?: number;
  duration_minutes?: number | null;
  total_marks?: number | null;
}

/** From GET /api/question-bank/tests/[id]: the paper's own settings, plus how
 * many other placements would be affected by changing its subset/shuffle. */
interface TestDetail {
  testType: string | null;
  durationMinutes: number | null;
  questionsToServe: number | null;
  shuffleQuestions: boolean;
  questionCount: number;
  placementCount: number;
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

/** Today or tomorrow, as an IST calendar date -- the quick-pick's two chips. */
function istDatePlusDays(offset: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(Date.now() + offset * 86_400_000));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
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

  const [testDetail, setTestDetail] = useState<TestDetail | null>(null);
  const [subsetSize, setSubsetSize] = useState<string>('');
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [practiceMode, setPracticeMode] = useState(false);
  const [attemptLimit, setAttemptLimit] = useState<'1' | '3' | 'unlimited'>('1');
  const [proctoringEnabled, setProctoringEnabled] = useState(false);
  const [violationLimit, setViolationLimit] = useState('3');

  const [candidateClasses, setCandidateClasses] = useState<CandidateClass[]>([]);
  const [coveredClasses, setCoveredClasses] = useState<CandidateClass[]>([]);
  const [eligibilityOpen, setEligibilityOpen] = useState(false);

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

        const rooms: Classroom[] = classroomJson?.classrooms || [];
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

  // What this test could cover. Only meaningful for a single classroom: each
  // classroom has its own lecture instances, so scheduling across several at
  // once has no one answer to "which class(es) does this cover" (see the
  // scoping note on covered_class_ids in the exams API route). Reuses the
  // timetable route rather than a new endpoint -- it already returns exactly
  // the recent lecture rows needed here.
  const soloClassroomId = selectedClassrooms.length === 1 ? selectedClassrooms[0].id : null;
  useEffect(() => {
    setCoveredClasses([]);
    if (!open || !soloClassroomId) {
      setCandidateClasses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const end = istDatePlusDays(0);
        const start = istDatePlusDays(-45);
        const json = await authFetch(
          `/api/timetable?classroom=${soloClassroomId}&start=${start}&end=${end}`,
        );
        if (cancelled) return;
        const classes = ((json?.classes || []) as any[])
          .filter((c) => c.kind !== 'exam' && c.status !== 'cancelled')
          .map((c) => ({ id: c.id, title: c.title, scheduled_date: c.scheduled_date }))
          .sort((a, b) => (a.scheduled_date < b.scheduled_date ? 1 : -1));
        setCandidateClasses(classes);
      } catch {
        // The dialog still works with no "What this covers" section -- an
        // exam with nothing linked is simply mandatory for everyone, exactly
        // as it was before this feature existed.
        setCandidateClasses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, soloClassroomId, authFetch]);

  // The paper's own pool/shuffle/timer settings, fetched fresh whenever the
  // teacher picks a different paper: the library list above is deliberately
  // light (title, question_count) and does not carry these.
  useEffect(() => {
    if (!open || !testId) {
      setTestDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const json = await authFetch(`/api/question-bank/tests/${testId}`);
        if (cancelled) return;
        const meta = json?.data?.test || {};
        const questionCount = Array.isArray(json?.data?.questions) ? json.data.questions.length : 0;
        const placementCount = Array.isArray(json?.data?.placements) ? json.data.placements.length : 0;
        const detail: TestDetail = {
          testType: meta.test_type ?? null,
          durationMinutes: meta.duration_minutes ?? null,
          questionsToServe: meta.questions_to_serve ?? null,
          shuffleQuestions: Boolean(meta.shuffle_questions),
          questionCount,
          placementCount,
        };
        setTestDetail(detail);
        setSubsetSize(String(detail.questionsToServe || detail.questionCount || ''));
        setShuffleQuestions(detail.shuffleQuestions);
      } catch {
        // The dialog still works with the library's lighter row; the subset
        // and shuffle controls just fall back to their own defaults below.
        setTestDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, testId, authFetch]);

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

  const poolSize = testDetail?.questionCount || chosenTest?.question_count || 0;
  const subsetTooLarge = Boolean(subsetSize && poolSize > 0 && Number(subsetSize) > poolSize);
  // Only sent as a paper edit when it actually differs from what is stored,
  // so picking a paper and leaving everything alone writes nothing extra.
  const subsetOrShuffleChanged = Boolean(
    testDetail &&
      (Number(subsetSize || 0) !== (testDetail.questionsToServe || testDetail.questionCount) ||
        shuffleQuestions !== testDetail.shuffleQuestions),
  );

  const canSave =
    selectedClassrooms.length > 0 &&
    Boolean(testId) &&
    windowMinutes > 0 &&
    !durationTooLong &&
    !subsetTooLarge &&
    !saving;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (subsetOrShuffleChanged) {
        await authFetch(`/api/question-bank/tests/${testId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            questions_to_serve: Number(subsetSize) || null,
            shuffle_questions: shuffleQuestions,
          }),
        });
      }

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
          mode: practiceMode ? 'practice' : 'ranked',
          attempt_limit: !practiceMode ? undefined : attemptLimit === 'unlimited' ? null : Number(attemptLimit),
          proctoring_enabled: proctoringEnabled,
          violation_limit: Number(violationLimit) || 3,
          covered_class_ids: coveredClasses.map((c) => c.id),
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

          {soloClassroomId && candidateClasses.length > 0 && (
            <Box>
              <Autocomplete
                multiple
                options={candidateClasses}
                value={coveredClasses}
                onChange={(_, next) => setCoveredClasses(next as CandidateClass[])}
                getOptionLabel={(c) => `${(c as CandidateClass).title} · ${(c as CandidateClass).scheduled_date}`}
                isOptionEqualToValue={(a, b) => (a as CandidateClass).id === (b as CandidateClass).id}
                renderTags={(value, getTagProps) =>
                  value.map((c, i) => (
                    <Chip
                      label={(c as CandidateClass).title}
                      size="small"
                      {...getTagProps({ index: i })}
                      key={(c as CandidateClass).id}
                    />
                  ))
                }
                renderInput={(paramsInput) => (
                  <TextField
                    {...paramsInput}
                    label="What this covers"
                    placeholder="Optional: pick the class(es) this tests on"
                    helperText="Only students who attended or caught up on these are required to take it. Leave blank and everyone enrolled is mandatory, as today."
                  />
                )}
              />
              {coveredClasses.length > 0 && (
                <Button size="small" onClick={() => setEligibilityOpen(true)} sx={{ mt: 1, minHeight: 44 }}>
                  Preview who this is mandatory for
                </Button>
              )}
            </Box>
          )}

          <Divider />

          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            How it is taken
          </Typography>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              label={
                testDetail?.testType && testDetail.testType !== 'untimed'
                  ? `Timed · ${testDetail.durationMinutes ?? '?'} min`
                  : 'Untimed'
              }
              variant="outlined"
            />
            {testDetail && testDetail.testType === 'untimed' && (
              <Typography variant="caption" color="text.secondary">
                This paper has no built-in timer, so students will not see a countdown. The window
                above still closes at the time you set.
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              label="Questions to serve"
              type="number"
              value={subsetSize}
              onChange={(e) => setSubsetSize(e.target.value)}
              fullWidth
              disabled={!testId}
              error={subsetTooLarge}
              helperText={
                subsetTooLarge
                  ? `This paper only has ${poolSize} questions.`
                  : poolSize
                    ? `Shuffled from the ${poolSize} in this paper.`
                    : 'Pick a paper first.'
              }
              inputProps={{ inputMode: 'numeric', min: 1, max: poolSize || undefined }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 160 }}>
              <Switch
                checked={shuffleQuestions}
                onChange={(e) => setShuffleQuestions(e.target.checked)}
                disabled={!testId}
              />
              <Typography variant="body2">Shuffle order</Typography>
            </Box>
          </Box>

          {testDetail && testDetail.placementCount > 1 && subsetOrShuffleChanged && (
            <Alert severity="warning">
              This paper is used in {testDetail.placementCount} other places. Changing the question
              count or shuffle changes it everywhere, not just this exam.
            </Alert>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch checked={practiceMode} onChange={(e) => setPracticeMode(e.target.checked)} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Practice test
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Scored, but not ranked or announced with a leaderboard.
              </Typography>
            </Box>
          </Box>

          {practiceMode && (
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                Attempts allowed
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={attemptLimit}
                onChange={(_, v) => {
                  if (v !== null) setAttemptLimit(v);
                }}
              >
                <ToggleButton value="1" sx={{ minHeight: 44, px: 2 }}>
                  1
                </ToggleButton>
                <ToggleButton value="3" sx={{ minHeight: 44, px: 2 }}>
                  3
                </ToggleButton>
                <ToggleButton value="unlimited" sx={{ minHeight: 44, px: 2, textTransform: 'none' }}>
                  Unlimited
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Switch checked={proctoringEnabled} onChange={(e) => setProctoringEnabled(e.target.checked)} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Proctor this test
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Best-effort: requires fullscreen where the student's browser supports it, warns on a
                tab switch or exiting fullscreen, and auto-submits after repeated violations. Not
                supported on iPhone browsers, which fall back to tab-switch tracking alone.
              </Typography>
            </Box>
          </Box>

          {proctoringEnabled && (
            <TextField
              label="Violations before auto-submit"
              type="number"
              value={violationLimit}
              onChange={(e) => setViolationLimit(e.target.value)}
              sx={{ maxWidth: 260 }}
              inputProps={{ inputMode: 'numeric', min: 1, max: 10 }}
              helperText="Each one is logged and shown to you on the live roster."
            />
          )}

          <Divider />

          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            When it is sat
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mb: -1 }}>
            <Chip
              size="small"
              label="Today"
              clickable
              color={date === istDatePlusDays(0) ? 'primary' : 'default'}
              onClick={() => setDate(istDatePlusDays(0))}
            />
            <Chip
              size="small"
              label="Tomorrow"
              clickable
              color={date === istDatePlusDays(1) ? 'primary' : 'default'}
              onClick={() => setDate(istDatePlusDays(1))}
            />
          </Box>

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
              {practiceMode ? 'How a practice test behaves' : 'How an exam behaves'}
            </Typography>
            <Typography variant="caption" component="div">
              {practiceMode
                ? 'Scored like any test, but there is no rank or leaderboard. The door closes at the finish time; a student who did not sit it is marked absent, not late.'
                : 'One attempt each. The door closes at the finish time and a student who did not sit it is marked absent, not late. You can grant a second window to anyone who genuinely missed it.'}
            </Typography>
          </Alert>

          {selectedClassrooms.length > 1 && (
            <Alert severity="info">
              This creates one {practiceMode ? 'test' : 'exam'} in each of the {selectedClassrooms.length}{' '}
              classrooms you picked, sharing the same paper and window.
              {!practiceMode && ' Each classroom is ranked and announced separately.'}
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

      {soloClassroomId && (
        <SwipeableDrawer
          anchor="bottom"
          open={eligibilityOpen}
          onOpen={() => setEligibilityOpen(true)}
          onClose={() => setEligibilityOpen(false)}
          PaperProps={{ sx: { maxHeight: '80vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          <Box sx={{ p: 2, pb: 0 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Who this is mandatory for
            </Typography>
            <Typography variant="caption" color="text.secondary">
              A preview -- nothing is saved until you press Schedule exam.
            </Typography>
          </Box>
          <EligibilityRosterPanel classroomId={soloClassroomId} coveredClassIds={coveredClasses.map((c) => c.id)} readOnly />
        </SwipeableDrawer>
      )}
    </Dialog>
  );
}
