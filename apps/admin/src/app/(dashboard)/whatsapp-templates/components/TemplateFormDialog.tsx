'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
  Stack,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { extractPlaceholders } from '@/lib/whatsapp-templates/placeholders';
import MessagePreview from './MessagePreview';

interface WaCategory {
  id: string;
  name: string;
}

interface WaTemplate {
  id: string;
  category_id: string;
  title: string;
  body: string;
  sort_order: number;
}

interface Props {
  open: boolean;
  template: WaTemplate | null;
  categories: WaCategory[];
  onClose: () => void;
  onSaved: () => void;
}

export default function TemplateFormDialog({ open, template, categories, onClose, onSaved }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [body, setBody] = useState('');
  const [sortOrder, setSortOrder] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(template?.title || '');
      setCategoryId(template?.category_id || (categories[0]?.id || ''));
      setBody(template?.body || '');
      setSortOrder(template?.sort_order || 0);
    }
  }, [open, template, categories]);

  const placeholders = useMemo(() => extractPlaceholders(body), [body]);

  const handleSave = async () => {
    if (!title.trim() || !body.trim() || !categoryId) return;
    setSaving(true);

    try {
      const payload = {
        title: title.trim(),
        category_id: categoryId,
        body: body,
        sort_order: sortOrder,
        created_by: 'admin',
      };

      if (template) {
        await fetch(`/api/whatsapp-templates/${template.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, updated_by: 'admin' }),
        });
      } else {
        await fetch('/api/whatsapp-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      onSaved();
    } catch (error) {
      console.error('Failed to save template:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{template ? 'Edit Template' : 'Add Template'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
            required
            sx={{ '& .MuiInputBase-root': { minHeight: 44 } }}
          />

          <FormControl fullWidth required>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              label="Category"
              sx={{ minHeight: 44 }}
            >
              {categories.map((cat) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Message Body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            multiline
            rows={8}
            fullWidth
            required
            helperText="Use {{placeholder_name}} for dynamic fields"
            sx={{ '& .MuiInputBase-root': { fontFamily: 'monospace' } }}
          />

          {placeholders.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {placeholders.map((p) => (
                <Chip key={p} label={`{{${p}}}`} size="small" variant="outlined" />
              ))}
            </Box>
          )}

          <TextField
            label="Sort Order"
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value))}
            sx={{ width: 120, '& .MuiInputBase-root': { minHeight: 44 } }}
          />

          {body.trim() && (
            <Box>
              <Box sx={{ fontSize: 13, fontWeight: 600, mb: 1, color: 'text.secondary' }}>
                Preview
              </Box>
              <MessagePreview body={body} values={{}} />
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || !title.trim() || !body.trim() || !categoryId}
          sx={{ minHeight: 44 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
