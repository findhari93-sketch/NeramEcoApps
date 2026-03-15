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
} from '@neram/ui';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import type { NexusFoundationIssueWithDetails } from '@neram/database/types';

export default function StudentIssuesPage() {
  const theme = useTheme();
  const { getToken } = useNexusAuthContext();
  const [issues, setIssues] = useState<NexusFoundationIssueWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0); // 0=all, 1=open, 2=resolved

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
    if (tab === 2) return issue.status === 'resolved';
    return true;
  });

  const statusColor = (status: string) => {
    if (status === 'open') return 'warning';
    if (status === 'in_progress') return 'info';
    if (status === 'resolved') return 'success';
    return 'default';
  };

  const statusLabel = (status: string) => {
    if (status === 'in_progress') return 'In Progress';
    return status.charAt(0).toUpperCase() + status.slice(1);
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

  const openCount = issues.filter((i) => i.status === 'open' || i.status === 'in_progress').length;
  const resolvedCount = issues.filter((i) => i.status === 'resolved').length;

  return (
    <Box>
      {/* Header */}
      <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        My Reported Issues
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.85rem' }}>
        Track issues you&apos;ve reported about learning chapters
      </Typography>

      {/* Tabs */}
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{
          mb: 2,
          minHeight: 36,
          '& .MuiTab-root': { minHeight: 36, textTransform: 'none', fontSize: '0.85rem', py: 0.5 },
        }}
      >
        <Tab label={`All (${issues.length})`} />
        <Tab label={`Open (${openCount})`} />
        <Tab label={`Resolved (${resolvedCount})`} />
      </Tabs>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rectangular" height={100} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : filteredIssues.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <ReportProblemOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            {tab === 0
              ? 'No issues reported yet. You can report issues from any learning chapter.'
              : tab === 1
                ? 'No open issues.'
                : 'No resolved issues yet.'}
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {filteredIssues.map((issue) => (
            <Paper
              key={issue.id}
              variant="outlined"
              sx={{
                p: 2,
                borderRadius: 2,
                borderLeftWidth: 3,
                borderLeftColor:
                  issue.status === 'resolved'
                    ? theme.palette.success.main
                    : issue.status === 'in_progress'
                      ? theme.palette.info.main
                      : theme.palette.warning.main,
              }}
            >
              {/* Title + Status */}
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, flex: 1, lineHeight: 1.3 }}>
                  {issue.title}
                </Typography>
                <Chip
                  label={statusLabel(issue.status)}
                  size="small"
                  color={statusColor(issue.status) as any}
                  sx={{ fontSize: '0.7rem', height: 22 }}
                />
              </Box>

              {/* Chapter info */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <MenuBookOutlinedIcon sx={{ fontSize: '0.85rem', color: 'text.secondary' }} />
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Ch {issue.chapter_number}: {issue.chapter_title}
                  {issue.section_title && ` · ${issue.section_title}`}
                </Typography>
              </Box>

              {/* Description */}
              {issue.description && (
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', display: 'block', mb: 0.75, lineHeight: 1.4 }}
                >
                  {issue.description}
                </Typography>
              )}

              {/* Date + Resolution */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>
                  Reported {formatDate(issue.created_at)}
                </Typography>
              </Box>

              {/* Resolution note */}
              {issue.status === 'resolved' && issue.resolution_note && (
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
                  {issue.resolved_at && (
                    <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontSize: '0.7rem', mt: 0.25 }}>
                      {formatDate(issue.resolved_at)}
                    </Typography>
                  )}
                </Box>
              )}

              {/* In progress indicator */}
              {issue.status === 'in_progress' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.75 }}>
                  <HourglassEmptyIcon sx={{ fontSize: '0.8rem', color: theme.palette.info.main }} />
                  <Typography variant="caption" sx={{ color: theme.palette.info.main }}>
                    Being reviewed by your teacher
                  </Typography>
                </Box>
              )}
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
