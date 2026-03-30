'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  IconButton,
  Skeleton,
  Tabs,
  Tab,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoPlayer from '@/components/foundation/VideoPlayer';
import SharePointPlayer from '@/components/foundation/SharePointPlayer';
import SectionList from '@/components/foundation/SectionList';
import QuizModal from '@/components/foundation/QuizModal';
import QuizReadyChip from '@/components/foundation/QuizReadyChip';
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
type SidebarTab = 'sections' | 'notes' | 'transcript';

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
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [data, setData] = useState<ChapterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizSectionIndex, setQuizSectionIndex] = useState(0);
  const [quizPendingSectionIndex, setQuizPendingSectionIndex] = useState<number | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>('watch');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('sections');
  const [msToken, setMsToken] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [chapterComplete, setChapterComplete] = useState(false);

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedPosRef = useRef(0);
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Watch-time tracking refs (no re-renders)
  // Per-section session IDs so each section gets its own DB row (not overwritten by other sections)
  const sectionSessionIds = useRef<Map<string, string>>(new Map());
  const getSessionIdForSection = (sectionId: string): string => {
    let sid = sectionSessionIds.current.get(sectionId);
    if (!sid) {
      sid = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}-${sectionId}`;
      sectionSessionIds.current.set(sectionId, sid);
    }
    return sid;
  };
  const watchTracker = useRef<Map<string, {
    sectionId: string;
    watchedSeconds: number;
    sectionDuration: number;
    playCount: number;
    pauseCount: number;
    seekCount: number;
    lastTickTime: number;
  }>>(new Map());

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
          if (chapterData.progress?.last_section_id) {
            const idx = chapterData.sections.findIndex(
              (s: any) => s.id === chapterData.progress.last_section_id
            );
            if (idx >= 0) setCurrentSectionIndex(idx);
          } else {
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

  // Build watch_sessions payload from all tracked sections
  const buildWatchSessions = useCallback(() => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const deviceType = width < 600 ? 'mobile' : width < 900 ? 'tablet' : 'desktop';
    const sessions: any[] = [];
    watchTracker.current.forEach((tracker, sectionId) => {
      if (tracker.watchedSeconds > 0) {
        const completionPct = tracker.sectionDuration > 0
          ? Math.min(100, (tracker.watchedSeconds / tracker.sectionDuration) * 100)
          : 0;
        sessions.push({
          id: getSessionIdForSection(sectionId),
          section_id: sectionId,
          watched_seconds: Math.round(tracker.watchedSeconds),
          section_duration_seconds: Math.round(tracker.sectionDuration),
          completion_pct: Math.round(completionPct * 100) / 100,
          play_count: tracker.playCount,
          pause_count: tracker.pauseCount,
          seek_count: tracker.seekCount,
          device_type: deviceType,
        });
      }
    });
    return sessions;
  }, []);

  // Auto-save video position every 30 seconds (includes watch session data)
  // force=true bypasses the 10-second dedup guard (used on unmount)
  const saveProgress = useCallback(async (seconds: number, force = false) => {
    if (!force && Math.abs(seconds - lastSavedPosRef.current) < 10) return;
    lastSavedPosRef.current = seconds;

    try {
      const token = await getToken();
      if (!token) return;

      const section = data?.sections[currentSectionIndex];
      const watchSessions = buildWatchSessions();

      await fetch(`/api/foundation/chapters/${chapterId}/progress`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          last_video_position_seconds: seconds,
          last_section_id: section?.id,
          watch_sessions: watchSessions.length > 0 ? watchSessions : undefined,
        }),
      });
    } catch {
      // Silent fail for position saves
    }
  }, [chapterId, getToken, currentSectionIndex, data, buildWatchSessions]);

  const handleTimeUpdate = useCallback((seconds: number) => {
    setCurrentVideoTime(seconds);

    // Accumulate watch-time metrics per section
    const sections = data?.sections;
    if (sections?.length) {
      // Find which section this time falls in
      const sectionIdx = sections.findIndex(
        (s) => seconds >= s.start_timestamp_seconds && seconds < s.end_timestamp_seconds
      );
      const section = sectionIdx >= 0 ? sections[sectionIdx] : sections[currentSectionIndex];
      if (section) {
        let tracker = watchTracker.current.get(section.id);
        if (!tracker) {
          tracker = {
            sectionId: section.id,
            watchedSeconds: 0,
            sectionDuration: section.end_timestamp_seconds - section.start_timestamp_seconds,
            playCount: 1,
            pauseCount: 0,
            seekCount: 0,
            lastTickTime: seconds,
          };
          watchTracker.current.set(section.id, tracker);
        } else {
          const delta = seconds - tracker.lastTickTime;
          if (delta > 0 && delta < 2) {
            // Normal playback — accumulate
            tracker.watchedSeconds += delta;
          } else if (Math.abs(delta) >= 2) {
            // Seek detected
            tracker.seekCount += 1;
          }
          tracker.lastTickTime = seconds;
        }
      }
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveProgress(seconds), 30000);
  }, [saveProgress, data, currentSectionIndex]);

  // Keep a ref to the latest token for unmount (can't do async in cleanup)
  const msTokenRef = useRef(msToken);
  useEffect(() => { msTokenRef.current = msToken; }, [msToken]);

  // Save position on unmount using sendBeacon (browser won't cancel it during navigation)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const player = (window as any).__foundationPlayer;
      const pos = player?.getCurrentTime?.() ?? 0;
      if (pos <= 0) return;

      const watchSessions = buildWatchSessions();
      const section = data?.sections[currentSectionIndex];
      const token = msTokenRef.current;
      if (!token) return;

      const payload = JSON.stringify({
        last_video_position_seconds: pos,
        last_section_id: section?.id,
        watch_sessions: watchSessions.length > 0 ? watchSessions : undefined,
      });

      // sendBeacon survives page unload; fetch does not
      if (typeof navigator.sendBeacon === 'function') {
        const blob = new Blob([payload], { type: 'application/json' });
        // sendBeacon can't set custom headers, so pass token as query param
        navigator.sendBeacon(
          `/api/foundation/chapters/${chapterId}/progress?token=${encodeURIComponent(token)}`,
          blob
        );
      } else {
        // Fallback: fire-and-forget fetch with keepalive
        fetch(`/api/foundation/chapters/${chapterId}/progress`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    };
  }, [buildWatchSessions, chapterId, data, currentSectionIndex]);

  // Ensure video stays paused while quiz is open (handles YouTube buffering race)
  useEffect(() => {
    const player = (window as any).__foundationPlayer;
    if (!player) return;

    if (quizOpen) {
      player.quizPaused = true;
      player.pause();
      // Delayed pause catches YouTube BUFFERING→PLAYING transition
      const timer = setTimeout(() => player.pause(), 300);
      return () => clearTimeout(timer);
    } else {
      player.quizPaused = false;
    }
  }, [quizOpen]);

  const handleSectionEnd = useCallback((sectionIndex: number) => {
    // Non-blocking: show quiz notification chip instead of immediately opening modal
    // Video keeps playing — student opens quiz when ready
    const section = data?.sections[sectionIndex];
    if (section) {
      const tracker = watchTracker.current.get(section.id);
      if (tracker) tracker.pauseCount += 1;
    }
    setQuizPendingSectionIndex(sectionIndex);
  }, [data]);

  const handleOpenPendingQuiz = useCallback((index: number) => {
    // Student explicitly chose to take the quiz — now pause video and open drawer
    const player = (window as any).__foundationPlayer;
    if (player?.pause) player.pause();
    setQuizSectionIndex(index);
    setQuizOpen(true);
    setQuizPendingSectionIndex(null);
  }, []);

  const handleSectionClick = useCallback((index: number) => {
    setCurrentSectionIndex(index);
    // Switch to watch tab if on read tab
    setContentTab('watch');
    const section = data?.sections[index];
    if (section) {
      const player = (window as any).__foundationPlayer;
      if (player?.seekTo) {
        // Reset quiz trigger so it can fire again when rewatching this section
        player.resetSectionTrigger?.(index);
        player.seekTo(section.start_timestamp_seconds);
        player.play();
      }
    }
  }, [data]);

  const handleRedoQuiz = useCallback((index: number) => {
    const section = data?.sections[index];
    if (!section) return;
    setCurrentSectionIndex(index);
    setContentTab('watch');
    // Seek to section start and play — quiz will trigger at section end
    const player = (window as any).__foundationPlayer;
    if (player) {
      player.resetSectionTrigger?.(index);
      player.setRewatchMode?.(true, section.end_timestamp_seconds);
      player.seekTo(section.start_timestamp_seconds);
      player.play();
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

  const handleQuizRetryWithRewatch = useCallback(() => {
    setQuizOpen(false);
    const section = data?.sections[quizSectionIndex];
    if (section) {
      const player = (window as any).__foundationPlayer;
      if (player) {
        player.resetSectionTrigger?.(quizSectionIndex);
        player.setRewatchMode?.(true, section.end_timestamp_seconds);
        player.seekTo(section.start_timestamp_seconds);
        player.play();
      }
    }
  }, [data, quizSectionIndex]);

  // In-place retry: stay in the quiz drawer, just reset answers (no rewatch)
  const handleQuizRetryInPlace = useCallback(() => {
    // QuizModal handles answer reset internally via its onRetryQuiz prop
    // Nothing to do here — the drawer stays open
  }, []);

  const handleQuizContinue = useCallback(() => {
    setQuizOpen(false);
    const nextIndex = quizSectionIndex + 1;
    if (nextIndex < (data?.sections.length || 0)) {
      setCurrentSectionIndex(nextIndex);
      // Track play count for the new section
      const nextSection = data?.sections[nextIndex];
      if (nextSection) {
        const tracker = watchTracker.current.get(nextSection.id);
        if (tracker) tracker.playCount += 1;
      }
      const player = (window as any).__foundationPlayer;
      if (player?.play) player.play();
    } else {
      // All sections completed — show celebration and navigate to chapter list
      setChapterComplete(true);
      setTimeout(() => {
        router.push(backUrl);
      }, 2500);
    }
  }, [quizSectionIndex, data, router, backUrl]);

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

  // --- Loading / error states ---

  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' } }}>
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="rectangular" sx={{ width: '100%', pt: '56.25%', borderRadius: { xs: 0, sm: 2 } }} />
          <Skeleton variant="text" width={200} height={32} sx={{ mt: 2 }} />
        </Box>
        <Box sx={{ width: { xs: '100%', md: 340 }, flexShrink: 0 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={56} sx={{ borderRadius: 2, mb: 0.5 }} />
          ))}
        </Box>
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
  const showContentTabs = hasVideo && hasPdf;
  const hasTranscript = chapter.video_source !== 'sharepoint';

  // --- Sidebar content (shared between desktop sidebar and mobile tabs) ---

  const sidebarSections = (
    <SectionList
      sections={sections}
      currentSectionIndex={currentSectionIndex}
      chapterNumber={chapter.chapter_number}
      onSectionClick={handleSectionClick}
      onRedoQuiz={handleRedoQuiz}
      pendingQuizSectionIndex={quizPendingSectionIndex}
      onTakeQuiz={handleOpenPendingQuiz}
    />
  );

  const sidebarNotes = currentSection ? (
    <NoteEditor
      sectionId={currentSection.id}
      sectionTitle={currentSection.title}
      initialNote={currentSection.note?.note_text}
      onSave={handleNoteSave}
    />
  ) : (
    <Typography variant="body2" sx={{ color: 'text.secondary', p: 2 }}>
      Select a section to add notes.
    </Typography>
  );

  const sidebarTranscript = hasTranscript ? (
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
  ) : null;

  // --- Video player rendering ---

  const videoPlayer = (
    <Box
      sx={{
        position: 'relative',
        width: '100%',
        pt: '56.25%', // 16:9
        bgcolor: '#000',
        borderRadius: { xs: 0, sm: 2 },
        overflow: 'hidden',
      }}
    >
      <Box sx={{ position: 'absolute', inset: 0 }}>
        {chapter.video_source === 'sharepoint' && chapter.sharepoint_video_url ? (
          <SharePointPlayer
            videoUrl={chapter.sharepoint_video_url}
            chapterId={chapterId}
            token={msToken}
            sections={sections}
            onSectionEnd={handleSectionEnd}
            onTimeUpdate={handleTimeUpdate}
          />
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
      {/* Non-blocking quiz notification over video */}
      <QuizReadyChip
        visible={quizPendingSectionIndex !== null}
        sectionTitle={quizPendingSectionIndex !== null ? sections[quizPendingSectionIndex]?.title ?? '' : ''}
        onOpen={() => quizPendingSectionIndex !== null && handleOpenPendingQuiz(quizPendingSectionIndex)}
        onDismiss={() => setQuizPendingSectionIndex(null)}
      />
    </Box>
  );

  // --- Main render ---

  return (
    <Box sx={{ mx: { xs: -2, sm: 0 } }}>
      {/* Back button + title row */}
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
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            Chapter {chapter.chapter_number} of 10
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }} noWrap>
            {chapter.title}
          </Typography>
        </Box>
        {/* Overflow menu for secondary actions */}
        {chapter.video_source === 'sharepoint' && chapter.sharepoint_video_url && (
          <>
            <IconButton
              size="small"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              sx={{ color: 'text.secondary' }}
            >
              <MoreVertIcon />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={!!menuAnchor}
              onClose={() => setMenuAnchor(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
              <MenuItem
                component="a"
                href={chapter.sharepoint_video_url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuAnchor(null)}
              >
                <ListItemIcon><OpenInNewIcon fontSize="small" /></ListItemIcon>
                <ListItemText>Watch in SharePoint</ListItemText>
              </MenuItem>
            </Menu>
          </>
        )}
      </Box>

      {/* Content tabs (Watch / Read) — only if both video and PDF exist */}
      {showContentTabs && (
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
      )}
      {!hasVideo && hasPdf && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, px: { xs: 2, sm: 0 } }}>
          <MenuBookOutlinedIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Reading Material</Typography>
        </Box>
      )}

      {/* ===== YouTube-style grid layout ===== */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'grid' },
          flexDirection: 'column',
          gridTemplateColumns: { md: '1fr 340px' },
          gap: { xs: 0, md: 2 },
        }}
      >
        {/* LEFT COLUMN: Video/PDF + metadata */}
        <Box sx={{ minWidth: 0 }}>
          {/* Video Player */}
          {((contentTab === 'watch' && hasVideo) || (!hasPdf && hasVideo)) && videoPlayer}

          {/* PDF Reader */}
          {((contentTab === 'read' && hasPdf) || (!hasVideo && hasPdf)) && (
            <Box
              sx={{
                height: { xs: 'calc(100dvh - 244px)', md: 'calc(100vh - 220px)' },
                borderRadius: { xs: 0, sm: 2 },
                overflow: 'hidden',
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <PDFReader
                pdfUrl={`/api/foundation/chapters/${chapterId}/pdf-stream${msToken ? `?token=${encodeURIComponent(msToken)}` : ''}`}
                initialPage={progress?.last_pdf_page || 1}
              />
            </Box>
          )}

          {/* Below-video info: progress + feedback */}
          <Box sx={{ px: { xs: 2, sm: 0 }, mt: 1.5 }}>
            <FoundationProgressBar
              completed={completedSections}
              total={sections.length}
              label="Section Progress"
              size="small"
            />

            <Box sx={{ mt: 1.5 }}>
              <ChapterFeedback
                chapterId={chapterId}
                sections={sections}
                getToken={getToken}
              />
            </Box>
          </Box>

          {/* Mobile: Sections / Notes / Transcript tabs */}
          {!isDesktop && (
            <Box sx={{ px: { xs: 2, sm: 0 }, mt: 2 }}>
              <Tabs
                value={sidebarTab}
                onChange={(_, v) => setSidebarTab(v)}
                variant="fullWidth"
                sx={{
                  mb: 1.5,
                  bgcolor: alpha(theme.palette.action.hover, 0.04),
                  borderRadius: 2,
                  minHeight: 40,
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    minHeight: 40,
                    py: 0,
                  },
                  '& .MuiTabs-indicator': {
                    height: 3,
                    borderRadius: 1.5,
                  },
                }}
              >
                <Tab value="sections" label={`Sections (${sections.length})`} />
                <Tab value="notes" label="Notes" />
                {hasTranscript && <Tab value="transcript" label="Transcript" />}
              </Tabs>

              {sidebarTab === 'sections' && sidebarSections}
              {sidebarTab === 'notes' && sidebarNotes}
              {sidebarTab === 'transcript' && sidebarTranscript}
            </Box>
          )}
        </Box>

        {/* RIGHT COLUMN: Sidebar (desktop only) */}
        {isDesktop && (
          <Box
            sx={{
              position: 'sticky',
              top: 16,
              maxHeight: 'calc(100vh - 32px)',
              overflowY: 'auto',
              borderRadius: 2,
              border: `1px solid ${theme.palette.divider}`,
              bgcolor: 'background.paper',
              // Scrollbar styling
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': {
                borderRadius: 3,
                bgcolor: alpha(theme.palette.text.primary, 0.15),
              },
            }}
          >
            {/* Sidebar tabs */}
            <Box
              sx={{
                position: 'sticky',
                top: 0,
                zIndex: 1,
                bgcolor: 'background.paper',
                borderBottom: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Tabs
                value={sidebarTab}
                onChange={(_, v) => setSidebarTab(v)}
                variant="fullWidth"
                sx={{
                  minHeight: 42,
                  '& .MuiTab-root': {
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    minHeight: 42,
                    py: 0,
                  },
                }}
              >
                <Tab value="sections" label={`Sections (${sections.length})`} />
                <Tab value="notes" label="Notes" />
                {hasTranscript && <Tab value="transcript" label="Transcript" />}
              </Tabs>
            </Box>

            <Box sx={{ p: 1.5 }}>
              {sidebarTab === 'sections' && sidebarSections}
              {sidebarTab === 'notes' && sidebarNotes}
              {sidebarTab === 'transcript' && sidebarTranscript}
            </Box>
          </Box>
        )}
      </Box>

      {/* Chapter completion celebration */}
      <Snackbar
        open={chapterComplete}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CheckCircleOutlineIcon sx={{ color: '#4caf50' }} />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#fff' }}>
                Chapter Complete!
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                Great work! Moving to chapter list...
              </Typography>
            </Box>
          </Box>
        }
      />

      {/* Quiz Modal */}
      {sections[quizSectionIndex] && (
        <QuizModal
          open={quizOpen}
          sectionTitle={sections[quizSectionIndex].title}
          questions={sections[quizSectionIndex].quiz_questions}
          dismissable
          onClose={() => {
            setQuizOpen(false);
            // Re-show the chip so student can reopen the quiz later
            setQuizPendingSectionIndex(quizSectionIndex);
            const player = (window as any).__foundationPlayer;
            if (player?.play) player.play();
          }}
          onSubmit={handleQuizSubmit}
          onRetry={handleQuizRetryWithRewatch}
          onRetryQuiz={handleQuizRetryInPlace}
          onContinue={handleQuizContinue}
        />
      )}

      {/* Audio Player — persistent bar at bottom */}
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
