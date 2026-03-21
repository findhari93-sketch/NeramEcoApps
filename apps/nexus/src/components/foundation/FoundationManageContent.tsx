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
  ToggleButton,
  ToggleButtonGroup,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import OndemandVideoOutlinedIcon from '@mui/icons-material/OndemandVideoOutlined';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import QuizOutlinedIcon from '@mui/icons-material/QuizOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import ThumbUpOutlinedIcon from '@mui/icons-material/ThumbUpOutlined';
import ThumbDownOutlinedIcon from '@mui/icons-material/ThumbDownOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import type { NexusFoundationChapterAdmin } from '@neram/database/types';

interface FoundationManageContentProps {
  /** URL prefix for chapter editor links. Defaults to '/teacher/foundation/manage' */
  chapterLinkPrefix?: string;
  /** Hide the PageHeader (when embedded in a parent page that already has one) */
  hideHeader?: boolean;
}

export default function FoundationManageContent({
  chapterLinkPrefix = '/teacher/foundation/manage',
  hideHeader = false,
}: FoundationManageContentProps) {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const [chapters, setChapters] = useState<NexusFoundationChapterAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newChapter, setNewChapter] = useState({
    title: '',
    video_source: 'youtube' as 'youtube' | 'sharepoint',
    youtube_video_id: '',
    sharepoint_video_url: '',
    chapter_number: 0,
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
    const hasVideo = newChapter.video_source === 'youtube'
      ? newChapter.youtube_video_id.trim()
      : newChapter.sharepoint_video_url.trim();
    if (!newChapter.title.trim() || !hasVideo) return;
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
        setNewChapter({ title: '', video_source: 'youtube', youtube_video_id: '', sharepoint_video_url: '', chapter_number: chapters.length });
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
      {!hideHeader && (
        <PageHeader
          title="Manage Foundation"
          subtitle="Create and manage learning chapters, sections, and quiz questions"
          action={
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setNewChapter(prev => ({ ...prev, chapter_number: chapters.length }));
                setCreateOpen(true);
              }}
              sx={{ textTransform: 'none', borderRadius: 2, display: { xs: 'none', sm: 'flex' } }}
            >
              Add Chapter
            </Button>
          }
        />
      )}

      {hideHeader && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Chapters ({loading ? '...' : chapters.length})
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setNewChapter(prev => ({ ...prev, chapter_number: chapters.length }));
              setCreateOpen(true);
            }}
            sx={{ textTransform: 'none', borderRadius: 2, display: { xs: 'none', sm: 'flex' } }}
            size="small"
          >
            Add Chapter
          </Button>
        </Box>
      )}

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
                onClick={() => router.push(`${chapterLinkPrefix}/${chapter.id}`)}
              >
                {/* Top row: badge + title + publish toggle */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {/* Chapter number badge */}
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: theme.palette.primary.main,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      flexShrink: 0,
                    }}
                  >
                    {chapter.chapter_number}
                  </Box>

                  {/* Title */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <Typography variant="body1" sx={{ fontWeight: 600, fontSize: { xs: '0.88rem', sm: '0.95rem' } }} noWrap>
                        {chapter.title}
                      </Typography>
                      {!chapter.is_published && (
                        <Chip label="Draft" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600, flexShrink: 0 }} />
                      )}
                    </Box>
                  </Box>

                  {/* Actions: compact on mobile */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <Switch
                      size="small"
                      checked={chapter.is_published}
                      onChange={() => handleTogglePublish(chapter)}
                    />
                    <IconButton
                      size="small"
                      onClick={() => setDeleteId(chapter.id)}
                      sx={{ color: 'text.secondary', '&:hover': { color: theme.palette.error.main } }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: '1.1rem' }} />
                    </IconButton>
                  </Box>
                </Box>

                {/* Bottom row: Stats */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1.25, sm: 2 }, flexWrap: 'wrap', mt: 1, ml: { xs: 0, sm: 6 } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <LayersOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      {chapter.section_count} sec
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <QuizOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      {chapter.question_count} qs
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {chapter.video_source === 'sharepoint' ? (
                      <CloudOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
                    ) : (
                      <OndemandVideoOutlinedIcon sx={{ fontSize: '0.8rem', color: 'text.secondary' }} />
                    )}
                    <Typography variant="caption" noWrap sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.65rem', maxWidth: { xs: 80, sm: 'none' } }}>
                      {chapter.video_source === 'sharepoint' ? 'SharePoint' : chapter.youtube_video_id}
                    </Typography>
                  </Box>
                  {((chapter as any).like_count > 0 || (chapter as any).dislike_count > 0) && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <ThumbUpOutlinedIcon sx={{ fontSize: '0.75rem', color: 'success.main' }} />
                        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, fontSize: '0.7rem' }}>
                          {(chapter as any).like_count}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        <ThumbDownOutlinedIcon sx={{ fontSize: '0.75rem', color: 'error.main' }} />
                        <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600, fontSize: '0.7rem' }}>
                          {(chapter as any).dislike_count}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Paper>
            ))
        }
      </Box>

      {/* Mobile FAB */}
      <Fab
        color="primary"
        onClick={() => {
          setNewChapter(prev => ({ ...prev, chapter_number: chapters.length }));
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
            <Box>
              <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', mb: 0.5, display: 'block' }}>
                Video Source
              </Typography>
              <ToggleButtonGroup
                value={newChapter.video_source}
                exclusive
                onChange={(_, val) => val && setNewChapter(prev => ({ ...prev, video_source: val }))}
                size="small"
                fullWidth
              >
                <ToggleButton value="youtube" sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                  <OndemandVideoOutlinedIcon sx={{ fontSize: '1rem', mr: 0.5 }} /> YouTube
                </ToggleButton>
                <ToggleButton value="sharepoint" sx={{ textTransform: 'none', fontSize: '0.8rem', fontWeight: 600 }}>
                  <CloudOutlinedIcon sx={{ fontSize: '1rem', mr: 0.5 }} /> SharePoint
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
            {newChapter.video_source === 'youtube' ? (
              <TextField
                label="YouTube Video ID"
                placeholder="e.g. dQw4w9WgXcQ"
                value={newChapter.youtube_video_id}
                onChange={(e) => setNewChapter(prev => ({ ...prev, youtube_video_id: e.target.value }))}
                fullWidth
                size="small"
              />
            ) : (
              <TextField
                label="SharePoint Video URL"
                placeholder="Paste the video URL from SharePoint"
                value={newChapter.sharepoint_video_url}
                onChange={(e) => setNewChapter(prev => ({ ...prev, sharepoint_video_url: e.target.value }))}
                fullWidth
                size="small"
                helperText="Copy the video link from SharePoint/Stream and paste here"
              />
            )}
            <TextField
              label="Chapter #"
              type="number"
              value={newChapter.chapter_number}
              onChange={(e) => {
                const val = parseInt(e.target.value);
                setNewChapter(prev => ({ ...prev, chapter_number: isNaN(val) ? 0 : val }));
              }}
              size="small"
              sx={{ width: 120 }}
              inputProps={{ min: 0 }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={creating || !newChapter.title.trim() || (newChapter.video_source === 'youtube' ? !newChapter.youtube_video_id.trim() : !newChapter.sharepoint_video_url.trim())}
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
