'use client';

import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';

export interface CreateTestSettings {
  title: string;
  timerType: 'none' | 'full' | 'per_question';
  durationMinutes: number;
  perQuestionSeconds: number;
}

interface CreateTestDialogProps {
  open: boolean;
  onClose: () => void;
  selectedCount: number;
  /** "JEE Paper 2 2014", or nothing for the whole bank. */
  paperLabel: string | null;
  fullScreen: boolean;
  onCreate: (settings: CreateTestSettings) => Promise<void>;
}

/**
 * Name the practice test and pick its timer.
 *
 * The title is re-suggested from the live selection every time the dialog
 * opens, and left alone the moment the student types. An older version minted
 * it once per mount while nothing was selected, which is where "Practice - 0
 * questions" on a 544-question paper came from.
 */
export default function CreateTestDialog({
  open,
  onClose,
  selectedCount,
  paperLabel,
  fullScreen,
  onCreate,
}: CreateTestDialogProps) {
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [timerType, setTimerType] = useState<CreateTestSettings['timerType']>('none');
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [perQuestionSeconds, setPerQuestionSeconds] = useState(120);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open || titleTouched) return;
    const parts: string[] = [];
    if (paperLabel) parts.push(paperLabel);
    parts.push('Practice');
    parts.push(`(${selectedCount} question${selectedCount === 1 ? '' : 's'})`);
    setTitle(parts.join(' '));
  }, [open, titleTouched, paperLabel, selectedCount]);

  async function handleCreate() {
    setCreating(true);
    try {
      await onCreate({ title: title.trim(), timerType, durationMinutes, perQuestionSeconds });
      setTitle('');
      setTitleTouched(false);
      setTimerType('none');
      setDurationMinutes(60);
      setPerQuestionSeconds(120);
    } catch {
      // The caller reports the error; the dialog stays open with the settings.
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullScreen={fullScreen} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center' }}>
        Create practice test
        <IconButton onClick={onClose} sx={{ ml: 'auto', minWidth: 48, minHeight: 48 }} aria-label="Close">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
          <TextField
            label="Test name"
            value={title}
            onChange={(e) => {
              setTitleTouched(true);
              setTitle(e.target.value);
            }}
            fullWidth
            required
            inputProps={{ maxLength: 200 }}
            sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
          />

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Timer
            </Typography>
            <RadioGroup value={timerType} onChange={(e) => setTimerType(e.target.value as CreateTestSettings['timerType'])}>
              <FormControlLabel value="none" control={<Radio />} label="No timer" />
              <FormControlLabel value="full" control={<Radio />} label="One timer for the whole test" />
              <FormControlLabel value="per_question" control={<Radio />} label="A timer for each question" />
            </RadioGroup>
          </Box>

          {timerType === 'full' && (
            <TextField
              label="Duration (minutes)"
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value)))}
              inputProps={{ min: 1, max: 600, inputMode: 'numeric' }}
              fullWidth
              sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
            />
          )}

          {timerType === 'per_question' && (
            <TextField
              label="Time per question (seconds)"
              type="number"
              value={perQuestionSeconds}
              onChange={(e) => setPerQuestionSeconds(Math.max(10, Number(e.target.value)))}
              inputProps={{ min: 10, max: 3600, inputMode: 'numeric' }}
              fullWidth
              sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
            />
          )}

          <Typography variant="body2" color="text.secondary">
            {selectedCount} question{selectedCount !== 1 ? 's' : ''} selected ({selectedCount} marks total)
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={creating || !title.trim() || selectedCount === 0}
          sx={{ textTransform: 'none', minWidth: 120 }}
        >
          {creating ? 'Creating...' : 'Create test'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
