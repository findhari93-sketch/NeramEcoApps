'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, useTheme, useMediaQuery } from '@neram/ui';

interface ImageCompareToggleProps {
  originalImageUrl: string;
  correctedImageUrl: string | null;
}

export default function ImageCompareToggle({
  originalImageUrl,
  correctedImageUrl,
}: ImageCompareToggleProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  if (!correctedImageUrl) {
    return (
      <Box sx={{ position: 'relative', bgcolor: '#f5f5f5' }}>
        <Box
          component="img"
          src={originalImageUrl}
          alt="Student drawing"
          sx={{
            width: '100%',
            height: { xs: 300, md: 250 },
            objectFit: 'contain',
            display: 'block',
          }}
        />
      </Box>
    );
  }

  if (isMobile) {
    return (
      <MobileScrollSnap
        originalImageUrl={originalImageUrl}
        correctedImageUrl={correctedImageUrl}
      />
    );
  }

  return (
    <DesktopSideBySide
      originalImageUrl={originalImageUrl}
      correctedImageUrl={correctedImageUrl}
    />
  );
}

function DesktopSideBySide({
  originalImageUrl,
  correctedImageUrl,
}: {
  originalImageUrl: string;
  correctedImageUrl: string;
}) {
  return (
    <Box sx={{ display: 'flex', gap: '2px' }}>
      <Box sx={{ flex: 1, position: 'relative', bgcolor: '#f5f5f5' }}>
        <Box
          component="img"
          src={originalImageUrl}
          alt="Student drawing"
          sx={{ width: '100%', height: 250, objectFit: 'contain', display: 'block' }}
        />
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            px: 1,
            py: 0.25,
            bgcolor: 'rgba(0,0,0,0.6)',
            color: '#fff',
            borderRadius: 1,
            fontSize: '0.65rem',
          }}
        >
          Student
        </Typography>
      </Box>
      <Box sx={{ flex: 1, position: 'relative', bgcolor: '#f5f5f5' }}>
        <Box
          component="img"
          src={correctedImageUrl}
          alt="Teacher reference"
          sx={{ width: '100%', height: 250, objectFit: 'contain', display: 'block' }}
        />
        <Typography
          variant="caption"
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            px: 1,
            py: 0.25,
            bgcolor: 'rgba(124,58,237,0.8)',
            color: '#fff',
            borderRadius: 1,
            fontSize: '0.65rem',
          }}
        >
          Teacher Ref
        </Typography>
      </Box>
    </Box>
  );
}

function MobileScrollSnap({
  originalImageUrl,
  correctedImageUrl,
}: {
  originalImageUrl: string;
  correctedImageUrl: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const refPanelRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const refPanel = refPanelRef.current;
    if (!refPanel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setActiveIndex(entry.isIntersecting ? 1 : 0);
        }
      },
      { threshold: 0.5, root: scrollRef.current },
    );

    observer.observe(refPanel);
    return () => observer.disconnect();
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const panelWidth = container.offsetWidth;
    container.scrollTo({ left: index * panelWidth, behavior: 'smooth' });
  }, []);

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Pill toggle */}
      <Box
        sx={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2,
          display: 'flex',
          bgcolor: 'rgba(0,0,0,0.5)',
          borderRadius: 4,
          p: '2px',
        }}
      >
        <Box
          onClick={() => scrollToIndex(0)}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 3,
            fontSize: '0.7rem',
            fontWeight: 500,
            cursor: 'pointer',
            bgcolor: activeIndex === 0 ? '#fff' : 'transparent',
            color: activeIndex === 0 ? '#111' : '#fff',
            transition: 'all 0.2s',
          }}
        >
          Student
        </Box>
        <Box
          onClick={() => scrollToIndex(1)}
          sx={{
            px: 1.5,
            py: 0.5,
            borderRadius: 3,
            fontSize: '0.7rem',
            fontWeight: 500,
            cursor: 'pointer',
            bgcolor: activeIndex === 1 ? '#fff' : 'transparent',
            color: activeIndex === 1 ? '#111' : '#fff',
            transition: 'all 0.2s',
          }}
        >
          Reference
        </Box>
      </Box>

      {/* Scroll-snap container */}
      <Box
        ref={scrollRef}
        sx={{
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <Box
          sx={{
            minWidth: '100%',
            scrollSnapAlign: 'start',
            bgcolor: '#f5f5f5',
            position: 'relative',
          }}
        >
          <Box
            component="img"
            src={originalImageUrl}
            alt="Student drawing"
            sx={{ width: '100%', height: 300, objectFit: 'contain', display: 'block' }}
          />
        </Box>
        <Box
          ref={refPanelRef}
          sx={{
            minWidth: '100%',
            scrollSnapAlign: 'start',
            bgcolor: '#f5f5f5',
            position: 'relative',
          }}
        >
          <Box
            component="img"
            src={correctedImageUrl}
            alt="Teacher reference"
            loading="lazy"
            sx={{ width: '100%', height: 300, objectFit: 'contain', display: 'block' }}
          />
        </Box>
      </Box>

      {/* Dot indicators */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 0.75,
        }}
      >
        {[0, 1].map((i) => (
          <Box
            key={i}
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              bgcolor: activeIndex === i ? '#fff' : 'rgba(255,255,255,0.5)',
              transition: 'bgcolor 0.2s',
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
