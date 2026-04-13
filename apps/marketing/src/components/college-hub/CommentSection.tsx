'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Avatar, Button, TextField,
  Alert, CircularProgress, Chip, Divider,
} from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import QuestionAnswerIcon from '@mui/icons-material/QuestionAnswer';
import type { CollegeComment } from '@/lib/college-hub/types';

interface CommentItemProps {
  comment: CollegeComment & { replies?: CollegeComment[] };
  onReply: (parentId: string, parentAuthor: string) => void;
}

function CommentItem({ comment, onReply }: CommentItemProps) {
  return (
    <Box>
      <Stack direction="row" gap={1.5} alignItems="flex-start">
        <Avatar
          sx={{
            width: 36,
            height: 36,
            fontSize: '0.875rem',
            bgcolor: comment.is_ambassador ? '#7c3aed' : '#64748b',
          }}
        >
          {comment.author_name.charAt(0).toUpperCase()}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.875rem' }}>
              {comment.author_name}
            </Typography>
            {comment.is_ambassador && (
              <Chip
                label="Ambassador"
                size="small"
                color="secondary"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              {new Date(comment.created_at).toLocaleDateString('en-IN', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </Typography>
          </Stack>
          <Typography variant="body2" sx={{ mt: 0.25, lineHeight: 1.6 }}>
            {comment.body}
          </Typography>
          <Button
            size="small"
            startIcon={<ReplyIcon sx={{ fontSize: 14 }} />}
            onClick={() => onReply(comment.id, comment.author_name)}
            sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary', p: 0, minWidth: 'auto' }}
          >
            Reply
          </Button>

          {/* Replies */}
          {comment.replies && comment.replies.length > 0 && (
            <Box sx={{ ml: 3, mt: 1.5, borderLeft: '2px solid', borderColor: 'divider', pl: 2 }}>
              {comment.replies.map((reply) => (
                <Box key={reply.id} sx={{ mb: 1.5 }}>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <Avatar
                      sx={{
                        width: 28,
                        height: 28,
                        fontSize: '0.75rem',
                        bgcolor: reply.is_ambassador ? '#7c3aed' : '#94a3b8',
                      }}
                    >
                      {reply.author_name.charAt(0).toUpperCase()}
                    </Avatar>
                    <Box>
                      <Stack direction="row" alignItems="center" gap={0.75}>
                        <Typography variant="caption" fontWeight={700}>
                          {reply.author_name}
                        </Typography>
                        {reply.is_ambassador && (
                          <Chip
                            label="Ambassador"
                            size="small"
                            color="secondary"
                            sx={{ height: 16, fontSize: '0.6rem' }}
                          />
                        )}
                      </Stack>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.6 }}>
                        {reply.body}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Stack>
    </Box>
  );
}

interface CommentSectionProps {
  collegeId: string;
  collegeName: string;
}

export default function CommentSection({ collegeId, collegeName }: CommentSectionProps) {
  const [comments, setComments] = useState<(CollegeComment & { replies?: CollegeComment[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [authorName, setAuthorName] = useState('');
  const [commentBody, setCommentBody] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const loadComments = useCallback(() => {
    setLoading(true);
    fetch(`/api/colleges/comments?college_id=${collegeId}`)
      .then((r) => r.json())
      .then((json) => setComments(json.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [collegeId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmit = async () => {
    if (!authorName || commentBody.length < 5) {
      setSubmitError('Please fill in your name and a comment (min 5 chars).');
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/colleges/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          college_id: collegeId,
          parent_id: replyTo?.id ?? null,
          author_name: authorName,
          comment_body: commentBody,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSubmitSuccess(true);
      setCommentBody('');
      setReplyTo(null);
      loadComments();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <QuestionAnswerIcon sx={{ color: 'primary.main' }} />
        <Typography variant="h6" fontWeight={700}>Questions and Answers</Typography>
        <Typography variant="body2" color="text.secondary">({comments.length})</Typography>
      </Stack>

      {/* Post form */}
      <Box
        sx={{
          mb: 3,
          p: 2,
          bgcolor: '#f8fafc',
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
        }}
      >
        {replyTo && (
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
            sx={{ mb: 1 }}
          >
            <Typography variant="caption" color="primary.main" fontWeight={600}>
              Replying to {replyTo.author}
            </Typography>
            <Button size="small" onClick={() => setReplyTo(null)} sx={{ fontSize: '0.7rem' }}>
              Cancel reply
            </Button>
          </Stack>
        )}
        <Stack gap={1.5}>
          <TextField
            label="Your name *"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            size="small"
            fullWidth
          />
          <TextField
            label={
              replyTo
                ? `Reply to ${replyTo.author}...`
                : `Ask a question about ${collegeName}...`
            }
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            multiline
            rows={3}
            size="small"
            fullWidth
          />
          {submitError && (
            <Alert severity="error" sx={{ py: 0.5 }}>
              {submitError}
            </Alert>
          )}
          {submitSuccess && (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Your question has been posted!
            </Alert>
          )}
          <Button
            variant="contained"
            size="small"
            onClick={handleSubmit}
            disabled={submitting}
            sx={{ alignSelf: 'flex-end' }}
          >
            {submitting ? <CircularProgress size={14} /> : 'Post'}
          </Button>
        </Stack>
      </Box>

      {loading && <CircularProgress size={24} />}

      {!loading && comments.length === 0 && (
        <Typography color="text.secondary" variant="body2">
          No questions yet. Ask the first question about {collegeName}.
        </Typography>
      )}

      <Stack gap={0}>
        {comments.map((comment, i) => (
          <Box key={comment.id}>
            {i > 0 && <Divider sx={{ my: 1.5 }} />}
            <CommentItem
              comment={comment}
              onReply={(id, author) => setReplyTo({ id, author })}
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
