'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Skeleton, Tabs, Tab, Avatar, Chip,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import type { DrawingSubmissionWithDetails } from '@neram/database/types';

const STATUS_TABS = [
  { value: 'submitted', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'completed', label: 'Completed' },
];

// Sub-filters shown under the Reviewed tab
const REVIEWED_SUB_FILTERS = [
  { value: 'all', label: 'All Reviewed', apiStatus: 'reviewed' },
  { value: 'redo', label: 'Needs Redo', apiStatus: 'redo' },
  { value: 'reviewed', label: 'Feedback Sent', apiStatus: 'reviewed_only' },
];

export default function DrawingReviewsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('submitted');
  const [reviewedSubFilter, setReviewedSubFilter] = useState('all');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      // For reviewed tab, apply sub-filter if not 'all'
      let fetchStatus = status;
      if (status === 'reviewed' && reviewedSubFilter === 'redo') fetchStatus = 'redo';
      else if (status === 'reviewed' && reviewedSubFilter === 'reviewed') fetchStatus = 'reviewed_only';

      const res = await fetch(`/api/drawing/submissions/review-queue?status=${fetchStatus}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status, reviewedSubFilter]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Drawing Reviews
      </Typography>

      <Tabs
        value={status}
        onChange={(_, v) => { setStatus(v); setReviewedSubFilter('all'); }}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {/* Sub-filter chips for Reviewed tab */}
      {status === 'reviewed' && (
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {REVIEWED_SUB_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              onClick={() => setReviewedSubFilter(f.value)}
              color={reviewedSubFilter === f.value ? 'primary' : 'default'}
              variant={reviewedSubFilter === f.value ? 'filled' : 'outlined'}
              size="small"
              sx={{ cursor: 'pointer' }}
            />
          ))}
        </Box>
      )}

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {status === 'submitted' ? 'No pending reviews' : status === 'completed' ? 'No completed threads' : reviewedSubFilter === 'redo' ? 'No submissions needing redo' : 'No reviewed submissions'}
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
              onClick={() => router.push(`/teacher/drawing-reviews/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Drawing"
                  sx={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <Avatar
                      src={s.student?.avatar_url || undefined}
                      sx={{ width: 24, height: 24, fontSize: '0.7rem' }}
                    >
                      {s.student?.name?.charAt(0) || '?'}
                    </Avatar>
                    <Typography variant="body2" fontWeight={600}>{s.student?.name || 'Student'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, flexWrap: 'wrap' }}>
                    {s.question && <CategoryBadge category={s.question.category} />}
                    {(s as any).thread_info?.total_attempts > 1 && (
                      <Chip
                        label={`Attempt #${(s as any).attempt_number || (s as any).thread_info?.total_attempts}`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    )}
                    {s.tutor_rating && (
                      <Chip label={`${'★'.repeat(s.tutor_rating)}`} size="small" color="success" />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary" sx={{
                    display: '-webkit-box', WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.8rem',
                  }}>
                    {s.question?.question_text || 'Free Practice'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(s.submitted_at).toLocaleDateString()}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          ))}
        </Box>
      )}
    </Box>
  );
}
