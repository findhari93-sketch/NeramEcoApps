'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  alpha,
  useTheme,
  useMediaQuery,
  Slide,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import ViewModuleOutlinedIcon from '@mui/icons-material/ViewModuleOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import React from 'react';

interface ClassroomRef {
  id: string;
  name: string;
  type: string;
}

interface Checklist {
  id: string;
  title: string;
  description: string | null;
  entry_count: number;
  is_published: boolean;
  classrooms: ClassroomRef[];
  created_at: string;
}

interface CreateForm {
  title: string;
  description: string;
}

const emptyForm: CreateForm = { title: '', description: '' };

const classroomColors: Record<string, string> = {
  nata: '#4F46E5',   // Indigo (info)
  jee: '#7C3AED',    // Purple (primary)
  revit: '#059669',  // Green (secondary)
  other: '#78716C',  // Stone (neutral)
};

// Mobile bottom-sheet transition
const SlideTransition = React.forwardRef(function Transition(
  props: any,
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function ChecklistsPage() {
  const theme = useTheme();
  const router = useRouter();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken } = useNexusAuthContext();

  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<CreateForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchChecklists = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/checklists', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setChecklists(data.checklists || []);
      }
    } catch (err) {
      console.error('Failed to load checklists:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchChecklists();
  }, [fetchChecklists]);

  const handleOpen = () => {
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setFormData(emptyForm);
  };

  const handleCreate = async () => {
    if (!formData.title.trim()) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/checklists', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title.trim(),
          description: formData.description.trim() || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        handleClose();
        router.push(`/teacher/checklists/${data.checklist?.id || data.id}`);
      }
    } catch (err) {
      console.error('Failed to create checklist:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh', pb: 10 }}>
      <PageHeader
        title="Checklists"
        subtitle={`${checklists.length} checklist${checklists.length !== 1 ? 's' : ''}`}
      />

      {/* Loading State */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 2.5 }} />
          ))}
        </Box>
      ) : checklists.length === 0 ? (
        /* Empty State */
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
            No Checklists Yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 360, mx: 'auto' }}>
            No checklists yet. Create one to organize your content.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpen}
            sx={{
              mt: 2,
              minHeight: 48,
              borderRadius: 2.5,
              textTransform: 'none',
              fontWeight: 600,
            }}
          >
            Create Checklist
          </Button>
        </Paper>
      ) : (
        /* Checklist Cards */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {checklists.map((checklist, idx) => (
            <Paper
              key={checklist.id}
              elevation={0}
              onClick={() => router.push(`/teacher/checklists/${checklist.id}`)}
              sx={{
                p: 2,
                borderRadius: 2.5,
                border: `1px solid ${theme.palette.divider}`,
                cursor: 'pointer',
                transition: 'all 200ms ease',
                animation: `fadeIn 300ms ease ${idx * 40}ms both`,
                '@keyframes fadeIn': {
                  from: { opacity: 0, transform: 'translateY(4px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': { borderColor: theme.palette.primary.main },
                '&:active': { transform: 'scale(0.99)' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body1" sx={{ fontWeight: 600, mb: 0.25 }}>
                    {checklist.title}
                  </Typography>
                  {checklist.description && (
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        mb: 1,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {checklist.description}
                    </Typography>
                  )}
                </Box>

                {/* Draft/Published badge */}
                <Chip
                  label={checklist.is_published ? "Published" : "Draft"}
                  size="small"
                  sx={{
                    height: 24,
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    borderRadius: 1.5,
                    flexShrink: 0,
                    bgcolor: checklist.is_published
                      ? alpha(theme.palette.success.main, 0.1)
                      : alpha(theme.palette.warning.main, 0.1),
                    color: checklist.is_published
                      ? "success.main"
                      : "warning.main",
                  }}
                />

              {/* Entry count badge */}
                <Chip
                  icon={<ViewModuleOutlinedIcon sx={{ fontSize: '0.85rem !important' }} />}
                  label={`${checklist.entry_count} item${checklist.entry_count !== 1 ? 's' : ''}`}
                  size="small"
                  variant="outlined"
                  sx={{
                    height: 26,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 1.5,
                    flexShrink: 0,
                  }}
                />
              </Box>

              {/* Classroom chips */}
              {checklist.classrooms.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1 }}>
                  {checklist.classrooms.map((cr) => {
                    const color = classroomColors[cr.type] || classroomColors.other;
                    return (
                      <Chip
                        key={cr.id}
                        icon={<SchoolOutlinedIcon sx={{ fontSize: '0.8rem !important', color: `${color} !important` }} />}
                        label={cr.name}
                        size="small"
                        sx={{
                          height: 24,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          bgcolor: alpha(color, 0.08),
                          color: color,
                          borderRadius: 1.5,
                          '& .MuiChip-icon': { ml: 0.5 },
                        }}
                      />
                    );
                  })}
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="Create checklist"
        onClick={handleOpen}
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

      {/* Create Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
        TransitionComponent={isMobile ? SlideTransition : undefined}
        PaperProps={{
          sx: isMobile
            ? {
                borderRadius: '16px 16px 0 0',
                position: 'fixed',
                bottom: 0,
                m: 0,
                maxHeight: '85vh',
              }
            : { borderRadius: 3 },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontWeight: 700,
            pb: 1,
          }}
        >
          New Checklist
          {isMobile && (
            <IconButton onClick={handleClose} edge="end" size="small">
              <CloseIcon />
            </IconButton>
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            <TextField
              label="Title"
              placeholder="e.g. NATA Drawing Preparation"
              fullWidth
              required
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              InputProps={{ sx: { minHeight: 48 } }}
              autoFocus
            />
            <TextField
              label="Description (optional)"
              placeholder="What is this checklist about?"
              fullWidth
              multiline
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: isMobile ? 4 : 2, pt: 1 }}>
          {!isMobile && (
            <Button onClick={handleClose} sx={{ minHeight: 48, textTransform: 'none' }}>
              Cancel
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={submitting || !formData.title.trim()}
            fullWidth={isMobile}
            sx={{
              minHeight: 48,
              borderRadius: 2.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {submitting ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
