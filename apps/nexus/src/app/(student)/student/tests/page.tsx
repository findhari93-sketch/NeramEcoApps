'use client';

/**
 * A student's tests.
 *
 * Built around what a student actually opens the app to do, in that order:
 * finish what is due, practise the chapter they are on, run their own drills,
 * and see how they did. The old page was a flat list of everything, next to a
 * question bank of 1121 loose questions, which is not something anyone works
 * through.
 *
 * Class prep and catch-up papers are deliberately not here. They are opened from
 * the class they gate, which is where their unlock rules live.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Skeleton,
  Alert,
  Snackbar,
  Divider,
  LinearProgress,
  CircularProgress,
} from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import { NEXUS_TEST_KIND_LABELS, type NexusTestKind } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

type TestStatus = 'open' | 'upcoming' | 'closed' | 'done';

interface StudentTest {
  id: string;
  title: string;
  description: string | null;
  folder_label: string | null;
  question_count: number;
  test_type: string;
  test_kind?: string | null;
  duration_minutes: number | null;
  placement_id: string | null;
  placement_context?: string | null;
  passing_pct: number | null;
  available_from: string | null;
  available_until: string | null;
  attempt_limit: number | null;
  attempts: number;
  best_percentage: number | null;
  last_submitted_at: string | null;
  status?: TestStatus;
}

interface Overview {
  due: StudentTest[];
  all?: StudentTest[];
  has_classroom?: boolean;
  practice_groups: Array<{ key: string; label: string; tests: StudentTest[] }>;
  mine: StudentTest[];
  recent: Array<{
    attempt_id: string;
    test_id: string;
    test_title: string;
    attempt_number: number;
    percentage: number | null;
    passed: boolean | null;
    submitted_at: string | null;
  }>;
}

const STATUS_FILTERS: Array<{ key: TestStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}

/** The one line that tells a student what to do with this card. */
function windowChip(t: StudentTest): { label: string; color: 'error' | 'warning' | 'default' | 'success' } | null {
  const now = Date.now();
  if (t.available_from && new Date(t.available_from).getTime() > now) {
    return { label: `Opens ${formatWhen(t.available_from)}`, color: 'default' };
  }
  if (t.available_until) {
    const until = new Date(t.available_until).getTime();
    if (until < now) return { label: 'Closed', color: 'default' };
    const hoursLeft = (until - now) / 3600000;
    return {
      label: `Due ${formatWhen(t.available_until)}`,
      color: hoursLeft < 24 ? 'error' : hoursLeft < 72 ? 'warning' : 'default',
    };
  }
  return null;
}

function TestCard({
  test,
  onStart,
  emphasis,
}: {
  test: StudentTest;
  onStart: (t: StudentTest) => void;
  emphasis?: boolean;
}) {
  const chip = windowChip(test);
  const notOpenYet = Boolean(test.available_from && new Date(test.available_from).getTime() > Date.now());
  const closed = Boolean(test.available_until && new Date(test.available_until).getTime() < Date.now());
  const outOfAttempts = Boolean(test.attempt_limit && test.attempts >= test.attempt_limit);
  const disabled = notOpenYet || closed || outOfAttempts;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: emphasis ? 2 : 1.5,
        borderRadius: 2,
        borderColor: emphasis ? 'primary.main' : 'divider',
        borderWidth: emphasis ? 2 : 1,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant={emphasis ? 'subtitle1' : 'body2'} sx={{ fontWeight: 700, lineHeight: 1.3 }}>
            {test.title}
          </Typography>
          {test.folder_label && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
              <FolderOutlinedIcon sx={{ fontSize: 13 }} />
              {test.folder_label}
            </Typography>
          )}
        </Box>
        {chip && <Chip size="small" label={chip.label} color={chip.color} sx={{ height: 24, flexShrink: 0 }} />}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center', mb: 1.5 }}>
        {/* What kind of paper this is. Weekly, model and full read very
            differently to a student and used to be indistinguishable. */}
        {test.test_kind && test.test_kind !== 'classroom_assigned' && (
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            label={NEXUS_TEST_KIND_LABELS[test.test_kind as NexusTestKind] || test.test_kind}
            sx={{ height: 22, fontSize: '0.7rem', fontWeight: 700 }}
          />
        )}
        <Chip size="small" variant="outlined" label={`${test.question_count} questions`} sx={{ height: 22, fontSize: '0.7rem' }} />
        {test.duration_minutes && (
          <Chip size="small" variant="outlined" label={`${test.duration_minutes} min`} sx={{ height: 22, fontSize: '0.7rem' }} />
        )}
        {test.passing_pct != null && (
          <Chip size="small" variant="outlined" label={`Pass ${test.passing_pct}%`} sx={{ height: 22, fontSize: '0.7rem' }} />
        )}
        {test.attempts > 0 && (
          <Chip
            size="small"
            label={`${test.attempts} attempt${test.attempts !== 1 ? 's' : ''}`}
            sx={{ height: 22, fontSize: '0.7rem' }}
          />
        )}
      </Box>

      {test.best_percentage != null && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <EmojiEventsOutlinedIcon sx={{ fontSize: 15, color: 'success.main' }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Best {Math.round(test.best_percentage)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(100, test.best_percentage)}
            color={
              test.passing_pct != null && test.best_percentage >= test.passing_pct ? 'success' : 'primary'
            }
            sx={{ height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      <Button
        fullWidth
        variant={emphasis ? 'contained' : 'outlined'}
        disabled={disabled}
        onClick={() => onStart(test)}
        sx={{ textTransform: 'none', minHeight: 44 }}
      >
        {outOfAttempts
          ? 'No attempts left'
          : notOpenYet
            ? 'Not open yet'
            : closed
              ? 'Closed'
              : test.attempts > 0
                ? 'Try again'
                : 'Start'}
      </Button>
    </Paper>
  );
}

function Section({
  icon,
  title,
  subtitle,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        {action}
      </Box>
      {children}
    </Box>
  );
}

export default function StudentTestsPage() {
  const router = useRouter();
  const { getToken, activeClassroom, loading: authLoading } = useNexusAuthContext() as any;

  const [data, setData] = useState<Overview | null>(null);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [buildingMistakes, setBuildingMistakes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<TestStatus | 'all'>('all');

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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Request failed');
      }
      return res.json();
    },
    [getToken],
  );

  const classroomParam = activeClassroom?.id ? `?classroom=${activeClassroom.id}` : '';

  const load = useCallback(async () => {
    try {
      const json = await authFetch(`/api/student/tests/overview${classroomParam}`);
      setData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your tests');
      setData({ due: [], all: [], practice_groups: [], mine: [], recent: [] });
    }
    try {
      const m = await authFetch(`/api/student/tests/mistakes${classroomParam}`);
      setMistakeCount(m.data?.count || 0);
    } catch {
      // A missing mistakes count is not worth an error banner.
    }
  }, [authFetch, classroomParam]);

  useEffect(() => {
    if (authLoading) return;
    load();
  }, [authLoading, load]);

  const start = useCallback(
    (t: StudentTest) => {
      const params = new URLSearchParams({ test_id: t.id });
      if (t.placement_id) params.set('placement_id', t.placement_id);
      router.push(`/student/tests/take?${params.toString()}`);
    },
    [router],
  );

  async function practiseMistakes() {
    setBuildingMistakes(true);
    try {
      const json = await authFetch('/api/student/tests/mistakes', {
        method: 'POST',
        body: JSON.stringify({ classroom_id: activeClassroom?.id ?? null }),
      });
      router.push(`/student/tests/take?test_id=${json.data.test_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build your practice test');
      setBuildingMistakes(false);
    }
  }

  const totalPractice = useMemo(
    () => (data?.practice_groups || []).reduce((n, g) => n + g.tests.length, 0),
    [data],
  );

  const allTests = useMemo(() => data?.all || [], [data]);
  const visibleAllTests = useMemo(
    () => (statusFilter === 'all' ? allTests : allTests.filter((t) => t.status === statusFilter)),
    [allTests, statusFilter],
  );

  if (authLoading || data === null) {
    return (
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
        <Skeleton variant="text" width={140} height={38} />
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={150} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      </Box>
    );
  }

  const nothingAtAll =
    data.due.length === 0 &&
    allTests.length === 0 &&
    totalPractice === 0 &&
    data.mine.length === 0 &&
    data.recent.length === 0;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2, maxWidth: 800, mx: 'auto', pb: 8 }}>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.25 }}>
        Tests
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Take a test as many times as you like. Your best score is the one that counts.
      </Typography>

      {nothingAtAll && (
        <Paper variant="outlined" sx={{ py: 6, px: 3, textAlign: 'center', borderRadius: 2 }}>
          <AssignmentOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
            {/* Two very different situations that used to read identically. Only
                one of them is something the student can act on. */}
            {!activeClassroom?.id
              ? 'Pick your class at the top of the screen to see the tests set for it.'
              : 'No tests yet. Weekly tests, model tests and chapter tests appear here when your teacher sets one.'}
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/student/tests/new')}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Build your own practice test
          </Button>
        </Paper>
      )}

      {/* Rendered even when empty. Unmounting it is what made teacher-set tests
          look as though they did not exist: a student with nothing assigned saw
          no trace of the idea anywhere on the page. */}
      {!nothingAtAll && (
        <Section
          icon={<AssignmentOutlinedIcon />}
          title="Due now"
          subtitle="Set by your teacher, soonest first"
        >
          {data.due.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {!activeClassroom?.id
                  ? 'Pick your class at the top of the screen to see the tests set for it.'
                  : 'Nothing due right now. Weekly tests, model tests and chapter tests appear here when your teacher sets one.'}
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {data.due.map((t) => (
                <TestCard key={t.id} test={t} onStart={start} emphasis />
              ))}
            </Box>
          )}
        </Section>
      )}

      {mistakeCount > 0 && (
        <Paper
          variant="outlined"
          sx={{ p: 2, mb: 4, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}
        >
          <AutoFixHighOutlinedIcon sx={{ color: 'warning.main' }} />
          <Box sx={{ flex: 1, minWidth: 160 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              Fix what you got wrong
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {mistakeCount} question{mistakeCount !== 1 ? 's' : ''} you missed and have not got right since
            </Typography>
          </Box>
          <Button
            variant="contained"
            onClick={practiseMistakes}
            disabled={buildingMistakes}
            startIcon={buildingMistakes ? <CircularProgress size={15} color="inherit" /> : undefined}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            Practise these
          </Button>
        </Paper>
      )}

      {totalPractice > 0 && (
        <Section
          icon={<FitnessCenterOutlinedIcon />}
          title="Practice"
          subtitle="Grouped by chapter, take them whenever you like"
        >
          {data.practice_groups.map((g) => (
            <Box key={g.key} sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}>
                {g.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {g.tests.map((t) => (
                  <TestCard key={t.id} test={t} onStart={start} />
                ))}
              </Box>
            </Box>
          ))}
        </Section>
      )}

      {/* The consolidated record. Everything the class has had, closed included,
          so "did I miss one" has an answer. */}
      {allTests.length > 0 && (
        <Section
          icon={<ClassOutlinedIcon />}
          title="All class tests"
          subtitle={`Everything your teacher has set, ${allTests.length} in total`}
        >
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 1.5 }}>
            {STATUS_FILTERS.map((f) => {
              const n = f.key === 'all' ? allTests.length : allTests.filter((t) => t.status === f.key).length;
              if (n === 0 && f.key !== 'all') return null;
              return (
                <Chip
                  key={f.key}
                  label={`${f.label} (${n})`}
                  size="small"
                  color={statusFilter === f.key ? 'primary' : 'default'}
                  variant={statusFilter === f.key ? 'filled' : 'outlined'}
                  onClick={() => setStatusFilter(f.key)}
                  sx={{ height: 32, cursor: 'pointer' }}
                />
              );
            })}
          </Box>

          {visibleAllTests.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Nothing here with that filter.
              </Typography>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {visibleAllTests.map((t) => (
                <TestCard key={`${t.id}-${t.placement_id}`} test={t} onStart={start} />
              ))}
            </Box>
          )}
        </Section>
      )}

      <Section
        icon={<PersonOutlineOutlinedIcon />}
        title="My tests"
        subtitle="Papers you built yourself"
        action={
          <Button
            size="small"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/student/tests/new')}
            sx={{ textTransform: 'none', minHeight: 40 }}
          >
            New
          </Button>
        }
      >
        {data.mine.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Build a test from the question bank to drill exactly what you want.
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.mine.map((t) => (
              <TestCard key={t.id} test={t} onStart={start} />
            ))}
          </Box>
        )}
      </Section>

      {data.recent.length > 0 && (
        <Section icon={<HistoryOutlinedIcon />} title="Recent results">
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            {data.recent.map((r, i) => (
              <Box key={r.attempt_id}>
                {i > 0 && <Divider />}
                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {r.test_title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Attempt {r.attempt_number} · {formatWhen(r.submitted_at)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={r.percentage == null ? '-' : `${Math.round(r.percentage)}%`}
                    color={r.passed === true ? 'success' : r.passed === false ? 'default' : 'primary'}
                    sx={{ height: 24, fontWeight: 700 }}
                  />
                </Box>
              </Box>
            ))}
          </Paper>
          <Button
            size="small"
            onClick={() => router.push('/student/tests/history')}
            sx={{ textTransform: 'none', mt: 1, minHeight: 40 }}
          >
            See all results
          </Button>
        </Section>
      )}

      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError(null)}>
        <Alert severity="error" variant="filled" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
