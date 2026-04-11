// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  Button,
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
  CircularProgress,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Avatar,
} from '@neram/ui';
import SupportAgentIcon from '@mui/icons-material/SupportAgent';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import CloseIcon from '@mui/icons-material/Close';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
import SendIcon from '@mui/icons-material/Send';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import ImageIcon from '@mui/icons-material/Image';
import type {
  SupportTicket,
  SupportTicketComment,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportTicketPriority,
} from '@neram/database';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import CopyablePhone from '@/components/CopyablePhone';

// ============================================
// CONSTANTS
// ============================================

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  { value: 'enrollment_issue', label: 'Enrollment Issue' },
  { value: 'payment_issue', label: 'Payment Issue' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'account_issue', label: 'Account Issue' },
  { value: 'course_question', label: 'Course Question' },
  { value: 'other', label: 'Other' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const CATEGORY_LABELS: Record<string, string> = {
  enrollment_issue: 'Enrollment Issue',
  payment_issue: 'Payment Issue',
  technical_issue: 'Technical Issue',
  account_issue: 'Account Issue',
  course_question: 'Course Question',
  other: 'Other',
};

// ============================================
// HELPERS
// ============================================

function getStatusColor(status: SupportTicketStatus): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'open':
      return 'success';
    case 'in_progress':
      return 'info';
    case 'resolved':
      return 'warning';
    case 'closed':
      return 'default';
    default:
      return 'default';
  }
}

function getStatusLabel(status: SupportTicketStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'in_progress':
      return 'In Progress';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return status;
  }
}

function getPriorityColor(priority: SupportTicketPriority): 'success' | 'warning' | 'error' {
  switch (priority) {
    case 'low':
      return 'success';
    case 'medium':
      return 'warning';
    case 'high':
      return 'error';
    default:
      return 'success';
  }
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ============================================
// STAT CARD COMPONENT
// ============================================

function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flex: 1,
        minWidth: 160,
      }}
    >
      <Box
        sx={{
          width: 36,
          height: 36,
          borderRadius: 1,
          bgcolor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
          {title}
        </Typography>
        {loading ? (
          <Skeleton width={60} height={32} />
        ) : (
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

// ============================================
// TICKET DETAIL DIALOG
// ============================================

interface TicketDetailDialogProps {
  open: boolean;
  onClose: () => void;
  ticketId: string | null;
  adminName: string;
  onTicketUpdated: () => void;
}

function TicketDetailDialog({ open, onClose, ticketId, adminName, onTicketUpdated }: TicketDetailDialogProps) {
  const [ticket, setTicket] = useState<(SupportTicket & { comments: SupportTicketComment[] }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [statusValue, setStatusValue] = useState<SupportTicketStatus>('open');
  const [priorityValue, setPriorityValue] = useState<SupportTicketPriority>('medium');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [updating, setUpdating] = useState(false);
  const [showResolveForm, setShowResolveForm] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const commentsEndRef = useRef<HTMLDivElement>(null);

  const fetchTicketDetail = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/support-tickets/${ticketId}`);
      if (!res.ok) throw new Error('Failed to fetch ticket');
      const data = await res.json();
      setTicket(data.data);
      setStatusValue(data.data.status);
      setPriorityValue(data.data.priority);
      setResolutionNotes(data.data.resolution_notes || '');
    } catch (err: any) {
      setError(err.message || 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (open && ticketId) {
      fetchTicketDetail();
      setShowResolveForm(false);
      setCommentText('');
    }
  }, [open, ticketId, fetchTicketDetail]);

  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.comments]);

  const handleSendComment = async () => {
    if (!commentText.trim() || !ticketId) return;
    setSendingComment(true);
    try {
      const res = await fetch(`/api/support-tickets/${ticketId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim(), adminName }),
      });
      if (!res.ok) throw new Error('Failed to send comment');
      setCommentText('');
      fetchTicketDetail();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to send comment' });
    } finally {
      setSendingComment(false);
    }
  };

  const handleStatusChange = async (newStatus: SupportTicketStatus) => {
    if (!ticketId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      setStatusValue(newStatus);
      fetchTicketDetail();
      onTicketUpdated();
      setSnackbar({ open: true, message: `Status changed to ${getStatusLabel(newStatus)}` });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to update status' });
    } finally {
      setUpdating(false);
    }
  };

  const handlePriorityChange = async (newPriority: SupportTicketPriority) => {
    if (!ticketId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: newPriority }),
      });
      if (!res.ok) throw new Error('Failed to update priority');
      setPriorityValue(newPriority);
      fetchTicketDetail();
      onTicketUpdated();
      setSnackbar({ open: true, message: `Priority changed to ${newPriority}` });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to update priority' });
    } finally {
      setUpdating(false);
    }
  };

  const handleResolve = async () => {
    if (!ticketId) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'resolved',
          resolution_notes: resolutionNotes,
          resolved_by: adminName,
        }),
      });
      if (!res.ok) throw new Error('Failed to resolve ticket');
      setShowResolveForm(false);
      fetchTicketDetail();
      onTicketUpdated();
      setSnackbar({ open: true, message: 'Ticket resolved successfully' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to resolve ticket' });
    } finally {
      setUpdating(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!ticketId) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { assigned_to: adminName };
      // Also move to in_progress if currently open
      if (ticket?.status === 'open') {
        body.status = 'in_progress';
      }
      const res = await fetch(`/api/support-tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to assign ticket');
      fetchTicketDetail();
      onTicketUpdated();
      setSnackbar({ open: true, message: 'Ticket assigned to you' });
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to assign ticket' });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2, maxHeight: '90vh' },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SupportAgentIcon color="primary" />
            <Typography variant="h6" fontWeight={700}>
              {ticket ? `Ticket ${ticket.ticket_number}` : 'Ticket Detail'}
            </Typography>
            {ticket && (
              <Chip
                label={getStatusLabel(ticket.status)}
                size="small"
                color={getStatusColor(ticket.status)}
                sx={{ fontWeight: 500, ml: 1 }}
              />
            )}
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <Divider />

        <DialogContent sx={{ p: 0 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error" sx={{ m: 2 }}>
              {error}
            </Alert>
          ) : ticket ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '70vh' }}>
              {/* Ticket Info Section */}
              <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'grey.200' }}>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="caption" color="text.secondary">Student Name</Typography>
                    <Typography variant="body2" fontWeight={600}>{ticket.user_name}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <Typography variant="caption" color="text.secondary">Email</Typography>
                    <Typography variant="body2">{ticket.user_email || '-'}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 150 }}>
                    <Typography variant="caption" color="text.secondary">Phone</Typography>
                    <CopyablePhone phone={ticket.user_phone} />
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                  <Box sx={{ flex: 1, minWidth: 150 }}>
                    <Typography variant="caption" color="text.secondary">Category</Typography>
                    <Typography variant="body2">
                      <Chip
                        label={CATEGORY_LABELS[ticket.category] || ticket.category}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.75rem' }}
                      />
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 150 }}>
                    <Typography variant="caption" color="text.secondary">Priority</Typography>
                    <Typography variant="body2">
                      <Chip
                        label={ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                        size="small"
                        color={getPriorityColor(ticket.priority)}
                        sx={{ fontSize: '0.75rem' }}
                      />
                    </Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 150 }}>
                    <Typography variant="caption" color="text.secondary">Assigned To</Typography>
                    <Typography variant="body2">{ticket.assigned_to || 'Unassigned'}</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 150 }}>
                    <Typography variant="caption" color="text.secondary">Created</Typography>
                    <Typography variant="body2">{formatDateTime(ticket.created_at)}</Typography>
                  </Box>
                </Box>

                {/* Subject & Description */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>{ticket.subject}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, whiteSpace: 'pre-wrap' }}>
                    {ticket.description}
                  </Typography>
                </Box>

                {/* Screenshot Thumbnails */}
                {ticket.screenshot_urls && ticket.screenshot_urls.length > 0 && (
                  <Box sx={{ mt: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                      Screenshots ({ticket.screenshot_urls.length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {ticket.screenshot_urls.map((url, idx) => (
                        <Box
                          key={idx}
                          onClick={() => setImagePreview(url)}
                          sx={{
                            width: 80,
                            height: 80,
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'grey.300',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'grey.100',
                            '&:hover': { borderColor: 'primary.main' },
                          }}
                        >
                          <Box
                            component="img"
                            src={url}
                            alt={`Screenshot ${idx + 1}`}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              e.currentTarget.parentElement?.querySelector('.fallback-icon')?.removeAttribute('style');
                            }}
                          />
                          <ImageIcon className="fallback-icon" sx={{ color: 'grey.400', display: 'none' }} />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Resolution Notes */}
                {ticket.resolution_notes && (
                  <Box sx={{ mt: 1.5, p: 1.5, bgcolor: 'success.50', borderRadius: 1, border: '1px solid', borderColor: 'success.200' }}>
                    <Typography variant="caption" color="success.dark" fontWeight={600}>Resolution Notes</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5 }}>{ticket.resolution_notes}</Typography>
                    {ticket.resolved_at && (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                        Resolved {formatDateTime(ticket.resolved_at)} by {ticket.resolved_by || 'Admin'}
                      </Typography>
                    )}
                  </Box>
                )}
              </Box>

              {/* Actions Bar */}
              <Box sx={{ p: 1.5, display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', borderBottom: '1px solid', borderColor: 'grey.200' }}>
                <TextField
                  select
                  size="small"
                  label="Status"
                  value={statusValue}
                  onChange={(e) => handleStatusChange(e.target.value as SupportTicketStatus)}
                  disabled={updating}
                  sx={{ minWidth: 140 }}
                >
                  {STATUS_OPTIONS.filter((o) => o.value !== '').map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Priority"
                  value={priorityValue}
                  onChange={(e) => handlePriorityChange(e.target.value as SupportTicketPriority)}
                  disabled={updating}
                  sx={{ minWidth: 120 }}
                >
                  {PRIORITY_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                  ))}
                </TextField>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleAssignToMe}
                  disabled={updating || ticket.assigned_to === adminName}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {ticket.assigned_to === adminName ? 'Assigned to You' : 'Assign to Me'}
                </Button>
                {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    onClick={() => setShowResolveForm(!showResolveForm)}
                    disabled={updating}
                    startIcon={<CheckCircleIcon />}
                    sx={{ textTransform: 'none', fontWeight: 600, ml: 'auto' }}
                  >
                    Resolve
                  </Button>
                )}
              </Box>

              {/* Resolve Form */}
              {showResolveForm && (
                <Box sx={{ p: 2, bgcolor: 'success.50', borderBottom: '1px solid', borderColor: 'grey.200' }}>
                  <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                    Resolve Ticket
                  </Typography>
                  <TextField
                    multiline
                    rows={3}
                    fullWidth
                    size="small"
                    placeholder="Add resolution notes (what was done to resolve this issue)..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                  />
                  <Box sx={{ display: 'flex', gap: 1, mt: 1, justifyContent: 'flex-end' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setShowResolveForm(false)}
                      sx={{ textTransform: 'none' }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      onClick={handleResolve}
                      disabled={updating}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      {updating ? 'Resolving...' : 'Confirm Resolve'}
                    </Button>
                  </Box>
                </Box>
              )}

              {/* Comments Thread */}
              <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5 }}>
                  Comments ({ticket.comments?.length || 0})
                </Typography>
                {(!ticket.comments || ticket.comments.length === 0) ? (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    No comments yet. Start the conversation below.
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {ticket.comments.map((comment) => (
                      <Box
                        key={comment.id}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: comment.is_admin ? 'flex-end' : 'flex-start',
                          maxWidth: '80%',
                          alignSelf: comment.is_admin ? 'flex-end' : 'flex-start',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                          {comment.is_admin ? (
                            <AdminPanelSettingsIcon sx={{ fontSize: 14, color: 'primary.main' }} />
                          ) : (
                            <PersonIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          )}
                          <Typography variant="caption" fontWeight={600} color={comment.is_admin ? 'primary.main' : 'text.secondary'}>
                            {comment.user_name}
                          </Typography>
                          <Typography variant="caption" color="text.disabled">
                            {formatRelativeTime(comment.created_at)}
                          </Typography>
                        </Box>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.5,
                            borderRadius: 1.5,
                            bgcolor: comment.is_admin ? 'primary.50' : 'grey.100',
                            border: '1px solid',
                            borderColor: comment.is_admin ? 'primary.100' : 'grey.200',
                            maxWidth: '100%',
                          }}
                        >
                          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {comment.content}
                          </Typography>
                        </Paper>
                      </Box>
                    ))}
                    <div ref={commentsEndRef} />
                  </Box>
                )}
              </Box>

              {/* Comment Input */}
              <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'grey.200', display: 'flex', gap: 1 }}>
                <TextField
                  fullWidth
                  size="small"
                  placeholder="Type your reply..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendComment();
                    }
                  }}
                  multiline
                  maxRows={3}
                />
                <IconButton
                  color="primary"
                  onClick={handleSendComment}
                  disabled={!commentText.trim() || sendingComment}
                  sx={{ alignSelf: 'flex-end' }}
                >
                  {sendingComment ? <CircularProgress size={20} /> : <SendIcon />}
                </IconButton>
              </Box>
            </Box>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Image Preview Dialog */}
      <Dialog
        open={!!imagePreview}
        onClose={() => setImagePreview(null)}
        maxWidth="lg"
        PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none' } }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setImagePreview(null)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              bgcolor: 'rgba(0,0,0,0.6)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
            }}
          >
            <CloseIcon />
          </IconButton>
          {imagePreview && (
            <Box
              component="img"
              src={imagePreview}
              alt="Screenshot preview"
              sx={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 2 }}
            />
          )}
        </Box>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

// ============================================
// MAIN PAGE
// ============================================

interface TicketStats {
  open: number;
  in_progress: number;
  resolved: number;
  total: number;
}

export default function SupportTicketsPage() {
  const { supabaseUserId, supabaseName } = useAdminProfile();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get('highlight');

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<TicketStats>({ open: 0, in_progress: 0, resolved: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('limit', String(rowsPerPage));
      if (statusFilter) params.set('status', statusFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/support-tickets?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch tickets (HTTP ${res.status})`);
      }

      const data = await res.json();
      setTickets(data.data || []);
      setTotalCount(data.pagination?.total || 0);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, categoryFilter, debouncedSearch]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/support-tickets?stats=true&page=1&limit=1');
      if (!res.ok) return;
      const data = await res.json();
      if (data.stats) {
        setStats(data.stats);
      }
    } catch {
      // Silent fail for stats
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Auto-open ticket from URL param
  useEffect(() => {
    if (highlightId && !detailOpen) {
      setSelectedTicketId(highlightId);
      setDetailOpen(true);
    }
  }, [highlightId]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
    setSearchDebounce(timeout);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const handleCategoryChange = (value: string) => {
    setCategoryFilter(value);
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRowClick = (ticket: SupportTicket) => {
    setSelectedTicketId(ticket.id);
    setDetailOpen(true);
  };

  const handleTicketUpdated = () => {
    fetchTickets();
    fetchStats();
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: '#7B1FA2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SupportAgentIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Support Tickets
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading...' : `${totalCount} ticket${totalCount !== 1 ? 's' : ''} total`}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh data">
          <span>
            <IconButton size="small" onClick={() => { fetchTickets(); fetchStats(); }} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <StatCard
          title="Open"
          value={stats.open}
          icon={<FiberNewIcon sx={{ color: '#2E7D32', fontSize: 24 }} />}
          color="#2E7D32"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="In Progress"
          value={stats.in_progress}
          icon={<HourglassEmptyIcon sx={{ color: '#1565C0', fontSize: 24 }} />}
          color="#1565C0"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="Resolved"
          value={stats.resolved}
          icon={<AssignmentTurnedInIcon sx={{ color: '#7B1FA2', fontSize: 24 }} />}
          color="#7B1FA2"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="Total"
          value={stats.total}
          icon={<SupportAgentIcon sx={{ color: '#616161', fontSize: 24 }} />}
          color="#616161"
          loading={loading && stats.total === 0}
        />
      </Box>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          placeholder="Search by ticket #, name, email, subject..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 300, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          sx={{ minWidth: 160 }}
          label="Status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={categoryFilter}
          onChange={(e) => handleCategoryChange(e.target.value)}
          sx={{ minWidth: 180 }}
          label="Category"
        >
          {CATEGORY_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {/* Data Table */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          overflow: 'hidden',
        }}
      >
        {loading && tickets.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : tickets.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 300, gap: 2 }}>
            <SupportAgentIcon sx={{ fontSize: 48, color: 'grey.400' }} />
            <Typography color="text.secondary">No support tickets found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Ticket #</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Student Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Subject</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Priority</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Created</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tickets.map((ticket) => (
                    <TableRow
                      key={ticket.id}
                      hover
                      onClick={() => handleRowClick(ticket)}
                      sx={{
                        cursor: 'pointer',
                        '&:last-child td': { borderBottom: 0 },
                        bgcolor: highlightId === ticket.id ? 'action.selected' : 'inherit',
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ fontFamily: 'monospace' }}>
                          {ticket.ticket_number}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 180 }}>
                          {ticket.user_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={CATEGORY_LABELS[ticket.category] || ticket.category}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 250 }}>
                          {ticket.subject}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getStatusLabel(ticket.status)}
                          size="small"
                          color={getStatusColor(ticket.status)}
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                          size="small"
                          color={getPriorityColor(ticket.priority)}
                          variant="outlined"
                          sx={{ fontWeight: 500, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Tooltip title={formatDateTime(ticket.created_at)} arrow>
                          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                            {formatRelativeTime(ticket.created_at)}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 20, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </Paper>

      {/* Ticket Detail Dialog */}
      <TicketDetailDialog
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedTicketId(null); }}
        ticketId={selectedTicketId}
        adminName={supabaseName || 'Admin'}
        onTicketUpdated={handleTicketUpdated}
      />

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
