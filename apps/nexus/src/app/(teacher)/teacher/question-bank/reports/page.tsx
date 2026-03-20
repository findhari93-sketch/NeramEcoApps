'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Skeleton,
  Button,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import {
  QB_REPORT_TYPE_LABELS,
  QB_REPORT_STATUS_LABELS,
} from '@neram/database';
import type { NexusQBReportWithContext, QBReportStatus } from '@neram/database';

const STATUS_COLORS: Record<QBReportStatus, 'warning' | 'info' | 'success' | 'default'> = {
  open: 'warning',
  in_review: 'info',
  resolved: 'success',
  dismissed: 'default',
};

const STATUS_TABS: Array<{ label: string; value: string }> = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'In Review', value: 'in_review' },
  { label: 'Resolved', value: 'resolved' },
];

export default function TeacherReportsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [reports, setReports] = useState<NexusQBReportWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState<string | null>(null);

  // Resolve dialog state
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [resolveReportId, setResolveReportId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  useEffect(() => {
    fetchReports();
  }, [statusFilter]);

  async function fetchReports() {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`/api/question-bank/reports?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setReports(json.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    } finally {
      setLoading(false);
    }
  }

  async function updateReportStatus(reportId: string, status: string, resolution_note?: string) {
    setUpdating(reportId);
    try {
      const token = await getToken();
      const res = await fetch(`/api/question-bank/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status, resolution_note }),
      });
      if (res.ok) {
        // Refresh the list
        await fetchReports();
      }
    } catch (err) {
      console.error('Failed to update report:', err);
    } finally {
      setUpdating(null);
    }
  }

  function openResolveDialog(reportId: string) {
    setResolveReportId(reportId);
    setResolutionNote('');
    setResolveDialogOpen(true);
  }

  async function handleResolve() {
    if (!resolveReportId) return;
    setResolveDialogOpen(false);
    await updateReportStatus(resolveReportId, 'resolved', resolutionNote || undefined);
    setResolveReportId(null);
    setResolutionNote('');
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 800, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton
          onClick={() => router.push('/teacher/question-bank')}
          aria-label="Back to Question Bank"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>
          Question Reports
        </Typography>
      </Box>

      {/* Status filter tabs */}
      <Tabs
        value={statusFilter}
        onChange={(_, val) => setStatusFilter(val)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          mb: 2,
          minHeight: 40,
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 600,
            minHeight: 40,
            fontSize: '0.85rem',
          },
        }}
      >
        {STATUS_TABS.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </Tabs>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={140} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {!loading && reports.length === 0 && (
        <Paper
          variant="outlined"
          sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}
        >
          <InboxOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="body1" color="text.secondary">
            No reports found
          </Typography>
        </Paper>
      )}

      {/* Reports list */}
      {!loading && reports.length > 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {reports.map((report) => (
            <Paper
              key={report.id}
              variant="outlined"
              sx={{ p: 2, borderRadius: 2 }}
            >
              {/* Top row: student info + status */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  mb: 1,
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>
                    {report.student_name || 'Unknown Student'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {report.student_email || ''}
                  </Typography>
                </Box>
                <Chip
                  label={QB_REPORT_STATUS_LABELS[report.status] || report.status}
                  size="small"
                  color={STATUS_COLORS[report.status] || 'default'}
                  variant="filled"
                />
              </Box>

              {/* Report type badge */}
              <Box sx={{ mb: 1 }}>
                <Chip
                  icon={<FlagOutlinedIcon />}
                  label={QB_REPORT_TYPE_LABELS[report.report_type] || report.report_type}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              </Box>

              {/* Question text preview */}
              {report.question_text && (
                <Typography
                  variant="body2"
                  color="text.primary"
                  sx={{
                    mb: 0.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {report.question_text}
                </Typography>
              )}

              {/* Description */}
              {report.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {report.description}
                </Typography>
              )}

              {/* Date */}
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                {new Date(report.created_at).toLocaleDateString()}
              </Typography>

              {/* Resolution note if resolved */}
              {report.status === 'resolved' && report.resolution_note && (
                <Paper
                  sx={{
                    mb: 1,
                    p: 1.5,
                    bgcolor: 'success.main',
                    color: 'success.contrastText',
                    borderRadius: 1,
                  }}
                  elevation={0}
                >
                  <Typography variant="caption" fontWeight={600}>
                    Resolution
                  </Typography>
                  <Typography variant="body2">
                    {report.resolution_note}
                  </Typography>
                </Paper>
              )}

              {/* Action buttons (only for non-resolved/dismissed) */}
              {report.status !== 'resolved' && report.status !== 'dismissed' && (
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {report.status === 'open' && (
                    <Button
                      size="small"
                      variant="outlined"
                      disabled={updating === report.id}
                      onClick={() => updateReportStatus(report.id, 'in_review')}
                      sx={{ textTransform: 'none' }}
                    >
                      Review
                    </Button>
                  )}
                  <Button
                    size="small"
                    variant="contained"
                    color="success"
                    disabled={updating === report.id}
                    onClick={() => openResolveDialog(report.id)}
                    sx={{ textTransform: 'none' }}
                  >
                    Resolve
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    disabled={updating === report.id}
                    onClick={() => updateReportStatus(report.id, 'dismissed')}
                    sx={{ textTransform: 'none' }}
                  >
                    Dismiss
                  </Button>
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      )}

      {/* Resolve Dialog */}
      <Dialog
        open={resolveDialogOpen}
        onClose={() => setResolveDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Resolve Report</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            multiline
            rows={3}
            fullWidth
            label="Resolution Note"
            placeholder="Describe what was done to resolve this issue..."
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResolveDialogOpen(false)} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleResolve}
            sx={{ textTransform: 'none' }}
          >
            Resolve
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
