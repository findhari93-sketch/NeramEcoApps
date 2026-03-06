'use client';

import { useState } from 'react';
import { Box, Typography, Chip } from '@neram/ui';
import { motion } from 'framer-motion';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { SocialProof } from '@neram/database';
import VideoPlayerModal from './VideoPlayerModal';

interface VideoProofGridProps {
  videos: SocialProof[];
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
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

export default function VideoProofGrid({ videos }: VideoProofGridProps) {
  const [selectedVideo, setSelectedVideo] = useState<SocialProof | null>(null);

  if (videos.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No video testimonials yet.</Typography>
      </Box>
    );
  }

  return (
    <>
      <style>{`
        .sp-video-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 24px;
        }
        @media (min-width: 600px) {
          .sp-video-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (min-width: 900px) {
          .sp-video-grid { grid-template-columns: repeat(3, 1fr); }
        }
      `}</style>

      <motion.div
        className="sp-video-grid"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-50px' }}
      >
        {videos.map((video) => (
          <motion.div
            key={video.id}
            variants={itemVariants}
            whileHover={{ scale: 1.03, y: -4 }}
            transition={{ duration: 0.2 }}
            style={{ cursor: 'pointer' }}
            onClick={() => setSelectedVideo(video)}
          >
            <Box
              className="neram-glass"
              sx={{
                borderRadius: 2,
                overflow: 'hidden',
                transition: 'box-shadow 0.3s ease',
                '&:hover': {
                  boxShadow: '0 8px 32px rgba(232,160,32,0.12)',
                  borderColor: 'var(--neram-border-gold)',
                },
              }}
            >
              {/* Thumbnail */}
              <Box sx={{ position: 'relative', paddingTop: '56.25%' }}>
                <img
                  src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
                  alt={`${video.speaker_name} testimonial`}
                  loading="lazy"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
                {/* Play button overlay */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: 56,
                    height: 56,
                    borderRadius: '50%',
                    bgcolor: 'rgba(0,0,0,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(4px)',
                    transition: 'all 0.25s ease',
                    '&:hover': {
                      bgcolor: 'rgba(232,160,32,0.85)',
                      transform: 'translate(-50%, -50%) scale(1.1)',
                    },
                  }}
                >
                  <PlayArrowIcon sx={{ color: '#fff', fontSize: 32 }} />
                </Box>
                {/* Language chip */}
                <Chip
                  label={video.language}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    height: 22,
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    textTransform: 'capitalize',
                    bgcolor: 'rgba(0,0,0,0.65)',
                    color: getLanguageColor(video.language),
                    backdropFilter: 'blur(4px)',
                    border: `1px solid ${getLanguageColor(video.language)}33`,
                    '& .MuiChip-label': { px: 1 },
                  }}
                />
              </Box>

              {/* Info */}
              <Box sx={{ p: 2 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 700,
                    color: 'var(--neram-gold)',
                    mb: 0.25,
                    lineHeight: 1.3,
                  }}
                >
                  {video.speaker_name}
                </Typography>
                {video.student_name && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'var(--neram-text)',
                      display: 'block',
                      lineHeight: 1.3,
                    }}
                  >
                    {video.student_name}
                  </Typography>
                )}
                {video.batch && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'var(--neram-text-muted)',
                      display: 'block',
                      mt: 0.25,
                      fontSize: '0.7rem',
                    }}
                  >
                    {video.batch}
                  </Typography>
                )}
              </Box>
            </Box>
          </motion.div>
        ))}
      </motion.div>

      <VideoPlayerModal
        open={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        video={selectedVideo}
      />
    </>
  );
}
