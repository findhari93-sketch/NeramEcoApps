'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Skeleton,
  alpha,
  useTheme,
  Breadcrumbs,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoPlayer from '@/components/foundation/VideoPlayer';
import SectionList from '@/components/foundation/SectionList';
import QuizModal from '@/components/foundation/QuizModal';
import NoteEditor from '@/components/foundation/NoteEditor';
import ChapterFeedback from '@/components/foundation/ChapterFeedback';
import FoundationProgressBar from '@/components/foundation/ProgressBar';
import Transcript from '@/components/foundation/Transcript';
import type {
  NexusFoundationChapter,
  NexusFoundationSectionWithQuiz,
  NexusFoundationStudentProgress,
} from '@neram/database/types';

interface ChapterData {
  chapter: NexusFoundationChapter;
  sections: NexusFoundationSectionWithQuiz[];
  progress: NexusFoundationStudentProgress | null;
}

export default function ChapterLearningView() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const chapterId = params.chapterId as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSectionIndex, setQuizSectionIndex] = useState(0);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPosRef = useRef(0);
  const videoPlaceholderRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const videoInnerRef = useRef<HTMLDivElement>(null);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  const fetchChapter = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/foundation/chapters/${chapterId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const chapterData = await res.json();
        setData(chapterData);

        // Only update section index on initial load, not silent refreshes
        if (!silent) {
          // Determine starting section (resume or first incomplete)
          if (chapterData.progress?.last_section_id) {
            const idx = chapterData.sections.findIndex(
              (s: any) => s.id === chapterData.progress.last_section_id
            );
            if (idx >= 0) setCurrentSectionIndex(idx);
          } else {
            // Find first section without a passing attempt
            const firstIncomplete = chapterData.sections.findIndex(
              (s: any) => !s.quiz_attempt?.passed
            );
            if (firstIncomplete >= 0) setCurrentSectionIndex(firstIncomplete);
          }
        }

        // Mark chapter as in_progress if not already
        if (!chapterData.progress || chapterData.progress.status === 'locked') {
          await fetch(`/api/foundation/chapters/${chapterId}/progress`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: 'in_progress' }),
          });
        }
      }
    } catch (err) {
      console.error('Failed to load chapter:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [chapterId, getToken]);

  useEffect(() => {
    if (!authLoading) fetchChapter();
  }, [authLoading, fetchChapter]);

  // Auto-save video position every 30 seconds
  const saveProgress = useCallback(async (seconds: number) => {
    if (Math.abs(seconds - lastSavedPosRef.current) < 10) return;
    lastSavedPosRef.current = seconds;

    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/foundation/chapters/${chapterId}/progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_video_position_seconds: seconds,
          last_section_id: data?.sections[currentSectionIndex]?.id,
        }),
      });
    } catch (err) {
      // Silent fail for position saves
    }
  }, [chapterId, getToken, currentSectionIndex, data]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    setCurrentVideoTime(seconds);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(seconds), 30000);
  }, [saveProgress]);

  // Coursera-style video shrink using position:fixed when scrolled.
  // Fixed elements are OUT of document flow — changing their height
  // has ZERO effect on document layout, so no feedback loop is possible.
  useEffect(() => {
    const placeholder = videoPlaceholderRef.current;
    const wrapper = videoWrapperRef.current;
    const inner = videoInnerRef.current;
    if (!placeholder || !wrapper || !inner) return;

    const MIN_RATIO = 0.5;
    const SCROLL_RANGE = 300;
    let isFixed = false;
    let ticking = false;
    // Cached measurements (updated on mount + resize only)
    let pTop = 0;
    let pLeft = 0;
    let pWidth = 0;
    let fullH = 0;
    let lastH = 0;

    const cacheMeasurements = () => {
      const rect = placeholder.getBoundingClientRect();
      pTop = rect.top + window.scrollY;
      pLeft = rect.left;
      pWidth = rect.width;
      fullH = rect.height;
      lastH = fullH;
    };

    // Measure after first paint
    requestAnimationFrame(cacheMeasurements);

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolledPast = window.scrollY - pTop;

        if (scrolledPast <= 0) {
          // Video in normal flow
          if (isFixed) {
            wrapper.style.position = 'absolute';
            wrapper.style.top = '0';
            wrapper.style.left = '0';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            wrapper.style.borderRadius = '';
            inner.style.transform = 'none';
            inner.style.width = '100%';
            inner.style.height = '100%';
            isFixed = false;
          }
        } else {
          // Scrolled past — position: fixed, shrink height
          const ratio = Math.min(scrolledPast / SCROLL_RANGE, 1);
          const scale = 1 - ratio * (1 - MIN_RATIO);
          const h = Math.round(fullH * scale);

          if (!isFixed) {
            // Cache fresh left/width at the moment of switching
            const freshRect = placeholder.getBoundingClientRect();
            pLeft = freshRect.left;
            pWidth = freshRect.width;
            wrapper.style.position = 'fixed';
            wrapper.style.top = '0px';
            wrapper.style.left = `${pLeft}px`;
            wrapper.style.width = `${pWidth}px`;
            wrapper.style.borderRadius = '0px';
            isFixed = true;
          }

          if (h !== lastH) {
            wrapper.style.height = `${h}px`;
            // Inner stays at full size, scaled down with transformOrigin: top center
            inner.style.width = `${pWidth}px`;
            inner.style.height = `${fullH}px`;
            inner.style.transform = `scale(${scale})`;
            lastH = h;
          }
        }
        ticking = false;
      });
    };

    const handleResize = () => {
      // Temporarily return to flow to re-measure
      if (isFixed) {
        wrapper.style.position = 'absolute';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.style.width = '100%';
        wrapper.style.height = '100%';
        inner.style.transform = 'none';
        inner.style.width = '100%';
        inner.style.height = '100%';
        isFixed = false;
      }
      requestAnimationFrame(() => {
        cacheMeasurements();
        // Re-evaluate scroll position
        handleScroll();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [loading]);

  // Save position on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const player = (window as any).__foundationPlayer;
      if (player?.getCurrentTime) {
        const pos = player.getCurrentTime();
        if (pos > 0) saveProgress(pos);
      }
    };
  }, [saveProgress]);

  const handleSectionEnd = useCallback((sectionIndex: number) => {
    setQuizSectionIndex(sectionIndex);
    setQuizOpen(true);
  }, []);

  const handleSectionClick = useCallback((index: number) => {
    setCurrentSectionIndex(index);
    const section = data?.sections[index];
    if (section) {
      const player = (window as any).__foundationPlayer;
      if (player?.seekTo) {
        player.seekTo(section.start_timestamp_seconds);
        player.play();
      }
    }
  }, [data]);

  const handleQuizSubmit = useCallback(async (answers: Record<string, string>) => {
    const section = data?.sections[quizSectionIndex];
    if (!section) throw new Error('Section not found');

    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/foundation/sections/${section.id}/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers }),
    });

    if (!res.ok) throw new Error('Failed to submit quiz');
    const result = await res.json();

    // Silently refresh chapter data to update section statuses (no loading skeleton)
    await fetchChapter(true);

    return result;
  }, [data, quizSectionIndex, getToken, fetchChapter]);

  const handleQuizRetry = useCallback(() => {
    setQuizOpen(false);
    const section = data?.sections[quizSectionIndex];
    if (section) {
      const player = (window as any).__foundationPlayer;
      if (player) {
        // Clear the triggered flag so quiz can re-trigger at section end
        player.resetSectionTrigger?.(quizSectionIndex);
        // Enable rewatch mode — prevents seeking past section end
        player.setRewatchMode?.(true, section.end_timestamp_seconds);
        // Seek to section start and play
        player.seekTo(section.start_timestamp_seconds);
        player.play();
      }
    }
  }, [data, quizSectionIndex]);

  const handleQuizContinue = useCallback(() => {
    setQuizOpen(false);
    const nextIndex = quizSectionIndex + 1;
    if (nextIndex < (data?.sections.length || 0)) {
      setCurrentSectionIndex(nextIndex);
      const player = (window as any).__foundationPlayer;
      if (player?.play) player.play();
    }
  }, [quizSectionIndex, data]);

  const handleNoteSave = useCallback(async (sectionId: string, noteText: string) => {
    const token = await getToken();
    if (!token) return;

    await fetch(`/api/foundation/sections/${sectionId}/notes`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ note_text: noteText }),
    });
  }, [getToken]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: { xs: 0, sm: 2 }, mb: 2 }} />
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 1 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 0.5 }} />
        ))}
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Chapter not found
        </Typography>
      </Box>
    );
  }

  const { chapter, sections, progress } = data;
  const currentSection = sections[currentSectionIndex];
  const completedSections = sections.filter(s => s.quiz_attempt?.passed).length;

  return (
    <Box sx={{ mx: { xs: -2, sm: 0 } }}>
      {/* Back button + breadcrumb */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 1.5,
          px: { xs: 2, sm: 0 },
        }}
      >
        <IconButton
          size="small"
          onClick={() => router.push('/student/foundation')}
          sx={{ mr: 0.5 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            Chapter {chapter.chapter_number} of 10
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {chapter.title}
          </Typography>
        </Box>
      </Box>

      {/* Placeholder — stays in document flow, constant 16:9 height.
          Video wrapper lives inside it (absolute) and switches to fixed on scroll. */}
      <Box
        ref={videoPlaceholderRef}
        sx={{
          position: 'relative',
          width: '100%',
          height: 0,
          paddingTop: '56.25%',
          borderRadius: { xs: 0, sm: 2 },
          bgcolor: '#000',
          overflow: 'visible',
        }}
      >
        {/* Video wrapper — absolute initially, switches to position:fixed on scroll.
            Fixed elements are out of document flow, so height changes cause no reflow. */}
        <Box
          ref={videoWrapperRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            bgcolor: '#000',
            borderRadius: { xs: 0, sm: 2 },
            zIndex: 10,
          }}
        >
          {/* Inner content — scaled proportionally when wrapper shrinks */}
          <Box
            ref={videoInnerRef}
            sx={{
              width: '100%',
              height: '100%',
              transformOrigin: 'top center',
            }}
          >
            <VideoPlayer
              videoId={chapter.youtube_video_id}
              sections={sections}
              currentSectionIndex={currentSectionIndex}
              resumePosition={progress?.last_video_position_seconds}
              onSectionEnd={handleSectionEnd}
              onTimeUpdate={handleTimeUpdate}
            />
          </Box>
        </Box>
      </Box>

      {/* Content below video */}
      <Box sx={{ px: { xs: 2, sm: 0 }, mt: 2 }}>
        {/* Chapter progress */}
        <FoundationProgressBar
          completed={completedSections}
          total={sections.length}
          label="Section Progress"
          size="small"
        />

        {/* Section List */}
        <Box sx={{ mt: 2 }}>
          <SectionList
            sections={sections}
            currentSectionIndex={currentSectionIndex}
            onSectionClick={handleSectionClick}
          />
        </Box>

        {/* Transcript */}
        <Transcript
          chapterId={chapterId}
          currentTime={currentVideoTime}
          getToken={getToken}
          onSeek={(seconds) => {
            const player = (window as any).__foundationPlayer;
            if (player?.seekTo) {
              player.seekTo(seconds);
              player.play();
            }
          }}
        />

        {/* Note Editor for current section */}
        {currentSection && (
          <NoteEditor
            sectionId={currentSection.id}
            sectionTitle={currentSection.title}
            initialNote={currentSection.note?.note_text}
            onSave={handleNoteSave}
          />
        )}

        {/* Feedback: like/dislike + report issue */}
        <ChapterFeedback
          chapterId={chapterId}
          sections={sections}
          getToken={getToken}
        />
      </Box>

      {/* Quiz Modal */}
      {sections[quizSectionIndex] && (
        <QuizModal
          open={quizOpen}
          sectionTitle={sections[quizSectionIndex].title}
          questions={sections[quizSectionIndex].quiz_questions}
          onClose={() => setQuizOpen(false)}
          onSubmit={handleQuizSubmit}
          onRetry={handleQuizRetry}
          onContinue={handleQuizContinue}
        />
      )}
    </Box>
  );
}
