'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Alert,
  CircularProgress,
  Box,
} from '@neram/ui';

interface CloneYearDialogProps {
  open: boolean;
  onClose: () => void;
  years: number[];
  onClone: (sourceYear: number, targetYear: number) => Promise<void>;
}

export default function CloneYearDialog({ open, onClose, years, onClone }: CloneYearDialogProps) {
  const [sourceYear, setSourceYear] = useState<number>(years[0] || 2025);
  const [targetYear, setTargetYear] = useState<number>((years[0] || 2025) + 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleClone = async () => {
    if (sourceYear === targetYear) {
      setError('Source and target year must be different');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await onClone(sourceYear, targetYear);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clone');
    } finally {
      setLoading(false);
    }
  };

  // Generate target year options (source year +1, +2, -1)
  const targetOptions = [sourceYear - 1, sourceYear + 1, sourceYear + 2].filter(
    (y) => y > 2020 && y < 2035
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Clone Centers to New Year</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Copy all exam center data from one year to another. Existing data in the target year won&apos;t be overwritten.
        </Typography>

        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
          <FormControl size="small" fullWidth>
            <InputLabel>Source Year</InputLabel>
            <Select
              value={sourceYear}
              label="Source Year"
              onChange={(e) => setSourceYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="h6" sx={{ alignSelf: 'center' }}>&rarr;</Typography>

          <FormControl size="small" fullWidth>
            <InputLabel>Target Year</InputLabel>
            <Select
              value={targetYear}
              label="Target Year"
              onChange={(e) => setTargetYear(Number(e.target.value))}
            >
              {targetOptions.map((y) => (
                <MenuItem key={y} value={y}>{y}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleClone}
          disabled={loading || sourceYear === targetYear}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          Clone Data
        </Button>
      </DialogActions>
    </Dialog>
  );
}
