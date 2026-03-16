'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Skeleton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  alpha,
  useTheme,
  Tabs,
  Tab,
  LinearProgress,
} from '@neram/ui';
import { useRouter, useParams } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import NoteOutlinedIcon from '@mui/icons-material/NoteOutlined';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CloseIcon from '@mui/icons-material/Close';

// ─── Types ───────────────────────────────────────────────────────────

interface QuizQuestion {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  sort_order: number;
}

interface Section {
  id: string;
  title: string;
  description: string | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  sort_order: number;
  quiz_questions: QuizQuestion[];
}

interface QuizAttemptAnswer {
  question_id: string;
  selected_option: string;
  is_correct: boolean;
}

interface QuizAttempt {
  id: string;
  section_id: string;
  score_pct: number;
  passed: boolean;
  answers: QuizAttemptAnswer[];
  created_at: string;
}

interface Note {
  id: string;
  section_id: string;
  note_text: string;
  video_timestamp_seconds: number | null;
}

interface ItemProgress {
  status: 'not_started' | 'in_progress' | 'completed';
  last_video_position_seconds: number | null;
  last_section_id: string | null;
}

interface ItemDetail {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  video_source: string | null;
  youtube_video_id: string | null;
  sharepoint_url: string | null;
  chapter_number: number | null;
  sections: Section[];
  progress: ItemProgress | null;
  quiz_attempts: QuizAttempt[];
  notes: Note[];
}

// ─── YouTube IFrame API type augmentation ────────────────────────────

declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string | HTMLElement,
        config: {
          videoId: string;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (event: { target: YTPlayer }) => void;
            onStateChange?: (event: { data: number; target: YTPlayer }) => void;
          };
        }
      ) => YTPlayer;
      PlayerState: {
        PLAYING: number;
        PAUSED: number;
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  seekTo: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Component ───────────────────────────────────────────────────────

export default function StudentItemLearningPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.id as string;
  const itemId = params.itemId as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  // State
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [mobileTab, setMobileTab] = useState(0); // 0=sections 1=notes
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Quiz state
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSectionId, setQuizSectionId] = useState<string | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizResult, setQuizResult] = useState<{ score_pct: number; passed: boolean; answers: QuizAttemptAnswer[] } | null>(null);

  // Notes state
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [noteSaving, setNoteSaving] = useState<Record<string, boolean>>({});

  // YouTube refs
  const ytPlayerRef = useRef<YTPlayer | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const timeUpdateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoSaveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedTimeRef = useRef(0);

  // ─── Data fetching ──────────────────────────────────────────────────

  const fetchItem = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error('Failed to load item');

      const data = await res.json();
      const itemData = data.item as ItemDetail;
      setItem(itemData);

      // Initialize notes from existing data
      const notes: Record<string, string> = {};
      (itemData.notes || []).forEach((n: Note) => {
        notes[n.section_id] = n.note_text;
      });
      setNoteTexts(notes);

      // Resume from last section
      if (itemData.progress?.last_section_id && itemData.sections.length > 0) {
        const idx = itemData.sections.findIndex(
          (s: Section) => s.id === itemData.progress!.last_section_id
        );
        if (idx >= 0) setCurrentSectionIndex(idx);
      }

      // Mark as in_progress if not started
      if (!itemData.progress || itemData.progress.status === 'not_started') {
        const progressToken = await getToken();
        if (progressToken) {
          fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${progressToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'in_progress' }),
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to load item detail:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, moduleId, itemId]);

  useEffect(() => {
    if (!authLoading) fetchItem();
  }, [authLoading, fetchItem]);

  // ─── YouTube Player ─────────────────────────────────────────────────

  useEffect(() => {
    if (!item?.youtube_video_id || loading) return;

    let mounted = true;

    function initPlayer() {
      if (!mounted || !window.YT?.Player) return;

      // Destroy previous player if exists
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch { /* ignore */ }
        ytPlayerRef.current = null;
      }

      const startTime = item!.progress?.last_video_position_seconds || 0;

      ytPlayerRef.current = new window.YT.Player('yt-player-container', {
        videoId: item!.youtube_video_id!,
        playerVars: {
          autoplay: 0,
          modestbranding: 1,
          rel: 0,
          start: Math.floor(startTime),
        },
        events: {
          onReady: () => {
            // Start time tracking
            if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
            timeUpdateIntervalRef.current = setInterval(() => {
              if (ytPlayerRef.current) {
                try {
                  const time = ytPlayerRef.current.getCurrentTime();
                  if (typeof time === 'number' && !isNaN(time)) {
                    setCurrentVideoTime(time);
                  }
                } catch { /* player may not be ready */ }
              }
            }, 1000);
          },
        },
      });
    }

    // Load YT API if not loaded
    if (window.YT?.Player) {
      initPlayer();
    } else {
      const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = () => {
        if (mounted) initPlayer();
      };
    }

    return () => {
      mounted = false;
      if (timeUpdateIntervalRef.current) clearInterval(timeUpdateIntervalRef.current);
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch { /* ignore */ }
        ytPlayerRef.current = null;
      }
    };
  }, [item?.youtube_video_id, loading]);

  // ─── Auto-save progress every 30s ──────────────────────────────────

  useEffect(() => {
    if (!item || !item.youtube_video_id) return;

    autoSaveIntervalRef.current = setInterval(async () => {
      const time = currentVideoTime;
      // Only save if time changed significantly (>5s)
      if (Math.abs(time - lastSavedTimeRef.current) < 5) return;

      try {
        const token = await getToken();
        if (!token) return;

        const currentSection = item.sections[currentSectionIndex];

        await fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            last_video_position_seconds: Math.floor(time),
            last_section_id: currentSection?.id || null,
          }),
        });

        lastSavedTimeRef.current = time;
      } catch { /* silent */ }
    }, 30000);

    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
    };
  }, [item, currentVideoTime, currentSectionIndex, getToken, moduleId, itemId]);

  // ─── Auto-detect current section from video time ───────────────────

  useEffect(() => {
    if (!item?.sections.length) return;

    const sections = item.sections;
    for (let i = sections.length - 1; i >= 0; i--) {
      const start = sections[i].start_time_seconds;
      if (start != null && currentVideoTime >= start) {
        if (i !== currentSectionIndex) setCurrentSectionIndex(i);
        break;
      }
    }
  }, [currentVideoTime, item?.sections]);

  // ─── Section click → seek video ────────────────────────────────────

  const handleSectionClick = (index: number) => {
    setCurrentSectionIndex(index);
    const section = item?.sections[index];
    if (section?.start_time_seconds != null && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(section.start_time_seconds, true);
    }
  };

  // ─── Quiz handlers ─────────────────────────────────────────────────

  const openQuiz = (section: Section) => {
    setQuizSectionId(section.id);
    setQuizQuestions(section.quiz_questions);
    setQuizAnswers({});
    setQuizResult(null);
    setQuizOpen(true);
  };

  const handleQuizSubmit = async () => {
    if (!quizSectionId) return;

    // Validate all questions answered
    const unanswered = quizQuestions.filter((q) => !quizAnswers[q.id]);
    if (unanswered.length > 0) return;

    setQuizSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/modules/${moduleId}/items/${itemId}/sections/${quizSectionId}/quiz`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ answers: quizAnswers }),
        }
      );

      if (!res.ok) throw new Error('Quiz submission failed');

      const data = await res.json();
      setQuizResult({
        score_pct: data.attempt.score_pct,
        passed: data.attempt.passed,
        answers: data.attempt.answers,
      });

      // Refresh item to get updated quiz attempts
      fetchItem();
    } catch (err) {
      console.error('Quiz submit error:', err);
    } finally {
      setQuizSubmitting(false);
    }
  };

  // ─── Note handlers ─────────────────────────────────────────────────

  const saveNoteDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleNoteChange = (sectionId: string, text: string) => {
    setNoteTexts((prev) => ({ ...prev, [sectionId]: text }));

    // Debounced auto-save
    if (saveNoteDebounceRef.current[sectionId]) {
      clearTimeout(saveNoteDebounceRef.current[sectionId]);
    }
    saveNoteDebounceRef.current[sectionId] = setTimeout(() => {
      saveNote(sectionId, text);
    }, 1500);
  };

  const saveNote = async (sectionId: string, text: string) => {
    setNoteSaving((prev) => ({ ...prev, [sectionId]: true }));
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(
        `/api/modules/${moduleId}/items/${itemId}/sections/${sectionId}/notes`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            note_text: text,
            video_timestamp_seconds: Math.floor(currentVideoTime),
          }),
        }
      );
    } catch (err) {
      console.error('Note save error:', err);
    } finally {
      setNoteSaving((prev) => ({ ...prev, [sectionId]: false }));
    }
  };

  // ─── Helpers ────────────────────────────────────────────────────────

  const getSectionQuizStatus = (sectionId: string): 'passed' | 'failed' | 'not_attempted' => {
    if (!item) return 'not_attempted';
    const attempts = item.quiz_attempts.filter((a) => a.section_id === sectionId);
    if (attempts.length === 0) return 'not_attempted';
    const passed = attempts.some((a) => a.passed);
    return passed ? 'passed' : 'failed';
  };

  const allQuestionsAnswered =
    quizQuestions.length > 0 && quizQuestions.every((q) => quizAnswers[q.id]);

  // ─── Loading skeleton ──────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Skeleton variant="rectangular" height={40} width={120} sx={{ mb: 2, borderRadius: 1 }} />
        <Skeleton variant="rectangular" height={240} sx={{ mb: 3, borderRadius: 2 }} />
        <Skeleton variant="text" width="60%" height={32} sx={{ mb: 1 }} />
        <Skeleton variant="text" width="40%" height={24} sx={{ mb: 3 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={64} sx={{ mb: 1.5, borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  if (!item) {
    return (
      <Box sx={{ p: { xs: 2, sm: 3 }, textAlign: 'center', py: 8 }}>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
          Item not found
        </Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push(`/student/modules/${moduleId}`)}
          sx={{ minHeight: 48 }}
        >
          Back to Module
        </Button>
      </Box>
    );
  }

  const currentSection = item.sections[currentSectionIndex] || null;
  const hasYouTube = !!item.youtube_video_id;
  const hasSharePoint = !!item.sharepoint_url;

  // ─── Render ─────────────────────────────────────────────────────────

  return (
    <Box sx={{ pb: 4 }}>
      {/* ─── Back button + Title ─────────────────────────────────── */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          pt: { xs: 1.5, sm: 2 },
          pb: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <IconButton
          onClick={() => router.push(`/student/modules/${moduleId}`)}
          sx={{
            minWidth: 48,
            minHeight: 48,
            color: 'text.secondary',
          }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.chapter_number != null ? `${item.chapter_number}. ` : ''}
            {item.title}
          </Typography>
          {item.description && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.description}
            </Typography>
          )}
        </Box>
      </Box>

      {/* ─── Video Player ────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', lg: 'row' },
          gap: { xs: 0, lg: 3 },
          px: { xs: 0, lg: 3 },
        }}
      >
        {/* Video column */}
        <Box sx={{ flex: { lg: '0 0 60%' }, minWidth: 0 }}>
          {hasYouTube && (
            <Box
              ref={ytContainerRef}
              sx={{
                position: 'relative',
                width: '100%',
                paddingTop: '56.25%', // 16:9
                bgcolor: '#000',
                borderRadius: { xs: 0, lg: 2 },
                overflow: 'hidden',
              }}
            >
              <Box
                id="yt-player-container"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                }}
              />
            </Box>
          )}

          {hasSharePoint && !hasYouTube && (
            <Box
              sx={{
                position: 'relative',
                width: '100%',
                paddingTop: '56.25%',
                bgcolor: '#000',
                borderRadius: { xs: 0, lg: 2 },
                overflow: 'hidden',
              }}
            >
              <iframe
                src={item.sharepoint_url!}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 'none',
                }}
                allow="autoplay; fullscreen"
                allowFullScreen
                title={item.title}
              />
            </Box>
          )}

          {!hasYouTube && !hasSharePoint && (
            <Paper
              elevation={0}
              sx={{
                p: 4,
                mx: { xs: 2, lg: 0 },
                mt: 1,
                textAlign: 'center',
                borderRadius: 3,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha(theme.palette.primary.main, 0.03),
              }}
            >
              <Typography variant="body1" color="text.secondary">
                No video available for this item.
              </Typography>
              <Typography variant="caption" color="text.disabled">
                This item contains text-based content and quizzes.
              </Typography>
            </Paper>
          )}

          {/* Current video time indicator (mobile) */}
          {hasYouTube && (
            <Box
              sx={{
                display: { xs: 'flex', lg: 'none' },
                alignItems: 'center',
                gap: 0.5,
                px: 2,
                py: 1,
                bgcolor: alpha(theme.palette.background.default, 0.9),
              }}
            >
              <AccessTimeIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
              <Typography
                variant="caption"
                sx={{
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  color: 'text.secondary',
                }}
              >
                {formatTime(currentVideoTime)}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ─── Right column: Sections + Notes (desktop) ──────────── */}
        <Box
          sx={{
            flex: { lg: '1 1 40%' },
            minWidth: 0,
            display: { xs: 'none', lg: 'block' },
            maxHeight: { lg: 'calc(56.25vw * 0.6 + 80px)' },
            overflowY: 'auto',
          }}
        >
          <DesktopSidebar
            sections={item.sections}
            currentSectionIndex={currentSectionIndex}
            onSectionClick={handleSectionClick}
            onQuizOpen={openQuiz}
            getSectionQuizStatus={getSectionQuizStatus}
            noteTexts={noteTexts}
            noteSaving={noteSaving}
            onNoteChange={handleNoteChange}
            theme={theme}
          />
        </Box>
      </Box>

      {/* ─── Mobile: Tabs for Sections / Notes ───────────────────── */}
      <Box sx={{ display: { xs: 'block', lg: 'none' }, mt: 1, px: 2 }}>
        <Tabs
          value={mobileTab}
          onChange={(_, v) => setMobileTab(v)}
          variant="fullWidth"
          sx={{
            mb: 2,
            '& .MuiTab-root': {
              minHeight: 48,
              fontWeight: 600,
              fontSize: '0.85rem',
            },
          }}
        >
          <Tab
            label="Sections"
            icon={<PlayArrowIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
          <Tab
            label="Notes"
            icon={<NoteOutlinedIcon sx={{ fontSize: 18 }} />}
            iconPosition="start"
          />
        </Tabs>

        {mobileTab === 0 && (
          <SectionsList
            sections={item.sections}
            currentSectionIndex={currentSectionIndex}
            onSectionClick={handleSectionClick}
            onQuizOpen={openQuiz}
            getSectionQuizStatus={getSectionQuizStatus}
            theme={theme}
          />
        )}

        {mobileTab === 1 && (
          <NotesList
            sections={item.sections}
            noteTexts={noteTexts}
            noteSaving={noteSaving}
            onNoteChange={handleNoteChange}
            theme={theme}
          />
        )}
      </Box>

      {/* ─── Quiz Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={quizOpen}
        onClose={() => !quizSubmitting && setQuizOpen(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            mx: { xs: 1, sm: 2 },
            maxHeight: '90vh',
          },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pb: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <QuizOutlinedIcon sx={{ color: theme.palette.primary.main }} />
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              Section Quiz
            </Typography>
          </Box>
          <IconButton
            onClick={() => setQuizOpen(false)}
            disabled={quizSubmitting}
            sx={{ minWidth: 48, minHeight: 48 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ px: { xs: 2, sm: 3 } }}>
          {quizResult ? (
            /* ─── Quiz Result ─────────────────────────────────── */
            <Box sx={{ textAlign: 'center', py: 3 }}>
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  bgcolor: quizResult.passed
                    ? alpha(theme.palette.success.main, 0.1)
                    : alpha(theme.palette.error.main, 0.1),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 2,
                }}
              >
                <Typography
                  variant="h4"
                  sx={{
                    fontWeight: 800,
                    color: quizResult.passed
                      ? theme.palette.success.main
                      : theme.palette.error.main,
                  }}
                >
                  {quizResult.score_pct}%
                </Typography>
              </Box>

              <Chip
                label={quizResult.passed ? 'PASSED' : 'NOT PASSED'}
                color={quizResult.passed ? 'success' : 'error'}
                sx={{ fontWeight: 700, fontSize: '0.85rem', height: 32, mb: 2 }}
              />

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {quizResult.passed
                  ? 'Great job! You passed this quiz.'
                  : 'Review the section and try again.'}
              </Typography>

              {/* Show each answer result */}
              <Box sx={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 1 }}>
                {quizQuestions.map((q, idx) => {
                  const answerResult = quizResult.answers.find((a) => a.question_id === q.id);
                  const isCorrect = answerResult?.is_correct;

                  return (
                    <Paper
                      key={q.id}
                      elevation={0}
                      sx={{
                        p: 1.5,
                        borderRadius: 2,
                        border: `1px solid ${
                          isCorrect
                            ? alpha(theme.palette.success.main, 0.3)
                            : alpha(theme.palette.error.main, 0.3)
                        }`,
                        bgcolor: isCorrect
                          ? alpha(theme.palette.success.main, 0.03)
                          : alpha(theme.palette.error.main, 0.03),
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {idx + 1}. {q.question_text}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: isCorrect
                            ? theme.palette.success.main
                            : theme.palette.error.main,
                          fontWeight: 600,
                        }}
                      >
                        {isCorrect ? 'Correct' : `Incorrect — Your answer: ${answerResult?.selected_option?.toUpperCase()}`}
                      </Typography>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          ) : (
            /* ─── Quiz Questions ──────────────────────────────── */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, py: 1 }}>
              {quizQuestions.map((q, qIdx) => (
                <Box key={q.id}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, mb: 1.5, lineHeight: 1.5 }}
                  >
                    {qIdx + 1}. {q.question_text}
                  </Typography>
                  <FormControl component="fieldset">
                    <RadioGroup
                      value={quizAnswers[q.id] || ''}
                      onChange={(e) =>
                        setQuizAnswers((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                    >
                      {(['a', 'b', 'c', 'd'] as const).map((opt) => {
                        const optionKey = `option_${opt}` as keyof QuizQuestion;
                        const optionText = q[optionKey] as string;
                        if (!optionText) return null;

                        return (
                          <FormControlLabel
                            key={opt}
                            value={opt}
                            control={
                              <Radio
                                sx={{
                                  '&.Mui-checked': {
                                    color: theme.palette.primary.main,
                                  },
                                }}
                              />
                            }
                            label={
                              <Typography variant="body2" sx={{ py: 0.5 }}>
                                <strong>{opt.toUpperCase()}.</strong> {optionText}
                              </Typography>
                            }
                            sx={{
                              mx: 0,
                              mb: 0.5,
                              px: 1.5,
                              py: 0.5,
                              borderRadius: 2,
                              border: `1px solid ${
                                quizAnswers[q.id] === opt
                                  ? alpha(theme.palette.primary.main, 0.4)
                                  : theme.palette.divider
                              }`,
                              bgcolor:
                                quizAnswers[q.id] === opt
                                  ? alpha(theme.palette.primary.main, 0.04)
                                  : 'transparent',
                              transition: 'all 150ms',
                              minHeight: 48,
                              '&:active': {
                                bgcolor: alpha(theme.palette.primary.main, 0.08),
                              },
                            }}
                          />
                        );
                      })}
                    </RadioGroup>
                  </FormControl>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2 }}>
          {quizResult ? (
            <Button
              variant="contained"
              fullWidth
              onClick={() => setQuizOpen(false)}
              sx={{ minHeight: 48, fontWeight: 700, borderRadius: 2 }}
            >
              Close
            </Button>
          ) : (
            <Button
              variant="contained"
              fullWidth
              onClick={handleQuizSubmit}
              disabled={!allQuestionsAnswered || quizSubmitting}
              sx={{ minHeight: 48, fontWeight: 700, borderRadius: 2 }}
            >
              {quizSubmitting ? 'Submitting...' : `Submit (${Object.keys(quizAnswers).length}/${quizQuestions.length})`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────

interface SectionsListProps {
  sections: Section[];
  currentSectionIndex: number;
  onSectionClick: (index: number) => void;
  onQuizOpen: (section: Section) => void;
  getSectionQuizStatus: (sectionId: string) => 'passed' | 'failed' | 'not_attempted';
  theme: ReturnType<typeof useTheme>;
}

function SectionsList({
  sections,
  currentSectionIndex,
  onSectionClick,
  onQuizOpen,
  getSectionQuizStatus,
  theme,
}: SectionsListProps) {
  if (sections.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.disabled">
          No sections available.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {sections.map((section, idx) => {
        const isCurrent = idx === currentSectionIndex;
        const quizStatus = getSectionQuizStatus(section.id);
        const hasQuiz = section.quiz_questions.length > 0;

        return (
          <Paper
            key={section.id}
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: `1px solid ${
                isCurrent
                  ? alpha(theme.palette.primary.main, 0.4)
                  : theme.palette.divider
              }`,
              bgcolor: isCurrent
                ? alpha(theme.palette.primary.main, 0.04)
                : 'background.paper',
              cursor: 'pointer',
              transition: 'all 150ms',
              minHeight: 48,
              '&:active': {
                transform: 'scale(0.99)',
              },
            }}
            onClick={() => onSectionClick(idx)}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              {/* Section number */}
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: isCurrent
                    ? theme.palette.primary.main
                    : alpha(theme.palette.text.disabled, 0.08),
                  color: isCurrent ? '#fff' : 'text.secondary',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {quizStatus === 'passed' ? (
                  <CheckCircleIcon sx={{ fontSize: 18, color: isCurrent ? '#fff' : theme.palette.success.main }} />
                ) : (
                  idx + 1
                )}
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: isCurrent ? 700 : 600,
                    lineHeight: 1.3,
                    color: isCurrent ? theme.palette.primary.main : 'text.primary',
                  }}
                >
                  {section.title}
                </Typography>

                {/* Time range */}
                {section.start_time_seconds != null && (
                  <Typography
                    variant="caption"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.7rem',
                      color: 'text.disabled',
                      mt: 0.25,
                      display: 'block',
                    }}
                  >
                    {formatTime(section.start_time_seconds)}
                    {section.end_time_seconds != null
                      ? ` — ${formatTime(section.end_time_seconds)}`
                      : ''}
                  </Typography>
                )}

                {/* Quiz chip + button */}
                {hasQuiz && (
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    {quizStatus === 'passed' && (
                      <Chip
                        size="small"
                        label="Quiz Passed"
                        color="success"
                        sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    )}
                    {quizStatus === 'failed' && (
                      <Chip
                        size="small"
                        label="Quiz Failed"
                        color="error"
                        sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                      />
                    )}
                    <Button
                      size="small"
                      variant={quizStatus === 'not_attempted' ? 'contained' : 'outlined'}
                      startIcon={<QuizOutlinedIcon sx={{ fontSize: 14 }} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onQuizOpen(section);
                      }}
                      sx={{
                        minHeight: 32,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        borderRadius: 1.5,
                        textTransform: 'none',
                        px: 1.5,
                      }}
                    >
                      {quizStatus === 'not_attempted' ? 'Take Quiz' : 'Retry Quiz'}
                    </Button>
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        );
      })}
    </Box>
  );
}

interface NotesListProps {
  sections: Section[];
  noteTexts: Record<string, string>;
  noteSaving: Record<string, boolean>;
  onNoteChange: (sectionId: string, text: string) => void;
  theme: ReturnType<typeof useTheme>;
}

function NotesList({
  sections,
  noteTexts,
  noteSaving,
  onNoteChange,
  theme,
}: NotesListProps) {
  if (sections.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography variant="body2" color="text.disabled">
          No sections to add notes for.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {sections.map((section) => (
        <Paper
          key={section.id}
          elevation={0}
          sx={{
            p: 2,
            borderRadius: 2.5,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {section.title}
            </Typography>
            {noteSaving[section.id] && (
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                Saving...
              </Typography>
            )}
          </Box>
          <TextField
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            placeholder="Add your notes here..."
            value={noteTexts[section.id] || ''}
            onChange={(e) => onNoteChange(section.id, e.target.value)}
            variant="outlined"
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                fontSize: '0.85rem',
                '& fieldset': {
                  borderColor: alpha(theme.palette.divider, 0.8),
                },
              },
              '& .MuiOutlinedInput-input': {
                minHeight: 48,
              },
            }}
          />
        </Paper>
      ))}
    </Box>
  );
}

interface DesktopSidebarProps extends SectionsListProps, Omit<NotesListProps, 'sections' | 'theme'> {}

function DesktopSidebar({
  sections,
  currentSectionIndex,
  onSectionClick,
  onQuizOpen,
  getSectionQuizStatus,
  noteTexts,
  noteSaving,
  onNoteChange,
  theme,
}: DesktopSidebarProps) {
  const [sidebarTab, setSidebarTab] = useState(0);

  return (
    <Box>
      <Tabs
        value={sidebarTab}
        onChange={(_, v) => setSidebarTab(v)}
        variant="fullWidth"
        sx={{
          mb: 2,
          borderBottom: `1px solid ${theme.palette.divider}`,
          '& .MuiTab-root': {
            minHeight: 48,
            fontWeight: 600,
            fontSize: '0.85rem',
          },
        }}
      >
        <Tab
          label={`Sections (${sections.length})`}
          icon={<PlayArrowIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
        <Tab
          label="Notes"
          icon={<NoteOutlinedIcon sx={{ fontSize: 18 }} />}
          iconPosition="start"
        />
      </Tabs>

      {sidebarTab === 0 && (
        <SectionsList
          sections={sections}
          currentSectionIndex={currentSectionIndex}
          onSectionClick={onSectionClick}
          onQuizOpen={onQuizOpen}
          getSectionQuizStatus={getSectionQuizStatus}
          theme={theme}
        />
      )}

      {sidebarTab === 1 && (
        <NotesList
          sections={sections}
          noteTexts={noteTexts}
          noteSaving={noteSaving}
          onNoteChange={onNoteChange}
          theme={theme}
        />
      )}
    </Box>
  );
}
