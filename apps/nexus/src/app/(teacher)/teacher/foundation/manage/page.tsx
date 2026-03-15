'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Switch,
  Chip,
  Skeleton,
  Fab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  alpha,
  useTheme,
  IconButton,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import type { NexusFoundationChapterAdmin } from '@neram/database/types';

export default function ManageFoundationPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const [chapters, setChapters] = useState<NexusFoundationChapterAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newChapter, setNewChapter] = useState({
    title: '',
    youtube_video_id: '',
    chapter_number: 1,
    min_quiz_score_pct: 90,
  });
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/admin/chapters', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters || []);
      }
    } catch (err) {
      console.error('Failed to load chapters:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchChapters();
  }, [authLoading, fetchChapters]);

  const handleCreate = async () => {
    if (!newChapter.title.trim() || !newChapter.youtube_video_id.trim()) return;
    setCreating(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/admin/chapters', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(newChapter),
      });
      if (res.ok) {
        setCreateOpen(false);
        setNewChapter({ title: '', youtube_video_id: '', chapter_number: chapters.length + 1, min_quiz_score_pct: 90 });
        await fetchChapters();
      }
    } catch (err) {
      console.error('Failed to create chapter:', err);
    } finally {
      setCreating(false);
    }
  };

  const handleTogglePublish = async (chapter: NexusFoundationChapterAdmin) => {
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/foundation/admin/chapters/${chapter.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !chapter.is_published }),
      });
      setChapters(prev => prev.map(c =>
        c.id === chapter.id ? { ...c, is_published: !c.is_published } : c
      ));
    } catch (err) {
      console.error('Failed to toggle publish:', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) return;
      await fetch(`/api/foundation/admin/chapters/${deleteId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteId(null);
      await fetchChapters();
    } catch (err) {
      console.error('Failed to delete chapter:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Manage Foundation"
        subtitle="Create and manage learning chapters, sections, and quiz questions"
        action={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setNewChapter(prev => ({ ...prev, chapter_number: chapters.length + 1 }));
              setCreateOpen(true);
            }}
            sx={{ textTransform: 'none', borderRadius: 2, display: { xs: 'none', sm: 'flex' } }}
          >
            Add Chapter
          </Button>
        }
      />

      {/* Chapter List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 2.5 }} />
            ))
          : chapters.length === 0
            ? (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, border: `1px solid ${theme.palette.divider}` }}>
                <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
                  No chapters yet
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.disabled', mb: 2 }}>
                  Create your first foundation chapter to get started.
                </Typography>
                <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} sx={{ textTransform: 'none' }}>
                  Create Chapter
                </Button>
              </Paper>
            )
            : chapters.map((chapter) => (
              <Paper
                key={chapter.id}
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 2.5,
                  border: `1px solid ${theme.palette.divider}`,
                  cursor: 'pointer',
                  transition: 'border-color 200ms',
                  '&:hover': { borderColor: theme.palette.primary.main },
                  opacity: chapter.is_published ? 1 : 0.75,
                }}
                onClick={() => router.push(`/teacher/foundation/manage/${chapter.id}`)}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  {/* Chapter number badge */}
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '1rem',
                      flexShrink: 0,
                    }}
                  >
                    {chapter.chapter_number}
                  </Box>

                  {/* Info */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '0.95rem' }} noWrap>
                        {chapter.title}
                      </Typography>
                      {!chapter.is_published && (
                        <Chip label="Draft" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }} />
                      )}
                    </Box>

                    {/* Stats */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <LayersOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {chapter.section_count} sections
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <QuizOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                          {chapter.question_count} questions
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <OndemandVideoOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
                          {chapter.youtube_video_id}
                        </Typography>
                      </Box>
                      {((chapter as any).like_count > 0 || (chapter as any).dislike_count > 0) && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                            <ThumbUpOutlinedIcon sx={{ fontSize: '0.8rem', color: 'success.main' }} />
                            <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                              {(chapter as any).like_count}
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                            <ThumbDownOutlinedIcon sx={{ fontSize: '0.8rem', color: 'error.main' }} />
                            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                              {(chapter as any).dislike_count}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    </Box>
                  </Box>

                  {/* Actions */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} onClick={(e) => e.stopPropagation()}>
                    <Switch
                      size="small"
                      checked={chapter.is_published}
                      onChange={() => handleTogglePublish(chapter)}
                      sx={{ mr: 0.5 }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => router.push(`/teacher/foundation/manage/${chapter.id}`)}
                      sx={{ color: 'text.secondary' }}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => setDeleteId(chapter.id)}
                      sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.error.main } }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </Paper>
            ))
        }
      </Box>

      {/* Mobile FAB */}
      <Fab
        color="primary"
        onClick={() => {
          setNewChapter(prev => ({ ...prev, chapter_number: chapters.length + 1 }));
          setCreateOpen(true);
        }}
        sx={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          display: { xs: 'flex', sm: 'none' },
        }}
      >
        <AddIcon />
      </Fab>

      {/* Create Dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Create New Chapter</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Chapter Title"
              value={newChapter.title}
              onChange={(e) => setNewChapter(prev => ({ ...prev, title: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="YouTube Video ID"
              placeholder="e.g. dQw4w9WgXcQ"
              value={newChapter.youtube_video_id}
              onChange={(e) => setNewChapter(prev => ({ ...prev, youtube_video_id: e.target.value }))}
              fullWidth
              size="small"
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Chapter #"
                type="number"
                value={newChapter.chapter_number}
                onChange={(e) => setNewChapter(prev => ({ ...prev, chapter_number: parseInt(e.target.value) || 1 }))}
                size="small"
                sx={{ width: 120 }}
              />
              <TextField
                label="Pass Score %"
                type="number"
                value={newChapter.min_quiz_score_pct}
                onChange={(e) => setNewChapter(prev => ({ ...prev, min_quiz_score_pct: parseInt(e.target.value) || 90 }))}
                size="small"
                sx={{ width: 120 }}
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newChapter.title.trim() || !newChapter.youtube_video_id.trim()}
            sx={{ textTransform: 'none' }}
          >
            {creating ? 'Creating...' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Chapter?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This will permanently delete the chapter, all its sections, quiz questions, and student progress data. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={deleting}
            sx={{ textTransform: 'none' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
