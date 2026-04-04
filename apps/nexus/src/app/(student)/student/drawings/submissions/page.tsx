'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Chip, Paper, Skeleton, IconButton, Tabs, Tab,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import CategoryBadge from '@/components/drawings/CategoryBadge';
import type { DrawingSubmissionWithQuestion } from '@neram/database/types';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'submitted', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
];

export default function MySubmissionsPage() {
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submissions, setSubmissions] = useState<DrawingSubmissionWithQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const res = await fetch(`/api/drawing/submissions/my?${params}`, {
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

  useEffect(() => { fetchSubmissions(); }, [fetchSubmissions]);

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push('/student/drawings')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700}>My Submissions</Typography>
      </Box>

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
        Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} height={80} sx={{ mb: 1 }} />)
      ) : submissions.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography color="text.secondary">No submissions yet</Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {submissions.map((s) => (
            <Paper
              key={s.id}
              variant="outlined"
              sx={{ p: 1.5, cursor: 'pointer' }}
              onClick={() => router.push(`/student/drawings/submissions/${s.id}`)}
            >
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box
                  component="img"
                  src={s.original_image_url}
                  alt="Drawing"
                  sx={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 1 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                    {s.question && <CategoryBadge category={s.question.category} />}
                    <Chip
                      label={s.status}
                      size="small"
                      color={s.status === 'reviewed' ? 'success' : 'warning'}
                    />
                  </Box>
                  <Typography variant="body2" sx={{
                    display: '-webkit-box', WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical', overflow: 'hidden', fontSize: '0.82rem',
                  }}>
                    {s.question?.question_text || 'Free Practice'}
                  </Typography>
                  {s.tutor_rating && (
                    <Typography variant="caption">
                      {'★'.repeat(s.tutor_rating)}{'☆'.repeat(5 - s.tutor_rating)}
                    </Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">
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
