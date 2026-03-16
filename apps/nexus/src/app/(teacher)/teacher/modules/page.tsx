'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Button,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  alpha,
  useTheme,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import LibraryBooksOutlinedIcon from '@mui/icons-material/LibraryBooksOutlined';
import AutoStoriesOutlinedIcon from '@mui/icons-material/AutoStoriesOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';

interface Module {
  id: string;
  title: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_published: boolean;
  is_foundation: boolean;
  itemCount: number;
  created_at: string;
}

const PRESET_COLORS = [
  '#1976d2', // Blue
  '#388e3c', // Green
  '#f57c00', // Orange
  '#d32f2f', // Red
  '#7b1fa2', // Purple
  '#00796b', // Teal
  '#c2185b', // Pink
  '#455a64', // Blue Grey
  '#5d4037', // Brown
  '#fbc02d', // Yellow
];

export default function ModulesPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newModule, setNewModule] = useState({
    title: '',
    description: '',
    icon: '',
    color: PRESET_COLORS[0],
  });

  const fetchModules = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/modules', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setModules(data.modules || []);
      }
    } catch (err) {
      console.error('Failed to load modules:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchModules();
  }, [authLoading, fetchModules]);

  const handleCreate = async () => {
    if (!newModule.title.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/modules', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newModule.title.trim(),
          description: newModule.description.trim() || null,
          icon: newModule.icon.trim() || null,
          color: newModule.color || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreateOpen(false);
        setNewModule({ title: '', description: '', icon: '', color: PRESET_COLORS[0] });
        router.push(`/teacher/modules/${data.module.id}`);
      }
    } catch (err) {
      console.error('Failed to create module:', err);
    } finally {
      setCreating(false);
    }
  };

  // Separate foundation module from the rest
  const foundationModule = modules.find((m) => m.is_foundation);
  const regularModules = modules.filter((m) => !m.is_foundation);

  return (
    <Box>
      <PageHeader
        title="Module Library"
        subtitle="Organize learning content into modules for your classrooms"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none', borderRadius: 2, display: { xs: 'none', sm: 'flex' } }}
          >
            New Module
          </Button>
        }
      />

      {/* Loading skeletons */}
      {loading && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} variant="rectangular" height={140} sx={{ borderRadius: 2.5 }} />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {!loading && modules.length === 0 && (
        <Paper
          sx={{
            p: { xs: 3, sm: 5 },
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <LibraryBooksOutlinedIcon sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No modules yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled', mb: 3, maxWidth: 360, mx: 'auto' }}>
            Create your first module to organize videos, documents, quizzes, and links for your students.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{ textTransform: 'none' }}
          >
            Create Module
          </Button>
        </Paper>
      )}

      {/* Foundation module pinned card */}
      {!loading && foundationModule && (
        <Paper
          elevation={0}
          onClick={() => router.push(`/teacher/modules/${foundationModule.id}`)}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 2.5,
            border: `1px solid ${alpha(theme.palette.primary.main, 0.3)}`,
            bgcolor: alpha(theme.palette.primary.main, 0.04),
            cursor: 'pointer',
            transition: 'border-color 200ms, box-shadow 200ms',
            '&:hover': {
              borderColor: theme.palette.primary.main,
              boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.2)}`,
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                bgcolor: alpha(theme.palette.primary.main, 0.12),
                color: theme.palette.primary.main,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AutoStoriesOutlinedIcon />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '1rem' }} noWrap>
                  {foundationModule.title}
                </Typography>
                <Chip
                  label="Foundation"
                  size="small"
                  color="primary"
                  sx={{ height: 22, fontSize: '0.65rem', fontWeight: 700 }}
                />
                {foundationModule.is_published ? (
                  <Chip
                    label="Published"
                    size="small"
                    color="success"
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                  />
                ) : (
                  <Chip
                    label="Draft"
                    size="small"
                    sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                  />
                )}
              </Box>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {foundationModule.itemCount} item{foundationModule.itemCount !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Module grid */}
      {!loading && regularModules.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
            gap: 2,
          }}
        >
          {regularModules.map((mod) => {
            const borderColor = mod.color || theme.palette.primary.main;
            return (
              <Paper
                key={mod.id}
                elevation={0}
                onClick={() => router.push(`/teacher/modules/${mod.id}`)}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  borderLeft: `4px solid ${borderColor}`,
                  cursor: 'pointer',
                  transition: 'border-color 200ms, box-shadow 200ms',
                  opacity: mod.is_published ? 1 : 0.75,
                  '&:hover': {
                    borderColor: borderColor,
                    boxShadow: `0 2px 8px ${alpha(borderColor, 0.15)}`,
                  },
                  display: 'flex',
                  flexDirection: 'column',
                  minHeight: 120,
                }}
              >
                {/* Icon + Title row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {mod.icon && (
                    <span className="material-icons" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{mod.icon}</span>
                  )}
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 700, fontSize: '0.95rem', flex: 1 }}
                    noWrap
                  >
                    {mod.title}
                  </Typography>
                </Box>

                {/* Description */}
                {mod.description && (
                  <Typography
                    variant="body2"
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.8rem',
                      lineHeight: 1.4,
                      mb: 1.5,
                      flex: 1,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {mod.description}
                  </Typography>
                )}
                {!mod.description && <Box sx={{ flex: 1 }} />}

                {/* Footer: item count + status */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto' }}>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {mod.itemCount} item{mod.itemCount !== 1 ? 's' : ''}
                  </Typography>
                  {mod.is_published ? (
                    <Chip
                      label="Published"
                      size="small"
                      color="success"
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  ) : (
                    <Chip
                      label="Draft"
                      size="small"
                      sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600 }}
                    />
                  )}
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      {/* Mobile FAB */}
      <Fab
        color="primary"
        onClick={() => setCreateOpen(true)}
        sx={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          width: 56,
          height: 56,
          display: { xs: 'flex', sm: 'none' },
        }}
      >
        <AddIcon />
      </Fab>

      {/* Create Module Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Module</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Module Title"
              placeholder="e.g. Mathematics - Grade 10"
              value={newModule.title}
              onChange={(e) => setNewModule((prev) => ({ ...prev, title: e.target.value }))}
              fullWidth
              size="small"
              required
            />
            <TextField
              label="Description (optional)"
              placeholder="Brief description of this module"
              value={newModule.description}
              onChange={(e) => setNewModule((prev) => ({ ...prev, description: e.target.value }))}
              fullWidth
              size="small"
              multiline
              rows={2}
            />
            <TextField
              label="Icon Emoji (optional)"
              placeholder="e.g. 📐 or 📚"
              value={newModule.icon}
              onChange={(e) => setNewModule((prev) => ({ ...prev, icon: e.target.value }))}
              size="small"
              sx={{ width: 200 }}
              inputProps={{ maxLength: 4 }}
            />
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1, display: 'block' }}>
                Module Color
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                {PRESET_COLORS.map((color) => (
                  <Box
                    key={color}
                    onClick={() => setNewModule((prev) => ({ ...prev, color }))}
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      bgcolor: color,
                      cursor: 'pointer',
                      border: newModule.color === color
                        ? `3px solid ${theme.palette.text.primary}`
                        : '3px solid transparent',
                      transition: 'border-color 150ms, transform 150ms',
                      '&:hover': { transform: 'scale(1.15)' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newModule.title.trim()}
            sx={{ textTransform: 'none' }}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
