'use client';

import { useState } from 'react';
import { Box, Typography, Chip } from '@neram/ui';
import { motion } from 'framer-motion';
import type { SocialProof } from '@neram/database';
import ScreenshotLightbox from './ScreenshotLightbox';

interface ScreenshotGalleryProps {
  screenshots: SocialProof[];
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

function getLanguageColor(lang: string): string {
  const colors: Record<string, string> = {
    tamil: '#e8a020',
    english: '#1a8fff',
    hindi: '#e25555',
    kannada: '#8b5cf6',
    malayalam: '#10b981',
    telugu: '#f97316',
  };
  return colors[lang] || '#888';
}

export default function ScreenshotGallery({
  screenshots,
}: ScreenshotGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  if (screenshots.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No screenshots yet.</Typography>
      </Box>
    );
  }

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px' }}
      >
        <style>{`
          .sp-screenshot-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
          }
          @media (min-width: 600px) {
            .sp-screenshot-grid { grid-template-columns: repeat(3, 1fr); gap: 20px; }
          }
          @media (min-width: 900px) {
            .sp-screenshot-grid { grid-template-columns: repeat(4, 1fr); gap: 20px; }
          }
        `}</style>

        <div className="sp-screenshot-grid">
          {screenshots.map((screenshot, index) => (
            <motion.div
              key={screenshot.id}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.2 }}
              style={{ cursor: 'pointer' }}
              onClick={() => setSelectedIndex(index)}
            >
              <Box
                sx={{
                  position: 'relative',
                  borderRadius: 2,
                  overflow: 'hidden',
                  aspectRatio: '3/4',
                  bgcolor: 'var(--neram-card)',
                  border: '1px solid var(--neram-border)',
                  transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
                  '&:hover': {
                    boxShadow: '0 8px 32px rgba(232,160,32,0.12)',
                    borderColor: 'var(--neram-border-gold)',
                  },
                  '&:hover .screenshot-overlay': {
                    opacity: 1,
                  },
                }}
              >
                {/* Image */}
                <img
                  src={screenshot.image_url || ''}
                  alt={screenshot.caption || `${screenshot.speaker_name} screenshot`}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />

                {/* Language chip - top right */}
                <Chip
                  label={screenshot.language}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    height: 20,
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    bgcolor: 'rgba(0,0,0,0.65)',
                    color: getLanguageColor(screenshot.language),
                    backdropFilter: 'blur(4px)',
                    border: `1px solid ${getLanguageColor(screenshot.language)}33`,
                    '& .MuiChip-label': { px: 0.75 },
                  }}
                />

                {/* Gradient overlay at bottom */}
                <Box
                  className="screenshot-overlay"
                  sx={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    background:
                      'linear-gradient(to top, rgba(6,13,31,0.9) 0%, rgba(6,13,31,0.4) 60%, transparent 100%)',
                    p: 1.5,
                    pt: 4,
                    opacity: { xs: 1, md: 0 },
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  {screenshot.caption && (
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'var(--neram-text)',
                        display: 'block',
                        lineHeight: 1.3,
                        fontSize: '0.7rem',
                        mb: 0.25,
                      }}
                    >
                      {screenshot.caption}
                    </Typography>
                  )}
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'var(--neram-gold)',
                      fontWeight: 600,
                      fontSize: '0.65rem',
                    }}
                  >
                    {screenshot.speaker_name}
                  </Typography>
                </Box>
              </Box>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <ScreenshotLightbox
        screenshots={screenshots}
        selectedIndex={selectedIndex}
        onClose={() => setSelectedIndex(null)}
      />
    </>
  );
}
