'use client';

import { useState } from 'react';
import { Box, Card, CardContent, Typography, CardActionArea } from '@neram/ui';

interface VideoCardProps {
  video: {
    id: string;
    title: string;
    thumbnail: string;
    viewCount: string;
    publishedAt: string;
  };
}

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
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
      }}
    >
      {/* Video Thumbnail or Embed */}
      <Box
        sx={{
          position: 'relative',
          paddingTop: '56.25%', // 16:9 aspect ratio
          bgcolor: 'grey.900',
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
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          >
            {/* Thumbnail Image */}
            {!isMockVideo && video.thumbnail ? (
              <Box
                component="img"
                src={video.thumbnail}
                alt={video.title}
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
                  bgcolor: 'grey.800',
                }}
              />
            )}

            {/* Play Button Overlay */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 64,
                height: 44,
                bgcolor: 'rgba(255, 0, 0, 0.85)',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                '&:hover': {
                  bgcolor: '#FF0000',
                  transform: 'translate(-50%, -50%) scale(1.1)',
                },
              }}
            >
              <Box
                sx={{
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '16px solid white',
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
        <Typography variant="body2" color="text.secondary">
          {video.viewCount} views
        </Typography>
      </CardContent>
    </Card>
  );
}
