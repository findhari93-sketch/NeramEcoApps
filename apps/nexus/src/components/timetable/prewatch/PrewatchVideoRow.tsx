'use client';

/**
 * One "watch before class" video as a row: thumbnail, title, where it is from
 * and how long, and whatever the screen needs on the right (a student's tick, a
 * teacher's "12 of 30 watched", a remove button, a checkbox).
 *
 * Shared by the Add Class field, the picker, the class panel and the watch
 * page, so the same video looks the same everywhere. Same border and radius as
 * ResourceCard, so a class panel still reads as one panel.
 */

import type { ReactNode } from 'react';
import { Box, Typography, alpha, useTheme } from '@neram/ui';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import SmartDisplayOutlinedIcon from '@mui/icons-material/SmartDisplayOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import { RADIUS } from '../timetable-theme';
import { formatDuration, type PrewatchState } from '@/lib/prewatch';

export interface PrewatchRowVideo {
  title: string;
  /** "Library", or the past class's classroom and date. */
  subtitle?: string | null;
  thumb_url?: string | null;
  duration_seconds?: number | null;
  kind?: string;
}

interface PrewatchVideoRowProps {
  video: PrewatchRowVideo;
  /** Makes the left side one tap target (thumbnail and title together). */
  onOpen?: () => void;
  /** Read by assistive tech for the tap target, e.g. "Play Humans on streets". */
  openLabel?: string;
  /** Right-hand slot. */
  trailing?: ReactNode;
  /** A line under the meta, e.g. the teacher's summary. */
  footer?: ReactNode;
  selected?: boolean;
  dense?: boolean;
}

export default function PrewatchVideoRow({
  video,
  onOpen,
  openLabel,
  trailing,
  footer,
  selected = false,
  dense = false,
}: PrewatchVideoRowProps) {
  const theme = useTheme();
  const length = formatDuration(video.duration_seconds);
  const meta = [video.subtitle, length].filter(Boolean).join(' · ');
  // Narrower on a phone: inside a dialog at 375px the title needs the room.
  const thumbWidth = { xs: 72, sm: dense ? 88 : 104 };

  const main = (
    <>
      <Box
        sx={{
          position: 'relative',
          flexShrink: 0,
          width: thumbWidth,
          aspectRatio: '16 / 9',
          borderRadius: 1,
          overflow: 'hidden',
          bgcolor: alpha(theme.palette.primary.main, 0.08),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {video.thumb_url ? (
          <Box
            component="img"
            src={video.thumb_url}
            alt=""
            loading="lazy"
            sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          // A SharePoint recording has no thumbnail we can show without a
          // Graph call per row; the glyph says "a class video" just as well.
          <SmartDisplayOutlinedIcon sx={{ color: 'primary.main', fontSize: 28 }} aria-hidden />
        )}
        {onOpen && video.thumb_url && (
          <PlayCircleOutlineIcon
            aria-hidden
            sx={{
              position: 'absolute',
              color: 'common.white',
              fontSize: 26,
              filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))',
            }}
          />
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 600,
            lineHeight: 1.35,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {video.title}
        </Typography>
        {meta && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }} noWrap>
            {meta}
          </Typography>
        )}
        {footer}
      </Box>
    </>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.25,
        border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
        bgcolor: selected ? alpha(theme.palette.primary.main, 0.05) : 'background.paper',
        borderRadius: RADIUS.control,
        p: dense ? 1 : 1.25,
        minHeight: 64,
        transition: 'border-color 150ms ease, background-color 150ms ease',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {onOpen ? (
        <Box
          component="button"
          type="button"
          onClick={onOpen}
          aria-label={openLabel}
          sx={{
            all: 'unset',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            flex: 1,
            minWidth: 0,
            minHeight: 48,
            cursor: 'pointer',
            borderRadius: 1,
            '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
          }}
        >
          {main}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flex: 1, minWidth: 0 }}>{main}</Box>
      )}
      {trailing && <Box sx={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>{trailing}</Box>}
    </Box>
  );
}

/** A student's own progress, in words and an icon (never colour alone). */
export function PrewatchStateBadge({ state }: { state: PrewatchState | undefined }) {
  if (state === 'watched') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.dark' }}>
        <CheckCircleIcon sx={{ fontSize: 18 }} aria-hidden />
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'inherit' }}>
          Watched
        </Typography>
      </Box>
    );
  }
  if (state === 'started') {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
        <TimelapseIcon sx={{ fontSize: 18 }} aria-hidden />
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'inherit' }}>
          Started
        </Typography>
      </Box>
    );
  }
  return null;
}
