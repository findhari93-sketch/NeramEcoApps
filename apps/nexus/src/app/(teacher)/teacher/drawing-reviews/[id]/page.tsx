'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, IconButton, Skeleton, Typography } from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrawingReviewPanel from '@/components/drawings/DrawingReviewPanel';
import type { DrawingSubmissionWithDetails } from '@neram/database/types';

export default function DrawingReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const [submission, setSubmission] = useState<DrawingSubmissionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/drawing/submissions/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setSubmission(data.submission || null);
    } catch {
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  }, [getToken, id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <Box sx={{ p: 2 }}><Skeleton height={400} /></Box>;
  if (!submission) return <Box sx={{ p: 2 }}><Typography color="text.secondary">Submission not found</Typography></Box>;

  return (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: 2, maxWidth: 800, mx: 'auto' }}>
      <IconButton onClick={() => router.push('/teacher/drawing-reviews')} sx={{ mb: 1 }}>
        <ArrowBackIcon />
      </IconButton>

      <DrawingReviewPanel
        submission={submission}
        getToken={getToken}
        onReviewSaved={() => router.push('/teacher/drawing-reviews')}
      />
    </Box>
  );
}
