'use client';

import { useState } from 'react';
import { Box, Typography, Avatar, Stack, Button, TextField } from '@neram/ui';
import type { QuestionCommentDisplay, VoteType } from '@neram/database';
import VoteButton from './VoteButton';
import AdminBadge from './AdminBadge';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface CommentSectionProps {
  comments: QuestionCommentDisplay[];
  questionId: string;
  isAuthenticated: boolean;
  getAuthToken: () => Promise<string | null>;
}

function CommentItem({
  comment,
  questionId,
  isAuthenticated,
  getAuthToken,
  onReplySubmit,
  depth,
}: {
  comment: QuestionCommentDisplay;
  questionId: string;
  isAuthenticated: boolean;
  getAuthToken: () => Promise<string | null>;
  onReplySubmit: (body: string, parentId: string) => Promise<void>;
  depth: number;
}) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleReply = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onReplySubmit(replyText.trim(), comment.id);
      setReplyText('');
      setShowReplyInput(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVote = async (vote: VoteType) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');
    const res = await fetch(`/api/questions/${questionId}/comments/${comment.id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ vote }),
    });
    const data = await res.json();
    return data.data;
  };

  return (
    <Box sx={{ ml: depth > 0 ? 3 : 0, mb: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {/* Vote button */}
        {isAuthenticated && (
          <VoteButton
            score={comment.vote_score}
            userVote={comment.user_vote || null}
            onVote={handleVote}
            size="small"
          />
        )}

        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" spacing={0.5}>
            <Avatar
              src={comment.author?.avatar_url || undefined}
              sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
            >
              {(comment.author?.name || 'U')[0]}
            </Avatar>
            <Typography variant="body2" fontWeight={600} sx={{ fontSize: '0.8rem' }}>
              {comment.author?.name || 'Anonymous'}
            </Typography>
            <AdminBadge authorUserType={comment.author?.user_type} />
            <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.7rem' }}>
              {timeAgo(comment.created_at)}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.25, mb: 0.5 }}>
            {comment.body}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            {!isAuthenticated && (
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                {comment.vote_score} {comment.vote_score === 1 ? 'vote' : 'votes'}
              </Typography>
            )}
            {isAuthenticated && depth < 2 && (
              <Button
                size="small"
                onClick={() => setShowReplyInput(!showReplyInput)}
                sx={{ fontSize: '0.7rem', minWidth: 0, p: 0.5 }}
              >
                Reply
              </Button>
            )}
          </Stack>

          {showReplyInput && (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="Write a reply..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.75 } }}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleReply}
                disabled={!replyText.trim() || submitting}
                sx={{ minWidth: 60 }}
              >
                {submitting ? '...' : 'Post'}
              </Button>
            </Stack>
          )}

          {/* Replies */}
          {comment.replies?.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              questionId={questionId}
              isAuthenticated={isAuthenticated}
              getAuthToken={getAuthToken}
              onReplySubmit={onReplySubmit}
              depth={depth + 1}
            />
          ))}
        </Box>
      </Stack>
    </Box>
  );
}

export default function CommentSection({
  comments,
  questionId,
  isAuthenticated,
  getAuthToken,
}: CommentSectionProps) {
  const [allComments, setAllComments] = useState(comments);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitComment = async (body: string, parentId?: string) => {
    const token = await getAuthToken();
    if (!token) return;

    const res = await fetch(`/api/questions/${questionId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body, parentId }),
    });

    if (res.ok) {
      const commentsRes = await fetch(`/api/questions/${questionId}/comments`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (commentsRes.ok) {
        const data = await commentsRes.json();
        setAllComments(data.data);
      }
    }
  };

  const handleTopLevelSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      await handleSubmitComment(newComment.trim());
      setNewComment('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplySubmit = async (body: string, parentId: string) => {
    await handleSubmitComment(body, parentId);
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 2, fontWeight: 600, fontSize: '1rem' }}>
        Comments ({allComments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0)})
      </Typography>

      {isAuthenticated && (
        <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleTopLevelSubmit();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleTopLevelSubmit}
            disabled={!newComment.trim() || submitting}
            sx={{ minWidth: 80, minHeight: 40 }}
          >
            {submitting ? '...' : 'Post'}
          </Button>
        </Stack>
      )}

      {!isAuthenticated && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sign in to leave a comment.
        </Typography>
      )}

      {allComments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No comments yet. Be the first to share your thoughts!
        </Typography>
      ) : (
        allComments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            questionId={questionId}
            isAuthenticated={isAuthenticated}
            getAuthToken={getAuthToken}
            onReplySubmit={handleReplySubmit}
            depth={0}
          />
        ))
      )}
    </Box>
  );
}
