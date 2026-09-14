'use client';

/**
 * One exam's Question Bank, as a student meets it.
 *
 * WHAT THIS SCREEN IS FOR
 *
 * A student arrives wanting one of two things: a specific paper, or practice
 * across everything. The papers list answers the first and is therefore the body
 * of the page; the search bar answers the second and is one row above it.
 *
 * It used to be the other way round: a full-width "Browse Full Question Bank"
 * button over a panel that said "No papers available yet". That panel was not
 * empty because there were no papers. It was empty because this page asked
 * /stats and /exam-tree without a classroom_id, and verifyQBAccess answers a
 * student with no classroom with a 400. Three requests failed, three states
 * stayed null, and a bank of 3297 questions rendered as "All 0 Questions".
 *
 * Hence: every request here is keyed on the active classroom and skipped until
 * it resolves, and an empty list now has to say WHICH empty it is.
 *
 * WHY THE EXAM IS IN THE URL
 *
 * Both exams used to share one page with a tab each, shown only when both had
 * published papers. The sidebar now lists each exam, so the tab is gone and
 * everything below (search, drawing practice, stats) is scoped to this exam.
 */

import { useEffect, useMemo } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import HistoryEduOutlinedIcon from '@mui/icons-material/HistoryEduOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useStoredViewMode } from '@/hooks/useStoredViewMode';
import {
  QB_EXAM_LABELS,
  examFromSlug,
  examRelevanceFor,
  rememberQBExam,
} from '@/lib/qb-exam-routes';
import StatsRow from '@/components/question-bank/StatsRow';
import PresetChips from '@/components/question-bank/PresetChips';
import StudentPaperCard, {
  StudentPaperCardSkeleton,
} from '@/components/question-bank/StudentPaperCard';
import StudentPaperTable from '@/components/question-bank/StudentPaperTable';
import type {
  NexusQBPaperCard,
  NexusQBPaperGroup,
  NexusQBSavedPreset,
  QBExamType,
  QBProgressStats,
} from '@neram/database';

/**
 * The grid, at every width. 2 up at 375px, filling out from there.
 *
 * The md step matters now the page uses the shell's full measure: auto-fill with
 * a 200px minimum would answer the extra width with more, smaller cards, which
 * is the opposite of what a bigger screen is for.
 */
const GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'repeat(auto-fill, minmax(150px, 1fr))',
    sm: 'repeat(auto-fill, minmax(200px, 1fr))',
    md: 'repeat(auto-fill, minmax(260px, 1fr))',
  },
  gap: 1.5,
} as const;

const PAPER_VIEWS = ['table', 'grid'] as const;
type PaperListView = (typeof PAPER_VIEWS)[number];
const PAPER_VIEW_STORAGE_KEY = 'nexus:qbStudentPapers:view';

/** The two big entry buttons share one look. */
const ENTRY_BUTTON_SX = {
  py: 1.5,
  minHeight: 52,
  justifyContent: 'flex-start',
  fontWeight: 600,
  borderRadius: 2,
  textTransform: 'none',
  color: 'text.primary',
  borderColor: 'divider',
} as const;

export default function StudentQuestionBankExamPage() {
  const params = useParams<{ exam: string }>();
  const exam = examFromSlug(params?.exam);
  if (!exam) notFound();
  return <ExamHome exam={exam} />;
}

function ExamHome({ exam }: { exam: QBExamType }) {
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, loading: authLoading } = useNexusAuthContext();
  const [view, setView] = useStoredViewMode<PaperListView>(
    PAPER_VIEW_STORAGE_KEY,
    PAPER_VIEWS,
    'table',
  );
  const examLabel = QB_EXAM_LABELS[exam];

  // So the QB tab, the sidebar and every Back link return here next time.
  useEffect(() => {
    rememberQBExam(exam);
  }, [exam]);

  /**
   * The key is null until the classroom resolves, so SWR skips the request
   * rather than firing one that is certain to 400. This is the whole of the bug
   * described at the top of the file.
   */
  const classroomId = activeClassroom?.id ?? null;
  const scoped = (path: string, extra = '') =>
    !authLoading && classroomId ? `${path}?classroom_id=${classroomId}${extra}` : null;

  const { data: statsRes, isLoading: statsLoading } = useAuthSWR<
    { data?: QBProgressStats } & QBProgressStats
  >(scoped('/api/question-bank/stats', `&exam_relevance=${examRelevanceFor(exam)}`));
  const {
    data: papersRes,
    isLoading: papersLoading,
    error: papersError,
  } = useAuthSWR<{ data: { groups: NexusQBPaperGroup[] } }>(
    scoped('/api/question-bank/student-papers'),
  );
  const { data: presetsRes, isLoading: presetsLoading } = useAuthSWR<{
    data?: NexusQBSavedPreset[];
  }>(scoped('/api/question-bank/presets'));

  const stats = (statsRes?.data ?? statsRes ?? null) as QBProgressStats | null;
  const presets = useMemo(() => presetsRes?.data ?? [], [presetsRes]);

  // The API still answers with every exam, grouped. One route for both pages,
  // one cache entry, and the other exam's page is instant when opened next.
  const group = useMemo(
    () => papersRes?.data?.groups?.find((g) => g.exam_type === exam) ?? null,
    [papersRes, exam],
  );
  // Flattened, not grouped by year: a year with one paper used to get its own
  // near-empty grid row. The API already sorts newest-year-first, and every
  // card's own short_title already names its year, so nothing is lost.
  const papers = useMemo(() => group?.years.flatMap((y) => y.papers) ?? [], [group]);

  const totalQuestions = stats?.total_questions ?? 0;
  const waitingForClassroom = authLoading || (!classroomId && !papersRes);
  const loading = waitingForClassroom || papersLoading;

  const questionsHref = (extra?: Record<string, string>) =>
    `/student/question-bank/questions?${new URLSearchParams({ exam, ...extra }).toString()}`;

  const openPaper = (paper: NexusQBPaperCard) =>
    router.push(`/student/question-bank/papers/${paper.id}`);

  return (
    // The shell already supplies px, a pb clear of the bottom nav and a Container
    // capped at lg. Padding and a second, narrower cap on top of that left the
    // grid ~160px narrower than the page it sits in, and made this screen and
    // the paper screen disagree about the measure while linking to each other.
    <Box>
      <Typography
        variant="overline"
        color="text.secondary"
        sx={{ display: 'block', lineHeight: 1.6, letterSpacing: 1, fontWeight: 700 }}
      >
        Question Bank
      </Typography>
      <Typography variant="h5" component="h1" fontWeight={700} sx={{ mb: 0.5 }}>
        {examLabel}
      </Typography>

      <Box sx={{ mb: 2 }}>
        <StatsRow stats={stats} loading={statsLoading || waitingForClassroom} compact />
      </Box>

      {/*
        Search and Drawing practice sit side by side from `sm` up instead of
        each claiming a full-width row: two related entry points into the same
        bank, so they read as a pair rather than a queue.
      */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.5,
          mb: 3,
        }}
      >
        {/*
          Search is an outlined row, not a filled button. It is the secondary path
          now that papers carry the page, and a full-width contained button here
          outranked the entire list below it.
        */}
        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<SearchIcon />}
          onClick={() => router.push(questionsHref())}
          sx={{
            ...ENTRY_BUTTON_SX,
            '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
          }}
        >
          <Box sx={{ textAlign: 'left', minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Search every question
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {totalQuestions > 0
                ? `${totalQuestions.toLocaleString()} ${examLabel} questions by subject, chapter, year`
                : 'By subject, chapter, year, difficulty'}
            </Typography>
          </Box>
        </Button>

        {/* Drawing practice.
            The question_format filter has always worked; what was missing was a
            door to it. A drawing is the one question type a student cannot answer
            by tapping, so burying it in a filter drawer hid the whole section. */}
        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<BrushOutlinedIcon />}
          onClick={() => router.push(questionsHref({ fmt: 'DRAWING_PROMPT' }))}
          sx={{
            ...ENTRY_BUTTON_SX,
            '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
          }}
        >
          <Box sx={{ textAlign: 'left', minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Drawing practice
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              Draw it, upload a photo, and your teacher marks it
            </Typography>
          </Box>
        </Button>
      </Box>

      {(presetsLoading || presets.length > 0) && (
        <Box sx={{ mb: 3 }}>
          <PresetChips
            presets={presets}
            loading={presetsLoading}
            onSelect={(preset) =>
              router.push(`/student/question-bank/questions?preset=${preset.id}`)
            }
          />
        </Box>
      )}

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
          mb: 1,
        }}
      >
        <Typography variant="subtitle1" component="h2" fontWeight={700}>
          Past papers
        </Typography>

        {!loading && !papersError && papers.length > 0 && (
          <ToggleButtonGroup
            value={view}
            exclusive
            onChange={(_e, next: PaperListView | null) => {
              if (next) setView(next);
            }}
            size="small"
            aria-label="Past papers layout"
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

      {loading ? (
        <PapersSkeleton />
      ) : papersError ? (
        /*
          A failed request is not an empty library.
          This page already made exactly this mistake once: /stats and
          /exam-tree were 400ing and the screen reported "All 0 Questions" as
          though it were a fact about the bank. Falling back to the empty state
          on an error here would rebuild the same lie one level down, and it
          would be even harder to spot, because "no past papers yet" is a
          perfectly ordinary thing for this screen to say.
        */
        <PapersError message={papersError.message} />
      ) : papers.length === 0 ? (
        <PapersEmpty hasClassroom={!!classroomId} examLabel={examLabel} />
      ) : view === 'table' ? (
        <StudentPaperTable papers={papers} onOpen={openPaper} />
      ) : (
        <Box sx={GRID}>
          {papers.map((paper) => (
            <StudentPaperCard key={paper.id} paper={paper} onOpen={openPaper} />
          ))}
        </Box>
      )}

      {/* NATA's own extras. Both pages existed with no door to either. */}
      {exam === 'NATA' && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" component="h2" fontWeight={700} sx={{ mb: 1 }}>
            More for NATA
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<HistoryEduOutlinedIcon />}
              onClick={() => router.push('/student/question-bank/recalled')}
              sx={ENTRY_BUTTON_SX}
            >
              Recalled papers
            </Button>
            <Button
              variant="outlined"
              fullWidth
              startIcon={<InsightsOutlinedIcon />}
              onClick={() => router.push('/student/question-bank/topic-intelligence')}
              sx={ENTRY_BUTTON_SX}
            >
              Topics that come up most
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function PapersSkeleton() {
  return (
    <Box sx={GRID}>
      {[0, 1, 2, 3].map((i) => (
        <StudentPaperCardSkeleton key={i} />
      ))}
    </Box>
  );
}

/**
 * The request did not come back.
 *
 * Says so plainly, and offers the one thing that helps, rather than dressing a
 * failure up as an answer. The question search above still works, because it
 * asks a different route.
 */
function PapersError({ message }: { message?: string }) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 3,
        borderRadius: 3,
        textAlign: 'center',
        borderColor: alpha(theme.palette.warning.main, 0.4),
        bgcolor: alpha(theme.palette.warning.main, 0.04),
      }}
    >
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        Past papers could not be loaded
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {message || 'Something went wrong on our side.'}
      </Typography>
      <Button
        variant="outlined"
        onClick={() => window.location.reload()}
        sx={{ minHeight: 44, borderRadius: 2, textTransform: 'none' }}
      >
        Try again
      </Button>
    </Paper>
  );
}

/**
 * Which empty this is.
 *
 * The old copy said "No papers available yet" whether the bank was empty, the
 * classroom was not linked, or the request had failed, which is how a 400 came
 * to read as an editorial statement about the library.
 */
function PapersEmpty({ hasClassroom, examLabel }: { hasClassroom: boolean; examLabel: string }) {
  const theme = useTheme();
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          mx: 'auto',
          mb: 2,
          display: 'grid',
          placeItems: 'center',
          bgcolor: alpha(theme.palette.primary.main, 0.08),
        }}
      >
        <LibraryBooksOutlinedIcon sx={{ fontSize: 32, color: 'primary.main' }} />
      </Box>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
        {hasClassroom ? `No ${examLabel} papers yet` : 'No classroom yet'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hasClassroom
          ? 'Your teachers publish papers here once they have been checked. The question search above works in the meantime.'
          : 'Past papers appear once you have been added to a classroom.'}
      </Typography>
    </Paper>
  );
}
