'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  MenuItem,
  TextField,
  Skeleton,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import PageHeader from '@/components/PageHeader';
import StudentScoresTable from '@/components/foundation/StudentScoresTable';

interface ChapterOption {
  id: string;
  title: string;
  chapter_number: number;
}

export default function FoundationScoresPage() {
  const { getToken, loading: authLoading } = useNexusAuthContext();
  const [chapters, setChapters] = useState<ChapterOption[]>([]);
  const [selectedChapter, setSelectedChapter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const fetchChapters = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/foundation/admin/chapters', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const chapterList = (data || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          chapter_number: c.chapter_number,
        }));
        setChapters(chapterList);
        if (chapterList.length > 0 && !selectedChapter) {
          setSelectedChapter(chapterList[0].id);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [getToken, selectedChapter]);

  useEffect(() => {
    if (!authLoading) fetchChapters();
  }, [authLoading, fetchChapters]);

  const selected = chapters.find(c => c.id === selectedChapter);

  return (
    <Box>
      <PageHeader
        title="Foundation Scores"
        subtitle="View student quiz scores across all foundation chapters"
      />

      {/* Chapter selector */}
      <Box sx={{ mb: 3, maxWidth: 400 }}>
        {loading ? (
          <Skeleton variant="rectangular" height={48} sx={{ borderRadius: 1 }} />
        ) : (
          <TextField
            select
            fullWidth
            size="small"
            label="Select Chapter"
            value={selectedChapter}
            onChange={(e) => setSelectedChapter(e.target.value)}
            sx={{
              '& .MuiOutlinedInput-root': { borderRadius: 2 },
            }}
          >
            {chapters.map((ch) => (
              <MenuItem key={ch.id} value={ch.id}>
                Chapter {ch.chapter_number}: {ch.title}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      {/* Scores table */}
      {selectedChapter && (
        <StudentScoresTable
          chapterId={selectedChapter}
          chapterNumber={selected?.chapter_number}
          getToken={getToken}
        />
      )}

      {!selectedChapter && !loading && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 6 }}>
          Select a chapter to view student scores.
        </Typography>
      )}
    </Box>
  );
}
