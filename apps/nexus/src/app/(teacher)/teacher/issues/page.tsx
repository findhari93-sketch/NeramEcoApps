'use client';

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CommentOutlinedIcon from '@mui/icons-material/CommentOutlined';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import RemoveIcon from '@mui/icons-material/Remove';
import TimelineIcon from '@mui/icons-material/Timeline';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CircleIcon from '@mui/icons-material/Circle';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import ReplayIcon from '@mui/icons-material/Replay';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import QuestionAnswerOutlinedIcon from '@mui/icons-material/QuestionAnswerOutlined';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ViewAsStudentButton from '@/components/ViewAsStudentButton';
import { buildIssueMarkdown, reopenSnapshotsOf, screenshotPublicUrls } from '@/lib/issue-report-bundle';
import { renderFactsForTeacher, type ResultFacts } from '@/lib/exam-result-explain';
import { copyScreenshotsToClipboard } from '@/lib/screenshot-clipboard';
import type {
  NexusFoundationIssueWithDetails,
  FoundationIssueStatus,
  FoundationIssuePriority,
  NexusFoundationIssueActivity,
  FoundationIssueLogEntry,
} from '@neram/database/types';
import StudentAvatar from '@/components/students/StudentAvatar';
import IssueThread from '@/components/issues/IssueThread';
import IssueReplyComposer from '@/components/issues/IssueReplyComposer';
import StudentTestCardPanel from '@/components/issues/StudentTestCardPanel';
import { ISSUE_PARAM, findIssueForRef } from '@/lib/issue-link';
import IssueStatusTracker from '@/components/issues/IssueStatusTracker';
import IssueStepSheet, { type IssueStepMode } from '@/components/issues/IssueStepSheet';
import ResponsiveSheet from '@/components/study-materials/recordings/ResponsiveSheet';
import {
  statusMeta,
  staffQueueOf,
  closesInText,
  daysSince,
  OUTCOME_LABEL,
  STALE_NEW_DAYS,
  type StaffQueue,
} from '@/lib/issue-status';
import type { FoundationIssueResolutionCode } from '@neram/database/types';

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  bug: { label: 'Bug', color: '#d32f2f' },
  content_issue: { label: 'Content', color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', color: '#1976d2' },
  feature_request: { label: 'Feature', color: '#7b1fa2' },
  class_schedule: { label: 'Class', color: '#2e7d32' },
  result_dispute: { label: 'Result', color: '#ed6c02' },
  other: { label: 'Other', color: '#757575' },
};

/**
 * The queue filters, as stat cards. One level, no tabs inside tabs: pressing a
 * count shows that list, and the choice lives in ?view= so a refresh or a shared
 * link keeps it.
 */
type QueueView = StaffQueue | 'all';

const QUEUE_VIEWS: { key: QueueView; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'waiting', label: 'Waiting on student' },
  { key: 'to_confirm', label: 'To confirm' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

const isQueueView = (v: string | null | undefined): v is QueueView =>
  QUEUE_VIEWS.some((q) => q.key === v);

/** "Anushka" from "Anushka Anand", for copy that talks about a person. */
const firstNameOf = (name: string | null | undefined) =>
  (name || 'the student').trim().split(/\s+/)[0];

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
  // getTeacherToken as well as getToken: a reply has to leave here as a Teams
  // chat from this person's own account, and only the teacher token carries
  // ChatMessage.Send. getToken() would reach Graph, come back 403, and the
  // student would silently get a bell and nothing else.
  const { getToken, getTeacherToken, user } = useNexusAuthContext();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const initialView = searchParams?.get('view');
  const [view, setViewState] = useState<QueueView>(isQueueView(initialView) ? initialView : 'new');
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

  // Mark resolved / Close now / Ask student, and the overflow menu beside them
  const [stepSheet, setStepSheet] = useState<IssueStepMode | null>(null);
  const [stepMenuAnchor, setStepMenuAnchor] = useState<null | HTMLElement>(null);

  // Staff reopen
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Ask the reporter to check it again
  const [recheckOpen, setRecheckOpen] = useState(false);
  const [recheckNote, setRecheckNote] = useState('');
  const [recheckSending, setRecheckSending] = useState(false);

  // More actions menu
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  // Success feedback
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity?: 'success' | 'error' }>({ open: false, message: '' });

  // Screenshot lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Delete confirm
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Description copy
  const [descCopied, setDescCopied] = useState(false);

  // Hand-off to Claude: one press for all the text, one press for all the
  // pictures. Two pastes, never more.
  const [reportCopied, setReportCopied] = useState(false);
  const [imagesCopied, setImagesCopied] = useState(false);
  const [copyingImages, setCopyingImages] = useState(false);

  function handleCopyDescription(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setDescCopied(true);
      setTimeout(() => setDescCopied(false), 2000);
    });
  }

  async function handleCopyReport() {
    if (!selectedIssue) return;
    try {
      await navigator.clipboard.writeText(buildIssueMarkdown(selectedIssue));
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 2000);
    } catch {
      setSnackbar({ open: true, message: 'Could not reach the clipboard' });
    }
  }

  // Not async: the clipboard write has to start inside the click handler or
  // Safari rejects it as untrusted. copyScreenshotsToClipboard handles the wait.
  function handleCopyImages() {
    if (!selectedIssue) return;
    const urls = screenshotPublicUrls(selectedIssue);
    if (urls.length === 0) return;

    setCopyingImages(true);
    copyScreenshotsToClipboard(urls, `${selectedIssue.ticket_number}-screenshots.png`)
      .then((result) => {
        if (result === 'download') {
          setSnackbar({ open: true, message: 'Saved as a file. Drag it into Claude.' });
          return;
        }
        setImagesCopied(true);
        setTimeout(() => setImagesCopied(false), 2000);
      })
      .catch(() => setSnackbar({ open: true, message: 'Could not copy the screenshots' }))
      .finally(() => setCopyingImages(false));
  }

  async function handleDeleteIssue() {
    if (!selectedIssue) return;
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/foundation/issues/${selectedIssue.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to delete');
      setIssues((prev) => prev.filter((i) => i.id !== selectedIssue.id));
      setSelectedIssue(null);
      setDeleteDialogOpen(false);
      setSnackbar({ open: true, message: 'Issue deleted' });
    } catch {
      setSnackbar({ open: true, message: 'Failed to delete issue' });
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    fetchIssues();
  }, []);

  /**
   * ?issue=NXS-0125 opens that ticket.
   *
   * The address a Teams message and a bell entry both point at, built by
   * issue-link.ts. Runs once per reference: without the ref the drawer would
   * reopen every time the list refetched, which makes the ticket impossible to
   * close while the link is still in the address bar.
   *
   * The view moves to All first, because a link is just as likely to name a
   * closed or awaiting ticket as an open one, and a link that lands on an empty
   * list is worse than no link.
   */
  const deepLinkedRef = useRef<string | null>(null);
  useEffect(() => {
    const ref = searchParams?.get(ISSUE_PARAM);
    if (!ref || issues.length === 0 || deepLinkedRef.current === ref) return;
    const match = findIssueForRef(issues, ref);
    if (!match) return;
    deepLinkedRef.current = ref;
    setView('all');
    openIssueDetail(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, issues]);

  /** A reply written after the last time anyone on the team opened this ticket. */
  function hasUnreadReply(issue: NexusFoundationIssueWithDetails): boolean {
    if (!issue.last_reply_at) return false;
    if (!issue.staff_seen_at) return true;
    return new Date(issue.last_reply_at) > new Date(issue.staff_seen_at);
  }

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
      // seen=1 clears the team's unread mark on this ticket. On the GET the
      // page already makes, so opening a ticket costs no extra request.
      const res = await fetch(`/api/foundation/issues/${issueId}?seen=1`, {
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

  function setView(next: QueueView) {
    setViewState(next);
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('view', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  /**
   * One ticket move. Resolves true when the server took it.
   *
   * `asTeacher` sends the teacher token for moves that message the student, so
   * the Neram Assistant card carries this person's name and a "Message" button.
   * A refusal (409 when someone else moved the ticket first) is shown, not
   * swallowed: a button that silently does nothing is the worst answer.
   */
  async function handleAction(
    issueId: string,
    action: string,
    payload: Record<string, any> = {},
    successMessage?: string,
    opts: { asTeacher?: boolean; quiet?: boolean } = {}
  ): Promise<boolean> {
    setUpdating(true);
    try {
      const token = opts.asTeacher
        ? (await getTeacherToken()) || (await getToken())
        : await getToken();
      if (!token) return false;
      const res = await fetch(`/api/foundation/issues/${issueId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (!opts.quiet) {
          setSnackbar({ open: true, message: data.error || 'That did not go through. Try again.', severity: 'error' });
        }
        if (res.status === 409) {
          fetchIssues();
          fetchIssueDetail(issueId);
        }
        return false;
      }
      // Refresh both list and detail
      fetchIssues();
      if (selectedIssue) {
        fetchIssueDetail(issueId);
      }
      if (successMessage) {
        setSnackbar({ open: true, message: successMessage });
      }
      return true;
    } catch (err) {
      console.error('Failed to update issue:', err);
      if (!opts.quiet) setSnackbar({ open: true, message: 'That did not go through. Try again.', severity: 'error' });
      return false;
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

  /** "Start working": acknowledge the ticket, and own it if nobody does. */
  async function handleStart() {
    if (!selectedIssue) return;
    const first = firstNameOf(selectedIssue.student_name);
    await handleAction(selectedIssue.id, 'start', {}, `You are on it. ${first} has been told.`, { asTeacher: true });
  }

  async function handleResume() {
    if (!selectedIssue) return;
    await handleAction(selectedIssue.id, 'resume', {}, 'Back in progress');
  }

  /** Mark resolved, Close now and Ask student all finish here. Throws to keep the sheet open. */
  async function handleStepSubmit({ code, note }: { code: FoundationIssueResolutionCode | null; note: string }) {
    if (!selectedIssue || !stepSheet) return;
    const first = firstNameOf(selectedIssue.student_name);
    let ok = false;
    if (stepSheet === 'resolve') {
      ok = await handleAction(
        selectedIssue.id,
        'resolve',
        { resolution_note: note, resolution_code: code },
        `Marked resolved. ${first} has been asked to confirm.`,
        { asTeacher: true, quiet: true },
      );
    } else if (stepSheet === 'close') {
      ok = await handleAction(
        selectedIssue.id,
        'close',
        { resolution_code: code, note },
        `Ticket closed. ${first} has been told.`,
        { asTeacher: true, quiet: true },
      );
    } else {
      ok = await handleAction(
        selectedIssue.id,
        'request_info',
        { message: note },
        `Question sent. Waiting for ${first} to reply.`,
        { asTeacher: true, quiet: true },
      );
    }
    if (!ok) throw new Error('step failed');
    setStepSheet(null);
  }

  async function handleStaffReopen() {
    if (!selectedIssue || !reopenReason.trim()) return;
    const ok = await handleAction(
      selectedIssue.id,
      'reopen',
      { reason: reopenReason.trim() },
      `Reopened. ${firstNameOf(selectedIssue.student_name)} has been told.`,
      { asTeacher: true },
    );
    if (ok) {
      setReopenOpen(false);
      setReopenReason('');
    }
  }

  async function handlePriority(priority: FoundationIssuePriority) {
    if (!selectedIssue) return;
    await handleAction(selectedIssue.id, 'priority', { priority });
    setMenuAnchor(null);
  }

  /**
   * Reply on the ticket, and reach the student.
   *
   * The teacher token is the whole point: the route turns it into a Teams 1:1
   * chat from this staff member's own account, so the student has a person to
   * answer rather than a system message. An internal note skips all of that.
   *
   * Throws on failure so the composer keeps the draft in the box.
   */
  async function handleSendComment(text: string, internal: boolean) {
    if (!selectedIssue) return;
    const token = internal ? await getToken() : await getTeacherToken();
    if (!token) throw new Error('Not signed in');
    const res = await fetch(`/api/foundation/issues/${selectedIssue.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'comment', comment: text, internal }),
    });
    if (!res.ok) {
      setSnackbar({ open: true, message: 'Could not send that reply. Try again.' });
      throw new Error('comment failed');
    }
    setSnackbar({
      open: true,
      message: internal ? 'Internal note saved' : 'Reply sent to the student on Teams',
    });
    fetchIssueDetail(selectedIssue.id);
    fetchIssues();
  }

  /** Ask the reporter to try it again and say whether it is fixed. */
  async function handleRecheck() {
    if (!selectedIssue) return;
    setRecheckSending(true);
    try {
      const token = await getTeacherToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`/api/foundation/issues/${selectedIssue.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recheck', note: recheckNote.trim() }),
      });
      if (!res.ok) throw new Error('recheck failed');
      setRecheckOpen(false);
      setRecheckNote('');
      setSnackbar({ open: true, message: 'Asked them to check it and reply on the ticket' });
      fetchIssueDetail(selectedIssue.id);
    } catch {
      setSnackbar({ open: true, message: 'Could not send that. Try again.' });
    } finally {
      setRecheckSending(false);
    }
  }

  function openIssueDetail(issue: NexusFoundationIssueWithDetails) {
    setSelectedIssue(issue);
    fetchIssueDetail(issue.id);
  }

  const filteredIssues = issues.filter((issue) => view === 'all' || staffQueueOf(issue.status) === view);

  const queueCounts = issues.reduce<Record<QueueView, number>>(
    (acc, issue) => {
      acc[staffQueueOf(issue.status)] += 1;
      acc.all += 1;
      return acc;
    },
    { new: 0, in_progress: 0, waiting: 0, to_confirm: 0, closed: 0, all: 0 },
  );

  // One vocabulary for both issues pages: lib/issue-status.ts.
  const statusColor = (status: string) => statusMeta(status).color;
  const statusLabel = (status: string) => statusMeta(status).staffLabel;

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


  const openCount = queueCounts.new;

  // ============================================
  // ACTIVITY LOG TIMELINE
  // ============================================
  const activityTimeline = (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 1.5 }}>
        <TimelineIcon sx={{ fontSize: '1rem', color: 'text.secondary' }} />
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
          CONVERSATION
        </Typography>
      </Box>

      {/* The same component the student reads, so neither side is looking at a
          different record of the same exchange. showInternal is a staff view of
          rows a student is never served in the first place. */}
      <IssueThread
        activity={activity}
        viewerId={user?.id || null}
        loading={activityLoading}
        showInternal
        emptyText="Nothing said yet. A reply here reaches the student on Teams and in Nexus."
      />

      {selectedIssue && selectedIssue.status !== 'closed' && (
        <IssueReplyComposer
          onSend={handleSendComment}
          placeholder="Reply to the student..."
          allowInternal
          helperText="Sends this as a message from your own Teams chat with the student, plus a Nexus alert, with a link back to this ticket."
        />
      )}
    </Box>
  );

  function openAssignDialog() {
    setAssignDialogOpen(true);
    setSelectedStaff(null);
    setStaffSearch('');
    setStaffResults([]);
  }

  // ============================================
  // NEXT STEP
  // ============================================
  // The one obvious move for where the ticket is, plus the less common ones
  // behind a menu. Which moves appear mirrors canMove in lib/issue-status.ts,
  // which the route enforces.
  type StepAction = { label: string; icon: ReactNode; onClick: () => void; color?: 'success' | 'primary' | 'warning' };

  const nextStep = (() => {
    if (!selectedIssue) return null;
    const i = selectedIssue;
    const first = firstNameOf(i.student_name);
    const assigned = Boolean(i.assigned_to);
    const resolveA: StepAction = { label: 'Mark resolved', icon: <CheckCircleOutlineIcon />, onClick: () => setStepSheet('resolve'), color: 'success' };
    const askA: StepAction = { label: 'Ask student', icon: <QuestionAnswerOutlinedIcon />, onClick: () => setStepSheet('ask') };
    const closeA: StepAction = { label: 'Close now', icon: <TaskAltIcon />, onClick: () => setStepSheet('close') };
    const reopenA: StepAction = { label: 'Reopen', icon: <ReplayIcon />, onClick: () => { setReopenReason(''); setReopenOpen(true); } };
    const assignA: StepAction = { label: assigned ? 'Reassign' : 'Assign to...', icon: <AssignmentIndIcon />, onClick: openAssignDialog };
    const delegateA: StepAction = {
      label: 'Delegate',
      icon: <SwapHorizIcon />,
      onClick: () => {
        setDelegateDialogOpen(true);
        setDelegateTarget(null);
        setDelegateReason('');
        setStaffResults([]);
        setStaffSearch('');
      },
    };
    const returnA: StepAction = { label: 'Return to queue', icon: <KeyboardReturnIcon />, onClick: () => { setReturnDialogOpen(true); setReturnReason(''); } };
    const recheckA: StepAction = { label: 'Ask them to check again', icon: <HelpOutlineIcon />, onClick: () => { setRecheckNote(''); setRecheckOpen(true); } };
    const owned = assigned ? [delegateA, returnA] : [];
    const closes = closesInText(i.auto_close_at);

    switch (i.status) {
      case 'open': {
        const age = daysSince(i.created_at);
        return {
          line: age >= STALE_NEW_DAYS
            ? `New, and nobody has picked it up for ${age} days. ${first} is waiting.`
            : `New ticket. Nobody has picked it up yet.`,
          primary: { label: 'Start working', icon: <PlayArrowIcon />, onClick: handleStart } as StepAction,
          secondary: assignA,
          more: [askA, resolveA, closeA],
        };
      }
      case 'in_progress':
        return {
          line: `${i.assigned_to_name || 'Someone'} is working on this. ${first} can see that.`,
          primary: resolveA,
          secondary: askA,
          more: [...owned, closeA],
        };
      case 'waiting_on_student':
        return {
          line: `Waiting for ${first} to reply${closes ? `. The ticket ${closes} if there is no reply` : ''}. Their reply moves it back to in progress.`,
          primary: { label: 'Resume', icon: <PlayArrowIcon />, onClick: handleResume } as StepAction,
          secondary: resolveA,
          more: [...owned, closeA],
        };
      case 'awaiting_confirmation':
        return {
          line: `Waiting for ${first} to confirm it works${closes ? `. The ticket ${closes} if there is no answer` : ''}.`,
          primary: recheckA,
          secondary: closeA,
          more: [reopenA],
        };
      case 'resolved':
        return { line: 'Resolved before confirmations existed.', primary: closeA, secondary: null, more: [reopenA] };
      default:
        return { line: null, primary: reopenA, secondary: null, more: [] };
    }
  })();

  const outcomeLabel = selectedIssue?.resolution_code
    ? OUTCOME_LABEL[selectedIssue.resolution_code as FoundationIssueResolutionCode]
    : null;
  const showResolution =
    selectedIssue &&
    (selectedIssue.status === 'awaiting_confirmation' || selectedIssue.status === 'resolved' || selectedIssue.status === 'closed');

  const nextStepCard = selectedIssue && nextStep && (
    <Box
      data-testid="issue-next-step"
      sx={{
        mb: 2,
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: selectedIssue.status === 'waiting_on_student' ? alpha(theme.palette.warning.main, 0.4) : 'divider',
        bgcolor: selectedIssue.status === 'waiting_on_student'
          ? alpha(theme.palette.warning.main, 0.06)
          : alpha(theme.palette.primary.main, 0.03),
      }}
    >
      {showResolution && (
        <Box sx={{ mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 0.5 }}>
            <CheckCircleOutlineIcon sx={{ fontSize: '1.1rem', color: 'success.main' }} aria-hidden />
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {selectedIssue.status === 'closed' ? 'Closed' : 'Resolved'}
              {selectedIssue.resolved_by_name ? ` by ${selectedIssue.resolved_by_name}` : ''}
            </Typography>
            {outcomeLabel && <Chip label={outcomeLabel} size="small" color="success" variant="outlined" sx={{ height: 22 }} />}
          </Box>
          {selectedIssue.resolution_note && (
            <Typography variant="body2" sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>
              {selectedIssue.resolution_note}
            </Typography>
          )}
          {selectedIssue.resolved_at && (
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
              {formatTimestamp(selectedIssue.resolved_at)}
            </Typography>
          )}
        </Box>
      )}

      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: 0.4, display: 'block' }}>
        NEXT STEP
      </Typography>
      {nextStep.line && (
        <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'flex-start', mt: 0.5, mb: 1.5 }}>
          {selectedIssue.status === 'waiting_on_student' && (
            <ScheduleIcon sx={{ fontSize: '1rem', color: 'warning.dark', mt: '2px' }} aria-hidden />
          )}
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            {nextStep.line}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', gap: 1, flexWrap: { xs: 'wrap', sm: 'nowrap' }, mt: nextStep.line ? 0 : 1 }}>
        <Button
          variant={selectedIssue.status === 'closed' ? 'outlined' : 'contained'}
          color={nextStep.primary.color || 'primary'}
          startIcon={nextStep.primary.icon}
          onClick={nextStep.primary.onClick}
          disabled={updating}
          data-testid="issue-primary-action"
          sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48, flex: '1 1 auto' }}
        >
          {updating ? 'Working...' : nextStep.primary.label}
        </Button>
        {nextStep.secondary && (
          <Button
            variant="outlined"
            color={nextStep.secondary.color || 'primary'}
            startIcon={nextStep.secondary.icon}
            onClick={nextStep.secondary.onClick}
            disabled={updating}
            sx={{ textTransform: 'none', fontWeight: 600, minHeight: 48, flex: '1 1 auto' }}
          >
            {nextStep.secondary.label}
          </Button>
        )}
        {nextStep.more.length > 0 && (
          <IconButton
            aria-label="More steps"
            aria-haspopup="menu"
            onClick={(e) => setStepMenuAnchor(e.currentTarget)}
            disabled={updating}
            sx={{ width: 48, height: 48, border: 1, borderColor: 'divider', borderRadius: 1.5, flexShrink: 0 }}
          >
            <MoreVertIcon />
          </IconButton>
        )}
      </Box>

      <Menu
        anchorEl={stepMenuAnchor}
        open={Boolean(stepMenuAnchor)}
        onClose={() => setStepMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {nextStep.more.map((a) => (
          <MenuItem
            key={a.label}
            onClick={() => {
              setStepMenuAnchor(null);
              a.onClick();
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>{a.icon}</ListItemIcon>
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );

  // ============================================
  // DETAIL DRAWER CONTENT
  // ============================================
  const screenshotCount = selectedIssue?.screenshot_urls?.length || 0;

  const detailContent = selectedIssue && (
    <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block' }}>
            {selectedIssue.ticket_number}
          </Typography>
          <Typography variant="h6" component="h2" sx={{ fontWeight: 700, fontSize: '1.1rem', overflowWrap: 'anywhere' }}>
            {selectedIssue.title}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
          <IconButton
            aria-label="More: priority and delete"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            sx={{ width: 44, height: 44 }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
          <IconButton aria-label="Close ticket panel" onClick={() => setSelectedIssue(null)} sx={{ width: 44, height: 44 }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Where the ticket is, then the one thing to do about it. Both above
          the fold, so a teacher on a phone never scrolls to find the button. */}
      <Box sx={{ mb: 2 }}>
        <IssueStatusTracker
          status={selectedIssue.status}
          role="staff"
          note={selectedIssue.status === 'waiting_on_student' ? 'Waiting on student' : null}
        />
      </Box>

      {nextStepCard}

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
        <StudentAvatar
          userId={selectedIssue.student_id}
          src={selectedIssue.student_avatar}
          name={selectedIssue.student_name}
          size={36}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedIssue.student_name}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Reported {formatDate(selectedIssue.created_at)}
          </Typography>
        </Box>
      </Box>

      {/* Reproduce the issue exactly as the student sees it */}
      <Box sx={{ mb: 1.5 }}>
        {/* The cheap answer first: the sentence she is reading right now.
            Impersonating her is the expensive one, and sits under it. */}
        {selectedIssue.student_id && (
          <StudentTestCardPanel
            studentId={selectedIssue.student_id}
            firstName={(selectedIssue.student_name || 'this student').trim().split(/\s+/)[0]}
          />
        )}

        <ViewAsStudentButton
          studentId={selectedIssue.student_id}
          reason={`Ticket ${selectedIssue.ticket_number}`}
          ticketId={selectedIssue.id}
          variant="contained"
          fullWidth
          label="View as this student"
        />
      </Box>

      {/* Hand the whole ticket to Claude in two pastes: all the text, then all
          the pictures stacked into one image. */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        <Button
          fullWidth
          variant="outlined"
          data-testid="copy-report"
          onClick={handleCopyReport}
          startIcon={
            reportCopied ? (
              <CheckIcon sx={{ fontSize: '1.1rem' }} />
            ) : (
              <DescriptionOutlinedIcon sx={{ fontSize: '1.1rem' }} />
            )
          }
          color={reportCopied ? 'success' : 'primary'}
          sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600 }}
        >
          {reportCopied ? 'Copied' : 'Copy report'}
        </Button>
        {screenshotCount > 0 && (
          <Button
            fullWidth
            variant="outlined"
            data-testid="copy-images"
            onClick={handleCopyImages}
            disabled={copyingImages}
            startIcon={
              copyingImages ? (
                <CircularProgress size={16} />
              ) : imagesCopied ? (
                <CheckIcon sx={{ fontSize: '1.1rem' }} />
              ) : (
                <ImageOutlinedIcon sx={{ fontSize: '1.1rem' }} />
              )
            }
            color={imagesCopied ? 'success' : 'primary'}
            sx={{ textTransform: 'none', minHeight: 44, fontWeight: 600 }}
          >
            {imagesCopied ? 'Copied' : `Copy ${screenshotCount} image${screenshotCount > 1 ? 's' : ''}`}
          </Button>
        )}
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
        {statusMeta(selectedIssue.status).turn !== 'none' && selectedIssue.status !== 'awaiting_confirmation' && (
          <Button
            size="small"
            variant="outlined"
            onClick={openAssignDialog}
            sx={{ textTransform: 'none', fontSize: '0.8rem', minHeight: 44 }}
          >
            {selectedIssue.assigned_to ? 'Reassign' : 'Assign'}
          </Button>
        )}
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Chapter/Section. Most tickets come from the report button, not a
          chapter, and "Ch 0:" is noise. */}
      {selectedIssue.chapter_title && (
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
      )}

      {/* Description */}
      {selectedIssue.description && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
              DESCRIPTION
            </Typography>
            <Tooltip title={descCopied ? 'Copied!' : 'Copy'}>
              <IconButton
                size="small"
                onClick={() => handleCopyDescription(selectedIssue.description!)}
                sx={{ p: 0.25 }}
              >
                {descCopied
                  ? <CheckIcon sx={{ fontSize: 14, color: 'success.main' }} />
                  : <ContentCopyIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
              </IconButton>
            </Tooltip>
          </Box>
          <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
            {selectedIssue.description}
          </Typography>
        </Box>
      )}

      {/*
        The working behind a queried result.
        Rendered from the SAME function that wrote the Teams message the teacher
        already received, so the ticket and the chat can never drift apart and
        say two different things about one student's marks.
      */}
      {selectedIssue.category === 'result_dispute' && Boolean(selectedIssue.context?.facts) && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, display: 'block', mb: 0.5 }}>
            HOW THIS RESULT WAS WORKED OUT
          </Typography>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'action.hover',
              // A long line wraps instead of scrolling the panel sideways.
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            <Typography variant="body2" sx={{ lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' }}>
              {renderFactsForTeacher(
                selectedIssue.context?.facts as ResultFacts,
                selectedIssue.student_name || 'This student',
                selectedIssue.description || '',
              )}
            </Typography>
          </Box>
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
                onClick={() => setLightboxUrl(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/issue-screenshots/${path}`)}
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

      {/* Technical details (staff-only): source app, device info, and the
          auto-captured console/network errors. Never shown to the student.
          A student's "Still happening" sends a fresh set, shown first and open,
          because after a fix the original report's logs describe the old bug. */}
      {(() => {
        const str = (v: unknown) => (v === null || v === undefined || v === '' ? null : String(v));
        const deviceBitsOf = (di: Record<string, unknown> | null | undefined) =>
          di
            ? [
                str(di.device_type),
                [str(di.browser), str(di.browser_version)].filter(Boolean).join(' ') || null,
                [str(di.os), str(di.os_version)].filter(Boolean).join(' ') || null,
                di.screen_width && di.screen_height ? `${di.screen_width}×${di.screen_height}` : null,
                str(di.connection_type),
                di.is_pwa ? 'PWA' : null,
              ].filter(Boolean) as string[]
            : [];
        const logsBox = (logs: FoundationIssueLogEntry[]) =>
          logs.length > 0 && (
            <Box
              sx={{
                mt: 1,
                p: 1,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.text.primary, 0.04),
                maxHeight: 220,
                overflow: 'auto',
                fontFamily: 'monospace',
                fontSize: '0.7rem',
              }}
            >
              {logs.map((log, i) => (
                <Box
                  key={i}
                  sx={{
                    mb: 0.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    color: log.level === 'error' ? 'error.main' : log.level === 'warn' ? 'warning.main' : 'text.secondary',
                  }}
                >
                  [{log.level}] {log.message}
                  {log.stack ? `
${log.stack}` : ''}
                </Box>
              ))}
            </Box>
          );
        const summarySx = { cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700, color: 'text.secondary', userSelect: 'none', py: 0.5 } as const;
        const countText = (n: number) => (n ? ` · ${n} log${n > 1 ? 's' : ''}` : '');

        const di = (selectedIssue.device_info as Record<string, unknown> | null) || null;
        const logs = selectedIssue.console_logs || [];
        const deviceBits = deviceBitsOf(di);
        const reopens = reopenSnapshotsOf(selectedIssue).slice().reverse();
        if (!di && logs.length === 0 && !selectedIssue.source_app && reopens.length === 0) return null;
        return (
          <>
            {reopens.map((r, idx) => {
              const bits = deviceBitsOf(r.device_info);
              const rLogs = r.console_logs || [];
              return (
                <Box component="details" key={`${r.at}-${idx}`} open={idx === 0} sx={{ mt: 1.5 }}>
                  <Box component="summary" sx={{ ...summarySx, color: 'warning.dark' }}>
                    Reopened {formatTimestamp(r.at)}{countText(rLogs.length)}
                  </Box>
                  {r.reason && (
                    <Typography variant="body2" sx={{ mt: 0.5, fontStyle: 'italic' }}>
                      &ldquo;{r.reason}&rdquo;
                    </Typography>
                  )}
                  <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {r.page_url && <Chip size="small" variant="outlined" label={`from: ${r.page_url}`} />}
                    {bits.map((b, i) => (
                      <Chip key={i} size="small" variant="outlined" label={b} />
                    ))}
                    {rLogs.length === 0 && <Chip size="small" variant="outlined" label="no errors caught" />}
                  </Box>
                  {logsBox(rLogs)}
                </Box>
              );
            })}
            <Box component="details" sx={{ mt: 1.5 }}>
              <Box component="summary" sx={summarySx}>
                {reopens.length ? 'Original report technical details' : 'Technical details'}
                {countText(logs.length)}
              </Box>
              <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Chip size="small" variant="outlined" label={`app: ${selectedIssue.source_app || 'nexus'}`} />
                {deviceBits.map((b, i) => (
                  <Chip key={i} size="small" variant="outlined" label={b} />
                ))}
              </Box>
              {logsBox(logs)}
            </Box>
          </>
        );
      })()}

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
      <Divider />
      <MenuItem
        onClick={() => {
          setMenuAnchor(null);
          setDeleteDialogOpen(true);
        }}
        sx={{ fontSize: '0.85rem', color: 'error.main' }}
      >
        <ListItemIcon sx={{ minWidth: 28 }}>
          <DeleteOutlineIcon fontSize="small" sx={{ color: 'error.main' }} />
        </ListItemIcon>
        <ListItemText>Delete Issue</ListItemText>
      </MenuItem>
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
            <StudentAvatar userId={option.id} src={option.avatar_url} name={option.name} size={28} />
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
        Pick up, follow up and close student-reported issues
      </Typography>

      {/* Queue: the counts ARE the filters. Scrolls sideways inside itself on
          a phone; the page never does. */}
      <Box
        role="group"
        aria-label="Filter tickets by status"
        sx={{
          display: 'flex',
          gap: 1,
          mb: 2,
          overflowX: 'auto',
          pb: 0.5,
          mx: { xs: -2, sm: 0 },
          px: { xs: 2, sm: 0 },
          scrollbarWidth: 'thin',
        }}
      >
        {QUEUE_VIEWS.map((q) => {
          const selected = view === q.key;
          const count = queueCounts[q.key];
          const attention = (q.key === 'new' || q.key === 'in_progress') && count > 0;
          return (
            <Box
              key={q.key}
              component="button"
              type="button"
              aria-pressed={selected}
              onClick={() => setView(q.key)}
              sx={{
                flex: '0 0 auto',
                minWidth: 104,
                minHeight: 64,
                px: 1.5,
                py: 1,
                textAlign: 'left',
                cursor: 'pointer',
                font: 'inherit',
                borderRadius: 2,
                border: 1,
                borderColor: selected ? 'primary.main' : 'divider',
                bgcolor: selected ? alpha(theme.palette.primary.main, 0.08) : 'background.paper',
                color: 'text.primary',
                transition: 'background-color 150ms, border-color 150ms',
                '&:hover': { borderColor: 'primary.main' },
                '&:focus-visible': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 2 },
                '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
              }}
            >
              <Typography
                component="span"
                sx={{
                  display: 'block',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  lineHeight: 1.2,
                  color: attention ? (q.key === 'new' ? 'warning.dark' : 'info.dark') : 'text.primary',
                }}
              >
                {loading ? '-' : count}
              </Typography>
              <Typography component="span" sx={{ display: 'block', fontSize: '0.78rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                {q.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

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
            {view === 'all'
              ? 'No issues reported by students yet.'
              : view === 'new'
                ? 'Nothing new. Every ticket has been picked up.'
                : `No tickets in ${QUEUE_VIEWS.find((q) => q.key === view)?.label.toLowerCase()} right now.`}
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
                borderLeftColor: (() => {
                  const c = statusColor(issue.status);
                  return c === 'default' ? theme.palette.divider : theme.palette[c].main;
                })(),
                '&:hover': { bgcolor: 'action.hover' },
                transition: 'background-color 150ms',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                <StudentAvatar
                  userId={issue.student_id}
                  src={issue.student_avatar}
                  name={issue.student_name}
                  size={32}
                  sx={{ mt: 0.25 }}
                />
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
                    {/* A reply nobody on the team has opened. Shape as well as
                        colour, so it still reads without colour vision. */}
                    {hasUnreadReply(issue) && (
                      <Tooltip title="New reply on this ticket">
                        <CircleIcon
                          aria-label="New reply"
                          sx={{ fontSize: '0.6rem', color: 'primary.main', flexShrink: 0 }}
                        />
                      </Tooltip>
                    )}
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
                    {issue.student_name}
                    {issue.chapter_title && ` · Ch ${issue.chapter_number}`}
                    {issue.section_title && ` · ${issue.section_title}`}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                      {formatDate(issue.created_at)}
                    </Typography>
                    {issue.status === 'open' && daysSince(issue.created_at) >= STALE_NEW_DAYS && (
                      <Chip
                        icon={<ScheduleIcon sx={{ fontSize: '0.8rem' }} />}
                        label={`Waiting ${daysSince(issue.created_at)}d`}
                        size="small"
                        color="warning"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    )}
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

      {/* Delete Confirm Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => !deleting && setDeleteDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ pb: 1 }}>Delete Issue?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            This will permanently delete{' '}
            <strong>{selectedIssue?.ticket_number}</strong> and all its screenshots and activity history. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => setDeleteDialogOpen(false)}
            disabled={deleting}
            size="small"
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteIssue}
            disabled={deleting}
            startIcon={deleting ? <CircularProgress size={14} color="inherit" /> : <DeleteOutlineIcon />}
            size="small"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Lightbox */}
      <Dialog
        open={!!lightboxUrl}
        onClose={() => setLightboxUrl(null)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'visible',
            m: 1,
          },
        }}
      >
        <Box sx={{ position: 'relative' }}>
          <IconButton
            onClick={() => setLightboxUrl(null)}
            sx={{
              position: 'absolute',
              top: -16,
              right: -16,
              bgcolor: 'background.paper',
              boxShadow: 2,
              zIndex: 1,
              '&:hover': { bgcolor: 'grey.100' },
            }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          {lightboxUrl && (
            <Box
              component="img"
              src={lightboxUrl}
              alt="Screenshot"
              sx={{
                maxWidth: '90vw',
                maxHeight: '85vh',
                borderRadius: 2,
                display: 'block',
                objectFit: 'contain',
              }}
            />
          )}
        </Box>
      </Dialog>

      {/* Success Snackbar */}
      {/* Ask the reporter to re-check */}
      <Dialog open={recheckOpen} onClose={() => setRecheckOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Ask them to check it again</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Sends a message from your own Teams chat with the student, plus a Nexus alert,
            with a link back to this ticket. It asks them to try it once more and answer here.
          </Typography>
          <TextField
            label="Anything to add (optional)"
            placeholder="Try opening the test again now and tell us what it says."
            value={recheckNote}
            onChange={(e) => setRecheckNote(e.target.value)}
            fullWidth
            multiline
            rows={3}
            sx={{ '& .MuiInputBase-input': { fontSize: 16 } }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setRecheckOpen(false)} sx={{ textTransform: 'none', minHeight: 44 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRecheck}
            disabled={recheckSending}
            startIcon={recheckSending ? <CircularProgress size={16} /> : <HelpOutlineIcon />}
            sx={{ textTransform: 'none', minHeight: 44 }}
          >
            {recheckSending ? 'Sending...' : 'Send the ask'}
          </Button>
        </DialogActions>
      </Dialog>

      <IssueStepSheet
        open={stepSheet !== null}
        mode={stepSheet || 'resolve'}
        studentFirstName={firstNameOf(selectedIssue?.student_name)}
        onClose={() => setStepSheet(null)}
        onSubmit={handleStepSubmit}
      />

      <ResponsiveSheet
        open={reopenOpen}
        onClose={() => setReopenOpen(false)}
        title="Reopen this ticket"
        description={`${firstNameOf(selectedIssue?.student_name)} is told it is open again, with your reason.`}
        disableClose={updating}
        actions={
          <>
            <Button onClick={() => setReopenOpen(false)} disabled={updating} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleStaffReopen}
              disabled={!reopenReason.trim() || updating}
              startIcon={<ReplayIcon />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {updating ? 'Reopening...' : 'Reopen'}
            </Button>
          </>
        }
      >
        <TextField
          label="Why is it open again?"
          value={reopenReason}
          onChange={(e) => setReopenReason(e.target.value)}
          required
          fullWidth
          multiline
          minRows={2}
          autoFocus
          inputProps={{ style: { fontSize: 16 } }}
        />
      </ResponsiveSheet>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={snackbar.severity === 'error' ? 6000 : 3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity || 'success'}
          onClose={() => setSnackbar({ open: false, message: '' })}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
