'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  TextField,
  InputAdornment,
  Paper,
  IconButton,
  Skeleton,
  alpha,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import CloseIcon from '@mui/icons-material/Close';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';
import GeographicSummaryBar from '@/components/students/GeographicSummaryBar';
import CityCard from '@/components/students/CityCard';
import DrillRow from '@/components/students/DrillRow';
import StudentsBreadcrumb, { type Crumb } from '@/components/students/StudentsBreadcrumb';
import StudentSearchResults, { type GeoResultStudent } from '@/components/students/StudentSearchResults';
import type { GeographicCountryNode } from '@neram/database';

function GeographicOverview() {
  const theme = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useNexusAuthContext();

  const selectedCountry = searchParams.get('country');
  const selectedState = searchParams.get('state');

  // Hierarchy data
  const [hierarchy, setHierarchy] = useState<GeographicCountryNode[]>([]);
  const [totals, setTotals] = useState({ students: 0, countries: 0, states: 0, cities: 0 });
  const [loading, setLoading] = useState(true);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GeoResultStudent[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);

  const mode = debouncedSearch.trim() ? 'search' : 'tree';

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch hierarchy once
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

  // Fetch search results
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
          { headers: { Authorization: `Bearer ${token}` } },
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

  // Resolve the current drill nodes from the URL.
  const countryNode = selectedCountry
    ? hierarchy.find((c) => c.country === selectedCountry) || null
    : null;
  const stateNode = countryNode && selectedState
    ? countryNode.states.find((s) => s.state === selectedState) || null
    : null;

  const level: 'countries' | 'states' | 'cities' = !countryNode
    ? 'countries'
    : !stateNode
      ? 'states'
      : 'cities';

  // Navigation writes to the URL so browser Back steps up one level and links are shareable.
  const navTo = useCallback(
    (next: { country?: string | null; state?: string | null }) => {
      const sp = new URLSearchParams();
      if (next.country) sp.set('country', next.country);
      if (next.state) sp.set('state', next.state);
      const qs = sp.toString();
      router.push(`/teacher/students/city-wise${qs ? `?${qs}` : ''}`);
    },
    [router],
  );

  const goToCity = useCallback(
    (city: string) => {
      const sp = new URLSearchParams();
      if (selectedState) sp.set('state', selectedState);
      if (selectedCountry) sp.set('country', selectedCountry);
      const qs = sp.toString();
      router.push(`/teacher/students/city-wise/${encodeURIComponent(city)}${qs ? `?${qs}` : ''}`);
    },
    [router, selectedState, selectedCountry],
  );

  // Breadcrumb (only once we've drilled into a country).
  const crumbs: Crumb[] = [];
  if (countryNode) {
    crumbs.push({ label: 'All countries', onClick: () => navTo({}) });
    if (stateNode) {
      crumbs.push({ label: countryNode.country_display, onClick: () => navTo({ country: countryNode.country }) });
      crumbs.push({ label: stateNode.state });
    } else {
      crumbs.push({ label: countryNode.country_display });
    }
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Students grouped by country, state and city. Current and upcoming students only.
      </Typography>

      {/* Totals */}
      <GeographicSummaryBar
        totalStudents={totals.students}
        countryCount={totals.countries}
        stateCount={totals.states}
        cityCount={totals.cities}
        loading={loading}
      />

      {/* Search */}
      <Paper
        elevation={0}
        sx={{
          mb: 2.5,
          border: `1px solid ${theme.palette.divider}`,
          borderRadius: 3,
          overflow: 'hidden',
          transition: 'border-color 0.2s, box-shadow 0.2s',
          '&:focus-within': {
            borderColor: theme.palette.primary.main,
            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.08)}`,
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', px: { xs: 1.5, sm: 2 }, gap: 1 }}>
          <SearchIcon sx={{ fontSize: 22, color: 'text.disabled', flexShrink: 0 }} />
          <TextField
            fullWidth
            placeholder="Search student by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            variant="standard"
            InputProps={{
              disableUnderline: true,
              sx: { py: 1.5, fontSize: { xs: '0.9rem', sm: '0.95rem' }, minHeight: 48 },
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton size="small" aria-label="Clear search" onClick={() => setSearchQuery('')} sx={{ p: 0.5 }}>
                    <CloseIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>
      </Paper>

      {mode === 'search' ? (
        <StudentSearchResults
          students={searchResults}
          total={searchTotal}
          loading={searchLoading}
          searchQuery={debouncedSearch}
        />
      ) : loading ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} sx={{ borderRadius: 2 }} />
          ))}
        </Box>
      ) : hierarchy.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 2, borderStyle: 'dashed' }}>
          <PlaceOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled', mb: 1 }} />
          <Typography variant="body1" sx={{ fontWeight: 600 }}>
            No location data yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Students appear here once their city is recorded in their profile.
          </Typography>
        </Paper>
      ) : (
        <>
          {crumbs.length > 0 && <StudentsBreadcrumb items={crumbs} />}

          {level === 'countries' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {hierarchy.map((c) => (
                <DrillRow
                  key={c.country}
                  icon={<PublicOutlinedIcon />}
                  title={c.country_display}
                  subtitle={`${c.state_count} ${c.state_count === 1 ? 'state' : 'states'} · ${c.city_count} ${c.city_count === 1 ? 'city' : 'cities'}`}
                  count={c.student_count}
                  countLabel="students"
                  onClick={() => navTo({ country: c.country })}
                />
              ))}
            </Box>
          )}

          {level === 'states' && countryNode && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {countryNode.states.map((s) => (
                <DrillRow
                  key={s.state}
                  icon={<MapOutlinedIcon />}
                  title={s.state}
                  subtitle={`${s.city_count} ${s.city_count === 1 ? 'city' : 'cities'}`}
                  count={s.student_count}
                  countLabel="students"
                  onClick={() => navTo({ country: countryNode.country, state: s.state })}
                />
              ))}
            </Box>
          )}

          {level === 'cities' && stateNode && (
            <Box
              sx={{
                display: 'grid',
                gap: 1.5,
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              }}
            >
              {stateNode.cities.map((ci) => (
                <CityCard
                  key={ci.city}
                  city={ci.city}
                  studentCount={ci.student_count}
                  totalStudents={stateNode.student_count}
                  state={stateNode.state}
                  onClick={() => goToCity(ci.city)}
                />
              ))}
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default function GeographicOverviewPage() {
  return (
    <Suspense fallback={<Box sx={{ py: 4 }} />}>
      <GeographicOverview />
    </Suspense>
  );
}
