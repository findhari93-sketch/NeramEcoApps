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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Collapse,
  Pagination,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import LinkIcon from '@mui/icons-material/Link';
import ClassIcon from '@mui/icons-material/Class';
import FilterListIcon from '@mui/icons-material/FilterList';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
  batch_name: string | null;
  payment_status: string;
  total_fee: number;
  fee_paid: number;
  fee_due: number;
  interest_course: string | null;
  student_id: string | null;
  application_number: string | null;
  final_fee: number | null;
  full_payment_discount: number | null;
  discount_amount: number | null;
  source: string | null;
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
  compact,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  loading: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Paper
        elevation={0}
        sx={{
          p: 0.75,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
          <Box
            sx={{
              width: 22,
              height: 22,
              borderRadius: 0.75,
              bgcolor: `${color}15`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {icon}
          </Box>
          {loading ? (
            <Skeleton width={40} height={20} />
          ) : (
            <Typography
              sx={{
                fontWeight: 800,
                fontSize: 17,
                lineHeight: 1,
                color,
                fontFamily: '"Inter", "Roboto", sans-serif',
              }}
            >
              {value}
            </Typography>
          )}
        </Box>
        <Typography
          sx={{
            color: 'text.secondary',
            fontWeight: 500,
            fontSize: 10,
            letterSpacing: 0.15,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      elevation={0}
      sx={{
        p: 1.5,
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
          width: 36,
          height: 36,
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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;

  // Batches for assignment
  const [availableBatches, setAvailableBatches] = useState<{ id: string; name: string; course_id: string; capacity: number; enrolled_count: number }[]>([]);
  const [assigningBatch, setAssigningBatch] = useState<string | null>(null); // user_id being assigned

  // Nexus classrooms & batches
  const [nexusClassrooms, setNexusClassrooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [nexusBatchesMap, setNexusBatchesMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [nexusEnrollments, setNexusEnrollments] = useState<Record<string, { classroom_id: string; batch_id: string | null }>>({});
  const [assigningNexus, setAssigningNexus] = useState<string | null>(null);

  // Link MS Account
  const [msLinkTarget, setMsLinkTarget] = useState<StudentRow | null>(null);
  const [msOidInput, setMsOidInput] = useState('');
  const [msLinking, setMsLinking] = useState(false);
  const [msLinkError, setMsLinkError] = useState('');

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

      const res = await fetch(`/api/students?${params.toString()}`, { cache: 'no-store' });
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

  // Fetch available batches for assignment
  useEffect(() => {
    fetch('/api/batches?isActive=true')
      .then((r) => r.json())
      .then((d) => setAvailableBatches(d.data || []))
      .catch(() => {});
  }, []);

  // Fetch Nexus classrooms
  useEffect(() => {
    fetch('/api/nexus/classrooms')
      .then((r) => r.json())
      .then((d) => setNexusClassrooms(d.data || []))
      .catch(() => {});
  }, []);

  // Fetch Nexus enrollments for all loaded students
  useEffect(() => {
    if (students.length === 0) return;
    const fetchEnrollments = async () => {
      const enrollmentMap: Record<string, { classroom_id: string; batch_id: string | null }> = {};
      await Promise.all(
        students.map(async (s) => {
          try {
            const res = await fetch(`/api/students/${s.user_id}/nexus-enroll`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
              enrollmentMap[s.user_id] = {
                classroom_id: data.data[0].classroom_id,
                batch_id: data.data[0].batch_id,
              };
            }
          } catch {}
        })
      );
      setNexusEnrollments(enrollmentMap);

      // Pre-fetch batches for all enrolled classrooms
      const classroomIds = [...new Set(Object.values(enrollmentMap).map((e) => e.classroom_id))];
      for (const cid of classroomIds) {
        if (cid) fetchNexusBatches(cid);
      }
    };
    fetchEnrollments();
  }, [students]);

  // Fetch Nexus batches when classroom is selected
  const fetchNexusBatches = async (classroomId: string) => {
    if (nexusBatchesMap[classroomId]) return;
    try {
      const res = await fetch(`/api/nexus/classrooms/${classroomId}/batches`);
      const data = await res.json();
      setNexusBatchesMap((prev) => ({ ...prev, [classroomId]: data.data || [] }));
    } catch {}
  };

  const handleNexusClassroomAssign = async (userId: string, classroomId: string) => {
    setAssigningNexus(userId);
    try {
      const res = await fetch(`/api/students/${userId}/nexus-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId }),
      });
      if (!res.ok) throw new Error('Failed to assign classroom');
      setNexusEnrollments((prev) => ({
        ...prev,
        [userId]: { classroom_id: classroomId, batch_id: null },
      }));
      if (classroomId) fetchNexusBatches(classroomId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningNexus(null);
    }
  };

  const handleNexusBatchAssign = async (userId: string, classroomId: string, batchId: string) => {
    setAssigningNexus(userId);
    try {
      const res = await fetch(`/api/students/${userId}/nexus-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId, batchId: batchId || null }),
      });
      if (!res.ok) throw new Error('Failed to assign batch');
      setNexusEnrollments((prev) => ({
        ...prev,
        [userId]: { classroom_id: classroomId, batch_id: batchId || null },
      }));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningNexus(null);
    }
  };

  const handleLinkMsAccount = async () => {
    if (!msLinkTarget || !msOidInput.trim()) return;
    setMsLinking(true);
    setMsLinkError('');
    try {
      const res = await fetch(`/api/students/${msLinkTarget.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msOid: msOidInput.trim() }),
      });
      if (!res.ok) throw new Error('Failed to link Microsoft account');
      setMsLinkTarget(null);
      setMsOidInput('');
    } catch (err: any) {
      setMsLinkError(err.message || 'Failed to link');
    } finally {
      setMsLinking(false);
    }
  };

  const handleAssignBatch = async (userId: string, batchId: string) => {
    setAssigningBatch(userId);
    try {
      const res = await fetch(`/api/students/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batchId || null }),
      });
      if (!res.ok) throw new Error('Failed to assign batch');
      fetchStudents();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningBatch(null);
    }
  };

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

  const handleDeleteStudent = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/students/${deleteTarget.user_id}`, { method: 'DELETE', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete');
      }
      setDeleteTarget(null);
      setDeleteError('');
      await fetchStudents();
    } catch (err: any) {
      setDeleteError(err.message || 'Failed to delete student');
    } finally {
      setDeleting(false);
    }
  };

  // Column definitions for DataTable
  const columns = [
    {
      field: 'student_id',
      headerName: 'Student ID',
      width: 150,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" fontWeight={600} sx={{ fontFamily: 'monospace', fontSize: 13 }}>
          {row.student_id || '-'}
        </Typography>
      ),
    },
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
      width: 110,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Typography variant="body2" sx={{ fontSize: 13 }}>
          {formatDate(row.enrollment_date)}
        </Typography>
      ),
    },
    {
      field: 'source',
      headerName: 'Join Method',
      width: 120,
      renderCell: ({ row }: { row: StudentRow; value: any }) => {
        const label = row.source === 'direct_link' ? 'Direct' : 'Application';
        const color = row.source === 'direct_link' ? '#7B1FA2' : '#1565C0';
        return (
          <Chip
            label={label}
            size="small"
            sx={{
              fontWeight: 600,
              fontSize: 11,
              height: 22,
              bgcolor: `${color}14`,
              color,
              borderRadius: 0.75,
            }}
          />
        );
      },
    },
    {
      field: 'batch_name',
      headerName: 'Batch',
      width: 160,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Select
          size="small"
          value={row.batch_id || ''}
          onChange={(e) => {
            e.stopPropagation();
            handleAssignBatch(row.user_id, e.target.value as string);
          }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          displayEmpty
          disabled={assigningBatch === row.user_id}
          sx={{ fontSize: 12, height: 28, minWidth: 120, '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="" sx={{ fontSize: 12 }}>
            <em>Unassigned</em>
          </MenuItem>
          {availableBatches.map((b) => (
            <MenuItem key={b.id} value={b.id} sx={{ fontSize: 12 }}>
              {b.name} ({b.enrolled_count}/{b.capacity})
            </MenuItem>
          ))}
        </Select>
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
    {
      field: 'nexus_classroom',
      headerName: 'Nexus Classroom',
      width: 170,
      renderCell: ({ row }: { row: StudentRow; value: any }) => {
        const enrollment = nexusEnrollments[row.user_id];
        return (
          <Select
            size="small"
            value={enrollment?.classroom_id || ''}
            onChange={(e) => {
              e.stopPropagation();
              handleNexusClassroomAssign(row.user_id, e.target.value as string);
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            displayEmpty
            disabled={assigningNexus === row.user_id}
            sx={{ fontSize: 12, height: 28, minWidth: 140, '& .MuiSelect-select': { py: 0.5 } }}
          >
            <MenuItem value="" sx={{ fontSize: 12 }}>
              <em>Not assigned</em>
            </MenuItem>
            {nexusClassrooms.map((c) => (
              <MenuItem key={c.id} value={c.id} sx={{ fontSize: 12 }}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        );
      },
    },
    {
      field: 'nexus_batch',
      headerName: 'Nexus Batch',
      width: 160,
      renderCell: ({ row }: { row: StudentRow; value: any }) => {
        const enrollment = nexusEnrollments[row.user_id];
        if (!enrollment?.classroom_id) {
          return <Typography variant="body2" color="text.disabled" sx={{ fontSize: 12 }}>—</Typography>;
        }
        const batches = nexusBatchesMap[enrollment.classroom_id] || [];
        return (
          <Select
            size="small"
            value={enrollment.batch_id || ''}
            onChange={(e) => {
              e.stopPropagation();
              handleNexusBatchAssign(row.user_id, enrollment.classroom_id, e.target.value as string);
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            displayEmpty
            disabled={assigningNexus === row.user_id}
            sx={{ fontSize: 12, height: 28, minWidth: 130, '& .MuiSelect-select': { py: 0.5 } }}
          >
            <MenuItem value="" sx={{ fontSize: 12 }}>
              <em>No batch</em>
            </MenuItem>
            {batches.map((b: any) => (
              <MenuItem key={b.id} value={b.id} sx={{ fontSize: 12 }}>
                {b.name}
              </MenuItem>
            ))}
          </Select>
        );
      },
    },
    {
      field: 'ms_link',
      headerName: 'MS Account',
      width: 110,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Tooltip title="Link Microsoft account for Nexus access">
          <Button
            size="small"
            variant="outlined"
            startIcon={<LinkIcon sx={{ fontSize: 14 }} />}
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setMsLinkTarget(row);
              setMsOidInput('');
              setMsLinkError('');
            }}
            sx={{ fontSize: 11, height: 28, textTransform: 'none' }}
          >
            Link MS
          </Button>
        </Tooltip>
      ),
    },
    {
      field: 'actions',
      headerName: '',
      width: 60,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <Tooltip title="Delete student">
          <IconButton
            size="small"
            color="error"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              setDeleteTarget(row);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: isMobile ? 1.5 : 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: isMobile ? 1 : 1.5 }}>
          <Box
            sx={{
              width: isMobile ? 32 : 42,
              height: isMobile ? 32 : 42,
              borderRadius: 1,
              bgcolor: 'primary.main',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SchoolIcon sx={{ color: 'white', fontSize: isMobile ? 16 : 22 }} />
          </Box>
          <Box>
            <Typography variant={isMobile ? 'h6' : 'h5'} fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Enrolled Students
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: isMobile ? 11 : undefined }}>
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
      <Box
        sx={
          isMobile
            ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75, mb: 1.5 }
            : { display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }
        }
      >
        <StatCard
          title="Total Students"
          value={stats.totalStudents}
          icon={<PeopleAltIcon sx={{ color: '#1976d2', fontSize: isMobile ? 12 : 24 }} />}
          color="#1976d2"
          loading={loading}
          compact={isMobile}
        />
        <StatCard
          title="Fully Paid"
          value={stats.fullyPaid}
          icon={<CheckCircleIcon sx={{ color: '#2e7d32', fontSize: isMobile ? 12 : 24 }} />}
          color="#2e7d32"
          loading={loading}
          compact={isMobile}
        />
        <StatCard
          title="Partial Payment"
          value={stats.partialPayment}
          icon={<HourglassBottomIcon sx={{ color: '#ed6c02', fontSize: isMobile ? 12 : 24 }} />}
          color="#ed6c02"
          loading={loading}
          compact={isMobile}
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(stats.totalRevenue)}
          icon={<CurrencyRupeeIcon sx={{ color: '#9c27b0', fontSize: isMobile ? 12 : 24 }} />}
          color="#9c27b0"
          loading={loading}
          compact={isMobile}
        />
      </Box>

      {/* Filters */}
      {isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1.5 }}>
          <TextField
            size="small"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
            }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={<FilterListIcon sx={{ fontSize: 14 }} />}
              label={`Filters${(courseFilter || paymentFilter || batchFilter) ? ` (${[courseFilter, paymentFilter, batchFilter].filter(Boolean).length})` : ''}`}
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              variant={filtersExpanded ? 'filled' : 'outlined'}
              size="small"
              sx={{ fontSize: 11, height: 28 }}
            />
            {(courseFilter || paymentFilter || batchFilter) && (
              <Chip
                label="Clear"
                size="small"
                onDelete={() => {
                  setCourseFilter('');
                  setPaymentFilter('');
                  setBatchFilter('');
                }}
                sx={{ fontSize: 10, height: 24 }}
              />
            )}
          </Box>
          <Collapse in={filtersExpanded}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, pt: 0.5 }}>
              <FormControl size="small" fullWidth>
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
              <FormControl size="small" fullWidth>
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
              <FormControl size="small" fullWidth>
                <InputLabel>Batch</InputLabel>
                <Select
                  value={batchFilter}
                  label="Batch"
                  onChange={(e) => setBatchFilter(e.target.value)}
                >
                  <MenuItem value="">All Batches</MenuItem>
                  <MenuItem value="unassigned">Unassigned</MenuItem>
                  {availableBatches.map((b) => (
                    <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Collapse>
        </Box>
      ) : (
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
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Batch</InputLabel>
            <Select
              value={batchFilter}
              label="Batch"
              onChange={(e) => setBatchFilter(e.target.value)}
            >
              <MenuItem value="">All Batches</MenuItem>
              <MenuItem value="unassigned">Unassigned</MenuItem>
              {availableBatches.map((b) => (
                <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      )}

      {/* Data Table / Mobile Card List */}
      {(() => {
        const filteredStudents = batchFilter
          ? batchFilter === 'unassigned'
            ? students.filter((s) => !s.batch_id)
            : students.filter((s) => s.batch_id === batchFilter)
          : students;

        if (isMobile) {
          const totalPages = Math.ceil(filteredStudents.length / mobilePageSize);
          const paginatedStudents = filteredStudents.slice(
            (mobilePage - 1) * mobilePageSize,
            mobilePage * mobilePageSize
          );

          return (
            <Paper
              elevation={0}
              sx={{
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'grey.200',
                overflow: 'hidden',
              }}
            >
              {loading ? (
                <Box sx={{ p: 1 }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Box key={i} sx={{ p: 1.25, borderBottom: '1px solid', borderColor: 'grey.100' }}>
                      <Skeleton width="60%" height={16} sx={{ mb: 0.5 }} />
                      <Skeleton width="40%" height={12} sx={{ mb: 0.5 }} />
                      <Skeleton width="80%" height={12} />
                    </Box>
                  ))}
                </Box>
              ) : filteredStudents.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
                  <Typography color="text.secondary" sx={{ fontSize: 13 }}>No students found</Typography>
                </Box>
              ) : (
                <>
                  {paginatedStudents.map((student) => {
                    const name = [student.first_name, student.last_name].filter(Boolean).join(' ') || '-';
                    return (
                      <Box
                        key={student.id}
                        onClick={() => handleRowClick(student)}
                        sx={{
                          p: 1.25,
                          borderBottom: '1px solid',
                          borderColor: 'grey.100',
                          cursor: 'pointer',
                          '&:active': { bgcolor: 'grey.50' },
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 1.25,
                        }}
                      >
                        {/* Content */}
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          {/* Row 1: Name + Date */}
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.25 }}>
                            <Typography
                              sx={{
                                fontWeight: 600,
                                fontSize: 14,
                                lineHeight: 1.3,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                flex: 1,
                                mr: 1,
                              }}
                            >
                              {name}
                            </Typography>
                            <Typography sx={{ fontSize: 10, color: 'text.disabled', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatDate(student.enrollment_date)}
                            </Typography>
                          </Box>

                          {/* Row 2: Student ID */}
                          <Typography
                            sx={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: 'text.secondary',
                              mb: 0.25,
                            }}
                          >
                            {student.student_id || 'No ID'}
                          </Typography>

                          {/* Row 3: Email/Phone */}
                          <Typography
                            sx={{
                              fontSize: 11,
                              color: 'text.secondary',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              mb: 0.75,
                            }}
                          >
                            {student.email || student.phone || '-'}
                          </Typography>

                          {/* Row 4: Chips */}
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                            <Chip
                              label={getPaymentStatusLabel(student.payment_status)}
                              color={getPaymentStatusColor(student.payment_status)}
                              size="small"
                              sx={{ height: 20, fontSize: 10, fontWeight: 600, '& .MuiChip-label': { px: 0.75 } }}
                            />
                            {student.interest_course && (
                              <Chip
                                label={COURSE_LABELS[student.interest_course] || student.interest_course}
                                size="small"
                                variant="outlined"
                                sx={{ height: 20, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
                              />
                            )}
                            {student.fee_paid > 0 && (
                              <Typography sx={{ fontSize: 10, fontWeight: 700, color: 'success.main', fontFamily: 'monospace' }}>
                                {formatCurrency(student.fee_paid)}
                              </Typography>
                            )}
                            {student.fee_due > 0 && (
                              <Typography sx={{ fontSize: 10, fontWeight: 600, color: 'error.main', fontFamily: 'monospace' }}>
                                Due: {formatCurrency(student.fee_due)}
                              </Typography>
                            )}
                          </Box>
                        </Box>

                        {/* Chevron */}
                        <ChevronRightIcon sx={{ fontSize: 16, color: 'text.disabled', mt: 0.5, flexShrink: 0 }} />
                      </Box>
                    );
                  })}

                  {/* Pagination */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      px: 1.5,
                      py: 1,
                      borderTop: '1px solid',
                      borderColor: 'grey.200',
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                      {filteredStudents.length} students
                    </Typography>
                    {totalPages > 1 && (
                      <Pagination
                        count={totalPages}
                        page={mobilePage}
                        onChange={(_, page) => setMobilePage(page)}
                        size="small"
                        sx={{ '& .MuiPaginationItem-root': { fontSize: 11, minWidth: 28, height: 28 } }}
                      />
                    )}
                  </Box>
                </>
              )}
            </Paper>
          );
        }

        return (
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
              rows={filteredStudents}
              columns={columns}
              loading={loading}
              onRowClick={handleRowClick}
              defaultRowsPerPage={25}
            />
          </Paper>
        );
      })()}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)}>
        <DialogTitle>Delete Student</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete{' '}
            <strong>
              {deleteTarget
                ? [deleteTarget.first_name, deleteTarget.last_name].filter(Boolean).join(' ') || deleteTarget.email
                : ''}
            </strong>
            ?
          </Typography>
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            This will delete the student profile, lead profile, payments, onboarding progress, and user account. This action cannot be undone.
          </Typography>
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteTarget(null); setDeleteError(''); }} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteStudent}
            color="error"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Link Microsoft Account Dialog */}
      <Dialog open={!!msLinkTarget} onClose={() => !msLinking && setMsLinkTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Link Microsoft Account</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Link a Microsoft account to{' '}
            <strong>
              {msLinkTarget
                ? [msLinkTarget.first_name, msLinkTarget.last_name].filter(Boolean).join(' ') || msLinkTarget.email
                : ''}
            </strong>
            {' '}so they can access Nexus with their Microsoft/Teams login.
          </Typography>
          <TextField
            label="Microsoft Object ID (OID)"
            value={msOidInput}
            onChange={(e) => setMsOidInput(e.target.value)}
            fullWidth
            size="small"
            placeholder="e.g., 5b3c917c-7d27-4bda-b009-26460aee806c"
            helperText="The Azure AD Object ID for this student's Microsoft account. Find it in Microsoft Entra admin center → Users → select user → Object ID."
            disabled={msLinking}
          />
          {msLinkError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {msLinkError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setMsLinkTarget(null); setMsLinkError(''); }} disabled={msLinking}>
            Cancel
          </Button>
          <Button
            onClick={handleLinkMsAccount}
            variant="contained"
            disabled={msLinking || !msOidInput.trim()}
          >
            {msLinking ? 'Linking...' : 'Link Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
