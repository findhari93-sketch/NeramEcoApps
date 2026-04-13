'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, Switch, FormControlLabel, FormGroup,
} from '@mui/material';
import WindowIcon from '@mui/icons-material/Window';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import PublicIcon from '@mui/icons-material/Public';

interface LeadWindow {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  applies_to: string;
  eligible_tiers: string[];
  is_active: boolean;
  created_at: string;
}

const TIER_OPTIONS = ['free', 'silver', 'gold', 'platinum'];
const APPLIES_TO_OPTIONS = [
  { value: 'all', label: 'All Colleges' },
  { value: 'tnea', label: 'TNEA Colleges Only' },
  { value: 'josaa', label: 'JoSAA Colleges Only' },
];

export default function LeadWindowsPage() {
  const [windows, setWindows] = useState<LeadWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    applies_to: 'all',
    eligible_tiers: ['silver', 'gold', 'platinum'],
  });

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/lead-windows')
      .then((r) => r.json())
      .then((j) => setWindows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: string, current: boolean) => {
    const res = await fetch('/api/college-hub/lead-windows', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionMsg(`Error: ${json.error}`);
    } else {
      setActionMsg(!current ? 'Lead window activated. The "I\'m Interested" button is now visible on eligible colleges.' : 'Lead window deactivated.');
    }
    load();
  };

  const handleCreate = async () => {
    if (!form.name || !form.start_date || !form.end_date) {
      setErrorMsg('Name, Start Date, and End Date are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/college-hub/lead-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setActionMsg('Lead window created. Activate it when ready to open lead capture.');
      setOpen(false);
      setForm({ name: '', description: '', start_date: '', end_date: '', applies_to: 'all', eligible_tiers: ['silver', 'gold', 'platinum'] });
      load();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create window.');
    } finally {
      setSaving(false);
    }
  };

  const toggleTier = (tier: string) => {
    setForm((f) => ({
      ...f,
      eligible_tiers: f.eligible_tiers.includes(tier)
        ? f.eligible_tiers.filter((t) => t !== tier)
        : [...f.eligible_tiers, tier],
    }));
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#0369a1',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <WindowIcon sx={{ color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700}>Lead Windows</Typography>
            <Typography variant="caption" color="text.secondary">
              Control when the &quot;I&apos;m Interested&quot; button is visible on college pages
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#0369a1', '&:hover': { bgcolor: '#0284c7' } }}
        >
          Create Window
        </Button>
      </Stack>

      {actionMsg && (
        <Alert
          severity={actionMsg.startsWith('Error') ? 'error' : 'success'}
          onClose={() => setActionMsg('')}
          sx={{ mb: 2 }}
        >
          {actionMsg}
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && windows.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <WindowIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            No lead windows yet. Create one to control when colleges can receive leads.
          </Typography>
        </Paper>
      )}

      <Stack gap={2}>
        {windows.map((w) => (
          <Paper
            key={w.id}
            variant="outlined"
            sx={{
              p: 2.5, borderRadius: 2,
              borderColor: w.is_active ? 'success.main' : 'divider',
              borderWidth: w.is_active ? 2 : 1,
            }}
          >
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              gap={2}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {w.name}
                  </Typography>
                  <Chip
                    label={w.is_active ? 'Active' : 'Inactive'}
                    size="small"
                    color={w.is_active ? 'success' : 'default'}
                  />
                </Stack>
                {w.description && (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    {w.description}
                  </Typography>
                )}
                <Stack direction="row" gap={2} flexWrap="wrap">
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <CalendarTodayIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {new Date(w.start_date).toLocaleDateString('en-IN')} to {new Date(w.end_date).toLocaleDateString('en-IN')}
                    </Typography>
                  </Stack>
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <PublicIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                    <Typography variant="caption" color="text.secondary">
                      {APPLIES_TO_OPTIONS.find((o) => o.value === w.applies_to)?.label ?? w.applies_to}
                    </Typography>
                  </Stack>
                </Stack>
                <Stack direction="row" gap={0.5} sx={{ mt: 1 }} flexWrap="wrap">
                  {w.eligible_tiers.map((t) => (
                    <Chip key={t} label={t} size="small" variant="outlined" />
                  ))}
                </Stack>
              </Box>
              <Button
                variant={w.is_active ? 'outlined' : 'contained'}
                color={w.is_active ? 'error' : 'success'}
                size="small"
                onClick={() => toggleActive(w.id, w.is_active)}
                sx={{ flexShrink: 0, minWidth: 110 }}
              >
                {w.is_active ? 'Deactivate' : 'Activate'}
              </Button>
            </Stack>
          </Paper>
        ))}
      </Stack>

      {/* Create Window Dialog */}
      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Lead Window</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
            <TextField
              label="Window Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g. TNEA 2026 Admission Season"
            />
            <TextField
              label="Description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Brief note about this window for internal reference"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Start Date *"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                label="End Date *"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>
            <TextField
              select
              label="Applies To"
              value={form.applies_to}
              onChange={(e) => setForm((f) => ({ ...f, applies_to: e.target.value }))}
              fullWidth
              size="small"
            >
              {APPLIES_TO_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
            <Box>
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Eligible Tiers (colleges with these tiers will show the button)
              </Typography>
              <FormGroup row>
                {TIER_OPTIONS.map((tier) => (
                  <FormControlLabel
                    key={tier}
                    control={
                      <Switch
                        size="small"
                        checked={form.eligible_tiers.includes(tier)}
                        onChange={() => toggleTier(tier)}
                      />
                    }
                    label={<Typography variant="caption" sx={{ textTransform: 'capitalize' }}>{tier}</Typography>}
                  />
                ))}
              </FormGroup>
            </Box>
            <Alert severity="info" sx={{ py: 0.5 }}>
              New windows are created inactive. Activate them when the admission season begins.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            sx={{ bgcolor: '#0369a1', '&:hover': { bgcolor: '#0284c7' } }}
          >
            {saving ? <CircularProgress size={16} /> : 'Create Window'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
