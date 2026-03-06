'use client';

import { useState, useCallback, useEffect } from 'react';
import { Box, IconButton, Typography } from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { motion, AnimatePresence } from 'framer-motion';
import type { SocialProof } from '@neram/database';

interface ScreenshotLightboxProps {
  screenshots: SocialProof[];
  selectedIndex: number | null;
  onClose: () => void;
}

export default function ScreenshotLightbox({
  screenshots,
  selectedIndex,
  onClose,
}: ScreenshotLightboxProps) {
  const isOpen = selectedIndex !== null;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <LightboxContent
        key="lightbox"
        screenshots={screenshots}
        initialIndex={selectedIndex}
        onClose={onClose}
      />
    </AnimatePresence>
  );
}

/**
 * Inner component that manages its own navigation index.
 * Receives initialIndex from parent and handles prev/next internally.
 */
function LightboxContent({
  screenshots,
  initialIndex,
  onClose,
}: {
  screenshots: SocialProof[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const current = screenshots[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < screenshots.length - 1;

  // Reset index when initialIndex changes (new image clicked)
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const goToNext = useCallback(() => {
    if (currentIndex < screenshots.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, screenshots.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, goToPrev, goToNext]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!current) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.92)',
        cursor: 'pointer',
      }}
    >
      {/* Close button */}
      <IconButton
        onClick={onClose}
        aria-label="Close lightbox"
        sx={{
          position: 'absolute',
          top: { xs: 12, md: 20 },
          right: { xs: 12, md: 20 },
          zIndex: 10,
          color: '#fff',
          bgcolor: 'rgba(255,255,255,0.1)',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
        }}
      >
        <CloseIcon />
      </IconButton>

      {/* Previous arrow */}
      {hasPrev && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            goToPrev();
          }}
          aria-label="Previous screenshot"
          sx={{
            position: 'absolute',
            left: { xs: 8, md: 24 },
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            color: '#fff',
            bgcolor: 'rgba(255,255,255,0.1)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
            width: { xs: 40, md: 48 },
            height: { xs: 40, md: 48 },
          }}
        >
          <ChevronLeftIcon sx={{ fontSize: { xs: 24, md: 32 } }} />
        </IconButton>
      )}

      {/* Next arrow */}
      {hasNext && (
        <IconButton
          onClick={(e) => {
            e.stopPropagation();
            goToNext();
          }}
          aria-label="Next screenshot"
          sx={{
            position: 'absolute',
            right: { xs: 8, md: 24 },
            top: '50%',
            transform: 'translateY(-50%)',
            zIndex: 10,
            color: '#fff',
            bgcolor: 'rgba(255,255,255,0.1)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' },
            width: { xs: 40, md: 48 },
            height: { xs: 40, md: 48 },
          }}
        >
          <ChevronRightIcon sx={{ fontSize: { xs: 24, md: 32 } }} />
        </IconButton>
      )}

      {/* Image */}
      <motion.div
        key={current.id}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'default', textAlign: 'center' }}
      >
        <img
          src={current.image_url || ''}
          alt={current.caption || `${current.speaker_name} screenshot`}
          style={{
            maxHeight: '80vh',
            maxWidth: '90vw',
            objectFit: 'contain',
            borderRadius: 8,
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        />

        {/* Caption and speaker */}
        <Box sx={{ mt: 2, px: 2 }}>
          {current.caption && (
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255,255,255,0.8)', mb: 0.5 }}
            >
              {current.caption}
            </Typography>
          )}
          <Typography
            variant="caption"
            sx={{
              color: 'var(--neram-gold)',
              fontWeight: 600,
            }}
          >
            {current.speaker_name}
            {current.student_name ? ` - ${current.student_name}` : ''}
          </Typography>
          {/* Counter */}
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              color: 'rgba(255,255,255,0.4)',
              mt: 0.5,
              fontSize: '0.7rem',
            }}
          >
            {currentIndex + 1} / {screenshots.length}
          </Typography>
        </Box>
      </motion.div>
    </motion.div>
  );
}
