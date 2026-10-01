'use client';

import { useEffect, useRef, useState } from 'react';
import { Autocomplete, CircularProgress, TextField } from '@mui/material';

export interface CollegeSearchOption {
  id: string;
  name: string;
  short_name?: string | null;
  city?: string | null;
  neram_tier?: string | null;
}

interface CollegeSearchFieldProps {
  value: CollegeSearchOption | null;
  onChange: (college: CollegeSearchOption | null) => void;
  label?: string;
  /** Limit the search to one partnership tier, e.g. 'platinum'. */
  tier?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
}

const PAGE = 20;
const DEBOUNCE_MS = 300;

/**
 * A college picker that searches on the server (name, short name or city), 20 at
 * a time, instead of loading every college into a dropdown. The first 20 load
 * when the field opens, so it still works as a plain list for short catalogues.
 */
export default function CollegeSearchField({
  value,
  onChange,
  label = 'College',
  tier,
  required,
  disabled,
  helperText,
}: CollegeSearchFieldProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [options, setOptions] = useState<CollegeSearchOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const params = new URLSearchParams({ fields: 'options', limit: String(PAGE) });
        if (input.trim()) params.set('q', input.trim());
        if (tier) params.set('tier', tier);
        const res = await fetch(`/api/college-hub/colleges?${params.toString()}`, { cache: 'no-store' });
        const json = await res.json();
        if (mine !== seq.current) return;
        if (!res.ok) throw new Error(json.error || 'Search failed');
        setOptions(json.data ?? []);
      } catch {
        if (mine === seq.current) {
          setFailed(true);
          setOptions([]);
        }
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, input ? DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [open, input, tier]);

  return (
    <Autocomplete
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      value={value}
      onChange={(_, v) => onChange(v)}
      inputValue={input}
      onInputChange={(_, v, reason) => {
        // Selecting an option fills the box with its name; that is not a new search.
        if (reason !== 'reset') setInput(v);
      }}
      options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
      // The server already filtered; do not filter again on the client.
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      renderOption={(props, o) => (
        <li {...props} key={o.id}>
          {o.name}
          {o.city ? `, ${o.city}` : ''}
        </li>
      )}
      loading={loading}
      disabled={disabled}
      noOptionsText={failed ? 'Could not load colleges. Try again.' : input.trim() ? 'No colleges match' : 'Type to search colleges'}
      renderInput={(params) => (
        <TextField
          {...params}
          label={required ? `${label} *` : label}
          size="small"
          fullWidth
          placeholder="Search by name or city"
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} aria-label="Searching colleges" /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
