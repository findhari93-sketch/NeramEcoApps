'use client';

import { useRouter } from 'next/navigation';
import { Box, Button, Chip, CircularProgress, Typography, alpha, useTheme } from '@neram/ui';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import type { ClassCardData } from './ClassCard';
import { RADIUS } from './timetable-theme';
import { useNexusSWR, useRefreshKey } from '@/lib/nexus-swr';

interface StudentClassTest {
  placement_id: string;
  test_id: string;
  title: string;
  passing_pct: number;
  question_count: number;
  must_get_right: number;
  due_at: string | null;
  required: boolean;
  best_pct: number | null;
  attempts: number;
  passed: boolean;
}

interface ClassTestStudentCardProps {
  cls: ClassCardData;
  getToken: () => Promise<string | null>;
  refreshKey?: number;
  header?: React.ReactNode;
}

function formatDue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

/**
 * The test this class set, as the student sees it.
 *
 * Self-hiding when the teacher has not set one, because the overwhelming
 * majority of classes have none and an empty "no test" box on every class is
 * noise. That is the opposite of the teacher's section, which says "No test after
 * this class" precisely so a teacher can find the control.
 *
 * There is no lock here and there is no second player. The paper is an ordinary
 * classroom_assigned test, so Start goes to the same take engine as everything
 * else, and an overdue paper is still openable: the reminders we send say "finish
 * it", and a required one has to stay clearable from a catch-up backlog weeks
 * later.
 */
export default function ClassTestStudentCard({
  cls,
  getToken,
  refreshKey,
  header,
}: ClassTestStudentCardProps) {
  const theme = useTheme();
  const router = useRouter();

  const { data, isLoading, mutate } = useNexusSWR<{ class_test?: StudentClassTest | null }>(
    cls?.id ? `/api/timetable/${cls.id}/class-test` : null,
    getToken,
  );
  useRefreshKey(refreshKey, mutate);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  const test = data?.class_test ?? null;
  if (!test) return null;

  const overdue = !!test.due_at && Date.parse(test.due_at) < Date.now() && !test.passed;
  const accent = test.passed
    ? theme.palette.success.main
    : overdue
      ? theme.palette.error.main
      : theme.palette.warning.main;

  const start = () => {
    const params = new URLSearchParams({ test_id: test.test_id, placement_id: test.placement_id });
    router.push(`/student/tests/take?${params.toString()}`);
  };

  return (
    <Box>
      {header}

      <Box
        sx={{
          border: `1px solid ${alpha(accent, 0.4)}`,
          borderRadius: RADIUS.control,
          p: 1.375,
          mt: header ? 1 : 0,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.125 }}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: 1,
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: alpha(accent, 0.14),
              color: accent,
            }}
          >
            {test.passed ? (
              <CheckCircleOutlinedIcon sx={{ fontSize: 15 }} />
            ) : (
              <QuizOutlinedIcon sx={{ fontSize: 15 }} />
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.7813rem', lineHeight: 1.3 }} noWrap>
              {test.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {test.question_count} question{test.question_count === 1 ? '' : 's'}, pass at{' '}
              {test.must_get_right} of {test.question_count}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.875 }}>
          {test.passed ? (
            <Chip size="small" color="success" label="Passed" sx={{ height: 22, fontWeight: 700 }} />
          ) : (
            <>
              {test.required === false && (
                <Chip size="small" variant="outlined" label="Optional" sx={{ height: 22 }} />
              )}
              {test.due_at && (
                <Chip
                  size="small"
                  color={overdue ? 'error' : 'default'}
                  variant={overdue ? 'filled' : 'outlined'}
                  label={overdue ? 'Overdue' : `Due ${formatDue(test.due_at)}`}
                  sx={{ height: 22, fontWeight: overdue ? 700 : 500 }}
                />
              )}
            </>
          )}
          {test.best_pct != null && (
            <Chip
              size="small"
              variant="outlined"
              label={`Best ${Math.round(test.best_pct)}%`}
              sx={{ height: 22 }}
            />
          )}
        </Box>

        <Button
          fullWidth
          size="small"
          variant={test.passed ? 'outlined' : 'contained'}
          onClick={start}
          sx={{ textTransform: 'none', minHeight: 44, mt: 1.25, borderRadius: RADIUS.control }}
        >
          {test.passed ? 'Try it again' : test.attempts > 0 ? 'Try again' : 'Start the test'}
        </Button>
      </Box>
    </Box>
  );
}
