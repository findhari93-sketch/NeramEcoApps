// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Alert,
  TextField,
  MenuItem,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Chip,
  Button,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import BarChartIcon from '@mui/icons-material/BarChart';
import CsvImporter from '@/components/counseling/CsvImporter';

export default function CutoffsPage() {
  const router = useRouter();
  const [systems, setSystems] = useState<any[]>([]);
  const [selectedSystem, setSelectedSystem] = useState('');
  const [year, setYear] = useState(2025);
  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [showImporter, setShowImporter] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [roundFilter, setRoundFilter] = useState('');

  const fetchSystems = useCallback(async () => {
    try {
      const res = await fetch('/api/counseling?action=systems');
      const data = await res.json();
      setSystems(data.systems || []);
      if (data.systems?.length > 0) setSelectedSystem(data.systems[0].id);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!selectedSystem) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        action: 'cutoffs',
        systemId: selectedSystem,
        year: String(year),
        limit: String(rowsPerPage),
        offset: String(page * rowsPerPage),
      });
      if (categoryFilter) params.set('category', categoryFilter);
      if (roundFilter) params.set('round', roundFilter);
      const res = await fetch(`/api/counseling/data?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSystem, year, page, rowsPerPage, categoryFilter, roundFilter]);

  useEffect(() => { fetchSystems(); }, [fetchSystems]);
  useEffect(() => { if (selectedSystem) fetchEntries(); }, [fetchEntries]);

  const selectedSystemData = systems.find((s) => s.id === selectedSystem);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/counseling')}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 1, bgcolor: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChartIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Historical Cutoffs
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Import and view cutoff marks/ranks per college per category
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Counseling System" value={selectedSystem}
          onChange={(e) => { setSelectedSystem(e.target.value); setPage(0); }}
          sx={{ minWidth: 280 }}
        >
          {systems.map((sys) => (<MenuItem key={sys.id} value={sys.id}>{sys.name}</MenuItem>))}
        </TextField>
        <TextField
          type="number" size="small" label="Year" value={year}
          onChange={(e) => { setYear(parseInt(e.target.value, 10)); setPage(0); }}
          sx={{ width: 120 }}
        />
        <TextField
          size="small" label="Category" value={categoryFilter} placeholder="OC, BC, SC..."
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(0); }}
          sx={{ width: 140 }}
        />
        <TextField
          size="small" label="Round" value={roundFilter} placeholder="1, 2, 3..."
          onChange={(e) => { setRoundFilter(e.target.value); setPage(0); }}
          sx={{ width: 100 }}
        />
        <Button variant={showImporter ? 'contained' : 'outlined'} size="small" onClick={() => setShowImporter(!showImporter)}>
          {showImporter ? 'Hide Importer' : 'Show Importer'}
        </Button>
        <Tooltip title="Refresh"><IconButton size="small" onClick={fetchEntries}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
      </Paper>

      {/* CSV Importer */}
      {showImporter && selectedSystem && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
          <CsvImporter
            type="cutoffs"
            systemId={selectedSystem}
            systemName={selectedSystemData?.name || ''}
            year={year}
            onImportComplete={() => fetchEntries()}
          />
        </Paper>
      )}

      {/* Data Table */}
      <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
        {loading && entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Typography color="text.secondary">No cutoff records found. Import a CSV above.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>College</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Round</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Branch</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Closing Mark</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Closing Rank</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Opening Mark</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 200 }}>
                          {entry.college?.name || entry.college_id}
                        </Typography>
                      </TableCell>
                      <TableCell>{entry.round}</TableCell>
                      <TableCell>{entry.branch_code}</TableCell>
                      <TableCell><Chip label={entry.category} size="small" variant="outlined" /></TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight={600}>{entry.closing_mark ?? '-'}</Typography></TableCell>
                      <TableCell align="right">{entry.closing_rank ?? '-'}</TableCell>
                      <TableCell align="right">{entry.opening_mark ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[25, 50, 100]}
              component="div" count={totalCount} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
