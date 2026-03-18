'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Skeleton,
  Tabs,
  Tab,
  CircularProgress,
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
import SectionTimer from '@/components/foundation/SectionTimer';
import SectionList from '@/components/foundation/SectionList';
import QuizModal from '@/components/foundation/QuizModal';
import AllSectionsQuizModal from '@/components/foundation/AllSectionsQuizModal';
import NoteEditor from '@/components/foundation/NoteEditor';
import ChapterFeedback from '@/components/foundation/ChapterFeedback';
import FoundationProgressBar from '@/components/foundation/ProgressBar';
import PDFReader from '@/components/reader/PDFReader';
import AudioPlayer from '@/components/reader/AudioPlayer';
import type {
  NexusFoundationSectionWithQuiz,
  NexusFoundationSection,
  NexusAudioTrack,
} from '@neram/database/types';

// ─── Types ───────────────────────────────────────────────────────────

interface ModuleItemData {
  id: string;
  title: string;
  description: string | null;
  item_type: string;
  video_source: 'youtube' | 'sharepoint' | null;
  youtube_video_id: string | null;
  sharepoint_video_url: string | null;
  chapter_number: number | null;
  pdf_url: string | null;
  pdf_page_count: number | null;
  sections: NexusFoundationSectionWithQuiz[];
  progress: {
    status: string;
    last_video_position_seconds: number | null;
    last_section_id: string | null;
    last_pdf_page: number | null;
    last_audio_position_seconds: number | null;
    last_audio_language: string | null;
  } | null;
  audio_tracks: NexusAudioTrack[];
}

type ContentTab = 'watch' | 'read';

// ─── Component ───────────────────────────────────────────────────────

export default function StudentItemLearningPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.id as string;
  const itemId = params.itemId as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<ModuleItemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSectionIndex, setQuizSectionIndex] = useState(0);
  const [allQuizMode, setAllQuizMode] = useState(false);
  const [contentTab, setContentTab] = useState<ContentTab>('watch');
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // SharePoint streaming
  const [spStreamUrl, setSpStreamUrl] = useState<string | null>(null);
  const [spStreamLoading, setSpStreamLoading] = useState(false);

  // PDF streaming (fresh download URL)
  const [pdfStreamUrl, setPdfStreamUrl] = useState<string | null>(null);
  const [pdfStreamLoading, setPdfStreamLoading] = useState(false);
  const [pdfStreamError, setPdfStreamError] = useState<string | null>(null);
  const [pdfRetryCount, setPdfRetryCount] = useState(0);
  const spVideoRef = useRef<HTMLVideoElement>(null);
  const spQuizTriggeredRef = useRef<Set<number>>(new Set());

  const currentSectionRef = useRef(0);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPosRef = useRef(0);
  const videoPlaceholderRef = useRef<HTMLDivElement>(null);
  const videoWrapperRef = useRef<HTMLDivElement>(null);
  const videoInnerRef = useRef<HTMLDivElement>(null);

  // ─── Data fetching ──────────────────────────────────────────────────

  const fetchItem = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/modules/${moduleId}/items/${itemId}/detail`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load item');

      const json = await res.json();
      const item = json.item as ModuleItemData;
      setData(item);

      if (!silent) {
        // Set default content tab
        const hasVideo = item.video_source && (item.youtube_video_id || item.sharepoint_video_url);
        if (!hasVideo && item.pdf_url) setContentTab('read');

        // Resume from last section
        if (item.progress?.last_section_id) {
          const idx = item.sections.findIndex((s) => s.id === item.progress!.last_section_id);
          if (idx >= 0) setCurrentSectionIndex(idx);
        } else {
          // Find first section without a passing attempt
          const firstIncomplete = item.sections.findIndex((s) => !s.quiz_attempt?.passed);
          if (firstIncomplete >= 0) setCurrentSectionIndex(firstIncomplete);
        }
      }

      // Mark as in_progress if not started
      if (!item.progress || item.progress.status === 'not_started') {
        fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'in_progress' }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Failed to load item detail:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [getToken, moduleId, itemId]);

  useEffect(() => {
    if (!authLoading) fetchItem();
  }, [authLoading, fetchItem]);

  // ─── SharePoint Streaming URL ──────────────────────────────────────

  useEffect(() => {
    if (!data?.sharepoint_video_url || data.youtube_video_id) return;
    let cancelled = false;
    setSpStreamLoading(true);

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(
          `/api/sharepoint/stream?url=${encodeURIComponent(data.sharepoint_video_url!)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok && !cancelled) {
          const json = await res.json();
          setSpStreamUrl(json.streamUrl);
        }
      } catch (err) {
        console.error('Failed to get SharePoint stream URL:', err);
      } finally {
        if (!cancelled) setSpStreamLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [data?.sharepoint_video_url, data?.youtube_video_id, getToken]);

  // ─── PDF Stream URL ──────────────────────────────────────────────────
  // The pdf-stream endpoint proxies the PDF binary from SharePoint (avoids CORS).
  // We pass the auth token as a query param since pdf.js can't set headers.

  useEffect(() => {
    if (!data?.pdf_url) return;
    let cancelled = false;
    setPdfStreamLoading(true);
    setPdfStreamError(null);

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        // Build the proxied URL — pdf.js will fetch this directly (same origin, no CORS)
        const streamUrl = `/api/modules/${moduleId}/items/${itemId}/pdf-stream?token=${encodeURIComponent(token)}`;
        if (!cancelled) {
          setPdfStreamUrl(streamUrl);
          setPdfStreamError(null);
        }
      } catch (err) {
        console.error('Failed to build PDF stream URL:', err);
        if (!cancelled) {
          setPdfStreamUrl(null);
          setPdfStreamError('Failed to load PDF');
        }
      } finally {
        if (!cancelled) setPdfStreamLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [data?.pdf_url, getToken, moduleId, itemId, pdfRetryCount]);

  // Keep ref in sync with state for use in timeupdate handler
  useEffect(() => {
    currentSectionRef.current = currentSectionIndex;
  }, [currentSectionIndex]);

  // ─── SharePoint video time tracking ────────────────────────────────

  useEffect(() => {
    const video = spVideoRef.current;
    if (!video || !data?.sections.length) return;

    const sections = data.sections;

    // Clear triggered flags for sections that are now passed (data refreshed after quiz)
    sections.forEach((s, i) => {
      if (s.quiz_attempt?.passed) {
        spQuizTriggeredRef.current.add(i); // mark as done so we don't re-trigger
      }
    });

    const onTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentVideoTime(time);

      // Auto-detect current section
      for (let i = sections.length - 1; i >= 0; i--) {
        if (time >= sections[i].start_timestamp_seconds) {
          if (i !== currentSectionRef.current) {
            currentSectionRef.current = i;
            setCurrentSectionIndex(i);
          }
          break;
        }
      }

      // Auto-trigger quiz when section ends (only for unpassed sections)
      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (
          time >= section.end_timestamp_seconds &&
          section.quiz_questions.length > 0 &&
          !section.quiz_attempt?.passed &&
          !spQuizTriggeredRef.current.has(i)
        ) {
          spQuizTriggeredRef.current.add(i);
          setQuizSectionIndex(i);
          setQuizOpen(true);
          video.pause();
          break;
        }
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    return () => video.removeEventListener('timeupdate', onTimeUpdate);
  }, [data?.sections, spStreamUrl]);

  // ─── Auto-save video position every 30 seconds ─────────────────────

  const saveProgress = useCallback(async (seconds: number) => {
    if (Math.abs(seconds - lastSavedPosRef.current) < 10) return;
    lastSavedPosRef.current = seconds;

    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_video_position_seconds: Math.floor(seconds),
          last_section_id: data?.sections[currentSectionIndex]?.id,
        }),
      });
    } catch {
      // Silent fail
    }
  }, [getToken, moduleId, itemId, currentSectionIndex, data]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    setCurrentVideoTime(seconds);

    // Auto-detect current section based on video time (YouTube)
    if (data?.sections.length) {
      for (let i = data.sections.length - 1; i >= 0; i--) {
        if (seconds >= data.sections[i].start_timestamp_seconds) {
          if (i !== currentSectionRef.current) {
            currentSectionRef.current = i;
            setCurrentSectionIndex(i);
          }
          break;
        }
      }
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(seconds), 30000);
  }, [saveProgress, data?.sections]);

  // Coursera-style video shrink
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
      if (spVideoRef.current) {
        const pos = spVideoRef.current.currentTime;
        if (pos > 0) saveProgress(pos);
      }
    };
  }, [saveProgress]);

  // ─── Quiz handlers ─────────────────────────────────────────────────

  // Helper to pause whichever video player is active
  const pauseVideo = useCallback(() => {
    if (spVideoRef.current) {
      spVideoRef.current.pause();
    } else {
      const player = (window as any).__foundationPlayer;
      if (player?.pause) player.pause();
    }
  }, []);

  // Helper to resume whichever video player is active
  const resumeVideo = useCallback(() => {
    if (spVideoRef.current) {
      spVideoRef.current.play().catch(() => {});
    } else {
      const player = (window as any).__foundationPlayer;
      if (player?.play) player.play();
    }
  }, []);

  const handleSectionEnd = useCallback((sectionIndex: number) => {
    const section = data?.sections[sectionIndex];
    if (!section) return;

    // If section is already passed, skip quiz and continue playing
    if (section.quiz_attempt?.passed) return;

    // No quiz questions for this section — just continue playing
    if (!section.quiz_questions?.length) return;

    // Pause video and show quiz
    pauseVideo();
    setQuizSectionIndex(sectionIndex);
    setQuizOpen(true);
  }, [data, pauseVideo]);

  const handleSectionClick = useCallback((index: number) => {
    setCurrentSectionIndex(index);
    if (data?.video_source === 'sharepoint') {
      if (spVideoRef.current && data.sections[index]) {
        spVideoRef.current.currentTime = data.sections[index].start_timestamp_seconds;
        spVideoRef.current.play().catch(() => {});
      }
    } else {
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

    const res = await fetch(
      `/api/modules/${moduleId}/items/${itemId}/sections/${section.id}/quiz`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      }
    );

    if (!res.ok) throw new Error('Failed to submit quiz');
    const result = await res.json();

    await fetchItem(true);

    return result.attempt;
  }, [data, quizSectionIndex, getToken, fetchItem, moduleId, itemId]);

  const handleQuizRetry = useCallback(() => {
    setQuizOpen(false);
    const section = data?.sections[quizSectionIndex];
    if (section) {
      if (data?.video_source === 'sharepoint') {
        spQuizTriggeredRef.current.delete(quizSectionIndex);
        if (spVideoRef.current) {
          spVideoRef.current.currentTime = section.start_timestamp_seconds;
          spVideoRef.current.play().catch(() => {});
        }
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
      if (data?.video_source === 'sharepoint') {
        if (spVideoRef.current && data.sections[nextIndex]) {
          spVideoRef.current.currentTime = data.sections[nextIndex].start_timestamp_seconds;
          spVideoRef.current.play().catch(() => {});
        }
      } else {
        const player = (window as any).__foundationPlayer;
        if (player?.play) player.play();
      }
    } else {
      // Last section — just resume video
      resumeVideo();
    }
  }, [quizSectionIndex, data, resumeVideo]);

  // Close quiz drawer (for redo / dismiss) — resume video
  const handleQuizClose = useCallback(() => {
    setQuizOpen(false);
    resumeVideo();
  }, [resumeVideo]);

  // Student wants to redo quiz on a passed section (from section list)
  const handleRedoQuiz = useCallback((sectionIndex: number) => {
    pauseVideo();
    setQuizSectionIndex(sectionIndex);
    setQuizOpen(true);
  }, [pauseVideo]);

  const handleAllQuizSubmitSection = useCallback(async (sectionId: string, answers: Record<string, string>) => {
    const token = await getToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(
      `/api/modules/${moduleId}/items/${itemId}/sections/${sectionId}/quiz`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ answers }),
      }
    );

    if (!res.ok) throw new Error('Failed to submit quiz');
    return res.json().then((r) => r.attempt);
  }, [getToken, moduleId, itemId]);

  const handleAllQuizComplete = useCallback(() => {
    setAllQuizMode(false);
    fetchItem(true);
  }, [fetchItem]);

  const handleNoteSave = useCallback(async (sectionId: string, noteText: string) => {
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
        body: JSON.stringify({ note_text: noteText }),
      }
    );
  }, [getToken, moduleId, itemId]);

  // ─── Loading / Error ────────────────────────────────────────────────

  if (loading || authLoading) {
    return (
      <Box>
        <Skeleton variant="rectangular" height={200} sx={{ borderRadius: { xs: 0, sm: 2 }, mb: 2 }} />
        <Skeleton variant="text" width={200} height={32} sx={{ mb: 1, mx: 2 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 0.5, mx: 2 }} />
        ))}
      </Box>
    );
  }

  if (!data) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary', mb: 2 }}>
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

  const { sections, progress, audio_tracks } = data;
  const currentSection = sections[currentSectionIndex];
  const completedSections = sections.filter((s) => s.quiz_attempt?.passed).length;

  const hasYouTube = !!data.youtube_video_id;
  const hasSharePoint = !!data.sharepoint_video_url && !hasYouTube;
  const hasVideo = hasYouTube || hasSharePoint;
  const hasPdf = !!data.pdf_url;
  const hasAudio = (audio_tracks?.length ?? 0) > 0;
  const showTabs = hasVideo && hasPdf;

  // ─── Render ─────────────────────────────────────────────────────────

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
          onClick={() => router.push(`/student/modules/${moduleId}`)}
          sx={{ mr: 0.5 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ minWidth: 0 }}>
          {data.chapter_number != null && (
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
              Lesson {data.chapter_number}
            </Typography>
          )}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            {data.title}
          </Typography>
        </Box>
      </Box>

      {/* Content tabs (Watch / Read) */}
      {showTabs && (
        <Tabs
          value={contentTab}
          onChange={(_, v) => {
            // Pause SharePoint video when switching away from Watch tab
            if (v !== 'watch' && spVideoRef.current) {
              spVideoRef.current.pause();
            }
            setContentTab(v);
          }}
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
      )}

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
              {hasYouTube ? (
                <VideoPlayer
                  videoId={data.youtube_video_id!}
                  sections={sections as NexusFoundationSection[]}
                  currentSectionIndex={currentSectionIndex}
                  resumePosition={progress?.last_video_position_seconds || undefined}
                  onSectionEnd={handleSectionEnd}
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : hasSharePoint ? (
                spStreamLoading ? (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'grey.400' }}>
                      Loading video...
                    </Typography>
                  </Box>
                ) : spStreamUrl ? (
                  <video
                    ref={spVideoRef}
                    src={spStreamUrl}
                    controls
                    controlsList="nodownload"
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      backgroundColor: '#000',
                    }}
                    title={data.title}
                  />
                ) : (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="body2" sx={{ color: 'grey.400' }}>
                      Video unavailable
                    </Typography>
                  </Box>
                )
              ) : null}
            </Box>
          </Box>
        </Box>
      )}

      {/* PDF Reader (Read tab or only content) */}
      {((contentTab === 'read' && hasPdf) || (!hasVideo && hasPdf)) && (
        <Box
          sx={{
            height: { xs: 'calc(100vh - 200px)', sm: 'calc(100vh - 180px)' },
            borderRadius: { xs: 0, sm: 2 },
            overflow: 'hidden',
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          {pdfStreamLoading ? (
            <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CircularProgress size={32} />
            </Box>
          ) : pdfStreamUrl ? (
            <PDFReader
              pdfUrl={pdfStreamUrl}
              initialPage={progress?.last_pdf_page || 1}
              totalPages={data.pdf_page_count || undefined}
              onRetry={() => {
                setPdfStreamUrl(null);
                setPdfRetryCount((c) => c + 1);
              }}
              onPageChange={(page) => {
                getToken().then((token) => {
                  if (!token) return;
                  fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
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
          ) : (
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: 3 }}>
              <Typography color={pdfStreamError ? 'error' : 'text.secondary'} textAlign="center">
                {pdfStreamError || 'PDF unavailable'}
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  setPdfStreamUrl(null);
                  setPdfStreamError(null);
                  setPdfRetryCount((c) => c + 1);
                }}
              >
                Retry
              </Button>
            </Box>
          )}
        </Box>
      )}

      {/* No content fallback */}
      {!hasVideo && !hasPdf && (
        <Box
          sx={{
            p: 4,
            mx: { xs: 2, sm: 0 },
            mt: 1,
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            bgcolor: alpha(theme.palette.primary.main, 0.03),
          }}
        >
          <Typography variant="body1" color="text.secondary">
            No video or PDF available for this item.
          </Typography>
          <Typography variant="caption" color="text.disabled">
            This item contains text-based content and quizzes.
          </Typography>
        </Box>
      )}

      {/* Content below video */}
      <Box sx={{ px: { xs: 2, sm: 0 }, mt: 2 }}>
        {/* Section progress */}
        {sections.length > 0 && (
          <FoundationProgressBar
            completed={completedSections}
            total={sections.length}
            label="Section Progress"
            size="small"
          />
        )}

        {/* SharePoint-only actions (when no streaming URL available) */}
        {hasSharePoint && !spStreamUrl && (
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            {data.sharepoint_video_url && (
              <Button
                size="small"
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                href={data.sharepoint_video_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{ textTransform: 'none', borderRadius: 2, fontSize: '0.8rem' }}
              >
                Watch in SharePoint
              </Button>
            )}
            {sections.some((s) => s.quiz_questions.length > 0 && !s.quiz_attempt?.passed) && (
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

        {/* Section Timer (SharePoint without streaming URL — when streaming URL exists, timeupdate handles it) */}
        {hasSharePoint && !spStreamUrl && (
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
        {sections.length > 0 && (
          <Box sx={{ mt: 2 }}>
            <SectionList
              sections={sections}
              currentSectionIndex={currentSectionIndex}
              chapterNumber={data.chapter_number || undefined}
              onSectionClick={handleSectionClick}
              onRedoQuiz={handleRedoQuiz}
            />
          </Box>
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
          chapterId={itemId}
          sections={sections}
          getToken={getToken}
          feedbackApiUrl={`/api/modules/${moduleId}/items/${itemId}/feedback`}
          issuesApiUrl={`/api/modules/${moduleId}/items/${itemId}/issues`}
          issueItemKey="module_item_id"
        />
      </Box>

      {/* Quiz Modal */}
      {sections[quizSectionIndex] && (
        <QuizModal
          open={quizOpen}
          sectionTitle={sections[quizSectionIndex].title}
          questions={sections[quizSectionIndex].quiz_questions}
          onClose={handleQuizClose}
          onSubmit={handleQuizSubmit}
          onRetry={handleQuizRetry}
          onContinue={handleQuizContinue}
          dismissable={!!sections[quizSectionIndex].quiz_attempt?.passed}
        />
      )}

      {/* All Sections Quiz Modal (SharePoint without streaming URL) */}
      {hasSharePoint && !spStreamUrl && (
        <AllSectionsQuizModal
          open={allQuizMode}
          sections={sections}
          chapterNumber={data.chapter_number || 0}
          onClose={() => setAllQuizMode(false)}
          onSubmitSection={handleAllQuizSubmitSection}
          onComplete={handleAllQuizComplete}
        />
      )}

      {/* Audio Player */}
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
              fetch(`/api/modules/${moduleId}/items/${itemId}/progress`, {
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
