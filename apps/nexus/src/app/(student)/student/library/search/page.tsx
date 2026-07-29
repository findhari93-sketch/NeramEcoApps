'use client';

/**
 * Library search results.
 *
 * Runs against /api/library/search, which is the ranked RPC: weighted full text,
 * canonical topic expansion (so "vanishing point" returns every perspective
 * class), and a typo fallback.
 *
 * The screen says why it matched. A fuzzy result set is a guess, and telling the
 * student "nothing matched exactly, here is what is close" is more useful than
 * silently showing near misses as if they were hits.
 */

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Chip,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ClearIcon from '@mui/icons-material/Clear';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import VideoCard, { VideoCardSkeleton } from '@/components/library/VideoCard';
import type { LibraryMatchKind, LibrarySearchResult, LibraryTopicCount } from '@neram/database/types';

function SearchPageInner() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useNexusAuthContext();
  const inputRef = useRef<HTMLInputElement>(null);

  const initialQuery = searchParams.get('q') || '';
  const exam = searchParams.get('exam') || '';
  const language = searchParams.get('language') || '';

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [matchKind, setMatchKind] = useState<LibraryMatchKind | null>(null);
  const [matchedTopics, setMatchedTopics] = useState<string[]>([]);
  const [topics, setTopics] = useState<LibraryTopicCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Skip the autofocus when arriving with a query already set: the keyboard
    // popping up over the results a student came to read is the wrong move.
    if (initialQuery) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [initialQuery]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const logSearch = useCallback(async (token: string, queryText: string, resultsCount: number) => {
    try {
      await fetch('/api/library/search-log', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query_text: queryText, results_count: resultsCount }),
      });
    } catch {
      // Search logging is analytics; never let it interrupt the search.
    }
  }, []);

  // Popular topics, used for the empty state and the nothing-found state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch('/api/library/home', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTopics(data.topics || []);
      } catch {
        // Chips are a nicety, not a requirement.
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([]);
      setTotalCount(0);
      setMatchKind(null);
      setSearched(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const token = await getToken();
        if (cancelled) return;
        // No token is a failure, not "no results". Returning early here used to
        // leave `searched` false, so a student who typed a query sat looking at
        // the "search for something" prompt with no idea anything had gone wrong.
        if (!token) throw new Error('Not signed in');

        const params = new URLSearchParams({ q: debouncedQuery, limit: '30' });
        if (exam) params.set('exam', exam);
        if (language) params.set('language', language);

        const res = await fetch(`/api/library/search?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Search failed');

        const data = await res.json();
        if (cancelled) return;
        setResults(data.data || []);
        setTotalCount(data.total || 0);
        setMatchKind(data.matchKind || null);
        setMatchedTopics(data.matchedTopics || []);
        setSearched(true);
        void logSearch(token, debouncedQuery, data.total || 0);
      } catch (err) {
        console.error('Search error:', err);
        if (!cancelled) {
          setResults([]);
          setTotalCount(0);
          setFailed(true);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQuery, exam, language, getToken, logSearch]);

  const gridSx = {
    px: { xs: 2, sm: 3 },
    display: 'grid',
    gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
    gap: { xs: 1.5, sm: 2 },
    mt: 1,
  } as const;

  const topicChips = (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mt: 2 }}>
      {topics.slice(0, 10).map((t) => (
        <Chip
          key={t.topic}
          label={t.topic}
          onClick={() => setQuery(t.topic)}
          variant="outlined"
          sx={{ height: 34, fontWeight: 600 }}
        />
      ))}
    </Box>
  );

  return (
    <Box sx={{ pb: 10 }}>
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
        <IconButton onClick={() => router.back()} aria-label="Back" sx={{ width: 44, height: 44 }}>
          <ArrowBackIcon />
        </IconButton>

        <TextField
          inputRef={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a topic, like perspective"
          size="small"
          fullWidth
          inputProps={{ 'aria-label': 'Search the class library', enterKeyHint: 'search' }}
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
                  aria-label="Clear search"
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
            '& .MuiInputBase-input': { fontSize: 16 },
            '& .MuiOutlinedInput-root': {
              borderRadius: 3,
              bgcolor: alpha(theme.palette.text.primary, 0.04),
              '& fieldset': { border: 'none' },
              '&:hover fieldset': { border: 'none' },
              '&.Mui-focused fieldset': { border: `2px solid ${theme.palette.primary.main}` },
              minHeight: 44,
            },
          }}
        />
      </Box>

      {searched && !loading && results.length > 0 && (
        <Box sx={{ px: { xs: 2, sm: 3 }, py: 0.75 }}>
          {matchKind === 'fuzzy' ? (
            <Typography variant="body2" sx={{ color: theme.palette.warning.dark, fontWeight: 500 }}>
              Nothing matched &quot;{debouncedQuery}&quot; exactly. Here is what comes closest.
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ color: theme.palette.text.secondary, fontWeight: 500 }}>
                {totalCount} result{totalCount !== 1 ? 's' : ''} for &quot;{debouncedQuery}&quot;
              </Typography>
              {/* Says which canonical topic the query resolved to, so a student
                  who typed "vanishing point" can see it found Perspective. */}
              {matchedTopics.slice(0, 3).map((t) => (
                <Chip key={t} label={t} size="small" color="primary" variant="outlined" />
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Also skeletons while a query is present but the first search has not
          landed yet, so arriving with ?q= never flashes the "type something"
          prompt at a student who already typed something. */}
      {(loading || (!!debouncedQuery && !searched)) && (
        <Box sx={gridSx}>
          {Array.from({ length: 6 }).map((_, i) => <VideoCardSkeleton key={i} />)}
        </Box>
      )}

      {!loading && results.length > 0 && (
        <Box sx={gridSx}>
          {results.map((video) => (
            <VideoCard key={video.id} video={video} fullWidth />
          ))}
        </Box>
      )}

      {searched && !loading && results.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, fontSize: '1.1rem' }}>
            {failed ? 'Could not search just now' : `Nothing found for "${debouncedQuery}"`}
          </Typography>
          <Typography variant="body2" sx={{ color: theme.palette.text.secondary }}>
            {failed ? 'Check your connection and try again.' : 'Try one of these instead.'}
          </Typography>
          {!failed && topicChips}
        </Box>
      )}

      {!searched && !loading && !debouncedQuery && (
        <Box sx={{ textAlign: 'center', py: 6, px: 3 }}>
          <SearchIcon
            sx={{ fontSize: 48, color: alpha(theme.palette.text.secondary, 0.3), mb: 1 }}
          />
          <Typography variant="body1" sx={{ color: theme.palette.text.secondary }}>
            Search by topic, or pick one below.
          </Typography>
          {topicChips}
        </Box>
      )}
    </Box>
  );
}

export default function SearchPage() {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <SearchPageInner />
    </Suspense>
  );
}
