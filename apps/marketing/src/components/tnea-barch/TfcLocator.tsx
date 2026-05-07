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
import type { Tfc } from '@/data/tnea-barch-2026';

interface TfcLocatorProps {
  tfcs: Tfc[];
  districts: string[];
}

function buildMapsHref(tfc: Tfc): string {
  const query = encodeURIComponent(`${tfc.name}, ${tfc.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export default function TfcLocator({ tfcs, districts }: TfcLocatorProps) {
  const [query, setQuery] = useState('');
  const [district, setDistrict] = useState<string>('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tfcs.filter((tfc) => {
      if (district && tfc.district !== district) return false;
      if (!q) return true;
      const haystack = [
        tfc.name,
        tfc.address,
        tfc.district,
        tfc.tfc_number,
        tfc.coordinator_name,
        tfc.asst_coordinator_name,
        tfc.pincode,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [query, district, tfcs]);

  return (
    <Box>
      {/* Search row */}
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
            placeholder="Search by city, college name, TFC number..."
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
            sx={{ minWidth: { sm: 200 } }}
          >
            <MenuItem value="">All districts</MenuItem>
            {districts.map((d) => (
              <MenuItem key={d} value={d}>
                {d}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Showing {filtered.length} of {tfcs.length} TFCs
          {district && ` in ${district}`}
        </Typography>
      </Paper>

      {/* Results */}
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
            No TFCs match your search
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Try a different keyword or clear the district filter.
          </Typography>
        </Paper>
      ) : (
        <Stack spacing={1.5}>
          {filtered.map((tfc) => (
            <Paper
              key={`${tfc.sl_no}-${tfc.tfc_number}`}
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
                    <Chip label={`TFC ${tfc.tfc_number}`} size="small" color="primary" />
                    <Chip label={tfc.district} size="small" variant="outlined" />
                  </Stack>
                  <Typography variant="subtitle1" fontWeight={700}>
                    {tfc.name}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                    {tfc.address}
                  </Typography>
                </Box>
              </Stack>

              {(tfc.coordinator_name || tfc.asst_coordinator_name) && (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  gap={1}
                  sx={{ mb: 1.5, mt: 1, pt: 1, borderTop: '1px dashed', borderColor: 'divider' }}
                >
                  {tfc.coordinator_name && (
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Coordinator
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {tfc.coordinator_name}
                      </Typography>
                      {tfc.coordinator_role && (
                        <Typography variant="caption" color="text.secondary">
                          {tfc.coordinator_role}
                        </Typography>
                      )}
                    </Box>
                  )}
                  {tfc.asst_coordinator_name && (
                    <Box flex={1}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        Co-coordinator
                      </Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {tfc.asst_coordinator_name}
                      </Typography>
                      {tfc.asst_coordinator_role && (
                        <Typography variant="caption" color="text.secondary">
                          {tfc.asst_coordinator_role}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Stack>
              )}

              <Stack direction="row" gap={1} flexWrap="wrap">
                {tfc.coordinator_phone && (
                  <Button
                    size="small"
                    variant="contained"
                    component="a"
                    href={`tel:${tfc.coordinator_phone}`}
                    startIcon={<CallIcon />}
                    sx={{ minHeight: 40 }}
                  >
                    {tfc.coordinator_phone}
                  </Button>
                )}
                {tfc.asst_coordinator_phone && (
                  <Button
                    size="small"
                    variant="outlined"
                    component="a"
                    href={`tel:${tfc.asst_coordinator_phone}`}
                    startIcon={<CallIcon />}
                    sx={{ minHeight: 40 }}
                  >
                    {tfc.asst_coordinator_phone}
                  </Button>
                )}
                <Button
                  size="small"
                  variant="outlined"
                  component="a"
                  href={buildMapsHref(tfc)}
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
