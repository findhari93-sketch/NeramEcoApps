'use client';

/**
 * Teacher "Materials Feedback" inbox — the lightweight review side of Study Materials comments.
 * Lists open (unresolved) student comment threads across all materials. Opening a thread lets a
 * teacher read it, reply (into the class stream or the student's private channel), moderate
 * (soft-delete) a comment, and mark the whole thread resolved.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Badge, IconButton, TextField, Button, Tooltip,
  UserAvatar, Skeleton, EmptyState, Drawer, SwipeableDrawer, Snackbar, Alert, CircularProgress,
  alpha, useTheme, useMediaQuery,
} from '@neram/ui';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusStudyFeedbackThread, NexusStudyFileCommentWithAuthor } from '@neram/database/types';

function threadKey(t: Pick<NexusStudyFeedbackThread, 'file_id' | 'visibility' | 'student'>): string {
  return `${t.file_id}::${t.visibility}::${t.student?.id ?? 'public'}`;
}

function relTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function MaterialsFeedbackPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [threads, setThreads] = useState<NexusStudyFeedbackThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selected, setSelected] = useState<NexusStudyFeedbackThread | null>(null);
  const [threadComments, setThreadComments] = useState<NexusStudyFileCommentWithAuthor[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/study-materials/feedback', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'Could not load feedback');
      }
      const data = await res.json();
      setThreads(Array.isArray(data.threads) ? data.threads : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const openThread = useCallback(async (t: NexusStudyFeedbackThread) => {
    setSelected(t);
    setReply('');
    setThreadLoading(true);
    setThreadComments([]);
    try {
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${t.file_id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const all: NexusStudyFileCommentWithAuthor[] = Array.isArray(data.comments) ? data.comments : [];
      const filtered = all.filter((c) =>
        t.visibility === 'public'
          ? c.visibility === 'public'
          : c.visibility === 'private' && c.thread_student_id === t.student?.id,
      );
      setThreadComments(filtered);
    } catch {
      setThreadComments([]);
    } finally {
      setThreadLoading(false);
    }
  }, [getToken]);

  const closeThread = () => setSelected(null);

  const sendReply = async () => {
    const body = reply.trim();
    if (!body || !selected || sending) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${selected.file_id}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          visibility: selected.visibility,
          thread_student_id: selected.visibility === 'private' ? selected.student?.id : undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setThreadComments((prev) => [...prev, data.comment]);
        setReply('');
      } else {
        setToast('Could not send reply');
      }
    } catch {
      setToast('Could not send reply');
    } finally {
      setSending(false);
    }
  };

  const resolveThread = async () => {
    if (!selected || resolving) return;
    setResolving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/study-materials/feedback/resolve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: selected.file_id,
          visibility: selected.visibility,
          thread_student_id: selected.visibility === 'private' ? selected.student?.id : null,
        }),
      });
      if (res.ok) {
        const key = threadKey(selected);
        setThreads((prev) => prev.filter((t) => threadKey(t) !== key));
        setSelected(null);
        setToast('Marked resolved');
      } else {
        setToast('Could not resolve');
      }
    } catch {
      setToast('Could not resolve');
    } finally {
      setResolving(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!selected) return;
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/study-materials/files/${selected.file_id}/comments?commentId=${commentId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        setThreadComments((prev) => prev.filter((c) => c.id !== commentId));
        setToast('Comment hidden');
      } else {
        setToast('Could not hide comment');
      }
    } catch {
      setToast('Could not hide comment');
    }
  };

  const header = (
    <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <RateReviewOutlinedIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Materials Feedback</Typography>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Open questions and reported issues from students on your study materials.
        </Typography>
      </Box>
      <IconButton onClick={load} aria-label="Refresh" sx={{ width: 44, height: 44 }}>
        <RefreshOutlinedIcon />
      </IconButton>
    </Box>
  );

  const threadBody = !selected ? null : (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Drawer header */}
        <Box sx={{ p: 2, borderBottom: `1px solid ${theme.palette.divider}`, flexShrink: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>{selected.file_title}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {selected.breadcrumb.map((b) => b.name).join(' › ') || 'Study Materials'}
              </Typography>
            </Box>
            <IconButton size="small" onClick={closeThread} aria-label="Close" sx={{ width: 40, height: 40 }}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
            <Chip
              size="small"
              icon={selected.visibility === 'public' ? <GroupsOutlinedIcon /> : <LockOutlinedIcon />}
              label={selected.visibility === 'public' ? 'Class comments' : `Private · ${selected.student?.name || 'Student'}`}
              color={selected.visibility === 'public' ? 'default' : 'primary'}
              variant="outlined"
            />
          </Stack>
        </Box>

        {/* Thread */}
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', p: 2 }}>
          {threadLoading ? (
            <Stack spacing={1.5}>{[0, 1].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                <Skeleton variant="circular" width={32} height={32} />
                <Box sx={{ flex: 1 }}><Skeleton width="50%" /><Skeleton width="85%" /></Box>
              </Box>
            ))}</Stack>
          ) : threadComments.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No comments in this thread.</Typography>
          ) : (
            <Stack spacing={1.75}>
              {threadComments.map((c) => (
                <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <UserAvatar src={c.author?.avatar_url} name={c.author?.name} size={32} sx={{ mt: 0.25 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>{c.author?.name || 'User'}</Typography>
                      <Chip label={c.author_role === 'teacher' ? 'Teacher' : 'Student'} size="small"
                        color={c.author_role === 'teacher' ? 'primary' : 'default'} sx={{ height: 18, fontSize: '0.62rem' }} />
                      <Typography variant="caption" color="text.secondary">{relTime(c.created_at)}</Typography>
                      <Box sx={{ flex: 1 }} />
                      <Tooltipish onDelete={() => deleteComment(c.id)} />
                    </Box>
                    <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.5, wordBreak: 'break-word' }}>{c.body}</Typography>
                  </Box>
                </Box>
              ))}
            </Stack>
          )}
        </Box>

        {/* Actions */}
        <Box sx={{ flexShrink: 0, borderTop: `1px solid ${theme.palette.divider}`, p: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', mb: 1 }}>
            <TextField
              placeholder={selected.visibility === 'public' ? 'Reply to the class...' : `Reply to ${selected.student?.name || 'student'}...`}
              size="small" fullWidth multiline maxRows={4} value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              inputProps={{ 'aria-label': 'Reply' }}
            />
            <IconButton onClick={sendReply} disabled={!reply.trim() || sending} color="primary" aria-label="Send reply" sx={{ width: 44, height: 44 }}>
              {sending ? <CircularProgress size={18} /> : <SendIcon />}
            </IconButton>
          </Box>
          <Button
            fullWidth variant="contained" color="success" startIcon={resolving ? <CircularProgress size={16} color="inherit" /> : <CheckCircleOutlineIcon />}
            onClick={resolveThread} disabled={resolving} sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Mark resolved
          </Button>
        </Box>
      </Box>
  );

  return (
    <Box>
      {header}

      {loading ? (
        <Stack spacing={1.25}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} variant="rounded" height={78} />)}
        </Stack>
      ) : error ? (
        <EmptyState title="Could not load feedback" description={error} icon={<InboxOutlinedIcon />}
          action={<Button variant="outlined" onClick={load}>Try again</Button>} />
      ) : threads.length === 0 ? (
        <EmptyState title="All caught up" description="No open comments from students right now." icon={<CheckCircleOutlineIcon />} />
      ) : (
        <Stack spacing={1.25}>
          {threads.map((t) => (
            <Paper
              key={threadKey(t)}
              elevation={0}
              onClick={() => openThread(t)}
              sx={{
                p: 1.5, border: `1px solid ${theme.palette.divider}`, borderRadius: 2, cursor: 'pointer',
                transition: 'background-color 150ms ease, box-shadow 150ms ease',
                '&:hover': { boxShadow: `0 4px 14px ${alpha('#000', 0.08)}`, bgcolor: alpha(theme.palette.primary.main, 0.02) },
                display: 'flex', gap: 1.5, alignItems: 'center',
              }}
            >
              {t.visibility === 'private' ? (
                <UserAvatar src={t.student?.avatar_url} name={t.student?.name} size={40} />
              ) : (
                <Box sx={{ width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: alpha(theme.palette.text.secondary, 0.1) }}>
                  <GroupsOutlinedIcon sx={{ color: 'text.secondary' }} />
                </Box>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }} noWrap>{t.file_title}</Typography>
                  <Chip size="small" label={t.visibility === 'public' ? 'Class' : t.student?.name || 'Private'}
                    icon={t.visibility === 'public' ? <GroupsOutlinedIcon /> : <LockOutlinedIcon />}
                    sx={{ height: 18, fontSize: '0.6rem', '& .MuiChip-icon': { fontSize: '0.75rem' } }} />
                </Box>
                <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                  {t.latest_snippet}
                </Typography>
                <Typography variant="caption" color="text.disabled" noWrap sx={{ display: 'block', fontSize: '0.62rem' }}>
                  {(t.breadcrumb.map((b) => b.name).join(' › ')) || 'Study Materials'} · {relTime(t.latest_at)}
                </Typography>
              </Box>
              <Badge badgeContent={t.open_count} color="error" sx={{ mr: 1 }} />
            </Paper>
          ))}
        </Stack>
      )}

      {/* Thread drawer: bottom sheet on mobile, right panel on desktop */}
      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom" open={!!selected} onClose={closeThread} onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{ sx: { height: '88vh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } }}
        >
          {threadBody}
        </SwipeableDrawer>
      ) : (
        <Drawer anchor="right" open={!!selected} onClose={closeThread} PaperProps={{ sx: { width: 460, maxWidth: '100vw' } }}>
          {threadBody}
        </Drawer>
      )}

      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="info" variant="filled" onClose={() => setToast(null)} sx={{ width: '100%' }}>{toast}</Alert>
      </Snackbar>
    </Box>
  );
}

/** Small inline moderation control (hide/soft-delete a comment). */
function Tooltipish({ onDelete }: { onDelete: () => void }) {
  return (
    <Tooltip title="Hide from students">
      <IconButton size="small" onClick={onDelete} aria-label="Hide comment" sx={{ p: 0.25 }}>
        <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
      </IconButton>
    </Tooltip>
  );
}
