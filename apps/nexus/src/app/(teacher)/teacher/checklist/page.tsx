'use client';

import { useState, useEffect, useCallback } from 'react';
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
  LinearProgress,
  alpha,
  useTheme,
  useMediaQuery,
  Slide,
  IconButton,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import PeopleOutlinedIcon from '@mui/icons-material/PeopleOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import PsychologyOutlinedIcon from '@mui/icons-material/PsychologyOutlined';
import BrushOutlinedIcon from '@mui/icons-material/BrushOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import { TransitionProps } from '@mui/material/transitions';
import React from 'react';

interface ChecklistItem {
  id: string;
  title: string;
  topic: { id: string; title: string; category: string } | null;
  resource_count: number;
  completed_count: number;
  total_students: number;
}

interface TopicOption {
  id: string;
  title: string;
  category: string;
}

interface ItemFormData {
  title: string;
  topic_id: string;
  resource_urls: string;
}

const emptyForm: ItemFormData = {
  title: '',
  topic_id: '',
  resource_urls: '',
};

// Category icon + color mapping for visual differentiation
const categoryConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  mathematics: { icon: <CalculateOutlinedIcon />, color: '#1976D2', label: 'Mathematics' },
  aptitude: { icon: <PsychologyOutlinedIcon />, color: '#E65100', label: 'Aptitude' },
  drawing: { icon: <BrushOutlinedIcon />, color: '#7B1FA2', label: 'Drawing' },
  architecture_awareness: { icon: <AccountBalanceOutlinedIcon />, color: '#00695C', label: 'Architecture' },
  general: { icon: <FolderOutlinedIcon />, color: '#546E7A', label: 'General' },
  uncategorized: { icon: <FolderOutlinedIcon />, color: '#78909C', label: 'Other' },
};

const getCategoryConfig = (category: string) =>
  categoryConfig[category] || categoryConfig.uncategorized;

// Mobile bottom-sheet style transition
const SlideTransition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>,
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

export default function TeacherChecklist() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { activeClassroom, getToken } = useNexusAuthContext();
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ItemFormData>(emptyForm);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const fetchItems = useCallback(async () => {
    if (!activeClassroom) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch(
        `/api/checklist?classroom=${activeClassroom.id}&mode=manage`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load checklist:', err);
    } finally {
      setLoading(false);
    }
  }, [activeClassroom, getToken]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Fetch topics for the dialog
  useEffect(() => {
    if (!activeClassroom) return;

    async function fetchTopics() {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/topics?classroom=${activeClassroom!.id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setTopics(data.topics || []);
        }
      } catch (err) {
        console.error('Failed to load topics:', err);
      }
    }

    fetchTopics();
  }, [activeClassroom, getToken]);

  const handleOpenAdd = () => {
    setFormData(emptyForm);
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
    setFormData(emptyForm);
  };

  const handleSubmit = async () => {
    if (!activeClassroom) return;
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const resourceUrls = formData.resource_urls
        .split('\n')
        .map((url) => url.trim())
        .filter((url) => url.length > 0);

      const res = await fetch('/api/checklist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: formData.title,
          topic_id: formData.topic_id || null,
          resource_urls: resourceUrls,
          classroom_id: activeClassroom.id,
        }),
      });

      if (res.ok) {
        handleClose();
        fetchItems();
      }
    } catch (err) {
      console.error('Failed to create checklist item:', err);
    } finally {
      setSubmitting(false);
    }
  };

  // Group items by topic category
  const groupedItems = items.reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    const category = item.topic?.category || 'uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(item);
    return acc;
  }, {});

  // Overall stats
  const totalItems = items.length;
  const fullyCompleted = items.filter((i) => i.total_students > 0 && i.completed_count === i.total_students).length;
  const overallPercent = totalItems > 0 ? Math.round((fullyCompleted / totalItems) * 100) : 0;

  return (
    <Box sx={{ position: 'relative', minHeight: '60vh', pb: 10 }}>
      <PageHeader title="Checklist" subtitle={`${totalItems} items across ${Object.keys(groupedItems).length} categories`} />

      {/* Overall Progress Card */}
      {!loading && totalItems > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 2.5,
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.04)} 0%, ${alpha(theme.palette.success.main, 0.04)} 100%)`,
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CheckCircleOutlinedIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} />
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                Class Progress
              </Typography>
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
              {fullyCompleted}/{totalItems} complete
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={overallPercent}
            sx={{
              height: 8,
              borderRadius: 4,
              bgcolor: alpha(theme.palette.success.main, 0.1),
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                bgcolor: 'success.main',
              },
            }}
          />
        </Paper>
      )}

      {/* Loading State */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Skeleton variant="rounded" height={60} sx={{ borderRadius: 3 }} />
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ borderRadius: 2.5 }} />
          ))}
        </Box>
      ) : totalItems === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 3, sm: 4 },
            textAlign: 'center',
            borderRadius: 3,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          <CheckCircleOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1.5 }} />
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>
            No Checklist Items
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Create checklist items for students to track their learning progress.
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenAdd}
            sx={{ mt: 2, minHeight: 48, borderRadius: 2.5, textTransform: 'none', fontWeight: 600 }}
          >
            Add First Item
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {Object.entries(groupedItems)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, categoryItems]) => {
              const config = getCategoryConfig(category);
              const categoryCompleted = categoryItems.filter(
                (i) => i.total_students > 0 && i.completed_count === i.total_students
              ).length;

              return (
                <Box key={category}>
                  {/* Category Header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                      mb: 1.5,
                      px: 0.5,
                    }}
                  >
                    <Box
                      sx={{
                        width: 28,
                        height: 28,
                        borderRadius: 1.5,
                        bgcolor: alpha(config.color, 0.1),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        '& .MuiSvgIcon-root': { fontSize: '0.95rem', color: config.color },
                      }}
                    >
                      {config.icon}
                    </Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, flex: 1, color: config.color }}>
                      {config.label}
                    </Typography>
                    <Chip
                      label={`${categoryCompleted}/${categoryItems.length}`}
                      size="small"
                      sx={{
                        height: 22,
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        bgcolor: alpha(config.color, 0.08),
                        color: config.color,
                      }}
                    />
                  </Box>

                  {/* Category Items */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {categoryItems.map((item, idx) => {
                      const pct = item.total_students > 0
                        ? Math.round((item.completed_count / item.total_students) * 100)
                        : 0;
                      const isComplete = item.total_students > 0 && item.completed_count === item.total_students;

                      return (
                        <Paper
                          key={item.id}
                          elevation={0}
                          sx={{
                            p: 2,
                            borderRadius: 2.5,
                            border: `1px solid ${theme.palette.divider}`,
                            borderLeft: `4px solid ${isComplete ? theme.palette.success.main : alpha(config.color, 0.5)}`,
                            transition: 'all 200ms ease',
                            animation: `fadeIn 300ms ease ${idx * 40}ms both`,
                            '@keyframes fadeIn': {
                              from: { opacity: 0, transform: 'translateY(4px)' },
                              to: { opacity: 1, transform: 'translateY(0)' },
                            },
                            '&:active': { transform: 'scale(0.99)' },
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                            <Box sx={{ flex: 1, minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                                {item.title}
                              </Typography>
                              {item.topic && (
                                <Typography variant="caption" sx={{ color: config.color, fontWeight: 500 }}>
                                  {item.topic.title}
                                </Typography>
                              )}
                            </Box>
                            {item.resource_count > 0 && (
                              <Chip
                                icon={<LinkOutlinedIcon sx={{ fontSize: '0.8rem !important' }} />}
                                label={item.resource_count}
                                size="small"
                                variant="outlined"
                                sx={{ height: 24, fontSize: '0.7rem', fontWeight: 600, borderRadius: 1.5 }}
                              />
                            )}
                          </Box>

                          {/* Progress bar */}
                          <Box sx={{ mt: 1.5 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <PeopleOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.disabled' }} />
                                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                                  {item.completed_count}/{item.total_students} students
                                </Typography>
                              </Box>
                              <Typography
                                variant="caption"
                                sx={{
                                  fontWeight: 700,
                                  color: isComplete ? 'success.main' : pct > 0 ? config.color : 'text.disabled',
                                }}
                              >
                                {pct}%
                              </Typography>
                            </Box>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              sx={{
                                height: 6,
                                borderRadius: 3,
                                bgcolor: alpha(isComplete ? theme.palette.success.main : config.color, 0.08),
                                '& .MuiLinearProgress-bar': {
                                  borderRadius: 3,
                                  bgcolor: isComplete ? 'success.main' : config.color,
                                },
                              }}
                            />
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              );
            })}
        </Box>
      )}

      {/* Add Item FAB */}
      <Fab
        color="primary"
        aria-label="Add checklist item"
        onClick={handleOpenAdd}
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

      {/* Add Item Dialog — bottom sheet on mobile */}
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
          Add Checklist Item
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
              placeholder="e.g. Complete perspective drawing worksheet"
              fullWidth
              value={formData.title}
              onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
              InputProps={{ sx: { minHeight: 48 } }}
            />
            <TextField
              label="Topic (optional)"
              select
              fullWidth
              value={formData.topic_id}
              onChange={(e) => setFormData((f) => ({ ...f, topic_id: e.target.value }))}
              SelectProps={{ native: true }}
              InputLabelProps={{ shrink: true }}
            >
              <option value="">None</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </TextField>
            <TextField
              label="Resource URLs (optional)"
              fullWidth
              multiline
              rows={3}
              value={formData.resource_urls}
              onChange={(e) => setFormData((f) => ({ ...f, resource_urls: e.target.value }))}
              placeholder={'https://youtube.com/...\nhttps://example.com/notes.pdf'}
              helperText="One URL per line. YouTube, PDF, and image links are auto-detected."
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
            onClick={handleSubmit}
            disabled={submitting || !formData.title}
            fullWidth={isMobile}
            sx={{
              minHeight: 48,
              borderRadius: 2.5,
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.9rem',
            }}
          >
            {submitting ? 'Creating...' : 'Create Item'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
