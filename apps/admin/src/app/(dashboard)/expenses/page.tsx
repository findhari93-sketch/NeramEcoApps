// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, MenuItem, InputAdornment,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Alert, CircularProgress, Chip, Checkbox, Skeleton, IconButton, Tooltip,
} from '@neram/ui';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import ReceiptIcon from '@mui/icons-material/Receipt';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PendingIcon from '@mui/icons-material/Pending';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import AddIncomeDialog from '@/components/expenses/AddIncomeDialog';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, getCategoryLabel, formatCurrency } from '@/components/expenses/ExpenseConstants';

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

function StatCard({ title, value, icon, color, loading }: { title: string; value: string; icon: React.ReactNode; color: string; loading: boolean }) {
  return (
    <Paper elevation={0} sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'grey.200', flex: 1, minWidth: 180 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>{title}</Typography>
          {loading ? <Skeleton width={100} height={32} /> : <Typography variant="h6" fontWeight={700} sx={{ color }}>{value}</Typography>}
        </Box>
        <Box sx={{ width: 32, height: 32, borderRadius: 1, bgcolor: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

export default function ExpensesPage() {
  const { adminProfile } = useAdminProfile();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [settlementFilter, setSettlementFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [editData, setEditData] = useState<any>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      if (typeFilter) params.set('type', typeFilter);
      if (categoryFilter) params.set('category', categoryFilter);
      if (settlementFilter) params.set('settlementStatus', settlementFilter);
      if (search) params.set('search', search);

      const res = await fetch(`/api/expenses?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotalCount(data.total || 0);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, categoryFilter, settlementFilter, search, page, rowsPerPage]);

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/staff-assignments?limit=100&status=active');
      if (res.ok) {
        const data = await res.json();
        setAssignments(data.assignments || []);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchTransactions(); }, [fetchTransactions]);
  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);

  const handleBulkSettle = async () => {
    if (selected.length === 0) return;
    try {
      const res = await fetch('/api/expenses/bulk-settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selected }),
      });
      if (!res.ok) throw new Error('Failed to settle');
      setSelected([]);
      fetchTransactions();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const pendingIds = transactions.filter(t => t.type === 'expense' && t.settlement_status === 'pending').map(t => t.id);
      setSelected(pendingIds);
    } else {
      setSelected([]);
    }
  };

  const handleSelectOne = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const handleRowClick = (txn: any) => {
    setEditData(txn);
    if (txn.type === 'income') setIncomeDialogOpen(true);
    else setExpenseDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      fetchTransactions();
    } catch {}
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon sx={{ fontSize: 28 }} />
          <Typography variant="h4" fontWeight={700}>Expenses & Income</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" size="small" onClick={fetchTransactions} startIcon={<RefreshIcon />}>Refresh</Button>
          <Button variant="outlined" size="small" color="success" onClick={() => { setEditData(null); setIncomeDialogOpen(true); }} startIcon={<AddIcon />}>Add Income</Button>
          <Button variant="contained" size="small" onClick={() => { setEditData(null); setExpenseDialogOpen(true); }} startIcon={<AddIcon />}>Add Expense</Button>
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, overflowX: 'auto', pb: 1 }}>
        <StatCard title="Expenses (This Month)" value={formatCurrency(stats?.total_expenses || 0)} icon={<TrendingDownIcon sx={{ color: '#D32F2F', fontSize: 20 }} />} color="#D32F2F" loading={loading} />
        <StatCard title="Side Income (This Month)" value={formatCurrency(stats?.total_side_income || 0)} icon={<TrendingUpIcon sx={{ color: '#388E3C', fontSize: 20 }} />} color="#388E3C" loading={loading} />
        <StatCard title="Unsettled" value={`${stats?.unsettled_count || 0} (${formatCurrency(stats?.unsettled_amount || 0)})`} icon={<PendingIcon sx={{ color: '#F57C00', fontSize: 20 }} />} color="#F57C00" loading={loading} />
        <StatCard title="Top Category" value={getCategoryLabel(stats?.top_category || '')} icon={<ReceiptIcon sx={{ color: '#1976D2', fontSize: 20 }} />} color="#1976D2" loading={loading} />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField placeholder="Search..." size="small" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
          sx={{ flex: 1, minWidth: 200 }} />
        <TextField select size="small" label="Type" value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="expense">Expense</MenuItem>
          <MenuItem value="income">Income</MenuItem>
        </TextField>
        <TextField select size="small" label="Category" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }} sx={{ minWidth: 150 }}>
          <MenuItem value="">All</MenuItem>
          {ALL_CATEGORIES.map(c => <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Settlement" value={settlementFilter} onChange={e => { setSettlementFilter(e.target.value); setPage(0); }} sx={{ minWidth: 130 }}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="pending">Pending</MenuItem>
          <MenuItem value="settled">Settled</MenuItem>
        </TextField>
        {selected.length > 0 && (
          <Button variant="contained" color="warning" size="small" onClick={handleBulkSettle} startIcon={<DoneAllIcon />}>
            Settle {selected.length} Selected
          </Button>
        )}
      </Box>

      {/* Table */}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider' }}>
        {loading ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
        ) : transactions.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">No transactions found</Typography></Box>
        ) : (
          <>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell padding="checkbox"><Checkbox checked={selected.length > 0} onChange={(_, c) => handleSelectAll(c)} /></TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Category</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell>Assignment</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Settlement</TableCell>
                  <TableCell>Receipt</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map(txn => (
                  <TableRow key={txn.id} hover sx={{ cursor: 'pointer' }} onClick={() => handleRowClick(txn)}>
                    <TableCell padding="checkbox" onClick={e => e.stopPropagation()}>
                      {txn.type === 'expense' && txn.settlement_status === 'pending' && (
                        <Checkbox checked={selected.includes(txn.id)} onChange={() => handleSelectOne(txn.id)} />
                      )}
                    </TableCell>
                    <TableCell>{new Date(txn.transaction_date).toLocaleDateString('en-IN')}</TableCell>
                    <TableCell><Chip label={txn.type} size="small" color={txn.type === 'income' ? 'success' : 'default'} variant="outlined" /></TableCell>
                    <TableCell>{getCategoryLabel(txn.category)}</TableCell>
                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{txn.description}</TableCell>
                    <TableCell>{txn.assignment ? `${txn.assignment.staff_name} — ${txn.assignment.title}` : '—'}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: txn.type === 'income' ? 'success.main' : 'text.primary' }}>{formatCurrency(txn.amount)}</TableCell>
                    <TableCell>
                      {txn.type === 'expense' && (
                        <Chip label={txn.settlement_status} size="small" color={txn.settlement_status === 'settled' ? 'success' : 'warning'} variant="outlined" />
                      )}
                    </TableCell>
                    <TableCell>{txn.receipt_url ? <Tooltip title="View receipt"><ReceiptIcon fontSize="small" color="primary" /></Tooltip> : '—'}</TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <Button size="small" color="error" onClick={() => handleDelete(txn.id)}>Delete</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
          </>
        )}
      </TableContainer>

      {/* Dialogs */}
      <AddExpenseDialog
        open={expenseDialogOpen}
        onClose={() => { setExpenseDialogOpen(false); setEditData(null); }}
        onSaved={fetchTransactions}
        adminId={adminProfile?.id || ''}
        editData={editData}
        assignments={assignments}
      />
      <AddIncomeDialog
        open={incomeDialogOpen}
        onClose={() => { setIncomeDialogOpen(false); setEditData(null); }}
        onSaved={fetchTransactions}
        adminId={adminProfile?.id || ''}
        editData={editData}
      />
    </Box>
  );
}
