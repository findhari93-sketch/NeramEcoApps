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

const COLLEGE_TYPES = [
  { value: 'Government', label: 'Government' },
  { value: 'Private', label: 'Private' },
  { value: 'Deemed', label: 'Deemed University' },
  { value: 'Autonomous', label: 'Autonomous' },
];

const COUNSELING_SYSTEMS = [
  { value: 'TNEA', label: 'TNEA (Tamil Nadu)' },
  { value: 'JoSAA', label: 'JoSAA (Central)' },
  { value: 'NATA', label: 'NATA Direct' },
];

const NAAC_GRADES = ['A++', 'A+', 'A', 'B++', 'B+', 'B'];

const SORT_OPTIONS = [
  { value: 'arch_index', label: 'ArchIndex Score' },
  { value: 'nirf_rank', label: 'NIRF Rank' },
  { value: 'fee_low', label: 'Fee: Low to High' },
  { value: 'fee_high', label: 'Fee: High to Low' },
  { value: 'name', label: 'Name (A-Z)' },
];

interface FilterSidebarProps {
  filters: CollegeFilters;
  totalCount: number;
  onChange?: () => void;
}

function SidebarContent({
  filters,
  totalCount,
  onClose,
}: FilterSidebarProps & { onClose?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
  ].filter(Boolean).length;

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" alignItems="center" gap={1}>
          <FilterListIcon sx={{ fontSize: 18 }} />
          <Typography variant="subtitle1" fontWeight={700}>Filters</Typography>
          {activeFilterCount > 0 && (
            <Chip label={activeFilterCount} size="small" color="primary" />
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

      {/* Sort */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Sort By
        </Typography>
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

      <Divider sx={{ my: 1.5 }} />

      {/* College Type */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          College Type
        </Typography>
        <FormGroup>
          {COLLEGE_TYPES.map((t) => (
            <FormControlLabel
              key={t.value}
              control={
                <Checkbox
                  size="small"
                  checked={filters.type === t.value}
                  onChange={(e) =>
                    updateFilter('type', e.target.checked ? t.value : undefined)
                  }
                />
              }
              label={<Typography variant="body2">{t.label}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Counseling System */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Counseling System
        </Typography>
        <FormGroup>
          {COUNSELING_SYSTEMS.map((t) => (
            <FormControlLabel
              key={t.value}
              control={
                <Checkbox
                  size="small"
                  checked={filters.counselingSystem === t.value}
                  onChange={(e) =>
                    updateFilter('counseling', e.target.checked ? t.value : undefined)
                  }
                />
              }
              label={<Typography variant="body2">{t.label}</Typography>}
            />
          ))}
        </FormGroup>
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* NAAC Grade */}
      <Box sx={{ mb: 2.5 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          NAAC Grade
        </Typography>
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

      <Divider sx={{ my: 1.5 }} />

      {/* COA Approved */}
      <Box sx={{ mb: 2.5 }}>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={filters.coa === true}
              onChange={(e) =>
                updateFilter('coa', e.target.checked ? 'true' : undefined)
              }
            />
          }
          label={<Typography variant="body2">COA Approved only</Typography>}
        />
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Annual Fee Range */}
      <Box sx={{ mb: 2 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          fontWeight={600}
          sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          Annual Fee
        </Typography>
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
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {/* Result count */}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
        {totalCount.toLocaleString()} colleges match
      </Typography>
    </Box>
  );
}

export default function FilterSidebar({ filters, totalCount }: FilterSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile: floating filter button */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setMobileOpen(true)}
          size="small"
        >
          Filters and Sort
        </Button>
      </Box>

      {/* Mobile bottom drawer */}
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
        <Box sx={{ overflow: 'auto' }}>
          <SidebarContent
            filters={filters}
            totalCount={totalCount}
            onClose={() => setMobileOpen(false)}
          />
        </Box>
      </Drawer>

      {/* Desktop sticky sidebar */}
      <Paper
        variant="outlined"
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'sticky',
          top: 80,
          maxHeight: 'calc(100vh - 100px)',
          overflow: 'auto',
        }}
      >
        <SidebarContent filters={filters} totalCount={totalCount} />
      </Paper>
    </>
  );
}
