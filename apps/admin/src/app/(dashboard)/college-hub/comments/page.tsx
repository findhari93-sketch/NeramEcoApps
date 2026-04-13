'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Alert, ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import CommentIcon from '@mui/icons-material/Comment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';

type CommentStatus = 'approved' | 'removed';

interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  status: CommentStatus;
  created_at: string;
  colleges: { name: string; slug: string } | null;
}

export default function CommentsModerationPage() {
  const [status, setStatus] = useState<CommentStatus>('approved');
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/college-hub/comments?status=${status}`)
      .then((r) => r.json())
      .then((j) => setComments(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, newStatus: CommentStatus) => {
    await fetch('/api/college-hub/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: newStatus }),
    });
    setActionMsg(`Comment ${newStatus === 'removed' ? 'removed' : 'restored'}.`);
    load();
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42, height: 42, bgcolor: '#b45309',
            borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <CommentIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>Comments Moderation</Typography>
      </Stack>

      <ToggleButtonGroup
        value={status}
        exclusive
        onChange={(_, v) => v && setStatus(v)}
        size="small"
        sx={{ mb: 3 }}
      >
        <ToggleButton value="approved">Approved</ToggleButton>
        <ToggleButton value="removed">Removed</ToggleButton>
      </ToggleButtonGroup>

      {actionMsg && (
        <Alert severity="success" onClose={() => setActionMsg('')} sx={{ mb: 2 }}>
          {actionMsg}
        </Alert>
      )}

      {loading && <CircularProgress />}

      {!loading && comments.length === 0 && (
        <Typography color="text.secondary">No {status} comments found.</Typography>
      )}

      <Stack gap={2}>
        {comments.map((comment) => (
          <Paper key={comment.id} variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems="flex-start"
              gap={1}
            >
              <Box sx={{ flex: 1 }}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {comment.author_name}
                  </Typography>
                  {comment.colleges && (
                    <Chip
                      label={comment.colleges.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                    />
                  )}
                  <Typography variant="caption" color="text.secondary">
                    {new Date(comment.created_at).toLocaleDateString('en-IN')}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                  {comment.body}
                </Typography>
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                {status === 'approved' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    startIcon={<BlockIcon />}
                    onClick={() => updateStatus(comment.id, 'removed')}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => updateStatus(comment.id, 'approved')}
                  >
                    Restore
                  </Button>
                )}
              </Box>
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Box>
  );
}
