'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  Skeleton,
  Paper,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ShareIcon from '@mui/icons-material/Share';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { useWatchTracker } from '@/hooks/useWatchTracker';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import LibraryYouTubePlayer from '@/components/library/LibraryYouTubePlayer';
import { parseChaptersFromDescription, formatChapterTime } from '@/lib/youtube-metadata';
import type { LibraryVideo } from '@neram/database/types';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

const EXAM_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_barch: 'JEE B.Arch',
  both: 'NATA/JEE',
  general: 'General',
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  mixed: 'Mixed',
};

const LANGUAGE_LABELS: Record<string, string> = {
  ta: 'Tamil',
  en: 'English',
  ta_en: 'Tamil + English',
};

const CATEGORY_LABELS: Record<string, string> = {
  drawing: 'Drawing',
  aptitude: 'Aptitude',
  mathematics: 'Mathematics',
  general_knowledge: 'General Knowledge',
  exam_preparation: 'Exam Preparation',
  orientation: 'Orientation',
};

export default function VideoPlayerPage() {
  const theme = useTheme();
  const router = useRouter();
  const { videoId } = useParams<{ videoId: string }>();
  const { getToken } = useNexusAuthContext();

  const [video, setVideo] = useState<LibraryVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [relatedVideos, setRelatedVideos] = useState<LibraryVideo[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(true);

  // Filled by LibraryYouTubePlayer once the IFrame API is ready. Chapters seek
  // through it, and the watch tracker attaches its listeners to it.
  const playerRef = useRef<any>(null);

  // The bare iframe this page used to render could not be controlled, so this
  // hook existed but was never attached to anything. That is why Continue
  // Watching, view counts and the teacher engagement dashboard were all empty.
  useWatchTracker({
    videoId: video?.id || '',
    videoDurationSeconds: video?.duration_seconds || 0,
    playerRef,
    enabled: Boolean(video?.id),
  });

  // Fetch video
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    async function fetchVideo() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(`/api/library/videos/${videoId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          if (res.status === 404) throw new Error('Video not found');
          throw new Error('Failed to load video');
        }

        const { data } = await res.json();
        if (!cancelled) setVideo(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load video');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchVideo();
    return () => { cancelled = true; };
  }, [videoId, getToken]);

  /**
   * Related videos.
   *
   * Searching this video's own topics beats listing its category: "Perspective"
   * finds the other perspective classes, where "drawing" returns whatever
   * happens to be newest across a category of 137 videos. Falls back to the
   * category when the video carries no topics.
   */
  const relatedQuery = video?.topics?.[0] || '';
  const relatedCategory = video?.category || '';
  const currentVideoId = video?.id || '';

  useEffect(() => {
    if (!currentVideoId || (!relatedQuery && !relatedCategory)) {
      setRelatedLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams({ limit: '8' });
        if (relatedQuery) params.set('q', relatedQuery);
        else params.set('category', relatedCategory);

        const res = await fetch(`/api/library/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (cancelled) return;
        setRelatedVideos(
          (data.data || [])
            .filter((v: LibraryVideo) => v.id !== currentVideoId)
            .slice(0, 6),
        );
      } catch {
        // Related videos are a nicety; a failure here must not break playback.
      } finally {
        if (!cancelled) setRelatedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentVideoId, relatedQuery, relatedCategory, getToken]);

  const handleBookmark = useCallback(async () => {
    if (!video || bookmarkLoading) return;
    setBookmarkLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/library/bookmarks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ video_id: video.id }),
      });

      if (res.ok) {
        setBookmarked(true);
      }
    } catch (err) {
      console.error('Bookmark error:', err);
    } finally {
      setBookmarkLoading(false);
    }
  }, [video, getToken, bookmarkLoading]);

  const title = video
    ? video.approved_title || video.suggested_title || video.original_title || 'Untitled'
    : '';
  const description = video
    ? video.approved_description || video.suggested_description || video.original_description || ''
    : '';

  // Chapters come from the description, which is the only place YouTube keeps
  // them. Parsing rather than storing a copy means the several hundred videos
  // already on the channel get chapters too, with nothing to backfill.
  const chapters = useMemo(() => parseChaptersFromDescription(description), [description]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player?.seekTo) return;
    player.seekTo(seconds, true);
    player.playVideo?.();
  }, []);

  if (error) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="h6" color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
        <Button variant="outlined" onClick={() => router.back()}>
          Go Back
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 10 }}>
      {/* Back nav */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: { xs: 1, sm: 3 },
          py: 1,
          gap: 1,
        }}
      >
        <IconButton
          onClick={() => router.back()}
          sx={{ width: 44, height: 44 }}
        >
          <ArrowBackIcon />
        </IconButton>
        {!loading && (
          <Typography
            variant="body2"
            sx={{
              fontWeight: 500,
              color: theme.palette.text.secondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
            }}
          >
            {title}
          </Typography>
        )}
      </Box>

      {/* YouTube Player */}
      <Box
        sx={{
          width: '100%',
          aspectRatio: '16/9',
          bgcolor: '#000',
          position: 'relative',
        }}
      >
        {loading ? (
          <Skeleton variant="rectangular" sx={{ width: '100%', height: '100%' }} />
        ) : video ? (
          <LibraryYouTubePlayer youtubeId={video.youtube_video_id} playerRef={playerRef} />
        ) : null}
      </Box>

      {/* Video Info */}
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: 2 }}>
        {loading ? (
          <>
            <Skeleton variant="text" sx={{ width: '80%', height: 28 }} />
            <Skeleton variant="text" sx={{ width: '50%', height: 20, mt: 0.5 }} />
          </>
        ) : video ? (
          <>
            {/* Title */}
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.1rem', sm: '1.3rem' },
                lineHeight: 1.3,
              }}
            >
              {title}
            </Typography>

            {/* Action buttons row */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                mt: 1.5,
                mb: 1.5,
              }}
            >
              <Button
                variant={bookmarked ? 'contained' : 'outlined'}
                size="small"
                startIcon={bookmarked ? <BookmarkIcon /> : <BookmarkBorderIcon />}
                onClick={handleBookmark}
                disabled={bookmarkLoading || bookmarked}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderRadius: 2,
                  minHeight: 40,
                }}
              >
                {bookmarked ? 'Bookmarked' : 'Bookmark'}
              </Button>

              <IconButton
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: title,
                      url: window.location.href,
                    });
                  }
                }}
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: alpha(theme.palette.text.primary, 0.05),
                }}
              >
                <ShareIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>

            {/* Metadata chips */}
            <Box
              sx={{
                display: 'flex',
                gap: 0.75,
                flexWrap: 'wrap',
                mb: 2,
              }}
            >
              {video.exam && (
                <Chip
                  label={EXAM_LABELS[video.exam] || video.exam}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                />
              )}
              {video.category && (
                <Chip
                  label={CATEGORY_LABELS[video.category] || video.category}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                />
              )}
              {video.difficulty && (
                <Chip
                  label={DIFFICULTY_LABELS[video.difficulty] || video.difficulty}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                />
              )}
              {video.language && (
                <Chip
                  label={LANGUAGE_LABELS[video.language] || video.language}
                  size="small"
                  variant="outlined"
                  sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                />
              )}
            </Box>

            {/* Stats row */}
            <Box
              sx={{
                display: 'flex',
                gap: 2.5,
                flexWrap: 'wrap',
                mb: 2,
                color: theme.palette.text.secondary,
              }}
            >
              {video.published_at && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CalendarTodayOutlinedIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    {formatDate(video.published_at)}
                  </Typography>
                </Box>
              )}
              {video.duration_seconds && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ScheduleOutlinedIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    {formatDuration(video.duration_seconds)}
                  </Typography>
                </Box>
              )}
              {video.view_count > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />
                  <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                    {video.view_count.toLocaleString()} views
                  </Typography>
                </Box>
              )}
            </Box>

            {/* Chapters. Tapping one seeks the player, which is the whole
                reason this page runs the IFrame API instead of a bare embed. */}
            {chapters.length > 0 && (
              <Paper variant="outlined" sx={{ borderRadius: 2, mb: 2, overflow: 'hidden' }}>
                <Typography
                  variant="subtitle2"
                  sx={{ fontWeight: 700, px: 2, pt: 1.5, pb: 1 }}
                >
                  In this class
                </Typography>
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                  {chapters.map((c) => (
                    <Box
                      component="li"
                      key={`${c.t}-${c.label}`}
                      onClick={() => seekTo(c.t)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') seekTo(c.t);
                      }}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.25,
                        px: 2,
                        minHeight: 48,
                        cursor: 'pointer',
                        borderTop: `1px solid ${theme.palette.divider}`,
                        '&:hover': { bgcolor: alpha(theme.palette.primary.main, 0.05) },
                        '&:active': { bgcolor: alpha(theme.palette.primary.main, 0.1) },
                      }}
                    >
                      <PlayArrowIcon sx={{ fontSize: 18, color: theme.palette.primary.main }} />
                      <Typography
                        variant="caption"
                        sx={{
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 700,
                          color: theme.palette.primary.main,
                          minWidth: 46,
                        }}
                      >
                        {formatChapterTime(c.t)}
                      </Typography>
                      <Typography variant="body2" sx={{ py: 1 }}>
                        {c.label}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              </Paper>
            )}

            {/* Topic chips. Tapping one searches for it, so a student who likes
                this class can reach every other class on the same topic. */}
            {video.topics && video.topics.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
                {video.topics.map((topic) => (
                  <Chip
                    key={topic}
                    label={topic}
                    size="small"
                    onClick={() =>
                      router.push(`/student/library/search?q=${encodeURIComponent(topic)}`)}
                    sx={{
                      height: 32,
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      bgcolor: alpha(theme.palette.primary.main, 0.06),
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Description */}
            {description && (
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  bgcolor: alpha(theme.palette.background.default, 0.5),
                }}
              >
                <Typography
                  variant="body2"
                  sx={{
                    whiteSpace: 'pre-wrap',
                    lineHeight: 1.6,
                    color: theme.palette.text.secondary,
                    fontSize: '0.85rem',
                  }}
                >
                  {description}
                </Typography>
              </Paper>
            )}
          </>
        ) : null}
      </Box>

      {/* Related Videos */}
      {(relatedLoading || relatedVideos.length > 0) && (
        <Box sx={{ mt: 4 }}>
          <Typography
            variant="subtitle1"
            sx={{
              fontWeight: 700,
              mb: 1.5,
              px: { xs: 2, sm: 3 },
              fontSize: { xs: '1rem', sm: '1.1rem' },
            }}
          >
            Related Videos
          </Typography>

          <Box
            sx={{
              display: 'flex',
              gap: 2,
              overflowX: 'auto',
              px: { xs: 2, sm: 3 },
              pb: 1,
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
            }}
          >
            {relatedLoading
              ? Array.from({ length: 4 }).map((_, i) => <VideoCardSkeleton key={i} />)
              : relatedVideos.map((v) => <VideoCard key={v.id} video={v} />)}
          </Box>
        </Box>
      )}
    </Box>
  );
}
