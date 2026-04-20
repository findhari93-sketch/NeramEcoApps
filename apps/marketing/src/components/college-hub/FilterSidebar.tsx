'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  Box, Typography, Paper, FormGroup, FormControlLabel, Checkbox,
  Select, MenuItem, FormControl, InputLabel, Button,
  Drawer, IconButton, Divider, Stack, Chip,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import { useState, useCallback } from 'react';
import type { CollegeFilters } from '@/lib/college-hub/types';
import {
  SORT_OPTIONS,
  COLLEGE_TYPES,
  NAAC_GRADES,
  EXAM_TYPES,
  FEE_PRESETS,
} from '@/lib/college-hub/constants';
import CollegeSearch from './CollegeSearch';

interface FilterSidebarProps {
  filters: CollegeFilters;
  totalCount: number;
  cityCounts?: { city: string; city_slug: string; count: number }[];
  typeCounts?: { type: string; count: number }[];
  onChange?: () => void;
}

// Section label reused throughout
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

function SidebarContent({
  filters,
  totalCount,
  cityCounts,
  typeCounts,
  onClose,
}: FilterSidebarProps & { onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showAllCities, setShowAllCities] = useState(false);

  const updateFilter = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
      if (onClose) onClose();
    },
    [router, pathname, searchParams, onClose]
  );

  const clearAll = () => {
    router.push(pathname);
    if (onClose) onClose();
  };

  const activeFilterCount = [
    filters.state,
    filters.type,
    filters.counselingSystem,
    filters.naacGrade,
    filters.coa,
    filters.minFee,
    filters.maxFee,
    filters.exam,
    filters.city,
    filters.rating,
    filters.search,
  ].filter(Boolean).length;

  const visibleCities = showAllCities ? cityCounts : cityCounts?.slice(0, 4);

  return (
    <Box sx={{ p: { xs: 2, md: 1.5 } }}>
      {/* Drag handle (mobile) */}
      <Box sx={{ display: { xs: 'flex', md: 'none' }, justifyContent: 'center', mb: 1.5 }}>
        <Box
          sx={{
            width: 40, height: 4, borderRadius: 2,
            bgcolor: 'grey.300',
          }}
        />
      </Box>

      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <FilterListIcon sx={{ fontSize: 16 }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ fontSize: '0.875rem' }}>
            Filters
          </Typography>
          {activeFilterCount > 0 && (
            <Chip label={activeFilterCount} size="small" color="primary" sx={{ height: 18, fontSize: '0.7rem' }} />
          )}
        </Stack>
        <Stack direction="row" gap={1}>
          {activeFilterCount > 0 && (
            <Button size="small" onClick={clearAll} sx={{ fontSize: '0.75rem' }}>
              Clear all
            </Button>
          )}
          {onClose && (
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      </Stack>

      {/* Sort By */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Sort By</SectionLabel>
        <FormControl size="small" fullWidth>
          <Select
            value={filters.sortBy ?? 'arch_index'}
            onChange={(e) => updateFilter('sort', e.target.value)}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* COA Approved */}
      <Box sx={{ mb: 1.75 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={filters.coa === true}
              onChange={(e) =>
                updateFilter('coa', e.target.checked ? 'true' : undefined)
              }
              sx={{ py: 0.75 }}
            />
          }
          label={<Typography variant="body2" fontWeight={500}>COA Approved only</Typography>}
        />
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Search */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Search Colleges</SectionLabel>
        <CollegeSearch placeholder="Search by name or city..." />
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Accepted Exam */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Accepted Exam</SectionLabel>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          <Chip
            label="All"
            size="small"
            clickable
            variant={!filters.exam ? 'filled' : 'outlined'}
            color={!filters.exam ? 'primary' : 'default'}
            onClick={() => updateFilter('exam', undefined)}
          />
          {EXAM_TYPES.map((ex) => (
            <Chip
              key={ex.value}
              label={ex.label}
              size="small"
              clickable
              variant={filters.exam === ex.value ? 'filled' : 'outlined'}
              color={filters.exam === ex.value ? 'primary' : 'default'}
              onClick={() =>
                updateFilter('exam', filters.exam === ex.value ? undefined : ex.value)
              }
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Ownership / College Type */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Ownership</SectionLabel>
        <FormGroup>
          {COLLEGE_TYPES.map((t) => {
            const countEntry = typeCounts?.find((tc) => tc.type === t.value);
            return (
              <FormControlLabel
                key={t.value}
                control={
                  <Checkbox
                    size="small"
                    checked={filters.type === t.value}
                    onChange={(e) =>
                      updateFilter('type', e.target.checked ? t.value : undefined)
                    }
                    sx={{ py: 0.5 }}
                  />
                }
                label={
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                    <Typography variant="body2">{t.label}</Typography>
                    {countEntry && (
                      <Typography variant="caption" color="text.secondary">
                        {countEntry.count}
                      </Typography>
                    )}
                  </Stack>
                }
                sx={{ mr: 0, width: '100%' }}
              />
            );
          })}
        </FormGroup>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* NAAC Grade */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>NAAC Grade</SectionLabel>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {NAAC_GRADES.map((g) => (
            <Chip
              key={g}
              label={g}
              size="small"
              clickable
              variant={filters.naacGrade === g ? 'filled' : 'outlined'}
              color={filters.naacGrade === g ? 'primary' : 'default'}
              onClick={() =>
                updateFilter('naac', filters.naacGrade === g ? undefined : g)
              }
            />
          ))}
        </Stack>
      </Box>

      <Divider sx={{ my: 1 }} />

      {/* Annual Fee Range */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Annual Fee</SectionLabel>
        <Stack direction="row" gap={1}>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Min</InputLabel>
            <Select
              label="Min"
              value={filters.minFee?.toString() ?? ''}
              onChange={(e) => updateFilter('minFee', e.target.value || undefined)}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="50000">50K</MenuItem>
              <MenuItem value="100000">1L</MenuItem>
              <MenuItem value="200000">2L</MenuItem>
              <MenuItem value="500000">5L</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ flex: 1 }}>
            <InputLabel>Max</InputLabel>
            <Select
              label="Max"
              value={filters.maxFee?.toString() ?? ''}
              onChange={(e) => updateFilter('maxFee', e.target.value || undefined)}
            >
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="100000">1L</MenuItem>
              <MenuItem value="200000">2L</MenuItem>
              <MenuItem value="500000">5L</MenuItem>
              <MenuItem value="1000000">10L</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {/* Fee preset chips */}
        <Stack direction="row" flexWrap="wrap" gap={0.75} sx={{ mt: 1 }}>
          {FEE_PRESETS.map((preset) => (
            <Chip
              key={preset.label}
              label={preset.label}
              size="small"
              clickable
              variant={
                filters.minFee === preset.minFee && filters.maxFee === preset.maxFee
                  ? 'filled'
                  : 'outlined'
              }
              color={
                filters.minFee === preset.minFee && filters.maxFee === preset.maxFee
                  ? 'primary'
                  : 'default'
              }
              onClick={() => {
                const params = new URLSearchParams(searchParams.toString());
                if (filters.minFee === preset.minFee && filters.maxFee === preset.maxFee) {
                  params.delete('minFee');
                  params.delete('maxFee');
                } else {
                  if (preset.minFee !== undefined) params.set('minFee', String(preset.minFee));
                  else params.delete('minFee');
                  if (preset.maxFee !== undefined) params.set('maxFee', String(preset.maxFee));
                  else params.delete('maxFee');
                }
                params.delete('page');
                router.push(`${pathname}?${params.toString()}`);
                if (onClose) onClose();
              }}
            />
          ))}
        </Stack>
      </Box>

      {/* City Filter (only if cityCounts provided) */}
      {cityCounts && cityCounts.length > 0 && (
        <>
          <Divider sx={{ my: 1 }} />
          <Box sx={{ mb: 1.75 }}>
            <SectionLabel>City</SectionLabel>
            <FormGroup>
              {visibleCities?.map((c) => (
                <FormControlLabel
                  key={c.city_slug}
                  control={
                    <Checkbox
                      size="small"
                      checked={filters.city === c.city_slug}
                      onChange={(e) =>
                        updateFilter('city', e.target.checked ? c.city_slug : undefined)
                      }
                      sx={{ py: 0.5 }}
                    />
                  }
                  label={
                    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
                      <Typography variant="body2">{c.city}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {c.count}
                      </Typography>
                    </Stack>
                  }
                  sx={{ mr: 0, width: '100%' }}
                />
              ))}
            </FormGroup>
            {(cityCounts.length ?? 0) > 4 && (
              <Button
                size="small"
                onClick={() => setShowAllCities(!showAllCities)}
                sx={{ fontSize: '0.7rem', textTransform: 'none', px: 0 }}
              >
                {showAllCities ? 'Show less' : `+ ${cityCounts.length - 4} more`}
              </Button>
            )}
          </Box>
        </>
      )}

      <Divider sx={{ my: 1 }} />

      {/* Rating */}
      <Box sx={{ mb: 1.75 }}>
        <SectionLabel>Rating</SectionLabel>
        <Stack direction="row" flexWrap="wrap" gap={0.75}>
          {[
            { label: '4★ & above', value: 4 },
            { label: '3★ & above', value: 3 },
            { label: 'Any', value: undefined },
          ].map((r) => (
            <Chip
              key={r.label}
              label={r.label}
              size="small"
              clickable
              variant={filters.rating === r.value ? 'filled' : 'outlined'}
              color={filters.rating === r.value ? 'primary' : 'default'}
              onClick={() =>
                updateFilter('rating', r.value !== undefined ? String(r.value) : undefined)
              }
            />
          ))}
        </Stack>
      </Box>

      {/* Result count */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {totalCount.toLocaleString()} colleges match
      </Typography>
    </Box>
  );
}

export default function FilterSidebar({
  filters,
  totalCount,
  cityCounts,
  typeCounts,
  onChange,
}: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFilterCount = [
    filters.state,
    filters.type,
    filters.counselingSystem,
    filters.naacGrade,
    filters.coa,
    filters.minFee,
    filters.maxFee,
    filters.exam,
    filters.city,
    filters.rating,
    filters.search,
  ].filter(Boolean).length;

  return (
    <>
      {/* Mobile: floating filter + sort FAB-style pills */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          gap: 1,
          zIndex: 1100,
        }}
      >
        <Button
          variant="contained"
          onClick={() => setMobileOpen(true)}
          sx={{
            borderRadius: 6,
            px: 2.5,
            py: 1.2,
            fontWeight: 600,
            fontSize: '0.8rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            textTransform: 'none',
            minHeight: 44,
          }}
          startIcon={<FilterListIcon />}
        >
          Filters
          {activeFilterCount > 0 && (
            <Box
              component="span"
              sx={{
                ml: 0.75,
                bgcolor: '#ef4444',
                color: 'white',
                fontSize: '0.65rem',
                width: 18,
                height: 18,
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {activeFilterCount}
            </Box>
          )}
        </Button>
        <Button
          variant="outlined"
          onClick={() => setSortOpen(true)}
          sx={{
            borderRadius: 6,
            px: 2,
            py: 1.2,
            fontWeight: 600,
            fontSize: '0.8rem',
            bgcolor: 'white',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            textTransform: 'none',
            minHeight: 44,
          }}
        >
          ↕ Sort
        </Button>
      </Box>

      {/* Mobile: full filter bottom drawer */}
      <Drawer
        anchor="bottom"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            maxHeight: '85vh',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          },
        }}
      >
        <Box sx={{ overflow: 'auto', pb: 8 }}>
          <SidebarContent
            filters={filters}
            totalCount={totalCount}
            cityCounts={cityCounts}
            typeCounts={typeCounts}
            onClose={() => setMobileOpen(false)}
          />
        </Box>
        {/* Sticky Apply footer */}
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            bgcolor: 'background.paper',
            borderTop: 1,
            borderColor: 'divider',
            px: 2,
            py: 1.5,
            display: 'flex',
            gap: 1,
          }}
        >
          <Button
            variant="outlined"
            size="small"
            fullWidth
            onClick={() => {
              router.push(pathname);
              setMobileOpen(false);
            }}
            sx={{ minHeight: 44, textTransform: 'none' }}
          >
            Reset
          </Button>
          <Button
            variant="contained"
            size="small"
            fullWidth
            onClick={() => setMobileOpen(false)}
            sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
          >
            Show {totalCount.toLocaleString()} colleges
          </Button>
        </Box>
      </Drawer>

      {/* Mobile: sort-only bottom drawer */}
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
        <Box sx={{ p: 2 }}>
          {/* Drag handle */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'grey.300' }} />
          </Box>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="subtitle1" fontWeight={700}>Sort By</Typography>
            <IconButton size="small" onClick={() => setSortOpen(false)}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
          <Stack gap={0.5}>
            {SORT_OPTIONS.map((opt) => {
              const isSelected = (filters.sortBy ?? 'arch_index') === opt.value;
              return (
                <Button
                  key={opt.value}
                  fullWidth
                  variant={isSelected ? 'contained' : 'text'}
                  onClick={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set('sort', opt.value);
                    params.delete('page');
                    router.push(`${pathname}?${params.toString()}`);
                    setSortOpen(false);
                  }}
                  sx={{
                    justifyContent: 'flex-start',
                    textTransform: 'none',
                    fontWeight: isSelected ? 700 : 400,
                    minHeight: 44,
                    px: 2,
                    borderRadius: 2,
                  }}
                >
                  {opt.label}
                </Button>
              );
            })}
          </Stack>
        </Box>
      </Drawer>

      {/* Desktop: sidebar content (stickiness handled by CollegeListingLayout) */}
      <Paper
        variant="outlined"
        sx={{
          display: { xs: 'none', md: 'block' },
          borderRadius: 2,
        }}
      >
        <SidebarContent
          filters={filters}
          totalCount={totalCount}
          cityCounts={cityCounts}
          typeCounts={typeCounts}
          onChange={onChange}
        />
      </Paper>
    </>
  );
}
