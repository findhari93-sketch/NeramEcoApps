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
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import HistoryIcon from '@mui/icons-material/History';

const TABLE_OPTIONS = [
  { value: '', label: 'All Tables' },
  { value: 'rank_list_entries', label: 'Rank Lists' },
  { value: 'allotment_list_entries', label: 'Allotment Lists' },
  { value: 'historical_cutoffs', label: 'Cutoffs' },
  { value: 'counseling_systems', label: 'Systems' },
  { value: 'college_counseling_participation', label: 'Participation' },
];

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditLogPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [tableFilter, setTableFilter] = useState('');

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        action: 'audit-log',
        limit: String(rowsPerPage),
        offset: String(page * rowsPerPage),
      });
      if (tableFilter) params.set('tableName', tableFilter);

      const res = await fetch(`/api/counseling?${params}`);
      if (!res.ok) throw new Error('Failed to fetch audit log');
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalCount(data.count || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, tableFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton size="small" onClick={() => router.push('/counseling')}>
          <ArrowBackIcon fontSize="small" />
        </IconButton>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 42, height: 42, borderRadius: 1, bgcolor: '#5E35B1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <HistoryIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Audit Log
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Track all counseling data changes
            </Typography>
          </Box>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', display: 'flex', gap: 2, alignItems: 'center' }}>
        <TextField
          select size="small" label="Table" value={tableFilter}
          onChange={(e) => { setTableFilter(e.target.value); setPage(0); }}
          sx={{ minWidth: 200 }}
        >
          {TABLE_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
          ))}
        </TextField>
        <Tooltip title="Refresh"><IconButton size="small" onClick={fetchEntries}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
      </Paper>

      {/* Table */}
      <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
        {loading && entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
            <CircularProgress />
          </Box>
        ) : entries.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Typography color="text.secondary">No audit log entries found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Table</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Action</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Changed By</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Context</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{formatDateTime(entry.changed_at)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={entry.table_name.replace(/_/g, ' ')}
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'capitalize', fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={entry.change_type}
                          size="small"
                          color={
                            entry.change_type === 'CREATE' ? 'success' :
                            entry.change_type === 'UPDATE' ? 'primary' :
                            entry.change_type === 'DELETE' ? 'error' : 'default'
                          }
                          sx={{ fontSize: '0.7rem' }}
                        />
                      </TableCell>
                      <TableCell>{entry.changed_by}</TableCell>
                      <TableCell>
                        {entry.context ? (
                          <Typography variant="body2" sx={{ fontSize: '0.75rem', maxWidth: 300 }} noWrap>
                            {typeof entry.context === 'string' ? entry.context : JSON.stringify(entry.context)}
                          </Typography>
                        ) : '-'}
                      </TableCell>
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
