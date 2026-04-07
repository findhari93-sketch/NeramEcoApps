'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Container, Typography, Grid, Button, Skeleton } from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import StatsBar from './StatsBar';
import FeaturedCarousel from './FeaturedCarousel';
import FilterBar from './FilterBar';
import ResultCard from './ResultCard';
import type { StudentResult } from '@neram/database';

const PAGE_SIZE = 12;

interface Filters {
  search: string;
  exam_type: string;
  year: string;
  college: string;
  sort: string;
}

interface FilterOptions {
  years: number[];
  colleges: string[];
  exam_types: string[];
}

const DEFAULT_FILTERS: Filters = {
  search: '',
  exam_type: '',
  year: '',
  college: '',
  sort: 'newest',
};

function parseUrlFilters(): Filters {
  if (typeof window === 'undefined') return { ...DEFAULT_FILTERS };
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get('search') || '',
    exam_type: params.get('exam_type') || '',
    year: params.get('year') || '',
    college: params.get('college') || '',
    sort: params.get('sort') || 'newest',
  };
}

function filtersToParams(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.exam_type) params.set('exam_type', filters.exam_type);
  if (filters.year) params.set('year', filters.year);
  if (filters.college) params.set('college', filters.college);
  if (filters.sort && filters.sort !== 'newest') params.set('sort', filters.sort);
  return params.toString();
}

export default function ResultsWall() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({
    years: [],
    colleges: [],
    exam_types: [],
  });
  const [offset, setOffset] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstMount = useRef(true);

  // Load initial filters from URL on mount
  useEffect(() => {
    const urlFilters = parseUrlFilters();
    setFilters(urlFilters);
  }, []);

  // Fetch filter options on mount
  useEffect(() => {
    async function fetchFilterOptions() {
      try {
        const res = await fetch('/api/student-results?filters=true');
        const json = await res.json();
        if (json.success) {
          setFilterOptions(json.data);
        }
      } catch {
        // Silently fail
      }
    }
    fetchFilterOptions();
  }, []);

  // Build query string for fetch
  const buildQueryString = useCallback(
    (f: Filters, currentOffset: number): string => {
      const params = new URLSearchParams();
      if (f.search) params.set('search', f.search);
      if (f.exam_type) params.set('exam_type', f.exam_type);
      if (f.year) params.set('year', f.year);
      if (f.college) params.set('college', f.college);
      if (f.sort) params.set('sort', f.sort);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(currentOffset));
      return params.toString();
    },
    []
  );

  // Fetch results (resets when filters change)
  const fetchResults = useCallback(
    async (f: Filters, append = false) => {
      const currentOffset = append ? offset + PAGE_SIZE : 0;
      if (!append) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      try {
        const qs = buildQueryString(f, append ? currentOffset : 0);
        const res = await fetch(`/api/student-results?${qs}`);
        const json = await res.json();
        if (json.success) {
          if (append) {
            setResults((prev) => [...prev, ...(json.data || [])]);
            setOffset(currentOffset);
          } else {
            setResults(json.data || []);
            setOffset(0);
          }
          setTotal(json.total || 0);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [buildQueryString, offset]
  );

  // Debounced fetch on filter change
  useEffect(() => {
    // Skip the very first render (we fetch once URL filters are loaded)
    if (isFirstMount.current) {
      isFirstMount.current = false;
      // Trigger initial fetch
      fetchResults(filters);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchResults(filters);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Update URL when filters change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const qs = filtersToParams(filters);
    const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [filters]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({ ...DEFAULT_FILTERS });
  }, []);

  const handleLoadMore = useCallback(() => {
    fetchResults(filters, true);
  }, [fetchResults, filters]);

  const hasActiveFilters =
    filters.search !== '' ||
    filters.exam_type !== '' ||
    filters.year !== '' ||
    filters.college !== '' ||
    filters.sort !== 'newest';

  const hasMore = results.length < total;

  return (
    <Box
      sx={{
        py: { xs: 4, md: 6 },
        bgcolor: '#060d1f',
        minHeight: '100vh',
      }}
    >
      <Container maxWidth="lg">
        {/* Stats Bar */}
        <Box sx={{ mb: { xs: 4, md: 5 } }}>
          <StatsBar />
        </Box>

        {/* Featured Carousel */}
        <FeaturedCarousel />

        {/* Filter Bar */}
        <FilterBar
          filters={filters}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          filterOptions={filterOptions}
          hasActiveFilters={hasActiveFilters}
        />

        {/* Result count */}
        {!loading && total > 0 && (
          <Typography
            variant="body2"
            sx={{
              color: 'rgba(245,240,232,0.5)',
              mb: 2,
              fontSize: '0.85rem',
            }}
          >
            Showing {results.length} of {total} results
          </Typography>
        )}

        {/* Results Grid */}
        <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={`skel-${i}`}>
                  <Box sx={{ pt: 5 }}>
                    <Box
                      sx={{
                        bgcolor: 'rgba(11,22,41,0.75)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.08)',
                        p: 2.5,
                        pt: 6.5,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        position: 'relative',
                      }}
                    >
                      <Skeleton
                        variant="circular"
                        width={80}
                        height={80}
                        sx={{
                          position: 'absolute',
                          top: -40,
                          bgcolor: 'rgba(255,255,255,0.06)',
                        }}
                      />
                      <Skeleton
                        variant="text"
                        width={120}
                        height={28}
                        sx={{ bgcolor: 'rgba(255,255,255,0.06)' }}
                      />
                      <Skeleton
                        variant="rounded"
                        width={70}
                        height={24}
                        sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                      />
                      <Skeleton
                        variant="text"
                        width={80}
                        height={36}
                        sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                      />
                      <Skeleton
                        variant="text"
                        width={100}
                        height={18}
                        sx={{ mt: 1, bgcolor: 'rgba(255,255,255,0.06)' }}
                      />
                    </Box>
                  </Box>
                </Grid>
              ))
            : results.map((result) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={result.id}>
                  <ResultCard result={result} />
                </Grid>
              ))}
        </Grid>

        {/* Empty state */}
        {!loading && results.length === 0 && (
          <Box
            sx={{
              textAlign: 'center',
              py: { xs: 6, md: 10 },
            }}
          >
            <SearchOffIcon
              sx={{
                fontSize: 56,
                color: 'rgba(245,240,232,0.2)',
                mb: 2,
              }}
            />
            <Typography
              variant="h6"
              sx={{ color: 'rgba(245,240,232,0.5)', mb: 1 }}
            >
              No results match your filters
            </Typography>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(245,240,232,0.3)', mb: 3 }}
            >
              Try adjusting your search or filter criteria
            </Typography>
            {hasActiveFilters && (
              <Button
                variant="outlined"
                startIcon={<ClearAllIcon />}
                onClick={handleClearFilters}
                sx={{
                  textTransform: 'none',
                  color: '#e8a020',
                  borderColor: 'rgba(232,160,32,0.3)',
                  '&:hover': {
                    borderColor: '#e8a020',
                    bgcolor: 'rgba(232,160,32,0.08)',
                  },
                }}
              >
                Clear All Filters
              </Button>
            )}
          </Box>
        )}

        {/* Load More */}
        {!loading && hasMore && (
          <Box sx={{ textAlign: 'center', mt: { xs: 4, md: 5 } }}>
            <Button
              variant="outlined"
              size="large"
              onClick={handleLoadMore}
              disabled={loadingMore}
              endIcon={<ExpandMoreIcon />}
              sx={{
                textTransform: 'none',
                px: 4,
                py: 1.5,
                color: '#e8a020',
                borderColor: 'rgba(232,160,32,0.3)',
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 600,
                transition: 'all 0.3s ease',
                '&:hover': {
                  borderColor: '#e8a020',
                  bgcolor: 'rgba(232,160,32,0.08)',
                  transform: 'translateY(-2px)',
                },
                '&:disabled': {
                  color: 'rgba(245,240,232,0.3)',
                  borderColor: 'rgba(255,255,255,0.06)',
                },
              }}
            >
              {loadingMore ? 'Loading...' : 'Load More Results'}
            </Button>
          </Box>
        )}
      </Container>
    </Box>
  );
}
