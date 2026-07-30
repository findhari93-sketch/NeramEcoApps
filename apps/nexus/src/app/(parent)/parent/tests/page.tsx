'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Stack,
  Skeleton,
  Alert,
  Button,
  LinearProgress,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import EnrollmentNotice from '@/components/parent/EnrollmentNotice';
import ParentMetricGrid from '@/components/parent/ParentMetricGrid';
import StatusPill from '@/components/parent/StatusPill';
import { RADIUS, SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import type { ParentTestsResponse } from '@/app/api/parent/tests/route';
import type { ParentTestWithClass } from '@/lib/parent-tests';

/**
 * The parent's Tests tab.
 *
 * Answers three questions per test: what did they score, how many goes did it
 * take, and was that enough. The attempt count matters as much as the score: a
 * pass on the fourth try and a pass on the first are different situations, and
 * only one of them needs a conversation.
 *
 * A test that has never been sat shows no score at all rather than a zero, and
 * says so in words. That is the same null-not-zero rule the rest of the portal
 * holds to.
 */

function friendlyDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const ms = Date.parse(`${ymd}T00:00:00+05:30`);
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(ms);
}

const KIND_LABEL: Record<string, string> = {
  class_prep: 'Before the class',
  catchup_class: 'Catch-up test',
  classroom_assignment: 'Class test',
};

function TestCard({ test }: { test: ParentTestWithClass }) {
  const theme = useTheme();
  const attempted = test.attempts > 0;

  const status = !attempted
    ? { label: 'Not taken yet', tone: 'warning' as const }
    : test.passed
      ? { label: 'Passed', tone: 'success' as const }
      : { label: 'Not passed yet', tone: 'warning' as const };

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: RADIUS.card,
        border: `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
        <Typography sx={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0 }}>
          {test.title}
        </Typography>
        <StatusPill status={status} />
      </Box>

      <Typography sx={{ fontSize: 13, color: 'text.secondary' }}>
        {KIND_LABEL[test.kind] || 'Test'}
        {test.classTitle ? ` · ${test.classTitle}` : ''}
        {friendlyDate(test.classDate) ? ` · ${friendlyDate(test.classDate)}` : ''}
      </Typography>

      {attempted ? (
        <>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.25 }}>
            <Typography sx={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
              {typeof test.bestPct === 'number' ? `${Math.round(test.bestPct)}%` : 'Score not recorded'}
            </Typography>
            {test.bestScore !== null && test.totalMarks !== null && (
              <Typography sx={{ fontSize: 14, color: 'text.secondary' }}>
                {test.bestScore} of {test.totalMarks}
              </Typography>
            )}
          </Box>

          {typeof test.bestPct === 'number' && (
            <Box sx={{ mt: 1, position: 'relative' }}>
              <LinearProgress
                variant="determinate"
                value={Math.min(100, Math.max(0, test.bestPct))}
                color={test.passed ? 'success' : 'warning'}
                sx={{ height: 8, borderRadius: 4 }}
              />
              {/* The pass mark, drawn where it actually sits, so the bar means
                  something rather than being decoration. */}
              <Box
                aria-hidden
                sx={{
                  position: 'absolute',
                  top: -2,
                  bottom: -2,
                  left: `${Math.min(100, Math.max(0, test.passingPct))}%`,
                  width: '2px',
                  bgcolor: 'text.primary',
                  opacity: 0.55,
                }}
              />
            </Box>
          )}

          <Typography sx={{ fontSize: 13, color: 'text.secondary', mt: 0.75 }}>
            {test.attempts === 1 ? 'One attempt' : `${test.attempts} attempts`} · pass mark{' '}
            {test.passingPct}%
            {friendlyDate(
              test.lastAttemptAt ? test.lastAttemptAt.slice(0, 10) : null
            )
              ? ` · last tried ${friendlyDate(test.lastAttemptAt!.slice(0, 10))}`
              : ''}
          </Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 1 }}>
          Your child has not taken this test yet. The pass mark is {test.passingPct}%.
        </Typography>
      )}
    </Box>
  );
}

export default function ParentTestsPage() {
  const { getToken } = useNexusAuthContext();
  const [data, setData] = useState<ParentTestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/parent/tests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not load the tests.');
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the tests.');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="rounded" height={28} width={120} />
        <Skeleton variant="rounded" height={88} />
        <Skeleton variant="rounded" height={150} />
        <Skeleton variant="rounded" height={150} />
      </Stack>
    );
  }

  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={load}>
            Try again
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }

  if (!data) return null;

  const { summary, tests } = data;
  const notTaken = tests.filter((t) => t.attempts === 0);
  const taken = tests.filter((t) => t.attempts > 0);

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 700, fontSize: 20 }}>Tests</Typography>

      <EnrollmentNotice notice={data.notice} />

      <ParentMetricGrid
        metrics={[
          { label: 'Tests set', value: summary.total, emptyLabel: 'None yet' },
          {
            label: 'Taken',
            value: summary.attempted,
            emptyLabel: 'None yet',
            hint: summary.total ? `of ${summary.total}` : undefined,
            tone: summary.attempted < summary.total ? 'warning' : 'success',
          },
          {
            label: 'Passed',
            value: summary.passed,
            emptyLabel: 'None yet',
            tone: summary.passed === summary.attempted ? 'success' : 'warning',
          },
          {
            // null, never 0. Nothing attempted is not a zero average.
            label: 'Average',
            value:
              summary.averageBestPct === null ? null : `${summary.averageBestPct}%`,
            emptyLabel: 'Nothing taken yet',
            tone:
              summary.averageBestPct === null
                ? 'neutral'
                : summary.averageBestPct >= 60
                  ? 'success'
                  : 'warning',
          },
        ]}
      />

      {tests.length === 0 ? (
        <Box
          sx={{
            p: 3,
            textAlign: 'center',
            border: '1px dashed',
            borderColor: 'divider',
            borderRadius: 2,
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 15 }}>No tests yet</Typography>
          <Typography sx={{ fontSize: 14, color: 'text.secondary', mt: 0.5 }}>
            No class in this course has a test attached so far. This page will fill
            in as the term goes on.
          </Typography>
        </Box>
      ) : (
        <>
          {notTaken.length > 0 && (
            <Box>
              <Typography sx={SECTION_LABEL_SX}>
                Not taken yet ({notTaken.length})
              </Typography>
              <Stack spacing={1.25}>
                {notTaken.map((t) => (
                  <TestCard key={`${t.testId}-${t.classId}`} test={t} />
                ))}
              </Stack>
            </Box>
          )}

          {taken.length > 0 && (
            <Box>
              <Typography sx={SECTION_LABEL_SX}>Results ({taken.length})</Typography>
              <Stack spacing={1.25}>
                {taken.map((t) => (
                  <TestCard key={`${t.testId}-${t.classId}`} test={t} />
                ))}
              </Stack>
            </Box>
          )}
        </>
      )}

      <Typography sx={{ fontSize: 13, color: 'text.disabled', lineHeight: 1.5 }}>
        Only your child can take a test, from their own account.
      </Typography>
    </Stack>
  );
}
