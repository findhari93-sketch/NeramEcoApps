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
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import CsvImporter from '@/components/counseling/CsvImporter';

export default function RankListsPage() {
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
        action: 'rank-list-entries',
        systemId: selectedSystem,
        year: String(year),
        limit: String(rowsPerPage),
        offset: String(page * rowsPerPage),
      });
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
  }, [selectedSystem, year, page, rowsPerPage]);

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
          <Box sx={{ width: 42, height: 42, borderRadius: 1, bgcolor: '#E65100', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FormatListNumberedIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Rank Lists
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Import and view rank list entries
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* System + Year Selector */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Counseling System" value={selectedSystem}
          onChange={(e) => { setSelectedSystem(e.target.value); setPage(0); }}
          sx={{ minWidth: 280 }}
        >
          {systems.map((sys) => (
            <MenuItem key={sys.id} value={sys.id}>{sys.name}</MenuItem>
          ))}
        </TextField>
        <TextField
          type="number" size="small" label="Year" value={year}
          onChange={(e) => { setYear(parseInt(e.target.value, 10)); setPage(0); }}
          sx={{ width: 120 }}
        />
        <Button
          variant={showImporter ? 'contained' : 'outlined'}
          size="small"
          onClick={() => setShowImporter(!showImporter)}
        >
          {showImporter ? 'Hide Importer' : 'Show Importer'}
        </Button>
        <Tooltip title="Refresh"><IconButton size="small" onClick={fetchEntries}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
      </Paper>

      {/* CSV Importer */}
      {showImporter && selectedSystem && (
        <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200' }}>
          <CsvImporter
            type="rank-list"
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
            <Typography color="text.secondary">No rank list entries found. Import a CSV above.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 500 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Rank</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Appln No</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Candidate Name</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>DOB</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Aggregate Mark</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">HSC Mark</TableCell>
                    <TableCell sx={{ fontWeight: 600 }} align="right">Entrance Mark</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Community</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Community Rank</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{entry.rank}</Typography>
                      </TableCell>
                      <TableCell>{entry.application_number ?? '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.candidate_name ?? '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{entry.date_of_birth ?? '-'}</TableCell>
                      <TableCell align="right">{entry.aggregate_mark}</TableCell>
                      <TableCell align="right">{entry.hsc_aggregate_mark ?? '-'}</TableCell>
                      <TableCell align="right">{entry.entrance_exam_mark ?? '-'}</TableCell>
                      <TableCell>
                        <Chip label={entry.community} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>{entry.community_rank ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[25, 50, 100]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
