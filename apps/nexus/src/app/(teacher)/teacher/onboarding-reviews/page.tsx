'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Avatar,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  IconButton,
  Tooltip,
  Divider,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface OnboardingReview {
  id: string;
  student_id: string;
  classroom_id?: string | null;
  current_step: string;
  current_standard: string | null;
  academic_year: string | null;
  status: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  student: { id: string; name: string; email: string | null; avatar_url: string | null };
  classrooms?: { id: string; name: string }[];
  documents: { id: string; title: string; file_url: string; file_type: string; status: string; sharepoint_web_url: string | null }[];
}

export default function OnboardingReviewsPage() {
  const { getToken } = useNexusAuthContext();
  const [reviews, setReviews] = useState<OnboardingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0 = pending, 1 = all
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ studentId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const status = tab === 0 ? 'submitted' : '';
      const res = await fetch(
        `/api/onboarding/review${status ? `?status=${status}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!res.ok) throw new Error('Failed to load reviews');
      const data = await res.json();
      setReviews(data.reviews || []);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken, tab]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleApprove = async (studentId: string) => {
    setActionLoading(studentId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/onboarding/review', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          action: 'approve',
        }),
      });

      if (!res.ok) throw new Error('Failed to approve');
      setSuccess('Student approved successfully');
      fetchReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectDialog || !rejectReason.trim()) return;
    setActionLoading(rejectDialog.studentId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/onboarding/review', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: rejectDialog.studentId,
          action: 'reject',
          reason: rejectReason,
        }),
      });

      if (!res.ok) throw new Error('Failed to reject');
      setRejectDialog(null);
      setRejectReason('');
      setSuccess('Student documents rejected. They will be asked to re-upload.');
      fetchReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

  const pendingCount = reviews.filter((r) => r.status === 'submitted').length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Student Onboarding
        </Typography>
        {pendingCount > 0 && (
          <Chip
            label={`${pendingCount} pending`}
            color="warning"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Pending Review" />
        <Tab label="All Students" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : reviews.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 3,
            border: '1px solid',
            borderColor: 'divider',
          }}
        >
          <HourglassEmptyOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="h6" color="text.secondary">
            {tab === 0 ? 'No pending reviews' : 'No onboarding records yet'}
          </Typography>
          <Typography variant="body2" color="text.disabled">
            {tab === 0 ? 'All students have been reviewed.' : 'Students will appear here once they start onboarding.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onApprove={() => handleApprove(review.student_id)}
              onReject={() =>
                setRejectDialog({ studentId: review.student_id, name: review.student.name })
              }
              isLoading={actionLoading === review.student_id}
            />
          ))}
        </Box>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectDialog} onClose={() => setRejectDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject {rejectDialog?.name}&apos;s Documents</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The student will be notified and asked to re-upload their documents.
          </Typography>
          <TextField
            label="Rejection Reason"
            multiline
            rows={3}
            fullWidth
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g., Aadhaar photo is blurry, please re-upload a clearer image"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!rejectReason.trim() || !!actionLoading}
            onClick={handleReject}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function ReviewCard({
  review,
  onApprove,
  onReject,
  isLoading,
}: {
  review: OnboardingReview;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
}) {
  const statusColor =
    review.status === 'approved'
      ? 'success'
      : review.status === 'rejected'
        ? 'error'
        : review.status === 'submitted'
          ? 'warning'
          : 'default';

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      {/* Student info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Avatar
          src={review.student.avatar_url || undefined}
          sx={{ width: 44, height: 44, bgcolor: 'primary.main' }}
        >
          {review.student.name?.[0] || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {review.student.name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {review.student.email}
            {review.current_standard && ` · ${review.current_standard}`}
            {review.academic_year && ` · ${review.academic_year}`}
          </Typography>
          {review.classrooms && review.classrooms.length > 0 && (
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block' }}>
              {review.classrooms.map(c => c.name).join(', ')}
            </Typography>
          )}
        </Box>
        <Chip
          label={review.status}
          color={statusColor as any}
          size="small"
          sx={{ textTransform: 'capitalize', fontWeight: 600 }}
        />
      </Box>

      {/* Documents */}
      {review.documents.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            Uploaded Documents
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {review.documents.map((doc) => (
              <Chip
                key={doc.id}
                label={doc.title}
                variant="outlined"
                size="small"
                icon={<VisibilityOutlinedIcon sx={{ fontSize: '16px !important' }} />}
                onClick={() => {
                  const url = doc.sharepoint_web_url || doc.file_url;
                  if (url) window.open(url, '_blank');
                }}
                sx={{ cursor: 'pointer' }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Submission time */}
      {review.submitted_at && (
        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
          Submitted: {new Date(review.submitted_at).toLocaleDateString()} at{' '}
          {new Date(review.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      )}

      {/* Rejection reason */}
      {review.status === 'rejected' && review.rejection_reason && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Rejected: {review.rejection_reason}
        </Alert>
      )}

      {/* Actions — only for submitted */}
      {review.status === 'submitted' && (
        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<CancelOutlinedIcon />}
            onClick={onReject}
            disabled={isLoading}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Reject
          </Button>
          <Button
            variant="contained"
            color="success"
            size="small"
            startIcon={isLoading ? <CircularProgress size={16} /> : <CheckCircleOutlinedIcon />}
            onClick={onApprove}
            disabled={isLoading}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Approve
          </Button>
        </Box>
      )}
    </Paper>
  );
}
