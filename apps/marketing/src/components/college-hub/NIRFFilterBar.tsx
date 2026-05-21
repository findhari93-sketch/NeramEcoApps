'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useState, useMemo } from 'react';
import {
  Box,
  Stack,
  Typography,
  TextField,
  InputAdornment,
  Button,
  Chip,
  Select,
  MenuItem,
  FormControl,
  Drawer,
  IconButton,
  Divider,
  Slider,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import StarIcon from '@mui/icons-material/Star';
import CloseIcon from '@mui/icons-material/Close';
import {
  COLLEGE_TYPE_OPTIONS,
  NIRF_SORT_OPTIONS,
  type NIRFFilters,
} from '@/lib/college-hub/nirf-filters';

interface Props {
  filters: NIRFFilters;
  totalCount: number;
  availableYears: number[];
  states: { name: string; slug: string }[];
  cities: { city: string; state: string }[];
}

export default function NIRFFilterBar({
  filters,
  totalCount,
  availableYears,
  states,
  cities,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [search, setSearch] = useState(filters.search ?? '');

  const pushParams = useCallback(
    (mutate: (sp: URLSearchParams) => void) => {
      const sp = new URLSearchParams(searchParams.toString());
      mutate(sp);
      sp.delete('page');
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams],
  );

  const setParam = useCallback(
    (key: string, value: string | undefined) => {
      pushParams((sp) => {
        if (value && value.length) sp.set(key, value);
        else sp.delete(key);
      });
    },
    [pushParams],
  );

  const selectYear = (year: number | 'all') => {
    if (year === 'all') setParam('year', undefined);
    else setParam('year', String(year));
  };

  const top10Active = filters.rankMax === 10;
  const toggleTop10 = () => {
    pushParams((sp) => {
      if (top10Active) {
        sp.delete('rankMax');
      } else {
        sp.set('rankMax', '10');
      }
    });
  };

  const submitSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setParam('q', search.trim() || undefined);
  };

  const activeFilterPills = useMemo(() => {
    const pills: { key: string; label: string; clear: () => void }[] = [];
    if (filters.state) {
      const s = states.find((x) => x.slug === filters.state);
      pills.push({
        key: 'state',
        label: s?.name ?? filters.state,
        clear: () => setParam('state', undefined),
      });
    }
    if (filters.city) {
      pills.push({
        key: 'city',
        label: filters.city,
        clear: () => setParam('city', undefined),
      });
    }
    if (filters.type) {
      const t = COLLEGE_TYPE_OPTIONS.find((x) => x.value === filters.type);
      pills.push({
        key: 'type',
        label: t?.label ?? filters.type,
        clear: () => setParam('type', undefined),
      });
    }
    if (filters.search) {
      pills.push({
        key: 'q',
        label: `"${filters.search}"`,
        clear: () => {
          setSearch('');
          setParam('q', undefined);
        },
      });
    }
    return pills;
  }, [filters, states, setParam]);

  const filteredCities = filters.state
    ? cities.filter((c) => states.find((s) => s.slug === filters.state)?.name === c.state)
    : cities;

  const singleYear =
    filters.years.length === 1 ? filters.years[0] : undefined;
  const yearPills: Array<{ value: number | 'all'; label: string }> = [
    ...availableYears.map((y) => ({ value: y as number, label: String(y) })),
  ];

  return (
    <>
      {/* === DESKTOP filter row =============================== */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, mb: 2 }}>
        <Stack
          direction="row"
          spacing={1.25}
          alignItems="center"
          sx={{ flexWrap: 'wrap', gap: 1.25 }}
        >
          {/* Year pills */}
          <Stack
            direction="row"
            spacing={0.5}
            sx={{
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 6,
              p: 0.5,
              bgcolor: 'background.paper',
            }}
          >
            {yearPills.map((y) => {
              const active = singleYear === y.value;
              return (
                <Box
                  key={y.value}
                  component="button"
                  onClick={() => selectYear(y.value)}
                  sx={{
                    border: 'none',
                    cursor: 'pointer',
                    px: 1.75,
                    py: 0.75,
                    borderRadius: 5,
                    minHeight: 32,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    bgcolor: active ? '#1a1612' : 'transparent',
                    color: active ? '#fff' : 'text.primary',
                    transition: 'background-color 120ms ease',
                    '&:hover': { bgcolor: active ? '#1a1612' : 'action.hover' },
                  }}
                >
                  {y.label}
                </Box>
              );
            })}
          </Stack>

          {/* Search input */}
          <Box component="form" onSubmit={submitSearch} sx={{ flex: 1, minWidth: 260 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search college, city, state."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onBlur={submitSearch}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 5,
                  bgcolor: 'background.paper',
                  fontSize: '0.9rem',
                },
              }}
            />
          </Box>

          {/* State dropdown */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              displayEmpty
              value={filters.state ?? ''}
              onChange={(e) => setParam('state', e.target.value || undefined)}
              sx={{
                borderRadius: 5,
                fontSize: '0.85rem',
                bgcolor: 'background.paper',
              }}
              renderValue={(v) => {
                if (!v) return <Typography sx={{ fontSize: '0.85rem' }}>State</Typography>;
                const s = states.find((x) => x.slug === v);
                return s?.name ?? v;
              }}
            >
              <MenuItem value="">All states</MenuItem>
              {states.map((s) => (
                <MenuItem key={s.slug} value={s.slug}>
                  {s.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* City dropdown */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              displayEmpty
              value={filters.city ?? ''}
              onChange={(e) => setParam('city', e.target.value || undefined)}
              sx={{
                borderRadius: 5,
                fontSize: '0.85rem',
                bgcolor: 'background.paper',
              }}
              renderValue={(v) => {
                if (!v) return <Typography sx={{ fontSize: '0.85rem' }}>City</Typography>;
                return v as string;
              }}
            >
              <MenuItem value="">All cities</MenuItem>
              {filteredCities.map((c) => (
                <MenuItem key={`${c.city}-${c.state}`} value={c.city}>
                  {c.city}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Type dropdown */}
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select
              displayEmpty
              value={filters.type ?? ''}
              onChange={(e) => setParam('type', e.target.value || undefined)}
              sx={{
                borderRadius: 5,
                fontSize: '0.85rem',
                bgcolor: 'background.paper',
              }}
              renderValue={(v) => {
                if (!v) return <Typography sx={{ fontSize: '0.85rem' }}>Type</Typography>;
                const t = COLLEGE_TYPE_OPTIONS.find((x) => x.value === v);
                return t?.label ?? (v as string);
              }}
            >
              <MenuItem value="">All types</MenuItem>
              {COLLEGE_TYPE_OPTIONS.map((t) => (
                <MenuItem key={t.value} value={t.value}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        {/* Sub row: top 10 toggle + active pills + results count */}
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ mt: 1.5, flexWrap: 'wrap', gap: 1 }}
        >
          <Box
            component="button"
            onClick={toggleTop10}
            sx={{
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.75,
              border: '1px solid',
              borderColor: top10Active ? '#1a1612' : 'divider',
              bgcolor: top10Active ? '#1a1612' : 'background.paper',
              color: top10Active ? '#fff' : 'text.primary',
              px: 1.5,
              py: 0.6,
              borderRadius: 5,
              fontSize: '0.8rem',
              fontWeight: 600,
              minHeight: 32,
            }}
          >
            {top10Active ? <StarIcon sx={{ fontSize: 16 }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
            Top 10 only
          </Box>

          {activeFilterPills.map((p) => (
            <Chip
              key={p.key}
              label={p.label}
              size="small"
              onDelete={p.clear}
              sx={{ borderRadius: 5, fontSize: '0.75rem' }}
            />
          ))}

          <Box sx={{ ml: 'auto' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              {totalCount.toLocaleString()} results
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* === MOBILE filter row =============================== */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 1.5 }}>
        {/* Search */}
        <Box component="form" onSubmit={submitSearch} sx={{ mb: 1.25 }}>
          <TextField
            size="small"
            fullWidth
            placeholder={`Search ${totalCount} colleges.`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onBlur={submitSearch}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                bgcolor: '#f1efe9',
                fontSize: '0.9rem',
                minHeight: 44,
              },
              '& fieldset': { border: 'none' },
            }}
          />
        </Box>

        {/* Year pills, horizontal scroll */}
        <Box
          sx={{
            display: 'flex',
            gap: 0.75,
            overflowX: 'auto',
            pb: 0.5,
            mb: 1.25,
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {yearPills.map((y) => {
            const active = singleYear === y.value;
            return (
              <Box
                key={y.value}
                component="button"
                onClick={() => selectYear(y.value)}
                sx={{
                  border: '1px solid',
                  borderColor: active ? '#1a1612' : 'divider',
                  bgcolor: active ? '#1a1612' : 'background.paper',
                  color: active ? '#fff' : 'text.primary',
                  cursor: 'pointer',
                  px: 2,
                  py: 0.75,
                  borderRadius: 5,
                  minHeight: 36,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                {y.label}
              </Box>
            );
          })}
        </Box>

        {/* Filters + Rank + results */}
        <Stack direction="row" alignItems="center" spacing={1}>
          <Button
            onClick={() => setDrawerOpen(true)}
            startIcon={<TuneIcon sx={{ fontSize: 18 }} />}
            sx={{
              borderRadius: 5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.primary',
              px: 1.75,
              py: 0.75,
              minHeight: 40,
              fontSize: '0.85rem',
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            Filters{activeFilterPills.length > 0 && ` (${activeFilterPills.length})`}
          </Button>
          <Button
            onClick={() => setSortOpen(true)}
            startIcon={<SwapVertIcon sx={{ fontSize: 18 }} />}
            sx={{
              borderRadius: 5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              color: 'text.primary',
              px: 1.75,
              py: 0.75,
              minHeight: 40,
              fontSize: '0.85rem',
              fontWeight: 600,
              textTransform: 'none',
            }}
          >
            {filters.sort === 'score_desc' ? 'Score' : filters.sort === 'name_asc' ? 'A to Z' : 'Rank'}
          </Button>
          <Box sx={{ ml: 'auto' }}>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
              {totalCount.toLocaleString()} results
            </Typography>
          </Box>
        </Stack>

        {/* Active pills row, mobile */}
        {activeFilterPills.length > 0 && (
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ mt: 1, flexWrap: 'wrap', gap: 0.75 }}
          >
            {activeFilterPills.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                size="small"
                onDelete={p.clear}
                sx={{ borderRadius: 5, fontSize: '0.7rem' }}
              />
            ))}
            {top10Active && (
              <Chip
                label="Top 10"
                size="small"
                onDelete={toggleTop10}
                sx={{ borderRadius: 5, fontSize: '0.7rem' }}
              />
            )}
          </Stack>
        )}
      </Box>

      {/* === MOBILE filter drawer =========================== */}
      <Drawer
        anchor="bottom"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        PaperProps={{
          sx: {
            maxHeight: '85vh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: 4 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6" fontWeight={700}>
              Filters
            </Typography>
            <IconButton onClick={() => setDrawerOpen(false)} aria-label="Close filters">
              <CloseIcon />
            </IconButton>
          </Stack>

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
                pushParams((sp) => {
                  if (lo > 1) sp.set('rankMin', String(lo));
                  else sp.delete('rankMin');
                  if (hi < 100) sp.set('rankMax', String(hi));
                  else sp.delete('rankMax');
                });
              }}
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
                pushParams((sp) => {
                  if (lo > 0) sp.set('scoreMin', String(lo));
                  else sp.delete('scoreMin');
                  if (hi < 100) sp.set('scoreMax', String(hi));
                  else sp.delete('scoreMax');
                });
              }}
            />
          </Box>

          <Button
            fullWidth
            variant="contained"
            onClick={() => setDrawerOpen(false)}
            sx={{ borderRadius: 5, minHeight: 48, mt: 1, textTransform: 'none' }}
          >
            Show {totalCount} results
          </Button>
        </Box>
      </Drawer>

      {/* === MOBILE sort drawer =========================== */}
      <Drawer
        anchor="bottom"
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          },
        }}
      >
        <Box sx={{ p: 2.5, pb: 4 }}>
          <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
            Sort by
          </Typography>
          <Stack spacing={1}>
            {NIRF_SORT_OPTIONS.map((o) => {
              const active = filters.sort === o.value;
              return (
                <Button
                  key={o.value}
                  fullWidth
                  onClick={() => {
                    setParam('sort', o.value === 'rank_asc' ? undefined : o.value);
                    setSortOpen(false);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    minHeight: 48,
                    borderRadius: 2,
                    border: '1px solid',
                    borderColor: active ? 'primary.main' : 'divider',
                    bgcolor: active ? 'action.selected' : 'background.paper',
                    color: 'text.primary',
                    fontWeight: active ? 700 : 500,
                    textTransform: 'none',
                  }}
                >
                  {o.label}
                </Button>
              );
            })}
          </Stack>
        </Box>
      </Drawer>
    </>
  );
}

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
