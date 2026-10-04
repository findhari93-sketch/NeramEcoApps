'use client';

/**
 * Click-to-load YouTube player: a thumbnail and play button until tapped, so a
 * city page costs no YouTube JavaScript on phones until someone wants the video.
 */
import { useState } from 'react';
import Image from 'next/image';
import { Box, Typography } from '@neram/ui';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';

export function ClassVideo({ youtubeId, title }: { youtubeId: string; title: string }) {
  const [playing, setPlaying] = useState(false);
  return (
    <Box>
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 2, overflow: 'hidden', bgcolor: 'grey.900' }}>
        {playing ? (
          <Box
            component="iframe"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        ) : (
          <Box
            component="button"
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            sx={{
              position: 'absolute',
              inset: 0,
              p: 0,
              border: 0,
              cursor: 'pointer',
              bgcolor: 'transparent',
              '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: -3 },
            }}
          >
            <Image src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`} alt="" fill sizes="(max-width: 900px) 100vw, 420px" style={{ objectFit: 'cover' }} />
            <Box
              aria-hidden
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: 'rgba(0,0,0,0.7)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PlayArrowRoundedIcon sx={{ fontSize: 40 }} />
            </Box>
          </Box>
        )}
      </Box>
      <Typography sx={{ mt: 1, fontWeight: 600, fontSize: '0.9375rem' }}>{title}</Typography>
    </Box>
  );
}
