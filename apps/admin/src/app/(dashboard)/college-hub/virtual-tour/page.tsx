'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Stack,
  TextField,
  Button,
  IconButton,
  Alert,
  Divider,
  Chip,
  CircularProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import TourIcon from '@mui/icons-material/Tour';

interface VirtualTourScene {
  id: string;
  label: string;
  imageUrl: string;
  hotspots?: Array<{
    pitch: number;
    yaw: number;
    text: string;
    targetScene?: string;
  }>;
}

interface CollegeOption {
  id: string;
  name: string;
  short_name: string | null;
  neram_tier: string;
}

function generateSceneId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || `scene-${Date.now()}`;
}

export default function VirtualTourAdminPage() {
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [selectedCollegeId, setSelectedCollegeId] = useState('');
  const [scenes, setScenes] = useState<VirtualTourScene[]>([]);
  const [collegeName, setCollegeName] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingColleges, setFetchingColleges] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadColleges() {
      try {
        const res = await fetch('/api/college-hub/colleges?tier=platinum&limit=100');
        const data = await res.json();
        setColleges(data.colleges || []);
      } catch {
        setError('Failed to load colleges. Refresh the page.');
      } finally {
        setFetchingColleges(false);
      }
    }
    loadColleges();
  }, []);

  useEffect(() => {
    if (!selectedCollegeId) return;

    setLoading(true);
    setError('');
    setSuccess(false);
    setScenes([]);

    fetch(`/api/college-hub/virtual-tour?college_id=${selectedCollegeId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.college) {
          setCollegeName(data.college.short_name || data.college.name);
          setScenes(data.college.virtual_tour_scenes || []);
        }
      })
      .catch(() => setError('Failed to load virtual tour data.'))
      .finally(() => setLoading(false));
  }, [selectedCollegeId]);

  const addScene = () => {
    setScenes((prev) => [
      ...prev,
      { id: `scene-${Date.now()}`, label: '', imageUrl: '' },
    ]);
  };

  const updateScene = (index: number, field: keyof VirtualTourScene, value: string) => {
    setScenes((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        const updated = { ...s, [field]: value };
        if (field === 'label') {
          updated.id = generateSceneId(value);
        }
        return updated;
      })
    );
  };

  const removeScene = (index: number) => {
    setScenes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setError('');
    setSuccess(false);

    for (const scene of scenes) {
      if (!scene.label.trim()) {
        setError('All scenes must have a label.');
        return;
      }
      if (!scene.imageUrl.trim()) {
        setError('All scenes must have an image URL.');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch('/api/college-hub/virtual-tour', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: selectedCollegeId,
          virtual_tour_scenes: scenes.length > 0 ? scenes : null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save. Please try again.');
      } else {
        setSuccess(true);
        setScenes(data.college.virtual_tour_scenes || []);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', px: { xs: 2, sm: 3 }, py: 3 }}>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <TourIcon sx={{ fontSize: 28, color: 'primary.main' }} />
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Virtual Campus Tour
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Add 360-degree panoramic scenes for Platinum-tier colleges.
          </Typography>
        </Box>
      </Stack>

      {/* College selector */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2, mb: 3 }}>
        <FormControl fullWidth size="small" disabled={fetchingColleges}>
          <InputLabel>Select Platinum College</InputLabel>
          <Select
            value={selectedCollegeId}
            onChange={(e) => setSelectedCollegeId(e.target.value)}
            label="Select Platinum College"
          >
            {colleges.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.short_name || c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {fetchingColleges && (
          <Stack direction="row" alignItems="center" gap={1} sx={{ mt: 1.5 }}>
            <CircularProgress size={14} />
            <Typography variant="caption" color="text.secondary">
              Loading colleges...
            </Typography>
          </Stack>
        )}
        {!fetchingColleges && colleges.length === 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            No Platinum-tier colleges found.
          </Typography>
        )}
      </Paper>

      {loading && (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress size={32} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
            Loading tour data...
          </Typography>
        </Box>
      )}

      {selectedCollegeId && !loading && (
        <>
          {success && (
            <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(false)}>
              Virtual tour scenes saved for {collegeName}.
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
              {error}
            </Alert>
          )}

          <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                Tour Scenes
                {scenes.length > 0 && (
                  <Chip
                    label={`${scenes.length} scene${scenes.length === 1 ? '' : 's'}`}
                    size="small"
                    sx={{ ml: 1, fontSize: '0.75rem' }}
                  />
                )}
              </Typography>
              <Button
                startIcon={<AddCircleOutlineIcon />}
                size="small"
                onClick={addScene}
                variant="outlined"
                sx={{ textTransform: 'none' }}
              >
                Add Scene
              </Button>
            </Stack>

            {scenes.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 4,
                  bgcolor: '#f8fafc',
                  borderRadius: 1.5,
                  border: '2px dashed #e2e8f0',
                }}
              >
                <TourIcon sx={{ fontSize: 36, color: '#cbd5e1', mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  No scenes yet. Click "Add Scene" to get started.
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  Upload 360-degree equirectangular images to Supabase storage and paste the public URL here.
                </Typography>
              </Box>
            ) : (
              <Stack gap={2}>
                {scenes.map((scene, index) => (
                  <Box key={scene.id}>
                    {index > 0 && <Divider sx={{ mb: 2 }} />}
                    <Stack direction="row" alignItems="flex-start" gap={1.5}>
                      <Box
                        sx={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          mt: 0.5,
                        }}
                      >
                        {index + 1}
                      </Box>
                      <Box flex={1}>
                        <Stack gap={1.5}>
                          <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                            <TextField
                              label="Scene Label"
                              placeholder="e.g. Main Entrance"
                              size="small"
                              value={scene.label}
                              onChange={(e) => updateScene(index, 'label', e.target.value)}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              label="Scene ID (auto)"
                              size="small"
                              value={scene.id}
                              InputProps={{ readOnly: true }}
                              sx={{ flex: 1 }}
                            />
                          </Stack>
                          <TextField
                            label="360-degree Image URL"
                            placeholder="https://zdnypksjqnhtiblwdaic.supabase.co/storage/v1/object/public/..."
                            size="small"
                            fullWidth
                            value={scene.imageUrl}
                            onChange={(e) => updateScene(index, 'imageUrl', e.target.value)}
                            helperText="Upload equirectangular (2:1 aspect ratio) panoramic image to Supabase storage and paste the public URL."
                          />
                        </Stack>
                      </Box>
                      <IconButton
                        onClick={() => removeScene(index)}
                        size="small"
                        aria-label="Remove scene"
                        sx={{ color: 'error.main', flexShrink: 0 }}
                      >
                        <DeleteOutlineIcon />
                      </IconButton>
                    </Stack>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>

          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2.5 }}>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
              onClick={handleSave}
              disabled={saving}
              sx={{ textTransform: 'none', fontWeight: 600, minHeight: 42, px: 3 }}
            >
              {saving ? 'Saving...' : 'Save Virtual Tour'}
            </Button>
          </Stack>
        </>
      )}
    </Box>
  );
}
