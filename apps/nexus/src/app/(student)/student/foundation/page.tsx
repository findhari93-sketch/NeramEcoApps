'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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

export default function FoundationChapterList() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const [chapters, setChapters] = useState<NexusFoundationChapterWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/foundation/chapters', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setChapters(data.chapters || []);
      }
    } catch (err) {
      console.error('Failed to load foundation chapters:', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => {
    if (!authLoading) fetchChapters();
  }, [authLoading, fetchChapters]);

  const completedCount = chapters.filter((_, i) => getEffectiveStatus(chapters, i) === 'completed').length;

  return (
    <Box>
      <PageHeader
        title="Foundation Module"
        subtitle="Complete all 10 chapters to build your architectural knowledge"
      />

      {/* Overall Progress */}
      {!loading && chapters.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <FoundationProgressBar
            completed={completedCount}
            total={chapters.length}
            label="Overall Progress"
          />
        </Box>
      )}

      {/* Chapter List */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton
                key={i}
                variant="rectangular"
                height={100}
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
                  onClick={() => {
                    if (effectiveStatus !== 'locked') {
                      router.push(`/student/foundation/${chapter.id}`);
                    }
                  }}
                />
              );
            })}
      </Box>

      {!loading && chapters.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            py: 6,
            px: 2,
          }}
        >
          <Typography variant="h6" sx={{ color: 'text.secondary', mb: 1 }}>
            No chapters available yet
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.disabled' }}>
            Foundation chapters will appear here once published.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
