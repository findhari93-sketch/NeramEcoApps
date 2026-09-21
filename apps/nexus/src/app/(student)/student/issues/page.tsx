'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  alpha,
  useTheme,
  Tabs,
  Tab,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Snackbar,
  Alert,
  Collapse,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircleIcon from '@mui/icons-material/Circle';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import IssueThread from '@/components/issues/IssueThread';
import IssueReplyComposer from '@/components/issues/IssueReplyComposer';
import { ISSUE_PARAM, findIssueForRef } from '@/lib/issue-link';
import type {
  NexusFoundationIssueWithDetails,
  NexusFoundationIssueActivity,
  FoundationIssueCategory,
} from '@neram/database/types';

const CATEGORY_CONFIG: Record<FoundationIssueCategory, { label: string; icon: React.ReactNode; color: string }> = {
  bug: { label: 'Bug', icon: <BugReportOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#d32f2f' },
  content_issue: { label: 'Content', icon: <MenuBookOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', icon: <DesignServicesOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#1976d2' },
  feature_request: { label: 'Feature', icon: <LightbulbOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#7b1fa2' },
  class_schedule: { label: 'Class', icon: <EventOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#2e7d32' },
  result_dispute: { label: 'Result', icon: <FactCheckOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#ed6c02' },
  other: { label: 'Other', icon: <HelpOutlineOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#757575' },
};

export default function StudentIssuesPage() {
  const theme = useTheme();
  const { getToken, user } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  // Tabs: 0 = Open (priority), 1 = Awaiting, 2 = Closed, 3 = All
  const [tab, setTab] = useState(0);
  const tabTouchedRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);

  const [reopenIssueId, setReopenIssueId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // The conversation on each ticket, fetched the first time it is opened and
  // then kept. Held per ticket rather than for "the open one" so collapsing and
  // reopening a ticket does not re-ask the server for something unchanged.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [threads, setThreads] = useState<Record<string, NexusFoundationIssueActivity[]>>({});
  const [threadLoading, setThreadLoading] = useState<string | null>(null);

  useEffect(() => {
    fetchIssues({ initial: true });
  }, []);

  /**
   * ?issue=NXS-0125 opens that ticket's conversation.
   *
   * The address the Teams chat and the bell both point at. The tab moves to All
   * first, because the ticket a message is about is usually one waiting on the
   * student or already answered, and neither sits under Open. Runs once per
   * reference so the ticket can be collapsed again while the link is still in
   * the address bar.
   */
  const deepLinkedRef = useRef<string | null>(null);
  useEffect(() => {
    const ref = searchParams?.get(ISSUE_PARAM);
    if (!ref || issues.length === 0 || deepLinkedRef.current === ref) return;
    const match = findIssueForRef(issues, ref);
    if (!match) return;
    deepLinkedRef.current = ref;
    tabTouchedRef.current = true;
    setTab(3);
    void openThread(match.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, issues]);

  async function fetchIssues(options?: { initial?: boolean }) {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/issues', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list: NexusFoundationIssueWithDetails[] = data.issues || [];
        setIssues(list);
        // Open issues are what the student needs to act on, so Open is the
        // default tab. If nothing is open on first load, fall back to All so
        // they do not land on an empty page.
        if (options?.initial && !tabTouchedRef.current) {
          const hasOpen = list.some((i) => i.status === 'open' || i.status === 'in_progress');
          if (!hasOpen) setTab(3);
        }
      }
    } catch (err) {
      console.error('Failed to load issues:', err);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Open a ticket's conversation.
   *
   * ?seen=1 clears the unread mark on the same GET the page was going to make
   * anyway, so reading a reply costs no second request. The local row is
   * stamped too, so the dot goes out at once rather than at the next poll.
   */
  const openThread = useCallback(async (issueId: string) => {
    setExpandedId((current) => (current === issueId ? null : issueId));
    if (threads[issueId]) {
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, student_seen_at: new Date().toISOString() } : i)),
      );
      return;
    }
    setThreadLoading(issueId);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}?seen=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setThreads((prev) => ({ ...prev, [issueId]: data.activity || [] }));
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, student_seen_at: new Date().toISOString() } : i)),
      );
    } catch (err) {
      console.error('Failed to load the conversation:', err);
    } finally {
      setThreadLoading(null);
    }
  }, [getToken, threads]);

  /**
   * Reply on the ticket.
   *
   * Throws on failure so the composer keeps what was typed. A support box that
   * eats a message the student has just written is worse than one that refuses.
   */
  async function sendReply(issueId: string, text: string) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`/api/foundation/issues/${issueId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'comment', comment: text }),
    });
    if (!res.ok) {
      setSnackbar({ open: true, message: 'Could not send that. Please try again.', severity: 'error' });
      throw new Error('reply failed');
    }
    const data = await res.json();
    setThreads((prev) => ({ ...prev, [issueId]: [...(prev[issueId] || []), data.activity] }));
    setSnackbar({ open: true, message: 'Sent. Your teacher has been told.', severity: 'success' });
  }

  /** A staff reply written since this student last opened the ticket. */
  function hasUnreadReply(issue: NexusFoundationIssueWithDetails): boolean {
    if (!issue.last_reply_at) return false;
    if (!issue.student_seen_at) return true;
    return new Date(issue.last_reply_at) > new Date(issue.student_seen_at);
  }

  const filteredIssues = issues.filter((issue) => {
    if (tab === 0) return issue.status === 'open' || issue.status === 'in_progress';
    if (tab === 1) return issue.status === 'awaiting_confirmation';
    if (tab === 2) return issue.status === 'resolved' || issue.status === 'closed';
    return true; // tab === 3: All
  });

  const openCount = issues.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const awaitingCount = issues.filter((i) => i.status === 'awaiting_confirmation').length;
  const closedCount = issues.filter((i) => i.status === 'resolved' || i.status === 'closed').length;

  const statusColor = (status: string) => {
    if (status === 'open') return 'warning';
    if (status === 'in_progress') return 'info';
    if (status === 'awaiting_confirmation') return 'success';
    if (status === 'closed') return 'default';
    if (status === 'resolved') return 'success';
    return 'default';
  };

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      open: 'Open',
      in_progress: 'In Progress',
      resolved: 'Resolved',
      awaiting_confirmation: 'Awaiting Confirmation',
      closed: 'Closed',
    };
    return labels[status] || status;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const getDaysUntilAutoClose = (autoCloseAt: string | null) => {
    if (!autoCloseAt) return null;
    const diff = new Date(autoCloseAt).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
  };

  const handleConfirm = async (issueId: string) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Ticket closed. Thank you for confirming!', severity: 'success' });
        fetchIssues();
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to confirm. Please try again.', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenIssueId || !reopenReason.trim()) return;
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${reopenIssueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reopen', reason: reopenReason.trim() }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Ticket reopened. Staff will review again.', severity: 'success' });
        setReopenIssueId(null);
        setReopenReason('');
        fetchIssues();
      } else {
        throw new Error('Failed');
      }
    } catch {
      setSnackbar({ open: true, message: 'Failed to reopen. Please try again.', severity: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const getScreenshotUrl = (path: string) => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return `${supabaseUrl}/storage/v1/object/public/issue-screenshots/${path}`;
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
        <Box>
          <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
            My Issues
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
            Track and manage your reported issues
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', minHeight: 36, mt: 0.5 }}
        >
          Create Ticket
        </Button>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          tabTouchedRef.current = true;
          setTab(v);
        }}
        variant="scrollable"
        scrollButtons={false}
        sx={{
          mb: 2, mt: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem', py: 0.5 },
        }}
      >
        <Tab label={`Open (${openCount})`} />
        <Tab label={`Awaiting (${awaitingCount})`} />
        <Tab label={`Closed (${closedCount})`} />
        <Tab label={`All (${issues.length})`} />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={120} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : filteredIssues.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {issues.length === 0
              ? 'No issues reported yet. Use "Create Ticket" to report your first issue.'
              : tab === 0
                ? 'No open issues right now. Everything you reported has been handled.'
                : tab === 1
                  ? 'Nothing is waiting for your confirmation.'
                  : 'No issues in this category.'}
          </Typography>
          {issues.length > 0 && tab !== 3 && (
            <Button
              size="small"
              onClick={() => {
                tabTouchedRef.current = true;
                setTab(3);
              }}
              sx={{ textTransform: 'none', mt: 1, minHeight: 36 }}
            >
              View all {issues.length} issue{issues.length !== 1 ? 's' : ''}
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredIssues.map((issue) => {
            const catConfig = CATEGORY_CONFIG[issue.category as FoundationIssueCategory] || CATEGORY_CONFIG.other;
            const daysLeft = getDaysUntilAutoClose(issue.auto_close_at);

            return (
              <Paper
                key={issue.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderLeftWidth: 3,
                  borderLeftColor: catConfig.color,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
                  <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      {/* A reply this student has not opened. Shape as well as
                          colour, and it carries a label for a screen reader. */}
                      {hasUnreadReply(issue) && (
                        <CircleIcon
                          aria-label="New reply"
                          sx={{ fontSize: '0.55rem', color: 'primary.main', flexShrink: 0 }}
                        />
                      )}
                      <Typography variant="caption" sx={{ color: 'text.disabled', fontWeight: 600, fontSize: '0.7rem' }}>
                        {issue.ticket_number}
                      </Typography>
                      <Chip
                        icon={catConfig.icon as React.ReactElement}
                        label={catConfig.label}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: '0.65rem',
                          bgcolor: alpha(catConfig.color, 0.08),
                          color: catConfig.color,
                          '& .MuiChip-icon': { fontSize: '0.7rem', color: catConfig.color },
                          '& .MuiChip-label': { px: 0.5 },
                        }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                      {issue.title}
                    </Typography>
                  </Box>
                  <Chip
                    label={statusLabel(issue.status)}
                    size="small"
                    color={statusColor(issue.status) as any}
                    sx={{ fontSize: '0.7rem', height: 22 }}
                  />
                </Box>

                {issue.chapter_title && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <MenuBookOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      Ch {issue.chapter_number}: {issue.chapter_title}
                      {issue.section_title && ` \u00b7 ${issue.section_title}`}
                    </Typography>
                  </Box>
                )}

                {issue.description && (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', display: 'block', mb: 0.75, lineHeight: 1.4 }}
                  >
                    {issue.description}
                  </Typography>
                )}

                {issue.screenshot_urls && issue.screenshot_urls.length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                    <PhotoOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      {issue.screenshot_urls.map((url, idx) => (
                        <Box
                          key={idx}
                          component="img"
                          src={getScreenshotUrl(url)}
                          alt={`Screenshot ${idx + 1}`}
                          onClick={() => setPreviewImage(getScreenshotUrl(url))}
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: 1,
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

                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                  Reported {formatDate(issue.created_at)}
                </Typography>

                {(issue.status === 'awaiting_confirmation' || issue.status === 'resolved' || issue.status === 'closed') && issue.resolution_note && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.success.main, 0.06),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                      <CheckCircleOutlineIcon sx={{ fontSize: '0.85rem', color: theme.palette.success.main }} />
                      <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.success.main }}>
                        Resolved{issue.resolved_by_name ? ` by ${issue.resolved_by_name}` : ''}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      {issue.resolution_note}
                    </Typography>
                  </Box>
                )}

                {issue.status === 'awaiting_confirmation' && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.info.main, 0.06),
                      border: `1px solid ${alpha(theme.palette.info.main, 0.15)}`,
                    }}
                  >
                    <Typography variant="caption" sx={{ fontWeight: 600, color: theme.palette.info.main, display: 'block', mb: 1 }}>
                      Did this fix work for you?
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => handleConfirm(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 44, px: 2, fontSize: '0.85rem' }}
                      >
                        Yes, it works
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={() => setReopenIssueId(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 44, px: 2, fontSize: '0.85rem' }}
                      >
                        Reopen
                      </Button>
                      {daysLeft !== null && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                          Auto-closes in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}

                {issue.status === 'in_progress' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                    <HourglassEmptyIcon sx={{ fontSize: '0.8rem', color: theme.palette.info.main }} />
                    <Typography variant="caption" sx={{ color: theme.palette.info.main }}>
                      Being reviewed by your teacher
                    </Typography>
                  </Box>
                )}

                {/*
                  The conversation.
                  Collapsed until asked for, because most tickets have nothing
                  said on them, and an empty thread on every card would bury the
                  ones that do. Opening it clears the unread dot.
                */}
                <Box sx={{ mt: 1.25, pt: 1.25, borderTop: `1px solid ${theme.palette.divider}` }}>
                  <Button
                    onClick={() => void openThread(issue.id)}
                    aria-expanded={expandedId === issue.id}
                    startIcon={<ChatBubbleOutlineIcon sx={{ fontSize: '1rem' }} />}
                    endIcon={
                      <ExpandMoreIcon
                        sx={{
                          transform: expandedId === issue.id ? 'rotate(180deg)' : 'none',
                          transition: 'transform 200ms',
                          '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                        }}
                      />
                    }
                    sx={{
                      textTransform: 'none',
                      minHeight: 44,
                      px: 1,
                      color: 'text.secondary',
                      fontSize: '0.8rem',
                      justifyContent: 'flex-start',
                    }}
                  >
                    {expandedId === issue.id ? 'Hide conversation' : 'Conversation'}
                  </Button>

                  <Collapse in={expandedId === issue.id} unmountOnExit>
                    <Box sx={{ pt: 1 }}>
                      <IssueThread
                        activity={threads[issue.id] || []}
                        viewerId={user?.id || null}
                        loading={threadLoading === issue.id}
                        emptyText="Nothing said yet. Ask here if something is unclear."
                      />
                      {issue.status !== 'closed' && (
                        <IssueReplyComposer
                          onSend={(text) => sendReply(issue.id, text)}
                          placeholder="Reply to your teacher..."
                          helperText="Your teacher gets this on Nexus. Please keep the conversation here, not on Teams."
                        />
                      )}
                    </Box>
                  </Collapse>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}

      <ReportIssueDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        getToken={getToken}
        pageUrl="/student/issues"
        onSuccess={fetchIssues}
      />

      <Dialog open={!!reopenIssueId} onClose={() => setReopenIssueId(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Reopen Issue
          <IconButton onClick={() => setReopenIssueId(null)} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Please describe why the issue is not resolved:
          </Typography>
          <TextField
            label="Reason"
            placeholder="e.g. The video still doesn't play after the fix..."
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            size="small"
            fullWidth
            multiline
            rows={3}
            required
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setReopenIssueId(null)} sx={{ textTransform: 'none' }}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={handleReopen}
            disabled={actionLoading || !reopenReason.trim()}
            sx={{ textTransform: 'none' }}
          >
            {actionLoading ? 'Reopening...' : 'Reopen Ticket'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!previewImage} onClose={() => setPreviewImage(null)} maxWidth="md">
        <DialogContent sx={{ p: 0 }}>
          {previewImage && (
            <Box
              component="img"
              src={previewImage}
              alt="Screenshot preview"
              sx={{ width: '100%', display: 'block' }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
