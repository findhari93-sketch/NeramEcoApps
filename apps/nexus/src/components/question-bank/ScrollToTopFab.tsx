'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Fab, useTheme, useMediaQuery } from '@neram/ui';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

interface ScrollToTopFabProps {
  /** Show threshold in pixels (default: window.innerHeight * 3) */
  threshold?: number;
}

export default function ScrollToTopFab({ threshold }: ScrollToTopFabProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [visible, setVisible] = useState(false);
  const rafId = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    if (rafId.current !== null) return;

    rafId.current = requestAnimationFrame(() => {
      const showAt = threshold ?? window.innerHeight * 3;
      setVisible(window.scrollY > showAt);
      rafId.current = null;
    });
  }, [threshold]);

  useEffect(() => {
    if (!isMobile) return;

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId.current !== null) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, [isMobile, handleScroll]);

  if (!isMobile || !visible) return null;

  return (
    <Fab
      size="medium"
      color="primary"
      aria-label="scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      sx={{
        position: 'fixed',
        bottom: 72,
        right: 16,
        zIndex: 50,
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <KeyboardArrowUpIcon />
    </Fab>
  );
}
