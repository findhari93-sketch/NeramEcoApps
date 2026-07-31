'use client';

/**
 * Student gated class-recap player. A late joiner watches the recorded class;
 * the video auto-pauses at each checkpoint and a mandatory quiz opens. They must
 * pass every checkpoint (in order) to complete the recap; a wrong answer sends
 * them back to rewatch that segment.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Stack,
  Skeleton,
  Chip,
  Button,
  EmptyState,
  Alert,
  alpha,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import RecapPlayer from '@/components/class-recap/RecapPlayer';
import { useWatchHeartbeat } from '@/components/class-recap/useWatchHeartbeat';
import {
  openFocusWindow,
  onFocusWindowClosed,
  focusChannelName,
} from '@/components/class-recap/openFocusWindow';
import QuizModal from '@/components/foundation/QuizModal';
import ClassResourcesSection from '@/components/timetable/ClassResourcesSection';
import { SECTION_LABEL_SX } from '@/components/timetable/timetable-theme';
import type { ClassResource } from '@/lib/class-resources';

interface RecapSection {
  id: string;
  title: string;
  description: string | null;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  sort_order: number;
  question_count: number;
  passed: boolean;
  locked: boolean;
}

interface Recap {
  id: string;
  title: string;
  status: string;
  video_duration_seconds: number | null;
  sections: RecapSection[];
  progress_status: string | null;
  /** Null for an ad-hoc recap, which can never be a catch-up backlog item. */
  scheduled_class_id: string | null;
}

interface StrippedQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function StudentClassRecapPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const recapId = params?.recapId as string;
  const { loading: authLoading, getToken } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  // Arrived here from a failed class test. The banner is the only difference:
  // the gating below is unchanged, and the server decides whether the rewatch
  // counted, so there is nothing here worth faking.
  const rewatching = searchParams?.get('rewatch') === '1';
  const [rearming, setRearming] = useState(false);
  const [rearmMsg, setRearmMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const [recap, setRecap] = useState<Recap | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [resources, setResources] = useState<ClassResource[]>([]);
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<StrippedQuestion[]>([]);
  const [completed, setCompleted] = useState(false);

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      setToken(t);
      const res = await authFetch(`/api/student/class-recaps/${recapId}`);
      const r = res.recap as Recap;
      setRecap(r);
      setResources((res.resources || []) as ClassResource[]);
      setPassedIds(new Set(r.sections.filter((s) => s.passed).map((s) => s.id)));
      setCompleted(r.progress_status === 'completed');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load the recap');
    }
  }, [authFetch, getToken, recapId]);

  useEffect(() => {
    if (!authLoading && recapId) load();
  }, [authLoading, recapId, load]);

  const playerSections = useMemo(
    () =>
      (recap?.sections || []).map((s) => ({
        id: s.id,
        end_timestamp_seconds: s.end_timestamp_seconds,
        passed: passedIds.has(s.id),
      })),
    [recap, passedIds],
  );

  // Persists the resume point and how much genuinely played. Without this the
  // stored position stays 0, which is what stopped the post-fail test re-arm
  // from ever unlocking.
  const { onTick, flushNow } = useWatchHeartbeat({ recapId, token });

  /**
   * Desktop opens a chromeless popup; anything narrow navigates in place, since
   * a popup on a phone is a worse version of a new tab.
   *
   * window.open has to be called synchronously inside this handler or the popup
   * blocker kills it, which is why nothing is awaited here.
   */
  const openFocus = useCallback(() => {
    const wide = typeof window !== 'undefined' && window.innerWidth >= 900;
    if (!wide) {
      router.push(`/student/focus/recap/${recapId}`);
      return;
    }
    const { win } = openFocusWindow(recapId);
    if (!win) {
      // Blocked. Navigating is better than a dead button with no explanation.
      router.push(`/student/focus/recap/${recapId}`);
      return;
    }
    onFocusWindowClosed(win, load);
  }, [load, recapId, router]);

  // The popup announces a passed checkpoint so this list is not stale behind it.
  useEffect(() => {
    if (!recapId || typeof BroadcastChannel === 'undefined') return;
    const ch = new BroadcastChannel(focusChannelName(recapId));
    ch.onmessage = () => load();
    return () => ch.close();
  }, [recapId, load]);

  const openQuiz = useCallback(
    async (index: number) => {
      const section = recap?.sections[index];
      if (!section) return;
      // The player has just auto-paused at the checkpoint, so this is a natural
      // moment to bank progress rather than waiting out the interval.
      flushNow();
      // Already passed → just resume (guard against a late trigger).
      if (passedIds.has(section.id)) {
        (window as any).__recapPlayer?.play();
        return;
      }
      try {
        const res = await authFetch(
          `/api/student/class-recaps/${recapId}/sections/${section.id}/quiz`,
        );
        setQuizQuestions(res.questions as StrippedQuestion[]);
        setActiveIdx(index);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load the checkpoint quiz');
      }
    },
    [authFetch, recap, recapId, passedIds, flushNow],
  );

  const submitQuiz = useCallback(
    async (answers: Record<string, string>) => {
      const section = recap?.sections[activeIdx ?? -1];
      if (!section) throw new Error('No active checkpoint');
      const res = await authFetch(
        `/api/student/class-recaps/${recapId}/sections/${section.id}/quiz`,
        { method: 'POST', body: JSON.stringify({ answers }) },
      );
      const a = res.attempt;
      if (a.passed) {
        setPassedIds((prev) => new Set(prev).add(section.id));
        if (res.recap_completed) setCompleted(true);
        flushNow();
      }
      return {
        passed: a.passed,
        score_pct: a.score_pct,
        correct_count: a.correct_count,
        total_count: a.total_count,
        min_questions_to_pass: a.min_to_pass,
        questions: a.questions_with_explanations,
      };
    },
    [authFetch, recap, recapId, activeIdx, flushNow],
  );

  // Passed → resume playback into the next segment.
  const handleContinue = useCallback(() => {
    setActiveIdx(null);
    setQuizQuestions([]);
    setTimeout(() => (window as any).__recapPlayer?.play(), 150);
  }, []);

  // Failed "Rewatch & Retry" → jump to the segment start, clamp seeking to its
  // end, re-arm the checkpoint, and play so they must rewatch before retrying.
  const handleRewatch = useCallback(() => {
    const section = recap?.sections[activeIdx ?? -1];
    setActiveIdx(null);
    setQuizQuestions([]);
    if (!section) return;
    const p = (window as any).__recapPlayer;
    if (p) {
      p.resetSectionTrigger(recap!.sections.indexOf(section));
      p.seekTo(section.start_timestamp_seconds);
      p.setRewatchMode(true, section.end_timestamp_seconds);
      setTimeout(() => p.play(), 150);
    }
  }, [recap, activeIdx]);

  const passedCount = passedIds.size;
  const total = recap?.sections.length ?? 0;

  if (errorMsg) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <EmptyState title="Cannot open this recap" description={errorMsg} />
        <Box sx={{ textAlign: 'center', mt: 2 }}>
          <Button startIcon={<ArrowBackIcon />} onClick={() => router.push('/student/dashboard')}>
            Back to dashboard
          </Button>
        </Box>
      </Box>
    );
  }

  if (!recap) {
    return (
      <Box sx={{ maxWidth: 900, mx: 'auto' }}>
        <Skeleton variant="rounded" sx={{ borderRadius: 3, aspectRatio: '16 / 9', mb: 2 }} />
        <Stack spacing={1}>
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
          <Skeleton variant="rounded" height={56} sx={{ borderRadius: 2 }} />
        </Stack>
      </Box>
    );
  }

  const activeSection = activeIdx != null ? recap.sections[activeIdx] : null;

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto', pb: 4 }}>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => router.back()}
        sx={{ mb: 1, color: 'text.secondary', minHeight: 44 }}
      >
        Back
      </Button>

      <Typography variant="h5" sx={{ fontSize: { xs: '1.2rem', sm: '1.5rem' }, letterSpacing: '-0.3px', mb: 0.5 }}>
        {recap.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Watch the class. At each checkpoint, pass a short quiz to unlock the next part.
      </Typography>

      {rewatching && recap.scheduled_class_id && (
        <Alert
          severity={rearmMsg && !rearmMsg.ok ? 'warning' : 'info'}
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button
              size="small"
              disabled={rearming}
              onClick={async () => {
                setRearming(true);
                setRearmMsg(null);
                try {
                  await authFetch(`/api/student/catchup-journey/${recap.scheduled_class_id}/rearm`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                  });
                  setRearmMsg({ text: 'Test unlocked. Take it now.', ok: true });
                } catch (err) {
                  // The server checks how far through the recording they got, so
                  // pressing this early simply fails and says why.
                  setRearmMsg({
                    text: err instanceof Error ? err.message : 'Could not unlock the test yet.',
                    ok: false,
                  });
                } finally {
                  setRearming(false);
                }
              }}
              sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap' }}
            >
              {rearming ? 'Checking...' : 'Unlock my test'}
            </Button>
          }
        >
          {rearmMsg
            ? rearmMsg.text
            : 'Watch this through to the end, then unlock the class test and try again.'}
        </Alert>
      )}

      {rewatching && rearmMsg?.ok && recap.scheduled_class_id && (
        <Button
          fullWidth
          variant="contained"
          onClick={() => router.push(`/student/catch-up/${recap.scheduled_class_id}/test`)}
          sx={{ mb: 2, minHeight: 48, textTransform: 'none', fontWeight: 700 }}
        >
          Take the class test
        </Button>
      )}

      {/* Focus Mode is the intended way to watch: no app chrome, a watermark,
          and a scrub track that will not run past an unpassed checkpoint. The
          inline player below stays for a quick look and for anyone whose popup
          is blocked. */}
      {!completed && (
        <Button
          fullWidth
          variant="contained"
          onClick={openFocus}
          startIcon={<PlayCircleOutlineIcon />}
          sx={{ mb: 2, minHeight: 56, textTransform: 'none', fontWeight: 800, borderRadius: 99 }}
        >
          {passedCount > 0 ? 'Continue in Focus Mode' : 'Watch in Focus Mode'}
        </Button>
      )}

      {/* Player */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 9',
          borderRadius: 3,
          overflow: 'hidden',
          bgcolor: '#000',
          mb: 2,
        }}
      >
        <RecapPlayer
          recapId={recap.id}
          token={token}
          sections={playerSections}
          onSectionEnd={openQuiz}
          onTimeUpdate={onTick}
        />
      </Box>

      {/* Progress */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1.5 }}>
        <Box sx={{ flex: 1, height: 8, borderRadius: 99, bgcolor: alpha('#1A2027', 0.08) }}>
          <Box
            sx={{
              width: `${total ? Math.round((passedCount / total) * 100) : 0}%`,
              height: '100%',
              borderRadius: 99,
              bgcolor: '#2E7D32',
              transition: 'width 300ms ease',
            }}
          />
        </Box>
        <Typography variant="caption" sx={{ fontWeight: 800, color: '#1B5E20', whiteSpace: 'nowrap' }}>
          {passedCount} of {total} passed
        </Typography>
      </Box>

      {completed && (
        <Chip
          icon={<CheckCircleIcon />}
          label="Completed. This class is marked done for you."
          sx={{ mb: 2, bgcolor: 'rgba(46,125,50,0.12)', color: '#1B5E20', fontWeight: 800, height: 34 }}
        />
      )}

      {/* Checkpoints */}
      {recap.sections.length === 0 ? (
        <EmptyState
          title="Checkpoints coming soon"
          description="Your teacher is still preparing the checkpoint quizzes for this class. You can watch the recording now."
        />
      ) : (
        <Stack spacing={1}>
          {recap.sections.map((s, i) => {
            const isPassed = passedIds.has(s.id);
            const priorPassed = i === 0 || passedIds.has(recap.sections[i - 1].id);
            const locked = !priorPassed && !isPassed;
            return (
              <Box
                key={s.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 1.75,
                  py: 1.25,
                  minHeight: 56,
                  borderRadius: 2.5,
                  bgcolor: 'background.paper',
                  border: '1px solid',
                  borderColor: 'divider',
                  opacity: locked ? 0.6 : 1,
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    flexShrink: 0,
                    bgcolor: isPassed ? 'rgba(46,125,50,0.12)' : alpha('#1A2027', 0.06),
                    color: isPassed ? '#1B5E20' : 'text.secondary',
                  }}
                >
                  {isPassed ? '✓' : i + 1}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }} noWrap>
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(s.start_timestamp_seconds)} to {fmt(s.end_timestamp_seconds)} · {s.question_count} question
                    {s.question_count === 1 ? '' : 's'}
                  </Typography>
                </Box>
                {isPassed ? (
                  <CheckCircleIcon sx={{ fontSize: 20, color: '#2E7D32', flexShrink: 0 }} />
                ) : locked ? (
                  <LockOutlinedIcon sx={{ fontSize: 18, color: 'text.disabled', flexShrink: 0 }} />
                ) : (
                  <Button
                    size="small"
                    startIcon={<PlayCircleOutlineIcon />}
                    onClick={() => {
                      (window as any).__recapPlayer?.seekTo(Math.max(0, s.start_timestamp_seconds));
                      (window as any).__recapPlayer?.play();
                    }}
                    sx={{ minHeight: 40, textTransform: 'none', flexShrink: 0 }}
                  >
                    Watch
                  </Button>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      {/* The teacher's reference material for this class, below the
          checkpoints. Ungated on purpose: the video is what the quiz locks, and
          a student who just failed a checkpoint needs somewhere to go and read
          rather than another closed door. */}
      {recap.scheduled_class_id && resources.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <ClassResourcesSection
            cls={{ id: recap.scheduled_class_id, title: recap.title } as any}
            getToken={getToken}
            editable={false}
            resources={resources}
            header={
              <Typography sx={{ ...SECTION_LABEL_SX, mb: 1.25 }}>
                {rewatching ? 'Revise this first' : 'Reference material from your teacher'}
              </Typography>
            }
          />
        </Box>
      )}

      {/* Mandatory checkpoint quiz */}
      {activeSection && (
        <QuizModal
          open={activeIdx != null}
          sectionTitle={activeSection.title}
          questions={quizQuestions}
          dismissable={false}
          onClose={() => {}}
          onSubmit={submitQuiz}
          onRetry={handleRewatch}
          onContinue={handleContinue}
        />
      )}
    </Box>
  );
}
