'use client';

import { useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  ImageUploadField,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import { INSPIRATION_TYPE_LABELS, typeLabel } from '@/lib/inspiration-types';
import { createExemplar, uploadInspirationImage } from './inspiration-api';

const TYPE_OPTIONS = Object.keys(INSPIRATION_TYPE_LABELS);

export interface AddExemplarSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

/** A teacher adds a drawing of their own. Full screen on a phone, a dialog on a laptop. */
export default function AddExemplarSheet({ open, onClose, onCreated }: AddExemplarSheetProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const { getToken } = useNexusAuthContext();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [exams, setExams] = useState<string[]>([]);
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setImageUrl(null);
    setTitle('');
    setBrief('');
    setTypes([]);
    setExams([]);
    setYear('');
    setError(null);
  };

  const close = () => {
    const dirty = Boolean(imageUrl || title.trim() || brief.trim());
    if (dirty && !window.confirm('Discard this exemplar?')) return;
    reset();
    onClose();
  };

  const canSave = Boolean(imageUrl) && types.length > 0 && Boolean(title.trim() || brief.trim()) && !saving;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { id } = await createExemplar(getToken, {
        image_url: imageUrl,
        title,
        brief,
        type_slugs: types,
        exam_types: exams,
        paper_years: /^\d{4}$/.test(year) ? [Number(year)] : [],
      });
      reset();
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the exemplar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="add-exemplar-title"
      transitionDuration={reduceMotion ? 0 : undefined}
    >
      <DialogTitle id="add-exemplar-title">Add an exemplar</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <ImageUploadField
          value={imageUrl}
          onChange={setImageUrl}
          upload={(file) => uploadInspirationImage(getToken, file)}
          label="Drawing"
          helperText="A clear photo or scan. You can paste an image too."
          maxSizeMB={10}
          previewable
          required
        />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 120 }} fullWidth />
        <TextField
          label="Brief"
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          inputProps={{ maxLength: 600 }}
          helperText="The question or idea, in the words a student would search for"
          multiline
          minRows={3}
          fullWidth
        />
        <Autocomplete
          multiple
          options={TYPE_OPTIONS}
          value={types}
          onChange={(_, value) => setTypes(value.slice(0, 6))}
          getOptionLabel={typeLabel}
          renderInput={(params) => <TextField {...params} label="Drawing types" required helperText="Pick at least one" />}
        />
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }} id="exemplar-exam-label">
            Exam (optional)
          </Typography>
          <ToggleButtonGroup value={exams} onChange={(_, value: string[]) => setExams(value)} aria-labelledby="exemplar-exam-label">
            <ToggleButton value="NATA" sx={{ minHeight: 44, px: 2 }}>
              NATA
            </ToggleButton>
            <ToggleButton value="JEE_PAPER_2" sx={{ minHeight: 44, px: 2 }}>
              JEE Paper 2
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <TextField
          label="Past paper year (optional)"
          value={year}
          onChange={(e) => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
          sx={{ maxWidth: 240 }}
        />
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close} sx={{ minHeight: 44 }}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={!canSave} sx={{ minHeight: 44 }}>
          {saving ? 'Adding' : 'Add to Inspiration'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
