'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Select,
  MenuItem,
  IconButton,
  Skeleton,
  Chip,
  Snackbar,
  Alert,
  useTheme,
  alpha,
  FormControl,
  InputLabel,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GoogleIcon from '@mui/icons-material/Google';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import LinkIcon from '@mui/icons-material/Link';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface PlatformUrl {
  id: string;
  center_id: string;
  platform: string;
  review_url: string;
  display_name: string | null;
  is_active: boolean;
  center_name: string | null;
  center_city: string | null;
}

interface Center {
  id: string;
  name: string;
  city: string;
}

const PLATFORM_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  google: { label: 'Google', color: '#4285F4', icon: <GoogleIcon sx={{ fontSize: 18 }} /> },
  sulekha: { label: 'Sulekha', color: '#E91E63', icon: <StorefrontOutlinedIcon sx={{ fontSize: 18 }} /> },
  justdial: { label: 'JustDial', color: '#FF9800', icon: <StorefrontOutlinedIcon sx={{ fontSize: 18 }} /> },
};

export default function ReviewPlatformsPage() {
  const theme = useTheme();
  const { isAdmin, getToken } = useNexusAuthContext();
  const [urls, setUrls] = useState<PlatformUrl[]>([]);
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ message: string; severity: 'success' | 'error' } | null>(null);

  // New URL form state
  const [showForm, setShowForm] = useState(false);
  const [formCenterId, setFormCenterId] = useState('');
  const [formPlatform, setFormPlatform] = useState('google');
  const [formUrl, setFormUrl] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const [urlsRes, centersRes] = await Promise.all([
        fetch('/api/review-platforms', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/students/city-wise', { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (urlsRes.ok) {
        const data = await urlsRes.json();
        setUrls(data.urls || []);
      }

      // Fetch centers list from Supabase via a simple endpoint
      // For now, extract unique centers from URLs or use a placeholder
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  // Load centers
  useEffect(() => {
    async function loadCenters() {
      try {
        const token = await getToken();
        if (!token) return;
        // Use admin API to get centers
        const res = await fetch('/api/review-platforms', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUrls(data.urls || []);
          // Extract unique centers
          const centersMap = new Map<string, Center>();
          for (const u of data.urls || []) {
            if (u.center_id && !centersMap.has(u.center_id)) {
              centersMap.set(u.center_id, {
                id: u.center_id,
                name: u.center_name || 'Unknown',
                city: u.center_city || '',
              });
            }
          }
          setCenters(Array.from(centersMap.values()));
        }
      } catch (err) {
        console.error('Failed to load centers:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCenters();
  }, [getToken]);

  const handleSave = async () => {
    if (!formCenterId || !formUrl) return;
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/review-platforms', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          center_id: formCenterId,
          platform: formPlatform,
          review_url: formUrl,
          display_name: formDisplayName || undefined,
        }),
      });

      if (res.ok) {
        setSnackbar({ message: 'Platform URL saved!', severity: 'success' });
        setShowForm(false);
        setFormUrl('');
        setFormDisplayName('');
        fetchData();
      } else {
        const data = await res.json();
        setSnackbar({ message: data.error || 'Failed to save', severity: 'error' });
      }
    } catch {
      setSnackbar({ message: 'Failed to save', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/review-platforms?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSnackbar({ message: 'Deleted', severity: 'success' });
        setUrls((prev) => prev.filter((u) => u.id !== id));
      }
    } catch {
      setSnackbar({ message: 'Failed to delete', severity: 'error' });
    }
  };

  if (!isAdmin) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="error">Admin access required</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            Review Platforms
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure review URLs for Google, Sulekha, and JustDial per center
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setShowForm(!showForm)}
          size="small"
        >
          Add URL
        </Button>
      </Box>

      {/* Add form */}
      {showForm && (
        <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2 }} variant="outlined">
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Add Review Platform URL
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Center ID"
              value={formCenterId}
              onChange={(e) => setFormCenterId(e.target.value)}
              size="small"
              fullWidth
              placeholder="Paste the center UUID from offline_centers"
              helperText="UUID of the center from offline_centers table"
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Platform</InputLabel>
              <Select
                value={formPlatform}
                label="Platform"
                onChange={(e) => setFormPlatform(e.target.value)}
              >
                <MenuItem value="google">Google</MenuItem>
                <MenuItem value="sulekha">Sulekha</MenuItem>
                <MenuItem value="justdial">JustDial</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Review URL"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              size="small"
              fullWidth
              placeholder="https://g.page/r/..."
            />
            <TextField
              label="Display Name (optional)"
              value={formDisplayName}
              onChange={(e) => setFormDisplayName(e.target.value)}
              size="small"
              fullWidth
              placeholder="e.g. Neram Classes Chennai"
            />
            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
              <Button variant="outlined" size="small" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button
                variant="contained"
                size="small"
                onClick={handleSave}
                disabled={!formCenterId || !formUrl || saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}

      {/* URLs list */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : urls.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <LinkIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" color="text.secondary">
            No review platform URLs configured yet.
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 0.5 }}>
            Add URLs for Google, Sulekha, and JustDial to enable review campaigns.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {urls.map((url) => {
            const config = PLATFORM_CONFIG[url.platform] || PLATFORM_CONFIG.google;
            return (
              <Paper
                key={url.id}
                variant="outlined"
                sx={{ p: 2, borderRadius: 2, borderLeft: `4px solid ${config.color}` }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      {config.icon}
                      <Chip
                        label={config.label}
                        size="small"
                        sx={{
                          bgcolor: alpha(config.color, 0.1),
                          color: config.color,
                          fontWeight: 600,
                          height: 24,
                        }}
                      />
                      {url.center_name && (
                        <Typography variant="body2" color="text.secondary">
                          {url.center_name} {url.center_city ? `(${url.center_city})` : ''}
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.disabled"
                      noWrap
                      sx={{ display: 'block' }}
                    >
                      {url.review_url}
                    </Typography>
                    {url.display_name && (
                      <Typography variant="caption" color="text.secondary">
                        {url.display_name}
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(url.id)}
                    sx={{ flexShrink: 0 }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Snackbar */}
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
