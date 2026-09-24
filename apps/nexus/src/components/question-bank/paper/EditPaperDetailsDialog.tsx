'use client';

/**
 * Correct a paper's year, session or shift after upload.
 *
 * Bulk upload asks for them once, and a paper saved as "Session 1 (FN)" when it
 * was the afternoon paper had no way back short of deleting it and uploading
 * all 83 questions again. The route moves the paper and its question source
 * rows together (nexus_qb_rename_paper), so the questions, answers and
 * videos stay exactly where they are; only the name changes.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { QB_EXAM_TYPE_LABELS } from '@neram/database';
import {
  PAPER_YEAR_MIN,
  paperYearMax,
  parsePaperIdentityEdit,
  sessionOptionsFor,
  type PaperShift,
} from '@/lib/qb-paper-identity';

export interface EditablePaper {
  id: string;
  exam_type: string;
  year: number;
  session: string | null;
  shift: string | null;
}

export interface EditPaperDetailsDialogProps {
  open: boolean;
  paper: EditablePaper;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  /** After a save, with the paper as stored. */
  onSaved: (paper: EditablePaper) => void;
}

const NO_SESSION = '__none__';
type ShiftChoice = PaperShift | 'none';

export default function EditPaperDetailsDialog({ open, paper, onClose, getToken, onSaved }: EditPaperDetailsDialogProps) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const [year, setYear] = useState(paper.year);
  const [session, setSession] = useState(paper.session ?? NO_SESSION);
  const [shift, setShift] = useState<ShiftChoice>((paper.shift as PaperShift | null) ?? 'none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the paper as it is each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setYear(paper.year);
    setSession(paper.session ?? NO_SESSION);
    setShift((paper.shift as PaperShift | null) ?? 'none');
    setError(null);
  }, [open, paper.year, paper.session, paper.shift]);

  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = paperYearMax(); y >= PAPER_YEAR_MIN; y -= 1) list.push(y);
    return list;
  }, []);

  // The exam's usual sessions, plus whatever odd value an old upload stored,
  // so opening the dialog never silently changes it.
  const sessionOptions = useMemo(() => {
    const options = sessionOptionsFor(paper.exam_type).map((o) => ({ value: o.value, label: `${o.label} (${o.hint})` }));
    if (paper.session && !options.some((o) => o.value === paper.session)) {
      options.push({ value: paper.session, label: paper.session });
    }
    return options;
  }, [paper.exam_type, paper.session]);

  const next = {
    year,
    session: session === NO_SESSION ? null : session,
    shift: shift === 'none' ? null : shift,
  };
  const unchanged =
    next.year === paper.year && (next.session ?? null) === (paper.session ?? null) && next.shift === (paper.shift ?? null);

  const examLabel = QB_EXAM_TYPE_LABELS[paper.exam_type as keyof typeof QB_EXAM_TYPE_LABELS] ?? paper.exam_type;
  const preview = `${examLabel} ${next.year}${next.session ? ` ${next.session}` : ''}${
    next.shift ? ` (${next.shift === 'forenoon' ? 'FN' : 'AN'})` : ''
  }`;

  async function save() {
    const checked = parsePaperIdentityEdit(next, paper);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/papers/${paper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(checked.value),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || 'The paper could not be saved. Try again.');
        return;
      }
      onSaved({ ...paper, ...(json?.data ?? checked.value) });
      onClose();
    } catch {
      setError('The connection dropped. Check it and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      fullScreen={fullScreen}
      PaperProps={{ 'aria-labelledby': 'edit-paper-details-title' } as Record<string, string>}
    >
      <DialogTitle id="edit-paper-details-title">Edit paper details</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <Typography variant="body2" color="text.secondary">
            Fix a year, session or shift picked wrongly at upload. The questions, answer keys and videos stay as they are.
          </Typography>

          <TextField
            select
            label="Year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            fullWidth
            SelectProps={{ MenuProps: { PaperProps: { sx: { maxHeight: 320 } } } }}
          >
            {years.map((y) => (
              <MenuItem key={y} value={y} sx={{ minHeight: 44 }}>
                {y}
              </MenuItem>
            ))}
          </TextField>

          <TextField select label="Session" value={session} onChange={(e) => setSession(e.target.value)} fullWidth>
            <MenuItem value={NO_SESSION} sx={{ minHeight: 44 }}>
              No session (one paper that year)
            </MenuItem>
            {sessionOptions.map((o) => (
              <MenuItem key={o.value} value={o.value} sx={{ minHeight: 44 }}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>

          <Box>
            <Typography id="edit-paper-shift-label" variant="body2" fontWeight={600} sx={{ mb: 0.75 }}>
              Shift
            </Typography>
            <ToggleButtonGroup
              exclusive
              fullWidth
              value={shift}
              onChange={(_, value: ShiftChoice | null) => value && setShift(value)}
              aria-labelledby="edit-paper-shift-label"
            >
              <ToggleButton value="forenoon" sx={{ minHeight: 44, textTransform: 'none' }}>
                Forenoon (FN)
              </ToggleButton>
              <ToggleButton value="afternoon" sx={{ minHeight: 44, textTransform: 'none' }}>
                Afternoon (AN)
              </ToggleButton>
              <ToggleButton value="none" sx={{ minHeight: 44, textTransform: 'none' }}>
                None
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ m: 0 }}>
              Saves as
            </Typography>
            <Typography variant="body1" fontWeight={700} data-testid="paper-details-preview">
              {preview}
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" role="alert">
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, pb: 'calc(12px + env(safe-area-inset-bottom))' }}>
        <Button onClick={onClose} disabled={saving} sx={{ minHeight: 44, textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || unchanged}
          startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ minHeight: 44, textTransform: 'none' }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
