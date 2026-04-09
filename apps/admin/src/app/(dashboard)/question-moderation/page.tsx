'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, Chip, Stack, Paper, Avatar,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  CircularProgress, Alert, Tabs, Tab, ToggleButton, ToggleButtonGroup,
  IconButton, EditIcon,
} from '@neram/ui';
import type {
  QuestionPostDisplay,
  QuestionPostStatus,
  QuestionChangeRequestDisplay,
} from '@neram/database';
import AdminEditQuestionDialog from '@/components/question-bank/AdminEditQuestionDialog';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_LABELS: Record<string, string> = {
  mathematics: 'Mathematics',
  general_aptitude: 'General Aptitude',
  drawing: 'Drawing',
  logical_reasoning: 'Logical Reasoning',
  aesthetic_sensitivity: 'Aesthetic Sensitivity',
  other: 'Other',
};

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'error' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'error',
  flagged: 'default',
};

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

const STATUS_TABS: { value: QuestionPostStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

type ContentType = 'questions' | 'improvements' | 'change_requests';

export default function QuestionModerationPage() {
  const [contentType, setContentType] = useState<ContentType>('questions');
  const [status, setStatus] = useState<QuestionPostStatus>('pending');
  const [questions, setQuestions] = useState<QuestionPostDisplay[]>([]);
  const [improvements, setImprovements] = useState<any[]>([]);
  const [changeRequests, setChangeRequests] = useState<QuestionChangeRequestDisplay[]>([]);
  const [crStats, setCrStats] = useState<{ pending_edits: number; pending_deletes: number; total_pending: number }>({ pending_edits: 0, pending_deletes: 0, total_pending: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Reject dialog
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectItemId, setRejectItemId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // View dialog
  const [viewQuestion, setViewQuestion] = useState<QuestionPostDisplay | null>(null);
  const [editQuestion, setEditQuestion] = useState<QuestionPostDisplay | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({
        status,
        page: String(page),
        limit: '25',
      });

      if (contentType === 'questions') {
        const res = await fetch(`/api/questions?${params}`);
        if (res.ok) {
          const data = await res.json();
          setQuestions(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setStats(data.stats || {});
        }
      } else if (contentType === 'improvements') {
        params.set('type', 'improvements');
        const res = await fetch(`/api/questions?${params}`);
        if (res.ok) {
          const data = await res.json();
          setImprovements(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
        }
      } else if (contentType === 'change_requests') {
        const res = await fetch(`/api/questions/change-requests?${params}`);
        if (res.ok) {
          const data = await res.json();
          setChangeRequests(data.data || []);
          setTotalPages(data.pagination?.totalPages || 1);
          setCrStats(data.stats || { pending_edits: 0, pending_deletes: 0, total_pending: 0 });
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, [contentType, status, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (itemId: string) => {
    setActionLoading(itemId);
    try {
      let endpoint: string;
      if (contentType === 'questions') {
        endpoint = `/api/questions/${itemId}/approve`;
      } else if (contentType === 'improvements') {
        endpoint = `/api/questions/improvements/${itemId}/approve`;
      } else {
        endpoint = `/api/questions/change-requests/${itemId}/approve`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        if (contentType === 'questions') {
          setQuestions((prev) => prev.filter((q) => q.id !== itemId));
        } else if (contentType === 'improvements') {
          setImprovements((prev) => prev.filter((i) => i.id !== itemId));
        } else {
          setChangeRequests((prev) => prev.filter((cr) => cr.id !== itemId));
        }
        const label = contentType === 'questions' ? 'Question' : contentType === 'improvements' ? 'Improvement' : 'Change request';
        setSuccessMsg(`${label} approved`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (error) {
      console.error('Error approving:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBulkApprove = async () => {
    for (const id of selected) {
      await handleApprove(id);
    }
    setSelected(new Set());
  };

  const openRejectDialog = (itemId: string) => {
    setRejectItemId(itemId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionLoading(rejectItemId);
    setRejectDialogOpen(false);
    try {
      let endpoint: string;
      if (contentType === 'questions') {
        endpoint = `/api/questions/${rejectItemId}/reject`;
      } else if (contentType === 'improvements') {
        endpoint = `/api/questions/improvements/${rejectItemId}/reject`;
      } else {
        endpoint = `/api/questions/change-requests/${rejectItemId}/reject`;
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      if (res.ok) {
        if (contentType === 'questions') {
          setQuestions((prev) => prev.filter((q) => q.id !== rejectItemId));
        } else if (contentType === 'improvements') {
          setImprovements((prev) => prev.filter((i) => i.id !== rejectItemId));
        } else {
          setChangeRequests((prev) => prev.filter((cr) => cr.id !== rejectItemId));
        }
        const label = contentType === 'questions' ? 'Question' : contentType === 'improvements' ? 'Improvement' : 'Change request';
        setSuccessMsg(`${label} rejected`);
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (error) {
      console.error('Error rejecting:', error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const items = contentType === 'questions' ? questions : contentType === 'improvements' ? improvements : [];

  return (
    <Box>
      {/* Header */}
      <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
        Question Moderation
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Review and moderate community-submitted questions and improvements.
      </Typography>

      {successMsg && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      {/* Content type toggle */}
      <ToggleButtonGroup
        value={contentType}
        exclusive
        onChange={(_, v) => { if (v) { setContentType(v); setPage(1); setSelected(new Set()); setStatus('pending' as any); } }}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="questions">Questions</ToggleButton>
        <ToggleButton value="improvements">Improvements</ToggleButton>
        <ToggleButton value="change_requests">Change Requests</ToggleButton>
      </ToggleButtonGroup>

      {/* Stats (questions only) */}
      {contentType === 'questions' && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          {STATUS_TABS.map((tab) => (
            <Paper
              key={tab.value}
              sx={{
                px: 3, py: 1.5, textAlign: 'center', cursor: 'pointer',
                border: status === tab.value ? 2 : 1,
                borderColor: status === tab.value ? 'primary.main' : 'divider',
              }}
              onClick={() => { setStatus(tab.value); setPage(1); }}
            >
              <Typography variant="h5" fontWeight={700}>
                {stats[tab.value] ?? '-'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {tab.label}
              </Typography>
            </Paper>
          ))}
        </Stack>
      )}

      {/* Stats (change requests) */}
      {contentType === 'change_requests' && (
        <Stack direction="row" spacing={2} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
          <Paper sx={{ px: 3, py: 1.5, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={700} color="warning.main">
              {crStats.total_pending}
            </Typography>
            <Typography variant="body2" color="text.secondary">Total Pending</Typography>
          </Paper>
          <Paper sx={{ px: 3, py: 1.5, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={700} color="info.main">
              {crStats.pending_edits}
            </Typography>
            <Typography variant="body2" color="text.secondary">Pending Edits</Typography>
          </Paper>
          <Paper sx={{ px: 3, py: 1.5, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={700} color="error.main">
              {crStats.pending_deletes}
            </Typography>
            <Typography variant="body2" color="text.secondary">Pending Deletes</Typography>
          </Paper>
        </Stack>
      )}

      {/* Tabs */}
      <Tabs
        value={status}
        onChange={(_, v) => { setStatus(v); setPage(1); }}
        sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
      >
        {STATUS_TABS.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </Tabs>

      {/* Bulk actions */}
      {status === 'pending' && selected.size > 0 && (
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Chip label={`${selected.size} selected`} size="small" />
          <Button
            variant="contained"
            color="success"
            size="small"
            onClick={handleBulkApprove}
          >
            Approve All Selected
          </Button>
          <Button
            variant="text"
            size="small"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </Stack>
      )}

      {/* List - Questions & Improvements */}
      {contentType !== 'change_requests' && (
        loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : items.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No {status} {contentType}.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {items.map((item) => (
              <Paper
                key={item.id}
                sx={{
                  p: 2,
                  borderLeft: selected.has(item.id) ? '3px solid' : 'none',
                  borderColor: 'primary.main',
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={2}>
                  {/* Select checkbox area (for pending) */}
                  {status === 'pending' && (
                    <Box
                      onClick={() => toggleSelect(item.id)}
                      sx={{
                        width: 24, height: 24, borderRadius: 0.5,
                        border: '2px solid', borderColor: selected.has(item.id) ? 'primary.main' : 'divider',
                        bgcolor: selected.has(item.id) ? 'primary.main' : 'transparent',
                        cursor: 'pointer', flexShrink: 0, mt: 0.5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: '0.8rem',
                      }}
                    >
                      {selected.has(item.id) ? '✓' : ''}
                    </Box>
                  )}

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Avatar
                        src={item.author?.avatar_url || undefined}
                        sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                      >
                        {(item.author?.name || 'U')[0]}
                      </Avatar>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        {item.author?.name || 'Anonymous'}
                      </Typography>
                      {item.is_admin_post && (
                        <Chip label="Official" size="small" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                      <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                        {timeAgo(item.created_at)}
                      </Typography>
                      <Chip
                        label={item.status}
                        size="small"
                        color={STATUS_COLORS[item.status] || 'default'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Stack>

                    <Typography
                      variant="subtitle1"
                      fontWeight={600}
                      sx={{
                        mb: 0.5, cursor: 'pointer', '&:hover': { textDecoration: 'underline' },
                      }}
                      onClick={() => contentType === 'questions' && setViewQuestion(item)}
                    >
                      {item.title || `Improvement for: ${item.question_posts?.title || 'Question'}`}
                    </Typography>

                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 1,
                      }}
                    >
                      {item.body}
                    </Typography>

                    {contentType === 'questions' && (
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip
                          label={CATEGORY_LABELS[item.category] || item.category}
                          size="small"
                          variant="outlined"
                          sx={{ height: 22, fontSize: '0.7rem' }}
                        />
                        {item.exam_year && (
                          <Chip label={`NATA ${item.exam_year}`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                        )}
                        {item.confidence_level && item.confidence_level !== 3 && (
                          <Chip label={`Confidence: ${item.confidence_level}/5`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                          {item.vote_score} votes | {item.comment_count} comments | {item.improvement_count} improvements
                        </Typography>
                      </Stack>
                    )}
                  </Box>

                  {/* Actions */}
                  {status === 'pending' && (
                    <Stack spacing={1} sx={{ flexShrink: 0 }}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        disabled={actionLoading === item.id}
                        onClick={() => handleApprove(item.id)}
                        sx={{ minWidth: 90 }}
                      >
                        {actionLoading === item.id ? <CircularProgress size={16} /> : 'Approve'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        disabled={actionLoading === item.id}
                        onClick={() => openRejectDialog(item.id)}
                        sx={{ minWidth: 90 }}
                      >
                        Reject
                      </Button>
                      {contentType === 'questions' && (
                        <Button variant="text" size="small" onClick={() => setViewQuestion(item)}>
                          View
                        </Button>
                      )}
                    </Stack>
                  )}

                  {status !== 'pending' && contentType === 'questions' && (
                    <Button variant="text" size="small" onClick={() => setViewQuestion(item)}>
                      View
                    </Button>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )
      )}

      {/* List - Change Requests */}
      {contentType === 'change_requests' && (
        loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : changeRequests.length === 0 ? (
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <Typography color="text.secondary">
              No {status} change requests.
            </Typography>
          </Paper>
        ) : (
          <Stack spacing={1.5}>
            {changeRequests.map((cr) => (
              <Paper
                key={cr.id}
                sx={{
                  p: 2,
                  borderLeft: cr.request_type === 'delete' ? '3px solid' : '3px solid',
                  borderColor: cr.request_type === 'delete' ? 'error.main' : 'info.main',
                }}
              >
                <Stack direction="row" alignItems="flex-start" spacing={2}>
                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Author + metadata row */}
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} flexWrap="wrap" useFlexGap>
                      <Avatar
                        src={cr.author?.avatar_url || undefined}
                        sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                      >
                        {(cr.author?.name || 'U')[0]}
                      </Avatar>
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                        {cr.author?.name || 'Anonymous'}
                      </Typography>
                      <Typography variant="body2" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                        {timeAgo(cr.created_at)}
                      </Typography>
                      <Chip
                        label={cr.request_type === 'edit' ? 'Edit Request' : 'Delete Request'}
                        size="small"
                        color={cr.request_type === 'edit' ? 'info' : 'error'}
                        sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
                      />
                      <Chip
                        label={cr.status}
                        size="small"
                        color={STATUS_COLORS[cr.status] || 'default'}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                      />
                    </Stack>

                    {/* Question title */}
                    <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 0.5 }}>
                      {cr.question?.title || 'Unknown Question'}
                    </Typography>

                    {/* For edit requests: show proposed changes */}
                    {cr.request_type === 'edit' && (
                      <Box sx={{ mb: 1 }}>
                        {cr.proposed_title && cr.proposed_title !== cr.question?.title && (
                          <Box sx={{ mb: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Proposed title:
                            </Typography>
                            <Typography variant="body2" sx={{ bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 0.5, mt: 0.25 }}>
                              {cr.proposed_title}
                            </Typography>
                          </Box>
                        )}
                        {cr.proposed_body && (
                          <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Proposed body:
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{
                                bgcolor: 'action.hover', px: 1, py: 0.5, borderRadius: 0.5, mt: 0.25,
                                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              {cr.proposed_body}
                            </Typography>
                          </Box>
                        )}
                        {cr.proposed_category && (
                          <Box sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary" fontWeight={600}>
                              Proposed category:
                            </Typography>
                            <Chip
                              label={CATEGORY_LABELS[cr.proposed_category] || cr.proposed_category}
                              size="small"
                              variant="outlined"
                              sx={{ ml: 0.5, height: 20, fontSize: '0.7rem' }}
                            />
                          </Box>
                        )}
                      </Box>
                    )}

                    {/* For delete requests: show reason */}
                    {cr.request_type === 'delete' && cr.reason && (
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" color="text.secondary" fontWeight={600}>
                          Reason:
                        </Typography>
                        <Typography variant="body2" color="error.main" sx={{ mt: 0.25 }}>
                          {cr.reason}
                        </Typography>
                      </Box>
                    )}

                    {/* Rejection reason (if rejected) */}
                    {cr.status === 'rejected' && cr.rejection_reason && (
                      <Alert severity="error" sx={{ mt: 1, py: 0 }} variant="outlined">
                        <Typography variant="caption" fontWeight={600}>Rejection reason:</Typography>
                        <Typography variant="body2">{cr.rejection_reason}</Typography>
                      </Alert>
                    )}
                  </Box>

                  {/* Actions (only for pending) */}
                  {cr.status === 'pending' && (
                    <Stack spacing={1} sx={{ flexShrink: 0 }}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        disabled={actionLoading === cr.id}
                        onClick={() => handleApprove(cr.id)}
                        sx={{ minWidth: 90 }}
                      >
                        {actionLoading === cr.id ? <CircularProgress size={16} /> : 'Approve'}
                      </Button>
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        disabled={actionLoading === cr.id}
                        onClick={() => openRejectDialog(cr.id)}
                        sx={{ minWidth: 90 }}
                      >
                        Reject
                      </Button>
                    </Stack>
                  )}
                </Stack>
              </Paper>
            ))}
          </Stack>
        )
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <Stack direction="row" justifyContent="center" spacing={2} sx={{ mt: 3 }}>
          <Button variant="outlined" size="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
            Page {page} of {totalPages}
          </Typography>
          <Button variant="outlined" size="small" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </Stack>
      )}

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onClose={() => setRejectDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject {contentType === 'questions' ? 'Question' : contentType === 'improvements' ? 'Improvement' : 'Change Request'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Provide a reason for rejection. The author will be able to see this reason.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            minRows={3}
            label="Rejection Reason"
            placeholder="e.g., Duplicate, inappropriate content, not from NATA exam..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleReject} disabled={!rejectReason.trim()}>
            Reject
          </Button>
        </DialogActions>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewQuestion} onClose={() => setViewQuestion(null)} maxWidth="md" fullWidth>
        {viewQuestion && (
          <>
            <DialogTitle>
              <Stack direction="row" alignItems="center" spacing={1}>
                <Typography variant="h6" sx={{ flex: 1 }}>
                  {viewQuestion.title}
                </Typography>
                {viewQuestion.is_admin_post && (
                  <Chip label="Official" size="small" color="warning" />
                )}
                <IconButton
                  size="small"
                  title="Edit question"
                  onClick={() => { setViewQuestion(null); setEditQuestion(viewQuestion); }}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
                <Chip
                  label={viewQuestion.status}
                  size="small"
                  color={STATUS_COLORS[viewQuestion.status] || 'default'}
                />
              </Stack>
            </DialogTitle>
            <DialogContent dividers>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <Avatar src={viewQuestion.author?.avatar_url || undefined} sx={{ width: 28, height: 28 }}>
                  {(viewQuestion.author?.name || 'U')[0]}
                </Avatar>
                <Typography variant="body2">{viewQuestion.author?.name || 'Anonymous'}</Typography>
                <Typography variant="body2" color="text.disabled">{timeAgo(viewQuestion.created_at)}</Typography>
              </Stack>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
                <Chip label={CATEGORY_LABELS[viewQuestion.category] || viewQuestion.category} size="small" color="primary" variant="outlined" />
                {(viewQuestion.exam_month && viewQuestion.exam_year) ? (
                  <Chip
                    label={`${MONTH_NAMES[(viewQuestion.exam_month as number) - 1]} ${viewQuestion.exam_year}`}
                    size="small"
                    variant="outlined"
                  />
                ) : viewQuestion.exam_year ? (
                  <Chip label={`NATA ${viewQuestion.exam_year}`} size="small" variant="outlined" />
                ) : null}
                {viewQuestion.exam_session && <Chip label={viewQuestion.exam_session} size="small" variant="outlined" />}
                {viewQuestion.confidence_level && viewQuestion.confidence_level !== 3 && (
                  <Chip label={`Confidence: ${viewQuestion.confidence_level}/5`} size="small" variant="outlined" />
                )}
              </Stack>

              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, mb: 2 }}>
                {viewQuestion.body}
              </Typography>

              {/* Stats */}
              <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  {viewQuestion.vote_score} votes
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {viewQuestion.comment_count} comments
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {viewQuestion.improvement_count} improvements
                </Typography>
              </Stack>
              <Stack direction="row" spacing={3} sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.disabled">
                  Posted: {new Date(viewQuestion.created_at).toLocaleString()}
                </Typography>
                {viewQuestion.updated_at !== viewQuestion.created_at && (
                  <Typography variant="caption" color="text.disabled">
                    Updated: {new Date(viewQuestion.updated_at).toLocaleString()}
                  </Typography>
                )}
              </Stack>

              {viewQuestion.rejection_reason && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  <Typography variant="body2" fontWeight={600}>Rejection reason:</Typography>
                  <Typography variant="body2">{viewQuestion.rejection_reason}</Typography>
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              {viewQuestion.status === 'pending' && (
                <>
                  <Button
                    color="error"
                    onClick={() => { setViewQuestion(null); openRejectDialog(viewQuestion.id); }}
                  >
                    Reject
                  </Button>
                  <Button
                    variant="contained"
                    color="success"
                    onClick={() => { setViewQuestion(null); handleApprove(viewQuestion.id); }}
                  >
                    Approve
                  </Button>
                </>
              )}
              <Button onClick={() => setViewQuestion(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Admin Edit Dialog */}
      {editQuestion && (
        <AdminEditQuestionDialog
          open={!!editQuestion}
          onClose={() => setEditQuestion(null)}
          question={editQuestion}
          onSaved={(updated) => {
            setQuestions((prev) =>
              prev.map((q) => (q.id === updated.id ? { ...q, ...updated } : q))
            );
            setEditQuestion(null);
          }}
        />
      )}
    </Box>
  );
}
