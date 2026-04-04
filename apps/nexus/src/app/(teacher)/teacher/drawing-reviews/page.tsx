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
];

export default function DrawingReviewsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('submitted');

  const fetchQueue = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/review-queue?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmissions(data.submissions || []);
    } catch {
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [getToken, status]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 900, mx: 'auto' }}>
      <Typography variant="h6" fontWeight={700} gutterBottom>
        Drawing Reviews
      </Typography>

      <Tabs
        value={status}
        onChange={(_, v) => setStatus(v)}
        sx={{ mb: 2, minHeight: 36, '& .MuiTab-root': { minHeight: 36, py: 0.5, textTransform: 'none' } }}
      >
        {STATUS_TABS.map((t) => (
          <Tab key={t.value} value={t.value} label={t.label} />
        ))}
      </Tabs>

      {loading ? (
        Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">
            {status === 'submitted' ? 'No pending reviews' : 'No reviewed submissions'}
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
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {s.question && <CategoryBadge category={s.question.category} />}
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
