'use client';

import { Box, Typography } from '@neram/ui';
import { motion } from 'framer-motion';
import type { SocialProof } from '@neram/database';
import AudioProofCard from './AudioProofCard';

interface AudioProofGridProps {
  audios: SocialProof[];
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.12,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

export default function AudioProofGrid({ audios }: AudioProofGridProps) {
  if (audios.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <Typography color="text.secondary">No audio stories yet.</Typography>
      </Box>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
    >
      {/* Mobile: horizontal scroll */}
      <div
        className="flex overflow-x-auto snap-x snap-mandatory gap-4 px-4 -mx-4 pb-4 md:hidden"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <style>{`
          .sp-audio-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        {audios.map((audio) => (
          <motion.div
            key={audio.id}
            variants={itemVariants}
            className="snap-center shrink-0"
            style={{ minWidth: 320 }}
          >
            <AudioProofCard proof={audio} />
          </motion.div>
        ))}
      </div>

      {/* Tablet/Desktop: grid */}
      <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {audios.map((audio) => (
          <motion.div key={audio.id} variants={itemVariants}>
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <AudioProofCard proof={audio} />
            </Box>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
