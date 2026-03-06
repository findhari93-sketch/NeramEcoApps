'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Divider,
  Box,
} from '@neram/ui';

interface AddCenterDialogProps {
  open: boolean;
  onClose: () => void;
  year: number;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  initialData?: Record<string, unknown> | null;
}

const EMPTY_FORM = {
  state: '',
  city_brochure: '',
  brochure_ref: '',
  latitude: '',
  longitude: '',
  city_population_tier: '',
  probable_center_1: '',
  center_1_address: '',
  center_1_evidence: '',
  probable_center_2: '',
  center_2_address: '',
  center_2_evidence: '',
  confidence: 'LOW',
  is_new_2025: false,
  was_in_2024: false,
  tcs_ion_confirmed: false,
  has_barch_college: false,
  notes: '',
};

export default function AddCenterDialog({
  open,
  onClose,
  year,
  onSave,
  initialData,
}: AddCenterDialogProps) {
  const [form, setForm] = useState<Record<string, unknown>>(
    initialData ? { ...EMPTY_FORM, ...initialData } : { ...EMPTY_FORM }
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!initialData;

  const handleChange = (field: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    // Validate required fields
    if (!form.state || !form.city_brochure) {
      setError('State and City are required');
      return;
    }
    if (!form.latitude || !form.longitude) {
      setError('Latitude and Longitude are required');
      return;
    }
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      setError('Invalid latitude/longitude values');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await onSave({
        ...form,
        latitude: lat,
        longitude: lng,
        year,
        brochure_ref: form.brochure_ref || null,
        city_population_tier: form.city_population_tier || null,
        notes: form.notes || null,
      });
      setForm({ ...EMPTY_FORM });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm({ ...EMPTY_FORM });
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Exam Center' : 'Add New Exam Center'}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2, mt: 1 }}>{error}</Alert>}

        {/* Location Section */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
          Location Details
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="State *"
              value={form.state}
              onChange={(e) => handleChange('state', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="City (Brochure) *"
              value={form.city_brochure}
              onChange={(e) => handleChange('city_brochure', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Brochure Ref"
              placeholder="e.g., 19.1"
              value={form.brochure_ref}
              onChange={(e) => handleChange('brochure_ref', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Latitude *"
              type="number"
              value={form.latitude}
              onChange={(e) => handleChange('latitude', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Longitude *"
              type="number"
              value={form.longitude}
              onChange={(e) => handleChange('longitude', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>City Tier</InputLabel>
              <Select
                value={form.city_population_tier}
                label="City Tier"
                onChange={(e) => handleChange('city_population_tier', e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                <MenuItem value="Metro">Metro</MenuItem>
                <MenuItem value="Tier-1">Tier-1</MenuItem>
                <MenuItem value="Tier-2">Tier-2</MenuItem>
                <MenuItem value="Tier-3">Tier-3</MenuItem>
                <MenuItem value="International">International</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Primary Center */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Primary Probable Center
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Center Name"
              value={form.probable_center_1}
              onChange={(e) => handleChange('probable_center_1', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Address"
              value={form.center_1_address}
              onChange={(e) => handleChange('center_1_address', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Evidence Source"
              value={form.center_1_evidence}
              onChange={(e) => handleChange('center_1_evidence', e.target.value)}
            />
          </Grid>
        </Grid>

        {/* Alternate Center */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 2, mb: 1 }}>
          Alternate Probable Center
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Center Name"
              value={form.probable_center_2}
              onChange={(e) => handleChange('probable_center_2', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Address"
              value={form.center_2_address}
              onChange={(e) => handleChange('center_2_address', e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              label="Evidence Source"
              value={form.center_2_evidence}
              onChange={(e) => handleChange('center_2_evidence', e.target.value)}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />

        {/* Classification */}
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
          Classification & Status
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <FormControl size="small" fullWidth>
              <InputLabel>Confidence</InputLabel>
              <Select
                value={form.confidence}
                label="Confidence"
                onChange={(e) => handleChange('confidence', e.target.value)}
              >
                <MenuItem value="HIGH">HIGH</MenuItem>
                <MenuItem value="MEDIUM">MEDIUM</MenuItem>
                <MenuItem value="LOW">LOW</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={8}>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!form.is_new_2025}
                    onChange={(e) => handleChange('is_new_2025', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">New this year</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!form.was_in_2024}
                    onChange={(e) => handleChange('was_in_2024', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">Was in prev year</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!form.tcs_ion_confirmed}
                    onChange={(e) => handleChange('tcs_ion_confirmed', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">TCS iON</Typography>}
              />
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={!!form.has_barch_college}
                    onChange={(e) => handleChange('has_barch_college', e.target.checked)}
                  />
                }
                label={<Typography variant="body2">B.Arch College</Typography>}
              />
            </Box>
          </Grid>
        </Grid>

        {/* Notes */}
        <TextField
          size="small"
          fullWidth
          multiline
          rows={2}
          label="Notes"
          value={form.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          sx={{ mt: 2 }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={16} /> : null}
        >
          {isEdit ? 'Update' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
