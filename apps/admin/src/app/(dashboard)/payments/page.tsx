// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  TextField,
  MenuItem,
  InputAdornment,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
} from '@neram/ui';
import PaymentsIcon from '@mui/icons-material/Payments';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import TodayIcon from '@mui/icons-material/Today';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

interface PaymentRow {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_method: string | null;
  receipt_number: string | null;
  receipt_url: string | null;
  description: string | null;
  installment_number: number | null;
  failure_code: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
  student_name: string;
  student_email: string | null;
  student_phone: string | null;
  interest_course: string | null;
  application_number: string | null;
}

interface PaymentStats {
  totalRevenue: number;
  pendingAmount: number;
  todayCollections: number;
  failedCount: number;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'paid', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

const METHOD_OPTIONS = [
  { value: '', label: 'All Methods' },
  { value: 'razorpay', label: 'Razorpay' },
  { value: 'upi_direct', label: 'UPI Direct' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'upi_screenshot', label: 'UPI Screenshot' },
];

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'error';
    case 'refunded':
      return 'default';
    default:
      return 'default';
  }
}

function getMethodColor(method: string | null): string {
  switch (method) {
    case 'razorpay':
      return '#1565C0';
    case 'upi_direct':
      return '#7B1FA2';
    case 'upi_screenshot':
      return '#6A1B9A';
    case 'bank_transfer':
      return '#00695C';
    default:
      return '#757575';
  }
}

function getMethodLabel(method: string | null): string {
  switch (method) {
    case 'razorpay':
      return 'Razorpay';
    case 'upi_direct':
      return 'UPI Direct';
    case 'upi_screenshot':
      return 'UPI Screenshot';
    case 'bank_transfer':
      return 'Bank Transfer';
    default:
      return method || 'Unknown';
  }
}

function truncate(str: string | null, maxLen: number): string {
  if (!str) return '-';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

// Stats card component
function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        flex: 1,
        minWidth: 200,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={120} height={36} />
          ) : (
            <Typography variant="h5" fontWeight={700} sx={{ color }}>
              {value}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            width: 32,
            height: 32,
            borderRadius: 1,
            bgcolor: `${color}14`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
      </Box>
    </Paper>
  );
}

export default function PaymentsPage() {
  const router = useRouter();

  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Debounce timer for search
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', String(rowsPerPage));
      params.set('offset', String(page * rowsPerPage));
      params.set('orderBy', 'created_at');
      params.set('orderDirection', 'desc');

      if (statusFilter) params.set('status', statusFilter);
      if (methodFilter) params.set('paymentMethod', methodFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/payments?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch payments (HTTP ${res.status})`);
      }

      const data = await res.json();
      setPayments(data.payments || []);
      setTotalCount(data.total || 0);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, methodFilter, searchQuery]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setPage(0);
    }, 300);
    setSearchDebounce(timeout);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const handleMethodChange = (value: string) => {
    setMethodFilter(value);
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRowClick = (paymentId: string) => {
    router.push(`/payments/${paymentId}`);
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: '#1565C0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PaymentsIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Payments
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {totalCount > 0
                ? `${totalCount} payment${totalCount !== 1 ? 's' : ''} total`
                : loading
                ? 'Loading...'
                : 'No payments found'}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh data">
          <span>
            <IconButton size="small" onClick={fetchPayments} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box
        sx={{
          display: 'flex',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <StatCard
          title="Total Revenue"
          value={stats ? formatCurrency(stats.totalRevenue) : 'Rs. 0'}
          icon={<TrendingUpIcon sx={{ color: '#2E7D32', fontSize: 22 }} />}
          color="#2E7D32"
          loading={loading && !stats}
        />
        <StatCard
          title="Pending Amount"
          value={stats ? formatCurrency(stats.pendingAmount) : 'Rs. 0'}
          icon={<PendingActionsIcon sx={{ color: '#E65100', fontSize: 22 }} />}
          color="#E65100"
          loading={loading && !stats}
        />
        <StatCard
          title="Today's Collections"
          value={stats ? formatCurrency(stats.todayCollections) : 'Rs. 0'}
          icon={<TodayIcon sx={{ color: '#1565C0', fontSize: 22 }} />}
          color="#1565C0"
          loading={loading && !stats}
        />
        <StatCard
          title="Failed Payments"
          value={stats ? String(stats.failedCount) : '0'}
          icon={<ErrorOutlineIcon sx={{ color: '#C62828', fontSize: 22 }} />}
          color="#C62828"
          loading={loading && !stats}
        />
      </Box>

      {/* Filters */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          display: 'flex',
          gap: 2,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          placeholder="Search by receipt #, Razorpay ID, name, email, phone..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 320, flex: 1 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          sx={{ minWidth: 160 }}
          label="Status"
        >
          {STATUS_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={methodFilter}
          onChange={(e) => handleMethodChange(e.target.value)}
          sx={{ minWidth: 160 }}
          label="Method"
        >
          {METHOD_OPTIONS.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {/* Data Table */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          overflow: 'hidden',
        }}
      >
        {loading && payments.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : payments.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
            <Typography color="text.secondary">No payments found</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Date</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Student</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }} align="right">
                      Amount
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Method</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Receipt #</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Razorpay ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {payments.map((payment) => (
                    <TableRow
                      key={payment.id}
                      hover
                      onClick={() => handleRowClick(payment.id)}
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        <Typography variant="body2">{formatDate(payment.created_at)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(payment.created_at).toLocaleTimeString('en-IN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 180 }}>
                          {payment.student_name}
                        </Typography>
                        {payment.student_email && (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 180 }}>
                            {payment.student_email}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600}>
                          {formatCurrency(payment.amount)}
                        </Typography>
                        {payment.installment_number && (
                          <Typography variant="caption" color="text.secondary">
                            Inst. #{payment.installment_number}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getMethodLabel(payment.payment_method)}
                          size="small"
                          variant="outlined"
                          sx={{
                            borderColor: getMethodColor(payment.payment_method),
                            color: getMethodColor(payment.payment_method),
                            fontWeight: 500,
                            fontSize: '0.75rem',
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        {payment.receipt_number ? (
                          <Typography
                            variant="body2"
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: '0.8rem',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {payment.receipt_url ? (
                              <a
                                href={payment.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{ color: '#1565C0', textDecoration: 'none' }}
                              >
                                {payment.receipt_number}
                              </a>
                            ) : (
                              payment.receipt_number
                            )}
                          </Typography>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap',
                            color: 'text.secondary',
                          }}
                        >
                          {truncate(payment.razorpay_payment_id, 16)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                          size="small"
                          color={getStatusColor(payment.status)}
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={totalCount}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
            />
          </>
        )}
      </Paper>
    </Box>
  );
}
