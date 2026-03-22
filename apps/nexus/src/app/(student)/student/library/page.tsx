'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Skeleton,
  Button,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ContinueWatchingRow from '@/components/library/ContinueWatchingRow';
import CategoryRow from '@/components/library/CategoryRow';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import CollectionCard, { CollectionCardSkeleton } from '@/components/library/CollectionCard';
import type { LibraryCollection, LibraryVideo } from '@neram/database/types';

const CATEGORIES = [
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

export default function LibraryHomePage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [selectedExam, setSelectedExam] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [collections, setCollections] = useState<LibraryCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [allVideos, setAllVideos] = useState<LibraryVideo[]>([]);
  const [allVideosLoading, setAllVideosLoading] = useState(true);
  const [allVideosTotal, setAllVideosTotal] = useState(0);
  const [allVideosPage, setAllVideosPage] = useState(0);
  const PAGE_SIZE = 20;

  // Fetch all videos (no category filter)
  useEffect(() => {
    let cancelled = false;

    async function fetchAllVideos() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams({
          limit: String(PAGE_SIZE),
          offset: String(allVideosPage * PAGE_SIZE),
        });
        if (selectedExam) params.set('exam', selectedExam);
        if (selectedLanguage) params.set('language', selectedLanguage);

        const res = await fetch(`/api/library/videos?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (!cancelled) {
          setAllVideos(prev => allVideosPage === 0 ? (data.videos || []) : [...prev, ...(data.videos || [])]);
          setAllVideosTotal(data.total || 0);
        }
      } catch (err) {
        console.error('All videos fetch error:', err);
      } finally {
        if (!cancelled) setAllVideosLoading(false);
      }
    }

    setAllVideosLoading(true);
    fetchAllVideos();
    return () => { cancelled = true; };
  }, [getToken, allVideosPage, selectedExam, selectedLanguage]);

  // Reset page when filters change
  useEffect(() => {
    setAllVideosPage(0);
    setAllVideos([]);
  }, [selectedExam, selectedLanguage]);

  // Fetch collections
  useEffect(() => {
    let cancelled = false;

    async function fetchCollections() {
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const res = await fetch('/api/library/collections', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch collections');
        const { data } = await res.json();
        if (!cancelled) setCollections(data || []);
      } catch (err) {
        console.error('Collections fetch error:', err);
      } finally {
        if (!cancelled) setCollectionsLoading(false);
      }
    }

    fetchCollections();
    return () => { cancelled = true; };
  }, [getToken]);

  // Build filtered category list based on selected filters
  const filteredCategories = CATEGORIES;

  return (
    <Box sx={{ pb: 10 }}>
      {/* Page Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: { xs: 2, sm: 3 },
          pt: { xs: 2, sm: 3 },
          pb: 1,
        }}
      >
        <Typography
          variant="h5"
          sx={{
            fontWeight: 800,
            fontSize: { xs: '1.3rem', sm: '1.5rem' },
          }}
        >
          Class Library
        </Typography>
        <IconButton
          onClick={() => router.push('/student/library/search')}
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            width: 44,
            height: 44,
            '&:hover': {
              bgcolor: alpha(theme.palette.primary.main, 0.15),
            },
          }}
        >
          <SearchIcon />
        </IconButton>
      </Box>

      {/* Filter Chips */}
      <Box
        sx={{
          display: 'flex',
          gap: 1,
          px: { xs: 2, sm: 3 },
          py: 1,
          overflowX: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {/* Exam filter chips */}
        {EXAM_OPTIONS.map((opt) => (
          <Chip
            key={`exam-${opt.key}`}
            label={opt.label}
            onClick={() => setSelectedExam(opt.key === selectedExam ? '' : opt.key)}
            variant={selectedExam === opt.key ? 'filled' : 'outlined'}
            color={selectedExam === opt.key ? 'primary' : 'default'}
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              height: 34,
              flexShrink: 0,
              borderRadius: 2,
            }}
          />
        ))}

        {/* Divider dot */}
        <Box
          sx={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            bgcolor: theme.palette.divider,
            alignSelf: 'center',
            flexShrink: 0,
          }}
        />

        {/* Language filter chips */}
        {LANGUAGE_OPTIONS.map((opt) => (
          <Chip
            key={`lang-${opt.key}`}
            label={opt.label}
            onClick={() => setSelectedLanguage(opt.key === selectedLanguage ? '' : opt.key)}
            variant={selectedLanguage === opt.key ? 'filled' : 'outlined'}
            color={selectedLanguage === opt.key ? 'primary' : 'default'}
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

      {/* Browse all button */}
      {(selectedExam || selectedLanguage) && (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => {
              const params = new URLSearchParams();
              if (selectedExam) params.set('exam', selectedExam);
              if (selectedLanguage) params.set('language', selectedLanguage);
              router.push(`/student/library/browse?${params.toString()}`);
            }}
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}
          >
            Browse filtered videos
          </Button>
        </Box>
      )}

      {/* Content area */}
      <Box sx={{ mt: 1, px: { xs: 0, sm: 3 } }}>
        {/* Continue Watching */}
        <ContinueWatchingRow />

        {/* Category Rows (shown when categories are populated) */}
        {filteredCategories.map((cat) => (
          <CategoryRow key={cat.key} title={cat.label} category={cat.key} />
        ))}

        {/* All Videos Grid */}
        <Box sx={{ mb: 3, px: { xs: 2, sm: 0 } }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' }, mb: 1.5 }}
          >
            {selectedExam || selectedLanguage ? 'Filtered Videos' : 'All Recordings'}
            {allVideosTotal > 0 && (
              <Typography component="span" sx={{ fontWeight: 400, fontSize: '0.85rem', color: 'text.secondary', ml: 1 }}>
                ({allVideosTotal})
              </Typography>
            )}
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
              gap: { xs: 1.5, sm: 2 },
            }}
          >
            {allVideosLoading && allVideos.length === 0
              ? Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
              : allVideos.map((video) => (
                  <VideoCard key={video.id} video={video} fullWidth />
                ))}
          </Box>

          {/* Load More */}
          {allVideos.length < allVideosTotal && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setAllVideosPage(p => p + 1)}
                disabled={allVideosLoading}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 4 }}
              >
                {allVideosLoading ? 'Loading...' : `Load More (${allVideosTotal - allVideos.length} remaining)`}
              </Button>
            </Box>
          )}
        </Box>

        {/* Collections */}
        {(collectionsLoading || collections.length > 0) && (
          <Box sx={{ mb: 3 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                mb: 1.5,
                px: { xs: 2, sm: 0 },
              }}
            >
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1rem', sm: '1.1rem' },
                }}
              >
                Collections
              </Typography>
            </Box>

            <Box
              sx={{
                display: 'flex',
                gap: 2,
                overflowX: 'auto',
                px: { xs: 2, sm: 0 },
                pb: 1,
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                '&::-webkit-scrollbar': { display: 'none' },
                scrollbarWidth: 'none',
              }}
            >
              {collectionsLoading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <CollectionCardSkeleton key={i} />
                  ))
                : collections.map((col) => (
                    <CollectionCard key={col.id} collection={col} />
                  ))}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
