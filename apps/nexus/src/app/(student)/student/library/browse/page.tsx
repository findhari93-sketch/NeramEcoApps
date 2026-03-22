'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Button,
  Skeleton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  useTheme,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import type { LibraryVideo } from '@neram/database/types';

const CATEGORIES = [
  { key: '', label: 'All' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'aptitude', label: 'Aptitude' },
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'general_knowledge', label: 'General Knowledge' },
  { key: 'exam_preparation', label: 'Exam Preparation' },
  { key: 'orientation', label: 'Orientation' },
];

const EXAM_OPTIONS = [
  { key: '', label: 'All Exams' },
  { key: 'nata', label: 'NATA' },
  { key: 'jee_barch', label: 'JEE B.Arch' },
  { key: 'both', label: 'Both' },
  { key: 'general', label: 'General' },
];

const LANGUAGE_OPTIONS = [
  { key: '', label: 'All Languages' },
  { key: 'ta', label: 'Tamil' },
  { key: 'en', label: 'English' },
  { key: 'ta_en', label: 'Tamil + English' },
];

const DIFFICULTY_OPTIONS = [
  { key: '', label: 'All Levels' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
  { key: 'mixed', label: 'Mixed' },
];

const SORT_OPTIONS = [
  { key: 'published_at', label: 'Newest' },
  { key: 'view_count', label: 'Most Watched' },
  { key: 'duration_seconds', label: 'Duration' },
];

function BrowseContent() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useNexusAuthContext();

  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [exam, setExam] = useState(searchParams.get('exam') || '');
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [difficulty, setDifficulty] = useState(searchParams.get('difficulty') || '');
  const [sortBy, setSortBy] = useState<string>('published_at');
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const fetchVideos = useCallback(
    async (resetOffset = true) => {
      const currentOffset = resetOffset ? 0 : offset;
      if (resetOffset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      try {
        const token = await getToken();
        if (!token) return;

        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (exam) params.set('exam', exam);
        if (language) params.set('language', language);
        if (difficulty) params.set('difficulty', difficulty);
        params.set('sortBy', sortBy);
        params.set('sortOrder', sortBy === 'published_at' ? 'desc' : 'desc');
        params.set('limit', String(LIMIT));
        params.set('offset', String(currentOffset));

        const res = await fetch(`/api/library/videos?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Failed to fetch');

        const data = await res.json();
        if (resetOffset) {
          setVideos(data.videos || []);
        } else {
          setVideos((prev) => [...prev, ...(data.videos || [])]);
        }
        setTotalCount(data.total || 0);
      } catch (err) {
        console.error('Browse fetch error:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, exam, language, difficulty, sortBy, offset, getToken]
  );

  // Fetch on filter change
  useEffect(() => {
    fetchVideos(true);
  }, [category, exam, language, difficulty, sortBy]);

  const handleLoadMore = () => {
    const newOffset = offset + LIMIT;
    setOffset(newOffset);
  };

  // Trigger fetch when offset changes (not on initial)
  useEffect(() => {
    if (offset > 0) {
      fetchVideos(false);
    }
  }, [offset]);

  const hasMore = videos.length < totalCount;

  return (
    <Box sx={{ pb: 10 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: { xs: 1, sm: 3 },
          pt: { xs: 1, sm: 2 },
          pb: 1,
          gap: 1,
        }}
      >
        <IconButton onClick={() => router.back()} sx={{ width: 44, height: 44 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.3rem' } }}>
          Browse Videos
        </Typography>
      </Box>

      {/* Category chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          px: { xs: 2, sm: 3 },
          pb: 1,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat.key}
            label={cat.label}
            onClick={() => setCategory(cat.key)}
            variant={category === cat.key ? 'filled' : 'outlined'}
            color={category === cat.key ? 'primary' : 'default'}
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              height: 34,
              flexShrink: 0,
              borderRadius: 2,
            }}
          />
        ))}
      </Box>

      {/* Sub-filter chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 0.75,
          px: { xs: 2, sm: 3 },
          py: 0.75,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {EXAM_OPTIONS.map((opt) => (
          <Chip
            key={`e-${opt.key}`}
            label={opt.label}
            onClick={() => setExam(opt.key)}
            variant={exam === opt.key ? 'filled' : 'outlined'}
            color={exam === opt.key ? 'secondary' : 'default'}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.75rem', height: 28, flexShrink: 0, borderRadius: 1.5 }}
          />
        ))}

        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: theme.palette.divider, alignSelf: 'center', flexShrink: 0 }} />

        {LANGUAGE_OPTIONS.map((opt) => (
          <Chip
            key={`l-${opt.key}`}
            label={opt.label}
            onClick={() => setLanguage(opt.key)}
            variant={language === opt.key ? 'filled' : 'outlined'}
            color={language === opt.key ? 'secondary' : 'default'}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.75rem', height: 28, flexShrink: 0, borderRadius: 1.5 }}
          />
        ))}

        <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: theme.palette.divider, alignSelf: 'center', flexShrink: 0 }} />

        {DIFFICULTY_OPTIONS.map((opt) => (
          <Chip
            key={`d-${opt.key}`}
            label={opt.label}
            onClick={() => setDifficulty(opt.key)}
            variant={difficulty === opt.key ? 'filled' : 'outlined'}
            color={difficulty === opt.key ? 'secondary' : 'default'}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.75rem', height: 28, flexShrink: 0, borderRadius: 1.5 }}
          />
        ))}
      </Box>

      {/* Sort + count row */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3 },
          py: 1,
        }}
      >
        <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
          {loading ? (
            <Skeleton width={80} sx={{ display: 'inline-block' }} />
          ) : (
            `${totalCount} video${totalCount !== 1 ? 's' : ''}`
          )}
        </Typography>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sort by</InputLabel>
          <Select
            value={sortBy}
            label="Sort by"
            onChange={(e) => setSortBy(e.target.value)}
            sx={{ borderRadius: 2, fontSize: '0.85rem' }}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem key={opt.key} value={opt.key}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Video Grid */}
      <Box
        sx={{
          px: { xs: 2, sm: 3 },
          display: 'grid',
          gridTemplateColumns: {
            xs: 'repeat(2, 1fr)',
            sm: 'repeat(3, 1fr)',
            md: 'repeat(4, 1fr)',
          },
          gap: { xs: 1.5, sm: 2 },
        }}
      >
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <VideoCardSkeleton key={i} />
            ))
          : videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                fullWidth
                onClick={() => router.push(`/student/library/${video.id}`)}
              />
            ))}
      </Box>

      {/* Empty state */}
      {!loading && videos.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
          <Typography variant="body1" sx={{ color: theme.palette.text.secondary, mb: 1 }}>
            No videos found matching your filters.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              setCategory('');
              setExam('');
              setLanguage('');
              setDifficulty('');
            }}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            Clear all filters
          </Button>
        </Box>
      )}

      {/* Load more */}
      {!loading && hasMore && (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Button
            variant="outlined"
            onClick={handleLoadMore}
            disabled={loadingMore}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              borderRadius: 2,
              minHeight: 44,
              px: 4,
            }}
          >
            {loadingMore ? 'Loading...' : 'Load More'}
          </Button>
        </Box>
      )}
    </Box>
  );
}

export default function BrowsePage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ p: 3 }}>
          <Skeleton variant="text" width={200} height={32} />
          <Box sx={{ display: 'flex', gap: 1, mt: 2, overflow: 'hidden' }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" width={80} height={34} sx={{ borderRadius: 2 }} />
            ))}
          </Box>
        </Box>
      }
    >
      <BrowseContent />
    </Suspense>
  );
}
