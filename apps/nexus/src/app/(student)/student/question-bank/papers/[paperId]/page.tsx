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
 *
 * WHY THERE IS MORE THAN THREE CARDS NOW
 *
 * The page was a title, one ring and a row of three short cards: roughly 350px
 * of content in a 900px laptop viewport, inside a column it clamped 160px
 * narrower than the shell allowed. It read as unfinished. The section breakdown
 * below the cards is the part that was missing: "6% of 47" is not something a
 * student can act on, "Aptitude 1 of 30" is, and each row links straight to
 * those questions. The width clamp is gone; the shell's own Container owns the
 * measure now, as it does on every other student screen.
 */

import { useCallback, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthSWR } from '@/lib/nexus-swr';
import { useAuthFetch } from '@/components/curriculum/shared';
import PageHeader from '@/components/PageHeader';
import PaperSectionBreakdown from '@/components/question-bank/PaperSectionBreakdown';
import StudyFileViewer from '@/components/study-materials/StudyFileViewer';
import { takeTestHref } from '@/lib/test-return';
import type { NexusQBPaperDetail, NexusQBPaperRecentAttempt } from '@neram/database';

const QB_HOME = '/student/question-bank';

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

  /**
   * The practice link, optionally scoped to one section.
   *
   * shift is in this URL and was, for a long time, read by nobody: a paper split
   * into a forenoon and an afternoon sitting practised both at once. Both the
   * questions page and the API now read it.
   */
  const practiceHref = useCallback(
    (section?: string | null) => {
      if (!paper) return '';
      const qs = new URLSearchParams({ exam: paper.exam_type, year: String(paper.year) });
      if (paper.session) qs.set('session', paper.session);
      if (paper.shift) qs.set('shift', paper.shift);
      if (classroomId) qs.set('classroom_id', classroomId);
      if (section) qs.set('section', section);
      return `/student/question-bank/questions?${qs.toString()}`;
    },
    [paper, classroomId],
  );

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
      const json = await authFetch(`/api/question-bank/student-papers/${paperId}/drill`, {
        method: 'POST',
        body: JSON.stringify({ classroom_id: classroomId }),
      });
      router.push(
        takeTestHref({ testId: json.data.test_id, returnTo, returnLabel: 'Back to paper' }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the drill.');
      setDrillBusy(false);
    }
  };

  const metaLine = useMemo(() => {
    if (!paper) return '';
    return [
      paper.question_count > 0 ? `${paper.question_count} questions` : null,
      paper.total_marks ? `${paper.total_marks} marks` : null,
      paper.duration_minutes ? `${paper.duration_minutes} minutes` : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [paper]);

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
      <Box>
        <PageHeader title="Paper" backHref={QB_HOME} breadcrumbs={[{ label: 'Question Bank', href: QB_HOME }]} />
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
    <Box>
      {/*
        The shell already gives this page px, pb clear of the bottom nav, and a
        Container capped at lg. It used to add p and a maxWidth of 1040 on top of
        that, which double-padded the page and left ~38px of dead margin down
        each side of a laptop screen while the content inside was too narrow.
      */}
      <PageHeader
        title={paper.title}
        subtitle={metaLine}
        backHref={QB_HOME}
        breadcrumbs={[{ label: 'Question Bank', href: QB_HOME }]}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/*
        Phone: the ring, then the cards, in that order, one under the next.
        Laptop: the ring sits beside the cards instead of above them, so the fold
        carries the whole of "where am I and what can I do" rather than a
        full-width band followed by a thin row.
      */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 340px) 1fr' },
          gap: { xs: 2, md: 3 },
          alignItems: 'start',
        }}
      >
        <ProgressHero
          practicePct={paper.practice_pct}
          attempted={paper.attempted_count}
          total={paper.question_count}
          bestPct={bestPct}
        />

        <Box
          sx={{
            display: 'grid',
            // auto-fit rather than a fixed count: a paper with no PDF or no mock
            // has two cards, and they should fill the row rather than leave a gap
            // where a hidden card used to be.
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(240px, 1fr))' },
            gap: 1.5,
            alignItems: 'stretch',
          }}
        >
          {/* Hidden, not disabled, when there is no PDF. A card that opens nothing
              is a worse answer than no card. */}
          {paper.study_file && (
            <ActionCard
              icon={<MenuBookOutlinedIcon />}
              color={theme.palette.info.main}
              title="Read original paper"
              body={
                paper.study_file.page_count
                  ? `${paper.study_file.page_count} pages · view only`
                  : 'View only'
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
                  ? `${paper.attempted_count} of ${paper.question_count} attempted`
                  : `${paper.question_count} questions · with solutions`
              }
              done={paper.faces.practice === 'done'}
              // A real link, not a click handler: this is a navigation, and as a
              // handler it prefetched nothing, could not be opened in a new tab
              // and had no href in the DOM.
              href={practiceHref()}
            />
          )}

          {paper.test && (
            <Paper
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 3,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                // The test card carries two buttons, so on a wide row it takes
                // the full width beneath the other two rather than squeezing
                // them into a third of the space.
                gridColumn: { sm: '1 / -1', md: 'auto' },
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
                    {paper.test.duration_minutes
                      ? `${paper.test.question_count} questions · ${paper.test.duration_minutes} min`
                      : `${paper.test.question_count} questions · untimed`}
                  </Typography>
                </Box>
                {paper.faces.test === 'done' && (
                  <CheckCircleIcon sx={{ color: 'success.main', flexShrink: 0 }} />
                )}
              </Box>

              {/* Buttons only go side by side once a card actually has the room.
                  In the two-column layout this card is roughly half the right
                  pane, which is too narrow for two labelled buttons until lg. */}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', lg: 'row' },
                  gap: 1,
                  mt: 'auto',
                  pt: 1.5,
                }}
              >
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
              sx={{
                p: 2,
                borderRadius: 3,
                gridColumn: { sm: '1 / -1' },
                bgcolor: alpha(theme.palette.text.primary, 0.02),
              }}
            >
              <Typography variant="body2" color="text.secondary">
                No timed test on this paper yet. You can still practise every question above.
              </Typography>
            </Paper>
          )}
        </Box>
      </Box>

      <PaperSectionBreakdown
        sections={paper.sections}
        hrefForSection={(section) => practiceHref(section)}
      />

      <RecentActivity attempts={paper.recent_attempts} />

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

/**
 * One of the things you can do with this paper.
 *
 * Takes either an href or an onClick, never both. Reading opens a dialog in
 * place and genuinely is a button; practising is a navigation and genuinely is a
 * link, and rendering it as a div with a click handler cost it prefetching and
 * open-in-new-tab for no reason.
 */
function ActionCard({
  icon,
  color,
  title,
  body,
  done,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  body: string;
  done: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const theme = useTheme();

  const interaction = href
    ? ({ component: Link, href } as const)
    : ({
        component: 'div',
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.();
          }
        },
        tabIndex: 0,
        role: 'button',
      } as const);

  return (
    <Paper
      variant="outlined"
      {...(interaction as any)}
      sx={{
        p: 2,
        borderRadius: 3,
        cursor: 'pointer',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        minHeight: { xs: 84, md: 96 },
        height: '100%',
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
 *
 * Beside the cards on a laptop the card is a column, so the ring goes above the
 * text rather than next to it and both get the room to grow.
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
  const stroke = 9;
  const pct = Math.max(0, Math.min(practicePct, 100));
  const complete = pct >= 100;
  const color = complete ? theme.palette.success.main : theme.palette.primary.main;

  // The ring grows on a laptop, where the card is a column with room for it, and
  // stays compact on a phone where it sits beside its own text.
  const size = 96;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: { xs: 2, md: 2.5 },
        borderRadius: 3,
        display: 'flex',
        flexDirection: { xs: 'row', md: 'column' },
        alignItems: 'center',
        textAlign: { xs: 'left', md: 'center' },
        gap: { xs: 2, md: 1.5 },
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
          <Typography variant="h5" fontWeight={800} sx={{ color, lineHeight: 1 }}>
            {pct}%
          </Typography>
        </Box>
      </Box>

      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          {total > 0 ? `${attempted} of ${total} attempted` : 'Reading only'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {bestPct != null ? `Best test score ${Math.round(bestPct)}%` : 'No test attempt yet'}
        </Typography>
      </Box>
    </Paper>
  );
}

/**
 * The last few answers on this paper.
 *
 * Deliberately short and read-only. It answers "did I actually do anything here"
 * on a page that otherwise only shows totals, and it is the one part of the
 * screen that changes between two visits.
 */
function RecentActivity({ attempts }: { attempts: NexusQBPaperRecentAttempt[] }) {
  if (attempts.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="paper-recent-heading" sx={{ mt: 4 }}>
      <Typography
        id="paper-recent-heading"
        variant="subtitle2"
        sx={{ fontWeight: 700, mb: 1.5, color: 'text.secondary' }}
      >
        Recent
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {attempts.map((a) => (
          <Paper
            key={a.question_id}
            variant="outlined"
            sx={{
              borderRadius: 2,
              px: { xs: 1.5, md: 2 },
              py: 1,
              minHeight: 48,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            {/* Colour is not the only signal: the icon differs by shape too, so
                this reads correctly without colour vision. */}
            {a.is_correct ? (
              <CheckCircleIcon sx={{ color: 'success.main', fontSize: 20, flexShrink: 0 }} />
            ) : (
              <CancelOutlinedIcon sx={{ color: 'error.main', fontSize: 20, flexShrink: 0 }} />
            )}
            <Typography variant="body2" fontWeight={600} sx={{ flexShrink: 0 }}>
              {a.question_number != null ? `Q${a.question_number}` : 'Question'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ minWidth: 0, flex: 1 }} noWrap>
              {a.is_correct ? 'Correct' : 'Incorrect'}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {relativeDay(a.created_at)}
            </Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
}

/** "today" / "2d ago" — enough precision for a strip of five rows. */
function relativeDay(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Mirrors the real layout block for block, so nothing moves when the data lands.
 */
function PaperDetailSkeleton() {
  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Skeleton variant="text" width={160} height={20} sx={{ mb: 0.5, ml: 6 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Skeleton variant="circular" width={40} height={40} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width="55%" height={34} />
            <Skeleton variant="text" width="35%" height={20} />
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 340px) 1fr' },
          gap: { xs: 2, md: 3 },
          alignItems: 'start',
        }}
      >
        <Skeleton variant="rounded" sx={{ borderRadius: 3, height: { xs: 132, md: 232 } }} />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(auto-fit, minmax(240px, 1fr))' },
            gap: 1.5,
          }}
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="rounded" sx={{ borderRadius: 3, height: { xs: 84, md: 96 } }} />
          ))}
        </Box>
      </Box>

      <Skeleton variant="text" width={130} height={22} sx={{ mt: 4, mb: 1.5 }} />
      <Skeleton variant="rounded" height={224} sx={{ borderRadius: 3 }} />
    </Box>
  );
}
