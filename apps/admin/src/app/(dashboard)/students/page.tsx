// @ts-nocheck
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  InputAdornment,
  Skeleton,
  Alert,
  IconButton,
  Tooltip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import DataTable from '@/components/DataTable';
import { useRouter } from 'next/navigation';

// Types for the student data
interface StudentRow {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
  enrollment_date: string;
  batch_id: string | null;
  payment_status: string;
  total_fee: number;
  fee_paid: number;
  fee_due: number;
  interest_course: string | null;
  application_number: string | null;
  final_fee: number | null;
  full_payment_discount: number | null;
  discount_amount: number | null;
}

interface Stats {
  totalStudents: number;
  fullyPaid: number;
  partialPayment: number;
  totalRevenue: number;
}

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both',
  not_sure: 'Not Sure',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getPaymentStatusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'failed':
      return 'error';
    default:
      return 'default';
  }
}

function getPaymentStatusLabel(status: string): string {
  switch (status) {
    case 'paid':
      return 'Paid';
    case 'pending':
      return 'Partial';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    default:
      return status || 'Pending';
  }
}

// Stat card component
function StatCard({
  title,
  value,
  icon,
  color,
  loading,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: 2.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'grey.200',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        flex: 1,
        minWidth: 200,
      }}
    >
      <Box
        sx={{
          width: 48,
          height: 48,
          borderRadius: 1,
          bgcolor: `${color}15`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.25 }}>
          {title}
        </Typography>
        {loading ? (
          <Skeleton width={80} height={32} />
        ) : (
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

export default function StudentsPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    fullyPaid: 0,
    partialPayment: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');

  // Debounce
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', '500'); // Fetch all for client-side pagination (DataTable paginates)
      params.set('offset', '0');

      if (debouncedSearch) params.set('search', debouncedSearch);
      if (courseFilter) params.set('course', courseFilter);
      if (paymentFilter) params.set('paymentStatus', paymentFilter);

      const res = await fetch(`/api/students?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch students');

      const data = await res.json();
      setStudents(data.students || []);
      setTotalCount(data.total || 0);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, courseFilter, paymentFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Handle search with debounce
  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
    }, 400);
    setSearchDebounce(timeout);
  };

  const handleRowClick = (row: StudentRow) => {
    router.push(`/crm/${row.user_id}`);
  };

  // Column definitions for DataTable
  const columns = [
    {
      field: 'name',
      headerName: 'Name',
      width: 180,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" fontWeight={500} noWrap>
          {[row.first_name, row.last_name].filter(Boolean).join(' ') || '-'}
        </Typography>
      ),
    },
    {
      field: 'email',
      headerName: 'Email',
      width: 220,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" color="text.secondary" noWrap>
          {row.email || '-'}
        </Typography>
      ),
    },
    {
      field: 'phone',
      headerName: 'Phone',
      width: 140,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" noWrap>
          {row.phone || '-'}
        </Typography>
      ),
    },
    {
      field: 'interest_course',
      headerName: 'Course',
      width: 130,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Chip
          label={COURSE_LABELS[row.interest_course || ''] || row.interest_course || '-'}
          size="small"
          variant="outlined"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: 'enrollment_date',
      headerName: 'Enrolled',
      width: 130,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2">
          {formatDate(row.enrollment_date)}
        </Typography>
      ),
    },
    {
      field: 'payment_status',
      headerName: 'Payment',
      width: 110,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Chip
          label={getPaymentStatusLabel(row.payment_status)}
          color={getPaymentStatusColor(row.payment_status)}
          size="small"
          sx={{ fontWeight: 500 }}
        />
      ),
    },
    {
      field: 'fee_paid',
      headerName: 'Total Paid',
      width: 120,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" fontWeight={500} color="success.main">
          {formatCurrency(row.fee_paid)}
        </Typography>
      ),
    },
    {
      field: 'fee_due',
      headerName: 'Fee Due',
      width: 120,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography
          variant="body2"
          fontWeight={500}
          color={row.fee_due > 0 ? 'error.main' : 'text.secondary'}
        >
          {row.fee_due > 0 ? formatCurrency(row.fee_due) : '-'}
        </Typography>
      ),
    },
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 1,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SchoolIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Enrolled Students
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading...' : `${stats.totalStudents} students enrolled`}
            </Typography>
          </Box>
        </Box>
        <Tooltip title="Refresh data">
          <span>
            <IconButton size="small" onClick={fetchStudents} disabled={loading}>
              <RefreshIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <StatCard
          title="Total Students"
          value={stats.totalStudents}
          icon={<PeopleAltIcon sx={{ color: '#1976d2', fontSize: 24 }} />}
          color="#1976d2"
          loading={loading}
        />
        <StatCard
          title="Fully Paid"
          value={stats.fullyPaid}
          icon={<CheckCircleIcon sx={{ color: '#2e7d32', fontSize: 24 }} />}
          color="#2e7d32"
          loading={loading}
        />
        <StatCard
          title="Partial Payment"
          value={stats.partialPayment}
          icon={<HourglassBottomIcon sx={{ color: '#ed6c02', fontSize: 24 }} />}
          color="#ed6c02"
          loading={loading}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={<CurrencyRupeeIcon sx={{ color: '#9c27b0', fontSize: 24 }} />}
          color="#9c27b0"
          loading={loading}
        />
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Course</InputLabel>
          <Select
            value={courseFilter}
            label="Course"
            onChange={(e) => setCourseFilter(e.target.value)}
          >
            <MenuItem value="">All Courses</MenuItem>
            <MenuItem value="nata">NATA</MenuItem>
            <MenuItem value="jee_paper2">JEE Paper 2</MenuItem>
            <MenuItem value="both">Both</MenuItem>
            <MenuItem value="not_sure">Not Sure</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Payment Status</InputLabel>
          <Select
            value={paymentFilter}
            label="Payment Status"
            onChange={(e) => setPaymentFilter(e.target.value)}
          >
            <MenuItem value="">All Statuses</MenuItem>
            <MenuItem value="paid">Paid</MenuItem>
            <MenuItem value="pending">Pending / Partial</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="refunded">Refunded</MenuItem>
          </Select>
        </FormControl>
      </Box>

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
        <DataTable
          rows={students}
          columns={columns}
          loading={loading}
          onRowClick={handleRowClick}
          defaultRowsPerPage={25}
        />
      </Paper>
    </Box>
  );
}
