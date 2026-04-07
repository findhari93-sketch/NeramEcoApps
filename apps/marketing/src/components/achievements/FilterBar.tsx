'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Chip,
  Button,
  Select,
  MenuItem,
  InputBase,
  InputAdornment,
  IconButton,
  Collapse,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import ClearAllIcon from '@mui/icons-material/ClearAll';
import CloseIcon from '@mui/icons-material/Close';

interface FilterBarProps {
  filters: {
    search: string;
    exam_type: string;
    year: string;
    college: string;
    sort: string;
  };
  onFilterChange: (key: string, value: string) => void;
  onClearFilters: () => void;
  filterOptions: {
    years: number[];
    colleges: string[];
    exam_types: string[];
  };
  hasActiveFilters: boolean;
}

const EXAM_CHIP_CONFIG: {
  value: string;
  label: string;
  color: string;
}[] = [
  { value: '', label: 'All', color: 'rgba(245,240,232,0.7)' },
  { value: 'nata', label: 'NATA', color: '#1a8fff' },
  { value: 'jee_paper2', label: 'JEE Paper 2', color: '#4caf50' },
  { value: 'tnea', label: 'TNEA', color: '#ff9800' },
  { value: 'other', label: 'Placements', color: '#e8a020' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'score_desc', label: 'Highest Score' },
  { value: 'rank_asc', label: 'Best Rank' },
  { value: 'name_asc', label: 'Name (A-Z)' },
];

const inputBaseSx = {
  bgcolor: 'rgba(11,22,41,0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#f5f0e8',
  px: 1.5,
  py: 0.5,
  minHeight: 48,
  fontSize: '0.875rem',
  transition: 'border-color 0.2s ease',
  '&:hover': {
    borderColor: 'rgba(255,255,255,0.15)',
  },
  '&.Mui-focused': {
    borderColor: 'rgba(232,160,32,0.4)',
  },
  '& .MuiInputBase-input': {
    color: '#f5f0e8',
    '&::placeholder': {
      color: 'rgba(245,240,232,0.4)',
      opacity: 1,
    },
  },
};

const selectSx = {
  bgcolor: 'rgba(11,22,41,0.75)',
  backdropFilter: 'blur(12px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '12px',
  color: '#f5f0e8',
  minHeight: 48,
  fontSize: '0.875rem',
  '& .MuiSelect-select': {
    py: 1.5,
    px: 1.5,
  },
  '& .MuiSelect-icon': {
    color: 'rgba(245,240,232,0.5)',
  },
  '&:hover': {
    borderColor: 'rgba(255,255,255,0.15)',
  },
  '& fieldset': { border: 'none' },
};

const menuPaperSx = {
  bgcolor: '#0b1629',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#f5f0e8',
  '& .MuiMenuItem-root': {
    fontSize: '0.875rem',
    '&:hover': {
      bgcolor: 'rgba(232,160,32,0.08)',
    },
    '&.Mui-selected': {
      bgcolor: 'rgba(232,160,32,0.15)',
      '&:hover': {
        bgcolor: 'rgba(232,160,32,0.2)',
      },
    },
  },
};

export default function FilterBar({
  filters,
  onFilterChange,
  onClearFilters,
  filterOptions,
  hasActiveFilters,
}: FilterBarProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [filtersOpen, setFiltersOpen] = useState(false);

  const examChips = EXAM_CHIP_CONFIG.filter(
    (chip) => chip.value === '' || filterOptions.exam_types.includes(chip.value)
  );

  const searchInput = (
    <InputBase
      fullWidth
      placeholder="Search students..."
      value={filters.search}
      onChange={(e) => onFilterChange('search', e.target.value)}
      startAdornment={
        <InputAdornment position="start">
          <SearchIcon sx={{ color: 'rgba(245,240,232,0.4)', fontSize: 20 }} />
        </InputAdornment>
      }
      endAdornment={
        filters.search ? (
          <InputAdornment position="end">
            <IconButton
              size="small"
              onClick={() => onFilterChange('search', '')}
              sx={{ color: 'rgba(245,240,232,0.4)' }}
            >
              <CloseIcon sx={{ fontSize: 18 }} />
            </IconButton>
          </InputAdornment>
        ) : null
      }
      sx={inputBaseSx}
    />
  );

  const examTypeChips = (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {examChips.map((chip) => {
        const isActive = filters.exam_type === chip.value;
        return (
          <Chip
            key={chip.value}
            label={chip.label}
            variant={isActive ? 'filled' : 'outlined'}
            onClick={() => onFilterChange('exam_type', chip.value)}
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              height: 36,
              minWidth: 48,
              color: isActive ? '#fff' : chip.color,
              bgcolor: isActive ? `${chip.color}` : 'transparent',
              borderColor: isActive ? chip.color : `${chip.color}40`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              '&:hover': {
                bgcolor: isActive ? chip.color : `${chip.color}15`,
                borderColor: chip.color,
              },
            }}
          />
        );
      })}
    </Box>
  );

  const yearSelect = filterOptions.years.length > 0 && (
    <Select
      value={filters.year}
      onChange={(e) => onFilterChange('year', e.target.value as string)}
      displayEmpty
      size="small"
      sx={{ ...selectSx, minWidth: 120 }}
      MenuProps={{ PaperProps: { sx: menuPaperSx } }}
    >
      <MenuItem value="">All Years</MenuItem>
      {filterOptions.years.map((y) => (
        <MenuItem key={y} value={String(y)}>
          {y}
        </MenuItem>
      ))}
    </Select>
  );

  const sortSelect = (
    <Select
      value={filters.sort}
      onChange={(e) => onFilterChange('sort', e.target.value as string)}
      size="small"
      sx={{ ...selectSx, minWidth: 140 }}
      MenuProps={{ PaperProps: { sx: menuPaperSx } }}
    >
      {SORT_OPTIONS.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
    </Select>
  );

  const clearButton = hasActiveFilters && (
    <Button
      size="small"
      startIcon={<ClearAllIcon />}
      onClick={onClearFilters}
      sx={{
        color: 'rgba(245,240,232,0.6)',
        textTransform: 'none',
        fontSize: '0.8rem',
        whiteSpace: 'nowrap',
        '&:hover': {
          color: '#e8a020',
          bgcolor: 'rgba(232,160,32,0.08)',
        },
      }}
    >
      Clear Filters
    </Button>
  );

  // Mobile layout: search + filter toggle, collapsible panel
  if (isMobile) {
    return (
      <Box sx={{ mb: 3 }}>
        {/* Search row */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
          <Box sx={{ flexGrow: 1 }}>{searchInput}</Box>
          <IconButton
            onClick={() => setFiltersOpen(!filtersOpen)}
            sx={{
              bgcolor: filtersOpen
                ? 'rgba(232,160,32,0.15)'
                : 'rgba(11,22,41,0.75)',
              border: '1px solid',
              borderColor: filtersOpen
                ? 'rgba(232,160,32,0.3)'
                : 'rgba(255,255,255,0.08)',
              borderRadius: '12px',
              color: filtersOpen ? '#e8a020' : 'rgba(245,240,232,0.6)',
              width: 48,
              height: 48,
              transition: 'all 0.2s ease',
            }}
          >
            <TuneIcon />
          </IconButton>
        </Box>

        {/* Collapsible filter panel */}
        <Collapse in={filtersOpen}>
          <Box
            sx={{
              bgcolor: 'rgba(11,22,41,0.6)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '12px',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <Box>
              <Typography
                variant="caption"
                sx={{ color: 'rgba(245,240,232,0.4)', mb: 1, display: 'block' }}
              >
                Exam Type
              </Typography>
              {examTypeChips}
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'rgba(245,240,232,0.4)', mb: 0.5, display: 'block' }}
                >
                  Year
                </Typography>
                {yearSelect}
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{ color: 'rgba(245,240,232,0.4)', mb: 0.5, display: 'block' }}
                >
                  Sort By
                </Typography>
                {sortSelect}
              </Box>
            </Box>

            {clearButton && (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                {clearButton}
              </Box>
            )}
          </Box>
        </Collapse>
      </Box>
    );
  }

  // Desktop layout: single row
  return (
    <Box
      sx={{
        mb: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flexWrap: 'wrap',
      }}
    >
      <Box sx={{ minWidth: 220, maxWidth: 300, flexGrow: 1 }}>{searchInput}</Box>
      {examTypeChips}
      <Box sx={{ display: 'flex', gap: 1.5, ml: 'auto', alignItems: 'center' }}>
        {yearSelect}
        {sortSelect}
        {clearButton}
      </Box>
    </Box>
  );
}
