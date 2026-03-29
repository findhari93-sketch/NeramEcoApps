// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box, Typography, Paper, Button, Alert, CircularProgress, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip,
} from '@neram/ui';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AddIcon from '@mui/icons-material/Add';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import { getCategoryLabel, getCategoryColor, formatCurrency } from '@/components/expenses/ExpenseConstants';

export default function AssignmentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { adminProfile } = useAdminProfile();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch');
      setData(await res.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSettle = async () => {
    if (!confirm('Settle this assignment and all linked expenses?')) return;
    setSettling(true);
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}/settle`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to settle');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSettling(false);
    }
  };

  const handleMarkComplete = async () => {
    try {
      const res = await fetch(`/api/staff-assignments/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completed' }),
      });
      if (!res.ok) throw new Error('Failed to update');
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) return <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;

  const { assignment, expenses, summary } = data || {};
  const statusColors: Record<string, 'info' | 'warning' | 'success'> = { active: 'info', completed: 'warning', settled: 'success' };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
        <Box>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => router.push('/staff-assignments')} sx={{ mb: 1 }}>Back</Button>
          <Typography variant="h4" fontWeight={700}>{assignment?.staff_name} — {assignment?.title}</Typography>
          <Box sx={{ display: 'flex', gap: 1, mt: 1, alignItems: 'center' }}>
            <Chip label={assignment?.status} color={statusColors[assignment?.status] || 'default'} size="small" />
            {assignment?.city && <Typography variant="body2" color="text.secondary">{assignment.city}</Typography>}
            <Typography variant="body2" color="text.secondary">
              {new Date(assignment?.start_date).toLocaleDateString('en-IN')}
              {assignment?.end_date ? ` — ${new Date(assignment.end_date).toLocaleDateString('en-IN')}` : ' — Ongoing'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={() => setExpenseDialogOpen(true)} startIcon={<AddIcon />}>Add Expense</Button>
          {assignment?.status === 'active' && (
            <Button variant="outlined" color="warning" size="small" onClick={handleMarkComplete} startIcon={<CheckCircleIcon />}>Mark Complete</Button>
          )}
          {assignment?.status !== 'settled' && (
            <Button variant="contained" color="success" size="small" onClick={handleSettle} disabled={settling} startIcon={<DoneAllIcon />}>
              {settling ? 'Settling...' : 'Settle All'}
            </Button>
          )}
        </Box>
      </Box>

      {/* Summary cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', minWidth: 140 }}>
          <Typography variant="body2" color="text.secondary">Total Spent</Typography>
          <Typography variant="h5" fontWeight={700}>{formatCurrency(summary?.total || 0)}</Typography>
        </Paper>
        {Object.entries(summary?.by_category || {}).map(([cat, amt]) => (
          <Paper key={cat} elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'divider', minWidth: 130 }}>
            <Typography variant="body2" color="text.secondary">{getCategoryLabel(cat)}</Typography>
            <Typography variant="h6" fontWeight={600} sx={{ color: getCategoryColor(cat) }}>{formatCurrency(amt as number)}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Settlement info */}
      {assignment?.status === 'settled' && assignment?.settled_at && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Settled on {new Date(assignment.settled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} — Total: {formatCurrency(summary?.total || 0)}
        </Alert>
      )}

      {/* Expenses table */}
      <Typography variant="h6" sx={{ mb: 2 }}>Expenses ({expenses?.length || 0})</Typography>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {!expenses?.length ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No expenses yet</Typography></Box>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: 'grey.50' }}>
                <TableCell>Date</TableCell>
                <TableCell>Category</TableCell>
                <TableCell>Description</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Settlement</TableCell>
                <TableCell>Receipt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {expenses.map((exp: any) => (
                <TableRow key={exp.id} hover>
                  <TableCell>{new Date(exp.transaction_date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell><Chip label={getCategoryLabel(exp.category)} size="small" sx={{ bgcolor: `${getCategoryColor(exp.category)}14`, color: getCategoryColor(exp.category) }} /></TableCell>
                  <TableCell>{exp.description}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(exp.amount)}</TableCell>
                  <TableCell><Chip label={exp.settlement_status} size="small" color={exp.settlement_status === 'settled' ? 'success' : 'warning'} variant="outlined" /></TableCell>
                  <TableCell>{exp.receipt_url ? <Tooltip title="View receipt"><ReceiptIcon fontSize="small" color="primary" /></Tooltip> : '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <AddExpenseDialog
        open={expenseDialogOpen}
        onClose={() => setExpenseDialogOpen(false)}
        onSaved={fetchData}
        adminId={adminProfile?.id || ''}
        preSelectedAssignment={{ id: params.id, title: assignment?.title }}
        assignments={[{ id: params.id, title: assignment?.title, staff_name: assignment?.staff_name }]}
      />
    </Box>
  );
}
