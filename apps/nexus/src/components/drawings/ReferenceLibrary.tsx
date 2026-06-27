'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, Paper, CircularProgress, IconButton, Skeleton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Alert,
  ToggleButton, ToggleButtonGroup, ImageViewerDialog,
} from '@neram/ui';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CollectionsOutlinedIcon from '@mui/icons-material/CollectionsOutlined';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CategoryBadge from './CategoryBadge';
import type { DrawingReferenceImage } from '@neram/database/types';

const CATEGORY_OPTIONS = [
  { value: '', label: 'All' },
  { value: '2d_composition', label: '2D' },
  { value: '3d_composition', label: '3D' },
  { value: 'kit_sculpture', label: 'Kit' },
];

interface ReferenceLibraryProps {
  getToken: () => Promise<string | null>;
  /** Teachers get the Add button + per-card delete. Students browse only. */
  teacherMode?: boolean;
}

/**
 * The Reference Library: study/practice images teachers upload for students to
 * learn from. Separate from the student-work gallery. Browsable by category.
 */
export default function ReferenceLibrary({ getToken, teacherMode }: ReferenceLibraryProps) {
  const [refs, setRefs] = useState<DrawingReferenceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('');
  const [viewer, setViewer] = useState<{ src: string; name?: string | null } | null>(null);

  // Add-reference dialog state (teacher only)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchRefs = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      const res = await fetch(`/api/drawing/references?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRefs(data.references || []);
    } catch {
      setRefs([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, filterCategory]);

  useEffect(() => {
    fetchRefs();
  }, [fetchRefs]);

  const resetDialog = () => {
    setFile(null);
    setTitle('');
    setCategory('');
    setTagsInput('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!file || !title.trim()) {
      setError('Pick an image and give it a title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      // 1. Upload the image to a public drawings bucket.
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bucket', 'drawing-submissions');
      const upRes = await fetch('/api/drawing/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || 'Image upload failed');

      // 2. Create the reference row.
      const tags = tagsInput.split(',').map((t) => t.trim()).filter(Boolean);
      const res = await fetch('/api/drawing/references', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), category: category || null, tags, image_url: upData.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save reference');

      setRefs((prev) => [data.reference, ...prev]);
      setDialogOpen(false);
      resetDialog();
    } catch (e: any) {
      setError(e?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/references/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRefs((prev) => prev.filter((r) => r.id !== id));
    } catch {
      /* silent */
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
        <ToggleButtonGroup
          value={filterCategory}
          exclusive
          size="small"
          onChange={(_, val) => setFilterCategory(val ?? '')}
          aria-label="Reference category"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none', px: 1.75, minHeight: 40 } }}
        >
          {CATEGORY_OPTIONS.map((c) => (
            <ToggleButton key={c.value || 'all'} value={c.value}>
              {c.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {teacherMode && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddPhotoAlternateOutlinedIcon />}
            onClick={() => setDialogOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Add reference
          </Button>
        )}
      </Box>

      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={160} />
          ))}
        </Box>
      ) : refs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CollectionsOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">
            {teacherMode ? 'No reference images yet. Add one for students to practise from.' : 'No reference images yet.'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
          {refs.map((r) => (
            <Paper key={r.id} variant="outlined" sx={{ overflow: 'hidden', position: 'relative' }}>
              {teacherMode && (
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(r.id)}
                  aria-label="Remove reference"
                  sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1, bgcolor: 'rgba(255,255,255,0.85)', '&:hover': { bgcolor: '#fff' } }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={r.image_url}
                alt={r.title}
                onClick={() => setViewer({ src: r.image_url, name: r.title })}
                style={{ width: '100%', height: 130, objectFit: 'cover', display: 'block', background: '#f3f4f6', cursor: 'pointer' }}
              />
              <Box sx={{ p: 1 }}>
                <Typography variant="body2" fontWeight={600} noWrap title={r.title}>
                  {r.title}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {r.category && <CategoryBadge category={r.category} />}
                  {(r.tags || []).slice(0, 2).map((t) => (
                    <Chip key={t} label={t} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                  ))}
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <ImageViewerDialog
        open={!!viewer}
        onClose={() => setViewer(null)}
        src={viewer?.src || ''}
        name={viewer?.name}
      />

      {/* Add-reference dialog (teacher) */}
      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Add reference image</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Button
            component="label"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            fullWidth
            sx={{ textTransform: 'none', mb: 2, justifyContent: 'flex-start' }}
          >
            {file ? file.name : 'Choose image'}
            <input
              hidden
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile(f);
                e.target.value = '';
              }}
            />
          </Button>
          <TextField
            fullWidth
            size="small"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField
            select
            fullWidth
            size="small"
            label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            sx={{ mb: 2 }}
          >
            <MenuItem value="">None</MenuItem>
            {CATEGORY_OPTIONS.filter((c) => c.value).map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            fullWidth
            size="small"
            label="Tags (comma separated)"
            placeholder="fruits, table object"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            helperText="Helps students filter, e.g. fruits, still life"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{ textTransform: 'none' }}
          >
            {saving ? 'Adding...' : 'Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
