'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, Skeleton } from '@neram/ui';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ExpandMoreOutlinedIcon from '@mui/icons-material/ExpandMoreOutlined';
import { CtaButton, EmptyState, FilterBar, FilterSelect, Pill, tokens as t } from '@/design-system';
import FeaturedCarousel from './FeaturedCarousel';
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

const EXAM_PILLS = [
  { value: '', label: 'All' },
  { value: 'nata', label: 'NATA' },
  { value: 'jee_paper2', label: 'JEE Paper 2' },
  { value: 'tnea', label: 'TNEA' },
  { value: 'other', label: 'Placements' },
];

// 'newest' is the default, shown as the select's empty option.
const SORT_OPTIONS = [
  { value: 'score_desc', label: 'Highest Score' },
  { value: 'rank_asc', label: 'Best Rank' },
  { value: 'name_asc', label: 'Name (A-Z)' },
];

const cardGridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 250px), 1fr))',
  gap: { xs: 2, md: 2.5 },
} as const;

const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

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
  const examPills = EXAM_PILLS.filter((p) => p.value === '' || filterOptions.exam_types.includes(p.value));

  return (
    <>
      <FilterBar
        onClear={hasActiveFilters ? handleClearFilters : undefined}
        summary={!loading && total > 0 ? `${total} ${total === 1 ? 'result' : 'results'}` : undefined}
      >
        <Box
          component="label"
          sx={{
            position: 'relative',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            height: 44,
            px: 1.5,
            boxSizing: 'border-box',
            flex: { xs: '1 1 100%', sm: '0 1 260px' },
            minWidth: 0,
            border: `1px solid ${t.lineStrong}`,
            borderRadius: `${t.radius}px`,
            bgcolor: t.surface,
            color: t.inkMuted,
            '&:focus-within': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          <SearchOutlinedIcon aria-hidden sx={{ fontSize: 20 }} />
          <Box component="span" sx={visuallyHidden}>
            Search students
          </Box>
          <Box
            component="input"
            type="search"
            placeholder="Search students..."
            value={filters.search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFilterChange('search', e.target.value)}
            sx={{
              flex: 1,
              minWidth: 0,
              border: 0,
              outline: 'none',
              bgcolor: 'transparent',
              font: 'inherit',
              // 16px stops iOS zooming into the field.
              fontSize: '1rem',
              color: t.ink,
              '&::placeholder': { color: t.inkMuted, opacity: 1 },
              '&::-webkit-search-cancel-button': { display: 'none' },
            }}
          />
          {filters.search && (
            <Box
              component="button"
              type="button"
              aria-label="Clear search"
              onClick={() => handleFilterChange('search', '')}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                mr: -0.75,
                border: 0,
                borderRadius: '50%',
                bgcolor: 'transparent',
                color: t.inkMuted,
                cursor: 'pointer',
                '&:hover': { color: t.ink },
                '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
              }}
            >
              <CloseOutlinedIcon aria-hidden sx={{ fontSize: 18 }} />
            </Box>
          )}
        </Box>
        <Box role="group" aria-label="Exam" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {examPills.map((p) => (
            <Pill key={p.value || 'all'} selected={filters.exam_type === p.value} onClick={() => handleFilterChange('exam_type', p.value)}>
              {p.label}
            </Pill>
          ))}
        </Box>
        {filterOptions.years.length > 0 && (
          <FilterSelect
            label="Year"
            value={filters.year}
            allLabel="All years"
            options={filterOptions.years.map((y) => ({ value: String(y), label: String(y) }))}
            onChange={(v) => handleFilterChange('year', v)}
          />
        )}
        <FilterSelect
          label="Sort"
          value={filters.sort === 'newest' ? '' : filters.sort}
          allLabel="Newest First"
          options={SORT_OPTIONS}
          onChange={(v) => handleFilterChange('sort', v || 'newest')}
        />
      </FilterBar>

      <Box
        sx={{
          maxWidth: t.container.page,
          mx: 'auto',
          px: { xs: 2, sm: 3 },
          py: { xs: 5, md: 7 },
          boxSizing: 'content-box',
          display: 'flex',
          flexDirection: 'column',
          gap: { xs: 5, md: 6 },
        }}
      >
        <FeaturedCarousel />

        <Box component="section" aria-label="All results" aria-busy={loading} sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {loading ? (
            <Box sx={cardGridSx} aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <Box
                  key={`skel-${i}`}
                  sx={{ p: 2.5, bgcolor: t.surface, border: `1px solid ${t.line}`, borderRadius: `${t.radius}px` }}
                >
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Skeleton variant="circular" width={52} height={52} />
                    <Box sx={{ flex: 1 }}>
                      <Skeleton variant="text" width="80%" />
                      <Skeleton variant="text" width="45%" />
                    </Box>
                  </Box>
                  <Skeleton variant="text" width={100} height={36} sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="70%" />
                </Box>
              ))}
            </Box>
          ) : results.length > 0 ? (
            <Box sx={cardGridSx}>
              {results.map((result) => (
                <ResultCard key={result.id} result={result} />
              ))}
            </Box>
          ) : (
            <EmptyState
              icon={<SearchOffOutlinedIcon />}
              title="No results match your filters"
              body="Try adjusting your search or filter criteria"
              action={
                hasActiveFilters ? (
                  <CtaButton variant="outline" size="md" endIcon={null} onClick={handleClearFilters}>
                    Clear All Filters
                  </CtaButton>
                ) : undefined
              }
            />
          )}

          {!loading && results.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, mt: 1 }}>
              <Typography component="p" aria-live="polite" sx={{ m: 0, fontSize: '0.875rem', color: t.inkMuted }}>
                Showing {results.length} of {total} results
              </Typography>
              {hasMore && (
                <CtaButton
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  endIcon={<ExpandMoreOutlinedIcon aria-hidden />}
                >
                  {loadingMore ? 'Loading...' : 'Load More Results'}
                </CtaButton>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
