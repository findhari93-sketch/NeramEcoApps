'use client';

/**
 * Watching a gated class recap: the player, the checkpoint list, and the quiz.
 *
 * Extracted from the standalone recap page so the per-class catch-up workspace
 * can render the same thing inline instead of navigating away. A student used to
 * bounce between three screens for one class (the list, the steps page, the
 * player) with Back landing somewhere different depending on how far through
 * they were. This is the piece that makes it one.
 *
 * It owns the watching and nothing else. Whether the class is finished, what the
 * assignment is, and whether the clock is running are all the workspace's
 * business, which is why the only thing this reports upward is `onProgress`.
 *
 * Two shapes, chosen by the server, never by this file. `gated` is the catch-up
 * experience: checkpoints bind, a quiz opens at each one, and the scrub track
 * stops at the checkpoint owed. `revision` is for a student who sat in the class
 * or has already cleared it, and it is the whole screen relaxed rather than a
 * flag on the player: no Focus Mode, no progress bar, no padlocks, and every
 * checkpoint is a chapter you can jump to. Forcing someone who was in the room
 * to answer their way through a class to reach the ten minutes they wanted to
 * see again is the friction this avoids.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Stack, Skeleton, Chip, Button, EmptyState, Alert, alpha } from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import RecapPlayer from './RecapPlayer';
import { useWatchHeartbeat } from './useWatchHeartbeat';
import { openFocusWindow, onFocusWindowClosed, focusChannelName } from './openFocusWindow';
import QuizModal from '@/components/foundation/QuizModal';
import type { VideoGateMode } from '@/lib/video-gate';

export interface RecapSection {
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

export interface Recap {
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

interface RecapWatchProps {
  recapId: string;
  /** Fires whenever a checkpoint is passed, and again when the recap completes. */
  onProgress?: (state: { passed: number; total: number; completed: boolean }) => void;
  /** Hide the Focus Mode button where the surrounding page has its own. */
  showFocusButton?: boolean;
  /** Called with the recap once loaded, so a host page can use its title. */
  onLoaded?: (recap: Recap) => void;
  /** Told the mode the server chose, for pages that word their chrome around it. */
  onWatchMode?: (mode: VideoGateMode) => void;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecapWatch({
  recapId,
  onProgress,
  showFocusButton = true,
  onLoaded,
  onWatchMode,
}: RecapWatchProps) {
  const router = useRouter();
  const { loading: authLoading, getToken } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [recap, setRecap] = useState<Recap | null>(null);
  /**
   * Starts strict and is only ever relaxed by the server's answer. A render
   * between mount and the fetch landing therefore gates, which is the safe way
   * round: the alternative would flash an open scrub track at a student who owes
   * the class.
   */
  const [watchMode, setWatchMode] = useState<VideoGateMode>('gated');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [passedIds, setPassedIds] = useState<Set<string>>(new Set());
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<StrippedQuestion[]>([]);
  const [completed, setCompleted] = useState(false);
  /** Separate from errorMsg: a quiz that will not load must not kill the player. */
  const [quizError, setQuizError] = useState<string | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  /**
   * Where the quiz drawer portals. Non-null only while the player is genuinely
   * fullscreen, because the browser paints nothing outside the fullscreen
   * element's subtree and a quiz on document.body would simply not appear.
   *
   * State rather than a ref: a ref mutation does not re-render, so the drawer
   * would keep whatever container it was first given.
   */
  const [quizHost, setQuizHost] = useState<HTMLElement | null>(null);

  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const onWatchModeRef = useRef(onWatchMode);
  onWatchModeRef.current = onWatchMode;

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      setToken(t);
      const res = await authFetch(`/api/student/class-recaps/${recapId}`);
      const r = res.recap as Recap;
      setRecap(r);
      // Anything the server did not say is 'gated'. There is no client default
      // that opens the gate.
      const mode: VideoGateMode = res.watch_mode === 'revision' ? 'revision' : 'gated';
      setWatchMode(mode);
      onWatchModeRef.current?.(mode);
      const passed = new Set(r.sections.filter((s) => s.passed).map((s) => s.id));
      setPassedIds(passed);
      setCompleted(r.progress_status === 'completed');
      onLoadedRef.current?.(r);
      onProgressRef.current?.({
        passed: passed.size,
        total: r.sections.length,
        completed: r.progress_status === 'completed',
      });
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
      // Belt and braces. RecapPlayer already refuses to raise a boundary outside
      // gated mode, but this component is what actually puts a non-dismissable
      // drawer over the picture, so it declines on its own account too.
      if (watchMode !== 'gated') return;
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
      // Re-entrant by design. The player re-fires the boundary on every tick
      // while the student sits at it, so the guard stops a second fetch
      // stacking on the first.
      if (loadingQuiz) return;
      setLoadingQuiz(true);
      setQuizError(null);
      try {
        const res = await authFetch(
          `/api/student/class-recaps/${recapId}/sections/${section.id}/quiz`,
        );
        setQuizQuestions(res.questions as StrippedQuestion[]);
        setActiveIdx(index);
      } catch (err) {
        // Deliberately NOT errorMsg. That replaces the whole component with an
        // empty state, which unmounts the player and loses the position, so one
        // failed fetch used to cost the student their place in the class.
        setQuizError(err instanceof Error ? err.message : 'Failed to load the checkpoint quiz');
      } finally {
        setLoadingQuiz(false);
      }
    },
    [authFetch, recap, recapId, passedIds, flushNow, loadingQuiz, watchMode],
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
        setPassedIds((prev) => {
          const next = new Set(prev).add(section.id);
          onProgressRef.current?.({
            passed: next.size,
            total: recap?.sections.length ?? 0,
            completed: !!res.recap_completed,
          });
          return next;
        });
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

  // Failed "Rewatch & Retry" → back to the start of the segment, and they watch
  // it again. Nothing to re-arm: the checkpoint they just failed is still the
  // first unpassed one, so the boundary at its end is already standing and will
  // stop them there however they get back to it.
  const handleRewatch = useCallback(() => {
    const section = recap?.sections[activeIdx ?? -1];
    setActiveIdx(null);
    setQuizQuestions([]);
    if (!section) return;
    const p = (window as any).__recapPlayer;
    if (p) {
      p.seekTo(section.start_timestamp_seconds);
      setTimeout(() => p.play(), 150);
    }
  }, [recap, activeIdx]);

  const passedCount = passedIds.size;
  const total = recap?.sections.length ?? 0;
  const revising = watchMode !== 'gated';

  if (errorMsg) {
    return <EmptyState title="Cannot open this recap" description={errorMsg} />;
  }

  if (!recap) {
    return (
      <Box>
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
    <Box>
      {/* Focus Mode is a comfort feature now, not the only safe way to watch:
          no app chrome and a watermark. The inline player below enforces the
          same boundary, which it did not used to. */}
      {showFocusButton && !completed && !revising && (
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

      {quizError && (
        <Alert
          severity="warning"
          sx={{ mb: 2, borderRadius: 2 }}
          action={
            <Button
              size="small"
              disabled={loadingQuiz}
              onClick={() => {
                const idx = recap.sections.findIndex((s) => !passedIds.has(s.id));
                if (idx >= 0) openQuiz(idx);
              }}
              sx={{ textTransform: 'none', minHeight: 40, whiteSpace: 'nowrap' }}
            >
              {loadingQuiz ? 'Loading...' : 'Try again'}
            </Button>
          }
        >
          {quizError}
        </Alert>
      )}

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
          title={recap.title}
          onFullscreenChange={setQuizHost}
          mode={watchMode}
        />
      </Box>

      {/* A progress bar counts something owed, so revision gets a plain sentence
          instead. It also answers the question the missing quizzes raise, which
          is "why is this one not asking me anything". */}
      {revising ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Nothing to pass here. Jump to any part of the class you want to see again.
        </Typography>
      ) : (
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
      )}

      {completed && !revising && (
        <Chip
          icon={<CheckCircleIcon />}
          label="Completed. This class is marked done for you."
          sx={{ mb: 2, bgcolor: 'rgba(46,125,50,0.12)', color: '#1B5E20', fontWeight: 800, height: 34 }}
        />
      )}

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
            // Nothing is sequential when nothing is owed, so the list stops
            // being a ladder and becomes chapters.
            const locked = revising ? false : !priorPassed && !isPassed;
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
                    bgcolor: isPassed && !revising ? 'rgba(46,125,50,0.12)' : alpha('#1A2027', 0.06),
                    color: isPassed && !revising ? '#1B5E20' : 'text.secondary',
                  }}
                >
                  {isPassed && !revising ? '✓' : i + 1}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }} noWrap>
                    {s.title}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(s.start_timestamp_seconds)} to {fmt(s.end_timestamp_seconds)}
                    {/* A question count is a description of a gate. With no gate
                        it is just a number the student can do nothing with. */}
                    {revising
                      ? ''
                      : ` · ${s.question_count} question${s.question_count === 1 ? '' : 's'}`}
                  </Typography>
                </Box>
                {isPassed && !revising ? (
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
          container={quizHost}
        />
      )}
    </Box>
  );
}
