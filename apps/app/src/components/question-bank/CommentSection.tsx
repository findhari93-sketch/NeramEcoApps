'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Avatar, Stack, Button, TextField, Alert, CircularProgress } from '@neram/ui';
import ReplyRoundedIcon from '@mui/icons-material/ReplyRounded';
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

const POST_FAILED = 'Could not post your comment. Your text is still here, please try again.';

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
  const [replyError, setReplyError] = useState('');

  const handleReply = async () => {
    if (!replyText.trim() || submitting) return;
    setSubmitting(true);
    setReplyError('');
    try {
      await onReplySubmit(replyText.trim(), comment.id);
      setReplyText('');
      setShowReplyInput(false);
    } catch {
      // Keep the typed reply so nothing is lost
      setReplyError(POST_FAILED);
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
    if (!res.ok) throw new Error('Vote failed');
    const data = await res.json();
    if (!data?.data) throw new Error('Vote failed');
    return data.data;
  };

  const replyInputId = `reply-${comment.id}`;

  return (
    <Box component="li" sx={{ ml: depth > 0 ? { xs: 1.5, sm: 3 } : 0, mb: 1.5, listStyle: 'none' }}>
      <Stack direction="row" spacing={1} alignItems="flex-start">
        {isAuthenticated && (
          <VoteButton
            score={comment.vote_score}
            userVote={comment.user_vote || null}
            onVote={handleVote}
            size="small"
          />
        )}

        <Box sx={{ flex: 1, minWidth: 0, pt: isAuthenticated ? 1 : 0 }}>
          <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
            <Avatar
              src={comment.author?.avatar_url || undefined}
              alt=""
              sx={{ width: 24, height: 24, fontSize: '0.75rem' }}
            >
              {(comment.author?.name || 'U')[0]}
            </Avatar>
            <Typography variant="body2" fontWeight={600}>
              {comment.author?.name || 'Anonymous'}
            </Typography>
            <AdminBadge authorUserType={comment.author?.user_type} />
            <Typography variant="caption" color="text.secondary">
              {timeAgo(comment.created_at)}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.5, mb: 0.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {comment.body}
          </Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            {!isAuthenticated && (
              <Typography variant="caption" color="text.secondary">
                {comment.vote_score} {comment.vote_score === 1 ? 'vote' : 'votes'}
              </Typography>
            )}
            {isAuthenticated && depth < 2 && (
              <Button
                onClick={() => setShowReplyInput(!showReplyInput)}
                startIcon={<ReplyRoundedIcon />}
                aria-expanded={showReplyInput}
                aria-controls={replyInputId}
                sx={{ minHeight: 44, px: 1, ml: -1, color: 'text.secondary' }}
              >
                Reply
              </Button>
            )}
          </Stack>

          {showReplyInput && (
            <Box id={replyInputId} sx={{ mt: 1 }}>
              <Stack direction="row" spacing={1} alignItems="flex-start">
                <TextField
                  fullWidth
                  multiline
                  maxRows={6}
                  placeholder="Write a reply"
                  inputProps={{ 'aria-label': `Reply to ${comment.author?.name || 'this comment'}` }}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  error={!!replyError}
                />
                <Button
                  variant="contained"
                  onClick={handleReply}
                  disabled={!replyText.trim() || submitting}
                  sx={{ minWidth: 80, minHeight: 48 }}
                >
                  {submitting ? <CircularProgress size={18} color="inherit" aria-label="Posting" /> : 'Post'}
                </Button>
              </Stack>
              {replyError && (
                <Alert severity="error" role="alert" sx={{ mt: 1 }}>
                  {replyError}
                </Alert>
              )}
            </Box>
          )}

          {comment.replies && comment.replies.length > 0 && (
            <Box component="ul" sx={{ p: 0, m: 0, mt: 1 }}>
              {comment.replies.map((reply) => (
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
          )}
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
  const [postError, setPostError] = useState('');

  // Follow fresh data from the parent
  useEffect(() => {
    setAllComments(comments);
  }, [comments]);

  /** Throws when the post fails so callers keep the typed text */
  const handleSubmitComment = async (body: string, parentId?: string) => {
    const token = await getAuthToken();
    if (!token) throw new Error('Not authenticated');

    const res = await fetch(`/api/questions/${questionId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ body, parentId }),
    });
    if (!res.ok) throw new Error('Comment failed');

    // The post worked; a failed refresh only means the list is a little behind
    try {
      const commentsRes = await fetch(`/api/questions/${questionId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (commentsRes.ok) {
        const data = await commentsRes.json();
        setAllComments(data.data || []);
      }
    } catch {
      // Ignore
    }
  };

  const handleTopLevelSubmit = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    setPostError('');
    try {
      await handleSubmitComment(newComment.trim());
      setNewComment('');
    } catch {
      setPostError(POST_FAILED);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplySubmit = async (body: string, parentId: string) => {
    await handleSubmitComment(body, parentId);
  };

  const total = allComments.reduce((acc, c) => acc + 1 + (c.replies?.length || 0), 0);

  return (
    <Box component="section" aria-labelledby="qb-comments-heading">
      <Typography id="qb-comments-heading" variant="h6" component="h2" sx={{ mb: 2, fontSize: '1rem' }}>
        Comments ({total})
      </Typography>

      {isAuthenticated && (
        <Box sx={{ mb: 3 }}>
          <Stack direction="row" spacing={1} alignItems="flex-start">
            <TextField
              fullWidth
              multiline
              maxRows={6}
              placeholder="Write a comment"
              inputProps={{ 'aria-label': 'Write a comment' }}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              error={!!postError}
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
              sx={{ minWidth: 80, minHeight: 48 }}
            >
              {submitting ? <CircularProgress size={18} color="inherit" aria-label="Posting" /> : 'Post'}
            </Button>
          </Stack>
          {postError && (
            <Alert severity="error" role="alert" sx={{ mt: 1 }}>
              {postError}
            </Alert>
          )}
        </Box>
      )}

      {!isAuthenticated && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Sign in to leave a comment.
        </Typography>
      )}

      {allComments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No comments yet. Be the first to share your thoughts.
        </Typography>
      ) : (
        <Box component="ul" sx={{ p: 0, m: 0 }}>
          {allComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              questionId={questionId}
              isAuthenticated={isAuthenticated}
              getAuthToken={getAuthToken}
              onReplySubmit={handleReplySubmit}
              depth={0}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
