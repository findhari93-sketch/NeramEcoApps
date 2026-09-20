'use client';

/**
 * Everything a teacher has set: what to do now, exams, optional practice, and
 * the consolidated record of everything the class has ever had.
 *
 * Two rules shape the layout, both learned from watching this screen on a
 * 360px phone.
 *
 * EMPTY IS ONE LINE. "Due now" used to render an icon, a title, a subtitle and
 * a bordered box holding three lines of prose in order to say "nothing", which
 * ate most of a viewport before the student reached anything they could act on.
 * A zero beside the heading and one short line says the same thing.
 *
 * SECTIONS DO NOT EXPLAIN THEMSELVES. The subtitles here were teacher-voice
 * documentation reprinted on every load. A student reads that once. The card
 * carries what matters now.
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
import TestCardGrid from './TestCardGrid';

export interface RecentAttempt {
  attempt_id: string;
  test_title: string;
  percentage: number | null;
  submitted_at: string | null;
}

/**
 * 'missed' was absent, so an exam a student was absent for fell through every
 * filter including "All", and could not be found again from this screen.
 */
const STATUS_FILTERS: Array<{ key: TestStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'To do' },
  { key: 'upcoming', label: 'Coming up' },
  { key: 'done', label: 'Done' },
  { key: 'missed', label: 'Missed' },
  { key: 'closed', label: 'Closed' },
];

export interface ClassTestsTabData {
  due: StudentTest[];
  all: StudentTest[];
  exams: StudentTest[];
  practice_groups: Array<{ key: string; label: string; tests: StudentTest[] }>;
}

export interface TestCardHandlers {
  onStart: (t: StudentTest) => void;
  onReschedule?: (t: StudentTest) => void;
  onAskTeacher?: (t: StudentTest) => void;
  onReview?: (t: StudentTest) => void;
  onCatchUp?: (href: string) => void;
  /** "Tell your teacher why" on a test they owed and did not sit. */
  onExplain?: (t: StudentTest) => void;
}

export default function ClassTestsTab({
  data,
  hasActiveClassroom,
  recentAttempt,
  onViewPerformance,
  ...handlers
}: {
  data: ClassTestsTabData;
  hasActiveClassroom: boolean;
  recentAttempt?: RecentAttempt;
  onViewPerformance: () => void;
} & TestCardHandlers) {
  const [statusFilter, setStatusFilter] = useState<TestStatus | 'all'>('all');

  const totalPractice = useMemo(
    () => data.practice_groups.reduce((n, g) => n + g.tests.length, 0),
    [data.practice_groups],
  );

  // Exams have their own section above, so they are excluded here to stop the
  // same paper appearing twice.
  const allTests = useMemo(() => data.all.filter((t) => !t.is_exam), [data.all]);
  const visibleAllTests = useMemo(
    () => (statusFilter === 'all' ? allTests : allTests.filter((t) => t.status === statusFilter)),
    [allTests, statusFilter],
  );

  return (
    <Box data-testid="class-tests">
      {/* Rendered even when empty. Unmounting it is what made teacher-set tests
          look as though they did not exist. */}
      <TestsSection icon={<AssignmentOutlinedIcon />} title="To do" count={data.due.length}>
        {data.due.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {!hasActiveClassroom
              ? 'Pick your class at the top of the screen to see the tests set for it.'
              : 'Nothing due right now.'}
          </Typography>
        ) : (
          // A queue, so one column at every width: two columns of "what do I do
          // now" hands the reader an ordering decision the page already made.
          <TestCardGrid queue>
            {data.due.map((t) => (
              <StudentTestCard key={`${t.id}-${t.placement_id}`} test={t} emphasis {...handlers} />
            ))}
          </TestCardGrid>
        )}
      </TestsSection>

      <ExamsSection exams={data.exams} {...handlers} />

      {totalPractice > 0 && (
        <TestsSection icon={<FitnessCenterOutlinedIcon />} title="Practice" count={totalPractice}>
          {data.practice_groups.map((g) => (
            <Box key={g.key} sx={{ mb: 2 }}>
              <Typography
                variant="caption"
                component="h3"
                sx={{ fontWeight: 700, color: 'text.secondary', display: 'block', mb: 0.75 }}
              >
                {g.label}
              </Typography>
              <TestCardGrid>
                {g.tests.map((t) => (
                  <StudentTestCard key={t.id} test={t} emphasis={false} {...handlers} />
                ))}
              </TestCardGrid>
            </Box>
          ))}
        </TestsSection>
      )}

      {/* The consolidated record. Everything the class has had, closed and
          missed included, so "did I miss one" has an answer. */}
      {allTests.length > 0 && (
        <TestsSection icon={<ClassOutlinedIcon />} title="All class tests" count={allTests.length}>
          <Box
            role="group"
            aria-label="Filter class tests"
            sx={{
              display: 'flex',
              gap: 0.75,
              mb: 1.5,
              // Scrolls INSIDE the row. The page itself must never scroll
              // sideways, which is what a wrapping chip row costs on a phone.
              overflowX: 'auto',
              pb: 0.5,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
            }}
          >
            {STATUS_FILTERS.map((f) => {
              const n = f.key === 'all' ? allTests.length : allTests.filter((t) => t.status === f.key).length;
              if (n === 0 && f.key !== 'all') return null;
              const on = statusFilter === f.key;
              return (
                <Chip
                  key={f.key}
                  label={`${f.label} ${n}`}
                  size="small"
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  onClick={() => setStatusFilter(f.key)}
                  aria-pressed={on}
                  sx={{ height: 36, flexShrink: 0, cursor: 'pointer', fontWeight: on ? 700 : 500 }}
                />
              );
            })}
          </Box>

          {visibleAllTests.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nothing here with that filter.
            </Typography>
          ) : (
            <TestCardGrid>
              {visibleAllTests.map((t) => (
                <StudentTestCard key={`${t.id}-${t.placement_id}`} test={t} emphasis={false} {...handlers} />
              ))}
            </TestCardGrid>
          )}
        </TestsSection>
      )}

      {/* Just enough to answer "how did that last one go" without leaving this
          tab. The label sits on its own line: as one string with the title it
          truncated to "Last attempt: Perspec..." on a phone, clipping the only
          personal thing on the screen. */}
      {recentAttempt && (
        <TestsSection
          icon={<HistoryOutlinedIcon />}
          title="Last attempt"
          action={
            <Button size="small" onClick={onViewPerformance} sx={{ textTransform: 'none', minHeight: 44 }}>
              See all
            </Button>
          }
        >
          <Paper elevation={0} sx={{ p: 1.5, borderRadius: 2, border: 1, borderColor: 'divider' }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {recentAttempt.test_title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {recentAttempt.percentage == null ? '-' : `${Math.round(recentAttempt.percentage)}%`} ·{' '}
              {formatWhen(recentAttempt.submitted_at)}
            </Typography>
          </Paper>
        </TestsSection>
      )}
    </Box>
  );
}
