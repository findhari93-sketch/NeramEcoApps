'use client';

/**
 * Watching a Foundation chapter in one language.
 *
 * The student picked Tamil or English on the chapter itself; this page is one
 * track. It uses the shared player in gated mode, so the scrub track stops at
 * the checkpoint they owe and the quiz opens when playback reaches it.
 *
 * Clearing the last checkpoint here satisfies the video half of the chapter in
 * EITHER language: a student who finishes Tamil is not asked to watch English
 * too. What it does not do is complete the chapter on its own, because the
 * chapter test still has to be passed. The response says which of those two
 * things just happened so the student is told rather than left guessing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Box, Typography, Button, CircularProgress, Chip, Paper } from '@neram/ui';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useAuthFetch } from '@/components/curriculum/shared';
import NeramVideoPlayer from '@/components/video/NeramVideoPlayer';
import useVideoProgress from '@/components/video/useVideoProgress';
import { computeGate } from '@/lib/video-gate';
import QuizModal from '@/components/foundation/QuizModal';
import type { VideoSource } from '@/components/video/types';

interface Section {
  id: string;
  title: string;
  start_timestamp_seconds: number;
  end_timestamp_seconds: number;
  question_count: number;
  passed: boolean;
  locked: boolean;
}

/** The same chapter in another language, already published to this student. */
interface Sibling {
  id: string;
  language: string;
  language_label: string;
  progress_status: 'in_progress' | 'completed' | 'locked' | null;
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

export default function StudyTrackWatchPage() {
  const params = useParams();
  const router = useRouter();
  const trackId = params?.trackId as string;
  /** The folder the student came from, so Back can put them back in it. */
  const backFolder = useSearchParams().get('folder');
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const authFetch = useAuthFetch();

  const [token, setToken] = useState<string | null>(null);
  const [track, setTrack] = useState<{
    id: string;
    study_file_id: string;
    language_label: string;
    title: string;
  } | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [siblings, setSiblings] = useState<Sibling[]>([]);
  const [mode, setMode] = useState<'gated' | 'revision'>('gated');
  const [source, setSource] = useState<VideoSource | null>(null);
  const [watermark, setWatermark] = useState<{ name: string; code: string } | null>(null);
  const [resumeAt, setResumeAt] = useState(0);
  const [duration, setDuration] = useState(0);
  const [furthest, setFurthest] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<StrippedQuestion[]>([]);
  /**
   * Separate from `error`, which replaces the page and unmounts the player. A
   * quiz that will not load must cost a retry, not the student's position.
   */
  const [quizError, setQuizError] = useState<string | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  /** The player's container while it is fullscreen, so the quiz renders inside it. */
  const [quizHost, setQuizHost] = useState<HTMLElement | null>(null);

  const { onTick, onBlockedSeek, flushNow } = useVideoProgress({
    endpoint: trackId ? `/api/student/study-videos/tracks/${trackId}/progress` : null,
    token,
    // A finished track keeps no further progress: revision is not watching.
    enabled: mode === 'gated',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getToken();
      setToken(t);
      const data = await authFetch(`/api/student/study-videos/tracks/${trackId}`);
      setTrack(data.track);
      setSections(data.sections || []);
      setSiblings(data.siblings || []);
      setMode(data.mode);

      const embed = await authFetch(
        `/api/student/study-videos/tracks/${trackId}/video-embed`,
      );
      setWatermark(embed.watermark || null);
      setResumeAt(Number(embed.resume_at) || 0);
      setSource(
        embed.mode === 'youtube'
          ? { kind: 'youtube', youtubeId: embed.youtube_id }
          : { kind: 'html5', src: embed.streamUrl || embed.src },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this recording');
    } finally {
      setLoading(false);
    }
  }, [authFetch, getToken, trackId]);

  useEffect(() => {
    if (!authLoading && trackId) load();
  }, [authLoading, trackId, load]);

  /**
   * The one definition of how far they may play, shared with every other video
   * in the app. `revision` opens the whole recording once the track is finished.
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
        mode,
      }),
    [sections, duration, furthest, mode],
  );

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

  const title = track?.title ?? '';

  const handleTick = useCallback(
    (seconds: number, dur: number) => {
      setFurthest((f) => (seconds > f ? seconds : f));
      onTick(seconds, dur);
    },
    [onTick],
  );

  const closeQuiz = useCallback(() => {
    setActiveIdx(null);
    setQuizQuestions([]);
    setQuizError(null);
  }, []);

  const openQuiz = useCallback(async () => {
    // Revision has no checkpoints to answer; the boundary never fires there, but
    // the ended event still does.
    if (mode === 'revision') return;
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
        `/api/student/study-videos/tracks/${trackId}/sections/${sections[idx].id}/quiz`,
      );
      setQuizQuestions(res.questions as StrippedQuestion[]);
    } catch (err) {
      setQuizError(err instanceof Error ? err.message : 'Could not load the checkpoint quiz');
    } finally {
      setLoadingQuiz(false);
    }
  }, [authFetch, flushNow, mode, sections, trackId, loadingQuiz, activeIdx, quizError]);

  const submitQuiz = useCallback(
    async (answers: Record<string, string>) => {
      const section = sections[activeIdx ?? -1];
      if (!section) throw new Error('No active checkpoint');
      const res = await authFetch(
        `/api/student/study-videos/tracks/${trackId}/sections/${section.id}/quiz`,
        { method: 'POST', body: JSON.stringify({ answers }) },
      );
      const a = res.attempt;
      if (a.passed) {
        setSections((prev) => prev.map((s) => (s.id === section.id ? { ...s, passed: true } : s)));
        flushNow();
        if (res.chapter_completed) setBanner('Chapter completed. Well done.');
        else if (res.video_completed) setBanner('Recording finished. The chapter test is now open.');
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
    [activeIdx, authFetch, flushNow, sections, trackId],
  );

  /**
   * Back to the folder they came from, not to the top of the tree.
   *
   * This used to push a bare /student/study-materials, which drops ?folder= and
   * drops a student who was four folders deep at the root with no trail back.
   * The folder rides in on the link that opened this page, so all that is needed
   * is to hand it back.
   */
  const backToChapter = () =>
    router.push(
      backFolder ? `/student/study-materials?folder=${encodeURIComponent(backFolder)}` : '/student/study-materials',
    );

  /** Same recording, other language, keeping the way back. */
  const switchTo = (id: string) =>
    router.push(
      `/student/study-materials/watch/${id}${backFolder ? `?folder=${encodeURIComponent(backFolder)}` : ''}`,
    );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (error || !source || !track) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {error || 'Could not open this recording'}
        </Typography>
        <Button variant="outlined" onClick={backToChapter} sx={{ minHeight: 48, textTransform: 'none' }}>
          Back to Study Materials
        </Button>
      </Box>
    );
  }

  const passedCount = sections.filter((s) => s.passed).length;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', px: { xs: 1.5, sm: 2 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Button
          onClick={backToChapter}
          startIcon={<ArrowBackRoundedIcon />}
          sx={{ minHeight: 48, textTransform: 'none' }}
        >
          Back
        </Button>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
            {track.title}
          </Typography>
        </Box>
        <Chip size="small" label={track.language_label} />
        {mode === 'revision' && <Chip size="small" color="success" label="Revision" />}
      </Box>

      {/*
        The other languages, one press away.

        Switching used to mean leaving: Back to the top of the tree, find the
        chapter again, open the PDF, press the other button in its footer. Four
        steps to answer "I cannot follow this one", which is a question a student
        asks in the first thirty seconds. Nothing is lost by moving, since each
        recording keeps its own position and its own checkpoints, and finishing
        EITHER satisfies the chapter.
      */}
      {siblings.length > 0 && (
        <Box
          sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.5 }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            Also recorded in
          </Typography>
          {siblings.map((s) => (
            <Button
              key={s.id}
              size="small"
              variant="outlined"
              startIcon={
                s.progress_status === 'completed' ? <CheckCircleRoundedIcon /> : <PlayArrowRoundedIcon />
              }
              color={s.progress_status === 'completed' ? 'success' : 'primary'}
              onClick={() => switchTo(s.id)}
              sx={{ minHeight: 44, textTransform: 'none', flexShrink: 0 }}
            >
              {s.language_label}
              {s.progress_status === 'in_progress' && ' (continue)'}
            </Button>
          ))}
        </Box>
      )}

      {banner && (
        <Paper
          sx={{
            p: 1.5,
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            bgcolor: 'success.light',
            color: 'success.contrastText',
          }}
        >
          <CheckCircleRoundedIcon fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {banner}
          </Typography>
        </Paper>
      )}

      <Box sx={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', bgcolor: '#000', borderRadius: 2, overflow: 'hidden' }}>
        <NeramVideoPlayer
          source={source}
          gate={gate}
          watermark={watermark}
          title={title}
          marks={marks}
          resumeAt={resumeAt}
          onTimeUpdate={handleTick}
          onBlockedSeek={onBlockedSeek}
          onCheckpointReached={openQuiz}
          onLoadedMetadata={setDuration}
          // Fullscreen is no longer restricted to revision. The quiz portals
          // into the player's container while it is fullscreen, so a checkpoint
          // reached in fullscreen now actually shows one.
          allowFullscreen
          onFullscreenChange={setQuizHost}
        />
      </Box>

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
          Checkpoints ({passedCount}/{sections.length})
        </Typography>
        {sections.map((s, i) => (
          <Paper
            key={s.id}
            sx={{
              p: 1.5,
              mb: 1,
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              opacity: s.locked && !s.passed && mode === 'gated' ? 0.55 : 1,
            }}
          >
            {s.passed ? (
              <CheckCircleRoundedIcon sx={{ color: 'success.main' }} />
            ) : s.locked && mode === 'gated' ? (
              <LockRoundedIcon sx={{ color: 'text.disabled' }} />
            ) : (
              <PlayArrowRoundedIcon sx={{ color: 'primary.main' }} />
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                {i + 1}. {s.title}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {fmt(s.start_timestamp_seconds)} to {fmt(s.end_timestamp_seconds)} ·{' '}
                {s.question_count} questions
              </Typography>
            </Box>
          </Paper>
        ))}
      </Box>

      {activeIdx !== null && sections[activeIdx] && (
        <QuizModal
          open
          sectionTitle={sections[activeIdx].title}
          questions={quizQuestions}
          onSubmit={submitQuiz}
          onClose={closeQuiz}
          onRetry={closeQuiz}
          onContinue={closeQuiz}
          // The whole point of a checkpoint. Dismissing it would be the skip.
          dismissable={false}
          container={quizHost}
          loadingQuestions={loadingQuiz}
          loadError={quizError}
          onRetryLoad={openQuiz}
        />
      )}
    </Box>
  );
}
