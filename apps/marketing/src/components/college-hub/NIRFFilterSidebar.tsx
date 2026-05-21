'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  FormControl,
  Select,
  MenuItem,
  Slider,
  Button,
  Divider,
  Drawer,
  TextField,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import {
  COLLEGE_TYPE_OPTIONS,
  NIRF_SORT_OPTIONS,
  hasActiveFilters,
  type NIRFFilters,
} from '@/lib/college-hub/nirf-filters';

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      fontWeight={600}
      sx={{
        mb: 0.75,
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        fontSize: '0.68rem',
      }}
    >
      {children}
    </Typography>
  );
}

interface Props {
  filters: NIRFFilters;
  totalCount: number;
  availableYears: number[];
  states: { name: string; slug: string }[];
  cities: { city: string; state: string }[];
}

function FilterBody({
  filters,
  totalCount,
  availableYears,
  states,
  cities,
  onClose,
}: Props & { onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (value && value.length) sp.set(key, value);
      else sp.delete(key);
      sp.delete('page');
      router.push(`${pathname}?${sp.toString()}`);
      if (onClose) onClose();
    },
    [router, pathname, searchParams, onClose],
  );

  const toggleYear = useCallback(
    (year: number) => {
      const current = new Set(filters.years);
      if (current.has(year)) current.delete(year);
      else current.add(year);
      const arr = Array.from(current).sort((a, b) => b - a);
      setParam('year', arr.length ? arr.join(',') : undefined);
    },
    [filters.years, setParam],
  );

  const [search, setSearch] = useState(filters.search ?? '');
  const submitSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setParam('q', search.trim() || undefined);
  };

  const clearAll = () => {
    router.push(pathname);
    if (onClose) onClose();
  };

  const filteredCities = filters.state
    ? cities.filter((c) => states.find((s) => s.slug === filters.state)?.name === c.state)
    : cities;

  return (
    <Box sx={{ p: { xs: 2, md: 2.5 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={700}>
          Filters
        </Typography>
        {hasActiveFilters(filters) && (
          <Button size="small" onClick={clearAll} sx={{ minHeight: 36, fontSize: '0.75rem' }}>
            Clear all
          </Button>
        )}
      </Stack>

      <Box component="form" onSubmit={submitSearch} sx={{ mb: 2 }}>
        <SectionLabel>Search college</SectionLabel>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. IIT, SPA, Anna"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onBlur={submitSearch}
          inputProps={{ 'aria-label': 'Search NIRF colleges' }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <SectionLabel>NIRF Year</SectionLabel>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {availableYears.map((y) => {
            const active = filters.years.includes(y);
            return (
              <Chip
                key={y}
                label={y}
                size="medium"
                clickable
                variant={active ? 'filled' : 'outlined'}
                color={active ? 'primary' : 'default'}
                onClick={() => toggleYear(y)}
                sx={{ minHeight: 36, fontWeight: 600 }}
              />
            );
          })}
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.75, display: 'block' }}>
          {filters.years.length === 0 ? 'All years' : `${filters.years.length} year(s) selected`}
        </Typography>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <SectionLabel>State</SectionLabel>
        <FormControl fullWidth size="small">
          <Select
            value={filters.state ?? ''}
            displayEmpty
            onChange={(e) => setParam('state', e.target.value || undefined)}
          >
            <MenuItem value="">All states</MenuItem>
            {states.map((s) => (
              <MenuItem key={s.slug} value={s.slug}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ mb: 2 }}>
        <SectionLabel>City</SectionLabel>
        <FormControl fullWidth size="small">
          <Select
            value={filters.city ?? ''}
            displayEmpty
            onChange={(e) => setParam('city', e.target.value || undefined)}
          >
            <MenuItem value="">All cities</MenuItem>
            {filteredCities.map((c) => (
              <MenuItem key={`${c.city}-${c.state}`} value={c.city}>
                {c.city}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ mb: 2 }}>
        <SectionLabel>Type</SectionLabel>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {COLLEGE_TYPE_OPTIONS.map((t) => {
            const active = filters.type?.toLowerCase() === t.value;
            return (
              <Chip
                key={t.value}
                label={t.label}
                size="medium"
                clickable
                variant={active ? 'filled' : 'outlined'}
                color={active ? 'primary' : 'default'}
                onClick={() => setParam('type', active ? undefined : t.value)}
                sx={{ minHeight: 36 }}
              />
            );
          })}
        </Stack>
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <SectionLabel>NIRF rank (1 to 100)</SectionLabel>
        <Slider
          value={[filters.rankMin ?? 1, filters.rankMax ?? 100]}
          min={1}
          max={100}
          step={1}
          valueLabelDisplay="auto"
          onChangeCommitted={(_, value) => {
            const [lo, hi] = value as [number, number];
            const sp = new URLSearchParams(searchParams.toString());
            if (lo > 1) sp.set('rankMin', String(lo));
            else sp.delete('rankMin');
            if (hi < 100) sp.set('rankMax', String(hi));
            else sp.delete('rankMax');
            sp.delete('page');
            router.push(`${pathname}?${sp.toString()}`);
          }}
          sx={{ mt: 0.5 }}
        />
      </Box>

      <Box sx={{ mb: 2 }}>
        <SectionLabel>NIRF score</SectionLabel>
        <Slider
          value={[filters.scoreMin ?? 0, filters.scoreMax ?? 100]}
          min={0}
          max={100}
          step={1}
          valueLabelDisplay="auto"
          onChangeCommitted={(_, value) => {
            const [lo, hi] = value as [number, number];
            const sp = new URLSearchParams(searchParams.toString());
            if (lo > 0) sp.set('scoreMin', String(lo));
            else sp.delete('scoreMin');
            if (hi < 100) sp.set('scoreMax', String(hi));
            else sp.delete('scoreMax');
            sp.delete('page');
            router.push(`${pathname}?${sp.toString()}`);
          }}
          sx={{ mt: 0.5 }}
        />
      </Box>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mb: 2 }}>
        <SectionLabel>Sort by</SectionLabel>
        <FormControl fullWidth size="small">
          <Select
            value={filters.sort}
            onChange={(e) => setParam('sort', e.target.value === 'rank_asc' ? undefined : e.target.value)}
          >
            {NIRF_SORT_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {totalCount.toLocaleString()} rankings match
      </Typography>
    </Box>
  );
}

export default function NIRFFilterSidebar(props: Props) {
  const [open, setOpen] = useState(false);
  const activeCount =
    props.filters.years.length +
    [props.filters.state, props.filters.city, props.filters.type, props.filters.search]
      .filter(Boolean).length +
    [props.filters.scoreMin, props.filters.scoreMax, props.filters.rankMin, props.filters.rankMax]
      .filter((v) => v !== undefined).length;

  return (
    <>
      {/* Desktop sidebar */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'sticky',
          top: 88,
          maxHeight: 'calc(100vh - 100px)',
          overflowY: 'auto',
        }}
      >
        <Box
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 2,
            bgcolor: 'background.paper',
          }}
        >
          <FilterBody {...props} />
        </Box>
      </Box>

      {/* Mobile FAB */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 1100,
        }}
      >
        <Button
          variant="contained"
          onClick={() => setOpen(true)}
          startIcon={<FilterListIcon />}
          sx={{
            borderRadius: 6,
            px: 2.5,
            py: 1.2,
            fontWeight: 600,
            fontSize: '0.85rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            textTransform: 'none',
            minHeight: 48,
          }}
        >
          Filters
          {activeCount > 0 && (
            <Box
              component="span"
              sx={{
                ml: 0.75,
                bgcolor: '#ef4444',
                color: 'white',
                fontSize: '0.65rem',
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeCount}
            </Box>
          )}
        </Button>
      </Box>

      {/* Mobile bottom drawer */}
      <Drawer
        anchor="bottom"
        open={open}
        onClose={() => setOpen(false)}
        PaperProps={{
          sx: {
            maxHeight: '85vh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          },
        }}
      >
        <Box sx={{ overflow: 'auto', pb: 4 }}>
          <FilterBody {...props} onClose={() => setOpen(false)} />
        </Box>
      </Drawer>
    </>
  );
}
