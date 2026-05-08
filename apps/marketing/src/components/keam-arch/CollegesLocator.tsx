'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Stack,
  TextField,
  MenuItem,
  Chip,
  Button,
  IconButton,
  InputAdornment,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import CallIcon from '@mui/icons-material/Call';
import MapIcon from '@mui/icons-material/Map';
import ClearIcon from '@mui/icons-material/Clear';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SchoolIcon from '@mui/icons-material/School';
import type { KeralaCollege } from '@/data/keam-arch-2026';

interface CollegesLocatorProps {
  colleges: KeralaCollege[];
  districts: string[];
  universities: string[];
}

function buildMapsHref(college: KeralaCollege): string {
  const query = encodeURIComponent(`${college.name}, ${college.city}, ${college.district}, Kerala`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

const PRIMARY_GREEN = '#0d7a4a';

export default function CollegesLocator({ colleges, districts, universities }: CollegesLocatorProps) {
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState<string>('');
  const [university, setUniversity] = useState<string>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return colleges.filter((c) => {
      if (district && c.district !== district) return false;
      if (university && c.university !== university) return false;
      if (!q) return true;
      const haystack = [c.name, c.city, c.district, c.code, c.university].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [query, district, university, colleges]);

  const totalSeats = filtered.reduce((sum, c) => sum + c.seats, 0);

  return (
    <Box>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          mb: 2.5,
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          bgcolor: 'background.paper',
        }}
      >
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'stretch', sm: 'center' }}
        >
          <TextField
            placeholder="Search by college name, city, code..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            size="medium"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: 'text.secondary' }} />
                </InputAdornment>
              ),
              endAdornment: query ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setQuery('')} aria-label="Clear">
                    <ClearIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
          <TextField
            select
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            label="District"
            size="medium"
            sx={{ minWidth: { sm: 180 } }}
          >
            <MenuItem value="">All districts</MenuItem>
            {districts.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            label="University"
            size="medium"
            sx={{ minWidth: { sm: 160 } }}
          >
            <MenuItem value="">All</MenuItem>
            {universities.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Showing {filtered.length} of {colleges.length} colleges, {totalSeats} seats
          {district && ` in ${district}`}
          {university && ` (${university})`}
        </Typography>
      </Paper>

      {filtered.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 4,
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider',
            textAlign: 'center',
          }}
        >
          <LocationOnIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
            No colleges match your filters
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try clearing the district or university filter.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((c) => (
            <Paper
              key={`${c.sl_no}-${c.code}`}
              id={`college-${c.code}`}
              elevation={0}
              sx={{
                p: { xs: 1.5, md: 2 },
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="flex-start"
                gap={1}
                flexWrap="wrap"
                sx={{ mb: 1 }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" gap={0.75} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
                    <Chip
                      label={c.code}
                      size="small"
                      sx={{ bgcolor: PRIMARY_GREEN, color: 'white', fontWeight: 700 }}
                    />
                    <Chip label={c.district} size="small" variant="outlined" />
                    <Chip label={c.university} size="small" variant="outlined" icon={<SchoolIcon />} />
                    <Chip label={`${c.seats} seats`} size="small" variant="outlined" color="primary" />
                  </Stack>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {c.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {c.city}, {c.district}, Kerala
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" gap={1} flexWrap="wrap">
                {c.phones.map((phone) => (
                  <Button
                    key={phone}
                    size="small"
                    variant="contained"
                    component="a"
                    href={`tel:${phone}`}
                    startIcon={<CallIcon />}
                    sx={{
                      minHeight: 40,
                      bgcolor: PRIMARY_GREEN,
                      '&:hover': { bgcolor: '#0a5a36' },
                    }}
                  >
                    {phone}
                  </Button>
                ))}
                <Button
                  size="small"
                  variant="outlined"
                  component="a"
                  href={buildMapsHref(c)}
                  target="_blank"
                  rel="noopener"
                  startIcon={<MapIcon />}
                  sx={{ minHeight: 40 }}
                >
                  Map
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Box>
  );
}
