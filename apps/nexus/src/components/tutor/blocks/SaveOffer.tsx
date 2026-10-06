'use client';

import { Box, Button, Typography, useTheme } from '@neram/ui';
import BookmarkBorderRoundedIcon from '@mui/icons-material/BookmarkBorderRounded';
import BookmarkAddedRoundedIcon from '@mui/icons-material/BookmarkAddedRounded';
import type { LearningItemKind } from '@/lib/assistant/tutor/types';
import { focusRing } from '@/components/assistant/focusRing';
import { stableHover } from '@/components/assistant/stableHover';
import { KIND_LABEL } from '../labels';

interface SaveOfferProps {
  title: string;
  itemKind: LearningItemKind;
  saved: boolean;
  disabled?: boolean;
  onSave: () => void;
}

/** "Save to My Learning" under something worth keeping; "Saved" once pressed. */
export default function SaveOffer({ title, itemKind, saved, disabled = false, onSave }: SaveOfferProps) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        flexWrap: 'wrap',
        border: '1px dashed',
        borderColor: 'divider',
        borderRadius: 2,
        px: 1.5,
        py: 1,
      }}
    >
      <Box sx={{ flex: '1 1 160px', minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="p">
          {KIND_LABEL[itemKind] ?? 'Note'}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
          {title}
        </Typography>
      </Box>
      {saved ? (
        <Box role="status" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minHeight: 44, color: 'success.dark', fontWeight: 700 }}>
          <BookmarkAddedRoundedIcon aria-hidden fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>Saved</Typography>
        </Box>
      ) : (
        <Button
          onClick={onSave}
          disabled={disabled}
          variant="outlined"
          startIcon={<BookmarkBorderRoundedIcon />}
          aria-label={`Save ${title} to My Learning`}
          sx={{ ...stableHover, minHeight: 44, textTransform: 'none', fontWeight: 700, '&.Mui-focusVisible': focusRing(theme.palette.primary.dark) }}
        >
          Save to My Learning
        </Button>
      )}
    </Box>
  );
}
