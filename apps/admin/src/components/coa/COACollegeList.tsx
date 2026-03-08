'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Pagination,
  Skeleton,
  Chip,
} from '@neram/ui';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import type { CoaInstitution } from '@neram/database';
import { getCOAColleges, getCOACities } from '@neram/database';
import COAStatusBadge from './COAStatusBadge';
import { COA_STATES } from './constants';

const PAGE_SIZE = 20;

export default function COACollegeList() {
  const [colleges, setColleges] = useState<CoaInstitution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [filterState, setFilterState] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'intake' | 'commenced_year'>('name');

  const [cities, setCities] = useState<string[]>([]);

  const fetchCities = useCallback(async (state: string) => {
    if (!state) { setCities([]); return; }
    try {
      const result = await getCOACities(state);
      setCities(result);
    } catch {
      setCities([]);
    }
  }, []);

  const fetchColleges = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCOAColleges({
        state: filterState || undefined,
        city: filterCity || undefined,
        status: filterStatus || undefined,
        sortBy,
        page,
        pageSize: PAGE_SIZE,
      });
      setColleges(result.data);
      setTotal(result.total);
    } catch {
      setColleges([]);
    } finally {
      setLoading(false);
    }
  }, [filterState, filterCity, filterStatus, sortBy, page]);

  useEffect(() => { fetchColleges(); }, [fetchColleges]);

  const handleStateChange = (state: string) => {
    setFilterState(state);
    setFilterCity('');
    setPage(1);
    fetchCities(state);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <Box>
      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>State</InputLabel>
          <Select
            value={filterState}
            label="State"
            onChange={(e) => handleStateChange(e.target.value as string)}
          >
            <MenuItem value="">All States</MenuItem>
            {COA_STATES.map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }} disabled={!filterState}>
          <InputLabel>City</InputLabel>
          <Select
            value={filterCity}
            label="City"
            onChange={(e) => { setFilterCity(e.target.value as string); setPage(1); }}
          >
            <MenuItem value="">All Cities</MenuItem>
            {cities.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={(e) => { setFilterStatus(e.target.value as string); setPage(1); }}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="active">Active (2025-26)</MenuItem>
            <MenuItem value="expiring">Valid till 2025</MenuItem>
            <MenuItem value="unknown">Check with COA</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Sort By</InputLabel>
          <Select
            value={sortBy}
            label="Sort By"
            onChange={(e) => { setSortBy(e.target.value as 'name' | 'intake' | 'commenced_year'); setPage(1); }}
          >
            <MenuItem value="name">Name</MenuItem>
            <MenuItem value="intake">Intake (seats)</MenuItem>
            <MenuItem value="commenced_year">Year Established</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            {loading ? '...' : `${total} colleges`}
          </Typography>
        </Box>
      </Box>

      {/* College cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" height={72} sx={{ borderRadius: 2 }} />
            ))
          : colleges.map((inst) => (
              <Card key={inst.id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ py: '10px !important', px: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
                          {inst.name}
                        </Typography>
                        <COAStatusBadge status={inst.approval_status} />
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <LocationOnIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          {inst.city}, {inst.state}
                        </Typography>
                        {inst.current_intake && (
                          <Chip
                            label={`${inst.current_intake} seats`}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 0.5, height: 18, fontSize: 10 }}
                          />
                        )}
                        <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                          · {inst.institution_code}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            ))}
      </Box>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, p) => setPage(p)}
            size="small"
            color="primary"
          />
        </Box>
      )}
    </Box>
  );
}
