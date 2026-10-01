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
  DialogContent,
  TextField,
  Snackbar,
  Alert,
  Collapse,
} from '@neram/ui';
import AddIcon from '@mui/icons-material/Add';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import ReplayIcon from '@mui/icons-material/Replay';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PhotoOutlinedIcon from '@mui/icons-material/PhotoOutlined';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import DesignServicesOutlinedIcon from '@mui/icons-material/DesignServicesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import HelpOutlineOutlinedIcon from '@mui/icons-material/HelpOutlineOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CircleIcon from '@mui/icons-material/Circle';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import IssueThread from '@/components/issues/IssueThread';
import IssueReplyComposer from '@/components/issues/IssueReplyComposer';
import { ISSUE_PARAM, findIssueForRef } from '@/lib/issue-link';
import IssueStatusTracker from '@/components/issues/IssueStatusTracker';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import ScreenshotUploader from '@/components/issues/ScreenshotUploader';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { collectDeviceInfo } from '@/lib/device-collector';
import { getRecentErrors } from '@/lib/error-buffer';
import {
  statusMeta,
  studentQueueOf,
  canStudentReopen,
  closesInText,
  OUTCOME_LABEL,
  STUDENT_REOPEN_DAYS,
  type StudentQueue,
} from '@/lib/issue-status';
import type {
  NexusFoundationIssueWithDetails,
  NexusFoundationIssueActivity,
  FoundationIssueCategory,
  FoundationIssueResolutionCode,
} from '@neram/database/types';

/**
 * The student's filters. "Needs you" first and by default when it has anything
 * in it: a ticket waiting on the student's answer is the only kind they can move.
 */
type StudentView = StudentQueue | 'all';
const VIEW_ORDER: StudentView[] = ['needs_you', 'active', 'closed', 'all'];

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
  const { getToken, getChatTokenSilent, user } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<StudentView>('active');
  const tabTouchedRef = useRef(false);
  const [createOpen, setCreateOpen] = useState(false);
  // "Report it again" opens the same dialog, pre-filled to name the old ticket.
  const [followUpOf, setFollowUpOf] = useState<NexusFoundationIssueWithDetails | null>(null);

  const [reopenIssueId, setReopenIssueId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenShots, setReopenShots] = useState<string[]>([]);
  // Screenshots belong to the ticket they were added for; a sheet opened on
  // another ticket starts empty.
  useEffect(() => {
    setReopenShots([]);
  }, [reopenIssueId]);
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
   * The address the Teams chat and the bell both point at. The view moves to All
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
    setView('all');
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
        // Land on what needs the student first, then on what is still in
        // play, and only then on everything, so nobody opens an empty list.
        if (options?.initial && !tabTouchedRef.current) {
          const has = (q: StudentQueue) => list.some((i) => studentQueueOf(i.status) === q);
          setView(has('needs_you') ? 'needs_you' : has('active') ? 'active' : 'all');
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
   * Headers for a move that tells staff something. The chat token, when this
   * device can get one silently, lets the server send it as a 1:1 Teams chat
   * from the student to the teacher on the ticket, so it is seen in Teams and
   * not only on a page the teacher may not open. Without one the teacher still
   * gets a Teams alert and the bell.
   */
  async function staffBoundHeaders(token: string): Promise<Record<string, string>> {
    const chat = await getChatTokenSilent().catch(() => null);
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(chat ? { 'X-Teams-Chat-Token': chat } : {}),
    };
  }

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
      headers: await staffBoundHeaders(token),
      body: JSON.stringify({ action: 'comment', comment: text }),
    });
    if (!res.ok) {
      setSnackbar({ open: true, message: 'Could not send that. Please try again.', severity: 'error' });
      throw new Error('reply failed');
    }
    const data = await res.json();
    setThreads((prev) => ({ ...prev, [issueId]: [...(prev[issueId] || []), data.activity] }));
    // Answering a question hands the ticket back to staff on the server; show
    // the new status straight away rather than at the next visit.
    const wasWaiting = issues.find((i) => i.id === issueId)?.status === 'waiting_on_student';
    if (wasWaiting) fetchIssues();
    setSnackbar({
      open: true,
      message: wasWaiting ? 'Sent. Your ticket is back with your teacher.' : 'Sent. Your teacher has been told.',
      severity: 'success',
    });
  }

  /** A staff reply written since this student last opened the ticket. */
  function hasUnreadReply(issue: NexusFoundationIssueWithDetails): boolean {
    if (!issue.last_reply_at) return false;
    if (!issue.student_seen_at) return true;
    return new Date(issue.last_reply_at) > new Date(issue.student_seen_at);
  }

  const filteredIssues = issues.filter((issue) => view === 'all' || studentQueueOf(issue.status) === view);

  const viewCounts = issues.reduce<Record<StudentView, number>>(
    (acc, issue) => {
      acc[studentQueueOf(issue.status)] += 1;
      acc.all += 1;
      return acc;
    },
    { needs_you: 0, active: 0, closed: 0, all: 0 },
  );

  const VIEW_LABEL: Record<StudentView, string> = {
    needs_you: 'Needs you',
    active: 'Active',
    closed: 'Closed',
    all: 'All',
  };

  // One vocabulary for both issues pages: lib/issue-status.ts.
  const statusColor = (status: string) => statusMeta(status).color;
  const statusLabel = (status: string) => statusMeta(status).studentLabel;

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

  const handleConfirm = async (issueId: string) => {
    setActionLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        method: 'PATCH',
        headers: await staffBoundHeaders(token),
        body: JSON.stringify({ action: 'confirm' }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Thanks for confirming. The ticket is closed.', severity: 'success' });
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
      // The same technical picture a new report carries, taken now: the fix has
      // happened since the first report, so its logs no longer describe the
      // problem. Staff-only on the server; never shown back to the student.
      let deviceInfo: ReturnType<typeof collectDeviceInfo> | undefined;
      try {
        deviceInfo = collectDeviceInfo();
      } catch {
        deviceInfo = undefined;
      }
      const consoleLogs = getRecentErrors();
      const res = await fetch(`/api/foundation/issues/${reopenIssueId}`, {
        method: 'PATCH',
        headers: await staffBoundHeaders(token),
        body: JSON.stringify({
          action: 'reopen',
          reason: reopenReason.trim(),
          device_info: deviceInfo,
          console_logs: consoleLogs.length > 0 ? consoleLogs : undefined,
          screenshot_urls: reopenShots.length > 0 ? reopenShots : undefined,
          page_url: window.location.pathname,
        }),
      });
      if (res.ok) {
        setSnackbar({ open: true, message: 'Reopened. Your teacher has been told.', severity: 'success' });
        setReopenIssueId(null);
        setReopenReason('');
        setReopenShots([]);
        fetchIssues();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed');
      }
    } catch (err) {
      const message = err instanceof Error && err.message !== 'Failed' ? err.message : 'Could not reopen it. Please try again.';
      setSnackbar({ open: true, message, severity: 'error' });
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
            See where each problem you reported is, and answer your teacher here
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ textTransform: 'none', minHeight: 44, mt: 0.5, flexShrink: 0 }}
        >
          Create Ticket
        </Button>
      </Box>

      <Tabs
        value={view}
        onChange={(_, v: StudentView) => {
          tabTouchedRef.current = true;
          setView(v);
        }}
        variant="scrollable"
        scrollButtons={false}
        aria-label="Filter your tickets"
        sx={{
          mb: 2, mt: 1.5,
          minHeight: 48,
          // Compact enough that all four fit at 375px: "Needs you" is the one
          // that matters and must never be scrolled out of sight.
          '& .MuiTab-root': { minHeight: 48, minWidth: 0, px: 1.25, textTransform: 'none', fontSize: '0.875rem', py: 0.5 },
        }}
      >
        {VIEW_ORDER.map((v) => (
          <Tab
            key={v}
            value={v}
            label={
              v === 'needs_you' && viewCounts.needs_you > 0 ? (
                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                  {VIEW_LABEL[v]}
                  <Box
                    component="span"
                    sx={{
                      minWidth: 20,
                      height: 20,
                      px: 0.75,
                      borderRadius: 10,
                      bgcolor: 'warning.main',
                      color: 'warning.contrastText',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {viewCounts.needs_you}
                  </Box>
                </Box>
              ) : (
                `${VIEW_LABEL[v]} (${viewCounts[v]})`
              )
            }
          />
        ))}
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
              : view === 'needs_you'
                ? 'Nothing is waiting on you. Your teachers will tell you when something is.'
                : view === 'active'
                  ? 'Nothing is being worked on right now.'
                  : 'No tickets here.'}
          </Typography>
          {issues.length > 0 && view !== 'all' && (
            <Button
              size="small"
              onClick={() => {
                tabTouchedRef.current = true;
                setView('all');
              }}
              sx={{ textTransform: 'none', mt: 1, minHeight: 44 }}
            >
              View all {issues.length} issue{issues.length !== 1 ? 's' : ''}
            </Button>
          )}
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredIssues.map((issue) => {
            const catConfig = CATEGORY_CONFIG[issue.category as FoundationIssueCategory] || CATEGORY_CONFIG.other;
            const closes = closesInText(issue.auto_close_at);
            const teacher = issue.assigned_to_name || issue.resolved_by_name || 'Your teacher';
            const outcome = issue.resolution_code
              ? OUTCOME_LABEL[issue.resolution_code as FoundationIssueResolutionCode]
              : null;
            const waiting = issue.status === 'waiting_on_student';

            return (
              <Paper
                key={issue.id}
                variant="outlined"
                sx={{
                  p: 2,
                  borderRadius: 2,
                  borderLeftWidth: 3,
                  borderLeftColor: waiting ? theme.palette.warning.main : catConfig.color,
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

                {/* Where it is, then what is happening in one plain sentence, then
                    the one thing the student can do about it, if anything. */}
                <Box sx={{ mt: 1.25 }}>
                  <IssueStatusTracker status={issue.status} role="student" compact />
                  <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', fontWeight: 600 }}>
                    {statusMeta(issue.status).studentLabel}
                  </Typography>
                </Box>

                {issue.status === 'open' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
                    <InboxOutlinedIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} aria-hidden />
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                      We have got it. A teacher will pick this up soon.
                    </Typography>
                  </Box>
                )}

                {issue.status === 'in_progress' && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
                    <HourglassEmptyIcon sx={{ fontSize: '1rem', color: theme.palette.info.main }} aria-hidden />
                    <Typography variant="body2" sx={{ color: 'info.dark' }}>
                      {teacher} is working on this.
                    </Typography>
                  </Box>
                )}

                {waiting && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.warning.main, 0.08),
                      border: `1px solid ${alpha(theme.palette.warning.main, 0.35)}`,
                    }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'warning.dark', mb: 0.25 }}>
                      {teacher} needs more from you
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
                      Open the conversation to see the question and reply. Your reply sends the ticket back to
                      your teacher{closes ? `. It ${closes} if there is no reply` : ''}.
                    </Typography>
                    <Button
                      variant="contained"
                      color="warning"
                      startIcon={<ReplyIcon />}
                      onClick={() => {
                        if (expandedId !== issue.id) void openThread(issue.id);
                        // Straight to the box they came to type in, once it has rendered.
                        window.setTimeout(() => {
                          const box = document.querySelector<HTMLTextAreaElement>(`#issue-thread-${issue.id} textarea`);
                          box?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                          box?.focus({ preventScroll: true });
                        }, 450);
                      }}
                      sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600 }}
                    >
                      Reply
                    </Button>
                  </Box>
                )}

                {(issue.status === 'awaiting_confirmation' || issue.status === 'resolved' || issue.status === 'closed') &&
                  (issue.resolution_note || outcome) && (
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      borderRadius: 1.5,
                      bgcolor: alpha(theme.palette.success.main, 0.06),
                      border: `1px solid ${alpha(theme.palette.success.main, 0.15)}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, flexWrap: 'wrap' }}>
                      <CheckCircleOutlineIcon sx={{ fontSize: '1rem', color: theme.palette.success.main }} aria-hidden />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'success.dark' }}>
                        {outcome || 'Resolved'}
                        {issue.resolved_by_name ? ` by ${issue.resolved_by_name}` : ''}
                      </Typography>
                    </Box>
                    {issue.resolution_note && (
                      <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
                        {issue.resolution_note}
                      </Typography>
                    )}
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
                    <Typography variant="body2" sx={{ fontWeight: 700, color: 'info.dark', mb: 1 }}>
                      Is it working for you now?
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        color="success"
                        onClick={() => handleConfirm(issue.id)}
                        disabled={actionLoading}
                        startIcon={<CheckCircleOutlineIcon />}
                        sx={{ textTransform: 'none', minHeight: 44, px: 2 }}
                      >
                        Yes, it is fixed
                      </Button>
                      <Button
                        variant="outlined"
                        color="warning"
                        onClick={() => setReopenIssueId(issue.id)}
                        disabled={actionLoading}
                        startIcon={<ReplayIcon />}
                        sx={{ textTransform: 'none', minHeight: 44, px: 2 }}
                      >
                        Still happening
                      </Button>
                    </Box>
                    {closes && (
                      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 1 }}>
                        If you do not answer, the ticket {closes}.
                      </Typography>
                    )}
                  </Box>
                )}

                {(issue.status === 'closed' || issue.status === 'resolved') && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
                    {canStudentReopen(issue) ? (
                      <Button
                        size="small"
                        startIcon={<ReplayIcon />}
                        onClick={() => setReopenIssueId(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 44 }}
                      >
                        Still a problem? Reopen
                      </Button>
                    ) : (
                      <Button
                        size="small"
                        startIcon={<AddIcon />}
                        onClick={() => setFollowUpOf(issue)}
                        sx={{ textTransform: 'none', minHeight: 44 }}
                      >
                        Still a problem? Report it again
                      </Button>
                    )}
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
                    <Box id={`issue-thread-${issue.id}`} sx={{ pt: 1 }}>
                      <IssueThread
                        activity={threads[issue.id] || []}
                        viewerId={user?.id || null}
                        loading={threadLoading === issue.id}
                        emptyText="Nothing said yet. Ask here if something is unclear."
                      />
                      {/* Open on a closed ticket too, for the reopen window: a
                          student who confirmed a fix could not answer the
                          teacher's follow-up (NXS-0126). A message does not
                          reopen anything; "Still a problem? Reopen" does. */}
                      {(issue.status !== 'closed' || canStudentReopen(issue)) && (
                        <IssueReplyComposer
                          onSend={(text) => sendReply(issue.id, text)}
                          placeholder="Reply to your teacher..."
                          helperText={
                            issue.status === 'closed'
                              ? 'This ticket is closed. Your teacher still gets your message. If the problem is back, use Reopen instead.'
                              : 'Your teacher gets this on Nexus and in Teams.'
                          }
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

      {/* "Report it again": a fresh ticket that names the old one, for a
          problem that came back after the reopen window closed. Keyed so each
          follow-up starts from its own prefill. */}
      {followUpOf && (
        <ReportIssueDialog
          key={followUpOf.id}
          open
          onClose={() => setFollowUpOf(null)}
          getToken={getToken}
          pageUrl="/student/issues"
          defaultCategory={followUpOf.category as FoundationIssueCategory}
          prefill={{
            title: `Follow-up to ${followUpOf.ticket_number}: ${followUpOf.title}`.slice(0, 120),
            category: followUpOf.category as FoundationIssueCategory,
          }}
          onSuccess={() => {
            setFollowUpOf(null);
            fetchIssues();
          }}
        />
      )}

      <ResponsiveSheet
        open={!!reopenIssueId}
        onClose={() => setReopenIssueId(null)}
        title="Still happening?"
        description={`Try it once more first, then tell your teacher what is still wrong. The ticket goes back to them. You can reopen a closed ticket for ${STUDENT_REOPEN_DAYS} days.`}
        disableClose={actionLoading}
        actions={
          <>
            <Button onClick={() => setReopenIssueId(null)} disabled={actionLoading} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              color="warning"
              onClick={handleReopen}
              disabled={actionLoading || !reopenReason.trim()}
              startIcon={<ReplayIcon />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {actionLoading ? 'Reopening...' : 'Reopen ticket'}
            </Button>
          </>
        }
      >
        <TextField
          label="What is still wrong?"
          placeholder="e.g. The video still does not play after the fix"
          value={reopenReason}
          onChange={(e) => setReopenReason(e.target.value)}
          fullWidth
          multiline
          minRows={3}
          required
          autoFocus
          inputProps={{ style: { fontSize: 16 } }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600, mt: 2, mb: 1 }}>
          Add a screenshot (optional)
        </Typography>
        <ScreenshotUploader
          screenshots={reopenShots}
          onScreenshotsChange={setReopenShots}
          getToken={getToken}
          maxCount={3}
          disabled={actionLoading}
        />
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start', mt: 1.5, color: 'text.secondary' }}>
          <InfoOutlinedIcon sx={{ fontSize: '1.1rem', mt: '2px' }} aria-hidden />
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            Details from this device (browser, screen and any recent errors) are attached automatically, so your teacher can see what went wrong.
          </Typography>
        </Box>
      </ResponsiveSheet>

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
