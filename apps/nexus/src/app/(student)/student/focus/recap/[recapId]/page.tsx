'use client';

/**
 * Focus Mode: the screen a student actually watches a missed class on.
 *
 * Chromeless by route (see isChromelessRoute), so there is no sidebar, no top
 * bar and no bottom nav. On desktop this is opened as a popup window; on mobile
 * it is a full-viewport sheet. Same component either way, which is why the hub
 * page and the popup can share one implementation.
 *
 * It opens on a "ready to watch" screen rather than playing immediately. That is
 * not a stylistic choice: requesting fullscreen and starting playback both need
 * a user gesture INSIDE this window, and a browser silently refuses both on
 * load. One button satisfies both at once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Button, CircularProgress, Chip } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import { computeGate, type VideoGateMode } from '@/lib/video-gate';
import { focusChannelName } from '@/components/class-recap/openFocusWindow';
import { useWatchHeartbeat } from '@/components/class-recap/useWatchHeartbeat';
import QuizModal from '@/components/foundation/QuizModal';

interface Section {
  id: string;
  title: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  passed: boolean;
}

interface StrippedQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
}

export default function FocusRecapPage() {
  const params = useParams();
  const router = useRouter();
  const recapId = params?.recapId as string;
  const { loading: authLoading, getToken } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const rootRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [token, setToken] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [src, setSrc] = useState<string | null>(null);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [watermark, setWatermark] = useState<{ name: string; code: string } | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<StrippedQuestion[]>([]);
  /**
   * Separate from `error`, which replaces this whole page and unmounts the
   * player. A quiz that will not load must cost the student a retry, not their
   * place in the class.
   */
  const [quizError, setQuizError] = useState<string | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [furthest, setFurthest] = useState(0);
  /**
   * Where the quiz is drawn: the player's container while it is fullscreen by
   * either route, null otherwise. Null means the ordinary viewport drawer.
   */
  const [quizHost, setQuizHost] = useState<HTMLElement | null>(null);
  /**
   * Whether the checkpoints bind here, as the server sees it. Focus Mode is the
   * other player for the same recording, so it has to ask the same question and
   * honour the same answer. Two players that decide this differently is exactly
   * the drift lib/video-gate.ts exists to stop.
   */
  const [watchMode, setWatchMode] = useState<VideoGateMode>('gated');

  const { onTick, flushNow } = useWatchHeartbeat({ recapId, token });

  const load = useCallback(async () => {
    try {
      const t = await getToken();
      setToken(t);

      const [recapRes, embedRes] = await Promise.all([
        authFetch(`/api/student/class-recaps/${recapId}`),
        authFetch(`/api/student/class-recaps/${recapId}/video-embed`),
      ]);

      const recap = recapRes.recap;
      setTitle(recap.title || 'Class recording');
      setSections(recap.sections || []);
      setWatchMode(recapRes.watch_mode === 'revision' ? 'revision' : 'gated');

      if (embedRes.mode === 'youtube' || embedRes.video_source === 'youtube') {
        setYoutubeId(embedRes.youtube_id);
      } else {
        setSrc(embedRes.src || embedRes.streamUrl);
      }
      setWatermark(embedRes.watermark || { name: 'Neram student', code: 'NX-000000' });
      setResumeAt(Number(embedRes.resume_at) || 0);
      setFurthest(Number(embedRes.resume_at) || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this recording');
    }
  }, [authFetch, getToken, recapId]);

  useEffect(() => {
    if (!authLoading && recapId) load();
  }, [authLoading, recapId, load]);

  /**
   * How far playback is allowed to reach. Everything after that is earned, not
   * browsed.
   *
   * This page used to work the boundary out itself, and its copy differed from
   * the two in the players: it never pulled the last checkpoint just inside the
   * file, so a recording trimmed after its checkpoints were built relied
   * entirely on the ended fallback to open the final quiz. That is the kind of
   * drift three copies of one rule produce. computeGate is now the only copy.
   */
  const gate = useMemo(
    () =>
      computeGate({
        checkpoints: sections.map((s) => ({
          id: s.id,
          endSeconds: s.end_timestamp_seconds,
          passed: s.passed,
        })),
        duration,
        furthestSeconds: furthest,
        mode: watchMode,
      }),
    [sections, duration, furthest, watchMode],
  );

  const passedCount = sections.filter((s) => s.passed).length;

  /** Checkpoint positions drawn on the scrub bar. */
  const marks = useMemo(
    () =>
      sections
        .filter((s) => Number.isFinite(s.end_timestamp_seconds) && s.end_timestamp_seconds > 0)
        .map((s) => ({
          id: s.id,
          at: s.end_timestamp_seconds,
          label: s.title,
          passed: s.passed,
        })),
    [sections],
  );

  /** Tell the opener a checkpoint moved, so its list is not stale. */
  const broadcast = useCallback(() => {
    try {
      const ch = new BroadcastChannel(focusChannelName(recapId));
      ch.postMessage({ type: 'progress' });
      ch.close();
    } catch {
      /* Safari without BroadcastChannel: the opener refetches on focus anyway. */
    }
  }, [recapId]);

  const openQuiz = useCallback(async () => {
    // An unbound gate reports the end of the recording as a boundary, and fires
    // again on `ended`. Without this, finishing a class you sat in would open
    // checkpoint 1's quiz over the top of it.
    if (watchMode !== 'gated') return;
    const idx = sections.findIndex((s) => !s.passed);
    if (idx < 0) return;
    // The player re-fires the boundary on every tick while the student sits at
    // it. Once the panel is up there is nothing left to fetch, unless a standing
    // error is what "Try again" is coming back through.
    if (loadingQuiz) return;
    if (activeIdx === idx && !quizError) return;
    flushNow();
    // Opened before the fetch: the drawer carries the spinner and the failure,
    // and while fullscreen it is the only surface the student can see.
    setActiveIdx(idx);
    setQuizQuestions([]);
    setLoadingQuiz(true);
    setQuizError(null);
    try {
      const res = await authFetch(
        `/api/student/class-recaps/${recapId}/sections/${sections[idx].id}/quiz`,
      );
      setQuizQuestions(res.questions as StrippedQuestion[]);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Could not load the checkpoint quiz');
    } finally {
      setLoadingQuiz(false);
    }
  }, [authFetch, flushNow, recapId, sections, watchMode, loadingQuiz, activeIdx, quizError]);

  const submitQuiz = useCallback(
    async (answers: Record<string, string>) => {
      const section = sections[activeIdx ?? -1];
      if (!section) throw new Error('No active checkpoint');
      const res = await authFetch(
        `/api/student/class-recaps/${recapId}/sections/${section.id}/quiz`,
        { method: 'POST', body: JSON.stringify({ answers }) },
      );
      const a = res.attempt;
      if (a.passed) {
        setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, passed: true } : s)));
        flushNow();
        broadcast();
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
    [authFetch, activeIdx, broadcast, flushNow, recapId, sections],
  );

  const handleContinue = useCallback(() => {
    setActiveIdx(null);
    setQuizQuestions([]);
    setQuizError(null);
    setTimeout(() => videoRef.current?.play().catch(() => {}), 150);
  }, []);

  /** Failed: back to the start of the segment, and they watch it again. */
  const handleRewatch = useCallback(() => {
    const section = sections[activeIdx ?? -1];
    setActiveIdx(null);
    setQuizQuestions([]);
    setQuizError(null);
    if (!section || !videoRef.current) return;
    videoRef.current.currentTime = section.start_timestamp_seconds;
    setTimeout(() => videoRef.current?.play().catch(() => {}), 150);
  }, [activeIdx, sections]);

  const handleTick = useCallback(
    (seconds: number, dur: number) => {
      onTick(seconds, dur);
      setFurthest((f) => (seconds > f ? seconds : f));
    },
    [onTick],
  );

  /**
   * The one gesture that starts playback. Autoplay is refused without it.
   *
   * The Fullscreen API used to be avoided here, because the browser paints only
   * the fullscreen element's subtree and the quiz drawer portals to
   * document.body, so a checkpoint would pause the video and show nothing. That
   * is fixed rather than worked around: the player publishes its container
   * through `onFullscreenChange` and the drawer portals into it. This sheet
   * remains, because it is also what an iPhone gets, where there is no element
   * Fullscreen API at all.
   */
  const begin = useCallback(() => {
    setStarted(true);
    setTimeout(() => videoRef.current?.play().catch(() => {}), 120);
  }, []);

  const leave = useCallback(() => {
    flushNow();
    if (window.opener) window.close();
    else router.push(`/student/class-recap/${recapId}`);
  }, [flushNow, recapId, router]);

  if (error) {
    return (
      <Shell rootRef={rootRef}>
        <Box sx={{ textAlign: 'center', px: 3 }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, mb: 1 }}>
            Cannot open this recording
          </Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, mb: 3 }}>{error}</Typography>
          <Button variant="contained" onClick={leave} sx={{ minHeight: 48 }}>
            Go back
          </Button>
        </Box>
      </Shell>
    );
  }

  if (!watermark || (!src && !youtubeId)) {
    return (
      <Shell rootRef={rootRef}>
        <CircularProgress sx={{ color: '#fff' }} />
      </Shell>
    );
  }

  if (youtubeId) {
    return (
      <Shell rootRef={rootRef}>
        <Box sx={{ textAlign: 'center', px: 3, maxWidth: 460 }}>
          <Typography sx={{ color: '#fff', fontWeight: 700, mb: 1 }}>{title}</Typography>
          <Typography sx={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, mb: 3 }}>
            This class only has the backup copy, which plays in the standard recap
            player. Your tutor has been told.
          </Typography>
          <Button
            variant="contained"
            onClick={() => router.push(`/student/class-recap/${recapId}`)}
            sx={{ minHeight: 48 }}
          >
            Open the recap
          </Button>
        </Box>
      </Shell>
    );
  }

  return (
    <Shell rootRef={rootRef}>
      {!started ? (
        <Box sx={{ textAlign: 'center', px: 3, maxWidth: 480 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, letterSpacing: 1.2, mb: 1 }}>
            CATCH UP
          </Typography>
          <Typography sx={{ color: '#fff', fontWeight: 800, fontSize: { xs: 20, sm: 24 }, mb: 1.5 }}>
            {title}
          </Typography>

          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, mb: 3, flexWrap: 'wrap' }}>
            <Chip
              size="small"
              icon={<CheckCircleRoundedIcon />}
              label={`${passedCount} of ${sections.length} checkpoints passed`}
              sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: '#fff' }}
            />
            {resumeAt > 0 && (
              <Chip
                size="small"
                label={`Resuming from ${Math.floor(resumeAt / 60)}:${String(
                  Math.floor(resumeAt % 60),
                ).padStart(2, '0')}`}
                sx={{ bgcolor: 'rgba(255,255,255,0.12)', color: '#fff' }}
              />
            )}
          </Box>

          <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, mb: 3, lineHeight: 1.6 }}>
            The video pauses at each checkpoint for a short quiz. Pass it and the
            next section unlocks. Your progress saves as you go, so you can stop
            and come back.
          </Typography>

          <Button
            variant="contained"
            onClick={begin}
            startIcon={<PlayArrowRoundedIcon />}
            sx={{ minHeight: 56, px: 4, fontSize: 16, fontWeight: 700, borderRadius: 99 }}
          >
            {resumeAt > 0 ? 'Resume watching' : 'Start watching'}
          </Button>

          {resumeAt > 0 && (
            <Box sx={{ mt: 1.5 }}>
              <Button
                onClick={() => {
                  setResumeAt(0);
                  begin();
                }}
                sx={{ color: 'rgba(255,255,255,0.7)', minHeight: 44, textTransform: 'none' }}
              >
                Start from the beginning
              </Button>
            </Box>
          )}
        </Box>
      ) : (
        <>
          <NeramVideoPlayer
            source={{ kind: 'html5', src: src! }}
            gate={gate}
            videoRef={videoRef}
            watermark={watermark}
            title={title}
            marks={marks}
            resumeAt={resumeAt}
            onTimeUpdate={handleTick}
            onCheckpointReached={openQuiz}
            onLoadedMetadata={setDuration}
            allowFullscreen
            onFullscreenChange={setQuizHost}
          />

          <Button
            onClick={leave}
            aria-label="Leave focus mode"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              minWidth: 48,
              minHeight: 48,
              color: 'rgba(255,255,255,0.85)',
              zIndex: 5,
            }}
          >
            <CloseRoundedIcon />
          </Button>
        </>
      )}

      {activeIdx !== null && sections[activeIdx] && (
        <QuizModal
          open
          sectionTitle={sections[activeIdx].title}
          questions={quizQuestions as any}
          dismissable={false}
          onClose={() => {}}
          onSubmit={submitQuiz as any}
          onRetry={handleRewatch}
          onContinue={handleContinue}
          container={quizHost}
          loadingQuestions={loadingQuiz}
          loadError={quizError}
          onRetryLoad={openQuiz}
        />
      )}
    </Shell>
  );
}

function Shell({
  children,
  rootRef,
}: {
  children: React.ReactNode;
  rootRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <Box
      ref={rootRef}
      onContextMenu={(e) => e.preventDefault()}
      sx={{
        position: 'fixed',
        inset: 0,
        // dvh, not vh: on iOS Safari the toolbar eats about 60px of vh and the
        // control bar ends up under it.
        height: '100dvh',
        width: '100vw',
        bgcolor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overscrollBehavior: 'none',
        WebkitTouchCallout: 'none',
        // Below MUI's drawer layer (1200), above its app bar (1100).
        //
        // This was 1300, which is the MODAL layer, and it silently broke the one
        // interaction the whole screen exists for. QuizModal renders a Drawer, and
        // a Drawer sits at theme.zIndex.drawer = 1200, not at the modal layer. The
        // drawer portals to document.body and the chromeless branch of the student
        // layout wraps children in providers only, so this sheet and that drawer
        // land in the same (root) stacking context and compare directly. An opaque
        // black 1300 over a 1200 drawer meant a student reached a checkpoint, the
        // video paused, and the mandatory quiz was painted underneath the sheet.
        zIndex: 1150,
      }}
    >
      {children}
    </Box>
  );
}
