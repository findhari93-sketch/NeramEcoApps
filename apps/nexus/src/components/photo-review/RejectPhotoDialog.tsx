'use client';

/**
 * Ask a teacher why a profile photo is not acceptable.
 *
 * The reason is not bookkeeping: it is the ONLY thing the blocked student is
 * shown on the full-screen gate, so a rejection without a usable reason leaves
 * them stuck with no idea what to fix. That is why "Other" forces a note.
 */

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@neram/ui';

/** Written in the second person, because the student reads them verbatim. */
export const REJECT_REASONS = [
  'Face is not clearly visible',
  'Photo is too dark or blurry',
  'This is not a photo of you',
  'Sunglasses or a mask is covering your face',
  'This is a group photo',
  'Other',
] as const;

const OTHER = 'Other';

interface Props {
  open: boolean;
  /** Names of the students being rejected. Plural wording when more than one. */
  studentNames: string[];
  saving?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function RejectPhotoDialog({
  open,
  studentNames,
  saving,
  onClose,
  onConfirm,
}: Props) {
  const [preset, setPreset] = useState<string>(REJECT_REASONS[0]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setPreset(REJECT_REASONS[0]);
      setNote('');
    }
  }, [open]);

  const noteRequired = preset === OTHER;
  const trimmedNote = note.trim();
  const canSubmit = !saving && (!noteRequired || trimmedNote.length > 0);

  const handleConfirm = () => {
    if (!canSubmit) return;
    // The student sees this exact string, so the note is appended to the preset
    // rather than replacing it.
    const reason =
      preset === OTHER ? trimmedNote : trimmedNote ? `${preset}. ${trimmedNote}` : preset;
    onConfirm(reason);
  };

  const many = studentNames.length > 1;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontWeight: 800, pb: 1 }}>
        {many ? `Ask ${studentNames.length} students for a new photo` : 'Ask for a new photo'}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {many
            ? 'These students will lose access until they upload a photo that works.'
            : `${studentNames[0] || 'This student'} will lose access until they upload a photo that works.`}
        </Typography>

        <RadioGroup value={preset} onChange={(e) => setPreset(e.target.value)}>
          {REJECT_REASONS.map((r) => (
            <FormControlLabel
              key={r}
              value={r}
              control={<Radio size="small" />}
              label={<Typography variant="body2">{r}</Typography>}
              sx={{ minHeight: 40, ml: 0 }}
            />
          ))}
        </RadioGroup>

        <Stack sx={{ mt: 1 }}>
          <TextField
            size="small"
            multiline
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            label={noteRequired ? 'Tell them what to fix' : 'Add a note (optional)'}
            required={noteRequired}
            placeholder="For example: please stand somewhere brighter and face the camera."
          />
        </Stack>

        <Alert severity="info" sx={{ mt: 1.5, py: 0.5 }}>
          The student sees this reason on their screen.
        </Alert>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={!canSubmit}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 700 }}
        >
          {saving ? 'Sending...' : 'Ask for a new photo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
