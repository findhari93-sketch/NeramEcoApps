'use client';

/**
 * Rename a resource, or write the note that goes under it.
 *
 * Two fields share one dialog because they differ only in wording and length.
 * The note is the whole reason a teacher attaches anything here, so it gets a
 * multiline box and a placeholder that shows what a useful one looks like
 * rather than a bare "Note".
 */

import { useEffect, useState } from 'react';
import { Box, Button, Dialog, TextField, Typography, useTheme } from '@neram/ui';
import { RADIUS } from './timetable-theme';
import { MAX_NOTE_LENGTH, MAX_TITLE_LENGTH } from '@/lib/class-resources';

interface ResourceTextDialogProps {
  open: boolean;
  field: 'title' | 'note';
  initialValue: string;
  onCancel: () => void;
  onSave: (value: string) => void;
}

export default function ResourceTextDialog({
  open,
  field,
  initialValue,
  onCancel,
  onSave,
}: ResourceTextDialogProps) {
  const theme = useTheme();
  const [value, setValue] = useState(initialValue);
  const isNote = field === 'note';

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  const trimmed = value.trim();
  // A title cannot be emptied (the card would have nothing to show), but a note
  // can: clearing it is how a teacher removes one.
  const canSave = isNote || trimmed.length > 0;

  return (
    <Dialog open={open} onClose={onCancel} maxWidth="xs" fullWidth>
      <Box sx={{ p: 2.5 }}>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', mb: 0.5 }}>
          {isNote ? 'Note for students' : 'Rename'}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.75 }}>
          {isNote
            ? 'Tell them what to look for, so they know why you shared it.'
            : 'What students will see as the title.'}
        </Typography>

        <TextField
          fullWidth
          autoFocus
          multiline={isNote}
          minRows={isNote ? 3 : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputProps={{
            maxLength: isNote ? MAX_NOTE_LENGTH : MAX_TITLE_LENGTH,
            'aria-label': isNote ? 'Note for students' : 'Title',
          }}
          placeholder={isNote ? 'Watch 2:10 to 5:00 for the subtraction method' : 'Title'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !isNote && canSave) {
              e.preventDefault();
              onSave(trimmed);
            }
          }}
          sx={{ '& .MuiInputBase-root': { borderRadius: RADIUS.control } }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button
            onClick={onCancel}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={!canSave}
            onClick={() => onSave(trimmed)}
            sx={{ textTransform: 'none', minHeight: 44, borderRadius: RADIUS.control }}
          >
            Save
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
}
