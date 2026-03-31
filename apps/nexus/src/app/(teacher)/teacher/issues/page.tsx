'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Button,
  TextField,
  Avatar,
  alpha,
  useTheme,
  Tabs,
  Tab,
  Drawer,
  IconButton,
  Divider,
  useMediaQuery,
  SwipeableDrawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  CircularProgress,
  Tooltip,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Snackbar,
  Alert,
} from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PersonOutlinedIcon from '@mui/icons-material/PersonOutlined';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import SendIcon from '@mui/icons-material/Send';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CommentOutlinedIcon from '@mui/icons-material/CommentOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RemoveIcon from '@mui/icons-material/Remove';
import TimelineIcon from '@mui/icons-material/Timeline';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type {
  NexusFoundationIssueWithDetails,
  FoundationIssueStatus,
  FoundationIssuePriority,
  NexusFoundationIssueActivity,
} from '@neram/database/types';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: '#d32f2f' },
  content_issue: { label: 'Content', color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', color: '#1976d2' },
  feature_request: { label: 'Feature', color: '#7b1fa2' },
  class_schedule: { label: 'Class', color: '#2e7d32' },
  other: { label: 'Other', color: '#757575' },
};

interface StaffUser {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  user_type: string;
  source: string;
}

export default function TeacherIssuesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { getToken } = useNexusAuthContext();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [selectedIssue, setSelectedIssue] = useState<NexusFoundationIssueWithDetails | null>(null);
  const [updating, setUpdating] = useState(false);

  // Activity log
  const [activity, setActivity] = useState<NexusFoundationIssueActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Assignment dialog
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [staffResults, setStaffResults] = useState<StaffUser[]>([]);
  const [staffSearching, setStaffSearching] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);

  // Delegate dialog
  const [delegateDialogOpen, setDelegateDialogOpen] = useState(false);
  const [delegateReason, setDelegateReason] = useState('');
  const [delegateTarget, setDelegateTarget] = useState<StaffUser | null>(null);

  // Return dialog
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState('');

  // Resolve
  const [resolutionNote, setResolutionNote] = useState('');

  // Comment
  const [comment, setComment] = useState('');
  const [commentSending, setCommentSending] = useState(false);

  // More actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Success feedback
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

  useEffect(() => {
    fetchIssues();
  }, []);

  async function fetchIssues() {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/issues', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues || []);
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchIssueDetail(issueId: string) {
    setActivityLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.issue) setSelectedIssue(data.issue);
        setActivity(data.activity || []);
      }
    } catch (err) {
      console.error('Failed to load issue detail:', err);
    } finally {
      setActivityLoading(false);
    }
  }

  const searchStaff = useCallback(
    async (query: string) => {
      if (query.length < 2) {
        setStaffResults([]);
        return;
      }
      setStaffSearching(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}&role=staff`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          const data = await res.json();
          // Filter to only teachers and admins
          setStaffResults(
            (data.users || []).filter(
              (u: StaffUser) => u.user_type === 'teacher' || u.user_type === 'admin'
            )
          );
        }
      } catch {
        // ignore
      } finally {
        setStaffSearching(false);
      }
    },
    [getToken]
  );

  async function handleAction(
    issueId: string,
    action: string,
    payload: Record<string, any> = {},
    successMessage?: string
  ) {
    setUpdating(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      if (res.ok) {
        // Refresh both list and detail
        fetchIssues();
        if (selectedIssue) {
          fetchIssueDetail(issueId);
        }
        if (successMessage) {
          setSnackbar({ open: true, message: successMessage });
        }
      }
    } catch (err) {
      console.error('Failed to update issue:', err);
    } finally {
      setUpdating(false);
    }
  }

  async function handleAssign() {
    if (!selectedIssue || !selectedStaff) return;
    await handleAction(selectedIssue.id, 'assign', { assigned_to: selectedStaff.id }, `Assigned to ${selectedStaff.name}`);
    setAssignDialogOpen(false);
    setSelectedStaff(null);
    setStaffSearch('');
  }

  async function handleDelegate() {
    if (!selectedIssue || !delegateTarget || !delegateReason.trim()) return;
    await handleAction(selectedIssue.id, 'delegate', {
      delegated_to: delegateTarget.id,
      reason: delegateReason.trim(),
    }, `Delegated to ${delegateTarget.name}`);
    setDelegateDialogOpen(false);
    setDelegateTarget(null);
    setDelegateReason('');
  }

  async function handleReturn() {
    if (!selectedIssue || !returnReason.trim()) return;
    await handleAction(selectedIssue.id, 'return', { reason: returnReason.trim() }, 'Issue returned to open pool');
    setReturnDialogOpen(false);
    setReturnReason('');
  }

  async function handleResolve() {
    if (!selectedIssue) return;
    await handleAction(selectedIssue.id, 'resolve', {
      resolution_note: resolutionNote.trim() || 'Issue resolved',
    }, 'Issue resolved. Awaiting student confirmation.');
    setResolutionNote('');
  }

  async function handlePriority(priority: FoundationIssuePriority) {
    if (!selectedIssue) return;
    await handleAction(selectedIssue.id, 'priority', { priority });
    setMenuAnchor(null);
  }

  async function handleComment() {
    if (!selectedIssue || !comment.trim()) return;
    setCommentSending(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${selectedIssue.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'comment', comment: comment.trim() }),
      });
      if (res.ok) {
        setComment('');
        fetchIssueDetail(selectedIssue.id);
      }
    } catch {
      // ignore
    } finally {
      setCommentSending(false);
    }
  }

  function openIssueDetail(issue: NexusFoundationIssueWithDetails) {
    setSelectedIssue(issue);
    setResolutionNote('');
    setComment('');
    fetchIssueDetail(issue.id);
  }

  const filteredIssues = issues.filter((issue) => {
    if (tab === 1) return issue.status === 'open';
    if (tab === 2) return issue.status === 'in_progress';
    if (tab === 3) return issue.status === 'resolved' || issue.status === 'awaiting_confirmation' || issue.status === 'closed';
    return true;
  });

  const statusColor = (status: string) => {
    if (status === 'open') return 'warning';
    if (status === 'in_progress') return 'info';
    if (status === 'resolved') return 'success';
    if (status === 'awaiting_confirmation') return 'info';
    if (status === 'closed') return 'default';
    return 'default';
  };

  const statusLabel = (status: string) => {
    if (status === 'in_progress') return 'In Progress';
    if (status === 'awaiting_confirmation') return 'Awaiting Confirmation';
    if (status === 'closed') return 'Closed';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const priorityIcon = (p: string) => {
    if (p === 'high') return <ArrowUpwardIcon sx={{ fontSize: 14, color: theme.palette.error.main }} />;
    if (p === 'low') return <ArrowDownwardIcon sx={{ fontSize: 14, color: theme.palette.text.secondary }} />;
    return <RemoveIcon sx={{ fontSize: 14, color: theme.palette.warning.main }} />;
  };

  const priorityLabel = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  const formatTimestamp = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const actionLabel = (action: string) => {
    const labels: Record<string, string> = {
      created: 'reported this issue',
      assigned: 'assigned this issue',
      accepted: 'accepted this issue',
      delegated: 'delegated this issue',
      returned: 'returned this issue',
      marked_in_progress: 'marked as in progress',
      resolved: 'resolved this issue',
      reopened: 'reopened this issue',
      comment: 'commented',
      confirmed: 'confirmed this issue is resolved',
      auto_closed: 'auto-closed (no response after 3 days)',
    };
    return labels[action] || action;
  };

  const openCount = issues.filter((i) => i.status === 'open').length;
  const inProgressCount = issues.filter((i) => i.status === 'in_progress').length;
  const resolvedCount = issues.filter((i) => i.status === 'resolved' || i.status === 'awaiting_confirmation' || i.status === 'closed').length;

  // ============================================
  // ACTIVITY LOG TIMELINE
  // ============================================
  const activityTimeline = (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <TimelineIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          ACTIVITY
        </Typography>
      </Box>
      {activityLoading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2].map((i) => (
            <Skeleton key={i} variant="rectangular" height={40} sx={{ borderRadius: 1 }} />
          ))}
        </Box>
      ) : activity.length === 0 ? (
        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
          No activity yet.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {activity.map((a, idx) => (
            <Box
              key={a.id}
              sx={{
                display: 'flex',
                gap: 1.5,
                position: 'relative',
                pb: idx < activity.length - 1 ? 2 : 0,
                '&::before':
                  idx < activity.length - 1
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 11,
                        top: 24,
                        bottom: 0,
                        width: 2,
                        bgcolor: alpha(theme.palette.divider, 0.5),
                      }
                    : undefined,
              }}
            >
              <Avatar
                sx={{
                  width: 24,
                  height: 24,
                  fontSize: '0.65rem',
                  bgcolor:
                    a.action === 'resolved'
                      ? theme.palette.success.main
                      : a.action === 'comment'
                        ? theme.palette.info.main
                        : theme.palette.grey[400],
                  flexShrink: 0,
                }}
              >
                {a.actor_name?.charAt(0) || '?'}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                  <strong>{a.actor_name || 'Unknown'}</strong>{' '}
                  {actionLabel(a.action)}
                  {a.target_user_name && (
                    <>
                      {' to '}
                      <strong>{a.target_user_name}</strong>
                    </>
                  )}
                </Typography>
                {a.reason && (
                  <Typography
                    variant="caption"
                    sx={{
                      display: 'block',
                      color: 'text.secondary',
                      fontStyle: 'italic',
                      mt: 0.25,
                    }}
                  >
                    &quot;{a.reason}&quot;
                  </Typography>
                )}
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', fontSize: '0.65rem' }}>
                  {formatTimestamp(a.created_at)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* Comment input */}
      {selectedIssue && selectedIssue.status !== 'closed' && (
        <Box sx={{ display: 'flex', gap: 1, mt: 2, alignItems: 'flex-end' }}>
          <TextField
            placeholder="Add a comment..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            size="small"
            fullWidth
            multiline
            maxRows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleComment();
              }
            }}
          />
          <IconButton
            size="small"
            color="primary"
            onClick={handleComment}
            disabled={commentSending || !comment.trim()}
            sx={{ minWidth: 36, minHeight: 36 }}
          >
            {commentSending ? <CircularProgress size={18} /> : <SendIcon fontSize="small" />}
          </IconButton>
        </Box>
      )}
    </Box>
  );

  // ============================================
  // DETAIL DRAWER CONTENT
  // ============================================
  const detailContent = selectedIssue && (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1.1rem', flex: 1, pr: 1 }}>
          {selectedIssue.title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          {selectedIssue.status !== 'resolved' && selectedIssue.status !== 'awaiting_confirmation' && selectedIssue.status !== 'closed' && (
            <IconButton
              size="small"
              onClick={(e) => setMenuAnchor(e.currentTarget)}
            >
              <MoreVertIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" onClick={() => setSelectedIssue(null)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Status + Priority row */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={statusLabel(selectedIssue.status)}
          color={statusColor(selectedIssue.status) as any}
          size="small"
        />
        <Chip
          icon={priorityIcon(selectedIssue.priority || 'medium')}
          label={priorityLabel(selectedIssue.priority || 'medium')}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />
      </Box>

      {/* Student info */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Avatar
          src={selectedIssue.student_avatar || undefined}
          sx={{ width: 36, height: 36, fontSize: '0.85rem' }}
        >
          {selectedIssue.student_name?.charAt(0) || 'S'}
        </Avatar>
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedIssue.student_name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Reported {formatDate(selectedIssue.created_at)}
          </Typography>
        </Box>
      </Box>

      {/* Assigned to */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          mb: 2,
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          border: `1px solid ${alpha(theme.palette.primary.main, 0.1)}`,
        }}
      >
        <AssignmentIndIcon sx={{ fontSize: '1.1rem', color: 'text.secondary' }} />
        {selectedIssue.assigned_to_name ? (
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.65rem' }}>
              ASSIGNED TO
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {selectedIssue.assigned_to_name}
            </Typography>
            {selectedIssue.assigned_by_name && (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>
                by {selectedIssue.assigned_by_name}
              </Typography>
            )}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1 }}>
            Unassigned
          </Typography>
        )}
        {selectedIssue.status !== 'resolved' && selectedIssue.status !== 'awaiting_confirmation' && selectedIssue.status !== 'closed' && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => {
              setAssignDialogOpen(true);
              setSelectedStaff(null);
              setStaffSearch('');
              setStaffResults([]);
            }}
            sx={{ textTransform: 'none', fontSize: '0.75rem', minHeight: 32 }}
          >
            {selectedIssue.assigned_to ? 'Reassign' : 'Assign'}
          </Button>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Chapter/Section */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>
          CHAPTER
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <MenuBookOutlinedIcon sx={{ fontSize: '0.9rem', color: 'text.secondary' }} />
          <Typography variant="body2">
            Ch {selectedIssue.chapter_number}: {selectedIssue.chapter_title}
          </Typography>
        </Box>
        {selectedIssue.section_title && (
          <Typography variant="caption" sx={{ color: 'text.secondary', ml: 2.5 }}>
            Section: {selectedIssue.section_title}
          </Typography>
        )}
      </Box>

      {/* Description */}
      {selectedIssue.description && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>
            DESCRIPTION
          </Typography>
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            {selectedIssue.description}
          </Typography>
        </Box>
      )}

      {/* Screenshots */}
      {selectedIssue?.screenshot_urls && selectedIssue.screenshot_urls.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'block', mb: 0.5 }}>
            Screenshots
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {selectedIssue.screenshot_urls.map((path: string, idx: number) => (
              <Box
                key={idx}
                component="img"
                src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/issue-screenshots/${path}`}
                alt={`Screenshot ${idx + 1}`}
                onClick={() => window.open(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/issue-screenshots/${path}`, '_blank')}
                sx={{
                  width: 100,
                  height: 100,
                  borderRadius: 1.5,
                  objectFit: 'cover',
                  border: `1px solid ${theme.palette.divider}`,
                  cursor: 'pointer',
                  '&:hover': { opacity: 0.8 },
                }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Page URL */}
      {selectedIssue?.page_url && (
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1 }}>
          Reported from: {selectedIssue.page_url}
        </Typography>
      )}

      <Divider sx={{ mb: 2, mt: 2 }} />

      {/* Actions */}
      {(selectedIssue.status === 'resolved' || selectedIssue.status === 'awaiting_confirmation' || selectedIssue.status === 'closed') ? (
        <Box
          sx={{
            p: 2,
            borderRadius: 2,
            bgcolor: alpha(theme.palette.success.main, 0.06),
            border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: '1rem', color: theme.palette.success.main }} />
            <Typography variant="body2" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
              {selectedIssue.status === 'closed'
                ? 'Closed'
                : selectedIssue.status === 'awaiting_confirmation'
                  ? 'Awaiting Student Confirmation'
                  : 'Resolved'}
              {selectedIssue.resolved_by_name ? ` by ${selectedIssue.resolved_by_name}` : ''}
            </Typography>
          </Box>
          {selectedIssue.resolution_note && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {selectedIssue.resolution_note}
            </Typography>
          )}
          {selectedIssue.resolved_at && (
            <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>
              {formatTimestamp(selectedIssue.resolved_at)}
            </Typography>
          )}
        </Box>
      ) : (
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 1 }}>
            ACTIONS
          </Typography>

          {/* Action buttons row */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            {selectedIssue.assigned_to && (
              <>
                <Button
                  size="small"
                  variant="outlined"
                  color="secondary"
                  startIcon={<SwapHorizIcon />}
                  onClick={() => {
                    setDelegateDialogOpen(true);
                    setDelegateTarget(null);
                    setDelegateReason('');
                    setStaffResults([]);
                    setStaffSearch('');
                  }}
                  disabled={updating}
                  sx={{ textTransform: 'none', fontSize: '0.8rem', minHeight: 40 }}
                >
                  Delegate
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  startIcon={<KeyboardReturnIcon />}
                  onClick={() => {
                    setReturnDialogOpen(true);
                    setReturnReason('');
                  }}
                  disabled={updating}
                  sx={{ textTransform: 'none', fontSize: '0.8rem', minHeight: 40 }}
                >
                  Return
                </Button>
              </>
            )}
          </Box>

          {/* Resolve section */}
          <TextField
            label="Resolution note"
            placeholder="Describe what was fixed or the response to the student..."
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 1.5 }}
          />

          <Button
            variant="contained"
            color="success"
            onClick={handleResolve}
            disabled={updating}
            fullWidth
            startIcon={<CheckCircleOutlineIcon />}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {updating ? 'Resolving...' : 'Resolve Issue'}
          </Button>
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      {/* Activity log */}
      {activityTimeline}
    </Box>
  );

  // ============================================
  // MORE ACTIONS MENU
  // ============================================
  const moreMenu = (
    <Menu
      anchorEl={menuAnchor}
      open={Boolean(menuAnchor)}
      onClose={() => setMenuAnchor(null)}
      slotProps={{ paper: { sx: { minWidth: 180 } } }}
    >
      <MenuItem disabled sx={{ fontSize: '0.75rem', opacity: '0.7 !important', py: 0.5 }}>
        Set Priority
      </MenuItem>
      {(['high', 'medium', 'low'] as FoundationIssuePriority[]).map((p) => (
        <MenuItem
          key={p}
          onClick={() => handlePriority(p)}
          selected={selectedIssue?.priority === p}
          sx={{ fontSize: '0.85rem' }}
        >
          <ListItemIcon sx={{ minWidth: 28 }}>{priorityIcon(p)}</ListItemIcon>
          <ListItemText>{priorityLabel(p)}</ListItemText>
        </MenuItem>
      ))}
    </Menu>
  );

  // ============================================
  // STAFF SEARCH AUTOCOMPLETE (reused in assign + delegate)
  // ============================================
  const staffAutocomplete = (
    value: StaffUser | null,
    onChange: (v: StaffUser | null) => void
  ) => (
    <Autocomplete
      options={staffResults}
      getOptionLabel={(o) => o.name || o.email || ''}
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={staffSearch}
      onInputChange={(_, v) => {
        setStaffSearch(v);
        searchStaff(v);
      }}
      loading={staffSearching}
      noOptionsText={staffSearch.length < 2 ? 'Type to search...' : 'No teachers/admins found'}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar src={option.avatar_url || undefined} sx={{ width: 28, height: 28, fontSize: '0.7rem' }}>
              {option.name?.charAt(0) || '?'}
            </Avatar>
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                {option.name}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {option.email} · {option.user_type}
              </Typography>
            </Box>
          </Box>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Search teacher or admin"
          placeholder="Start typing a name..."
          size="small"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {staffSearching ? <CircularProgress size={18} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="h6" component="h1" sx={{ fontWeight: 700 }}>
          Reported Issues
        </Typography>
        {openCount > 0 && (
          <Chip
            label={`${openCount} open`}
            color="warning"
            size="small"
            sx={{ fontWeight: 600 }}
          />
        )}
      </Box>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
        Assign, delegate, and resolve student-reported issues
      </Typography>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem', py: 0.5 },
        }}
      >
        <Tab label={`All (${issues.length})`} />
        <Tab label={`Open (${openCount})`} />
        <Tab label={`In Progress (${inProgressCount})`} />
        <Tab label={`Resolved (${resolvedCount})`} />
      </Tabs>

      {/* Issues List */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height={80} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : filteredIssues.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {tab === 0
              ? 'No issues reported by students yet.'
              : `No ${tab === 1 ? 'open' : tab === 2 ? 'in-progress' : 'resolved'} issues.`}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filteredIssues.map((issue) => (
            <Paper
              key={issue.id}
              variant="outlined"
              onClick={() => openIssueDetail(issue)}
              sx={{
                p: 2,
                cursor: 'pointer',
                borderRadius: 2,
                borderLeftWidth: 3,
                borderLeftColor:
                  issue.status === 'resolved'
                    ? theme.palette.success.main
                    : issue.status === 'in_progress'
                      ? theme.palette.info.main
                      : theme.palette.warning.main,
                '&:hover': { bgcolor: 'action.hover' },
                transition: 'background-color 150ms',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <Avatar
                  src={issue.student_avatar || undefined}
                  sx={{ width: 32, height: 32, fontSize: '0.75rem', mt: 0.25 }}
                >
                  {issue.student_name?.charAt(0) || 'S'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.7rem' }}>
                      {issue.ticket_number}
                    </Typography>
                    {issue.category && (
                      <Chip
                        label={CATEGORY_CONFIG[issue.category]?.label || issue.category}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.6rem',
                          bgcolor: alpha(CATEGORY_CONFIG[issue.category]?.color || '#757575', 0.08),
                          color: CATEGORY_CONFIG[issue.category]?.color || '#757575',
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                      />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }} noWrap>
                      {issue.title}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                      {issue.priority && issue.priority !== 'medium' && (
                        <Tooltip title={`${priorityLabel(issue.priority)} priority`}>
                          <Box sx={{ display: 'flex' }}>{priorityIcon(issue.priority)}</Box>
                        </Tooltip>
                      )}
                      <Chip
                        label={statusLabel(issue.status)}
                        size="small"
                        color={statusColor(issue.status) as any}
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                    </Box>
                  </Box>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                    {issue.student_name} · Ch {issue.chapter_number}
                    {issue.section_title && ` · ${issue.section_title}`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                      {formatDate(issue.created_at)}
                    </Typography>
                    {issue.assigned_to_name && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                        · <PersonOutlinedIcon sx={{ fontSize: '0.7rem', verticalAlign: 'middle', mr: 0.25 }} />
                        {issue.assigned_to_name}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}

      {/* Detail Drawer */}
      {isMobile ? (
        <SwipeableDrawer
          anchor="bottom"
          open={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          onOpen={() => {}}
          disableSwipeToOpen
          PaperProps={{
            sx: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90vh' },
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: alpha(theme.palette.text.primary, 0.2) }} />
          </Box>
          {detailContent}
        </SwipeableDrawer>
      ) : (
        <Drawer
          anchor="right"
          open={!!selectedIssue}
          onClose={() => setSelectedIssue(null)}
          PaperProps={{
            sx: { width: { md: 460, lg: 500 }, maxWidth: '100vw', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
          }}
        >
          {detailContent}
        </Drawer>
      )}

      {/* Assign Dialog */}
      <Dialog
        open={assignDialogOpen}
        onClose={() => setAssignDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          Assign Issue
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
            Search for a teacher or admin to assign this issue to.
          </Typography>
          {staffAutocomplete(selectedStaff, setSelectedStaff)}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAssignDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAssign}
            disabled={!selectedStaff || updating}
            sx={{ textTransform: 'none' }}
          >
            {updating ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delegate Dialog */}
      <Dialog
        open={delegateDialogOpen}
        onClose={() => setDelegateDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          Delegate Issue
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
            Transfer this issue to another teacher or admin with a reason.
          </Typography>
          {staffAutocomplete(delegateTarget, setDelegateTarget)}
          <TextField
            label="Reason for delegation"
            placeholder="Why are you delegating this issue?"
            value={delegateReason}
            onChange={(e) => setDelegateReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
            sx={{ mt: 2 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDelegateDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleDelegate}
            disabled={!delegateTarget || !delegateReason.trim() || updating}
            sx={{ textTransform: 'none' }}
          >
            {updating ? 'Delegating...' : 'Delegate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Return Dialog */}
      <Dialog
        open={returnDialogOpen}
        onClose={() => setReturnDialogOpen(false)}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 1 }}>
          Return Issue
        </DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
            Return this issue to the unassigned pool with a reason.
          </Typography>
          <TextField
            label="Reason for returning"
            placeholder="Why are you returning this issue?"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={2}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReturnDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReturn}
            disabled={!returnReason.trim() || updating}
            sx={{ textTransform: 'none' }}
          >
            {updating ? 'Returning...' : 'Return'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* More actions menu */}
      {moreMenu}

      {/* Success Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="success"
          onClose={() => setSnackbar({ open: false, message: '' })}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
