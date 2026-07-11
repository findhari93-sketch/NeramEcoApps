'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  UserAvatar,
  Chip,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
} from '@neram/ui';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

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
  primary_email: string | null;
  linked_classroom_email: string | null;
  has_ms_oid: boolean;
  avatar_url: string | null;
}

interface ClassroomOption {
  id: string;
  name: string;
}

/**
 * Classroom Access Requests — the admin/teacher side of the NoClassroomWelcome
 * block screen. A student who signs in but isn't enrolled in a classroom can tap
 * "Request Classroom Access", which lands here. Approving enrolls them into the
 * chosen classroom (the only thing that grants Nexus access).
 */
export default function AccessRequestsPage() {
  const { getToken } = useNexusAuthContext();
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectAccessDialog, setRejectAccessDialog] = useState<{ requestId: string; name: string } | null>(null);
  const [rejectAccessNotes, setRejectAccessNotes] = useState('');
  const [approveDialog, setApproveDialog] = useState<AccessRequest | null>(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchClassrooms = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/classrooms', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = (data.classrooms || []).map((c: any) => ({ id: c.id, name: c.name }));
      setClassrooms(list);
    } catch (err) {
      console.error('Failed to fetch classrooms:', err);
    }
  }, [getToken]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const fetchAccessRequests = useCallback(async () => {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    fetchAccessRequests();
  }, [fetchAccessRequests]);

  const handleApproveAccess = async () => {
    if (!approveDialog || !selectedClassroomId) return;
    setActionLoading(approveDialog.id);
    setError(null);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/classroom-access/requests', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: approveDialog.id,
          action: 'approve',
          classroom_id: selectedClassroomId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to approve access request');
      }
      const classroomName = classrooms.find((c) => c.id === selectedClassroomId)?.name || 'classroom';
      setSuccess(`${approveDialog.user_name} enrolled in ${classroomName}.`);
      setApproveDialog(null);
      setSelectedClassroomId('');
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

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Classroom Access Requests
        </Typography>
        {accessRequests.length > 0 && (
          <Chip
            label={`${accessRequests.length} pending`}
            color="warning"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>

      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Students who sign in but aren&apos;t in a classroom yet can request access from the welcome
        screen. Approving a request enrolls them into the classroom you choose.
      </Typography>

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

      {loading ? (
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
              onApprove={() => {
                setApproveDialog(req);
                setSelectedClassroomId('');
              }}
              onReject={() => setRejectAccessDialog({ requestId: req.id, name: req.user_name })}
              isLoading={actionLoading === req.id}
            />
          ))}
        </Box>
      )}

      {/* Approve access request dialog — admin must pick a classroom */}
      <Dialog
        open={!!approveDialog}
        onClose={() => {
          setApproveDialog(null);
          setSelectedClassroomId('');
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Approve {approveDialog?.user_name}</DialogTitle>
        <DialogContent>
          {approveDialog && (
            <>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  Identity
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {approveDialog.user_name}
                </Typography>
                {approveDialog.linked_classroom_email && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                    Microsoft: {approveDialog.linked_classroom_email}
                  </Typography>
                )}
                {approveDialog.primary_email && (
                  <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                    Login email: {approveDialog.primary_email}
                  </Typography>
                )}
                {!approveDialog.has_ms_oid && (
                  <Alert severity="warning" sx={{ mt: 1, py: 0 }}>
                    No Microsoft account linked. Verify identity before approving.
                  </Alert>
                )}
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Select the classroom to enroll this student into:
              </Typography>
              <TextField
                select
                fullWidth
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                SelectProps={{ native: true }}
              >
                <option value="">-- Choose classroom --</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </TextField>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setApproveDialog(null);
              setSelectedClassroomId('');
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            disabled={!selectedClassroomId || !!actionLoading}
            onClick={handleApproveAccess}
            startIcon={actionLoading ? <CircularProgress size={16} /> : undefined}
          >
            Approve &amp; Enroll
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
        <UserAvatar src={request.avatar_url} name={request.user_name} size={44} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {request.user_name}
          </Typography>
          {request.linked_classroom_email ? (
            <Typography
              variant="caption"
              sx={{ display: 'block', color: 'success.main', wordBreak: 'break-all', fontWeight: 600 }}
            >
              MS: {request.linked_classroom_email}
            </Typography>
          ) : (
            <Typography
              variant="caption"
              sx={{ display: 'block', color: 'warning.dark', wordBreak: 'break-all', fontWeight: 600 }}
            >
              No MS classroom email linked
            </Typography>
          )}
          {request.primary_email && request.primary_email !== request.linked_classroom_email && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', wordBreak: 'break-all' }}>
              Login: {request.primary_email}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
          <Chip
            label={daysSinceRequest > 0 ? `${daysSinceRequest}d ago` : 'Today'}
            color={daysSinceRequest > 3 ? 'warning' : 'default'}
            size="small"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {!request.has_ms_oid && (
            <Chip label="No MS link" color="warning" size="small" sx={{ fontWeight: 600 }} />
          )}
        </Box>
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
