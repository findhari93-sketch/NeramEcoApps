'use client';

import { useState, useEffect } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ReportIssueDialog from '@/components/issues/ReportIssueDialog';
import type { NexusFoundationIssueWithDetails, FoundationIssueCategory } from '@neram/database/types';

const CATEGORY_CONFIG: Record<FoundationIssueCategory, { label: string; icon: React.ReactNode; color: string }> = {
  bug: { label: 'Bug', icon: <BugReportOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#d32f2f' },
  content_issue: { label: 'Content', icon: <MenuBookOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#ed6c02' },
  ui_ux: { label: 'UI/UX', icon: <DesignServicesOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#1976d2' },
  feature_request: { label: 'Feature', icon: <LightbulbOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#7b1fa2' },
  class_schedule: { label: 'Class', icon: <EventOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#2e7d32' },
  other: { label: 'Other', icon: <HelpOutlineOutlinedIcon sx={{ fontSize: '0.8rem' }} />, color: '#757575' },
};

export default function StudentIssuesPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const [reopenIssueId, setReopenIssueId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  const filteredIssues = issues.filter((issue) => {
    if (tab === 1) return issue.status === 'open' || issue.status === 'in_progress';
    if (tab === 2) return issue.status === 'awaiting_confirmation';
    if (tab === 3) return issue.status === 'resolved' || issue.status === 'closed';
    return true;
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
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2, mt: 1.5,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem', py: 0.5 },
        }}
      >
        <Tab label={`All (${issues.length})`} />
        <Tab label={`Open (${openCount})`} />
        <Tab label={`Awaiting (${awaitingCount})`} />
        <Tab label={`Closed (${closedCount})`} />
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
            {tab === 0
              ? 'No issues reported yet. Use "Create Ticket" to report your first issue.'
              : 'No issues in this category.'}
          </Typography>
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
                      Is this issue resolved?
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Button
                        size="small"
                        variant="contained"
                        color="success"
                        onClick={() => handleConfirm(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.8rem' }}
                      >
                        Yes, close it
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="warning"
                        onClick={() => setReopenIssueId(issue.id)}
                        disabled={actionLoading}
                        sx={{ textTransform: 'none', minHeight: 32, fontSize: '0.8rem' }}
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
