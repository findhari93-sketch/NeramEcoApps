'use client';

/**
 * One exam's Question Bank, as a teacher works it: a to-do list of papers.
 *
 * WHAT THIS SCREEN IS FOR
 *
 * A teacher opens it to finish papers: upload the questions, key the answers,
 * write the solutions, publish. So the page opens on exactly the papers that
 * still need one of those, least finished first, with the counts above doubling
 * as the filters. Papers that are complete and live are one tap away rather than
 * in the way. The old page listed every paper by year, newest first, so the
 * nine finished ones and the seventeen unfinished ones were interleaved down a
 * 5000px column, with NATA's single empty paper as the tab it opened on.
 *
 * WHY THE EXAM IS IN THE URL
 *
 * The sidebar lists each exam (Question Bank > JEE Paper 2, NATA). Both used to
 * share this page behind tabs, which meant every job here started with picking
 * the right tab, and the "Publish all ready" button published both exams' papers
 * from inside one of them.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { notFound, useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Paper,
  Skeleton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PublishOutlinedIcon from '@mui/icons-material/PublishOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import type { BulkPublishResult, QBExamType, QBProgressStats } from '@neram/database';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStoredViewMode } from '@/hooks/useStoredViewMode';
import {
  QB_EXAM_LABELS,
  examFromSlug,
  examRelevanceFor,
  rememberQBExam,
} from '@/lib/qb-exam-routes';
import TeacherPaperTable, { TEACHER_PAPER_GRID } from '@/components/question-bank/TeacherPaperTable';
import TeacherPaperCard, { TeacherPaperCardSkeleton } from '@/components/question-bank/TeacherPaperCard';
import WorkStageCards from '@/components/question-bank/WorkStageCards';
import TeacherQBTools from '@/components/question-bank/TeacherQBTools';
import ReportedQuestionsBanner from '@/components/question-bank/ReportedQuestionsBanner';
import {
  WORK_STAGE_LABELS,
  countStages,
  isWorkStage,
  queryWorkRows,
  toWorkRows,
  type WorkPaper,
  type WorkRow,
  type WorkStage,
} from '@/components/question-bank/papers/paperWorkStage';

const PAPER_VIEWS = ['table', 'grid'] as const;
type PaperListView = (typeof PAPER_VIEWS)[number];
const PAPER_VIEW_STORAGE_KEY = 'nexus:qbTeacherExam:view';

const ACTION_BUTTON_SX = { textTransform: 'none', minHeight: 44, borderRadius: 2 } as const;

export default function TeacherQuestionBankExamPage() {
  const params = useParams<{ exam: string }>();
  const exam = examFromSlug(params?.exam);
  if (!exam) notFound();
  // useSearchParams (the stage filter) needs a boundary to render under.
  return (
    <Suspense fallback={<ExamPageSkeleton />}>
      <ExamWorkPage exam={exam} />
    </Suspense>
  );
}

function ExamWorkPage({ exam }: { exam: QBExamType }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const theme = useTheme();
  const { getToken, tokenReady } = useNexusAuthContext();
  const examLabel = QB_EXAM_LABELS[exam];

  const [view, setView] = useStoredViewMode<PaperListView>(PAPER_VIEW_STORAGE_KEY, PAPER_VIEWS, 'table');
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState<{ severity: 'success' | 'warning' | 'error'; text: string } | null>(null);

  // So the sidebar, Back links and the /question-bank redirect return here.
  useEffect(() => {
    rememberQBExam(exam);
  }, [exam]);

  // The filter lives in the URL: a shared link or a Back press lands on the
  // same list, and a refresh does not drop it.
  const rawStage = searchParams.get('stage');
  const stage: WorkStage | null = isWorkStage(rawStage) ? rawStage : null;
  const setStage = useCallback(
    (next: WorkStage | null) => {
      const qs = new URLSearchParams(searchParams.toString());
      if (next) qs.set('stage', next);
      else qs.delete('stage');
      const query = qs.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // tokenReady, not authLoading: gating on the latter queues these behind
  // /api/auth/me instead of letting them start alongside it.
  const {
    data: papersRes,
    isLoading: papersLoading,
    error: papersError,
    mutate: refetchPapers,
  } = useAuthSWR<{ data: WorkPaper[] }>(tokenReady ? '/api/question-bank/papers?solutions=1' : null);
  const { data: statsRes, isLoading: statsLoading } = useAuthSWR<{ data: QBProgressStats }>(
    tokenReady ? `/api/question-bank/stats?exam_relevance=${examRelevanceFor(exam)}` : null,
  );

  // All exams come back in one response (27 rows); this page keeps its own.
  const rows = useMemo(
    () => toWorkRows((papersRes?.data ?? []).filter((p) => p.exam_type === exam)),
    [papersRes, exam],
  );
  const counts = useMemo(() => countStages(rows), [rows]);
  const shown = useMemo(() => queryWorkRows(rows, stage), [rows, stage]);

  const openPaper = (row: WorkRow) => router.push(`/teacher/question-bank/papers/${row.paper.id}`);

  async function handlePublishShown() {
    const ids = shown.map((row) => row.paper.id);
    if (ids.length === 0) return;
    setPublishing(true);
    setNotice(null);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/question-bank/papers/bulk-publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ paper_ids: ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ severity: 'error', text: json.error || 'Could not publish the papers.' });
        return;
      }
      const { published, skipped } = json.data as BulkPublishResult;
      setNotice({
        severity: skipped.length > 0 ? 'warning' : 'success',
        text:
          `${published} paper${published === 1 ? '' : 's'} published.` +
          (skipped.length > 0
            ? ` ${skipped.length} could not be: ${skipped
                .slice(0, 3)
                .map((s) => s.label)
                .join('; ')}${skipped.length > 3 ? `; and ${skipped.length - 3} more` : ''}.`
            : ''),
      });
      await refetchPapers();
    } catch {
      setNotice({ severity: 'error', text: 'Could not publish the papers.' });
    } finally {
      setPublishing(false);
    }
  }

  const totalQuestions = statsRes?.data?.total_questions ?? 0;
  const unfinished = rows.length - counts.done;
  const bulkUploadHref = `/teacher/question-bank/bulk-upload?exam=${exam}`;

  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }}>
      {/* Header: which exam, and the two ways to add to it */}
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 1.5,
          mb: 2,
        }}
      >
        {/* No classroom here, and no student-access switch: the bank is one
            bank for every classroom, and whether students see it is the
            Question Bank switch on the Features screen (see lib/qb-auth.ts). */}
        <Box sx={{ flex: '1 1 240px', minWidth: 0 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: 'block', lineHeight: 1.6, letterSpacing: 1, fontWeight: 700 }}
          >
            Question Bank
          </Typography>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {examLabel}
          </Typography>
          {statsLoading ? (
            <Skeleton variant="text" width={120} sx={{ mt: 0.5 }} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {totalQuestions.toLocaleString()} questions
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: { xs: '100%', md: 'auto' },
          }}
        >
          <Button
            variant="outlined"
            startIcon={<AddOutlinedIcon />}
            onClick={() => router.push('/teacher/question-bank/new')}
            sx={{ ...ACTION_BUTTON_SX, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap' }}
          >
            Add Question
          </Button>
          <Button
            variant="contained"
            startIcon={<UploadFileOutlinedIcon />}
            onClick={() => router.push(bulkUploadHref)}
            sx={{ ...ACTION_BUTTON_SX, flex: { xs: 1, md: 'none' }, whiteSpace: 'nowrap' }}
          >
            Bulk Upload
          </Button>
        </Box>
      </Box>

      <ReportedQuestionsBanner />

      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 2, borderRadius: 2 }}>
          {notice.text}
        </Alert>
      )}

      {/* The counts that are the filters */}
      <Box sx={{ mb: 2 }}>
        <WorkStageCards
          counts={counts}
          selected={stage}
          onSelect={setStage}
          loading={papersLoading || (!papersRes && !papersError)}
        />
      </Box>

      {/* What the list below is showing, and the way back to everything unfinished */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1,
          mb: 1,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h2" fontWeight={700}>
            {stage ? WORK_STAGE_LABELS[stage] : 'Still to finish'}
          </Typography>
          {papersRes && (
            <Typography variant="body2" color="text.secondary">
              {shown.length} paper{shown.length === 1 ? '' : 's'}
            </Typography>
          )}
          {/* An empty filter already offers this inside its empty state. */}
          {stage && shown.length > 0 && (
            <Button size="small" onClick={() => setStage(null)} sx={{ ...ACTION_BUTTON_SX, minHeight: 44 }}>
              Show all unfinished
            </Button>
          )}
        </Box>

        {shown.length > 0 && (
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_e, next: PaperListView | null) => {
              if (next) setView(next);
            }}
            size="small"
            aria-label="Papers layout"
            sx={{
              bgcolor: 'background.paper',
              borderRadius: 2,
              '& .MuiToggleButton-root': {
                minWidth: 44,
                minHeight: 44,
                px: 1.25,
                borderRadius: 2,
                color: 'text.secondary',
              },
              '& .Mui-selected': {
                bgcolor: alpha(theme.palette.primary.main, 0.14),
                color: 'primary.main',
                '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.2) },
              },
            }}
          >
            <ToggleButton value="table" aria-label="Table view">
              <Tooltip title="Table" arrow><TableRowsOutlinedIcon fontSize="small" /></Tooltip>
            </ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view">
              <Tooltip title="Grid" arrow><GridViewOutlinedIcon fontSize="small" /></Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      {/* Publishing is its own step, and only ever for the papers on screen */}
      {stage === 'readyToPublish' && shown.length > 0 && (
        <Paper
          variant="outlined"
          sx={{
            p: 1.5,
            mb: 1.5,
            borderRadius: 2,
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 1.5,
            borderColor: alpha(theme.palette.primary.main, 0.4),
            bgcolor: alpha(theme.palette.primary.main, 0.04),
          }}
        >
          <Typography variant="body2" sx={{ flex: '1 1 220px' }}>
            These papers are finished. Students see nothing until a paper is published.
          </Typography>
          <Button
            variant="contained"
            startIcon={<PublishOutlinedIcon />}
            disabled={publishing}
            onClick={handlePublishShown}
            sx={ACTION_BUTTON_SX}
          >
            {publishing ? 'Publishing...' : `Publish these ${shown.length}`}
          </Button>
        </Paper>
      )}

      {papersLoading || (!papersRes && !papersError) ? (
        <Box sx={TEACHER_PAPER_GRID}>
          {[0, 1, 2, 3].map((i) => (
            <TeacherPaperCardSkeleton key={i} />
          ))}
        </Box>
      ) : papersError ? (
        <Alert
          severity="error"
          sx={{ borderRadius: 2 }}
          action={
            <Button color="inherit" onClick={() => refetchPapers()} sx={{ ...ACTION_BUTTON_SX, minHeight: 36 }}>
              Try again
            </Button>
          }
        >
          Papers could not be loaded. {papersError.message}
        </Alert>
      ) : rows.length === 0 ? (
        <EmptyList
          icon={<DescriptionOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />}
          title={`No ${examLabel} papers uploaded yet`}
          body="Upload a paper and it appears here with what it still needs."
          action={
            <Button
              variant="contained"
              startIcon={<UploadFileOutlinedIcon />}
              onClick={() => router.push(bulkUploadHref)}
              sx={ACTION_BUTTON_SX}
            >
              Upload a paper
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyList
          icon={<TaskAltOutlinedIcon sx={{ fontSize: 32, color: 'success.main' }} />}
          title={stage ? `No papers in ${WORK_STAGE_LABELS[stage]}` : `Every ${examLabel} paper is complete and live`}
          body={stage ? 'Nothing is waiting at this step.' : 'Nothing is left to upload, key, solve or publish.'}
          action={
            stage ? (
              <Button variant="outlined" onClick={() => setStage(null)} sx={ACTION_BUTTON_SX}>
                Show all unfinished
              </Button>
            ) : null
          }
        />
      ) : view === 'table' ? (
        <TeacherPaperTable rows={shown} onOpen={openPaper} />
      ) : (
        <Box sx={TEACHER_PAPER_GRID}>
          {shown.map((row) => (
            <TeacherPaperCard key={row.paper.id} row={row} onOpen={openPaper} />
          ))}
        </Box>
      )}

      {/* The finished papers, out of the way but one tap from view */}
      {!stage && counts.done > 0 && unfinished > 0 && (
        <Button
          onClick={() => setStage('done')}
          startIcon={<TaskAltOutlinedIcon />}
          sx={{ ...ACTION_BUTTON_SX, mt: 1.5, color: 'text.secondary' }}
        >
          {counts.done} paper{counts.done === 1 ? ' is' : 's are'} complete and live. Show them
        </Button>
      )}

      <TeacherQBTools exam={exam} />
    </Box>
  );
}

function EmptyList({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          mx: 'auto',
          mb: 1.5,
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha(theme.palette.primary.main, 0.08),
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" component="p" fontWeight={700} sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: action ? 2 : 0 }}>
        {body}
      </Typography>
      {action}
    </Paper>
  );
}

function ExamPageSkeleton() {
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: 2 }} aria-busy="true">
      <Skeleton variant="text" width={110} height={20} />
      <Skeleton variant="text" width={180} height={36} sx={{ mb: 2 }} />
      <Box sx={TEACHER_PAPER_GRID}>
        {[0, 1, 2, 3].map((i) => (
          <TeacherPaperCardSkeleton key={i} />
        ))}
      </Box>
    </Box>
  );
}
