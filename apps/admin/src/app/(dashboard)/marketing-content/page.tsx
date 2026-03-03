'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Divider,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ClearIcon from '@mui/icons-material/Clear';
import { Avatar, CircularProgress, LinearProgress } from '@neram/ui';
import CropIcon from '@mui/icons-material/Crop';
import Image from 'next/image';
import DataTable from '@/components/DataTable';
import ImageCropDialog from '@/components/crm/ImageCropDialog';
import type { ImageCropsResult } from '@/components/crm/ImageCropDialog';

interface MarketingContentItem {
  id: string;
  type: string;
  title: Record<string, string>;
  description: Record<string, string>;
  image_url: string | null;
  metadata: Record<string, unknown>;
  status: string;
  is_pinned: boolean;
  display_priority: number;
  starts_at: string | null;
  expires_at: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const CONTENT_TYPES = [
  { value: 'achievement', label: 'Achievement' },
  { value: 'important_date', label: 'Important Date' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'update', label: 'Update' },
  { value: 'broadcast', label: 'Broadcast Banner' },
];

const BROADCAST_STYLE_OPTIONS = [
  { value: 'info', label: 'Blue (Info)' },
  { value: 'success', label: 'Green (Success)' },
  { value: 'warning', label: 'Orange (Warning)' },
  { value: 'urgent', label: 'Red (Urgent)' },
];

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const EXAM_OPTIONS = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE Paper 2', label: 'JEE Paper 2' },
  { value: 'Both', label: 'Both (NATA + JEE)' },
];

const EVENT_TYPE_OPTIONS = [
  { value: 'application_deadline', label: 'Application Deadline' },
  { value: 'exam_date', label: 'Exam Date' },
  { value: 'result_date', label: 'Result Date' },
  { value: 'other', label: 'Other' },
];

const BADGE_COLOR_OPTIONS = [
  { value: 'error', label: 'Red (Urgent)' },
  { value: 'success', label: 'Green (Positive)' },
  { value: 'warning', label: 'Orange (Attention)' },
  { value: 'info', label: 'Blue (Info)' },
];

function getAcademicYears(): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const startYear = month >= 3 ? currentYear : currentYear - 1; // April = month 3
  const years: string[] = [];
  for (let i = 0; i < 5; i++) {
    const y = startYear - i;
    years.push(`${y}-${String(y + 1).slice(-2)}`);
  }
  return years;
}

const emptyForm = {
  type: 'achievement' as string,
  title_en: '',
  title_ta: '',
  description_en: '',
  description_ta: '',
  image_url: '',
  status: 'draft' as string,
  is_pinned: false,
  display_priority: 0,
  starts_at: '',
  expires_at: '',
  // Achievement metadata
  student_name: '',
  exam: 'NATA',
  score: '',
  rank: '',
  percentile: '',
  college: '',
  academic_year: getAcademicYears()[0],
  batch: '',
  student_quote_en: '',
  student_quote_ta: '',
  // Important date metadata
  target_date: '',
  original_date: '',
  is_extended: false,
  event_type: 'application_deadline',
  // Announcement metadata
  link_url: '',
  link_text: '',
  badge_text: '',
  badge_color: 'info',
  // Update metadata
  category: '',
  // Broadcast metadata
  broadcast_style: 'info',
};

const TAB_FILTERS = ['all', 'achievement', 'important_date', 'announcement', 'update', 'broadcast'] as const;
const TAB_LABELS = ['All', 'Achievements', 'Important Dates', 'Announcements', 'Updates', 'Broadcasts'];

export default function MarketingContentPage() {
  const [items, setItems] = useState<MarketingContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MarketingContentItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tabIndex, setTabIndex] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [imageCrops, setImageCrops] = useState<ImageCropsResult | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const filter = TAB_FILTERS[tabIndex];
      const params = filter !== 'all' ? `?type=${filter}` : '';
      const res = await fetch(`/api/marketing-content${params}`);
      const json = await res.json();
      setItems(json.data || []);
    } catch (error) {
      console.error('Error fetching marketing content:', error);
      setSnackbar({ open: true, message: 'Failed to load content', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [tabIndex]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate on client side
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setSnackbar({ open: true, message: 'Invalid file type. Use JPEG, PNG, WebP, or GIF.', severity: 'error' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setSnackbar({ open: true, message: 'File too large. Maximum 5MB.', severity: 'error' });
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/marketing-content/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Upload failed (HTTP ${res.status})`);
      }

      const { url } = await res.json();
      setForm((prev) => ({ ...prev, image_url: url }));
      setSnackbar({ open: true, message: 'Image uploaded successfully', severity: 'success' });
      // Auto-open crop dialog for achievements
      if (form.type === 'achievement') {
        setCropDialogOpen(true);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Upload failed';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setUploading(false);
      // Reset the input so the same file can be re-selected
      e.target.value = '';
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!form.title_en.trim()) newErrors.title_en = 'Title (English) is required';
    if (form.type === 'achievement') {
      if (!form.student_name.trim()) newErrors.student_name = 'Student name is required';
      if (!form.academic_year) newErrors.academic_year = 'Academic year is required';
    }
    if (form.type === 'important_date') {
      if (!form.target_date) newErrors.target_date = 'Target date is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleOpenDialog = (item?: MarketingContentItem) => {
    if (item) {
      setEditingItem(item);
      const meta = item.metadata || {};
      setForm({
        type: item.type,
        title_en: item.title?.en || '',
        title_ta: item.title?.ta || '',
        description_en: item.description?.en || '',
        description_ta: item.description?.ta || '',
        image_url: item.image_url || '',
        status: item.status,
        is_pinned: item.is_pinned,
        display_priority: item.display_priority,
        starts_at: item.starts_at ? item.starts_at.slice(0, 16) : '',
        expires_at: item.expires_at ? item.expires_at.slice(0, 16) : '',
        // Achievement
        student_name: (meta.student_name as string) || '',
        exam: (meta.exam as string) || 'NATA',
        score: meta.score != null ? String(meta.score) : '',
        rank: meta.rank != null ? String(meta.rank) : '',
        percentile: meta.percentile != null ? String(meta.percentile) : '',
        college: (meta.college as string) || '',
        academic_year: (meta.academic_year as string) || getAcademicYears()[0],
        batch: (meta.batch as string) || '',
        student_quote_en: (meta.student_quote as string) || '',
        student_quote_ta: (meta.student_quote_ta as string) || '',
        // Important date
        target_date: (meta.target_date as string) || '',
        original_date: (meta.original_date as string) || '',
        is_extended: (meta.is_extended as boolean) || false,
        event_type: (meta.event_type as string) || 'application_deadline',
        // Announcement
        link_url: (meta.link_url as string) || '',
        link_text: (meta.link_text as string) || '',
        badge_text: (meta.badge_text as string) || '',
        badge_color: (meta.badge_color as string) || 'info',
        // Update
        category: (meta.category as string) || '',
        // Broadcast
        broadcast_style: (meta.style as string) || 'info',
      });
    } else {
      setEditingItem(null);
      setForm(emptyForm);
    }
    setErrors({});
    // Load existing image crops if editing an achievement
    if (item && item.type === 'achievement' && item.metadata?.image_crops) {
      setImageCrops(item.metadata.image_crops as ImageCropsResult);
    } else {
      setImageCrops(null);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
    setErrors({});
    setImageCrops(null);
  };

  const buildPayload = () => {
    const title: Record<string, string> = { en: form.title_en };
    if (form.title_ta.trim()) title.ta = form.title_ta;

    const description: Record<string, string> = {};
    if (form.description_en.trim()) description.en = form.description_en;
    if (form.description_ta.trim()) description.ta = form.description_ta;

    let metadata: Record<string, unknown> = {};

    if (form.type === 'achievement') {
      metadata = {
        student_name: form.student_name,
        exam: form.exam,
        score: form.score ? Number(form.score) : null,
        rank: form.rank ? Number(form.rank) : null,
        percentile: form.percentile ? Number(form.percentile) : null,
        college: form.college || null,
        academic_year: form.academic_year,
        batch: form.batch || null,
        student_quote: form.student_quote_en || null,
        student_quote_ta: form.student_quote_ta || null,
        image_crops: imageCrops || null,
      };
    } else if (form.type === 'important_date') {
      metadata = {
        target_date: form.target_date,
        original_date: form.original_date || null,
        is_extended: form.is_extended,
        event_type: form.event_type,
      };
    } else if (form.type === 'announcement') {
      metadata = {
        link_url: form.link_url || null,
        link_text: form.link_text || null,
        badge_text: form.badge_text || null,
        badge_color: form.badge_color || null,
      };
    } else if (form.type === 'update') {
      metadata = {
        category: form.category || null,
        link_url: form.link_url || null,
      };
    } else if (form.type === 'broadcast') {
      metadata = {
        link_url: form.link_url || null,
        link_text: form.link_text || null,
        style: form.broadcast_style || 'info',
      };
    }

    return {
      type: form.type,
      title,
      description,
      image_url: form.image_url || null,
      metadata,
      status: form.status,
      is_pinned: form.is_pinned,
      display_priority: Number(form.display_priority) || 0,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const payload = buildPayload();

      if (editingItem) {
        const res = await fetch(`/api/marketing-content/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          let errorMessage = `Failed to update (HTTP ${res.status})`;
          try {
            const errBody = await res.json();
            if (errBody?.error) errorMessage = errBody.error;
          } catch { /* not JSON */ }
          throw new Error(errorMessage);
        }
        setSnackbar({ open: true, message: 'Content updated successfully', severity: 'success' });
      } else {
        const res = await fetch('/api/marketing-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          let errorMessage = `Failed to create (HTTP ${res.status})`;
          try {
            const errBody = await res.json();
            if (errBody?.error) errorMessage = errBody.error;
          } catch { /* not JSON */ }
          throw new Error(errorMessage);
        }
        setSnackbar({ open: true, message: 'Content created successfully', severity: 'success' });
      }

      handleCloseDialog();
      fetchItems();
    } catch (error) {
      console.error('Error saving marketing content:', error);
      const msg = error instanceof Error ? error.message : 'Failed to save';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this content?')) return;
    try {
      const res = await fetch(`/api/marketing-content/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        let errorMessage = `Failed to delete (HTTP ${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) errorMessage = errBody.error;
        } catch { /* not JSON */ }
        throw new Error(errorMessage);
      }
      setSnackbar({ open: true, message: 'Content deleted successfully', severity: 'success' });
      fetchItems();
    } catch (error) {
      console.error('Error deleting marketing content:', error);
      const msg = error instanceof Error ? error.message : 'Failed to delete';
      setSnackbar({ open: true, message: msg, severity: 'error' });
    }
  };

  const typeChipColor = (type: string) => {
    switch (type) {
      case 'achievement': return 'warning';
      case 'important_date': return 'error';
      case 'announcement': return 'info';
      case 'update': return 'default';
      case 'broadcast': return 'secondary';
      default: return 'default';
    }
  };

  const statusChipColor = (status: string) => {
    switch (status) {
      case 'published': return 'success';
      case 'draft': return 'default';
      case 'archived': return 'warning';
      default: return 'default';
    }
  };

  const columns = [
    { field: 'display_priority', headerName: 'Priority', width: 80 },
    {
      field: 'title',
      headerName: 'Title',
      width: 250,
      renderCell: (params: any) => (
        <Typography variant="body2" noWrap>
          {params.value?.en || '(no title)'}
        </Typography>
      ),
    },
    {
      field: 'type',
      headerName: 'Type',
      width: 140,
      renderCell: (params: any) => (
        <Chip
          label={CONTENT_TYPES.find((t) => t.value === params.value)?.label || params.value}
          size="small"
          color={typeChipColor(params.value) as any}
          variant="outlined"
        />
      ),
    },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (params: any) => (
        <Chip
          label={params.value}
          size="small"
          color={statusChipColor(params.value) as any}
        />
      ),
    },
    {
      field: 'is_pinned',
      headerName: 'Pinned',
      width: 80,
      renderCell: (params: any) => (
        params.value ? <Chip label="Yes" size="small" color="primary" variant="outlined" /> : null
      ),
    },
    {
      field: 'metadata',
      headerName: 'Details',
      width: 200,
      renderCell: (params: any) => {
        const row = params.row as MarketingContentItem;
        const meta = row.metadata || {};
        if (row.type === 'achievement') {
          return (
            <Typography variant="body2" noWrap>
              {(meta.student_name as string) || ''} - {(meta.exam as string) || ''} ({(meta.academic_year as string) || ''})
            </Typography>
          );
        }
        if (row.type === 'important_date') {
          return (
            <Typography variant="body2" noWrap>
              {(meta.event_type as string) || ''} - {(meta.target_date as string) || ''}
            </Typography>
          );
        }
        if (row.type === 'announcement') {
          return (
            <Typography variant="body2" noWrap>
              {(meta.badge_text as string) || ''} {(meta.link_url as string) ? '(has link)' : ''}
            </Typography>
          );
        }
        if (row.type === 'broadcast') {
          return (
            <Typography variant="body2" noWrap>
              Style: {(meta.style as string) || 'info'} {(meta.link_url as string) ? '(has link)' : ''}
            </Typography>
          );
        }
        return null;
      },
    },
    {
      field: 'published_at',
      headerName: 'Published',
      width: 140,
      renderCell: (params: any) => (
        <Typography variant="body2" color="text.secondary">
          {params.value ? new Date(params.value).toLocaleDateString() : '-'}
        </Typography>
      ),
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDialog(params.row);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(params.row.id);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Marketing Content
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage achievements, important dates, announcements, updates, and broadcast banners for the marketing site
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>
          Add Content
        </Button>
      </Box>

      <Tabs
        value={tabIndex}
        onChange={(_, v) => setTabIndex(v)}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {TAB_LABELS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      <DataTable rows={items} columns={columns} loading={loading} />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingItem ? 'Edit Content' : 'Add Content'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {Object.keys(errors).length > 0 && (
              <Alert severity="error" sx={{ mb: 1 }}>
                Please fix the errors below before saving.
              </Alert>
            )}

            {/* Common fields */}
            <TextField
              select
              label="Content Type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              fullWidth
              required
            >
              {CONTENT_TYPES.map((t) => (
                <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
              ))}
            </TextField>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Title (English)"
                value={form.title_en}
                onChange={(e) => setForm({ ...form, title_en: e.target.value })}
                error={!!errors.title_en}
                helperText={errors.title_en}
                fullWidth
                required
              />
              <TextField
                label="Title (Tamil)"
                value={form.title_ta}
                onChange={(e) => setForm({ ...form, title_ta: e.target.value })}
                fullWidth
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Description (English)"
                value={form.description_en}
                onChange={(e) => setForm({ ...form, description_en: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
              <TextField
                label="Description (Tamil)"
                value={form.description_ta}
                onChange={(e) => setForm({ ...form, description_ta: e.target.value })}
                fullWidth
                multiline
                rows={3}
              />
            </Box>

            {/* Image Upload */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                Image
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                {form.image_url ? (
                  <Box sx={{ position: 'relative' }}>
                    <Box sx={{ width: 80, height: 80, borderRadius: 1, overflow: 'hidden', position: 'relative' }}>
                      <Image src={form.image_url} alt="Content image" fill sizes="80px" style={{ objectFit: 'cover' }} />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => setForm({ ...form, image_url: '' })}
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        bgcolor: 'error.main',
                        color: 'white',
                        '&:hover': { bgcolor: 'error.dark' },
                        width: 24,
                        height: 24,
                      }}
                    >
                      <ClearIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ) : null}
                <Box sx={{ flexGrow: 1 }}>
                  <Button
                    variant="outlined"
                    component="label"
                    startIcon={uploading ? <CircularProgress size={18} /> : <CloudUploadIcon />}
                    disabled={uploading}
                    sx={{ textTransform: 'none' }}
                  >
                    {uploading ? 'Uploading...' : form.image_url ? 'Change Image' : 'Upload Image'}
                    <input
                      type="file"
                      hidden
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={handleImageUpload}
                    />
                  </Button>
                  <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 0.5 }}>
                    JPEG, PNG, WebP or GIF. Max 5MB.
                  </Typography>
                </Box>
              </Box>
              {uploading && <LinearProgress sx={{ mt: 1 }} />}

              {/* Crop button + previews for achievements */}
              {form.type === 'achievement' && form.image_url && (
                <Box sx={{ mt: 1.5 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    startIcon={<CropIcon />}
                    onClick={() => setCropDialogOpen(true)}
                    sx={{ textTransform: 'none', mb: 1 }}
                  >
                    {imageCrops ? 'Re-crop Image' : 'Crop for Display'}
                  </Button>
                  {imageCrops && (
                    <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
                      {imageCrops.square && (
                        <Box sx={{ textAlign: 'center' }}>
                          <Box sx={{ width: 48, height: 48, position: 'relative', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                            <Image src={imageCrops.square} alt="Square crop" fill sizes="48px" style={{ objectFit: 'cover' }} />
                          </Box>
                          <Typography variant="caption" display="block" color="text.secondary">1:1</Typography>
                        </Box>
                      )}
                      {imageCrops.banner && (
                        <Box sx={{ textAlign: 'center' }}>
                          <Box sx={{ width: 100, height: 45, position: 'relative', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                            <Image src={imageCrops.banner} alt="Banner crop" fill sizes="100px" style={{ objectFit: 'cover' }} />
                          </Box>
                          <Typography variant="caption" display="block" color="text.secondary">2.2:1</Typography>
                        </Box>
                      )}
                      {imageCrops.mobile && (
                        <Box sx={{ textAlign: 'center' }}>
                          <Box sx={{ width: 80, height: 45, position: 'relative', borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: 'divider' }}>
                            <Image src={imageCrops.mobile} alt="Mobile crop" fill sizes="80px" style={{ objectFit: 'cover' }} />
                          </Box>
                          <Typography variant="caption" display="block" color="text.secondary">16:9</Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Box>

            <Divider sx={{ my: 0.5 }} />

            {/* Achievement-specific fields */}
            {form.type === 'achievement' && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Achievement Details
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Student Name"
                    value={form.student_name}
                    onChange={(e) => setForm({ ...form, student_name: e.target.value })}
                    error={!!errors.student_name}
                    helperText={errors.student_name}
                    fullWidth
                    required
                  />
                  <TextField
                    select
                    label="Exam"
                    value={form.exam}
                    onChange={(e) => setForm({ ...form, exam: e.target.value })}
                    fullWidth
                  >
                    {EXAM_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Score"
                    type="number"
                    value={form.score}
                    onChange={(e) => setForm({ ...form, score: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Rank"
                    type="number"
                    value={form.rank}
                    onChange={(e) => setForm({ ...form, rank: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Percentile"
                    type="number"
                    value={form.percentile}
                    onChange={(e) => setForm({ ...form, percentile: e.target.value })}
                    fullWidth
                  />
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="College Admitted"
                    value={form.college}
                    onChange={(e) => setForm({ ...form, college: e.target.value })}
                    fullWidth
                    placeholder="e.g., NIT Trichy"
                  />
                  <TextField
                    select
                    label="Academic Year"
                    value={form.academic_year}
                    onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                    error={!!errors.academic_year}
                    helperText={errors.academic_year}
                    fullWidth
                    required
                  >
                    {getAcademicYears().map((y) => (
                      <MenuItem key={y} value={y}>{y}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <TextField
                  label="Batch"
                  value={form.batch}
                  onChange={(e) => setForm({ ...form, batch: e.target.value })}
                  fullWidth
                  placeholder="e.g., Year Long 2025-26"
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Student Quote (English)"
                    value={form.student_quote_en}
                    onChange={(e) => setForm({ ...form, student_quote_en: e.target.value })}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="What the student says about Neram Classes..."
                  />
                  <TextField
                    label="Student Quote (Tamil)"
                    value={form.student_quote_ta}
                    onChange={(e) => setForm({ ...form, student_quote_ta: e.target.value })}
                    fullWidth
                    multiline
                    rows={2}
                  />
                </Box>
              </>
            )}

            {/* Important date fields */}
            {form.type === 'important_date' && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Date Details
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Target Date"
                    type="datetime-local"
                    value={form.target_date}
                    onChange={(e) => setForm({ ...form, target_date: e.target.value })}
                    error={!!errors.target_date}
                    helperText={errors.target_date}
                    fullWidth
                    required
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    select
                    label="Event Type"
                    value={form.event_type}
                    onChange={(e) => setForm({ ...form, event_type: e.target.value })}
                    fullWidth
                  >
                    {EVENT_TYPE_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.is_extended}
                      onChange={(e) => setForm({ ...form, is_extended: e.target.checked })}
                    />
                  }
                  label="Date has been extended"
                />
                {form.is_extended && (
                  <TextField
                    label="Original Date"
                    type="datetime-local"
                    value={form.original_date}
                    onChange={(e) => setForm({ ...form, original_date: e.target.value })}
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="The original deadline before extension"
                  />
                )}
              </>
            )}

            {/* Announcement fields */}
            {form.type === 'announcement' && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Announcement Details
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Badge Text"
                    value={form.badge_text}
                    onChange={(e) => setForm({ ...form, badge_text: e.target.value })}
                    fullWidth
                    placeholder="e.g., NEW, OFFER, IMPORTANT"
                  />
                  <TextField
                    select
                    label="Badge Color"
                    value={form.badge_color}
                    onChange={(e) => setForm({ ...form, badge_color: e.target.value })}
                    fullWidth
                  >
                    {BADGE_COLOR_OPTIONS.map((o) => (
                      <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                  </TextField>
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Link URL"
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    fullWidth
                    placeholder="https://..."
                  />
                  <TextField
                    label="Link Text"
                    value={form.link_text}
                    onChange={(e) => setForm({ ...form, link_text: e.target.value })}
                    fullWidth
                    placeholder="e.g., Learn More, Apply Now"
                  />
                </Box>
              </>
            )}

            {/* Update fields */}
            {form.type === 'update' && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Update Details
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Category"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    fullWidth
                    placeholder="e.g., schedule, policy, feature"
                  />
                  <TextField
                    label="Link URL"
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    fullWidth
                    placeholder="https://..."
                  />
                </Box>
              </>
            )}

            {/* Broadcast Banner fields */}
            {form.type === 'broadcast' && (
              <>
                <Typography variant="subtitle2" color="text.secondary">
                  Broadcast Banner Details
                </Typography>
                <TextField
                  select
                  label="Banner Style"
                  value={form.broadcast_style}
                  onChange={(e) => setForm({ ...form, broadcast_style: e.target.value })}
                  fullWidth
                  helperText="Sets the background color of the banner"
                >
                  {BROADCAST_STYLE_OPTIONS.map((o) => (
                    <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                  ))}
                </TextField>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="Link URL (optional)"
                    value={form.link_url}
                    onChange={(e) => setForm({ ...form, link_url: e.target.value })}
                    fullWidth
                    placeholder="https://..."
                    helperText="Optional clickable link in the banner"
                  />
                  <TextField
                    label="Link Text"
                    value={form.link_text}
                    onChange={(e) => setForm({ ...form, link_text: e.target.value })}
                    fullWidth
                    placeholder="e.g., Click here, Learn more"
                    helperText="Displayed as the clickable text"
                  />
                </Box>
                <Alert severity="info" sx={{ mt: 1 }}>
                  The broadcast banner appears at the very top of the marketing website for all visitors. Use the Title field for the main message. Only one broadcast is shown at a time (highest priority).
                </Alert>
              </>
            )}

            <Divider sx={{ my: 0.5 }} />
            <Typography variant="subtitle2" color="text.secondary">
              Display Settings
            </Typography>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                select
                label="Status"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                fullWidth
              >
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>
              <TextField
                label="Priority"
                type="number"
                value={form.display_priority}
                onChange={(e) => setForm({ ...form, display_priority: parseInt(e.target.value) || 0 })}
                fullWidth
                helperText="Higher number = shown first"
              />
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Show From"
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Leave empty to show immediately when published"
              />
              <TextField
                label="Show Until"
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Leave empty to never expire"
              />
            </Box>

            <FormControlLabel
              control={
                <Switch
                  checked={form.is_pinned}
                  onChange={(e) => setForm({ ...form, is_pinned: e.target.checked })}
                />
              }
              label="Pinned (always shown at top)"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Image Crop Dialog */}
      {form.image_url && (
        <ImageCropDialog
          open={cropDialogOpen}
          imageUrl={form.image_url}
          existingCrops={imageCrops}
          onSave={(crops) => {
            setImageCrops(crops);
            setCropDialogOpen(false);
            setSnackbar({ open: true, message: 'Image crops saved', severity: 'success' });
          }}
          onClose={() => setCropDialogOpen(false)}
        />
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
