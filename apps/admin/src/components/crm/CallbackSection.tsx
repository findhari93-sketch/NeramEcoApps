'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Divider,
  CircularProgress,
  Avatar,
} from '@neram/ui';
import PhoneCallbackIcon from '@mui/icons-material/PhoneCallback';
import ScheduleIcon from '@mui/icons-material/Schedule';
import AddIcCallIcon from '@mui/icons-material/AddIcCall';
import BlockIcon from '@mui/icons-material/Block';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import PersonIcon from '@mui/icons-material/Person';
import type { UserJourneyDetail, CallbackOutcome, CallbackRequest, CallbackAttempt } from '@neram/database';

interface CallbackSectionProps {
  detail: UserJourneyDetail;
  adminId: string;
  adminName: string;
  onStatusChange: () => void;
}

// Outcome chip color configuration
const OUTCOME_CONFIG: Record<CallbackOutcome, { color: string; bgColor: string; label: string }> = {
  talked: { color: '#2E7D32', bgColor: '#2E7D3214', label: 'Talked' },
  not_picked_up: { color: '#F57C00', bgColor: '#F57C0014', label: 'Not Picked Up' },
  not_reachable: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'Not Reachable' },
  rescheduled: { color: '#1976D2', bgColor: '#1976D214', label: 'Rescheduled' },
  dead_lead: { color: '#78909C', bgColor: '#78909C14', label: 'Dead Lead' },
};

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(dateStr);
}

// Get the next scheduled callback across all requests
function getNextScheduledCallback(requests: CallbackRequest[]): CallbackRequest | null {
  const now = new Date().toISOString();
  const scheduled = requests
    .filter(
      (r) =>
        r.status === 'scheduled' &&
        !r.is_dead_lead &&
        r.scheduled_callback_at &&
        r.scheduled_callback_at >= now
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_callback_at!).getTime() -
        new Date(b.scheduled_callback_at!).getTime()
    );
  return scheduled[0] || null;
}

// Check if user is already a dead lead
function isDeadLead(requests: CallbackRequest[]): boolean {
  return requests.some((r) => r.is_dead_lead);
}

export default function CallbackSection({
  detail,
  adminId,
  adminName,
  onStatusChange,
}: CallbackSectionProps) {
  const { callbackRequests, callbackAttempts } = detail;

  // Dialog states
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const [deadLeadOpen, setDeadLeadOpen] = useState(false);

  // Form states
  const [scheduledAt, setScheduledAt] = useState('');
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<CallbackOutcome | ''>('');
  const [outcomeComments, setOutcomeComments] = useState('');
  const [rescheduledTo, setRescheduledTo] = useState('');
  const [selectedCallbackId, setSelectedCallbackId] = useState('');
  const [deadLeadReason, setDeadLeadReason] = useState('');

  // Loading states
  const [scheduling, setScheduling] = useState(false);
  const [recording, setRecording] = useState(false);
  const [markingDead, setMarkingDead] = useState(false);
  const [error, setError] = useState('');

  const userIsDeadLead = isDeadLead(callbackRequests);
  const nextCallback = getNextScheduledCallback(callbackRequests);

  // Get the most recent active callback request (for recording outcome)
  const activeRequest = callbackRequests.find(
    (r) => ['scheduled', 'attempted', 'pending'].includes(r.status) && !r.is_dead_lead
  );

  // ---- Handlers ----

  const handleScheduleCallback = async () => {
    if (!scheduledAt) return;
    setScheduling(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/callbacks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: new Date(scheduledAt).toISOString(),
          notes: scheduleNotes || undefined,
          adminId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to schedule callback');
      }
      setScheduleOpen(false);
      setScheduledAt('');
      setScheduleNotes('');
      onStatusChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setScheduling(false);
    }
  };

  const handleRecordOutcome = async () => {
    if (!selectedOutcome || !selectedCallbackId) return;
    setRecording(true);
    setError('');
    try {
      const res = await fetch(
        `/api/crm/users/${detail.user.id}/callbacks/${selectedCallbackId}/attempt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outcome: selectedOutcome,
            comments: outcomeComments || undefined,
            rescheduledTo:
              selectedOutcome === 'rescheduled' && rescheduledTo
                ? new Date(rescheduledTo).toISOString()
                : undefined,
            adminId,
            adminName,
          }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to record outcome');
      }
      setOutcomeOpen(false);
      setSelectedOutcome('');
      setOutcomeComments('');
      setRescheduledTo('');
      setSelectedCallbackId('');
      onStatusChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRecording(false);
    }
  };

  const handleMarkDeadLead = async () => {
    if (!deadLeadReason.trim()) return;
    setMarkingDead(true);
    setError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/dead-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: deadLeadReason, adminId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to mark as dead lead');
      }
      setDeadLeadOpen(false);
      setDeadLeadReason('');
      onStatusChange();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setMarkingDead(false);
    }
  };

  const openRecordOutcome = (callbackId: string) => {
    setSelectedCallbackId(callbackId);
    setSelectedOutcome('');
    setOutcomeComments('');
    setRescheduledTo('');
    setError('');
    setOutcomeOpen(true);
  };

  return (
    <Paper
      elevation={0}
      sx={{
        mb: 2,
        border: '1px solid',
        borderColor: 'grey.200',
        borderRadius: 1,
        overflow: 'hidden',
        opacity: userIsDeadLead ? 0.7 : 1,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'grey.100',
          bgcolor: 'grey.50',
        }}
      >
        <PhoneCallbackIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>
          Callback Management
        </Typography>
        {callbackRequests.length > 0 && (
          <Chip
            label={callbackRequests.length}
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              bgcolor: 'grey.200',
              color: 'text.secondary',
              borderRadius: 1,
              ml: 0.5,
            }}
          />
        )}
        {userIsDeadLead && (
          <Chip
            label="Dead Lead"
            size="small"
            sx={{
              height: 20,
              fontSize: 10,
              fontWeight: 700,
              bgcolor: '#78909C14',
              color: '#78909C',
              borderRadius: 1,
              border: '1px solid #78909C30',
              ml: 'auto',
            }}
          />
        )}
      </Box>

      <Box sx={{ p: 1.5 }}>
        {/* Error alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 0.75 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {/* Status summary */}
        {nextCallback && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              bgcolor: '#E3F2FD',
              borderRadius: 0.75,
              border: '1px solid #BBDEFB',
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <ScheduleIcon sx={{ color: '#1565C0', fontSize: 20 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12, color: '#1565C0' }}>
                Next Scheduled Callback
              </Typography>
              <Typography variant="body2" sx={{ fontSize: 13, color: '#0D47A1', fontWeight: 500 }}>
                {formatDateTime(nextCallback.scheduled_callback_at)}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Action buttons */}
        {!userIsDeadLead && (
          <Stack direction="row" spacing={1.5} sx={{ mb: 2.5 }}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcCallIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                setScheduledAt('');
                setScheduleNotes('');
                setError('');
                setScheduleOpen(true);
              }}
              sx={{
                borderRadius: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                boxShadow: 'none',
                px: 2,
              }}
            >
              Schedule Callback
            </Button>
            {activeRequest && (
              <Button
                variant="outlined"
                size="small"
                startIcon={<PhoneCallbackIcon sx={{ fontSize: 16 }} />}
                onClick={() => openRecordOutcome(activeRequest.id)}
                sx={{
                  borderRadius: 0.75,
                  textTransform: 'none',
                  fontWeight: 500,
                  px: 2,
                }}
              >
                Record Outcome
              </Button>
            )}
            <Button
              variant="outlined"
              size="small"
              color="error"
              startIcon={<BlockIcon sx={{ fontSize: 16 }} />}
              onClick={() => {
                setDeadLeadReason('');
                setError('');
                setDeadLeadOpen(true);
              }}
              sx={{
                borderRadius: 0.75,
                textTransform: 'none',
                fontWeight: 500,
                px: 2,
              }}
            >
              Mark as Dead Lead
            </Button>
          </Stack>
        )}

        {/* Callback Attempts Timeline */}
        {callbackAttempts.length > 0 && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: 1,
                color: 'text.secondary',
                mb: 1.5,
                display: 'block',
              }}
            >
              Callback History ({callbackAttempts.length})
            </Typography>
            {callbackAttempts.map((attempt: CallbackAttempt, index: number) => {
              const config = OUTCOME_CONFIG[attempt.outcome] || OUTCOME_CONFIG.not_reachable;
              return (
                <Box
                  key={attempt.id}
                  sx={{
                    p: 2,
                    mb: index < callbackAttempts.length - 1 ? 1.5 : 0,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'grey.100',
                    borderLeft: '3px solid',
                    borderLeftColor: config.color,
                    transition: 'box-shadow 0.15s',
                    '&:hover': { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
                  }}
                >
                  {/* Attempt header */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      mb: 0.75,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar
                        sx={{
                          width: 22,
                          height: 22,
                          fontSize: 9,
                          fontWeight: 700,
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                        }}
                      >
                        {attempt.admin_name?.charAt(0) || 'A'}
                      </Avatar>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                        {attempt.admin_name}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{ fontSize: 11 }}
                      >
                        {timeAgo(attempt.attempted_at)}
                      </Typography>
                    </Box>
                    <Chip
                      label={config.label}
                      size="small"
                      sx={{
                        height: 20,
                        fontSize: 10,
                        fontWeight: 700,
                        bgcolor: config.bgColor,
                        color: config.color,
                        borderRadius: 1,
                        border: `1px solid ${config.color}30`,
                      }}
                    />
                  </Box>

                  {/* Comments */}
                  {attempt.comments && (
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: 12,
                        color: 'text.secondary',
                        mt: 0.5,
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.5,
                      }}
                    >
                      {attempt.comments}
                    </Typography>
                  )}

                  {/* Rescheduled to */}
                  {attempt.rescheduled_to && (
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        mt: 0.75,
                      }}
                    >
                      <AccessTimeIcon sx={{ fontSize: 13, color: '#1976D2' }} />
                      <Typography
                        variant="caption"
                        sx={{ fontSize: 11, color: '#1976D2', fontWeight: 500 }}
                      >
                        Rescheduled to: {formatDateTime(attempt.rescheduled_to)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              );
            })}
          </>
        )}

        {/* Callback Requests list (if no attempts yet, show request info) */}
        {callbackAttempts.length === 0 && callbackRequests.length > 0 && (
          <>
            <Divider sx={{ mb: 2 }} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: 1,
                color: 'text.secondary',
                mb: 1.5,
                display: 'block',
              }}
            >
              Scheduled Callbacks ({callbackRequests.length})
            </Typography>
            {callbackRequests.map((req: CallbackRequest, index: number) => (
              <Box
                key={req.id}
                sx={{
                  p: 2,
                  mb: index < callbackRequests.length - 1 ? 1.5 : 0,
                  bgcolor: 'background.paper',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'grey.100',
                  borderLeft: '3px solid',
                  borderLeftColor: req.is_dead_lead
                    ? '#78909C'
                    : req.status === 'completed'
                      ? '#2E7D32'
                      : '#1976D2',
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    mb: 0.5,
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <ScheduleIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: 12 }}>
                      {req.scheduled_callback_at
                        ? formatDateTime(req.scheduled_callback_at)
                        : 'No time set'}
                    </Typography>
                  </Box>
                  <Chip
                    label={req.status}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 1,
                      textTransform: 'capitalize',
                      bgcolor:
                        req.status === 'completed'
                          ? '#2E7D3214'
                          : req.status === 'scheduled'
                            ? '#1976D214'
                            : '#78909C14',
                      color:
                        req.status === 'completed'
                          ? '#2E7D32'
                          : req.status === 'scheduled'
                            ? '#1976D2'
                            : '#78909C',
                    }}
                  />
                </Box>
                {req.notes && (
                  <Typography
                    variant="body2"
                    sx={{ fontSize: 12, color: 'text.secondary', mt: 0.5 }}
                  >
                    {req.notes}
                  </Typography>
                )}
                {/* Record outcome for this request */}
                {!userIsDeadLead &&
                  ['scheduled', 'attempted', 'pending'].includes(req.status) && (
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => openRecordOutcome(req.id)}
                      sx={{
                        mt: 1,
                        textTransform: 'none',
                        fontSize: 11,
                        fontWeight: 600,
                        px: 1,
                        py: 0.25,
                      }}
                    >
                      Record Outcome
                    </Button>
                  )}
              </Box>
            ))}
          </>
        )}

        {/* Empty state */}
        {callbackRequests.length === 0 && callbackAttempts.length === 0 && (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <PhoneCallbackIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
            <Typography variant="body2" color="text.secondary">
              No callbacks scheduled yet. Schedule one to track outreach.
            </Typography>
          </Box>
        )}
      </Box>

      {/* ===== Schedule Callback Dialog ===== */}
      <Dialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Schedule Callback</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Date & Time"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              inputProps={{
                min: new Date().toISOString().slice(0, 16),
              }}
            />
            <TextField
              label="Notes (optional)"
              value={scheduleNotes}
              onChange={(e) => setScheduleNotes(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Add any notes about this callback..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setScheduleOpen(false)}
            size="small"
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleScheduleCallback}
            disabled={!scheduledAt || scheduling}
            size="small"
            sx={{ textTransform: 'none', boxShadow: 'none' }}
          >
            {scheduling ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            {scheduling ? 'Scheduling...' : 'Schedule'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Record Outcome Dialog ===== */}
      <Dialog
        open={outcomeOpen}
        onClose={() => setOutcomeOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16 }}>Record Call Outcome</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Outcome</InputLabel>
              <Select
                value={selectedOutcome}
                onChange={(e) => setSelectedOutcome(e.target.value as CallbackOutcome)}
                label="Outcome"
              >
                <MenuItem value="talked">Talked</MenuItem>
                <MenuItem value="not_picked_up">Not Picked Up</MenuItem>
                <MenuItem value="not_reachable">Not Reachable</MenuItem>
                <MenuItem value="rescheduled">Rescheduled</MenuItem>
                <MenuItem value="dead_lead">Dead Lead</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Comments"
              value={outcomeComments}
              onChange={(e) => setOutcomeComments(e.target.value)}
              fullWidth
              size="small"
              multiline
              rows={2}
              placeholder="Notes about this call..."
            />

            {selectedOutcome === 'rescheduled' && (
              <TextField
                label="Reschedule To"
                type="datetime-local"
                value={rescheduledTo}
                onChange={(e) => setRescheduledTo(e.target.value)}
                fullWidth
                size="small"
                InputLabelProps={{ shrink: true }}
                inputProps={{
                  min: new Date().toISOString().slice(0, 16),
                }}
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setOutcomeOpen(false)}
            size="small"
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecordOutcome}
            disabled={
              !selectedOutcome ||
              recording ||
              (selectedOutcome === 'rescheduled' && !rescheduledTo)
            }
            size="small"
            sx={{ textTransform: 'none', boxShadow: 'none' }}
          >
            {recording ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            {recording ? 'Saving...' : 'Save Outcome'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ===== Dead Lead Confirmation Dialog ===== */}
      <Dialog
        open={deadLeadOpen}
        onClose={() => setDeadLeadOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 16, color: 'error.main' }}>
          Mark as Dead Lead
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2, borderRadius: 0.75 }}>
            This will mark the user as a dead lead and close all open callback requests. This action
            is not easily reversible.
          </Alert>
          <TextField
            label="Reason"
            value={deadLeadReason}
            onChange={(e) => setDeadLeadReason(e.target.value)}
            fullWidth
            size="small"
            multiline
            rows={2}
            placeholder="Why is this a dead lead?"
            required
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setDeadLeadOpen(false)}
            size="small"
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleMarkDeadLead}
            disabled={!deadLeadReason.trim() || markingDead}
            size="small"
            sx={{ textTransform: 'none', boxShadow: 'none' }}
          >
            {markingDead ? <CircularProgress size={16} sx={{ mr: 1 }} /> : null}
            {markingDead ? 'Marking...' : 'Confirm Dead Lead'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
