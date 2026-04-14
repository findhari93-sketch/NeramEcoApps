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
  Badge,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
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

interface AccessRequest {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  status: string;
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function OnboardingReviewsPage() {
  const { getToken } = useNexusAuthContext();
  const [reviews, setReviews] = useState<OnboardingReview[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0 = access requests, 1 = pending onboarding, 2 = all
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectDialog, setRejectDialog] = useState<{ studentId: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectAccessDialog, setRejectAccessDialog] = useState<{ requestId: string; name: string } | null>(null);
  const [rejectAccessNotes, setRejectAccessNotes] = useState('');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchAccessRequests = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classroom-access/requests?status=pending', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load access requests');
      const data = await res.json();
      setAccessRequests(data.requests || []);
    } catch (err) {
      console.error('Failed to fetch access requests:', err);
    }
  }, [getToken]);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Fetch access requests alongside onboarding reviews
      fetchAccessRequests();

      const status = tab === 1 ? 'submitted' : '';
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
  }, [getToken, tab, fetchAccessRequests]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleApproveAccess = async (requestId: string) => {
    setActionLoading(requestId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classroom-access/requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, action: 'approve' }),
      });

      if (!res.ok) throw new Error('Failed to approve access request');
      setSuccess('Access request approved. You can now add this student to a classroom from the Students page.');
      fetchAccessRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectAccess = async () => {
    if (!rejectAccessDialog) return;
    setActionLoading(rejectAccessDialog.requestId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classroom-access/requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: rejectAccessDialog.requestId,
          action: 'reject',
          admin_notes: rejectAccessNotes || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to reject access request');
      setRejectAccessDialog(null);
      setRejectAccessNotes('');
      setSuccess('Access request rejected.');
      fetchAccessRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject');
    } finally {
      setActionLoading(null);
    }
  };

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

  const pendingOnboardingCount = reviews.filter((r) => r.status === 'submitted').length;
  const pendingAccessCount = accessRequests.length;
  const totalPending = pendingOnboardingCount + pendingAccessCount;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Student Onboarding
        </Typography>
        {totalPending > 0 && (
          <Chip
            label={`${totalPending} pending`}
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
        <Tab
          label={
            <Badge badgeContent={pendingAccessCount} color="error" sx={{ '& .MuiBadge-badge': { right: -12, top: 2 } }}>
              Access Requests
            </Badge>
          }
        />
        <Tab label="Pending Review" />
        <Tab label="All Students" />
      </Tabs>

      {/* Tab 0: Classroom Access Requests */}
      {tab === 0 && (
        loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : accessRequests.length === 0 ? (
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
            <PersonAddOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">
              No pending access requests
            </Typography>
            <Typography variant="body2" color="text.disabled">
              Students who need classroom access will appear here.
            </Typography>
          </Paper>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {accessRequests.map((req) => (
              <AccessRequestCard
                key={req.id}
                request={req}
                onApprove={() => handleApproveAccess(req.id)}
                onReject={() => setRejectAccessDialog({ requestId: req.id, name: req.user_name })}
                isLoading={actionLoading === req.id}
              />
            ))}
          </Box>
        )
      )}

      {/* Tab 1 & 2: Onboarding Reviews */}
      {(tab === 1 || tab === 2) && (
        loading ? (
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
              {tab === 1 ? 'No pending reviews' : 'No onboarding records yet'}
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {tab === 1 ? 'All students have been reviewed.' : 'Students will appear here once they start onboarding.'}
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
        )
      )}

      {/* Reject onboarding dialog */}
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

      {/* Reject access request dialog */}
      <Dialog open={!!rejectAccessDialog} onClose={() => setRejectAccessDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject {rejectAccessDialog?.name}&apos;s Access Request</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            The student will be notified that their access request was rejected.
          </Typography>
          <TextField
            label="Notes (optional)"
            multiline
            rows={3}
            fullWidth
            value={rejectAccessNotes}
            onChange={(e) => setRejectAccessNotes(e.target.value)}
            placeholder="e.g., Student is not enrolled in any course"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectAccessDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={!!actionLoading}
            onClick={handleRejectAccess}
          >
            Reject
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function AccessRequestCard({
  request,
  onApprove,
  onReject,
  isLoading,
}: {
  request: AccessRequest;
  onApprove: () => void;
  onReject: () => void;
  isLoading: boolean;
}) {
  const daysSinceRequest = Math.floor(
    (Date.now() - new Date(request.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 2, sm: 3 },
        borderRadius: 3,
        border: '1px solid',
        borderColor: daysSinceRequest > 3 ? 'warning.main' : 'divider',
        bgcolor: daysSinceRequest > 3 ? 'warning.50' : undefined,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Avatar sx={{ width: 44, height: 44, bgcolor: 'primary.main' }}>
          {request.user_name?.[0] || '?'}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {request.user_name}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {request.user_email}
          </Typography>
        </Box>
        <Chip
          label={daysSinceRequest > 0 ? `${daysSinceRequest}d ago` : 'Today'}
          color={daysSinceRequest > 3 ? 'warning' : 'default'}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 600 }}
        />
      </Box>

      <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 2 }}>
        Requested: {new Date(request.created_at).toLocaleDateString()} at{' '}
        {new Date(request.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Typography>

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
    </Paper>
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
