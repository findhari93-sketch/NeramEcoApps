'use client';

/**
 * StudyCommentPanel — Google Classroom style comments for a Study Materials file.
 *
 * Two tabs:
 *   - Class   (public):  visible to everyone in the file's audience + teachers
 *   - Private (private): visible only to this student and the teachers
 *
 * The GET endpoint already returns exactly what the viewer may see (public stream + own private
 * thread), so we fetch once and split by visibility. Adapted from components/drawings/CommentSection.tsx.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, UserAvatar, TextField, IconButton, Chip, Tabs, Tab, Skeleton, Stack, CircularProgress,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import type { NexusStudyFileCommentWithAuthor, NexusStudyCommentVisibility } from '@neram/database/types';

interface StudyCommentPanelProps {
  fileId: string;
  getToken: () => Promise<string | null>;
  /** Optional: hide the composer (e.g. read-only preview). */
  canComment?: boolean;
}

export default function StudyCommentPanel({ fileId, getToken, canComment = true }: StudyCommentPanelProps) {
  const [comments, setComments] = useState<NexusStudyFileCommentWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<NexusStudyCommentVisibility>('public');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [fileId, getToken]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const { publicComments, privateComments } = useMemo(() => ({
    publicComments: comments.filter((c) => c.visibility === 'public'),
    privateComments: comments.filter((c) => c.visibility === 'private'),
  }), [comments]);

  const shown = tab === 'public' ? publicComments : privateComments;

  const handleSend = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/study-materials/files/${fileId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, visibility: tab }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setText('');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not post your comment. Please try again.');
      }
    } catch {
      setError('Could not post your comment. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{ minHeight: 44, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}
      >
        <Tab
          value="public"
          iconPosition="start"
          icon={<GroupsOutlinedIcon fontSize="small" />}
          label={`Class${publicComments.length ? ` (${publicComments.length})` : ''}`}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        />
        <Tab
          value="private"
          iconPosition="start"
          icon={<LockOutlinedIcon fontSize="small" />}
          label={`Private${privateComments.length ? ` (${privateComments.length})` : ''}`}
          sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
        />
      </Tabs>

      <Typography variant="caption" color="text.secondary" sx={{ px: 2, pt: 1, flexShrink: 0 }}>
        {tab === 'public'
          ? 'Everyone in your class and your teachers can see this.'
          : 'Only your teachers can see this. Use it to report a problem with this file.'}
      </Typography>

      {/* Scrollable comment list */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 }}>
        {loading ? (
          <Stack spacing={1.5}>
            {[0, 1, 2].map((i) => (
              <Box key={i} sx={{ display: 'flex', gap: 1 }}>
                <Skeleton variant="circular" width={32} height={32} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="40%" height={16} />
                  <Skeleton width="90%" height={16} />
                </Box>
              </Box>
            ))}
          </Stack>
        ) : shown.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
            <ForumOutlinedIcon sx={{ fontSize: 40, opacity: 0.4, mb: 1 }} />
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {tab === 'public' ? 'No class comments yet' : 'No private messages yet'}
            </Typography>
            <Typography variant="caption">
              {canComment
                ? (tab === 'public' ? 'Start the discussion below.' : 'Ask a doubt or report an issue below.')
                : 'Check back later.'}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1.75}>
            {shown.map((c) => (
              <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                <UserAvatar src={c.author?.avatar_url} name={c.author?.name} size={32} sx={{ mt: 0.25 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ fontWeight: 700 }}>
                      {c.author?.name || 'User'}
                    </Typography>
                    <Chip
                      label={c.author_role === 'teacher' ? 'Teacher' : 'Student'}
                      size="small"
                      color={c.author_role === 'teacher' ? 'primary' : 'default'}
                      sx={{ height: 18, fontSize: '0.62rem' }}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {getRelativeTime(c.created_at)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.5, wordBreak: 'break-word' }}>
                    {c.body}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        )}
      </Box>

      {/* Composer */}
      {canComment && (
        <Box sx={{ flexShrink: 0, borderTop: 1, borderColor: 'divider', p: 1.5 }}>
          {error && (
            <Typography variant="caption" color="error" sx={{ display: 'block', mb: 0.5 }}>
              {error}
            </Typography>
          )}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
            <TextField
              placeholder={tab === 'public' ? 'Add a class comment...' : 'Message your teacher...'}
              size="small"
              fullWidth
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              multiline
              maxRows={4}
              inputProps={{ 'aria-label': tab === 'public' ? 'Add a class comment' : 'Message your teacher' }}
            />
            <IconButton
              onClick={handleSend}
              disabled={!text.trim() || sending}
              color="primary"
              aria-label="Send comment"
              sx={{ width: 44, height: 44 }}
            >
              {sending ? <CircularProgress size={18} /> : <SendIcon />}
            </IconButton>
          </Box>
        </Box>
      )}
    </Box>
  );
}

function getRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}
