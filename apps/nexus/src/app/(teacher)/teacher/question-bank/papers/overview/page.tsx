'use client';

/**
 * How the class is doing on the past papers.
 *
 * The per-paper view (who sat it, which questions they got wrong) already
 * exists on each test's own results panel. This is the other axis: one student
 * per row, every published paper across, so a gap that spans the cohort is
 * visible without opening 26 papers to find it.
 */

import { Alert, Box, Button, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import PageHeader from '@/components/PageHeader';
import PaperProgressMatrix from '@/components/question-bank/PaperProgressMatrix';
import StudentListToolbar, { PausedFootnote } from '@/components/students/list/StudentListToolbar';
import { useStudentListView } from '@/components/students/list/useStudentListView';
import type { ExtraSort, ListAccessors } from '@/lib/student-list-view';
import type { NexusQBPaperMatrix } from '@neram/database';

type MatrixRow = NexusQBPaperMatrix['rows'][number];
type SortKey = 'fewest_done' | 'most_done';

const ACCESSORS: ListAccessors<MatrixRow> = { id: (r) => r.student_id, name: (r) => r.student_name };

const SORTS: ExtraSort<MatrixRow, SortKey>[] = [
  { key: 'fewest_done', label: 'Fewest papers done', compare: (a, b) => a.papers_completed - b.papers_completed },
  { key: 'most_done', label: 'Most papers done', compare: (a, b) => b.papers_completed - a.papers_completed },
];

export default function PapersOverviewPage() {
  const router = useRouter();
  const { activeClassroom, loading: authLoading } = useNexusAuthContext();
  const classroomId = activeClassroom?.id ?? null;

  const { data, isLoading, error } = useAuthSWR<{ data: NexusQBPaperMatrix }>(
    !authLoading && classroomId
      ? `/api/question-bank/papers/overview?classroom_id=${classroomId}`
      : null,
  );

  const matrix = data?.data;
  const view = useStudentListView<MatrixRow, SortKey>({
    rows: matrix?.rows,
    accessors: ACCESSORS,
    extraSorts: SORTS,
    defaultSort: 'name',
    storageKey: 'nexus:paper-progress:sort',
  });

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1200, mx: 'auto' }}>
      <Button
        onClick={() => router.push('/teacher/question-bank/papers')}
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 1, ml: -1, minHeight: 44, textTransform: 'none', color: 'text.secondary' }}
      >
        Papers
      </Button>

      <PageHeader
        title="Paper progress"
        subtitle={
          activeClassroom
            ? `${activeClassroom.name} · read, practised and tested, per student`
            : 'Read, practised and tested, per student'
        }
      />

      <Box sx={{ mt: 2 }}>
        {authLoading || isLoading ? (
          <Box>
            <Skeleton variant="rounded" height={56} sx={{ borderRadius: 3, mb: 1 }} />
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} variant="rounded" height={52} sx={{ borderRadius: 2, mb: 1 }} />
            ))}
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ borderRadius: 2 }}>
            Could not load progress. {error.message}
          </Alert>
        ) : !classroomId ? (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Pick a classroom to see how its students are doing.
          </Alert>
        ) : matrix ? (
          <>
            {matrix.papers.length > 0 && matrix.rows.length > 0 && <StudentListToolbar view={view} />}
            {matrix.rows.length > 0 && view.shown.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
                No students match this filter.
              </Typography>
            ) : (
              <PaperProgressMatrix matrix={{ ...matrix, rows: view.shown }} />
            )}
            <PausedFootnote count={view.pausedHidden} />
          </>
        ) : null}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
        A pip is filled when that part of the paper is finished, outlined when it has been started,
        and absent when the paper does not offer it.
      </Typography>
    </Box>
  );
}
