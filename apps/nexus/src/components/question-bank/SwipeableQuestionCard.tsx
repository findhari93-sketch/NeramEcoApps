'use client';

import { Box, Typography, useTheme, useMediaQuery } from '@neram/ui';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';

interface SwipeableQuestionCardProps {
  children: React.ReactNode;
  /** Called when user swipes left (studied action) */
  onStudied?: () => void;
  /** Called when user swipes right (bookmark action) */
  onBookmark?: () => void;
  /** Called on long press (enter selection mode) */
  onLongPress?: () => void;
  /** Disable swipe (e.g. when in selection mode) */
  disabled?: boolean;
}

export default function SwipeableQuestionCard({
  children,
  onStudied,
  onBookmark,
  onLongPress,
  disabled = false,
}: SwipeableQuestionCardProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const { handlers, offsetX, isSwiping, direction } = useSwipeGesture({
    onSwipeLeft: onStudied,
    onSwipeRight: onBookmark,
    onLongPress,
    threshold: 0.35,
    enabled: isMobile && !disabled,
  });

  // On desktop, just render children without swipe wrapper
  if (!isMobile) {
    return <>{children}</>;
  }

  const revealOpacity = Math.min(Math.abs(offsetX) / 80, 1);

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2 }}>
      {/* Left reveal (bookmark - shown when swiping right) */}
      <Box
        sx={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: '#ff9800',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: direction === 'right' ? revealOpacity : 0,
          transition: isSwiping ? 'none' : 'opacity 0.3s ease',
        }}
      >
        <Typography color="white" fontWeight={600} fontSize={12}>
          &#9733; Save
        </Typography>
      </Box>

      {/* Right reveal (studied - shown when swiping left) */}
      <Box
        sx={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 80,
          background: '#4caf50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: direction === 'left' ? revealOpacity : 0,
          transition: isSwiping ? 'none' : 'opacity 0.3s ease',
        }}
      >
        <Typography color="white" fontWeight={600} fontSize={12}>
          &#10003; Studied
        </Typography>
      </Box>

      {/* Main content with transform */}
      <Box
        sx={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping
            ? 'none'
            : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative',
          zIndex: 1,
          background: theme.palette.background.paper,
        }}
        {...handlers}
      >
        {children}
      </Box>
    </Box>
  );
}
