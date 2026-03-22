'use client';

import { Box, Typography, Chip, LinearProgress, Skeleton, alpha, useTheme } from '@neram/ui';
import { useRouter } from 'next/navigation';
import type { LibraryVideo } from '@neram/database/types';

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface VideoCardProps {
  video: LibraryVideo;
  progress?: { completion_pct: number };
  onClick?: () => void;
  /** When true, card takes full width of parent (for grid layouts) */
  fullWidth?: boolean;
}

export function VideoCardSkeleton() {
  return (
    <Box
      sx={{
        width: { xs: 160, sm: 200 },
        minWidth: { xs: 160, sm: 200 },
        flexShrink: 0,
      }}
    >
      <Skeleton
        variant="rectangular"
        sx={{
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: 1.5,
        }}
      />
      <Skeleton variant="text" sx={{ mt: 1, width: '90%' }} />
      <Skeleton variant="text" sx={{ width: '60%' }} />
    </Box>
  );
}

export default function VideoCard({ video, progress, onClick, fullWidth }: VideoCardProps) {
  const theme = useTheme();
  const router = useRouter();

  const title = video.approved_title || video.suggested_title || video.original_title || 'Untitled';
  const thumbnailUrl =
    video.youtube_thumbnail_hq_url ||
    video.youtube_thumbnail_url ||
    `https://img.youtube.com/vi/${video.youtube_video_id}/mqdefault.jpg`;
  const duration = formatDuration(video.duration_seconds);

  const examLabel: Record<string, string> = {
    nata: 'NATA',
    jee_barch: 'JEE B.Arch',
    both: 'NATA/JEE',
    general: 'General',
  };

  const difficultyLabel: Record<string, string> = {
    beginner: 'Beg',
    intermediate: 'Int',
    advanced: 'Adv',
    mixed: 'Mix',
  };

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push(`/student/library/${video.id}`);
    }
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        width: fullWidth ? '100%' : { xs: 160, sm: 200 },
        minWidth: fullWidth ? 0 : { xs: 160, sm: 200 },
        flexShrink: 0,
        cursor: 'pointer',
        '&:hover .video-thumb': {
          transform: 'scale(1.03)',
        },
        '&:active': {
          transform: 'scale(0.98)',
        },
        transition: 'transform 0.15s ease',
      }}
    >
      {/* Thumbnail container */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16/9',
          borderRadius: 1.5,
          overflow: 'hidden',
          bgcolor: alpha(theme.palette.text.primary, 0.08),
        }}
      >
        <Box
          component="img"
          className="video-thumb"
          src={thumbnailUrl}
          alt={title}
          loading="lazy"
          sx={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.2s ease',
          }}
        />

        {/* Duration badge */}
        {duration && (
          <Box
            sx={{
              position: 'absolute',
              bottom: 6,
              right: 6,
              bgcolor: 'rgba(0,0,0,0.8)',
              color: '#fff',
              px: 0.75,
              py: 0.25,
              borderRadius: 0.75,
              fontSize: '0.7rem',
              fontWeight: 600,
              lineHeight: 1.4,
              letterSpacing: '0.02em',
            }}
          >
            {duration}
          </Box>
        )}

        {/* Progress overlay at bottom of thumbnail */}
        {progress && progress.completion_pct > 0 && (
          <LinearProgress
            variant="determinate"
            value={progress.completion_pct}
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 3,
              bgcolor: 'rgba(255,255,255,0.3)',
              '& .MuiLinearProgress-bar': {
                bgcolor: theme.palette.primary.main,
              },
            }}
          />
        )}
      </Box>

      {/* Title */}
      <Typography
        variant="body2"
        sx={{
          mt: 0.75,
          fontWeight: 500,
          lineHeight: 1.3,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          fontSize: { xs: '0.8rem', sm: '0.85rem' },
        }}
      >
        {title}
      </Typography>

      {/* Metadata chips */}
      <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
        {video.exam && (
          <Chip
            label={examLabel[video.exam] || video.exam}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 600,
              bgcolor: alpha(theme.palette.primary.main, 0.1),
              color: theme.palette.primary.main,
            }}
          />
        )}
        {video.difficulty && (
          <Chip
            label={difficultyLabel[video.difficulty] || video.difficulty}
            size="small"
            sx={{
              height: 20,
              fontSize: '0.65rem',
              fontWeight: 500,
              bgcolor: alpha(theme.palette.text.primary, 0.06),
              color: theme.palette.text.secondary,
            }}
          />
        )}
      </Box>

      {/* Progress text */}
      {progress && progress.completion_pct > 0 && (
        <Typography
          variant="caption"
          sx={{
            mt: 0.25,
            color: theme.palette.text.secondary,
            fontSize: '0.65rem',
          }}
        >
          {Math.round(progress.completion_pct)}% watched
        </Typography>
      )}
    </Box>
  );
}
