// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Alert, CircularProgress, Chip,
} from '@neram/ui';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddAssignmentDialog from '@/components/expenses/AddAssignmentDialog';
import { formatCurrency } from '@/components/expenses/ExpenseConstants';

const STATUS_COLORS: Record<string, 'info' | 'warning' | 'success'> = {
  active: 'info',
  completed: 'warning',
  settled: 'success',
};

export default function StaffAssignmentsPage() {
  const router = useRouter();
  const { adminProfile } = useAdminProfile();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchAssignments = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('staffName', search);

      const res = await fetch(`/api/staff-assignments?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setAssignments(data.assignments || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page, rowsPerPage]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BusinessCenterIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Staff Assignments</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={fetchAssignments} startIcon={<RefreshIcon />}>Refresh</Button>
          <Button variant="contained" size="small" onClick={() => setDialogOpen(true)} startIcon={<AddIcon />}>New Assignment</Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
        <TextField placeholder="Search by staff name..." size="small" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} sx={{ flex: 1, minWidth: 200 }} />
        <TextField select size="small" label="Status" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="active">Active</MenuItem>
          <MenuItem value="completed">Completed</MenuItem>
          <MenuItem value="settled">Settled</MenuItem>
        </TextField>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : assignments.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No assignments found</Typography></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell>Staff</TableCell>
                  <TableCell>Title</TableCell>
                  <TableCell>City</TableCell>
                  <TableCell>Date Range</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total Spent</TableCell>
                  <TableCell align="right"># Expenses</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.id} hover sx={{ cursor: 'pointer' }} onClick={() => router.push(`/staff-assignments/${a.id}`)}>
                    <TableCell sx={{ fontWeight: 600 }}>{a.staff_name}</TableCell>
                    <TableCell>{a.title}</TableCell>
                    <TableCell>{a.city || '—'}</TableCell>
                    <TableCell>
                      {new Date(a.start_date).toLocaleDateString('en-IN')}
                      {a.end_date ? ` — ${new Date(a.end_date).toLocaleDateString('en-IN')}` : ' — Ongoing'}
                    </TableCell>
                    <TableCell><Chip label={a.status} size="small" color={STATUS_COLORS[a.status] || 'default'} variant="outlined" /></TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(a.total_spent)}</TableCell>
                    <TableCell align="right">{a.expense_count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination rowsPerPageOptions={[10, 25, 50]} component="div" count={totalCount} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }} />
          </>
        )}
      </TableContainer>

      <AddAssignmentDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={fetchAssignments} adminId={adminProfile?.id || ''} />
    </Box>
  );
}
