'use client';

import { useState, useCallback, useRef } from 'react';
import { Autocomplete, TextField, CircularProgress, Box, Typography } from '@neram/ui';
import type { CoaInstitution } from '@neram/database';
import { searchCoaColleges } from '@neram/database';
import COAStatusBadge from './COAStatusBadge';

interface COASearchBarProps {
  onSelect: (institution: CoaInstitution | null) => void;
}

export default function COASearchBar({ onSelect }: COASearchBarProps) {
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<CoaInstitution[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchOptions = useCallback(async (term: string) => {
    if (term.length < 2) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const results = await searchCoaColleges(term, 12);
      setOptions(results);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (_: React.SyntheticEvent, value: string) => {
    setInputValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(value), 300);
  };

  return (
    <Autocomplete
      freeSolo
      options={options}
      getOptionLabel={(opt) =>
        typeof opt === 'string' ? opt : `${opt.name} — ${opt.city}, ${opt.state}`
      }
      filterOptions={(x) => x}
      loading={loading}
      inputValue={inputValue}
      onInputChange={handleInputChange}
      onChange={(_, value) => {
        if (value && typeof value !== 'string') {
          onSelect(value as CoaInstitution);
        } else {
          onSelect(null);
        }
      }}
      renderOption={(props, option) => {
        const inst = option as CoaInstitution;
        return (
          <Box component="li" {...props} key={inst.id} sx={{ py: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>
                  {inst.name}
                </Typography>
                <COAStatusBadge status={inst.approval_status} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {inst.city}, {inst.state} · Code: {inst.institution_code}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search college name, city, or code..."
          size="small"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading && <CircularProgress size={16} />}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      sx={{ width: '100%' }}
    />
  );
}
