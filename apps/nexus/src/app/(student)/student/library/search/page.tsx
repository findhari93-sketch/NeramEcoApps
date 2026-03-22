'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ClearIcon from '@mui/icons-material/Clear';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import type { LibraryVideo } from '@neram/database/types';

export default function SearchPage() {
  const theme = useTheme();
  const router = useRouter();
  const { getToken } = useNexusAuthContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [results, setResults] = useState<LibraryVideo[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Auto-focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Debounce query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Search on debounced query change
  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setTotalCount(0);
      setSearched(false);
      return;
    }

    let cancelled = false;

    async function performSearch() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams();
        params.set('search', debouncedQuery);
        params.set('limit', '30');

        const res = await fetch(`/api/library/videos?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) throw new Error('Search failed');

        const data = await res.json();
        if (!cancelled) {
          setResults(data.videos || []);
          setTotalCount(data.total || 0);
          setSearched(true);
        }

        // Log search
        logSearch(token, debouncedQuery, data.total || 0);
      } catch (err) {
        console.error('Search error:', err);
        if (!cancelled) setSearched(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    performSearch();
    return () => { cancelled = true; };
  }, [debouncedQuery, getToken]);

  const logSearch = useCallback(
    async (token: string, queryText: string, resultsCount: number) => {
      try {
        await fetch('/api/library/search-log', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query_text: queryText,
            results_count: resultsCount,
          }),
        });
      } catch {
        // Silently fail search logging
      }
    },
    []
  );

  return (
    <Box sx={{ pb: 10 }}>
      {/* Header with search bar */}
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

        <TextField
          inputRef={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search videos..."
          size="small"
          fullWidth
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ color: theme.palette.text.secondary, fontSize: 20 }} />
              </InputAdornment>
            ),
            endAdornment: query ? (
              <InputAdornment position="end">
                <IconButton
                  size="small"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                >
                  <ClearIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              '& fieldset': { border: 'none' },
              '&:hover fieldset': { border: 'none' },
              '&.Mui-focused fieldset': {
                border: `2px solid ${theme.palette.primary.main}`,
              },
              minHeight: 44,
            },
          }}
        />
      </Box>

      {/* Results count */}
      {searched && !loading && (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 0.75 }}>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
            {totalCount} result{totalCount !== 1 ? 's' : ''} for &quot;{debouncedQuery}&quot;
          </Typography>
        </Box>
      )}

      {/* Loading skeletons */}
      {loading && (
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
            mt: 1,
          }}
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </Box>
      )}

      {/* Results grid */}
      {!loading && results.length > 0 && (
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
            mt: 1,
          }}
        >
          {results.map((video) => (
            <VideoCard key={video.id} video={video} fullWidth />
          ))}
        </Box>
      )}

      {/* No results */}
      {searched && !loading && results.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
          <Typography
            variant="h6"
            sx={{
              color: theme.palette.text.secondary,
              fontWeight: 600,
              mb: 1,
              fontSize: '1.1rem',
            }}
          >
            No results found
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            Try a different search term or browse categories.
          </Typography>
        </Box>
      )}

      {/* Empty state before search */}
      {!searched && !loading && (
        <Box sx={{ textAlign: 'center', py: 8, px: 3 }}>
          <SearchIcon
            sx={{
              fontSize: 48,
              color: alpha(theme.palette.text.secondary, 0.3),
              mb: 2,
            }}
          />
          <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
            Search for videos by title, topic, or category.
          </Typography>
        </Box>
      )}
    </Box>
  );
}
