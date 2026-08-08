'use client';

/**
 * One past paper, and the three things a student can do with it.
 *
 * READ the original PDF, PRACTISE its questions one at a time, or SIT it whole.
 * Three cards, in that order, because that is the order the work happens in.
 *
 * WHY CARDS AND NOT TABS
 *
 * Tabs would hide two of the three modes behind the one showing, and would put
 * the PDF in a 320px-wide column on a phone. Reading opens the same full-screen
 * viewer Study Materials uses, so the document gets the whole display and
 * inherits watermarking, the disabled context menu and reading-time tracking
 * without any of it being rebuilt here.
 *
 * WHY THE PLAYER IS NOT HERE
 *
 * Both test buttons build a URL with takeTestHref and navigate. The player is a
 * route, not a component, and every surface that has ever forked it has ended up
 * with a second grader that disagreed with the first.
 */

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Skeleton,
  Typography,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useAuthFetch } from '@/components/curriculum/shared';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import { takeTestHref } from '@/lib/test-return';
import type { NexusQBPaperDetail } from '@neram/database';

export default function PaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const theme = useTheme();
  const { activeClassroom, getToken, user, loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const paperId = String(params?.paperId || '');
  const classroomId = activeClassroom?.id ?? null;

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerToken, setViewerToken] = useState<string | null>(null);
  const [drillBusy, setDrillBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, error: loadError } = useAuthSWR<{ data: NexusQBPaperDetail }>(
    !authLoading && classroomId && paperId
      ? `/api/question-bank/student-papers/${paperId}?classroom_id=${classroomId}`
      : null,
  );
  const paper = data?.data ?? null;

  // Identity stamped over the pages, matching Study Materials exactly so the
  // same file carries the same mark wherever it is opened.
  const watermark = user
    ? [user.name, user.phone || user.email].filter(Boolean).join('   ·   ')
    : undefined;

  const returnTo = `/student/question-bank/papers/${paperId}`;

  const openReader = useCallback(async () => {
    // pdf.js cannot set an Authorization header, so the content route also takes
    // ?token=. Fetched at open time rather than held, so a long session does not
    // sit on a stale one.
    setViewerToken(await getToken());
    setViewerOpen(true);
  }, [getToken]);

  const practiceHref = useMemo(() => {
    if (!paper) return '';
    const qs = new URLSearchParams({ exam: paper.exam_type, year: String(paper.year) });
    if (paper.session) qs.set('session', paper.session);
    if (paper.shift) qs.set('shift', paper.shift);
    if (classroomId) qs.set('classroom_id', classroomId);
    return `/student/question-bank/questions?${qs.toString()}`;
  }, [paper, classroomId]);

  const startMock = () => {
    if (!paper?.test) return;
    router.push(
      takeTestHref({
        testId: paper.test.test_id,
        placementId: paper.test.placement_id,
        // The scored sitting is spent, so this one is practice. The engine keeps
        // a revision attempt off the record rather than us filtering it later.
        mode: paper.test.official_attempt_done ? 'revision' : 'official',
        returnTo,
        returnLabel: 'Back to paper',
      }),
    );
  };

  const startDrill = async () => {
    setDrillBusy(true);
    setError(null);
    try {
      const res = await authFetch(`/api/question-bank/student-papers/${paperId}/drill`, {
        method: 'POST',
        body: JSON.stringify({ classroom_id: classroomId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Could not build the drill.');
      router.push(
        takeTestHref({ testId: json.data.test_id, returnTo, returnLabel: 'Back to paper' }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the drill.');
      setDrillBusy(false);
    }
  };

  if (isLoading || authLoading) return <PaperDetailSkeleton />;

  if (loadError || !paper) {
    /*
      A 404 and a 500 are different answers and must not share a sentence.
      "Not published yet" is a statement about the paper; a failed request is a
      statement about us, and reporting the first when the second happened is
      how this feature's original bug worked.
    */
    const missing = loadError?.status === 404 || (!loadError && !paper);
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
        <BackButton onClick={() => router.push('/student/question-bank')} />
        <Alert severity={missing ? 'info' : 'warning'} sx={{ borderRadius: 2 }}>
          {missing
            ? 'This paper is not available. It may not have been published yet.'
            : `This paper could not be loaded. ${loadError?.message ?? ''}`}
        </Alert>
      </Box>
    );
  }

  const bestPct = paper.test?.best_pct ?? null;

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      <BackButton onClick={() => router.push('/student/question-bank')} />

      <Typography variant="h5" fontWeight={700} sx={{ mb: 0.25 }}>
        {paper.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.5 }}>
        {[
          paper.question_count > 0 ? `${paper.question_count} questions` : null,
          paper.total_marks ? `${paper.total_marks} marks` : null,
          paper.duration_minutes ? `${paper.duration_minutes} minutes` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Typography>

      <ProgressHero
        practicePct={paper.practice_pct}
        attempted={paper.attempted_count}
        total={paper.question_count}
        bestPct={bestPct}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* Hidden, not disabled, when there is no PDF. A card that opens nothing
            is a worse answer than no card. */}
        {paper.study_file && (
          <ActionCard
            icon={<MenuBookOutlinedIcon />}
            color={theme.palette.info.main}
            title="Read original paper"
            body={
              paper.study_file.page_count
                ? `The real exam paper, ${paper.study_file.page_count} pages, view only`
                : 'The real exam paper, view only'
            }
            done={paper.faces.read === 'done'}
            onClick={openReader}
          />
        )}

        {paper.question_count > 0 && (
          <ActionCard
            icon={<EditNoteOutlinedIcon />}
            color={theme.palette.primary.main}
            title="Practice questions"
            body={
              paper.attempted_count > 0
                ? `${paper.attempted_count} of ${paper.question_count} attempted. Pick up where you left off.`
                : `All ${paper.question_count} questions, one at a time, with solutions.`
            }
            done={paper.faces.practice === 'done'}
            onClick={() => router.push(practiceHref)}
          />
        )}

        {paper.test && (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              borderRadius: 3,
              borderColor:
                paper.faces.test === 'done'
                  ? alpha(theme.palette.success.main, 0.4)
                  : 'divider',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
              <FaceIcon color={theme.palette.success.main}>
                <TimerOutlinedIcon />
              </FaceIcon>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  Take as test
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {paper.test.official_attempt_done && bestPct != null
                    ? `You scored ${Math.round(bestPct)}%. Retakes are practice and do not change it.`
                    : paper.test.duration_minutes
                      ? `${paper.test.question_count} questions in ${paper.test.duration_minutes} minutes, exam conditions.`
                      : `${paper.test.question_count} questions, untimed.`}
                </Typography>
              </Box>
              {paper.faces.test === 'done' && (
                <CheckCircleIcon sx={{ color: 'success.main', flexShrink: 0 }} />
              )}
            </Box>

            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
              <Button
                variant="contained"
                color="success"
                fullWidth
                startIcon={<TimerOutlinedIcon />}
                onClick={startMock}
                sx={{ minHeight: 48, borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
              >
                {paper.test.official_attempt_done ? 'Practise again' : 'Start full paper'}
              </Button>
              <Button
                variant="outlined"
                fullWidth
                disabled={drillBusy}
                startIcon={
                  drillBusy ? <CircularProgress size={16} color="inherit" /> : <BoltOutlinedIcon />
                }
                onClick={startDrill}
                sx={{ minHeight: 48, borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
              >
                {drillBusy ? 'Building' : 'Quick 15'}
              </Button>
            </Box>
          </Paper>
        )}

        {/* A published paper always has at least one face, but the mock is the
            one most likely to be missing while a teacher is still setting up. */}
        {!paper.test && paper.question_count > 0 && (
          <Paper
            variant="outlined"
            sx={{ p: 2, borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.02) }}
          >
            <Typography variant="body2" color="text.secondary">
              No timed test on this paper yet. You can still practise every question above.
            </Typography>
          </Paper>
        )}
      </Box>

      <StudyFileViewer
        file={viewerOpen ? paper.study_file : null}
        token={viewerToken}
        getToken={getToken}
        onClose={() => setViewerOpen(false)}
        watermark={watermark}
        track
      />
    </Box>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      onClick={onClick}
      startIcon={<ArrowBackIcon />}
      sx={{ mb: 1.5, ml: -1, minHeight: 44, textTransform: 'none', color: 'text.secondary' }}
    >
      Question Bank
    </Button>
  );
}

function FaceIcon({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <Box
      sx={{
        width: 44,
        height: 44,
        borderRadius: 2,
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        bgcolor: alpha(color, 0.1),
        color,
      }}
    >
      {children}
    </Box>
  );
}

function ActionCard({
  icon,
  color,
  title,
  body,
  done,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  body: string;
  done: boolean;
  onClick: () => void;
}) {
  const theme = useTheme();
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      sx={{
        p: 2,
        borderRadius: 3,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: 84,
        borderColor: done ? alpha(theme.palette.success.main, 0.4) : 'divider',
        transition: theme.transitions.create(['border-color', 'box-shadow'], { duration: 180 }),
        '&:hover': { borderColor: color, boxShadow: `0 2px 10px ${alpha(color, 0.16)}` },
        '&:focus-visible': { outline: `2px solid ${color}`, outlineOffset: 2 },
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <FaceIcon color={color}>{icon}</FaceIcon>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle1" fontWeight={700} sx={{ lineHeight: 1.3 }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
      </Box>
      {done ? (
        <CheckCircleIcon sx={{ color: 'success.main', flexShrink: 0 }} />
      ) : (
        <ChevronRightIcon sx={{ color: 'text.disabled', flexShrink: 0 }} />
      )}
    </Paper>
  );
}

/**
 * Where the student stands, in one glance.
 *
 * The ring is SVG rather than a MUI CircularProgress so the track and the value
 * can carry different colours, and the number sits inside it as text: the
 * percentage has to be readable without interpreting the arc.
 */
function ProgressHero({
  practicePct,
  attempted,
  total,
  bestPct,
}: {
  practicePct: number;
  attempted: number;
  total: number;
  bestPct: number | null;
}) {
  const theme = useTheme();
  const size = 84;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(practicePct, 100));
  const complete = pct >= 100;
  const color = complete ? theme.palette.success.main : theme.palette.primary.main;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2.5,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        bgcolor: alpha(color, 0.03),
      }}
    >
      <Box sx={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} role="img" aria-label={`${pct}% of questions attempted`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={alpha(color, 0.15)}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1 }}>
            {pct}%
          </Typography>
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" fontWeight={700}>
          {total > 0 ? `${attempted} of ${total} attempted` : 'Reading only'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {bestPct != null ? `Best test score ${Math.round(bestPct)}%` : 'No test attempt yet'}
        </Typography>
      </Box>
    </Paper>
  );
}

function PaperDetailSkeleton() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 720, mx: 'auto' }}>
      <Skeleton variant="text" width={140} height={40} sx={{ mb: 1 }} />
      <Skeleton variant="text" width="70%" height={34} />
      <Skeleton variant="text" width="45%" height={20} sx={{ mb: 2.5 }} />
      <Skeleton variant="rounded" height={116} sx={{ borderRadius: 3, mb: 2.5 }} />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" height={84} sx={{ borderRadius: 3, mb: 1.5 }} />
      ))}
    </Box>
  );
}
