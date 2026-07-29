'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  LinearProgress,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useRouter } from 'next/navigation';

interface TestAttempt {
  id: string;
  status: 'in_progress' | 'submitted' | 'graded';
  score: number | null;
  total_marks: number | null;
  percentage: number | null;
  started_at?: string | null;
  submitted_at?: string | null;
}

interface TestAssignment {
  placement_id: string;
  context_type: 'classroom_assignment' | 'student_practice';
  available_from: string | null;
  available_until: string | null;
  passing_pct: number | null;
}

interface Test {
  id: string;
  title: string;
  test_type: string;
  duration_minutes: number | null;
  question_count: number;
  total_marks: number;
  published_at: string | null;
  is_custom?: boolean;
  /**
   * What this test is, stored on nexus_tests rather than inferred here. Optional
   * because rows written before the column existed carry the default.
   */
  test_kind?: string | null;
  assignment?: TestAssignment | null;
  myAttempt: TestAttempt | null;
}

/**
 * A short test gating entry to a class. Kept in its own shape rather than folded
 * into Test, because it is opened by CLASS id and not by test id: the server has
 * to re-derive the gate, so the generic take page is the wrong destination.
 */
interface ClassPrepTest {
  class_id: string;
  class_title: string;
  scheduled_date: string;
  start_time: string | null;
  test_id: string;
  title: string;
  question_count: number;
  passing_pct: number;
  must_get_right: number;
  best_pct: number | null;
  attempts: number;
  passed: boolean;
}

type WindowState = 'open' | 'not_yet' | 'closed';

function windowState(test: Test): WindowState {
  const a = test.assignment;
  if (!a) return 'open';
  const now = Date.now();
  if (a.available_from && new Date(a.available_from).getTime() > now) return 'not_yet';
  if (a.available_until && new Date(a.available_until).getTime() < now) return 'closed';
  return 'open';
}

function fmtWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function StudentTestsPage() {
  const { activeClassroom, getToken } = useNexusAuthContext();
  const router = useRouter();
  const [tests, setTests] = useState<Test[]>([]);
  /** Returned separately by /api/tests: gated, so never merged into `tests`. */
  const [classPrep, setClassPrep] = useState<ClassPrepTest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClassroom) return;
    fetchTests();
  }, [activeClassroom]);

  async function fetchTests() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/tests?classroom=${activeClassroom!.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setTests(data.tests || []);
        setClassPrep(data.classPrep || []);
      }
    } catch (err) {
      console.error('Failed to load tests:', err);
    } finally {
      setLoading(false);
    }
  }

  function getStatus(test: Test): 'not_started' | 'in_progress' | 'submitted' | 'graded' {
    if (!test.myAttempt) return 'not_started';
    return test.myAttempt.status;
  }

  function isAbandoned(test: Test): boolean {
    if (!test.myAttempt) return false;
    if (test.myAttempt.status !== 'in_progress') return false;
    if (!test.myAttempt.started_at) return false;
    const started = new Date(test.myAttempt.started_at).getTime();
    const now = Date.now();
    const hoursDiff = (now - started) / (1000 * 60 * 60);
    return hoursDiff > 48;
  }

  function getStatusChip(test: Test) {
    if (isAbandoned(test)) {
      return <Chip label="Abandoned" size="small" color="error" />;
    }
    const status = getStatus(test);
    switch (status) {
      case 'not_started':
        return <Chip label="Not Started" size="small" color="default" />;
      case 'in_progress':
        return <Chip label="In Progress" size="small" color="warning" />;
      case 'submitted':
        return <Chip label="Submitted" size="small" color="info" />;
      case 'graded':
        return <Chip label="Graded" size="small" color="success" />;
    }
  }

  /** Due / opens / closed chip for assigned tests. */
  function getWindowChip(test: Test) {
    const a = test.assignment;
    if (!a) return null;
    const state = windowState(test);
    if (state === 'not_yet' && a.available_from) {
      return (
        <Chip
          icon={<EventOutlinedIcon sx={{ fontSize: 14 }} />}
          label={`Opens ${fmtWhen(a.available_from)}`}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
      );
    }
    if (state === 'closed') {
      return <Chip label="Closed" size="small" color="error" variant="outlined" sx={{ fontSize: '0.7rem' }} />;
    }
    if (a.available_until) {
      const soon = new Date(a.available_until).getTime() - Date.now() < 24 * 60 * 60 * 1000;
      return (
        <Chip
          icon={<EventOutlinedIcon sx={{ fontSize: 14 }} />}
          label={`Due ${fmtWhen(a.available_until)}`}
          size="small"
          color={soon ? 'warning' : 'default'}
          variant="outlined"
          sx={{ fontSize: '0.7rem' }}
        />
      );
    }
    return null;
  }

  function takeUrl(test: Test): string {
    const base = `/student/tests/take?test_id=${test.id}`;
    return test.assignment ? `${base}&placement_id=${test.assignment.placement_id}` : base;
  }

  function getActionButton(test: Test) {
    const status = getStatus(test);
    const state = windowState(test);
    switch (status) {
      case 'not_started':
        return (
          <Button
            variant="contained"
            size="small"
            startIcon={<PlayArrowOutlinedIcon />}
            disabled={state !== 'open'}
            onClick={() => router.push(takeUrl(test))}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 120 }}
          >
            {state === 'not_yet' ? 'Not open yet' : state === 'closed' ? 'Closed' : 'Start Test'}
          </Button>
        );
      case 'in_progress':
        return (
          <Button
            variant="contained"
            color="warning"
            size="small"
            startIcon={<PlayArrowOutlinedIcon />}
            disabled={state === 'not_yet'}
            onClick={() => router.push(takeUrl(test))}
            sx={{ textTransform: 'none', minHeight: 44, minWidth: 120 }}
          >
            Resume Test
          </Button>
        );
      case 'submitted':
      case 'graded':
        return (
          <Box sx={{ textAlign: 'right' }}>
            {test.myAttempt?.score != null && test.myAttempt?.total_marks != null && (
              <>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', lineHeight: 1.2 }}>
                  {test.myAttempt.score}/{test.myAttempt.total_marks}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {test.myAttempt.percentage != null ? `${Math.round(test.myAttempt.percentage)}%` : ''}
                </Typography>
              </>
            )}
            {test.myAttempt?.score == null && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                <CheckCircleOutlinedIcon fontSize="small" />
                <Typography variant="caption">Awaiting score</Typography>
              </Box>
            )}
          </Box>
        );
    }
  }

  function formatTestType(type: string) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function formatDuration(minutes: number | null) {
    if (!minutes) return 'Untimed';
    if (minutes >= 60) {
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${minutes} min`;
  }

  function renderTestCard(test: Test) {
    return (
      <Paper
        key={test.id}
        variant="outlined"
        sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        {/* Header row: title + status chip */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: 600 }}>
              {test.title}
            </Typography>
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 1,
                mt: 0.5,
              }}
            >
              <Chip
                label={formatTestType(test.test_type)}
                size="small"
                variant="outlined"
                sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
              />
              {test.is_custom && (
                <Chip label="Custom" size="small" color="secondary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
              )}
              {getWindowChip(test)}
              {getStatusChip(test)}
            </Box>
          </Box>
        </Box>

        {/* Info row: duration, questions, marks */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: { xs: 1.5, sm: 3 },
            color: 'text.secondary',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <TimerOutlinedIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption">{formatDuration(test.duration_minutes)}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AssignmentOutlinedIcon sx={{ fontSize: 16 }} />
            <Typography variant="caption">{test.question_count} questions</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>
              {test.total_marks} marks
            </Typography>
          </Box>
        </Box>

        {/* Score progress bar for graded tests */}
        {getStatus(test) === 'graded' && test.myAttempt?.percentage != null && (
          <LinearProgress
            variant="determinate"
            value={test.myAttempt.percentage}
            color={test.myAttempt.percentage >= 60 ? 'success' : test.myAttempt.percentage >= 40 ? 'warning' : 'error'}
            sx={{ height: 6, borderRadius: 3 }}
          />
        )}

        {/* Action row */}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          {getActionButton(test)}
        </Box>
      </Paper>
    );
  }

  function renderSection(
    title: string,
    subtitle: string,
    icon: React.ReactNode,
    sectionTests: Test[],
  ) {
    if (sectionTests.length === 0) return null;
    return (
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
          {icon}
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          <Chip label={sectionTests.length} size="small" sx={{ height: 20, fontWeight: 600 }} />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          {subtitle}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {sectionTests.map((test) => renderTestCard(test))}
        </Box>
      </Box>
    );
  }

  // Grouped on the STORED test_kind now, not inferred from is_custom plus the
  // placement context. The old inference is what let every catch-up class test
  // land in "Assigned by your teacher" for the whole classroom: those rows have a
  // classroom_id and no placement, so `t.assignment ? ... : true` swept them in.
  //
  // The two gated kinds no longer reach this page at all: /api/tests excludes
  // them, because a gated test must only ever be opened from the class it belongs
  // to, where the server can re-derive the gate. The fallbacks below are kept for
  // rows written before test_kind existed.
  const kindOf = (t: Test): string =>
    t.test_kind || (t.is_custom ? 'student_custom' : 'classroom_assigned');

  const assigned = tests.filter((t) => kindOf(t) === 'classroom_assigned');
  const practice = tests.filter(
    (t) => kindOf(t) === 'practice_pool' || t.assignment?.context_type === 'student_practice',
  );
  const custom = tests.filter((t) => kindOf(t) === 'student_custom');

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Tests
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {activeClassroom?.name || 'No classroom selected'}
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : tests.length === 0 && classPrep.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <QuizOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No tests yet. Tests your teacher assigns will appear here.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* Before your classes.
              First, because it is the only group with a deadline attached to
              something the student has to show up to, and it is the only one that
              does NOT route to the generic take page: a gated test must be opened
              from its class so the server can re-derive the gate. */}
          {classPrep.length > 0 && (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <EventOutlinedIcon sx={{ fontSize: 20, color: 'warning.main' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Before your classes
                </Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
                Pass these to join the class. You can try as many times as you need.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {classPrep.map((p) => (
                  <Paper
                    key={p.class_id}
                    onClick={() => router.push(`/student/class-prep/${p.class_id}/test`)}
                    sx={{
                      p: 1.75,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      minHeight: 64,
                      cursor: 'pointer',
                      borderLeft: (t) =>
                        `4px solid ${p.passed ? t.palette.success.main : t.palette.warning.main}`,
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: '0.875rem' }} noWrap>
                        {p.class_title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {/* The count, not the percentage. "70%" of 7 questions is
                            not a number a student can hold in their head. */}
                        {p.question_count} questions, get {p.must_get_right} right
                        {p.attempts > 0 && p.best_pct != null
                          ? ` · best ${Math.round(p.best_pct)}%`
                          : ''}
                      </Typography>
                    </Box>
                    {p.passed ? (
                      <Chip
                        size="small"
                        color="success"
                        icon={<CheckCircleOutlinedIcon />}
                        label="Passed"
                      />
                    ) : (
                      <Chip
                        size="small"
                        color="warning"
                        label={p.attempts > 0 ? 'Try again' : 'Start'}
                      />
                    )}
                  </Paper>
                ))}
              </Box>
            </Box>
          )}

          {renderSection(
            'Assigned by your teacher',
            'Complete these tests, they count for your class.',
            <SchoolOutlinedIcon sx={{ fontSize: 20, color: 'primary.main' }} />,
            assigned,
          )}
          {renderSection(
            'Practice',
            'Optional practice from your teacher, attempt any time.',
            <FitnessCenterOutlinedIcon sx={{ fontSize: 20, color: 'success.main' }} />,
            practice,
          )}
          {renderSection(
            'My custom tests',
            'Tests you built for yourself from the question bank.',
            <QuizOutlinedIcon sx={{ fontSize: 20, color: 'secondary.main' }} />,
            custom,
          )}
        </>
      )}
    </Box>
  );
}
