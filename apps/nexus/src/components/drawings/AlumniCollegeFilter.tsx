'use client';

import { useState, useEffect, useMemo } from 'react';
import { Box, TextField, MenuItem, Autocomplete } from '@neram/ui';

interface AlumniCollege {
  id: string;
  name: string;
  short_name: string | null;
  city: string | null;
  state: string | null;
}

interface AlumniCollegeFilterProps {
  getToken: () => Promise<string | null>;
  value: string;
  onChange: (collegeId: string) => void;
}

const labelFor = (c: AlumniCollege) => [c.name, c.city, c.state].filter(Boolean).join(', ');

/**
 * Filter for the Hall of Fame: a state narrower plus a searchable college box.
 * Lists only colleges where Neram seniors actually studied (from
 * /api/drawing/alumni-colleges), so every option returns real works. Reusable
 * by the Phase 2 Alumni Directory.
 */
export default function AlumniCollegeFilter({ getToken, value, onChange }: AlumniCollegeFilterProps) {
  const [colleges, setColleges] = useState<AlumniCollege[]>([]);
  const [stateFilter, setStateFilter] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/drawing/alumni-colleges', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (active) setColleges(data.colleges || []);
      } catch {
        if (active) setColleges([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [getToken]);

  const states = useMemo(
    () => [...new Set(colleges.map((c) => c.state).filter(Boolean))].sort() as string[],
    [colleges],
  );

  const visibleColleges = useMemo(
    () => (stateFilter ? colleges.filter((c) => c.state === stateFilter) : colleges),
    [colleges, stateFilter],
  );

  const selected = colleges.find((c) => c.id === value) || null;

  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
      <TextField
        select
        size="small"
        label="State"
        value={stateFilter}
        onChange={(e) => {
          const next = e.target.value;
          setStateFilter(next);
          // Clear the selected college if it no longer matches the chosen state.
          if (value && next) {
            const sel = colleges.find((c) => c.id === value);
            if (sel && sel.state !== next) onChange('');
          }
        }}
        sx={{ minWidth: 130 }}
      >
        <MenuItem value="">All states</MenuItem>
        {states.map((s) => (
          <MenuItem key={s} value={s}>
            {s}
          </MenuItem>
        ))}
      </TextField>

      <Autocomplete
        size="small"
        options={visibleColleges}
        value={selected}
        getOptionLabel={(opt: any) => (typeof opt === 'string' ? opt : labelFor(opt))}
        isOptionEqualToValue={(opt: any, val: any) => opt?.id === val?.id}
        onChange={(_, v: any) => onChange(v?.id || '')}
        renderInput={(p) => <TextField {...p} label="College" placeholder="Search seniors' colleges" />}
        sx={{ minWidth: 240 }}
      />
    </Box>
  );
}
