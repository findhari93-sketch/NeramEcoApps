'use client';

/**
 * Everything a teacher has set: what's due, exams, optional practice, and the
 * consolidated record of everything the class has ever had. Extracted from
 * the old single-scroll student tests page when it grew tabs, unchanged in
 * substance from what it replaced, just re-homed under its own tab so it no
 * longer shares a scroll with a student's own papers or their score history.
 */

import { useMemo, useState } from 'react';
import { Box, Typography, Paper, Chip, Button } from '@neram/ui';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import FitnessCenterOutlinedIcon from '@mui/icons-material/FitnessCenterOutlined';
import ClassOutlinedIcon from '@mui/icons-material/ClassOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import StudentTestCard, { formatWhen, type StudentTest, type TestStatus } from './StudentTestCard';
import TestsSection from './TestsSection';
import ExamsSection from './ExamsSection';

export interface RecentAttempt {
  attempt_id: string;
  test_title: string;
  percentage: number | null;
  submitted_at: string | null;
}

const STATUS_FILTERS: Array<{ key: TestStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'done', label: 'Done' },
  { key: 'closed', label: 'Closed' },
];

export interface ClassTestsTabData {
  due: StudentTest[];
  all: StudentTest[];
  exams: StudentTest[];
  practice_groups: Array<{ key: string; label: string; tests: StudentTest[] }>;
}

export default function ClassTestsTab({
  data,
  hasActiveClassroom,
  onStart,
  onReschedule,
  recentAttempt,
  onViewPerformance,
}: {
  data: ClassTestsTabData;
  hasActiveClassroom: boolean;
  onStart: (t: StudentTest) => void;
  /** Opt-in: see StudentTestCard's onReschedule. Omit and no card offers it. */
  onReschedule?: (t: StudentTest) => void;
  /** Newest attempt, if any. Powers the teaser at the bottom of this tab. */
  recentAttempt?: RecentAttempt;
  onViewPerformance: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState<TestStatus | 'all'>('all');

  const totalPractice = useMemo(
    () => data.practice_groups.reduce((n, g) => n + g.tests.length, 0),
    [data.practice_groups],
  );

  // "All class tests" is the generic archive; exams get their own section
  // above (see decision: exams are not merged into this list's filter chips),
  // so they are excluded here to keep the same paper from appearing twice.
  const allTests = useMemo(() => data.all.filter((t) => !t.is_exam), [data.all]);
  const visibleAllTests = useMemo(
    () => (statusFilter === 'all' ? allTests : allTests.filter((t) => t.status === statusFilter)),
    [allTests, statusFilter],
  );

  return (
    <Box>
      {/* Rendered even when empty. Unmounting it is what made teacher-set tests
          look as though they did not exist: a student with nothing assigned saw
          no trace of the idea anywhere on the page. */}
      <TestsSection icon={<AssignmentOutlinedIcon />} title="Due now" subtitle="Set by your teacher, soonest first">
        {data.due.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {!hasActiveClassroom
                ? 'Pick your class at the top of the screen to see the tests set for it.'
                : 'Nothing due right now. Weekly tests, model tests and chapter tests appear here when your teacher sets one.'}
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {data.due.map((t) => (
              <StudentTestCard key={t.id} test={t} onStart={onStart} onReschedule={onReschedule} emphasis />
            ))}
          </Box>
        )}
      </TestsSection>

      <ExamsSection exams={data.exams} onStart={onStart} onReschedule={onReschedule} />

      {totalPractice > 0 && (
        <TestsSection
          icon={<FitnessCenterOutlinedIcon />}
          title="Practice"
          subtitle="Grouped by chapter, take them whenever you like"
        >
          {data.practice_groups.map((g) => (
            <Box key={g.key} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}
              >
                {g.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {g.tests.map((t) => (
                  <StudentTestCard key={t.id} test={t} onStart={onStart} />
                ))}
              </Box>
            </Box>
          ))}
        </TestsSection>
      )}

      {/* The consolidated record. Everything the class has had, closed included,
          so "did I miss one" has an answer. */}
      {allTests.length > 0 && (
        <TestsSection
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
                <StudentTestCard key={`${t.id}-${t.placement_id}`} test={t} onStart={onStart} />
              ))}
            </Box>
          )}
        </TestsSection>
      )}

      {/* Full history and the score trend now live in their own tab, one tap
          away. This is just enough to answer "how did that last one go"
          without leaving Class Tests to find out. */}
      {recentAttempt && (
        <Paper
          variant="outlined"
          sx={{ p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}
        >
          <HistoryOutlinedIcon sx={{ color: 'text.secondary' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
              Last attempt: {recentAttempt.test_title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {recentAttempt.percentage == null ? '-' : `${Math.round(recentAttempt.percentage)}%`} ·{' '}
              {formatWhen(recentAttempt.submitted_at)}
            </Typography>
          </Box>
          <Button size="small" onClick={onViewPerformance} sx={{ textTransform: 'none', minHeight: 40 }}>
            See all
          </Button>
        </Paper>
      )}
    </Box>
  );
}
