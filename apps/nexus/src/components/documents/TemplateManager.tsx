'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Skeleton,
  IconButton,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import TemplateFormDialog from './TemplateFormDialog';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  applicable_standards: string[];
  is_required: boolean;
  unlock_date: string | null;
  linked_exam: string | null;
  exam_state_threshold: string | null;
  max_file_size_mb: number;
  allowed_file_types: string[];
  sort_order: number;
  is_active: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  identity: 'Identity',
  academic: 'Academic',
  exam: 'Exam',
  photo: 'Photo',
  other: 'Other',
};

export default function TemplateManager() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/documents/templates', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleDelete = async (id: string) => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/documents/templates/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchTemplates();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleEdit = (template: Template) => {
    setEditingTemplate(template);
    setDialogOpen(true);
  };

  const handleCreate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={handleCreate}
          sx={{ textTransform: 'none' }}
        >
          New Template
        </Button>
      </Box>

      {templates.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <DescriptionOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">No templates yet.</Typography>
          <Typography variant="caption" color="text.disabled">Create templates to define which documents students should upload.</Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {templates.map((t) => (
            <Paper
              key={t.id}
              variant="outlined"
              sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 2 }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={700}>
                    {t.name}
                  </Typography>
                  {t.is_required && (
                    <Chip label="Required" size="small" color="error" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                  )}
                </Box>
                {t.description && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                    {t.description}
                  </Typography>
                )}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  <Chip
                    label={CATEGORY_LABELS[t.category] || t.category}
                    size="small"
                    sx={{ height: 22, fontSize: '0.65rem', bgcolor: alpha(theme.palette.primary.main, 0.08) }}
                  />
                  {t.applicable_standards.map((s) => (
                    <Chip key={s} label={s} size="small" sx={{ height: 22, fontSize: '0.65rem' }} />
                  ))}
                  {t.linked_exam && (
                    <Chip
                      label={`Exam: ${t.linked_exam.toUpperCase()}`}
                      size="small"
                      sx={{ height: 22, fontSize: '0.65rem', bgcolor: alpha(theme.palette.info.main, 0.1) }}
                    />
                  )}
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                <IconButton size="small" onClick={() => handleEdit(t)}>
                  <EditOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
                <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}>
                  <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      <TemplateFormDialog
        open={dialogOpen}
        template={editingTemplate}
        onClose={() => {
          setDialogOpen(false);
          setEditingTemplate(null);
        }}
        onSaved={fetchTemplates}
      />
    </Box>
  );
}
