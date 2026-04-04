'use client';

import { useState } from 'react';
import { Box, ToggleButton, ToggleButtonGroup, Typography } from '@neram/ui';

interface ReferenceImage {
  level: number;
  url: string;
  alt_text?: string;
}

export default function ReferenceImageToggle({ images }: { images: ReferenceImage[] }) {
  const [level, setLevel] = useState(1);

  if (!images || images.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        No reference images available yet
      </Typography>
    );
  }

  const currentImage = images.find((img) => img.level === level) || images[0];

  return (
    <Box>
      <ToggleButtonGroup
        value={level}
        exclusive
        onChange={(_, v) => v !== null && setLevel(v)}
        size="small"
        sx={{ mb: 1.5 }}
      >
        <ToggleButton value={1} sx={{ textTransform: 'none', px: 2 }}>Beginner</ToggleButton>
        <ToggleButton value={2} sx={{ textTransform: 'none', px: 2 }}>Intermediate</ToggleButton>
        <ToggleButton value={3} sx={{ textTransform: 'none', px: 2 }}>Advanced</ToggleButton>
      </ToggleButtonGroup>
      {currentImage && (
        <Box
          component="img"
          src={currentImage.url}
          alt={currentImage.alt_text || `Level ${level} reference`}
          sx={{
            width: '100%',
            maxHeight: 400,
            objectFit: 'contain',
            borderRadius: 1,
            bgcolor: 'grey.50',
          }}
        />
      )}
    </Box>
  );
}
