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

export default function StudentReportsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [reports, setReports] = useState<NexusQBReportWithContext[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  async function fetchReports() {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/question-bank/reports', {
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

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 600, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
        <IconButton
          onClick={() => router.push('/student/question-bank')}
          aria-label="Back to Question Bank"
          sx={{ minWidth: 48, minHeight: 48 }}
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5" fontWeight={700}>
          My Reports
        </Typography>
      </Box>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={100} sx={{ borderRadius: 2 }} />
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
            No reports yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            If you find issues with a question, use the &quot;Report Issue&quot; button after submitting your answer.
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
              {/* Top row: type badge + status */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  mb: 1,
                }}
              >
                <Chip
                  icon={<FlagOutlinedIcon />}
                  label={QB_REPORT_TYPE_LABELS[report.report_type] || report.report_type}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                <Chip
                  label={QB_REPORT_STATUS_LABELS[report.status] || report.status}
                  size="small"
                  color={STATUS_COLORS[report.status] || 'default'}
                  variant="filled"
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

              {/* Description if any */}
              {report.description && (
                <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                  {report.description}
                </Typography>
              )}

              {/* Date */}
              <Typography variant="caption" color="text.secondary">
                {new Date(report.created_at).toLocaleDateString()}
              </Typography>

              {/* Resolution note if resolved */}
              {report.status === 'resolved' && report.resolution_note && (
                <Paper
                  sx={{
                    mt: 1,
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
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
