'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  IconButton,
  Switch,
  Skeleton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import FoundationManageContent from '@/components/foundation/FoundationManageContent';

interface ModuleItem {
  id: string;
  module_id: string;
  title: string;
  item_type: 'video' | 'document' | 'quiz_paper' | 'link' | 'chapter';
  content_url: string | null;
  youtube_video_id: string | null;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ModuleDetail {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_published: boolean;
  module_type: string;
  items: ModuleItem[];
  created_at: string;
}

const ITEM_TYPES = [
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
  { value: 'quiz_paper', label: 'Quiz Paper' },
  { value: 'link', label: 'Link' },
  { value: 'chapter', label: 'Chapter' },
] as const;

// Colors resolved from theme palette at render time via getItemTypeConfig()
const ITEM_TYPE_ICONS: Record<string, React.ReactNode> = {
  video: <OndemandVideoOutlinedIcon sx={{ fontSize: '1rem' }} />,
  document: <DescriptionOutlinedIcon sx={{ fontSize: '1rem' }} />,
  quiz_paper: <QuizOutlinedIcon sx={{ fontSize: '1rem' }} />,
  link: <LinkOutlinedIcon sx={{ fontSize: '1rem' }} />,
  chapter: <MenuBookOutlinedIcon sx={{ fontSize: '1rem' }} />,
};

const ITEM_TYPE_PALETTE_KEY: Record<string, 'error' | 'info' | 'primary' | 'secondary' | 'warning'> = {
  video: 'error',
  document: 'info',
  quiz_paper: 'primary',
  link: 'secondary',
  chapter: 'warning',
};

function getTypeLabel(type: string): string {
  const found = ITEM_TYPES.find((t) => t.value === type);
  return found ? found.label : type;
}

export default function ModuleDetailPage() {
  const theme = useTheme();
  const router = useRouter();
  const params = useParams();
  const moduleId = params.id as string;
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [moduleData, setModuleData] = useState<ModuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Add item dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({
    title: '',
    item_type: 'video' as string,
  });

  // Edit item dialog
  const [editItem, setEditItem] = useState<ModuleItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    item_type: 'video' as string,
    content_url: '',
    youtube_video_id: '',
  });

  // Delete item
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  // Delete module
  const [deleteModuleOpen, setDeleteModuleOpen] = useState(false);
  const [deletingModule, setDeletingModule] = useState(false);

  // Edit module title inline
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');

  const fetchModule = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setModuleData(data.module);
        setTitleValue(data.module.title);
        setDescriptionValue(data.module.description || '');
      }
    } catch (err) {
      console.error('Failed to load module:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, moduleId]);

  useEffect(() => {
    if (!authLoading) fetchModule();
  }, [authLoading, fetchModule]);

  // Toggle publish
  const handleTogglePublish = async () => {
    if (!moduleData) return;
    const newValue = !moduleData.is_published;
    // Optimistic update
    setModuleData((prev) => (prev ? { ...prev, is_published: newValue } : prev));
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: newValue }),
      });
      if (!res.ok) {
        // Revert on failure
        setModuleData((prev) => (prev ? { ...prev, is_published: !newValue } : prev));
      }
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      setModuleData((prev) => (prev ? { ...prev, is_published: !newValue } : prev));
    }
  };

  // Save title/description
  const handleSaveTitle = async () => {
    if (!moduleData || !titleValue.trim()) return;
    setEditingTitle(false);
    const prevTitle = moduleData.title;
    const prevDesc = moduleData.description;
    setModuleData((prev) =>
      prev ? { ...prev, title: titleValue.trim(), description: descriptionValue.trim() || null } : prev
    );
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleValue.trim(),
          description: descriptionValue.trim() || null,
        }),
      });
      if (!res.ok) {
        setModuleData((prev) => (prev ? { ...prev, title: prevTitle, description: prevDesc } : prev));
      }
    } catch (err) {
      console.error('Failed to update module:', err);
      setModuleData((prev) => (prev ? { ...prev, title: prevTitle, description: prevDesc } : prev));
    }
  };

  // Add item
  const handleAddItem = async () => {
    if (!newItem.title.trim() || !newItem.item_type) return;
    setAddingItem(true);
    try {
      const token = await getToken();
      if (!token) return;
      const currentItems = moduleData?.items || [];
      const res = await fetch(`/api/modules/${moduleId}/items`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newItem.title.trim(),
          item_type: newItem.item_type,
          sort_order: currentItems.length,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        router.push(`/teacher/modules/${moduleId}/items/${data.item.id}`);
      }
    } catch (err) {
      console.error('Failed to add item:', err);
    } finally {
      setAddingItem(false);
    }
  };

  // Edit item
  const handleOpenEditItem = (item: ModuleItem) => {
    setEditItem(item);
    setEditForm({
      title: item.title,
      item_type: item.item_type,
      content_url: item.content_url || '',
      youtube_video_id: item.youtube_video_id || '',
    });
    setEditOpen(true);
  };

  const handleSaveEditItem = async () => {
    if (!editItem || !editForm.title.trim()) return;
    setEditingItem(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${editItem.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editForm.title.trim(),
          item_type: editForm.item_type,
          content_url: editForm.content_url.trim() || null,
          youtube_video_id: editForm.item_type === 'video' ? (editForm.youtube_video_id.trim() || null) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setModuleData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.map((it) => (it.id === editItem.id ? data.item : it)),
              }
            : prev
        );
        setEditOpen(false);
        setEditItem(null);
      }
    } catch (err) {
      console.error('Failed to update item:', err);
    } finally {
      setEditingItem(false);
    }
  };

  // Delete item
  const handleDeleteItem = async () => {
    if (!deleteItemId) return;
    setDeletingItem(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}/items/${deleteItemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setModuleData((prev) =>
          prev ? { ...prev, items: prev.items.filter((it) => it.id !== deleteItemId) } : prev
        );
        setDeleteItemId(null);
      }
    } catch (err) {
      console.error('Failed to delete item:', err);
    } finally {
      setDeletingItem(false);
    }
  };

  // Delete module
  const handleDeleteModule = async () => {
    setDeletingModule(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/modules/${moduleId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        router.push('/teacher/modules');
      }
    } catch (err) {
      console.error('Failed to delete module:', err);
    } finally {
      setDeletingModule(false);
    }
  };

  // 404
  if (notFound) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          Module not found
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
          This module may have been deleted or does not exist.
        </Typography>
        <Button variant="outlined" onClick={() => router.push('/teacher/modules')} sx={{ textTransform: 'none' }}>
          Back to Modules
        </Button>
      </Box>
    );
  }

  // Loading
  if (loading) {
    return (
      <Box>
        <Skeleton variant="text" width={120} height={24} sx={{ mb: 1 }} />
        <Skeleton variant="text" width={280} height={36} sx={{ mb: 0.5 }} />
        <Skeleton variant="text" width={200} height={20} sx={{ mb: 3 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 2, mb: 1.5 }} />
        ))}
      </Box>
    );
  }

  if (!moduleData) return null;

  const borderColor = moduleData.color || theme.palette.primary.main;

  return (
    <Box sx={{ overflow: 'hidden' }}>
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Modules', href: '/teacher/modules' },
          { label: moduleData.title },
        ]}
        title=""
      />

      {/* Module info section */}
      <Paper
        elevation={0}
        sx={{
          p: 2.5,
          mb: 3,
          borderRadius: 2.5,
          border: `1px solid ${theme.palette.divider}`,
          borderLeft: `4px solid ${borderColor}`,
        }}
      >
        {editingTitle ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              size="small"
              fullWidth
              label="Title"
              autoFocus
            />
            <TextField
              value={descriptionValue}
              onChange={(e) => setDescriptionValue(e.target.value)}
              size="small"
              fullWidth
              label="Description"
              multiline
              rows={2}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                size="small"
                onClick={handleSaveTitle}
                disabled={!titleValue.trim()}
                sx={{ textTransform: 'none' }}
              >
                Save
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setEditingTitle(false);
                  setTitleValue(moduleData.title);
                  setDescriptionValue(moduleData.description || '');
                }}
                sx={{ textTransform: 'none' }}
              >
                Cancel
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, overflow: 'hidden' }}>
            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, minWidth: 0 }}>
                {moduleData.icon && (
                  <span className="material-icons" style={{ fontSize: '1.5rem', lineHeight: 1, flexShrink: 0 }}>{moduleData.icon}</span>
                )}
                <Typography variant="h6" noWrap sx={{ fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.25rem' }, minWidth: 0 }}>
                  {moduleData.title}
                </Typography>
                <IconButton
                  size="small"
                  onClick={() => setEditingTitle(true)}
                  sx={{ color: 'text.secondary', ml: 0.5, flexShrink: 0 }}
                >
                  <EditOutlinedIcon sx={{ fontSize: '1rem' }} />
                </IconButton>
              </Box>
              {moduleData.description && (
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                  {moduleData.description}
                </Typography>
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  {moduleData.items.length} item{moduleData.items.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
            </Box>

            {/* Publish toggle */}
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <Switch
                checked={moduleData.is_published}
                onChange={handleTogglePublish}
                size="small"
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', mt: -0.25 }}>
                {moduleData.is_published ? 'Published' : 'Draft'}
              </Typography>
            </Box>
          </Box>
        )}
      </Paper>

      {/* Foundation module: show rich chapter management */}
      {moduleData.module_type === 'foundation' ? (
        <FoundationManageContent
          hideHeader
          chapterLinkPrefix={`/teacher/modules/${moduleId}/chapters`}
        />
      ) : (
        <>
          {/* Items list */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
              Items
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setAddOpen(true)}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Add Item
            </Button>
          </Box>

          {moduleData.items.length === 0 ? (
            <Paper
              sx={{
                p: 4,
                textAlign: 'center',
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
              }}
            >
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                No items in this module yet. Add videos, documents, quizzes, or links.
              </Typography>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={() => setAddOpen(true)}
                sx={{ textTransform: 'none' }}
              >
                Add First Item
              </Button>
            </Paper>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {moduleData.items.map((item) => {
                const paletteKey = ITEM_TYPE_PALETTE_KEY[item.item_type] || 'info';
                const itemColor = theme.palette[paletteKey].main;
                const itemIcon = ITEM_TYPE_ICONS[item.item_type] || ITEM_TYPE_ICONS.link;
                return (
                  <Paper
                    key={item.id}
                    elevation={0}
                    onClick={() => router.push(`/teacher/modules/${moduleId}/items/${item.id}`)}
                    sx={{
                      p: 2,
                      borderRadius: 2,
                      border: `1px solid ${theme.palette.divider}`,
                      cursor: 'pointer',
                      transition: 'border-color 200ms',
                      '&:hover': { borderColor: alpha(itemColor, 0.5) },
                    }}
                  >
                    {/* Top row: icon + title + type chip + actions */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, overflow: 'hidden' }}>
                      {/* Type icon */}
                      <Box
                        sx={{
                          width: 34,
                          height: 34,
                          borderRadius: 1.5,
                          bgcolor: alpha(itemColor, 0.1),
                          color: itemColor,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {itemIcon}
                      </Box>

                      {/* Title + type chip */}
                      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden' }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: { xs: '0.85rem', sm: '0.9rem' }, minWidth: 0 }} noWrap>
                          {item.title}
                        </Typography>
                        <Chip
                          label={getTypeLabel(item.item_type)}
                          size="small"
                          sx={{
                            height: 20,
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            bgcolor: alpha(itemColor, 0.1),
                            color: itemColor,
                            flexShrink: 0,
                            display: { xs: 'none', sm: 'flex' },
                          }}
                        />
                      </Box>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleOpenEditItem(item); }}
                          sx={{ color: 'text.secondary' }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={(e: React.MouseEvent) => { e.stopPropagation(); setDeleteItemId(item.id); }}
                          sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.error.main } }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Bottom row: URL or video ID (only if present) */}
                    {(item.content_url || (item.item_type === 'video' && item.youtube_video_id)) && (
                      <Box sx={{ mt: 0.75, ml: { xs: 0, sm: 5.75 }, overflow: 'hidden' }}>
                        {item.content_url && (
                          <Typography
                            variant="caption"
                            component="a"
                            href={item.content_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                            noWrap
                            sx={{
                              color: 'text.secondary',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.25,
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontSize: '0.7rem',
                              '&:hover': { color: 'primary.main', textDecoration: 'underline' },
                            }}
                          >
                            {item.content_url.length > 45
                              ? item.content_url.substring(0, 45) + '...'
                              : item.content_url}
                            <OpenInNewIcon sx={{ fontSize: '0.65rem', ml: 0.25, flexShrink: 0 }} />
                          </Typography>
                        )}
                        {item.item_type === 'video' && item.youtube_video_id && (
                          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.7rem', display: 'block' }}>
                            YT: {item.youtube_video_id}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Paper>
                );
              })}
            </Box>
          )}

          {/* Delete module section */}
          <Box sx={{ mt: 6, pt: 3, borderTop: `1px solid ${theme.palette.divider}` }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: 'error.main', mb: 1 }}>
              Danger Zone
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
              Deleting this module will permanently remove all its items. This action cannot be undone.
            </Typography>
            <Button
              variant="outlined"
              color="error"
              onClick={() => setDeleteModuleOpen(true)}
              sx={{ textTransform: 'none' }}
            >
              Delete Module
            </Button>
          </Box>
        </>
      )}

      {/* Add Item Dialog */}
      <Dialog open={addOpen} onClose={() => { setAddOpen(false); setNewItem({ title: '', item_type: 'video' }); }} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Add Item</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Title"
              placeholder="e.g. Chapter 1 - Introduction"
              value={newItem.title}
              onChange={(e) => setNewItem((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              size="small"
              required
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={newItem.item_type}
                label="Type"
                onChange={(e) => setNewItem((prev) => ({ ...prev, item_type: e.target.value }))}
              >
                {ITEM_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setAddOpen(false); setNewItem({ title: '', item_type: 'video' }); }} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAddItem}
            disabled={addingItem || !newItem.title.trim()}
            sx={{ textTransform: 'none' }}
          >
            {addingItem ? 'Creating...' : 'Create & Edit'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Item Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Edit Item</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Title"
              value={editForm.title}
              onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              size="small"
              required
            />
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select
                value={editForm.item_type}
                label="Type"
                onChange={(e) => setEditForm((prev) => ({ ...prev, item_type: e.target.value }))}
              >
                {ITEM_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Content URL"
              placeholder="https://..."
              value={editForm.content_url}
              onChange={(e) => setEditForm((prev) => ({ ...prev, content_url: e.target.value }))}
              fullWidth
              size="small"
            />
            {editForm.item_type === 'video' && (
              <TextField
                label="YouTube Video ID"
                placeholder="e.g. dQw4w9WgXcQ"
                value={editForm.youtube_video_id}
                onChange={(e) => setEditForm((prev) => ({ ...prev, youtube_video_id: e.target.value }))}
                fullWidth
                size="small"
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveEditItem}
            disabled={editingItem || !editForm.title.trim()}
            sx={{ textTransform: 'none' }}
          >
            {editingItem ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Item Confirm */}
      <Dialog open={!!deleteItemId} onClose={() => setDeleteItemId(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Item?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This will permanently remove this item from the module. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteItemId(null)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteItem}
            disabled={deletingItem}
            sx={{ textTransform: 'none' }}
          >
            {deletingItem ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Module Confirm */}
      <Dialog open={deleteModuleOpen} onClose={() => setDeleteModuleOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Module?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This will permanently delete &quot;{moduleData.title}&quot; and all {moduleData.items.length} item
            {moduleData.items.length !== 1 ? 's' : ''} within it. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteModuleOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteModule}
            disabled={deletingModule}
            sx={{ textTransform: 'none' }}
          >
            {deletingModule ? 'Deleting...' : 'Delete Module'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
