'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Skeleton,
  Snackbar,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import BuildIcon from '@mui/icons-material/Build';
import FitnessCenterIcon from '@mui/icons-material/FitnessCenter';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface Resource {
  id: string;
  title: string;
  url: string;
  type: string; // video | practice | reference | tool
  sort_order?: number;
}

const TYPE_CONFIG: Record<string, { label: string; color: 'primary' | 'secondary' | 'info' | 'warning'; icon: React.ReactNode }> = {
  video: { label: 'Video', color: 'primary', icon: <VideoLibraryIcon fontSize="small" /> },
  practice: { label: 'Practice', color: 'secondary', icon: <FitnessCenterIcon fontSize="small" /> },
  reference: { label: 'Reference', color: 'info', icon: <MenuBookIcon fontSize="small" /> },
  tool: { label: 'Tool', color: 'warning', icon: <BuildIcon fontSize="small" /> },
};

const TYPE_ORDER = ['video', 'practice', 'reference', 'tool'];

export default function ResourceList({ planId }: { planId: string }) {
  const { getToken } = useNexusAuthContext();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', type: 'reference' });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchResources = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/course-plans/${planId}/resources`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setResources(data.resources || []);
      }
    } catch (err) {
      console.error('Failed to load resources:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  const handleAdd = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/course-plans/${planId}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: form.title.trim(),
          url: form.url.trim(),
          type: form.type,
        }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Resource added', severity: 'success' });
        setDialogOpen(false);
        setForm({ title: '', url: '', type: 'reference' });
        fetchResources();
      } else {
        const data = await res.json().catch(() => ({}));
        setSnackbar({ open: true, message: data.error || 'Failed to add', severity: 'error' });
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to add resource', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (resourceId: string) => {
    // Visual removal only (no delete API yet)
    setResources((prev) => prev.filter((r) => r.id !== resourceId));
    setSnackbar({ open: true, message: 'Resource removed (locally)', severity: 'success' });
  };

  // Group resources by type
  const grouped = TYPE_ORDER.reduce<Record<string, Resource[]>>((acc, type) => {
    const items = resources.filter((r) => r.type === type);
    if (items.length > 0) acc[type] = items;
    return acc;
  }, {});

  // Any resources with unknown types
  const unknownResources = resources.filter((r) => !TYPE_ORDER.includes(r.type));
  if (unknownResources.length > 0) {
    grouped['other'] = unknownResources;
  }

  if (loading) {
    return (
      <Box>
        {[0, 1, 2].map((i) => (
          <Box key={i} sx={{ mb: 2 }}>
            <Skeleton variant="text" width={100} height={28} sx={{ mb: 1 }} />
            <Skeleton variant="rounded" height={48} sx={{ mb: 0.5 }} />
            <Skeleton variant="rounded" height={48} />
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Study Resources ({resources.length})
        </Typography>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialogOpen(true)}
          sx={{ textTransform: 'none', minHeight: 40 }}
        >
          Add Resource
        </Button>
      </Box>

      {resources.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="body2" color="text.secondary">
            No resources yet. Add study materials for your students.
          </Typography>
        </Box>
      )}

      {/* Grouped Resource List */}
      {Object.entries(grouped).map(([type, items]) => {
        const config = TYPE_CONFIG[type] || { label: type, color: 'default' as const, icon: null };
        return (
          <Box key={type} sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              {config.icon}
              <Typography variant="subtitle2" sx={{ fontWeight: 700, textTransform: 'capitalize' }}>
                {config.label || type}
              </Typography>
              <Chip label={items.length} size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
            </Box>
            <List disablePadding>
              {items.map((resource) => (
                <ListItem
                  key={resource.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1.5,
                    mb: 0.75,
                    px: 2,
                    py: 1,
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                  secondaryAction={
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => handleDelete(resource.id)}
                      sx={{ width: 36, height: 36 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }
                >
                  <ListItemText
                    primary={
                      <Box
                        component="a"
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          color: 'primary.main',
                          textDecoration: 'none',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          '&:hover': { textDecoration: 'underline' },
                        }}
                      >
                        {resource.title}
                        <OpenInNewIcon sx={{ fontSize: 14 }} />
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        );
      })}

      {/* Add Resource Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700 }}>Add Resource</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <TextField
            label="Title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            fullWidth
            sx={{ mb: 2 }}
            required
          />
          <TextField
            label="URL"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            fullWidth
            sx={{ mb: 2 }}
            required
            placeholder="https://..."
          />
          <FormControl fullWidth>
            <InputLabel>Type</InputLabel>
            <Select
              value={form.type}
              label="Type"
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <MenuItem value="video">Video</MenuItem>
              <MenuItem value="practice">Practice</MenuItem>
              <MenuItem value="reference">Reference</MenuItem>
              <MenuItem value="tool">Tool</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={saving || !form.title.trim() || !form.url.trim()}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {saving ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
