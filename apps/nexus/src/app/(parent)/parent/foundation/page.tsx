'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Skeleton, alpha, useTheme } from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import ChapterCard from '@/components/foundation/ChapterCard';
import FoundationProgressBar from '@/components/foundation/ProgressBar';
import type { NexusFoundationChapterWithProgress, FoundationChapterStatus } from '@neram/database/types';

function getEffectiveStatus(
  chapters: NexusFoundationChapterWithProgress[],
  index: number
): FoundationChapterStatus {
  const chapter = chapters[index];
  if (chapter.progress?.status === 'completed') return 'completed';
  if (chapter.progress?.status === 'in_progress') return 'in_progress';
  if (index === 0) return 'in_progress';
  const prevStatus = getEffectiveStatus(chapters, index - 1);
  return prevStatus === 'completed' ? 'in_progress' : 'locked';
}

export default function ParentFoundationView() {
  const theme = useTheme();
  const { user, getToken, loading: authLoading } = useNexusAuthContext();
  const [chapters, setChapters] = useState<NexusFoundationChapterWithProgress[]>([]);
  const [studentName, setStudentName] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      // Get linked student ID from parent links
      const supabaseRes = await fetch('/api/parent/progress', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!supabaseRes.ok) {
        setLoading(false);
        return;
      }

      const parentData = await supabaseRes.json();
      const studentId = parentData.student?.id;
      if (!studentId) {
        setLoading(false);
        return;
      }

      setStudentName(parentData.student?.name || 'Your Child');

      // Fetch student's foundation progress
      const res = await fetch(`/api/foundation/student/${studentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters || []);
      }
    } catch (err) {
      console.error('Failed to load foundation progress:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchProgress();
  }, [authLoading, fetchProgress]);

  const completedCount = chapters.filter((_, i) => getEffectiveStatus(chapters, i) === 'completed').length;

  return (
    <Box>
      <PageHeader
        title="Foundation Progress"
        subtitle={studentName ? `${studentName}'s learning journey` : 'Self-paced learning progress'}
      />

      {/* Overall Progress */}
      {!loading && chapters.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <FoundationProgressBar
            completed={completedCount}
            total={chapters.length}
            label="Chapters completed"
          />
        </Box>
      )}

      {/* Chapter List (read-only, no navigation) */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={80}
                sx={{ borderRadius: 3 }}
              />
            ))
          : chapters.map((chapter, index) => {
              const effectiveStatus = getEffectiveStatus(chapters, index);
              return (
                <ChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  effectiveStatus={effectiveStatus}
                  delay={index * 50}
                  // No onClick for parents - read-only view
                />
              );
            })}
      </Box>

      {!loading && chapters.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No progress data available
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            Foundation progress will appear here once your child starts the module.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
