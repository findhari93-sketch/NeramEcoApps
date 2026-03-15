'use client';

import { Box, Chip, Skeleton, Typography } from '@neram/ui';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import type { NexusQBSavedPreset } from '@neram/database/src/types';

interface PresetChipsProps {
  presets: NexusQBSavedPreset[];
  loading: boolean;
  onSelect: (preset: NexusQBSavedPreset) => void;
}

export default function PresetChips({ presets, loading, onSelect }: PresetChipsProps) {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto' }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" width={100} height={32} />
        ))}
      </Box>
    );
  }

  if (presets.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        Saved Presets
      </Typography>
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          overflowX: 'auto',
          pb: 0.5,
          '&::-webkit-scrollbar': { height: 4 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 2 },
        }}
      >
        {presets.map((preset) => (
          <Chip
            key={preset.id}
            icon={<BookmarkBorderIcon sx={{ fontSize: 16 }} />}
            label={preset.name}
            onClick={() => onSelect(preset)}
            variant={preset.is_pinned ? 'filled' : 'outlined'}
            color={preset.is_pinned ? 'primary' : 'default'}
            sx={{
              flexShrink: 0,
              fontWeight: 500,
              '&:hover': { boxShadow: 1 },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}
