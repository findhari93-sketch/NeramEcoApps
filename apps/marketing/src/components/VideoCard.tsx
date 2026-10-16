'use client';

import { useState } from 'react';
import { Box, Card, CardContent, Typography, CardActionArea } from '@neram/ui';
import { tokens as t, v } from '@/design-system/tokens';
import { brandColors } from '@/design-system/brand-colors';

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: string;
    publishedAt: string;
  };
}

/** A YouTube video tile. Sits on the dark Home band; reads surface variables so it also works on light. */
export default function VideoCard({ video }: VideoCardProps) {
  const [playing, setPlaying] = useState(false);
  const isMockVideo = video.id.startsWith('mock');

  const handlePlay = () => {
    if (!isMockVideo) {
      setPlaying(true);
    }
  };

  return (
    <Card
      elevation={0}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: v.card,
        color: v.fg,
        backgroundImage: 'none',
        border: `1px solid ${v.line}`,
        borderRadius: `${t.radius}px`,
        boxShadow: 'none',
        transition: 'border-color 150ms ease',
        '&:hover': { borderColor: t.gold500 },
      }}
    >
      {/* Video Thumbnail or Embed */}
      <Box
        sx={{
          position: 'relative',
          paddingTop: '56.25%', // 16:9 aspect ratio
          bgcolor: t.navy700,
          overflow: 'hidden',
        }}
      >
        {playing ? (
          <iframe
            src={`https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 'none',
            }}
          />
        ) : (
          <CardActionArea
            onClick={handlePlay}
            aria-label={`Play video: ${video.title}`}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              '&:focus-visible': { outline: t.focusOutline, outlineOffset: '-2px' },
            }}
          >
            {/* Thumbnail Image */}
            {!isMockVideo && video.thumbnail ? (
              <Box
                component="img"
                src={video.thumbnail}
                alt=""
                loading="lazy"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  bgcolor: t.navy700,
                }}
              />
            )}

            {/* Play Button Overlay */}
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 64,
                height: 44,
                bgcolor: brandColors.youtube,
                opacity: 0.9,
                borderRadius: `${t.radius}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'opacity 150ms ease',
                '.MuiCardActionArea-root:hover &': { opacity: 1 },
              }}
            >
              <Box
                sx={{
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: `16px solid ${t.surface}`,
                  ml: '3px',
                }}
              />
            </Box>
          </CardActionArea>
        )}
      </Box>

      {/* Video Info */}
      <CardContent sx={{ flexGrow: 1, p: 2 }}>
        <Typography
          variant="subtitle1"
          component="h3"
          sx={{
            fontWeight: 600,
            color: v.fg,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
            mb: 1,
          }}
        >
          {video.title}
        </Typography>
        <Typography variant="body2" sx={{ color: v.muted }}>
          {video.viewCount} views
        </Typography>
      </CardContent>
    </Card>
  );
}
