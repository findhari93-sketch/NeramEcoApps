'use client';

import { useState, useEffect, useCallback } from 'react';
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
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ShareIcon from '@mui/icons-material/Share';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
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

  // Fetch related videos once we have the video
  useEffect(() => {
    if (!video?.category) {
      setRelatedLoading(false);
      return;
    }
    let cancelled = false;

    async function fetchRelated() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch(
          `/api/library/videos?category=${encodeURIComponent(video!.category!)}&limit=8`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!res.ok) throw new Error('Failed');
        const data = await res.json();
        if (!cancelled) {
          const filtered = (data.videos || []).filter(
            (v: LibraryVideo) => v.id !== video!.id
          );
          setRelatedVideos(filtered.slice(0, 6));
        }
      } catch {
        // Silently fail for related
      } finally {
        if (!cancelled) setRelatedLoading(false);
      }
    }

    fetchRelated();
    return () => { cancelled = true; };
  }, [video?.id, video?.category, getToken]);

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
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.youtube_video_id}?rel=0&modestbranding=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
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

            {/* Topic chips */}
            {video.topics && video.topics.length > 0 && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
                {video.topics.map((topic) => (
                  <Chip
                    key={topic}
                    label={topic}
                    size="small"
                    sx={{
                      height: 24,
                      fontSize: '0.7rem',
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
