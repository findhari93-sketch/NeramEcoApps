'use client';

import { useMemo } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import type { GeographicCountryNode } from '@neram/database';

export interface GeographicFilterValues {
  country: string | null;
  state: string | null;
  district: string | null;
  city: string | null;
}

interface GeographicFiltersProps {
  hierarchy: GeographicCountryNode[];
  filters: GeographicFilterValues;
  onFilterChange: (filters: GeographicFilterValues) => void;
  onClear: () => void;
  /** When true, renders inline without its own collapse/toggle wrapper */
  inline?: boolean;
}

export default function GeographicFilters({
  hierarchy,
  filters,
  onFilterChange,
  onClear,
  inline = false,
}: GeographicFiltersProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const hasActiveFilters = filters.country || filters.state || filters.district || filters.city;

  // Derive dropdown options from hierarchy
  const countryOptions = hierarchy.map((c) => ({ value: c.country, label: c.country_display }));

  const stateOptions = useMemo(() => {
    if (!filters.country) return [];
    const country = hierarchy.find((c) => c.country === filters.country);
    return (country?.states || []).map((s) => ({ value: s.state, label: s.state }));
  }, [hierarchy, filters.country]);

  const districtOptions = useMemo(() => {
    if (!filters.country || !filters.state) return [];
    const country = hierarchy.find((c) => c.country === filters.country);
    const state = country?.states.find((s) => s.state === filters.state);
    const districts = new Set<string>();
    for (const city of state?.cities || []) {
      if (city.district) districts.add(city.district);
    }
    return Array.from(districts)
      .sort()
      .map((d) => ({ value: d, label: d }));
  }, [hierarchy, filters.country, filters.state]);

  const cityOptions = useMemo(() => {
    if (!filters.country || !filters.state) return [];
    const country = hierarchy.find((c) => c.country === filters.country);
    const state = country?.states.find((s) => s.state === filters.state);
    let cities = state?.cities || [];
    if (filters.district) {
      cities = cities.filter((c) => c.district === filters.district);
    }
    return cities.map((c) => ({ value: c.city, label: c.city }));
  }, [hierarchy, filters.country, filters.state, filters.district]);

  const handleChange = (field: keyof GeographicFilterValues, value: string | null) => {
    const next = { ...filters };
    next[field] = value;

    if (field === 'country') {
      next.state = null;
      next.district = null;
      next.city = null;
    } else if (field === 'state') {
      next.district = null;
      next.city = null;
    } else if (field === 'district') {
      next.city = null;
    }

    onFilterChange(next);
  };

  const selectSx = {
    minHeight: 44,
    borderRadius: 2,
    backgroundColor: 'background.paper',
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: alpha(theme.palette.divider, 0.8),
    },
    '&:hover .MuiOutlinedInput-notchedOutline': {
      borderColor: theme.palette.primary.light,
    },
  };

  return (
    <Box>
      {/* Filter label row */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Filter by location
        </Typography>
        {hasActiveFilters && (
          <Button
            size="small"
            onClick={onClear}
            startIcon={<CloseIcon sx={{ fontSize: 14 }} />}
            sx={{ textTransform: 'none', fontSize: 12, minHeight: 28, px: 1 }}
          >
            Clear all
          </Button>
        )}
      </Box>

      {/* Filter dropdowns */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: districtOptions.length > 0 || cityOptions.length > 0
              ? 'repeat(2, 1fr)'
              : 'repeat(2, 1fr)',
            md: districtOptions.length > 0
              ? 'repeat(4, 1fr)'
              : cityOptions.length > 0
                ? 'repeat(3, 1fr)'
                : 'repeat(2, 1fr)',
          },
          gap: 1.5,
        }}
      >
        <FormControl size="small" fullWidth>
          <InputLabel>Country</InputLabel>
          <Select
            value={filters.country || ''}
            label="Country"
            onChange={(e) => handleChange('country', e.target.value || null)}
            sx={selectSx}
          >
            <MenuItem value="">All Countries</MenuItem>
            {countryOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" fullWidth disabled={!filters.country}>
          <InputLabel>State</InputLabel>
          <Select
            value={filters.state || ''}
            label="State"
            onChange={(e) => handleChange('state', e.target.value || null)}
            sx={selectSx}
          >
            <MenuItem value="">All States</MenuItem>
            {stateOptions.map((o) => (
              <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {districtOptions.length > 0 && (
          <FormControl size="small" fullWidth disabled={!filters.state}>
            <InputLabel>District</InputLabel>
            <Select
              value={filters.district || ''}
              label="District"
              onChange={(e) => handleChange('district', e.target.value || null)}
              sx={selectSx}
            >
              <MenuItem value="">All Districts</MenuItem>
              {districtOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {cityOptions.length > 0 && (
          <FormControl size="small" fullWidth disabled={!filters.state}>
            <InputLabel>City</InputLabel>
            <Select
              value={filters.city || ''}
              label="City"
              onChange={(e) => handleChange('city', e.target.value || null)}
              sx={selectSx}
            >
              <MenuItem value="">All Cities</MenuItem>
              {cityOptions.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
      </Box>
    </Box>
  );
}
