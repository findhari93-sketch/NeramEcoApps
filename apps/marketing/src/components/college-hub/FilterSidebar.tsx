'use client';

import {
  Box,
  Button,
  Checkbox,
  Divider,
  Drawer,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Slider,
  Stack,
  Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import CloseIcon from '@mui/icons-material/Close';
import { useState } from 'react';
import { COLLEGE_TYPES, COUNSELING_LABELS, NAAC_GRADES, SORT_OPTIONS } from '@/lib/college-hub/constants';
import type { CollegeFilters } from '@/lib/college-hub/types';

interface FilterSidebarProps {
  filters: CollegeFilters;
  onChange: (filters: CollegeFilters) => void;
  totalCount: number;
}

export default function FilterSidebar({ filters, onChange, totalCount }: FilterSidebarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleReset = () => {
    onChange({ sortBy: 'arch_index', page: 1 });
  };

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => !['sortBy', 'page', 'limit'].includes(k) && v !== undefined
  ).length;

  const SidebarContent = (
    <Box sx={{ p: 2.5, width: { xs: 300, sm: 280 } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
          Filters
        </Typography>
        <Stack direction="row" gap={1}>
          {activeFilterCount > 0 && (
            <Button size="small" color="error" onClick={handleReset}>
              Clear all
            </Button>
          )}
          <Box sx={{ display: { sm: 'none' } }}>
            <Button size="small" onClick={() => setDrawerOpen(false)}>
              <CloseIcon />
            </Button>
          </Box>
        </Stack>
      </Stack>

      {/* Sort */}
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Sort By
      </Typography>
      <RadioGroup
        value={filters.sortBy ?? 'arch_index'}
        onChange={(e) => onChange({ ...filters, sortBy: e.target.value as CollegeFilters['sortBy'], page: 1 })}
        sx={{ mt: 0.5, mb: 2 }}
      >
        {SORT_OPTIONS.map((opt) => (
          <FormControlLabel
            key={opt.value}
            value={opt.value}
            control={<Radio size="small" />}
            label={<Typography variant="body2">{opt.label}</Typography>}
          />
        ))}
      </RadioGroup>

      <Divider sx={{ mb: 2 }} />

      {/* Type */}
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        College Type
      </Typography>
      <FormGroup sx={{ mt: 0.5, mb: 2 }}>
        {COLLEGE_TYPES.map((t) => (
          <FormControlLabel
            key={t.value}
            control={
              <Checkbox
                size="small"
                checked={filters.type === t.value}
                onChange={(e) => onChange({ ...filters, type: e.target.checked ? t.value : undefined, page: 1 })}
              />
            }
            label={<Typography variant="body2">{t.label}</Typography>}
          />
        ))}
      </FormGroup>

      <Divider sx={{ mb: 2 }} />

      {/* Counseling */}
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        Counseling
      </Typography>
      <FormGroup sx={{ mt: 0.5, mb: 2 }}>
        {Object.entries(COUNSELING_LABELS).map(([value, label]) => (
          <FormControlLabel
            key={value}
            control={
              <Checkbox
                size="small"
                checked={filters.counselingSystem === value}
                onChange={(e) =>
                  onChange({ ...filters, counselingSystem: e.target.checked ? (value as CollegeFilters['counselingSystem']) : undefined, page: 1 })
                }
              />
            }
            label={<Typography variant="body2">{label}</Typography>}
          />
        ))}
      </FormGroup>

      <Divider sx={{ mb: 2 }} />

      {/* NAAC Grade */}
      <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        NAAC Grade
      </Typography>
      <FormGroup sx={{ mt: 0.5, mb: 2 }}>
        {NAAC_GRADES.map((grade) => (
          <FormControlLabel
            key={grade}
            control={
              <Checkbox
                size="small"
                checked={filters.naacGrade === grade}
                onChange={(e) => onChange({ ...filters, naacGrade: e.target.checked ? grade : undefined, page: 1 })}
              />
            }
            label={<Typography variant="body2">{grade}</Typography>}
          />
        ))}
      </FormGroup>

      <Divider sx={{ mb: 2 }} />

      {/* COA */}
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={filters.coa === true}
            onChange={(e) => onChange({ ...filters, coa: e.target.checked ? true : undefined, page: 1 })}
          />
        }
        label={<Typography variant="body2" sx={{ fontWeight: 500 }}>COA Approved Only</Typography>}
      />

      {/* Annual Fee slider */}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Annual Fee (approx)
        </Typography>
        <Slider
          value={[filters.minFee ?? 0, filters.maxFee ?? 500000]}
          min={0}
          max={500000}
          step={10000}
          onChange={(_, v) => {
            const [min, max] = v as [number, number];
            onChange({ ...filters, minFee: min > 0 ? min : undefined, maxFee: max < 500000 ? max : undefined, page: 1 });
          }}
          valueLabelDisplay="auto"
          valueLabelFormat={(v) => v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${(v / 1000).toFixed(0)}K`}
          sx={{ mt: 1 }}
        />
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="caption" color="text.secondary">₹0</Typography>
          <Typography variant="caption" color="text.secondary">₹5L+</Typography>
        </Stack>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Mobile trigger */}
      <Box sx={{ display: { md: 'none' }, mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setDrawerOpen(true)}
          size="small"
        >
          Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
          {totalCount.toLocaleString()} colleges
        </Typography>
      </Box>

      {/* Mobile drawer */}
      <Drawer
        anchor="left"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sx={{ display: { md: 'none' } }}
      >
        {SidebarContent}
      </Drawer>

      {/* Desktop sidebar */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        {SidebarContent}
      </Box>
    </>
  );
}
