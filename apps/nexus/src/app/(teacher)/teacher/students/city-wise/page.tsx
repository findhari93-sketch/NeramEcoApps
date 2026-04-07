'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Paper,
  IconButton,
  Chip,
  Divider,
  Collapse,
  alpha,
  useTheme,
  useMediaQuery,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import GeographicSummaryBar from '@/components/students/GeographicSummaryBar';
import CountryChips from '@/components/students/CountryChips';
import GeographicFilters from '@/components/students/GeographicFilters';
import type { GeographicFilterValues } from '@/components/students/GeographicFilters';
import GeographicTreeView from '@/components/students/GeographicTreeView';
import StudentSearchResults from '@/components/students/StudentSearchResults';
import type { GeographicCountryNode, GeographicStudent } from '@neram/database';

export default function GeographicOverview() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const router = useRouter();
  const { getToken } = useNexusAuthContext();

  // Data state
  const [hierarchy, setHierarchy] = useState<GeographicCountryNode[]>([]);
  const [totals, setTotals] = useState({ students: 0, countries: 0, states: 0, cities: 0 });
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GeographicStudent[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<GeographicFilterValues>({
    country: null,
    state: null,
    district: null,
    city: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  const mode = debouncedSearch.trim() ? 'search' : 'tree';
  const hasActiveFilters = filters.country || filters.state || filters.district || filters.city;
  const activeFilterCount = [filters.country, filters.state, filters.district, filters.city].filter(Boolean).length;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch hierarchy on mount
  useEffect(() => {
    async function fetchHierarchy() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/students/geographic?view=hierarchy', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setHierarchy(data.hierarchy || []);
          setTotals(data.totals || { students: 0, countries: 0, states: 0, cities: 0 });
        }
      } catch (err) {
        console.error('Failed to load geographic data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchHierarchy();
  }, [getToken]);

  // Fetch search results when debounced search changes
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      setSearchTotal(0);
      return;
    }

    async function fetchSearch() {
      setSearchLoading(true);
      try {
        const token = await getToken();
        if (!token) return;

        const res = await fetch(
          `/api/students/geographic?search=${encodeURIComponent(debouncedSearch.trim())}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.students || []);
          setSearchTotal(data.total || 0);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearchLoading(false);
      }
    }

    fetchSearch();
  }, [debouncedSearch, getToken]);

  // Apply client-side filters to hierarchy
  const filteredHierarchy = useMemo(() => {
    let result = hierarchy;

    if (filters.country) {
      result = result.filter((c) => c.country === filters.country);
    }

    if (filters.state) {
      result = result.map((c) => ({
        ...c,
        states: c.states.filter((s) => s.state === filters.state),
      })).filter((c) => c.states.length > 0);
    }

    if (filters.district) {
      result = result.map((c) => ({
        ...c,
        states: c.states.map((s) => ({
          ...s,
          cities: s.cities.filter((ci) => ci.district === filters.district),
        })).filter((s) => s.cities.length > 0),
      })).filter((c) => c.states.length > 0);
    }

    if (filters.city) {
      result = result.map((c) => ({
        ...c,
        states: c.states.map((s) => ({
          ...s,
          cities: s.cities.filter((ci) => ci.city === filters.city),
        })).filter((s) => s.cities.length > 0),
      })).filter((c) => c.states.length > 0);
    }

    return result;
  }, [hierarchy, filters]);

  const handleCountryChipSelect = useCallback((country: string | null) => {
    setFilters({ country, state: null, district: null, city: null });
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters({ country: null, state: null, district: null, city: null });
  }, []);

  const handleCityClick = useCallback(
    (city: string) => {
      router.push(`/teacher/students/city-wise/${encodeURIComponent(city)}`);
    },
    [router]
  );

  return (
    <Box>
      <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Geographic Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Students grouped by country, state and city across all classrooms
      </Typography>

      {/* Summary chips */}
      <GeographicSummaryBar
        totalStudents={totals.students}
        countryCount={totals.countries}
        stateCount={totals.states}
        cityCount={totals.cities}
        loading={loading}
      />

      {/* Unified Search + Filter Toolbar */}
      <Paper
        elevation={0}
        sx={{
          mb: 2.5,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 3,
          overflow: 'hidden',
          transition: 'border-color 0.2s',
          '&:focus-within': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.08)}`,
          },
        }}
      >
        {/* Search row */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: { xs: 1.5, sm: 2 },
            gap: 1,
          }}
        >
          <SearchIcon sx={{ fontSize: 22, color: 'text.disabled', flexShrink: 0 }} />
          <TextField
            fullWidth
            placeholder="Search student by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: {
                py: 1.5,
                fontSize: { xs: '0.9rem', sm: '0.95rem' },
                minHeight: 48,
              },
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchQuery('')} sx={{ p: 0.5 }}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />

          {/* Filter toggle button */}
          {mode === 'tree' && (
            <>
              <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
              <IconButton
                onClick={() => setShowFilters(!showFilters)}
                sx={{
                  p: 1,
                  borderRadius: 2,
                  color: hasActiveFilters ? 'primary.main' : 'text.secondary',
                  backgroundColor: hasActiveFilters
                    ? alpha(theme.palette.primary.main, 0.08)
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.12),
                  },
                }}
              >
                <TuneOutlinedIcon sx={{ fontSize: 22 }} />
                {activeFilterCount > 0 && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      backgroundColor: 'primary.main',
                      color: 'white',
                      fontSize: 10,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {activeFilterCount}
                  </Box>
                )}
              </IconButton>
            </>
          )}
        </Box>

        {/* Active filter tags (shown below search when filters are applied but panel is closed) */}
        {hasActiveFilters && !showFilters && mode === 'tree' && (
          <>
            <Divider />
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 2,
                py: 1,
                backgroundColor: alpha(theme.palette.primary.main, 0.03),
                overflowX: 'auto',
                '&::-webkit-scrollbar': { display: 'none' },
              }}
            >
              <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, mr: 0.5 }}>
                Filtered:
              </Typography>
              {[filters.country, filters.state, filters.district, filters.city]
                .filter(Boolean)
                .map((val) => (
                  <Chip
                    key={val}
                    label={val}
                    size="small"
                    variant="outlined"
                    color="primary"
                    sx={{ height: 24, fontSize: 12, flexShrink: 0 }}
                  />
                ))}
              <Chip
                label="Clear"
                size="small"
                onClick={handleClearFilters}
                onDelete={handleClearFilters}
                deleteIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                sx={{ height: 24, fontSize: 12, flexShrink: 0, ml: 'auto' }}
              />
            </Box>
          </>
        )}

        {/* Expandable filter panel */}
        {mode === 'tree' && (
          <Collapse in={showFilters}>
            <Divider />
            <Box
              sx={{
                px: 2,
                py: 2,
                backgroundColor: alpha(theme.palette.background.default, 0.5),
              }}
            >
              <GeographicFilters
                hierarchy={hierarchy}
                filters={filters}
                onFilterChange={setFilters}
                onClear={handleClearFilters}
                inline
              />
            </Box>
          </Collapse>
        )}
      </Paper>

      {mode === 'tree' ? (
        <>
          {/* Country chips */}
          <CountryChips
            countries={hierarchy}
            selectedCountry={filters.country}
            onSelect={handleCountryChipSelect}
          />

          {/* Hierarchy tree */}
          <GeographicTreeView
            hierarchy={filteredHierarchy}
            totalStudents={totals.students}
            onCityClick={handleCityClick}
            loading={loading}
          />
        </>
      ) : (
        <StudentSearchResults
          students={searchResults}
          total={searchTotal}
          loading={searchLoading}
          searchQuery={debouncedSearch}
        />
      )}
    </Box>
  );
}
