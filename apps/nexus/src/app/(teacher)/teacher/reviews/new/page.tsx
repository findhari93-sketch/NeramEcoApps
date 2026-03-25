'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  IconButton,
  Chip,
  Snackbar,
  Alert,
  Autocomplete,
  useTheme,
  alpha,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import GoogleIcon from '@mui/icons-material/Google';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface CityOption {
  city: string;
  student_count: number;
}

const PLATFORMS = [
  { id: 'google', label: 'Google', icon: <GoogleIcon sx={{ fontSize: 18 }} />, color: '#4285F4' },
  { id: 'sulekha', label: 'Sulekha', icon: <StorefrontOutlinedIcon sx={{ fontSize: 18 }} />, color: '#E91E63' },
  { id: 'justdial', label: 'JustDial', icon: <StorefrontOutlinedIcon sx={{ fontSize: 18 }} />, color: '#FF9800' },
];

export default function NewCampaignPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetCity, setTargetCity] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['google']);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // Load cities for targeting
  useEffect(() => {
    async function loadCities() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/students/city-wise', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setCities(data.cities || []);
        }
      } catch (err) {
        console.error('Failed to load cities:', err);
      }
    }
    loadCities();
  }, [getToken]);

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  };

  const handleCreate = async () => {
    if (!name.trim() || selectedPlatforms.length === 0) return;
    setSaving(true);

    try {
      const token = await getToken();
      const res = await fetch('/api/review-campaigns', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          target_city: targetCity || undefined,
          platforms: selectedPlatforms,
          channels: ['whatsapp', 'email', 'in_app'],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSnackbar({ message: 'Campaign created!', severity: 'success' });
        // Navigate to the campaign detail page
        setTimeout(() => {
          router.push(`/teacher/reviews/${data.campaign.id}`);
        }, 500);
      } else {
        const data = await res.json();
        setSnackbar({ message: data.error || 'Failed to create', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Failed to create campaign', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const selectedCityStudents = targetCity
    ? cities.find((c) => c.city === targetCity)?.student_count || 0
    : cities.reduce((sum, c) => sum + c.student_count, 0);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/teacher/reviews')} size="small" sx={{ minWidth: 40, minHeight: 40 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
          New Review Campaign
        </Typography>
      </Box>

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* Campaign Name */}
          <TextField
            label="Campaign Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chennai Google Reviews - March 2026"
            fullWidth
            required
          />

          {/* Description */}
          <TextField
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of the campaign goal"
            fullWidth
            multiline
            rows={2}
          />

          {/* Target City */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Target City
            </Typography>
            <Autocomplete
              options={cities}
              getOptionLabel={(option) => `${option.city} (${option.student_count} students)`}
              value={cities.find((c) => c.city === targetCity) || null}
              onChange={(_, val) => setTargetCity(val?.city || null)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="All cities (leave empty to target all)"
                  size="small"
                />
              )}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {targetCity
                ? `${selectedCityStudents} students in ${targetCity}`
                : `${selectedCityStudents} total students across all cities`}
            </Typography>
          </Box>

          {/* Platforms */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              Review Platforms *
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {PLATFORMS.map((p) => {
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <Chip
                    key={p.id}
                    icon={p.icon}
                    label={p.label}
                    onClick={() => togglePlatform(p.id)}
                    variant={isSelected ? 'filled' : 'outlined'}
                    sx={{
                      height: 40,
                      px: 1,
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      bgcolor: isSelected ? alpha(p.color, 0.15) : 'transparent',
                      color: isSelected ? p.color : 'text.secondary',
                      borderColor: isSelected ? p.color : undefined,
                      '&:hover': {
                        bgcolor: alpha(p.color, 0.1),
                      },
                    }}
                  />
                );
              })}
            </Box>
            {selectedPlatforms.length === 0 && (
              <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                Select at least one platform
              </Typography>
            )}
          </Box>

          {/* Channels info */}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 600 }}>
              Notification Channels
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.75 }}>
              <Chip label="WhatsApp" size="small" variant="outlined" color="success" sx={{ height: 26 }} />
              <Chip label="Email" size="small" variant="outlined" color="primary" sx={{ height: 26 }} />
              <Chip label="In-App" size="small" variant="outlined" color="info" sx={{ height: 26 }} />
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ mt: 0.5, display: 'block' }}>
              Students will receive review requests via all three channels
            </Typography>
          </Box>

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', mt: 1 }}>
            <Button variant="outlined" onClick={() => router.push('/teacher/reviews')}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleCreate}
              disabled={!name.trim() || selectedPlatforms.length === 0 || saving}
            >
              {saving ? 'Creating...' : 'Create Campaign'}
            </Button>
          </Box>
        </Box>
      </Paper>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {snackbar ? (
          <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
            {snackbar.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
