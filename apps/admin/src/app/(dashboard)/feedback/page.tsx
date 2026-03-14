// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Alert,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Button,
  Rating,
} from '@neram/ui';
import FeedbackIcon from '@mui/icons-material/Feedback';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import StarIcon from '@mui/icons-material/Star';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import VisibilityIcon from '@mui/icons-material/Visibility';
import BuildIcon from '@mui/icons-material/Build';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import type {
  AppFeedback,
  AppFeedbackStatus,
  AppFeedbackCategory,
} from '@neram/database';

// ============================================
// CONSTANTS
// ============================================

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'new', label: 'New' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'wont_fix', label: "Won't Fix" },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'bug_report', label: 'Bug Report' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'ui_ux_issue', label: 'UI/UX Issue' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const RATING_OPTIONS = [
  { value: '', label: 'All Ratings' },
  { value: '1', label: '1 Star' },
  { value: '2', label: '2 Stars' },
  { value: '3', label: '3 Stars' },
  { value: '4', label: '4 Stars' },
  { value: '5', label: '5 Stars' },
];

const STATUS_COLORS: Record<AppFeedbackStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  new: 'info',
  reviewed: 'default',
  in_progress: 'warning',
  resolved: 'success',
  wont_fix: 'error',
};

const STATUS_LABELS: Record<AppFeedbackStatus, string> = {
  new: 'New',
  reviewed: 'Reviewed',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  wont_fix: "Won't Fix",
};

const CATEGORY_LABELS: Record<AppFeedbackCategory, string> = {
  bug_report: 'Bug Report',
  feature_request: 'Feature Request',
  ui_ux_issue: 'UI/UX Issue',
  performance: 'Performance',
  other: 'Other',
};

interface FeedbackStats {
  new_count: number;
  reviewed: number;
  in_progress: number;
  resolved: number;
  total: number;
  avg_rating: number;
}

// ============================================
// MAIN PAGE
// ============================================

export default function FeedbackPage() {
  const [feedbackList, setFeedbackList] = useState<AppFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [page, setPage] = useState(0);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ratingFilter, setRatingFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<AppFeedback | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [adminNotes, setAdminNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        limit: String(limit),
        stats: 'true',
      });
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (ratingFilter) params.set('rating', ratingFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/feedback?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');

      const data = await res.json();
      setFeedbackList(data.data || []);
      setTotal(data.pagination?.total || 0);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error('Error fetching feedback:', err);
      setSnackbar({ open: true, message: 'Failed to load feedback', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, categoryFilter, ratingFilter, searchQuery]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleStatusUpdate = async (id: string, status: AppFeedbackStatus, notes?: string) => {
    setUpdatingStatus(true);
    try {
      const body: Record<string, unknown> = { id, status };
      if (notes !== undefined) body.admin_notes = notes;

      const res = await fetch('/api/feedback', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to update');

      setSnackbar({ open: true, message: `Status updated to ${STATUS_LABELS[status]}`, severity: 'success' });
      fetchFeedback();

      // Update selected feedback if detail is open
      if (selectedFeedback?.id === id) {
        setSelectedFeedback((prev) => prev ? { ...prev, status, admin_notes: notes ?? prev.admin_notes } : null);
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to update status', severity: 'error' });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleOpenDetail = (fb: AppFeedback) => {
    setSelectedFeedback(fb);
    setAdminNotes(fb.admin_notes || '');
    setDetailOpen(true);
  };

  const handleSaveNotes = async () => {
    if (!selectedFeedback) return;
    await handleStatusUpdate(selectedFeedback.id, selectedFeedback.status, adminNotes);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <FeedbackIcon sx={{ fontSize: 28, color: 'primary.main' }} />
          <Typography variant="h5" fontWeight={700}>
            App Feedback
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={fetchFeedback} disabled={loading}>
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          {[
            { label: 'New', value: stats.new_count, icon: <FiberNewIcon />, color: '#1976d2' },
            { label: 'In Progress', value: stats.in_progress, icon: <BuildIcon />, color: '#ed6c02' },
            { label: 'Resolved', value: stats.resolved, icon: <CheckCircleIcon />, color: '#2e7d32' },
            { label: 'Total', value: stats.total, icon: <FeedbackIcon />, color: '#9c27b0' },
            { label: 'Avg Rating', value: stats.avg_rating, icon: <StarIcon />, color: '#faaf00' },
          ].map((stat) => (
            <Paper
              key={stat.label}
              sx={{ p: 2, flex: '1 1 160px', minWidth: 140, display: 'flex', alignItems: 'center', gap: 1.5 }}
              elevation={1}
            >
              <Box sx={{ color: stat.color }}>{stat.icon}</Box>
              <Box>
                <Typography variant="h6" fontWeight={700}>{stat.value}</Typography>
                <Typography variant="caption" color="text.secondary">{stat.label}</Typography>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 2 }} elevation={1}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search feedback..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            sx={{ minWidth: 220 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            sx={{ minWidth: 150 }}
          >
            {STATUS_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
            sx={{ minWidth: 160 }}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            value={ratingFilter}
            onChange={(e) => { setRatingFilter(e.target.value); setPage(0); }}
            sx={{ minWidth: 130 }}
          >
            {RATING_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </TextField>
        </Box>
      </Paper>

      {/* Table */}
      <Paper elevation={1}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Rating</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : feedbackList.length === 0
                ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                        <Typography color="text.secondary">No feedback found</Typography>
                      </TableCell>
                    </TableRow>
                  )
                : feedbackList.map((fb) => (
                    <TableRow
                      key={fb.id}
                      hover
                      sx={{ cursor: 'pointer' }}
                      onClick={() => handleOpenDetail(fb)}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} sx={{ whiteSpace: 'nowrap' }}>
                          {fb.feedback_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Rating value={fb.rating} readOnly size="small" />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={CATEGORY_LABELS[fb.category] || fb.category}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Typography variant="body2" noWrap>
                          {fb.description}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="text.secondary">
                          {fb.email || '—'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={STATUS_LABELS[fb.status]}
                          size="small"
                          color={STATUS_COLORS[fb.status]}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDate(fb.created_at)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, p) => setPage(p)}
          rowsPerPage={limit}
          rowsPerPageOptions={[20]}
        />
      </Paper>

      {/* Detail Dialog */}
      <Dialog
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        {selectedFeedback && (
          <>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography variant="h6" fontWeight={700}>
                  {selectedFeedback.feedback_number}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {formatDate(selectedFeedback.created_at)}
                </Typography>
              </Box>
              <IconButton onClick={() => setDetailOpen(false)}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent dividers>
              {/* Rating & Category */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <Rating value={selectedFeedback.rating} readOnly />
                <Chip
                  label={CATEGORY_LABELS[selectedFeedback.category]}
                  size="small"
                  variant="outlined"
                />
                <Chip
                  label={STATUS_LABELS[selectedFeedback.status]}
                  size="small"
                  color={STATUS_COLORS[selectedFeedback.status]}
                />
              </Box>

              {/* Description */}
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Description</Typography>
              <Typography variant="body2" sx={{ mb: 2, whiteSpace: 'pre-wrap' }}>
                {selectedFeedback.description}
              </Typography>

              <Divider sx={{ my: 2 }} />

              {/* Details */}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Email</Typography>
                  <Typography variant="body2">{selectedFeedback.email || '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">App Version</Typography>
                  <Typography variant="body2">{selectedFeedback.app_version || '—'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Source</Typography>
                  <Typography variant="body2">{selectedFeedback.source}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">User ID</Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                    {selectedFeedback.user_id || 'Anonymous'}
                  </Typography>
                </Box>
              </Box>

              {/* Device Info */}
              {selectedFeedback.device_info && Object.keys(selectedFeedback.device_info).length > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Device Info</Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'grey.50' }}>
                    <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                      {JSON.stringify(selectedFeedback.device_info, null, 2)}
                    </Typography>
                  </Paper>
                </>
              )}

              <Divider sx={{ my: 2 }} />

              {/* Status Update */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Update Status</Typography>
              <TextField
                select
                size="small"
                fullWidth
                value={selectedFeedback.status}
                onChange={(e) => handleStatusUpdate(selectedFeedback.id, e.target.value as AppFeedbackStatus)}
                disabled={updatingStatus}
                sx={{ mb: 2 }}
              >
                {STATUS_OPTIONS.filter((o) => o.value).map((o) => (
                  <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                ))}
              </TextField>

              {/* Admin Notes */}
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Admin Notes</Typography>
              <TextField
                multiline
                rows={3}
                fullWidth
                size="small"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add internal notes about this feedback..."
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailOpen(false)} color="inherit">
                Close
              </Button>
              <Button
                onClick={handleSaveNotes}
                variant="contained"
                disabled={updatingStatus || adminNotes === (selectedFeedback.admin_notes || '')}
              >
                Save Notes
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
