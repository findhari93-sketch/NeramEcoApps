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
  CircularProgress,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import KeyIcon from '@mui/icons-material/Key';
import SendIcon from '@mui/icons-material/Send';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import GroupsIcon from '@mui/icons-material/Groups';
import SaveIcon from '@mui/icons-material/Save';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import DataTable from '@/components/DataTable';
import CopyablePhone from '@/components/CopyablePhone';
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
  ms_teams_email: string | null;
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

  // (Legacy batch assignment removed — using Nexus classrooms only)

  // Nexus classrooms & batches
  const [nexusClassrooms, setNexusClassrooms] = useState<{ id: string; name: string; type: string }[]>([]);
  const [nexusBatchesMap, setNexusBatchesMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [nexusEnrollments, setNexusEnrollments] = useState<Record<string, { classroom_id: string; batch_id: string | null }[]>>({});
  const [assigningNexus, setAssigningNexus] = useState<string | null>(null);

  // Share Credentials
  const [credTarget, setCredTarget] = useState<StudentRow | null>(null);
  const [credEmail, setCredEmail] = useState('');
  const [credPassword, setCredPassword] = useState('');
  const [credShowPassword, setCredShowPassword] = useState(false);
  const [credSharing, setCredSharing] = useState(false);
  const [credError, setCredError] = useState('');
  const [credSuccess, setCredSuccess] = useState(false);

  // Legacy student reconciliation
  const [legacyStudents, setLegacyStudents] = useState<any[]>([]);
  const [legacyCount, setLegacyCount] = useState(0);
  const [showReconcileDialog, setShowReconcileDialog] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResults, setReconcileResults] = useState<any>(null);
  const [selectedLegacy, setSelectedLegacy] = useState<Set<string>>(new Set());

  // Entra sync
  const [showEntraSync, setShowEntraSync] = useState(false);
  const [entraStudents, setEntraStudents] = useState<any[]>([]);
  const [entraLoading, setEntraLoading] = useState(false);
  const [entraEnrolling, setEntraEnrolling] = useState(false);
  const [entraResults, setEntraResults] = useState<any>(null);
  const [entraCourseMap, setEntraCourseMap] = useState<Record<string, string>>({});
  const [entraSelected, setEntraSelected] = useState<Set<string>>(new Set());

  // Group chat config
  const [groupChatConfig, setGroupChatConfig] = useState<{ chat_id: string; chat_name: string; invite_link: string; auto_add_enabled: boolean }>({ chat_id: '', chat_name: '', invite_link: '', auto_add_enabled: false });
  const [editingGroupChat, setEditingGroupChat] = useState(false);
  const [groupChatInput, setGroupChatInput] = useState('');
  const [groupChatNameInput, setGroupChatNameInput] = useState('');
  const [groupChatInviteLinkInput, setGroupChatInviteLinkInput] = useState('');
  const [savingGroupChat, setSavingGroupChat] = useState(false);
  const [groupChatInfo, setGroupChatInfo] = useState<string | null>(null);

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

  // Fetch Nexus classrooms
  useEffect(() => {
    fetch('/api/nexus/classrooms')
      .then((r) => r.json())
      .then((d) => setNexusClassrooms(d.data || []))
      .catch(() => {});
  }, []);

  // Fetch group chat config
  useEffect(() => {
    fetch('/api/settings/teams-group-chat')
      .then((r) => r.json())
      .then((d) => { if (d.data) setGroupChatConfig(d.data); })
      .catch(() => {});
  }, []);

  const handleSaveGroupChat = async () => {
    setSavingGroupChat(true);
    try {
      const res = await fetch('/api/settings/teams-group-chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: groupChatInput,
          chatName: groupChatNameInput,
          inviteLink: groupChatInviteLinkInput,
          autoAddEnabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGroupChatConfig(data.data);
      setEditingGroupChat(false);
    } catch (err: any) {
      setError(err.message || 'Failed to save group chat config');
    } finally {
      setSavingGroupChat(false);
    }
  };

  // Fetch legacy students count
  useEffect(() => {
    fetch('/api/students/reconcile')
      .then((r) => r.json())
      .then((d) => {
        setLegacyStudents(d.students || []);
        setLegacyCount(d.count || 0);
      })
      .catch(() => {});
  }, []);

  const handleReconcile = async () => {
    const userIds = Array.from(selectedLegacy);
    if (userIds.length === 0) return;
    setReconciling(true);
    setReconcileResults(null);
    try {
      const res = await fetch('/api/students/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReconcileResults(data);
      // Refresh legacy count
      const refreshRes = await fetch('/api/students/reconcile');
      const refreshData = await refreshRes.json();
      setLegacyStudents(refreshData.students || []);
      setLegacyCount(refreshData.count || 0);
      setSelectedLegacy(new Set());
      // Also refresh main student list
      fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Reconciliation failed');
    } finally {
      setReconciling(false);
    }
  };

  const handleFetchEntra = async () => {
    setEntraLoading(true);
    setEntraResults(null);
    try {
      const res = await fetch('/api/students/sync-entra');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntraStudents(data.students || []);
      // Default course to 'nata' and select all needing setup
      const courseMap: Record<string, string> = {};
      const selected = new Set<string>();
      (data.students || []).forEach((s: any) => {
        if (s.needsSetup) {
          courseMap[s.msOid] = 'nata';
          selected.add(s.msOid);
        }
      });
      setEntraCourseMap(courseMap);
      setEntraSelected(selected);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch from Entra');
    } finally {
      setEntraLoading(false);
    }
  };

  const handleEntraEnroll = async () => {
    const studentsToEnroll = entraStudents
      .filter((s: any) => s.needsSetup && entraSelected.has(s.msOid) && entraCourseMap[s.msOid])
      .map((s: any) => ({
        msOid: s.msOid,
        email: s.email,
        name: s.name,
        course: entraCourseMap[s.msOid],
      }));

    if (studentsToEnroll.length === 0) return;
    setEntraEnrolling(true);
    try {
      const res = await fetch('/api/students/sync-entra', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: studentsToEnroll }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEntraResults(data);
      // Refresh
      handleFetchEntra();
      fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Enrollment failed');
    } finally {
      setEntraEnrolling(false);
    }
  };

  // Fetch Nexus enrollments for all loaded students (supports multiple classrooms per student)
  useEffect(() => {
    if (students.length === 0) return;
    const fetchEnrollments = async () => {
      const enrollmentMap: Record<string, { classroom_id: string; batch_id: string | null }[]> = {};
      await Promise.all(
        students.map(async (s) => {
          try {
            const res = await fetch(`/api/students/${s.user_id}/nexus-enroll`);
            const data = await res.json();
            if (data.data && data.data.length > 0) {
              enrollmentMap[s.user_id] = data.data.map((e: any) => ({
                classroom_id: e.classroom_id,
                batch_id: e.batch_id,
              }));
            }
          } catch {}
        })
      );
      setNexusEnrollments(enrollmentMap);

      // Pre-fetch batches for all enrolled classrooms
      const classroomIds = [...new Set(Object.values(enrollmentMap).flatMap((enrollments) => enrollments.map((e) => e.classroom_id)))];
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

  const handleNexusClassroomAdd = async (userId: string, classroomId: string) => {
    setAssigningNexus(userId);
    try {
      const res = await fetch(`/api/students/${userId}/nexus-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to assign classroom');
      setNexusEnrollments((prev) => {
        const existing = prev[userId] || [];
        if (existing.some((e) => e.classroom_id === classroomId)) return prev;
        return { ...prev, [userId]: [...existing, { classroom_id: classroomId, batch_id: null }] };
      });
      fetchNexusBatches(classroomId);

      // Show Teams auto-add result and group chat invite link
      if (data.teamsAutoAdd?.reason === 'no_ms_teams_email') {
        setError('Classroom assigned but Teams auto-add skipped — share credentials first so the student gets a Teams email.');
      } else {
        setError('');
      }
      if (data.groupChatInviteLink) {
        setGroupChatInfo(data.groupChatInviteLink);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningNexus(null);
    }
  };

  const handleNexusClassroomRemove = async (userId: string, classroomId: string) => {
    setAssigningNexus(userId);
    try {
      const supabase = await fetch(`/api/students/${userId}/nexus-enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classroomId, remove: true }),
      });
      setNexusEnrollments((prev) => {
        const existing = prev[userId] || [];
        return { ...prev, [userId]: existing.filter((e) => e.classroom_id !== classroomId) };
      });
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
      setNexusEnrollments((prev) => {
        const existing = prev[userId] || [];
        return {
          ...prev,
          [userId]: existing.map((e) =>
            e.classroom_id === classroomId ? { ...e, batch_id: batchId || null } : e
          ),
        };
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAssigningNexus(null);
    }
  };

  const handleShareCredentials = async () => {
    if (!credTarget || !credEmail || !credPassword) return;
    setCredSharing(true);
    setCredError('');
    try {
      const targetUserId = credTarget.user_id;
      const sharedEmail = credEmail;
      const res = await fetch(`/api/students/${targetUserId}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sharedEmail, password: credPassword, credentialType: 'ms_teams' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to share credentials');
      // Update local student data so classroom assignment becomes enabled immediately
      setStudents((prev) =>
        prev.map((s) =>
          s.user_id === targetUserId ? { ...s, ms_teams_email: sharedEmail } : s
        )
      );
      setCredSuccess(true);
      setCredTarget(null);
      setCredEmail('');
      setCredPassword('');
      setCredShowPassword(false);
      setTimeout(() => setCredSuccess(false), 5000);
    } catch (err: any) {
      setCredError(err.message || 'Failed to share');
    } finally {
      setCredSharing(false);
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
      width: 170,
      renderCell: ({ row }: { row: StudentRow; value: any }) => (
        <CopyablePhone phone={row.phone} noWrap showOnHover />
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
      headerName: 'Classrooms & Batches',
      width: 320,
      renderCell: ({ row }: { row: StudentRow; value: any }) => {
        const enrollments = nexusEnrollments[row.user_id] || [];
        const enrolledClassroomIds = enrollments.map((e) => e.classroom_id);
        const unassignedClassrooms = nexusClassrooms.filter((c) => !enrolledClassroomIds.includes(c.id));
        const hasCredentials = !!row.ms_teams_email;

        // If no credentials shared yet, show disabled state with guidance
        if (!hasCredentials) {
          return (
            <Tooltip title="Share credentials first to enable classroom assignment" arrow>
              <Box
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.5, py: 0.5, width: '100%', opacity: 0.5, cursor: 'not-allowed' }}
              >
                <KeyIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                <Typography variant="body2" color="text.disabled" sx={{ fontSize: 11 }}>
                  Share credentials first
                </Typography>
              </Box>
            </Tooltip>
          );
        }

        return (
          <Box
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.5, width: '100%' }}
          >
            {/* Enrolled classrooms with batch selectors */}
            {enrollments.map((enrollment) => {
              const classroom = nexusClassrooms.find((c) => c.id === enrollment.classroom_id);
              const batches = nexusBatchesMap[enrollment.classroom_id] || [];
              return (
                <Box key={enrollment.classroom_id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Chip
                    label={classroom?.name || 'Unknown'}
                    size="small"
                    onDelete={() => handleNexusClassroomRemove(row.user_id, enrollment.classroom_id)}
                    deleteIcon={<CloseIcon sx={{ fontSize: '14px !important' }} />}
                    sx={{ fontSize: 11, height: 22, fontWeight: 500 }}
                  />
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
                    sx={{ fontSize: 11, height: 22, minWidth: 90, '& .MuiSelect-select': { py: 0, px: 1 } }}
                  >
                    <MenuItem value="" sx={{ fontSize: 11 }}>
                      <em>No batch</em>
                    </MenuItem>
                    {batches.map((b: any) => (
                      <MenuItem key={b.id} value={b.id} sx={{ fontSize: 11 }}>
                        {b.name}
                      </MenuItem>
                    ))}
                  </Select>
                </Box>
              );
            })}

            {/* Add classroom selector */}
            {unassignedClassrooms.length > 0 && (
              <Select
                size="small"
                value=""
                onChange={(e) => {
                  e.stopPropagation();
                  if (e.target.value) handleNexusClassroomAdd(row.user_id, e.target.value as string);
                }}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                displayEmpty
                disabled={assigningNexus === row.user_id}
                sx={{ fontSize: 11, height: 22, minWidth: 120, '& .MuiSelect-select': { py: 0, px: 1 }, color: 'text.secondary' }}
              >
                <MenuItem value="" sx={{ fontSize: 11 }}>
                  <em><AddIcon sx={{ fontSize: 12, mr: 0.5, verticalAlign: 'middle' }} /> Add classroom</em>
                </MenuItem>
                {unassignedClassrooms.map((c) => (
                  <MenuItem key={c.id} value={c.id} sx={{ fontSize: 11 }}>
                    {c.name}
                  </MenuItem>
                ))}
              </Select>
            )}

            {enrollments.length === 0 && unassignedClassrooms.length === 0 && (
              <Typography variant="body2" color="text.disabled" sx={{ fontSize: 11 }}>No classrooms</Typography>
            )}
          </Box>
        );
      },
    },
    {
      field: 'credentials',
      headerName: 'Credentials',
      width: 150,
      renderCell: ({ row }: { row: StudentRow; value: any }) => {
        const hasCredentials = !!row.ms_teams_email;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {hasCredentials && (
              <Tooltip title={`Credentials shared: ${row.ms_teams_email}`}>
                <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} />
              </Tooltip>
            )}
            <Tooltip title={hasCredentials ? 'Re-share Teams login credentials' : 'Share Teams login credentials'}>
              <Button
                size="small"
                variant={hasCredentials ? 'text' : 'outlined'}
                color={hasCredentials ? 'inherit' : 'primary'}
                startIcon={<KeyIcon sx={{ fontSize: 14 }} />}
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  setCredTarget(row);
                  setCredEmail(row.ms_teams_email || '');
                  setCredPassword('');
                  setCredShowPassword(false);
                  setCredError('');
                }}
                sx={{ fontSize: 11, height: 28, textTransform: 'none' }}
              >
                {hasCredentials ? 'Re-share' : 'Share'}
              </Button>
            </Tooltip>
          </Box>
        );
      },
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
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
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => { setShowEntraSync(true); handleFetchEntra(); }}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
          >
            Sync from Entra
          </Button>
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={fetchStudents} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}
      {groupChatInfo && (
        <Alert
          severity="info"
          sx={{ mb: 2, borderRadius: 1 }}
          onClose={() => setGroupChatInfo(null)}
          action={
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Tooltip title="Copy invite link">
                <IconButton size="small" color="inherit" onClick={() => navigator.clipboard.writeText(groupChatInfo)}>
                  <ContentCopyIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Open in Teams">
                <IconButton size="small" color="inherit" component="a" href={groupChatInfo} target="_blank" rel="noopener noreferrer">
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          }
        >
          Classroom assigned. Share this group chat invite link with the student so they can join the chat.
        </Alert>
      )}
      {credSuccess && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: 1 }} onClose={() => setCredSuccess(false)}>
          Credentials shared successfully! The student can view them in their onboarding page.
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
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

      {/* Legacy Students Banner */}
      {legacyCount > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2, borderRadius: 1 }}
          action={
            <Button
              color="warning"
              size="small"
              variant="contained"
              onClick={() => {
                setShowReconcileDialog(true);
                setReconcileResults(null);
                setSelectedLegacy(new Set(legacyStudents.map((s: any) => s.userId)));
              }}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Setup Onboarding
            </Button>
          }
        >
          <strong>{legacyCount} legacy students</strong> have Nexus classrooms but no onboarding pipeline.
          Click to initialize their onboarding, verify Teams membership, and set up identity document collection.
        </Alert>
      )}

      {/* Group Chat Config */}
      <Paper elevation={0} sx={{ p: 1.5, mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <GroupsIcon sx={{ color: '#7B1FA2', fontSize: 20 }} />
        {editingGroupChat ? (
          <>
            <TextField
              size="small"
              label="Chat Name"
              value={groupChatNameInput}
              onChange={(e) => setGroupChatNameInput(e.target.value)}
              sx={{ width: 200 }}
              placeholder="e.g., 2026 - Neramclasses"
            />
            <TextField
              size="small"
              label="Teams Chat ID"
              value={groupChatInput}
              onChange={(e) => setGroupChatInput(e.target.value)}
              sx={{ width: 280 }}
              placeholder="19:xxx@thread.v2"
              helperText="From the Teams chat URL"
            />
            <TextField
              size="small"
              label="Group Chat Invite Link"
              value={groupChatInviteLinkInput}
              onChange={(e) => setGroupChatInviteLinkInput(e.target.value)}
              sx={{ flex: 1, minWidth: 300 }}
              placeholder="https://teams.microsoft.com/l/chat/..."
              helperText="Right-click the chat in Teams and click Get link to chat"
            />
            <Button
              size="small"
              variant="contained"
              startIcon={savingGroupChat ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
              onClick={handleSaveGroupChat}
              disabled={savingGroupChat || !groupChatInput}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              Save
            </Button>
            <Button size="small" onClick={() => setEditingGroupChat(false)} sx={{ textTransform: 'none' }}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Auto-join Group Chat:
            </Typography>
            {groupChatConfig.chat_id ? (
              <>
                <Chip label={groupChatConfig.chat_name || 'Configured'} size="small" color="primary" variant="outlined" />
                <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                  {groupChatConfig.chat_id.slice(0, 30)}...
                </Typography>
                {groupChatConfig.invite_link ? (
                  <Tooltip title="Copy group chat invite link">
                    <Chip
                      label="Invite Link"
                      size="small"
                      color="success"
                      variant="outlined"
                      icon={<ContentCopyIcon sx={{ fontSize: 14 }} />}
                      onClick={() => navigator.clipboard.writeText(groupChatConfig.invite_link)}
                      sx={{ cursor: 'pointer' }}
                    />
                  </Tooltip>
                ) : (
                  <Chip label="No invite link" size="small" color="warning" variant="outlined" />
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">Not configured</Typography>
            )}
            <Tooltip title="Edit group chat config">
              <IconButton
                size="small"
                onClick={() => {
                  setGroupChatInput(groupChatConfig.chat_id);
                  setGroupChatNameInput(groupChatConfig.chat_name);
                  setGroupChatInviteLinkInput(groupChatConfig.invite_link || '');
                  setEditingGroupChat(true);
                }}
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Paper>

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
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel>Classroom</InputLabel>
          <Select
            value={batchFilter}
            label="Classroom"
            onChange={(e) => setBatchFilter(e.target.value)}
          >
            <MenuItem value="">All Classrooms</MenuItem>
            <MenuItem value="unassigned">No Classroom</MenuItem>
            {nexusClassrooms.map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
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
          rows={batchFilter ? (batchFilter === 'unassigned' ? students.filter((s) => !nexusEnrollments[s.user_id]?.length) : students.filter((s) => nexusEnrollments[s.user_id]?.some((e) => e.classroom_id === batchFilter))) : students}
          columns={columns}
          loading={loading}
          onRowClick={handleRowClick}
          defaultRowsPerPage={25}
        />
      </Paper>

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

      {/* Share Credentials Dialog */}
      <Dialog open={!!credTarget} onClose={() => !credSharing && setCredTarget(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Share Teams Credentials
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Share Microsoft Teams login credentials with{' '}
            <strong>
              {credTarget
                ? [credTarget.first_name, credTarget.last_name].filter(Boolean).join(' ') || credTarget.email
                : ''}
            </strong>
            . The student will see these in their onboarding page. Credentials auto-destruct 24 hours after first view.
          </Typography>

          {credError && (
            <Alert severity="error" sx={{ mb: 2 }}>{credError}</Alert>
          )}

          <TextField
            label="Teams Email"
            fullWidth
            value={credEmail}
            onChange={(e) => setCredEmail(e.target.value)}
            placeholder="student@neramclasses.onmicrosoft.com"
            size="small"
            sx={{ mb: 2 }}
            disabled={credSharing}
          />
          <TextField
            label="Temporary Password"
            fullWidth
            value={credPassword}
            onChange={(e) => setCredPassword(e.target.value)}
            type={credShowPassword ? 'text' : 'password'}
            placeholder="Enter the temporary password"
            size="small"
            disabled={credSharing}
            InputProps={{
              endAdornment: (
                <IconButton onClick={() => setCredShowPassword(!credShowPassword)} size="small">
                  {credShowPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                </IconButton>
              ),
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setCredTarget(null); setCredError(''); }} disabled={credSharing} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleShareCredentials}
            disabled={!credEmail || !credPassword || credSharing}
            startIcon={credSharing ? <CircularProgress size={16} color="inherit" /> : <SendIcon />}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {credSharing ? 'Sharing...' : 'Share with Student'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Entra Sync Dialog */}
      <Dialog open={showEntraSync} onClose={() => !entraEnrolling && setShowEntraSync(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudDownloadIcon color="primary" /> Sync Students from Microsoft Entra
        </DialogTitle>
        <DialogContent>
          {entraResults ? (
            <Box>
              <Alert severity={entraResults.summary.failed > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
                Enrolled {entraResults.summary.success} of {entraResults.summary.total} students.
                {entraResults.summary.failed > 0 && ` ${entraResults.summary.failed} failed.`}
              </Alert>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {(entraResults.results || []).map((r: any, i: number) => (
                  <Paper key={i} elevation={0} sx={{ p: 1, mb: 0.5, border: '1px solid', borderColor: r.success ? 'success.200' : 'error.200', borderRadius: 1, fontSize: 12 }}>
                    <Typography variant="body2" fontWeight={600}>{r.name} ({r.email})</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                      {(r.actions || []).map((a: string, j: number) => (
                        <Chip key={j} label={a} size="small" sx={{ fontSize: 10, height: 18 }} />
                      ))}
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          ) : entraLoading ? (
            <Box textAlign="center" py={4}>
              <CircularProgress size={40} />
              <Typography variant="body2" color="text.secondary" mt={2}>Fetching students from Azure AD...</Typography>
            </Box>
          ) : (
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Students from Microsoft Entra. Set the course for each student not yet in Nexus, then click Enroll.
                They&apos;ll be added to classrooms (Common + course-specific), Teams teams, group chat, and the onboarding pipeline.
              </Typography>

              {entraStudents.length > 0 && (
                <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Chip label={`${entraStudents.filter((s: any) => !s.needsSetup).length} already in Nexus`} color="success" size="small" />
                  <Chip label={`${entraStudents.filter((s: any) => s.needsSetup).length} need setup`} color="warning" size="small" />
                  <Chip label={`${entraSelected.size} selected`} color="primary" size="small" variant="outlined" />
                </Box>
              )}

              <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
                {/* Students needing setup */}
                {entraStudents.filter((s: any) => s.needsSetup).length > 0 && (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, mt: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      Needs Setup ({entraStudents.filter((s: any) => s.needsSetup).length})
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button
                        size="small"
                        onClick={() => setEntraSelected(new Set(entraStudents.filter((s: any) => s.needsSetup).map((s: any) => s.msOid)))}
                        sx={{ textTransform: 'none', fontSize: 11 }}
                      >
                        Select All
                      </Button>
                      <Button
                        size="small"
                        onClick={() => setEntraSelected(new Set())}
                        sx={{ textTransform: 'none', fontSize: 11 }}
                      >
                        Deselect All
                      </Button>
                    </Box>
                  </Box>
                )}
                {entraStudents.filter((s: any) => s.needsSetup).map((s: any) => (
                  <Paper
                    key={s.msOid}
                    elevation={0}
                    sx={{
                      p: 1.5, mb: 1, border: '1px solid', borderRadius: 1, cursor: 'pointer',
                      borderColor: entraSelected.has(s.msOid) ? 'primary.main' : 'grey.300',
                      bgcolor: entraSelected.has(s.msOid) ? 'primary.50' : 'grey.50',
                      opacity: entraSelected.has(s.msOid) ? 1 : 0.6,
                    }}
                    onClick={() => {
                      setEntraSelected((prev) => {
                        const next = new Set(prev);
                        next.has(s.msOid) ? next.delete(s.msOid) : next.add(s.msOid);
                        return next;
                      });
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <input
                          type="checkbox"
                          checked={entraSelected.has(s.msOid)}
                          onChange={() => {}}
                          style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <Box>
                          <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                        </Box>
                      </Box>
                      <Select
                        size="small"
                        value={entraCourseMap[s.msOid] || 'nata'}
                        onChange={(e) => {
                          e.stopPropagation();
                          setEntraCourseMap((prev) => ({ ...prev, [s.msOid]: e.target.value }));
                        }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        disabled={!entraSelected.has(s.msOid)}
                        sx={{ fontSize: 12, height: 28, minWidth: 130 }}
                      >
                        <MenuItem value="nata" sx={{ fontSize: 12 }}>NATA</MenuItem>
                        <MenuItem value="jee_paper2" sx={{ fontSize: 12 }}>JEE Paper 2</MenuItem>
                        <MenuItem value="both" sx={{ fontSize: 12 }}>Both</MenuItem>
                      </Select>
                    </Box>
                  </Paper>
                ))}

                {/* Already in Nexus */}
                {entraStudents.filter((s: any) => !s.needsSetup).length > 0 && (
                  <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, mt: 2, color: 'text.secondary' }}>
                    Already in Nexus ({entraStudents.filter((s: any) => !s.needsSetup).length})
                  </Typography>
                )}
                {entraStudents.filter((s: any) => !s.needsSetup).map((s: any) => (
                  <Paper key={s.msOid} elevation={0} sx={{ p: 1, mb: 0.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, opacity: 0.7 }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2">{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {(s.nexusClassrooms || []).map((c: string, i: number) => (
                          <Chip key={i} label={c} size="small" color="success" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                        ))}
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setShowEntraSync(false); setEntraResults(null); }} disabled={entraEnrolling} sx={{ textTransform: 'none' }}>
            {entraResults ? 'Close' : 'Cancel'}
          </Button>
          {!entraResults && !entraLoading && entraSelected.size > 0 && (
            <Button
              variant="contained"
              onClick={handleEntraEnroll}
              disabled={entraEnrolling || entraSelected.size === 0}
              startIcon={entraEnrolling ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {entraEnrolling ? 'Enrolling...' : `Enroll ${entraSelected.size} Selected Students`}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Legacy Student Reconciliation Dialog */}
      <Dialog open={showReconcileDialog} onClose={() => !reconciling && setShowReconcileDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Setup Onboarding for Legacy Students
        </DialogTitle>
        <DialogContent>
          {reconcileResults ? (
            // Results view
            <Box>
              <Alert severity={reconcileResults.summary.failed > 0 ? 'warning' : 'success'} sx={{ mb: 2 }}>
                Reconciled {reconcileResults.summary.success} of {reconcileResults.summary.total} students.
                {reconcileResults.summary.failed > 0 && ` ${reconcileResults.summary.failed} failed.`}
              </Alert>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {(reconcileResults.results || []).map((r: any) => (
                  <Paper key={r.userId} elevation={0} sx={{ p: 1.5, mb: 1, border: '1px solid', borderColor: r.success ? 'success.200' : 'error.200', borderRadius: 1, bgcolor: r.success ? 'success.50' : 'error.50' }}>
                    <Typography variant="body2" fontWeight={600}>{r.userId.slice(0, 8)}...</Typography>
                    {r.error && <Typography variant="caption" color="error">{r.error}</Typography>}
                    {r.steps && (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                        {Object.entries(r.steps).map(([key, val]: [string, any]) => (
                          <Chip
                            key={key}
                            label={`${key}: ${val}`}
                            size="small"
                            color={String(val).includes('error') || String(val).includes('failed') ? 'error' : 'success'}
                            variant="outlined"
                            sx={{ fontSize: 10, height: 20 }}
                          />
                        ))}
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>
            </Box>
          ) : (
            // Selection view
            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These students have Nexus classrooms but no formal onboarding pipeline.
                This will create student profiles, auto-complete steps they&apos;ve already done
                (Teams, Authenticator, credentials), verify Teams membership, and set up identity document collection in Nexus.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Button
                  size="small"
                  onClick={() => setSelectedLegacy(new Set(legacyStudents.map((s: any) => s.userId)))}
                  sx={{ textTransform: 'none' }}
                >
                  Select All ({legacyStudents.length})
                </Button>
                <Button size="small" onClick={() => setSelectedLegacy(new Set())} sx={{ textTransform: 'none' }}>
                  Deselect All
                </Button>
                <Typography variant="caption" color="text.secondary">
                  {selectedLegacy.size} selected
                </Typography>
              </Box>
              <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                {legacyStudents.map((s: any) => (
                  <Paper
                    key={s.userId}
                    elevation={0}
                    sx={{
                      p: 1.5, mb: 1, border: '1px solid', borderRadius: 1,
                      borderColor: selectedLegacy.has(s.userId) ? 'primary.main' : 'divider',
                      cursor: 'pointer',
                      bgcolor: selectedLegacy.has(s.userId) ? 'primary.50' : 'transparent',
                    }}
                    onClick={() => {
                      setSelectedLegacy((prev) => {
                        const next = new Set(prev);
                        next.has(s.userId) ? next.delete(s.userId) : next.add(s.userId);
                        return next;
                      });
                    }}
                  >
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(s.classrooms || []).map((c: any) => (
                          <Chip key={c.id} label={c.name} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                        ))}
                      </Box>
                    </Box>
                  </Paper>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowReconcileDialog(false)} disabled={reconciling} sx={{ textTransform: 'none' }}>
            {reconcileResults ? 'Close' : 'Cancel'}
          </Button>
          {!reconcileResults && (
            <Button
              variant="contained"
              onClick={handleReconcile}
              disabled={reconciling || selectedLegacy.size === 0}
              startIcon={reconciling ? <CircularProgress size={16} color="inherit" /> : null}
              sx={{ textTransform: 'none', fontWeight: 600 }}
            >
              {reconciling ? 'Processing...' : `Initialize ${selectedLegacy.size} Students`}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
