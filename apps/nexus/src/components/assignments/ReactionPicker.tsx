'use client';

/**
 * A row of 5 emoji buttons a teacher taps to send an encouraging reaction to the
 * student while grading. Optional: tapping the selected one again clears it. The
 * chosen reaction is saved with the grade and shown to the student (plus a bell
 * notification). Reuses the shared 5-emoji set from lib/assignment-reactions.
 */
import { Box, Stack, Typography, alpha } from '@neram/ui';
import type { GalleryReactionType } from '@neram/database/types';
import { REACTIONS } from '@/lib/assignment-reactions';

interface ReactionPickerProps {
  value: GalleryReactionType | null;
  onChange: (value: GalleryReactionType | null) => void;
  disabled?: boolean;
}

export default function ReactionPicker({ value, onChange, disabled = false }: ReactionPickerProps) {
  return (
    <Box>
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
        Send some encouragement (optional)
      </Typography>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        {REACTIONS.map((r) => {
          const active = value === r.type;
          return (
            <Box
              key={r.type}
              component="button"
              type="button"
              disabled={disabled}
              onClick={() => onChange(active ? null : r.type)}
              aria-label={r.label}
              aria-pressed={active}
              sx={{
                minWidth: 52,
                minHeight: 52,
                px: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.25,
                cursor: disabled ? 'default' : 'pointer',
                borderRadius: 2,
                border: '1.5px solid',
                borderColor: active ? 'primary.main' : 'divider',
                bgcolor: active ? (theme) => alpha(theme.palette.primary.main, 0.1) : 'background.paper',
                transition: 'border-color 0.15s, background-color 0.15s',
                '&:hover': disabled ? undefined : { borderColor: 'primary.light' },
              }}
            >
              <Box component="span" sx={{ fontSize: 22, lineHeight: 1 }}>
                {r.emoji}
              </Box>
              <Typography
                variant="caption"
                sx={{ fontSize: 10, fontWeight: active ? 700 : 500, color: active ? 'primary.main' : 'text.secondary' }}
              >
                {r.label}
              </Typography>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
