'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Skeleton,
  IconButton,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import DrillWidget from '@/components/course-plan/DrillWidget';

interface DrillQuestion {
  id: string;
  question: string;
  answer: string;
  explanation?: string | null;
  frequency?: number | null;
  category?: string | null;
  progress?: { mastered: boolean } | null;
}

export default function StudentDrillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const { getToken, loading: authLoading } = useNexusAuthContext();

  const [questions, setQuestions] = useState<DrillQuestion[]>([]);
  const [progress, setProgress] = useState<DrillQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDrill = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const [drillRes, progressRes] = await Promise.all([
        fetch(`/api/course-plans/${planId}/drill`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/course-plans/${planId}/drill/progress`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (drillRes.ok) {
        const data = await drillRes.json();
        setQuestions(data.drills || []);
      }
      if (progressRes.ok) {
        const data = await progressRes.json();
        setProgress(data.progress || []);
      }
    } catch (err) {
      console.error('Failed to load drill:', err);
    } finally {
      setLoading(false);
    }
  }, [planId, getToken]);

  useEffect(() => {
    if (!authLoading) fetchDrill();
  }, [authLoading, fetchDrill]);

  const handleProgressUpdate = useCallback(() => {
    // Silently refetch progress in background
    if (!planId) return;
    getToken().then((token) => {
      if (!token) return;
      fetch(`/api/course-plans/${planId}/drill/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setProgress(data.progress || []))
        .catch(() => {});
    });
  }, [planId, getToken]);

  if (loading) {
    return (
      <Box>
        <Skeleton variant="rounded" height={32} width={250} sx={{ mb: 2, borderRadius: 2 }} />
        <Skeleton variant="rounded" height={8} sx={{ mb: 3, borderRadius: 4 }} />
        <Skeleton variant="rounded" height={280} sx={{ borderRadius: 3 }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <IconButton onClick={() => router.back()} size="small" sx={{ mr: 0.5 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Quick Drill
        </Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, pl: 5.5 }}>
        These questions appeared 3+ times in past exams. Master them for free marks!
      </Typography>

      {planId && (
        <DrillWidget
          questions={questions}
          progress={progress}
          planId={planId}
          onProgressUpdate={handleProgressUpdate}
          getToken={getToken}
        />
      )}
    </Box>
  );
}
