'use client';

/**
 * Foundation Books, whole cohort.
 *
 * Every tracked student against every chapter in a folder, furthest behind
 * first, because this is a worklist rather than a leaderboard. Tapping a student
 * opens their own row across all chapters, which is the view that did not exist
 * before: progress was only ever visible one chapter at a time, so "is this
 * student behind overall" meant opening ten pages and remembering.
 *
 * Graduated and past-batch students are excluded by loadClassroomRoster's
 * defaults. That is deliberate and load-bearing: the cohort here looked like 73
 * students until it turned out 39 had already left.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, Skeleton, Button, Chip, Dialog, DialogTitle, DialogContent,
  IconButton, Divider, EmptyState, useTheme, useMediaQuery,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import PageHeader from '@/components/PageHeader';
import { downloadCsv } from '@/lib/csv-export';
import {
  ChapterStatusCell,
  ChapterStatusChip,
  WatchHonesty,
  STATUS_META,
  type ChapterStatus,
} from '@/components/study-materials/chapter-status';

interface Cell {
  status: ChapterStatus;
  best_score_pct: number | null;
  revision_best_score_pct: number | null;
  video_language: string | null;
  watched_seconds: number;
  blocked_seeks: number;
  checkpoint_attempts: number;
}

interface StudentRow {
  student_id: string;
  name: string | null;
  email: string | null;
  completed_count: number;
  average_score_pct: number | null;
  cells: Record<string, Cell>;
}

interface Matrix {
  folder: { id: string; name: string };
  chapters: { id: string; title: string }[];
  students: StudentRow[];
  stats: {
    students: number;
    chapters: number;
    completion_pct: number | null;
    fully_done: number;
    not_started: number;
  };
}

export default function FoundationReportPage() {
  const params = useParams();
  const search = useSearchParams();
  const folderId = params?.folderId as string;
  const classroom = search.get('classroom');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [data, setData] = useState<Matrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openStudent, setOpenStudent] = useState<StudentRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = classroom ? `?classroom=${encodeURIComponent(classroom)}` : '';
      setData(await authFetch(`/api/study-materials/reports/folder/${folderId}${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the report');
    } finally {
      setLoading(false);
    }
  }, [authFetch, classroom, folderId]);

  useEffect(() => {
    if (!authLoading && folderId) load();
  }, [authLoading, folderId, load]);

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      'Student',
      'Email',
      'Chapters completed',
      'Average score %',
      ...data.chapters.flatMap((c) => [c.title, `${c.title} score %`, `${c.title} language`]),
    ];
    const rows = data.students.map((s) => [
      s.name,
      s.email,
      s.completed_count,
      s.average_score_pct,
      ...data.chapters.flatMap((c) => {
        const cell = s.cells[c.id];
        return [
          STATUS_META[cell?.status ?? 'not_opened'].label,
          cell?.best_score_pct ?? null,
          cell?.video_language ?? null,
        ];
      }),
    ]);
    downloadCsv(`${data.folder.name.replace(/\s+/g, '-').toLowerCase()}-progress`, headers, rows);
  };

  if (loading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="text" width={240} height={40} />
        <Skeleton variant="rounded" height={320} sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="error">
          {error || 'Could not load the report'}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 2, maxWidth: 1400, mx: 'auto' }}>
      <PageHeader
        title={data.folder.name}
        subtitle="Who has finished which chapter, and what they scored"
        breadcrumbs={[
          { label: 'Study Materials', href: '/teacher/study-materials' },
          { label: 'Progress' },
        ]}
        action={
          <Button
            startIcon={<DownloadIcon />}
            onClick={exportCsv}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            CSV
          </Button>
        }
      />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
        <Chip label={`${data.stats.students} students`} />
        <Chip label={`${data.stats.chapters} chapters`} />
        {data.stats.completion_pct != null && (
          <Chip color="primary" label={`${data.stats.completion_pct}% complete overall`} />
        )}
        <Chip color="success" variant="outlined" label={`${data.stats.fully_done} finished everything`} />
        <Chip color="warning" variant="outlined" label={`${data.stats.not_started} not started`} />
      </Box>

      {!data.students.length ? (
        <EmptyState
          title="No students to report on"
          description="This classroom has no active students, or every one of them has graduated."
        />
      ) : (
        // The matrix scrolls horizontally inside its own container, with the
        // student name pinned. The page itself must never scroll sideways.
        <Paper sx={{ overflowX: 'auto' }}>
          <Box sx={{ minWidth: 320 + data.chapters.length * 42 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 1,
                px: 1.5,
                py: 1,
                borderBottom: 1,
                borderColor: 'divider',
                position: 'sticky',
                top: 0,
                bgcolor: 'background.paper',
                zIndex: 1,
              }}
            >
              <Box sx={{ width: isMobile ? 130 : 220, flexShrink: 0, position: 'sticky', left: 0, bgcolor: 'background.paper' }}>
                <Typography variant="caption" sx={{ fontWeight: 700 }}>
                  Student
                </Typography>
              </Box>
              {data.chapters.map((c, i) => (
                <Box key={c.id} sx={{ width: 34, flexShrink: 0, textAlign: 'center' }}>
                  <Typography variant="caption" color="text.secondary" title={c.title}>
                    {i + 1}
                  </Typography>
                </Box>
              ))}
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ pr: 1 }}>
                Done
              </Typography>
            </Box>

            {data.students.map((s) => (
              <Box
                key={s.student_id}
                onClick={() => setOpenStudent(s)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setOpenStudent(s);
                }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 1,
                  minHeight: 48,
                  cursor: 'pointer',
                  borderBottom: 1,
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Box sx={{ width: isMobile ? 130 : 220, flexShrink: 0, minWidth: 0, position: 'sticky', left: 0, bgcolor: 'inherit' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {s.name || s.email}
                  </Typography>
                </Box>
                {data.chapters.map((c) => (
                  <ChapterStatusCell
                    key={c.id}
                    status={s.cells[c.id]?.status ?? 'not_opened'}
                    score={s.cells[c.id]?.best_score_pct ?? null}
                  />
                ))}
                <Box sx={{ flex: 1 }} />
                <Typography variant="body2" sx={{ fontWeight: 700, pr: 1 }}>
                  {s.completed_count}/{data.chapters.length}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      )}

      {/* View 2: one student across every chapter. */}
      <Dialog open={!!openStudent} onClose={() => setOpenStudent(null)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ pr: 6 }}>
          <Typography component="span" sx={{ fontWeight: 700 }}>
            {openStudent?.name || openStudent?.email}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {openStudent?.completed_count}/{data.chapters.length} chapters completed
            {openStudent?.average_score_pct != null && ` · average ${openStudent.average_score_pct}%`}
          </Typography>
          <IconButton onClick={() => setOpenStudent(null)} aria-label="Close" sx={{ position: 'absolute', top: 8, right: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {data.chapters.map((c) => {
            const cell = openStudent?.cells[c.id];
            return (
              <Box key={c.id} sx={{ py: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }} noWrap>
                    {c.title}
                  </Typography>
                  <ChapterStatusChip status={cell?.status ?? 'not_opened'} />
                  {cell?.best_score_pct != null && (
                    <Chip size="small" variant="outlined" label={`${Math.round(cell.best_score_pct)}%`} />
                  )}
                  {cell?.video_language && (
                    <Chip size="small" variant="outlined" label={cell.video_language.toUpperCase()} />
                  )}
                </Box>
                <WatchHonesty
                  watchedSeconds={cell?.watched_seconds ?? 0}
                  blockedSeeks={cell?.blocked_seeks ?? 0}
                  attempts={cell?.checkpoint_attempts ?? 0}
                />
                {cell?.revision_best_score_pct != null && (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    Practice best {Math.round(cell.revision_best_score_pct)}% (not counted)
                  </Typography>
                )}
                <Divider sx={{ mt: 1.25 }} />
              </Box>
            );
          })}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
