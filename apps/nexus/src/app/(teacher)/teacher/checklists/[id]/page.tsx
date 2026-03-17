'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  Tabs,
  Tab,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Collapse,
  alpha,
  useTheme,
  useMediaQuery,
  Slide,
  Divider,
  Switch,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ViewModuleOutlinedIcon from '@mui/icons-material/ViewModuleOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import VideoLibraryOutlinedIcon from '@mui/icons-material/VideoLibraryOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import React from 'react';
import { LinearProgress } from '@neram/ui';

// --- Types ---

interface Resource {
  id: string;
  resource_type: string;
  url: string;
  title?: string;
}

interface ModuleItem {
  id: string;
  title: string;
  item_type: string;
  sort_order: number;
}

interface ModuleRef {
  id: string;
  title: string;
  color: string;
  icon?: string;
  item_count: number;
  items?: ModuleItem[];
}

interface ChecklistEntry {
  id: string;
  entry_type: 'module' | 'simple_item';
  title: string | null;
  sort_order: number;
  module: ModuleRef | null;
  resources: Resource[];
}

interface ClassroomRef {
  id: string;
  name: string;
  type: string;
}

interface ChecklistDetail {
  id: string;
  title: string;
  description: string | null;
  is_published: boolean;
  entries: ChecklistEntry[];
  classrooms: ClassroomRef[];
  created_at: string;
}

interface AvailableClassroom {
  id: string;
  name: string;
  type: string;
}

interface AvailableModule {
  id: string;
  title: string;
  color: string;
  item_count: number;
  category: string;
}

// --- Helpers ---

const classroomColors: Record<string, string> = {
  nata: '#4F46E5',   // Indigo (info)
  jee: '#7C3AED',    // Purple (primary)
  revit: '#059669',  // Green (secondary)
  other: '#78716C',  // Stone (neutral)
};

function detectResourceType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'video';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png|gif|webp|svg)$/i.test(lower)) return 'image';
  if (/\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(lower)) return 'document';
  return 'link';
}

function resourceTypeIcon(type: string) {
  switch (type) {
    case 'video':
      return <VideoLibraryOutlinedIcon sx={{ fontSize: '0.85rem' }} />;
    case 'pdf':
      return <PictureAsPdfOutlinedIcon sx={{ fontSize: '0.85rem' }} />;
    case 'image':
      return <ImageOutlinedIcon sx={{ fontSize: '0.85rem' }} />;
    case 'document':
      return <ArticleOutlinedIcon sx={{ fontSize: '0.85rem' }} />;
    default:
      return <LinkOutlinedIcon sx={{ fontSize: '0.85rem' }} />;
  }
}

function resourceTypeColor(type: string): string {
  switch (type) {
    case 'video':
      return '#DC2626';   // error
    case 'pdf':
      return '#D97706';   // warning
    case 'image':
      return '#7C3AED';   // primary
    case 'document':
      return '#4F46E5';   // info
    default:
      return '#78716C';   // neutral
  }
}

// Mobile bottom-sheet transition
const SlideTransition = React.forwardRef(function Transition(
  props: any,
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// --- Component ---

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  // Core state
  const [checklist, setChecklist] = useState<ChecklistDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // Expanded modules
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  // Drag reorder visual state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Classroom assignment dialog
  const [classroomDialogOpen, setClassroomDialogOpen] = useState(false);
  const [availableClassrooms, setAvailableClassrooms] = useState<AvailableClassroom[]>([]);
  const [selectedClassroomIds, setSelectedClassroomIds] = useState<Set<string>>(new Set());
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [savingClassrooms, setSavingClassrooms] = useState(false);

  // Add entry dialog
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);
  const [entryTab, setEntryTab] = useState(0);
  const [availableModules, setAvailableModules] = useState<AvailableModule[]>([]);
  const [modulesLoading, setModulesLoading] = useState(false);
  const [addingModule, setAddingModule] = useState<string | null>(null);
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState<string>('all');

  // Simple item form
  const [simpleTitle, setSimpleTitle] = useState('');
  const [resourceUrls, setResourceUrls] = useState<string[]>(['']);
  const [savingSimpleItem, setSavingSimpleItem] = useState(false);

  // Delete checklist
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Student progress
  const [progressData, setProgressData] = useState<{
    students: {
      id: string;
      name: string;
      completedEntries: number;
      totalEntries: number;
      percentage: number;
      lastActivity: string | null;
      currentStepTitle: string | null;
      currentStepStatus: string | null;
      currentStepStartedAt: string | null;
      daysSinceLastActivity: number | null;
      isStale: boolean;
    }[];
    overall: { averageCompletion: number; totalStudents: number; staleStudents: number };
  } | null>(null);
  const [showStaleOnly, setShowStaleOnly] = useState(false);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressClassroomId, setProgressClassroomId] = useState<string | null>(null);

  // --- Fetch checklist ---
  const fetchChecklist = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/checklists/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        setNotFound(true);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setChecklist(data.checklist || data);
      }
    } catch (err) {
      console.error('Failed to load checklist:', err);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  // --- Fetch student progress for a classroom ---
  const fetchProgress = useCallback(async (classroomId: string) => {
    setProgressLoading(true);
    setProgressClassroomId(classroomId);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/checklists/${id}/progress?classroom=${classroomId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setProgressData(data);
      }
    } catch (err) {
      console.error('Failed to load progress:', err);
    } finally {
      setProgressLoading(false);
    }
  }, [id, getToken]);

  // Auto-fetch progress when checklist loads and has classrooms
  useEffect(() => {
    if (checklist && checklist.classrooms.length > 0 && !progressClassroomId) {
      fetchProgress(checklist.classrooms[0].id);
    }
  }, [checklist, progressClassroomId, fetchProgress]);

  // --- Title save ---
  const handleTitleSave = async () => {
    if (!titleDraft.trim() || !checklist) return;
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/checklists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: titleDraft.trim(), description: checklist.description }),
      });

      setChecklist((prev) => (prev ? { ...prev, title: titleDraft.trim() } : prev));
      setEditingTitle(false);
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  };

  // --- Publish toggle ---
  const handlePublishToggle = async () => {
    if (!checklist) return;
    const newVal = !checklist.is_published;
    setChecklist((prev) => (prev ? { ...prev, is_published: newVal } : prev));
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/checklists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_published: newVal }),
      });
    } catch (err) {
      console.error('Failed to toggle publish:', err);
      setChecklist((prev) => (prev ? { ...prev, is_published: !newVal } : prev));
    }
  };

  // --- Drag reorder ---
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIdx: number) => {
    e.preventDefault();
    const fromIdx = dragIdx;
    setDragIdx(null);
    setDragOverIdx(null);

    if (fromIdx === null || !checklist || fromIdx === dropIdx) return;

    const sortedEntries = [...(checklist.entries || [])].sort((a, b) => a.sort_order - b.sort_order);
    const [moved] = sortedEntries.splice(fromIdx, 1);
    sortedEntries.splice(dropIdx, 0, moved);

    const reordered = sortedEntries.map((entry, i) => ({ ...entry, sort_order: i }));
    setChecklist((prev) => (prev ? { ...prev, entries: reordered } : prev));

    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/checklists/${id}/entries/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ entries: reordered.map((entry) => ({ id: entry.id, sort_order: entry.sort_order })) }),
      });
    } catch (err) {
      console.error('Failed to reorder:', err);
    }
  };
  // --- Toggle expand ---
  const toggleExpand = (entryId: string) => {
    setExpandedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  };

  // --- Classroom assignment ---
  const openClassroomDialog = async () => {
    setClassroomDialogOpen(true);
    setClassroomsLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classrooms', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAvailableClassrooms(data.classrooms || []);
        // Pre-select already assigned
        const assigned = new Set((checklist?.classrooms || []).map((c) => c.id));
        setSelectedClassroomIds(assigned);
      }
    } catch (err) {
      console.error('Failed to load classrooms:', err);
    } finally {
      setClassroomsLoading(false);
    }
  };

  const handleToggleClassroom = (classroomId: string) => {
    setSelectedClassroomIds((prev) => {
      const next = new Set(prev);
      if (next.has(classroomId)) next.delete(classroomId);
      else next.add(classroomId);
      return next;
    });
  };

  const handleSaveClassrooms = async () => {
    setSavingClassrooms(true);
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/checklists/${id}/classrooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ classroom_ids: Array.from(selectedClassroomIds) }),
      });

      setClassroomDialogOpen(false);
      await fetchChecklist();
    } catch (err) {
      console.error('Failed to save classrooms:', err);
    } finally {
      setSavingClassrooms(false);
    }
  };

  const handleRemoveClassroom = async (classroomId: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/checklists/${id}/classrooms/${classroomId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      await fetchChecklist();
    } catch (err) {
      console.error('Failed to remove classroom:', err);
    }
  };

  // --- Add entry: module ---
  const openEntryDialog = async () => {
    setEntryDialogOpen(true);
    setEntryTab(0);
    setSimpleTitle('');
    setResourceUrls(['']);
    setModulesLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/modules', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setAvailableModules((data.modules || []).map((m: any) => ({
          id: m.id,
          title: m.title,
          color: m.color || '#4F46E5',
          item_count: m.itemCount || m.item_count || 0,
          category: m.category || 'general',
        })));
      }
    } catch (err) {
      console.error('Failed to load modules:', err);
    } finally {
      setModulesLoading(false);
    }
  };

  const handleAddModule = async (moduleId: string) => {
    setAddingModule(moduleId);
    try {
      const token = await getToken();
      if (!token) return;

      const nextOrder = (checklist?.entries?.length || 0) + 1;

      const res = await fetch(`/api/checklists/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entry_type: 'module',
          module_id: moduleId,
          sort_order: nextOrder,
        }),
      });

      if (res.ok) {
        setEntryDialogOpen(false);
        await fetchChecklist();
      }
    } catch (err) {
      console.error('Failed to add module entry:', err);
    } finally {
      setAddingModule(null);
    }
  };

  // --- Add entry: simple item ---
  const handleAddResourceUrl = () => {
    setResourceUrls((prev) => [...prev, '']);
  };

  const handleResourceUrlChange = (index: number, value: string) => {
    setResourceUrls((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleRemoveResourceUrl = (index: number) => {
    setResourceUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddSimpleItem = async () => {
    if (!simpleTitle.trim()) return;
    setSavingSimpleItem(true);
    try {
      const token = await getToken();
      if (!token) return;

      const nextOrder = (checklist?.entries?.length || 0) + 1;
      const resources = resourceUrls
        .map((url) => url.trim())
        .filter((url) => url.length > 0)
        .map((url) => ({ resource_type: detectResourceType(url), url }));

      const res = await fetch(`/api/checklists/${id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          entry_type: 'simple_item',
          title: simpleTitle.trim(),
          resources,
          sort_order: nextOrder,
        }),
      });

      if (res.ok) {
        setEntryDialogOpen(false);
        setSimpleTitle('');
        setResourceUrls(['']);
        await fetchChecklist();
      }
    } catch (err) {
      console.error('Failed to add simple item:', err);
    } finally {
      setSavingSimpleItem(false);
    }
  };

  // --- Delete entry ---
  const handleDeleteEntry = async (entryId: string) => {
    try {
      const token = await getToken();
      if (!token) return;

      await fetch(`/api/checklists/${id}/entries/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      await fetchChecklist();
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  // --- Delete checklist ---
  const handleDeleteChecklist = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(`/api/checklists/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        router.push('/teacher/checklists');
      }
    } catch (err) {
      console.error('Failed to delete checklist:', err);
    } finally {
      setDeleting(false);
    }
  };

  // --- Loading ---
  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={40} width={200} sx={{ mb: 2 }} />
        <Skeleton variant="rounded" height={24} width={300} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={48} sx={{ borderRadius: 2, mb: 2 }} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2.5, mb: 1.5 }} />
        ))}
      </Box>
    );
  }

  // --- Not found ---
  if (notFound || !checklist) {
    return (
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
          <IconButton onClick={() => router.push('/teacher/checklists')} size="small">
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Back
          </Typography>
        </Box>
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <ChecklistOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            Checklist not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            This checklist may have been deleted or you do not have access.
          </Typography>
        </Paper>
      </Box>
    );
  }

  const entries = (checklist.entries || []).sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh', pb: 12 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton
          onClick={() => router.push('/teacher/checklists')}
          size="small"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {editingTitle ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TextField
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                size="small"
                autoFocus
                fullWidth
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleTitleSave();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                InputProps={{ sx: { fontWeight: 700, fontSize: '1.25rem' } }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleTitleSave}
                disabled={!titleDraft.trim()}
                sx={{ minHeight: 36, textTransform: 'none', fontWeight: 600 }}
              >
                Save
              </Button>
            </Box>
          ) : (
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1.25rem', sm: '1.5rem' },
                cursor: 'pointer',
                '&:hover': { color: 'primary.main' },
              }}
              onClick={() => {
                setTitleDraft(checklist.title);
                setEditingTitle(true);
              }}
            >
              {checklist.title}
            </Typography>
          )}
        </Box>
      </Box>

      {checklist.description && (
        <Typography variant="body2" color="text.secondary" sx={{ ml: 7, mb: 2 }}>
          {checklist.description}
        </Typography>
      )}

      {/* Draft / Published toggle */}
      <Box sx={{ ml: { xs: 0, sm: 7 }, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Switch
          checked={checklist.is_published}
          onChange={handlePublishToggle}
          color="success"
          size="small"
        />
        <Chip
          label={checklist.is_published ? 'Published' : 'Draft'}
          size="small"
          color={checklist.is_published ? 'success' : 'default'}
          variant={checklist.is_published ? 'filled' : 'outlined'}
          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
        />
        <Typography variant="caption" color="text.secondary">
          {checklist.is_published ? 'Visible to students' : 'Hidden from students'}
        </Typography>
      </Box>

      {/* Assigned Classrooms */}
      <Box sx={{ mb: 3, ml: { xs: 0, sm: 7 } }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75, display: 'block' }}>
          ASSIGNED CLASSROOMS
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {checklist.classrooms.map((cr) => {
            const color = classroomColors[cr.type] || classroomColors.other;
            return (
              <Chip
                key={cr.id}
                icon={<SchoolOutlinedIcon sx={{ fontSize: '0.8rem !important', color: `${color} !important` }} />}
                label={cr.name}
                size="small"
                onDelete={() => handleRemoveClassroom(cr.id)}
                sx={{
                  height: 28,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  bgcolor: alpha(color, 0.08),
                  color: color,
                  borderRadius: 1.5,
                  '& .MuiChip-deleteIcon': { fontSize: '0.9rem', color: alpha(color, 0.5) },
                }}
              />
            );
          })}
          <Chip
            icon={<AddIcon sx={{ fontSize: '0.9rem !important' }} />}
            label="Add"
            size="small"
            variant="outlined"
            onClick={openClassroomDialog}
            sx={{
              height: 28,
              fontSize: '0.75rem',
              fontWeight: 600,
              borderRadius: 1.5,
              borderStyle: 'dashed',
              cursor: 'pointer',
            }}
          />
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Entries */}
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
        ENTRIES ({entries.length})
      </Typography>

      {entries.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            textAlign: 'center',
            borderRadius: 2.5,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <ViewModuleOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No entries yet. Add modules or simple items to build your checklist.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {entries.map((entry, idx) => {
            const isDragging = dragIdx === idx;
            const isDropTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

            if (entry.entry_type === 'module' && entry.module) {
              const mod = entry.module;
              const isExpanded = expandedEntries.has(entry.id);
              return (
                <Box key={entry.id} sx={{ position: 'relative', pt: 0.75, pb: 0.75 }}>
                  {/* Drop indicator line */}
                  {isDropTarget && (
                    <Box
                      sx={{
                        position: 'absolute',
                        top: -1,
                        left: 0,
                        right: 0,
                        height: 3,
                        bgcolor: 'primary.main',
                        borderRadius: 1.5,
                        zIndex: 2,
                        '&::before': {
                          content: '""',
                          position: 'absolute',
                          left: -4,
                          top: -3,
                          width: 9,
                          height: 9,
                          borderRadius: '50%',
                          bgcolor: 'primary.main',
                        },
                      }}
                    />
                  )}
                  <Paper
                    elevation={isDragging ? 4 : 0}
                    draggable
                    onDragStart={(e) => handleDragStart(e as React.DragEvent, idx)}
                    onDragOver={(e) => handleDragOver(e as React.DragEvent, idx)}
                    onDrop={(e) => handleDrop(e as React.DragEvent, idx)}
                    onDragEnd={handleDragEnd}
                    sx={{
                      borderRadius: 2.5,
                      border: `1px solid ${isDropTarget ? theme.palette.primary.main : theme.palette.divider}`,
                      borderLeft: `4px solid ${mod.color || theme.palette.primary.main}`,
                      overflow: 'hidden',
                      opacity: isDragging ? 0.4 : 1,
                      transition: 'opacity 200ms, box-shadow 200ms, border-color 200ms',
                      '&[draggable=true]': { cursor: 'grab' },
                    }}
                  >
                  <Box
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      cursor: 'pointer',
                    }}
                    onClick={() => toggleExpand(entry.id)}
                  >
                    <DragIndicatorIcon sx={{ fontSize: '1.2rem', color: 'text.disabled', cursor: 'grab', flexShrink: 0 }} />
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: alpha(mod.color || theme.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ViewModuleOutlinedIcon
                        sx={{ fontSize: '1.2rem', color: mod.color || theme.palette.primary.main }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {mod.title}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {mod.item_count} item{mod.item_count !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                    <Chip
                      label="Module"
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        bgcolor: alpha(mod.color || theme.palette.primary.main, 0.08),
                        color: mod.color || theme.palette.primary.main,
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteEntry(entry.id);
                      }}
                      sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                    >
                      <DeleteOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                    {isExpanded ? (
                      <ExpandLessIcon sx={{ fontSize: '1.2rem', color: 'text.disabled' }} />
                    ) : (
                      <ExpandMoreIcon sx={{ fontSize: '1.2rem', color: 'text.disabled' }} />
                    )}
                  </Box>

                  <Collapse in={isExpanded}>
                    <Divider />
                    <Box sx={{ px: 2, py: 1.5, bgcolor: alpha(theme.palette.background.default, 0.5) }}>
                      {mod.items && mod.items.length > 0 ? (
                        mod.items
                          .sort((a, b) => a.sort_order - b.sort_order)
                          .map((item) => (
                            <Box
                              key={item.id}
                              sx={{
                                py: 0.75,
                                px: 1,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                              }}
                            >
                              <Box
                                sx={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: '50%',
                                  bgcolor: mod.color || 'text.disabled',
                                  flexShrink: 0,
                                }}
                              />
                              <Typography variant="caption" sx={{ flex: 1 }}>
                                {item.title}
                              </Typography>
                              <Chip
                                label={item.item_type}
                                size="small"
                                sx={{
                                  height: 18,
                                  fontSize: '0.6rem',
                                  fontWeight: 600,
                                  bgcolor: alpha(theme.palette.text.primary, 0.06),
                                }}
                              />
                            </Box>
                          ))
                      ) : (
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                          No items in this module.
                        </Typography>
                      )}
                    </Box>
                  </Collapse>
                </Paper>
                </Box>
              );
            }

            // Simple item entry
            return (
              <Box key={entry.id} sx={{ position: 'relative', pt: 0.75, pb: 0.75 }}>
                {/* Drop indicator line */}
                {isDropTarget && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -1,
                      left: 0,
                      right: 0,
                      height: 3,
                      bgcolor: 'primary.main',
                      borderRadius: 1.5,
                      zIndex: 2,
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: -4,
                        top: -3,
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        bgcolor: 'primary.main',
                      },
                    }}
                  />
                )}
                <Paper
                  elevation={isDragging ? 4 : 0}
                  draggable
                  onDragStart={(e) => handleDragStart(e as React.DragEvent, idx)}
                  onDragOver={(e) => handleDragOver(e as React.DragEvent, idx)}
                  onDrop={(e) => handleDrop(e as React.DragEvent, idx)}
                  onDragEnd={handleDragEnd}
                  sx={{
                    p: 2,
                    borderRadius: 2.5,
                    border: `1px solid ${isDropTarget ? theme.palette.primary.main : theme.palette.divider}`,
                    opacity: isDragging ? 0.4 : 1,
                    transition: 'opacity 200ms, box-shadow 200ms, border-color 200ms',
                    '&[draggable=true]': { cursor: 'grab' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <DragIndicatorIcon sx={{ fontSize: '1.2rem', color: 'text.disabled', cursor: 'grab', mt: 0.25, flexShrink: 0 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                      {entry.title}
                    </Typography>
                    {entry.resources.length > 0 && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {entry.resources.map((r) => {
                          const color = resourceTypeColor(r.resource_type);
                          return (
                            <Chip
                              key={r.id}
                              icon={resourceTypeIcon(r.resource_type)}
                              label={r.resource_type}
                              size="small"
                              component="a"
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              clickable
                              sx={{
                                height: 22,
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                bgcolor: alpha(color, 0.08),
                                color: color,
                                '& .MuiChip-icon': { color: `${color} !important` },
                                textDecoration: 'none',
                              }}
                            />
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteEntry(entry.id)}
                    sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}
                  >
                    <DeleteOutlinedIcon sx={{ fontSize: '1.1rem' }} />
                  </IconButton>
                </Box>
              </Paper>
              </Box>
            );
          })}
        </Box>
      )}

      {/* Add Entry FAB */}
      <Fab
        color="primary"
        aria-label="Add entry"
        onClick={openEntryDialog}
        sx={{
          position: 'fixed',
          bottom: { xs: 80, md: 24 },
          right: { xs: 16, md: 24 },
          width: 56,
          height: 56,
          boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
        }}
      >
        <AddIcon />
      </Fab>

      {/* ============ STUDENT PROGRESS ============ */}
      {checklist && checklist.classrooms.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Divider sx={{ mb: 2 }} />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <BarChartOutlinedIcon sx={{ fontSize: '1.2rem', color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Student Progress
            </Typography>
          </Box>

          {/* Classroom selector (if multiple) */}
          {checklist.classrooms.length > 1 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 2 }}>
              {checklist.classrooms.map((cr) => (
                <Chip
                  key={cr.id}
                  label={cr.name}
                  size="small"
                  onClick={() => fetchProgress(cr.id)}
                  variant={progressClassroomId === cr.id ? 'filled' : 'outlined'}
                  color={progressClassroomId === cr.id ? 'primary' : 'default'}
                  sx={{
                    height: 30,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </Box>
          )}

          {/* Overall stats */}
          {progressData && !progressLoading && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha(theme.palette.primary.main, 0.03),
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Classroom Average
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 800, color: 'primary.main', fontSize: '1.1rem' }}>
                  {progressData.overall.averageCompletion}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressData.overall.averageCompletion}
                sx={{
                  height: 8,
                  borderRadius: 4,
                  bgcolor: alpha(theme.palette.primary.main, 0.1),
                  '& .MuiLinearProgress-bar': { borderRadius: 4 },
                }}
              />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {progressData.overall.totalStudents} students enrolled
                </Typography>
                {progressData.overall.staleStudents > 0 && (
                  <Chip
                    icon={<WarningAmberIcon sx={{ fontSize: '0.85rem !important' }} />}
                    label={`${progressData.overall.staleStudents} stuck`}
                    size="small"
                    onClick={() => setShowStaleOnly((v) => !v)}
                    variant={showStaleOnly ? 'filled' : 'outlined'}
                    color="warning"
                    sx={{
                      height: 24,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  />
                )}
              </Box>
            </Paper>
          )}

          {/* Per-student rows */}
          {progressLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          ) : progressData && progressData.students.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {progressData.students
                .filter((s) => !showStaleOnly || s.isStale)
                .map((student) => (
                <Paper
                  key={student.id}
                  elevation={0}
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderRadius: 2,
                    border: `1px solid ${student.isStale ? alpha(theme.palette.warning.main, 0.4) : theme.palette.divider}`,
                    bgcolor: student.isStale ? alpha(theme.palette.warning.main, 0.03) : 'background.paper',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        bgcolor: student.isStale
                          ? alpha(theme.palette.warning.main, 0.1)
                          : alpha(theme.palette.primary.main, 0.08),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        mt: 0.25,
                      }}
                    >
                      {student.isStale ? (
                        <WarningAmberIcon sx={{ fontSize: '1.1rem', color: 'warning.main' }} />
                      ) : (
                        <PersonOutlineIcon sx={{ fontSize: '1.1rem', color: 'primary.main' }} />
                      )}
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {student.name}
                        </Typography>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: student.percentage === 100 ? 'success.main' : 'text.secondary', flexShrink: 0, ml: 1 }}>
                          {student.completedEntries}/{student.totalEntries}
                        </Typography>
                      </Box>
                      <LinearProgress
                        variant="determinate"
                        value={student.percentage}
                        sx={{
                          height: 6,
                          borderRadius: 3,
                          bgcolor: alpha(
                            student.percentage === 100 ? theme.palette.success.main : theme.palette.primary.main,
                            0.1
                          ),
                          '& .MuiLinearProgress-bar': {
                            borderRadius: 3,
                            bgcolor: student.percentage === 100 ? theme.palette.success.main : theme.palette.primary.main,
                          },
                        }}
                      />
                      {/* Current step info */}
                      {student.currentStepTitle && student.percentage < 100 && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                            On: <strong>{student.currentStepTitle}</strong>
                          </Typography>
                          {student.currentStepStatus && (
                            <Chip
                              label={student.currentStepStatus === 'in_progress' ? 'In Progress' : 'Not Started'}
                              size="small"
                              sx={{
                                height: 18,
                                fontSize: '0.58rem',
                                fontWeight: 700,
                                bgcolor: student.currentStepStatus === 'in_progress'
                                  ? alpha(theme.palette.info.main, 0.1)
                                  : alpha(theme.palette.text.disabled, 0.1),
                                color: student.currentStepStatus === 'in_progress'
                                  ? 'info.main'
                                  : 'text.disabled',
                              }}
                            />
                          )}
                          {student.currentStepStartedAt && (
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>
                              started {new Date(student.currentStepStartedAt).toLocaleDateString()}
                            </Typography>
                          )}
                        </Box>
                      )}
                      {/* Activity info */}
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                        {student.lastActivity && (
                          <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.63rem' }}>
                            Last active: {new Date(student.lastActivity).toLocaleDateString()}
                          </Typography>
                        )}
                        {student.isStale && student.daysSinceLastActivity !== null && (
                          <Chip
                            label={`Idle ${student.daysSinceLastActivity}d`}
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{
                              height: 18,
                              fontSize: '0.58rem',
                              fontWeight: 700,
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              ))}
              {showStaleOnly && progressData.students.filter((s) => s.isStale).length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  No stuck students — everyone is making progress!
                </Typography>
              )}
            </Box>
          ) : progressData ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              No students enrolled in this classroom yet.
            </Typography>
          ) : null}
        </Box>
      )}

      {/* Delete Checklist Button */}
      <Box sx={{ mt: 6, textAlign: 'center' }}>
        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlinedIcon />}
          onClick={() => setDeleteDialogOpen(true)}
          sx={{
            minHeight: 48,
            borderRadius: 2.5,
            textTransform: 'none',
            fontWeight: 600,
          }}
        >
          Delete Checklist
        </Button>
      </Box>

      {/* ============ DIALOGS ============ */}

      {/* Assign Classrooms Dialog */}
      <Dialog
        open={classroomDialogOpen}
        onClose={() => setClassroomDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        TransitionComponent={isMobile ? SlideTransition : undefined}
        PaperProps={{
          sx: isMobile
            ? { borderRadius: '16px 16px 0 0', position: 'fixed', bottom: 0, m: 0, maxHeight: '85vh' }
            : { borderRadius: 3 },
        }}
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, pb: 1 }}
        >
          Assign Classrooms
          {isMobile && (
            <IconButton onClick={() => setClassroomDialogOpen(false)} edge="end" size="small">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          {classroomsLoading ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 1 }}>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} variant="rounded" height={48} sx={{ borderRadius: 2 }} />
              ))}
            </Box>
          ) : availableClassrooms.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No classrooms available. Create a classroom first.
            </Typography>
          ) : (
            <List disablePadding sx={{ pt: 1 }}>
              {availableClassrooms.map((cr) => {
                const checked = selectedClassroomIds.has(cr.id);
                const color = classroomColors[cr.type] || classroomColors.other;
                return (
                  <ListItem key={cr.id} disablePadding>
                    <ListItemButton
                      onClick={() => handleToggleClassroom(cr.id)}
                      sx={{ borderRadius: 2, minHeight: 48, mb: 0.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        <Checkbox edge="start" checked={checked} disableRipple />
                      </ListItemIcon>
                      <ListItemText
                        primary={cr.name}
                        primaryTypographyProps={{ fontWeight: 600, fontSize: '0.9rem' }}
                      />
                      <Chip
                        label={cr.type.toUpperCase()}
                        size="small"
                        sx={{
                          height: 22,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          bgcolor: alpha(color, 0.1),
                          color: color,
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: isMobile ? 4 : 2, pt: 1 }}>
          {!isMobile && (
            <Button
              onClick={() => setClassroomDialogOpen(false)}
              sx={{ minHeight: 48, textTransform: 'none' }}
            >
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleSaveClassrooms}
            disabled={savingClassrooms}
            fullWidth={isMobile}
            sx={{ minHeight: 48, borderRadius: 2.5, textTransform: 'none', fontWeight: 600 }}
          >
            {savingClassrooms ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Entry Dialog */}
      <Dialog
        open={entryDialogOpen}
        onClose={() => setEntryDialogOpen(false)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        TransitionComponent={isMobile ? SlideTransition : undefined}
        PaperProps={{
          sx: isMobile
            ? { borderRadius: '16px 16px 0 0', position: 'fixed', bottom: 0, m: 0, maxHeight: '90vh' }
            : { borderRadius: 3 },
        }}
      >
        <DialogTitle
          sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700, pb: 0 }}
        >
          Add Entry
          {isMobile && (
            <IconButton onClick={() => setEntryDialogOpen(false)} edge="end" size="small">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>

        <Tabs
          value={entryTab}
          onChange={(_, v) => setEntryTab(v)}
          sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Add Module" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }} />
          <Tab label="Add Simple Item" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }} />
        </Tabs>

        <DialogContent sx={{ pt: 2 }}>
          {entryTab === 0 ? (
            /* Module tab */
            modulesLoading ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} variant="rounded" height={56} sx={{ borderRadius: 2 }} />
                ))}
              </Box>
            ) : availableModules.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                No published modules available.
              </Typography>
            ) : (() => {
              const categories = ['all', ...Array.from(new Set(availableModules.map((m) => m.category || 'general')))];
              const filtered = moduleCategoryFilter === 'all'
                ? availableModules
                : availableModules.filter((m) => (m.category || 'general') === moduleCategoryFilter);
              return (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {/* Category filter chips */}
                {categories.length > 2 && (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 0.5 }}>
                    {categories.map((cat) => (
                      <Chip
                        key={cat}
                        label={cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                        size="small"
                        onClick={() => setModuleCategoryFilter(cat)}
                        variant={moduleCategoryFilter === cat ? 'filled' : 'outlined'}
                        color={moduleCategoryFilter === cat ? 'primary' : 'default'}
                        sx={{
                          height: 28,
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      />
                    ))}
                  </Box>
                )}
                {filtered.map((mod) => (
                  <Paper
                    key={mod.id}
                    variant="outlined"
                    sx={{
                      p: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      borderRadius: 2,
                      borderLeft: `4px solid ${mod.color || theme.palette.primary.main}`,
                    }}
                  >
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: 2,
                        bgcolor: alpha(mod.color || theme.palette.primary.main, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <ViewModuleOutlinedIcon
                        sx={{ fontSize: '1.1rem', color: mod.color || theme.palette.primary.main }}
                      />
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {mod.title}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {mod.item_count} item{mod.item_count !== 1 ? 's' : ''}
                        </Typography>
                        {mod.category && mod.category !== 'general' && (
                          <Chip
                            label={mod.category}
                            size="small"
                            sx={{
                              height: 16,
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              bgcolor: alpha(theme.palette.text.primary, 0.06),
                            }}
                          />
                        )}
                      </Box>
                    </Box>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleAddModule(mod.id)}
                      disabled={addingModule === mod.id}
                      sx={{
                        minHeight: 36,
                        minWidth: 64,
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        fontSize: '0.8rem',
                      }}
                    >
                      {addingModule === mod.id ? 'Adding...' : 'Add'}
                    </Button>
                  </Paper>
                ))}
              </Box>
              );
            })()
          ) : (
            /* Simple item tab */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <TextField
                label="Title"
                placeholder="e.g. Watch perspective basics video"
                fullWidth
                required
                value={simpleTitle}
                onChange={(e) => setSimpleTitle(e.target.value)}
                InputProps={{ sx: { minHeight: 48 } }}
                autoFocus
              />

              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 0.75, display: 'block' }}>
                  RESOURCE URLS (optional)
                </Typography>
                {resourceUrls.map((url, idx) => (
                  <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                      size="small"
                      fullWidth
                      placeholder="https://..."
                      value={url}
                      onChange={(e) => handleResourceUrlChange(idx, e.target.value)}
                      InputProps={{ sx: { minHeight: 44 } }}
                      helperText={
                        url.trim() ? `Detected: ${detectResourceType(url)}` : undefined
                      }
                    />
                    {resourceUrls.length > 1 && (
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveResourceUrl(idx)}
                        sx={{ color: 'text.disabled', minWidth: 44, minHeight: 44 }}
                      >
                        <CloseIcon sx={{ fontSize: '1rem' }} />
                      </IconButton>
                    )}
                  </Box>
                ))}
                <Button
                  size="small"
                  startIcon={<AddIcon sx={{ fontSize: '0.9rem' }} />}
                  onClick={handleAddResourceUrl}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem' }}
                >
                  Add Resource
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>

        {entryTab === 1 && (
          <DialogActions sx={{ px: 3, pb: isMobile ? 4 : 2, pt: 1 }}>
            {!isMobile && (
              <Button
                onClick={() => setEntryDialogOpen(false)}
                sx={{ minHeight: 48, textTransform: 'none' }}
              >
                Cancel
              </Button>
            )}
            <Button
              variant="contained"
              onClick={handleAddSimpleItem}
              disabled={savingSimpleItem || !simpleTitle.trim()}
              fullWidth={isMobile}
              sx={{ minHeight: 48, borderRadius: 2.5, textTransform: 'none', fontWeight: 600 }}
            >
              {savingSimpleItem ? 'Adding...' : 'Add Item'}
            </Button>
          </DialogActions>
        )}
      </Dialog>

      {/* Delete Checklist Confirmation */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Checklist</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Are you sure you want to delete &ldquo;{checklist.title}&rdquo;? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeleteDialogOpen(false)}
            sx={{ minHeight: 48, textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteChecklist}
            disabled={deleting}
            sx={{ minHeight: 48, borderRadius: 2.5, textTransform: 'none', fontWeight: 600 }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
