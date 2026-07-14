'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  Divider,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import EventIcon from '@mui/icons-material/Event';
import { academicYearOptions, ACADEMIC_YEAR_REGEX } from './academic-years';

interface SetAcademicYearDialogProps {
  open: boolean;
  count: number;
  defaultYear?: string;
  onClose: () => void;
  /** Resolves once the year is applied (parent calls the API and reloads). */
  onConfirm: (academicYear: string) => Promise<void>;
}

/**
 * Assign / backfill the academic-year cohort on the selected students. This is how
 * the mostly-blank year data gets filled so students can later be selected by year.
 */
export default function SetAcademicYearDialog({
  open,
  count,
  defaultYear,
  onClose,
  onConfirm,
}: SetAcademicYearDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const options = academicYearOptions();
  const [year, setYear] = useState(defaultYear || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setYear(defaultYear || '');
      setError('');
    }
  }, [open, defaultYear]);

  const valid = ACADEMIC_YEAR_REGEX.test(year);

  const handleConfirm = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(year);
    } catch (err: any) {
      setError(err?.message || 'Failed to set academic year');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => !submitting && onClose()} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <EventIcon sx={{ color: '#2563EB' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Change exam batch
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {count} student{count === 1 ? '' : 's'} selected
          </Typography>
        </Box>
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The academic year is the cohort that wrote (or will write) the NATA exam, e.g. the
          2025-26 batch. This stamps the year on every selected student.
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          label="Exam batch"
          value={options.includes(year) ? year : ''}
          onChange={(e) => setYear(e.target.value)}
          disabled={submitting}
          helperText="Format YYYY-YY"
        >
          {options.map((y) => (
            <MenuItem key={y} value={y}>
              {y}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!valid || submitting}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <EventIcon sx={{ fontSize: 18 }} />}
          sx={{ textTransform: 'none', minWidth: 150 }}
        >
          {submitting ? 'Saving...' : `Set ${count} to ${year || '...'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
