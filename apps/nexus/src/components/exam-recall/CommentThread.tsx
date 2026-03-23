'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Avatar,
  Typography,
  Stack,
  TextField,
  IconButton,
  Chip,
  Divider,
  alpha,
  useTheme,
} from '@neram/ui';
import SendIcon from '@mui/icons-material/Send';
import ReplyIcon from '@mui/icons-material/Reply';
import type { ExamRecallThreadDetail } from '@neram/database';

type CommentItem = ExamRecallThreadDetail['comments'][number];

interface CommentThreadProps {
  comments: ExamRecallThreadDetail['comments'];
  onAddComment: (body: string, parentId?: string) => void;
  currentUserId: string;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function CommentItem({
  comment,
  replies,
  depth,
  onReply,
}: {
  comment: CommentItem;
  replies: CommentItem[];
  depth: number;
  onReply: (commentId: string) => void;
}) {
  return (
    <Box sx={{ pl: depth > 0 ? { xs: 2, md: 3 } : 0 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
        <Avatar
          src={comment.user.avatar_url || undefined}
          alt={comment.user.name || 'User'}
          sx={{ width: 28, height: 28, fontSize: '0.75rem', mt: 0.25 }}
        >
          {comment.user.name?.[0] || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Typography variant="body2" fontWeight={600} noWrap>
              {comment.user.name || 'Unknown'}
            </Typography>
            {comment.is_staff && (
              <Chip
                label="Staff"
                size="small"
                sx={{
                  bgcolor: 'error.50',
                  color: 'error.main',
                  fontWeight: 600,
                  fontSize: '0.6rem',
                  height: 16,
                }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {formatRelativeTime(comment.created_at)}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {comment.body}
          </Typography>
          {depth < 2 && (
            <IconButton
              size="small"
              onClick={() => onReply(comment.id)}
              sx={{ mt: 0.25, p: 0.25 }}
            >
              <ReplyIcon sx={{ fontSize: '0.9rem' }} />
              <Typography variant="caption" color="text.secondary" sx={{ ml: 0.25 }}>
                Reply
              </Typography>
            </IconButton>
          )}
        </Box>
      </Stack>

      {/* Nested replies */}
      {replies.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1 }}>
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              replies={[]}
              depth={depth + 1}
              onReply={onReply}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}

export default function CommentThread({ comments, onAddComment, currentUserId }: CommentThreadProps) {
  const theme = useTheme();
  const [newComment, setNewComment] = useState('');
  const [replyToId, setReplyToId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  // Build comment tree: top-level + replies
  const { topLevel, repliesMap } = useMemo(() => {
    const top: CommentItem[] = [];
    const map = new Map<string, CommentItem[]>();

    for (const c of comments) {
      if (!c.parent_comment_id) {
        top.push(c);
      } else {
        const existing = map.get(c.parent_comment_id) || [];
        existing.push(c);
        map.set(c.parent_comment_id, existing);
      }
    }

    // Sort by created_at
    top.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    for (const [, arr] of map) {
      arr.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }

    return { topLevel: top, repliesMap: map };
  }, [comments]);

  const replyingTo = replyToId ? comments.find((c) => c.id === replyToId) : null;

  const handleSubmit = async () => {
    const body = newComment.trim();
    if (!body || submitting) return;
    setSubmitting(true);
    try {
      onAddComment(body, replyToId);
      setNewComment('');
      setReplyToId(undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      {/* Comments list */}
      <Stack spacing={1.5} sx={{ mb: 2 }}>
        {topLevel.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
            No comments yet. Start the discussion!
          </Typography>
        )}
        {topLevel.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            replies={repliesMap.get(comment.id) || []}
            depth={0}
            onReply={(id) => setReplyToId(id)}
          />
        ))}
      </Stack>

      <Divider sx={{ mb: 1.5 }} />

      {/* Reply indicator */}
      {replyingTo && (
        <Box
          sx={{
            mb: 1,
            px: 1.5,
            py: 0.5,
            borderRadius: 1,
            bgcolor: alpha(theme.palette.primary.main, 0.06),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Replying to <strong>{replyingTo.user.name || 'Unknown'}</strong>
          </Typography>
          <IconButton size="small" onClick={() => setReplyToId(undefined)} sx={{ p: 0.25 }}>
            <Typography variant="caption" color="text.secondary">
              Cancel
            </Typography>
          </IconButton>
        </Box>
      )}

      {/* Add comment form */}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          fullWidth
          size="small"
          placeholder={replyToId ? 'Write a reply...' : 'Add a comment...'}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          multiline
          maxRows={4}
          disabled={submitting}
          sx={{
            '& .MuiInputBase-root': {
              minHeight: 40,
            },
          }}
        />
        <IconButton
          color="primary"
          onClick={handleSubmit}
          disabled={!newComment.trim() || submitting}
          sx={{ flexShrink: 0 }}
        >
          <SendIcon />
        </IconButton>
      </Stack>
    </Box>
  );
}
