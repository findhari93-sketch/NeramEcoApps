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
import { computeGate } from '@/lib/video-gate';
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
  const [furthest, setFurthest] = useState(0);

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
        mode: 'gated',
      }),
    [sections, duration, furthest],
  );

  const passedCount = sections.filter((s) => s.passed).length;

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
    const idx = sections.findIndex((s) => !s.passed);
    if (idx < 0) return;
    flushNow();
    try {
      const res = await authFetch(
        `/api/student/class-recaps/${recapId}/sections/${sections[idx].id}/quiz`,
      );
      setQuizQuestions(res.questions as StrippedQuestion[]);
      setActiveIdx(idx);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the checkpoint quiz');
    }
  }, [authFetch, flushNow, recapId, sections]);

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
    setTimeout(() => videoRef.current?.play().catch(() => {}), 150);
  }, []);

  /** Failed: back to the start of the segment, and they watch it again. */
  const handleRewatch = useCallback(() => {
    const section = sections[activeIdx ?? -1];
    setActiveIdx(null);
    setQuizQuestions([]);
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
   * The Fullscreen API is deliberately NOT used, even though a kiosk feel is the
   * goal. When an element is fullscreen the browser renders only that element's
   * subtree, and MUI portals the quiz drawer to document.body, so the checkpoint
   * quiz would simply not appear: the video would pause at a checkpoint and
   * nothing would happen. The chromeless popup on desktop and the fixed
   * full-viewport sheet on mobile already give the same result without breaking
   * the one interaction the whole feature depends on. iOS Safari has no element
   * fullscreen anyway, so this also keeps both platforms on one code path.
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
            resumeAt={resumeAt}
            onTimeUpdate={handleTick}
            onCheckpointReached={openQuiz}
            onLoadedMetadata={setDuration}
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
        zIndex: 1300,
      }}
    >
      {children}
    </Box>
  );
}
