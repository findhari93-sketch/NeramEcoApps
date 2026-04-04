'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Avatar, TextField, IconButton, Paper, Chip,
  CircularProgress,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import type { DrawingSubmissionCommentWithAuthor } from '@neram/database/types';

interface CommentSectionProps {
  submissionId: string;
  getToken: () => Promise<string | null>;
  canComment?: boolean;
  /** Pre-loaded comments (skip fetch if provided) */
  initialComments?: DrawingSubmissionCommentWithAuthor[];
}

export default function CommentSection({
  submissionId, getToken, canComment = true, initialComments,
}: CommentSectionProps) {
  const [comments, setComments] = useState<DrawingSubmissionCommentWithAuthor[]>(initialComments || []);
  const [loading, setLoading] = useState(!initialComments);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const fetchComments = useCallback(async () => {
    if (initialComments) return;
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${submissionId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setComments(data.comments || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [submissionId, getToken, initialComments]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${submissionId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: text.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setComments((prev) => [...prev, data.comment]);
        setText('');
      }
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ py: 2, textAlign: 'center' }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        COMMENTS {comments.length > 0 && `(${comments.length})`}
      </Typography>

      {comments.length === 0 && !canComment && (
        <Typography variant="caption" color="text.secondary">No comments yet</Typography>
      )}

      {/* Comment list */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: canComment ? 1.5 : 0 }}>
        {comments.map((c) => (
          <Box key={c.id} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <Avatar
              src={c.author?.avatar_url || undefined}
              sx={{ width: 28, height: 28, fontSize: '0.7rem', mt: 0.25, bgcolor: c.author_role === 'teacher' ? 'primary.main' : 'grey.400' }}
            >
              {c.author?.name?.charAt(0) || '?'}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="caption" fontWeight={600}>
                  {c.author?.name || 'User'}
                </Typography>
                <Chip
                  label={c.author_role === 'teacher' ? 'Teacher' : 'Student'}
                  size="small"
                  color={c.author_role === 'teacher' ? 'primary' : 'default'}
                  sx={{ height: 16, fontSize: '0.6rem' }}
                />
                <Typography variant="caption" color="text.secondary">
                  {getRelativeTime(c.created_at)}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.4 }}>
                {c.comment_text}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Reply input */}
      {canComment && (
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            placeholder="Write a comment..."
            size="small"
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            multiline
            maxRows={3}
          />
          <IconButton
            onClick={handleSend}
            disabled={!text.trim() || sending}
            color="primary"
            size="small"
            sx={{ mb: 0.5 }}
          >
            {sending ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
          </IconButton>
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
  return `${days}d`;
}
