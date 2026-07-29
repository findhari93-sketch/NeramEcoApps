'use client';

/**
 * The Class Library home.
 *
 * Search is the point of this screen, so it gets a real field at the top rather
 * than an icon in the corner, and the topics students actually have classes for
 * sit right under it as one-tap chips. Everything below that is browsing.
 *
 * The category rows come from a single /api/library/home call. They used to
 * fetch themselves, one request per row, which meant six function invocations
 * on first paint of the most visited student screen for data identical to every
 * student.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Chip,
  InputAdornment,
  Skeleton,
  Button,
  TextField,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import { useRouter } from 'next/navigation';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import ContinueWatchingRow from '@/components/library/ContinueWatchingRow';
import VideoRow from '@/components/library/VideoRow';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import CollectionCard, { CollectionCardSkeleton } from '@/components/library/CollectionCard';
import type { LibraryCollection, LibraryVideo, LibraryTopicCount } from '@neram/database/types';

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

interface HomeSection {
  key: string;
  label: string;
  videos: LibraryVideo[];
}

const PAGE_SIZE = 20;

export default function LibraryHomePage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  const [query, setQuery] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');

  const [sections, setSections] = useState<HomeSection[]>([]);
  const [topics, setTopics] = useState<LibraryTopicCount[]>([]);
  const [homeLoading, setHomeLoading] = useState(true);

  const [collections, setCollections] = useState<LibraryCollection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);

  const [allVideos, setAllVideos] = useState<LibraryVideo[]>([]);
  const [allVideosLoading, setAllVideosLoading] = useState(true);
  const [allVideosTotal, setAllVideosTotal] = useState(0);
  const [allVideosPage, setAllVideosPage] = useState(0);

  const goToSearch = useCallback(
    (q: string) => {
      const params = new URLSearchParams({ q });
      if (selectedExam) params.set('exam', selectedExam);
      if (selectedLanguage) params.set('language', selectedLanguage);
      router.push(`/student/library/search?${params.toString()}`);
    },
    [router, selectedExam, selectedLanguage],
  );

  /**
   * Changing a filter resets the paged grid here, in the handler, rather than in
   * an effect. With two effects both watching the filters, the fetch fired with
   * the stale offset before the reset landed, so page 2 of the old filter got
   * appended to page 1 of the new one.
   */
  const applyFilter = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setAllVideosPage(0);
    setAllVideos([]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/library/home', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to load the library');
        const data = await res.json();
        if (cancelled) return;
        setSections(data.sections || []);
        setTopics(data.topics || []);
      } catch (err) {
        console.error('Library home fetch error:', err);
      } finally {
        if (!cancelled) setHomeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAllVideosLoading(true);
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
        if (cancelled) return;
        setAllVideos((prev) =>
          allVideosPage === 0 ? data.videos || [] : [...prev, ...(data.videos || [])]);
        setAllVideosTotal(data.total || 0);
      } catch (err) {
        console.error('All videos fetch error:', err);
      } finally {
        if (!cancelled) setAllVideosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken, allVideosPage, selectedExam, selectedLanguage]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const chipSx = {
    fontWeight: 600,
    fontSize: '0.8rem',
    height: 34,
    flexShrink: 0,
    borderRadius: 2,
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 3 } }}>
        <Typography
          variant="h5"
          sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', sm: '1.5rem' }, mb: 1.5 }}
        >
          Class Library
        </Typography>

        <TextField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && query.trim()) goToSearch(query.trim());
          }}
          fullWidth
          placeholder="Search a topic, like perspective or series"
          inputProps={{ 'aria-label': 'Search the class library', enterKeyHint: 'search' }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            sx: { borderRadius: 3, bgcolor: alpha(theme.palette.text.primary, 0.04) },
          }}
          // 16px keeps iOS from zooming the page when the field takes focus.
          sx={{ '& .MuiInputBase-input': { fontSize: 16, minHeight: 28 } }}
        />
      </Box>

      {/* One-tap topics. Only topics with published classes behind them, so a
          chip never leads to an empty result. */}
      {topics.length > 0 && (
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            px: { xs: 2, sm: 3 },
            pt: 1.5,
            overflowX: 'auto',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          {topics.map((t) => (
            <Chip
              key={t.topic}
              label={t.topic}
              onClick={() => goToSearch(t.topic)}
              variant="outlined"
              sx={chipSx}
            />
          ))}
        </Box>
      )}

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
        {EXAM_OPTIONS.map((opt) => (
          <Chip
            key={`exam-${opt.key}`}
            label={opt.label}
            onClick={() => applyFilter(setSelectedExam, opt.key === selectedExam ? '' : opt.key)}
            variant={selectedExam === opt.key ? 'filled' : 'outlined'}
            color={selectedExam === opt.key ? 'primary' : 'default'}
            sx={chipSx}
          />
        ))}

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

        {LANGUAGE_OPTIONS.map((opt) => (
          <Chip
            key={`lang-${opt.key}`}
            label={opt.label}
            onClick={() =>
              applyFilter(setSelectedLanguage, opt.key === selectedLanguage ? '' : opt.key)}
            variant={selectedLanguage === opt.key ? 'filled' : 'outlined'}
            color={selectedLanguage === opt.key ? 'primary' : 'default'}
            sx={chipSx}
          />
        ))}
      </Box>

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
            sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, minHeight: 44 }}
          >
            Browse filtered videos
          </Button>
        </Box>
      )}

      <Box sx={{ mt: 1, px: { xs: 0, sm: 3 } }}>
        <ContinueWatchingRow />

        {homeLoading
          ? [0, 1].map((i) => (
              <Box key={i} sx={{ mb: 3, px: { xs: 2, sm: 0 } }}>
                <Skeleton variant="text" sx={{ width: 160, mb: 1.5 }} />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  {Array.from({ length: 4 }).map((_, j) => <VideoCardSkeleton key={j} />)}
                </Box>
              </Box>
            ))
          : sections.map((section) => (
              <VideoRow
                key={section.key}
                title={section.label}
                videos={section.videos}
                seeAllHref={`/student/library/browse?category=${section.key}`}
              />
            ))}

        <Box sx={{ mb: 3, px: { xs: 2, sm: 0 } }}>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.1rem' }, mb: 1.5 }}
          >
            {selectedExam || selectedLanguage ? 'Filtered Videos' : 'All Recordings'}
            {allVideosTotal > 0 && (
              <Typography
                component="span"
                sx={{ fontWeight: 400, fontSize: '0.85rem', color: 'text.secondary', ml: 1 }}
              >
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
              : allVideos.map((video) => <VideoCard key={video.id} video={video} fullWidth />)}
          </Box>

          {!allVideosLoading && allVideos.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
              No recordings match those filters yet. Clear a filter to see everything.
            </Typography>
          )}

          {allVideos.length > 0 && allVideos.length < allVideosTotal && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                variant="outlined"
                onClick={() => setAllVideosPage((p) => p + 1)}
                disabled={allVideosLoading}
                sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2, px: 4, minHeight: 44 }}
              >
                {allVideosLoading
                  ? 'Loading...'
                  : `Load More (${allVideosTotal - allVideos.length} remaining)`}
              </Button>
            </Box>
          )}
        </Box>

        {(collectionsLoading || collections.length > 0) && (
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1rem', sm: '1.1rem' },
                mb: 1.5,
                px: { xs: 2, sm: 0 },
              }}
            >
              Collections
            </Typography>

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
                ? Array.from({ length: 3 }).map((_, i) => <CollectionCardSkeleton key={i} />)
                : collections.map((col) => <CollectionCard key={col.id} collection={col} />)}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
