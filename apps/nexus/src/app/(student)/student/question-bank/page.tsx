'use client';

/**
 * The Question Bank home, as a student meets it.
 *
 * WHAT THIS SCREEN IS FOR
 *
 * A student arrives wanting one of two things: a specific paper, or practice
 * across everything. The papers grid answers the first and is therefore the body
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
 * it resolves, and an empty grid now has to say WHICH empty it is.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Paper,
  Skeleton,
  Tab,
  Tabs,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import StatsRow from '@/components/question-bank/StatsRow';
import PresetChips from '@/components/question-bank/PresetChips';
import StudentPaperCard, {
  StudentPaperCardSkeleton,
} from '@/components/question-bank/StudentPaperCard';
import type {
  NexusQBPaperCard,
  NexusQBPaperGroup,
  NexusQBSavedPreset,
  QBProgressStats,
} from '@neram/database';

/** The grid, at every width. 2 up at 375px, filling out from there. */
const GRID = {
  display: 'grid',
  gridTemplateColumns: {
    xs: 'repeat(auto-fill, minmax(150px, 1fr))',
    sm: 'repeat(auto-fill, minmax(200px, 1fr))',
  },
  gap: 1.5,
} as const;

export default function QuestionBankHome() {
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, loading: authLoading } = useNexusAuthContext();
  const [examIndex, setExamIndex] = useState(0);

  /**
   * The key is null until the classroom resolves, so SWR skips the request
   * rather than firing one that is certain to 400. This is the whole of the bug
   * described at the top of the file.
   */
  const classroomId = activeClassroom?.id ?? null;
  const scoped = (path: string) =>
    !authLoading && classroomId ? `${path}?classroom_id=${classroomId}` : null;

  const { data: statsRes, isLoading: statsLoading } = useAuthSWR<
    { data?: QBProgressStats } & QBProgressStats
  >(scoped('/api/question-bank/stats'));
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
  const groups = useMemo(() => papersRes?.data?.groups ?? [], [papersRes]);
  const presets = useMemo(() => presetsRes?.data ?? [], [presetsRes]);

  const totalQuestions = stats?.total_questions ?? 0;
  // Clamped rather than trusted: the tab index survives a refetch that returns
  // fewer exams, and an out-of-range index would render a blank body.
  const activeGroup = groups[Math.min(examIndex, Math.max(groups.length - 1, 0))];

  const waitingForClassroom = authLoading || (!classroomId && !papersRes);
  const loading = waitingForClassroom || papersLoading;

  const openPaper = (paper: NexusQBPaperCard) =>
    router.push(`/student/question-bank/papers/${paper.id}`);

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1040, mx: 'auto' }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.5 }}>
        Question Bank
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
          outranked the entire grid below it.
        */}
        <Button
          variant="outlined"
          size="large"
          fullWidth
          startIcon={<SearchIcon />}
          onClick={() => router.push('/student/question-bank/questions')}
          sx={{
            py: 1.5,
            minHeight: 52,
            justifyContent: 'flex-start',
            fontWeight: 600,
            borderRadius: 2,
            textTransform: 'none',
            color: 'text.primary',
            borderColor: 'divider',
            '&:hover': { borderColor: 'primary.main', bgcolor: alpha(theme.palette.primary.main, 0.04) },
          }}
        >
          <Box sx={{ textAlign: 'left', minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Search every question
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {totalQuestions > 0
                ? `${totalQuestions.toLocaleString()} questions by subject, chapter, year, difficulty`
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
          onClick={() =>
            router.push('/student/question-bank/questions?fmt=DRAWING_PROMPT')
          }
          sx={{
            py: 1.5,
            minHeight: 52,
            justifyContent: 'flex-start',
            fontWeight: 600,
            borderRadius: 2,
            textTransform: 'none',
            color: 'text.primary',
            borderColor: 'divider',
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

      <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
        Past papers
      </Typography>

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
      ) : groups.length === 0 ? (
        <PapersEmpty hasClassroom={!!classroomId} />
      ) : (
        <>
          {/* One tab per exam, mirroring the teacher's own paper browser so the
              two screens describe the same library the same way. Hidden with a
              single exam, where a lone tab is decoration. */}
          {groups.length > 1 && (
            <Tabs
              value={Math.min(examIndex, groups.length - 1)}
              onChange={(_, v: number) => setExamIndex(v)}
              variant="fullWidth"
              sx={{
                mb: 2,
                minHeight: 48,
                borderBottom: 1,
                borderColor: 'divider',
                '& .MuiTab-root': { minHeight: 48, textTransform: 'none', fontWeight: 700 },
              }}
            >
              {groups.map((g) => (
                <Tab key={g.exam_type} label={`${g.exam_label} (${g.paper_count})`} />
              ))}
            </Tabs>
          )}

          {activeGroup?.years.map(({ year, papers }) => (
            <Box key={year} sx={{ mb: 3 }}>
              <Typography
                variant="overline"
                sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.8 }}
              >
                {year}
              </Typography>
              <Box sx={{ ...GRID, mt: 0.5 }}>
                {papers.map((paper) => (
                  <StudentPaperCard key={paper.id} paper={paper} onOpen={openPaper} />
                ))}
              </Box>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}

function PapersSkeleton() {
  return (
    <Box>
      <Skeleton variant="rounded" height={48} sx={{ mb: 2, borderRadius: 1 }} />
      <Skeleton variant="text" width={60} height={20} sx={{ mb: 0.5 }} />
      <Box sx={GRID}>
        {[0, 1, 2, 3].map((i) => (
          <StudentPaperCardSkeleton key={i} />
        ))}
      </Box>
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
function PapersEmpty({ hasClassroom }: { hasClassroom: boolean }) {
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
        {hasClassroom ? 'No past papers yet' : 'No classroom yet'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {hasClassroom
          ? 'Your teachers publish papers here once they have been checked. The full question search above works in the meantime.'
          : 'Past papers appear once you have been added to a classroom.'}
      </Typography>
    </Paper>
  );
}
