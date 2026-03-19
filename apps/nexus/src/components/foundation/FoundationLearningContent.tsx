'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Skeleton,
  Tabs,
  Tab,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoPlayer from '@/components/foundation/VideoPlayer';
import SharePointPlayer from '@/components/foundation/SharePointPlayer';
import SectionTimer from '@/components/foundation/SectionTimer';
import SectionList from '@/components/foundation/SectionList';
import QuizModal from '@/components/foundation/QuizModal';
import AllSectionsQuizModal from '@/components/foundation/AllSectionsQuizModal';
import NoteEditor from '@/components/foundation/NoteEditor';
import ChapterFeedback from '@/components/foundation/ChapterFeedback';
import FoundationProgressBar from '@/components/foundation/ProgressBar';
import Transcript from '@/components/foundation/Transcript';
import PDFReader from '@/components/reader/PDFReader';
import AudioPlayer from '@/components/reader/AudioPlayer';
import type {
  NexusFoundationChapter,
  NexusFoundationSectionWithQuiz,
  NexusFoundationStudentProgress,
  NexusAudioTrack,
} from '@neram/database/types';

interface ChapterData {
  chapter: NexusFoundationChapter;
  sections: NexusFoundationSectionWithQuiz[];
  progress: NexusFoundationStudentProgress | null;
  audio_tracks?: NexusAudioTrack[];
}

type ContentTab = 'watch' | 'read';

interface FoundationLearningContentProps {
  chapterId: string;
  /** URL for the back button. Defaults to '/student/foundation' */
  backUrl?: string;
}

export default function FoundationLearningContent({
  chapterId,
  backUrl = '/student/foundation',
}: FoundationLearningContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSectionIndex, setQuizSectionIndex] = useState(0);
  const [allQuizMode, setAllQuizMode] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('watch');
  const [msToken, setMsToken] = useState<string | null>(null);

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
      setMsToken(token);

      const res = await fetch(`/api/foundation/chapters/${chapterId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const chapterData = await res.json();
        setData(chapterData);

        // Set default content tab based on available content
        if (!silent) {
          const chYtId = chapterData.chapter.youtube_video_id;
          const hasValidYt = !!(chYtId && chYtId.length === 11 && !chYtId.startsWith('PLACEHOLDER'));
          const chHasVideo = chapterData.chapter.video_source === 'sharepoint'
            ? !!chapterData.chapter.sharepoint_video_url
            : hasValidYt;
          if (!chHasVideo && chapterData.chapter.pdf_url) {
            setContentTab('read');
          }
        }

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
    // Only auto-save position for YouTube (SharePoint iframe has no time API)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(seconds), 30000);
  }, [saveProgress]);

  // Coursera-style video shrink using position:fixed when scrolled.
  useEffect(() => {
    const placeholder = videoPlaceholderRef.current;
    const wrapper = videoWrapperRef.current;
    const inner = videoInnerRef.current;
    if (!placeholder || !wrapper || !inner) return;

    const MIN_RATIO = 0.5;
    const SCROLL_RANGE = 300;
    let isFixed = false;
    let ticking = false;
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

    requestAnimationFrame(cacheMeasurements);

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const scrolledPast = window.scrollY - pTop;

        if (scrolledPast <= 0) {
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
          const ratio = Math.min(scrolledPast / SCROLL_RANGE, 1);
          const scale = 1 - ratio * (1 - MIN_RATIO);
          const h = Math.round(fullH * scale);

          if (!isFixed) {
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
    // Pause video when quiz opens
    const player = (window as any).__foundationPlayer;
    if (player?.pause) player.pause();
    setQuizSectionIndex(sectionIndex);
    setQuizOpen(true);
  }, []);

  const handleSectionClick = useCallback((index: number) => {
    setCurrentSectionIndex(index);
    if (data?.chapter.video_source !== 'sharepoint') {
      const section = data?.sections[index];
      if (section) {
        const player = (window as any).__foundationPlayer;
        if (player?.seekTo) {
          player.seekTo(section.start_timestamp_seconds);
          player.play();
        }
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

    await fetchChapter(true);

    return result;
  }, [data, quizSectionIndex, getToken, fetchChapter]);

  const handleQuizRetry = useCallback(() => {
    setQuizOpen(false);
    const section = data?.sections[quizSectionIndex];
    if (section) {
      if (data?.chapter.video_source === 'sharepoint') {
        setCurrentSectionIndex(quizSectionIndex);
      } else {
        const player = (window as any).__foundationPlayer;
        if (player) {
          player.resetSectionTrigger?.(quizSectionIndex);
          player.setRewatchMode?.(true, section.end_timestamp_seconds);
          player.seekTo(section.start_timestamp_seconds);
          player.play();
        }
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

  const handleAllQuizSubmitSection = useCallback(async (sectionId: string, answers: Record<string, string>) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/foundation/sections/${sectionId}/quiz`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ answers }),
    });

    if (!res.ok) throw new Error('Failed to submit quiz');
    return res.json();
  }, [getToken]);

  const handleAllQuizComplete = useCallback(() => {
    setAllQuizMode(false);
    fetchChapter(true);
  }, [fetchChapter]);

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

  const { chapter, sections, progress, audio_tracks } = data;
  const currentSection = sections[currentSectionIndex];
  const completedSections = sections.filter(s => s.quiz_attempt?.passed).length;

  // Validate YouTube video IDs: must be 11 chars, not a placeholder
  const hasValidYoutubeId = !!(
    chapter.youtube_video_id &&
    chapter.youtube_video_id.length === 11 &&
    !chapter.youtube_video_id.startsWith('PLACEHOLDER')
  );
  const hasVideo = chapter.video_source === 'sharepoint'
    ? !!chapter.sharepoint_video_url
    : hasValidYoutubeId;
  const hasPdf = !!chapter.pdf_url;
  const hasAudio = (audio_tracks?.length ?? 0) > 0;
  const showTabs = hasVideo && hasPdf; // Only show tabs if both available

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
          onClick={() => router.push(backUrl)}
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

      {/* Content tabs (Watch / Read) or PDF-only header */}
      {showTabs ? (
        <Tabs
          value={contentTab}
          onChange={(_, v) => setContentTab(v)}
          sx={{
            mb: 1,
            px: { xs: 2, sm: 0 },
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              minHeight: 40,
            },
          }}
        >
          <Tab
            value="watch"
            label="Watch"
            icon={<OndemandVideoOutlinedIcon sx={{ fontSize: '1rem' }} />}
            iconPosition="start"
          />
          <Tab
            value="read"
            label="Read"
            icon={<MenuBookOutlinedIcon sx={{ fontSize: '1rem' }} />}
            iconPosition="start"
          />
        </Tabs>
      ) : (!hasVideo && hasPdf) ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: { xs: 2, sm: 0 } }}>
          <MenuBookOutlinedIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Reading Material</Typography>
        </Box>
      ) : null}

      {/* Video Player (Watch tab or only content) */}
      {((contentTab === 'watch' && hasVideo) || (!hasPdf && hasVideo)) && (
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
            <Box
              ref={videoInnerRef}
              sx={{
                width: '100%',
                height: '100%',
                transformOrigin: 'top center',
              }}
            >
              {chapter.video_source === 'sharepoint' && chapter.sharepoint_video_url ? (
                <SharePointPlayer videoUrl={chapter.sharepoint_video_url} chapterId={chapterId} token={msToken} />
              ) : (
                <VideoPlayer
                  videoId={chapter.youtube_video_id!}
                  sections={sections}
                  currentSectionIndex={currentSectionIndex}
                  resumePosition={progress?.last_video_position_seconds}
                  onSectionEnd={handleSectionEnd}
                  onTimeUpdate={handleTimeUpdate}
                />
              )}
            </Box>
          </Box>
        </Box>
      )}

      {/* PDF Reader (Read tab or only content) */}
      {((contentTab === 'read' && hasPdf) || (!hasVideo && hasPdf)) && (
        <Box
          sx={{
            height: {
              xs: 'calc(100dvh - 244px)',
              md: 'calc(100vh - 180px)',
            },
            maxWidth: { md: '850px' },
            mx: { md: 'auto' },
            borderRadius: { xs: 0, sm: 2 },
            overflow: 'hidden',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <PDFReader
            pdfUrl={`/api/foundation/chapters/${chapterId}/pdf-stream${msToken ? `?token=${encodeURIComponent(msToken)}` : ''}`}
            initialPage={progress?.last_pdf_page || 1}
            totalPages={chapter.pdf_page_count || undefined}
            onPageChange={(page) => {
              // Save PDF progress
              getToken().then((token) => {
                if (!token) return;
                fetch(`/api/foundation/chapters/${chapterId}/progress`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ last_pdf_page: page }),
                });
              });
            }}
          />
        </Box>
      )}

      {/* Content below video */}
      <Box sx={{ px: { xs: 2, sm: 0 }, mt: 2 }}>
        {/* Chapter progress */}
        <FoundationProgressBar
          completed={completedSections}
          total={sections.length}
          label="Section Progress"
          size="small"
        />

        {/* SharePoint actions */}
        {chapter.video_source === 'sharepoint' && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {chapter.sharepoint_video_url && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                href={chapter.sharepoint_video_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.8rem' }}
              >
                Watch in SharePoint
              </Button>
            )}
            {sections.some(s => s.quiz_questions.length > 0 && !s.quiz_attempt?.passed) && (
              <Button
                size="small"
                variant="contained"
                startIcon={<PlaylistPlayIcon />}
                onClick={() => setAllQuizMode(true)}
                sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.8rem' }}
              >
                Attempt All Quizzes
              </Button>
            )}
          </Box>
        )}

        {/* Section Timer (SharePoint only) */}
        {chapter.video_source === 'sharepoint' && (
          <Box sx={{ mt: 2 }}>
            <SectionTimer
              sections={sections}
              currentSectionIndex={currentSectionIndex}
              onSectionEnd={handleSectionEnd}
              isActive={!quizOpen}
            />
          </Box>
        )}

        {/* Section List */}
        <Box sx={{ mt: 2 }}>
          <SectionList
            sections={sections}
            currentSectionIndex={currentSectionIndex}
            chapterNumber={chapter.chapter_number}
            onSectionClick={handleSectionClick}
          />
        </Box>

        {/* Transcript (YouTube only) */}
        {chapter.video_source !== 'sharepoint' && (
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
        )}

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
          onClose={() => {
            setQuizOpen(false);
            // Resume video when quiz is dismissed
            const player = (window as any).__foundationPlayer;
            if (player?.play) player.play();
          }}
          onSubmit={handleQuizSubmit}
          onRetry={handleQuizRetry}
          onContinue={handleQuizContinue}
        />
      )}

      {/* All Sections Quiz Modal (SharePoint only) */}
      {chapter.video_source === 'sharepoint' && (
        <AllSectionsQuizModal
          open={allQuizMode}
          sections={sections}
          chapterNumber={chapter.chapter_number}
          onClose={() => setAllQuizMode(false)}
          onSubmitSection={handleAllQuizSubmitSection}
          onComplete={handleAllQuizComplete}
        />
      )}

      {/* Audio Player — persistent bar at bottom when audio tracks exist */}
      {hasAudio && audio_tracks && (
        <AudioPlayer
          tracks={audio_tracks.map((t) => ({
            id: t.id,
            language: t.language,
            language_label: t.language_label,
            audio_url: t.audio_url,
            audio_duration_seconds: t.audio_duration_seconds,
          }))}
          initialPosition={progress?.last_audio_position_seconds || 0}
          initialLanguage={progress?.last_audio_language || 'en'}
          onPositionChange={(seconds, language) => {
            getToken().then((token) => {
              if (!token) return;
              fetch(`/api/foundation/chapters/${chapterId}/progress`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  last_audio_position_seconds: seconds,
                  last_audio_language: language,
                }),
              });
            });
          }}
        />
      )}
    </Box>
  );
}
