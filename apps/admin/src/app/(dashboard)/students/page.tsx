'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Skeleton,
  Alert,
  IconButton,
  Tooltip,
  MenuItem,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
} from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import RefreshIcon from '@mui/icons-material/Refresh';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom';
import CurrencyRupeeIcon from '@mui/icons-material/CurrencyRupee';
import SyncIcon from '@mui/icons-material/Sync';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import InsightsIcon from '@mui/icons-material/Insights';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import StudentHubTable, { type StudentRow } from '@/components/students/StudentHubTable';
import StudentDetailDrawer from '@/components/alumni/StudentDetailDrawer';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import GraduateDialog from '@/components/crm/GraduateDialog';
import SetAcademicYearDialog from '@/components/crm/SetAcademicYearDialog';
import MarkStaffDialog from '@/components/alumni/MarkStaffDialog';
import { useBatches } from '@/contexts/BatchContext';
import { currentAcademicYear } from '@/components/crm/academic-years';

// StudentRow is defined once in StudentHubTable (the table consumer) and imported
// here so the page state, the table, and its row-click callbacks all share one type.

interface Stats {
  totalStudents: number;
  fullyPaid: number;
  partialPayment: number;
  totalRevenue: number;
  totalPending: number;
  // Active students stuck on a past batch (subset of the current view), and how
  // many of those have lost their Nexus access.
  pastBatchActive?: number;
  pastBatchNoAccess?: number;
}

interface YearRevenue {
  year: string | null;
  studentCount: number;
  totalFee: number;
  collected: number;
  pending: number;
  fullyPaidCount: number;
  partialCount: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
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

const ACCENT = '#B45309'; // brand amber, single accent

// Revenue overview: per-year fee rollup. Comparison bars (sorted by collected,
// desc, with value labels) + per-year cards. Built from /api/students/revenue-by-year.
function RevenueOverview({
  revenue,
  loading,
  onPickYear,
}: {
  revenue: YearRevenue[];
  loading: boolean;
  onPickYear: (year: string) => void;
}) {
  const yearName = (y: string | null) => (y === null ? 'No year set' : y);
  const totalCollected = revenue.reduce((s, r) => s + r.collected, 0);
  const totalPending = revenue.reduce((s, r) => s + r.pending, 0);
  const totalStudents = revenue.reduce((s, r) => s + r.studentCount, 0);
  const maxCollected = Math.max(1, ...revenue.map((r) => r.collected));
  const byCollected = [...revenue].sort((a, b) => b.collected - a.collected);

  if (loading) {
    return (
      <Paper elevation={0} sx={{ p: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
        <Skeleton width={240} height={28} />
        <Skeleton variant="rectangular" height={200} sx={{ mt: 2, borderRadius: 1 }} />
      </Paper>
    );
  }
  if (revenue.length === 0) {
    return (
      <Paper elevation={0} sx={{ p: 4, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, textAlign: 'center' }}>
        <Typography color="text.secondary">No revenue recorded yet.</Typography>
      </Paper>
    );
  }

  return (
    <Box>
      {/* All-years totals */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <StatCard title="Total collected (all years)" value={formatCurrency(totalCollected)} icon={<CurrencyRupeeIcon sx={{ color: '#2e7d32', fontSize: 24 }} />} color="#2e7d32" loading={false} />
        <StatCard title="Total pending (all years)" value={formatCurrency(totalPending)} icon={<AccountBalanceWalletIcon sx={{ color: '#ed6c02', fontSize: 24 }} />} color="#ed6c02" loading={false} />
        <StatCard title="Students (all years)" value={totalStudents} icon={<PeopleAltIcon sx={{ color: '#1976d2', fontSize: 24 }} />} color="#1976d2" loading={false} />
      </Box>

      {/* Comparison bars */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>Collected revenue by year</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          From enrollment records (fees recorded per student), highest first.
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {byCollected.map((r) => (
            <Box key={r.year ?? 'none'} sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Box sx={{ width: 120, flexShrink: 0 }}>
                <Typography variant="body2" fontWeight={600}>{yearName(r.year)}</Typography>
                <Typography variant="caption" color="text.secondary">{r.studentCount} students</Typography>
              </Box>
              <Box sx={{ flex: 1, height: 24, bgcolor: 'grey.100', borderRadius: 0.75, overflow: 'hidden' }}>
                <Box sx={{ width: `${Math.round((r.collected / maxCollected) * 100)}%`, height: '100%', bgcolor: ACCENT, opacity: 0.9, minWidth: r.collected > 0 ? 4 : 0 }} />
              </Box>
              <Box sx={{ width: 150, flexShrink: 0, textAlign: 'right' }}>
                <Typography variant="body2" fontWeight={700} sx={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(r.collected)}</Typography>
                {r.pending > 0 && <Typography variant="caption" color="error.main">{formatCurrency(r.pending)} due</Typography>}
              </Box>
            </Box>
          ))}
        </Box>
      </Paper>

      {/* Per-year cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        {revenue.map((r) => {
          const pct = r.totalFee > 0 ? Math.min(100, Math.round((r.collected / r.totalFee) * 100)) : 0;
          return (
            <Paper
              key={r.year ?? 'none'}
              elevation={0}
              onClick={() => r.year && onPickYear(r.year)}
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: 'grey.200',
                borderRadius: 1,
                cursor: r.year ? 'pointer' : 'default',
                transition: 'border-color 150ms',
                '&:hover': r.year ? { borderColor: ACCENT } : {},
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={700}>{yearName(r.year)}</Typography>
                <Chip label={`${r.studentCount} students`} size="small" sx={{ height: 22, fontSize: 11 }} />
              </Box>
              <Typography variant="h6" fontWeight={800} sx={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                {formatCurrency(r.collected)}
              </Typography>
              <Typography variant="caption" color="text.secondary">collected of {formatCurrency(r.totalFee)}</Typography>
              <Box sx={{ height: 8, bgcolor: 'grey.100', borderRadius: 4, overflow: 'hidden', my: 1 }}>
                <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: ACCENT }} />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">{r.fullyPaidCount} fully paid · {r.partialCount} partial</Typography>
                <Typography variant="caption" color={r.pending > 0 ? 'error.main' : 'text.secondary'} fontWeight={600}>
                  {r.pending > 0 ? `${formatCurrency(r.pending)} due` : 'Cleared'}
                </Typography>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}

export default function StudentsPage() {
  const { supabaseUserId } = useAdminProfile();

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalStudents: 0,
    fullyPaid: 0,
    partialPayment: 0,
    totalRevenue: 0,
    totalPending: 0,
    pastBatchActive: 0,
    pastBatchNoAccess: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'info'; text: string } | null>(null);

  // Exam-batch organisation is GLOBAL: the one switch in the profile menu drives
  // every list. We alias the global selectedBatch/setSelectedBatch to the local
  // year/setYear names the rest of this page already uses.
  const { current: currentBatch, selectedBatch: year, setSelectedBatch: setYear } = useBatches();
  const [view, setView] = useState<'list' | 'revenue'>('list');
  const [revenue, setRevenue] = useState<YearRevenue[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Bulk actions: the grid owns row selection and hands the selected rows to these
  // handlers. bulkRows holds the set the year / graduate dialogs act on; bumping
  // selectionResetKey clears the grid selection after an action reloads the data.
  const [bulkRows, setBulkRows] = useState<StudentRow[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [setYearOpen, setSetYearOpen] = useState(false);
  const [graduateOpen, setGraduateOpen] = useState(false);
  const [markStaff, setMarkStaff] = useState<StudentRow[] | null>(null);

  // Row-click detail drawer
  const [drawerStudent, setDrawerStudent] = useState<StudentRow | null>(null);

  // Client-side "show only past-batch actives" filter (toggled by the warning
  // banner). It narrows the already-loaded rows and never touches the global batch
  // switcher, so the exam-batch chip and other banners are unaffected.
  const [pastBatchFilter, setPastBatchFilter] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<StudentRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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
  const [refreshingEntra, setRefreshingEntra] = useState(false);

  // Sync current batch → the single classroom + linked Team + group chat
  const [showBatchSync, setShowBatchSync] = useState(false);
  const [batchSyncPreview, setBatchSyncPreview] = useState<any>(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [batchSyncProgress, setBatchSyncProgress] = useState<{ processed: number; succeeded: number; failed: number } | null>(null);

  const bumpReset = () => setSelectionResetKey((k) => k + 1);

  // The grid does all per-column filtering / global search / paging client-side on
  // the loaded cohort, so this fetch only takes the year scope.
  const fetchStudents = useCallback(async () => {
    setLoading(true);
    setError('');
    // A batch switch reloads a different cohort, so never carry a stale filter over.
    setPastBatchFilter(false);

    try {
      const params = new URLSearchParams();
      params.set('year', year);

      const res = await fetch(`/api/students?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch students');

      const data = await res.json();
      setStudents(data.students || []);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Lazy-load the per-year revenue rollup only when the overview is opened.
  const fetchRevenue = useCallback(async () => {
    setRevenueLoading(true);
    try {
      const res = await fetch('/api/students/revenue-by-year', { cache: 'no-store' });
      const data = await res.json();
      if (res.ok) setRevenue(data.years || []);
    } catch {
      // non-fatal: the overview just shows an empty state
    } finally {
      setRevenueLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'revenue' && revenue.length === 0) fetchRevenue();
  }, [view, revenue.length, fetchRevenue]);

  // Defaults for the bulk dialogs, derived from the rows the grid handed us.
  const selectedYearDefault = year !== 'all' && year !== 'none' && year !== 'current' ? year : (currentBatch?.code || currentAcademicYear());
  const graduateDefaultYear = (() => {
    const years = new Set(bulkRows.map((s) => s.academic_year).filter(Boolean) as string[]);
    if (years.size === 1) return [...years][0];
    return selectedYearDefault;
  })();

  // Bulk: set academic year (re-buckets the selected students to a cohort).
  const handleSetYear = useCallback(
    async (academicYear: string) => {
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const ids = bulkRows.map((s) => s.id);
      const res = await fetch('/api/crm/alumni/set-year', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids, academicYear, adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set academic year');
      setSetYearOpen(false);
      bumpReset();
      setNotice({ type: 'success', text: `Set academic year ${academicYear} on ${data.updated} student(s).` });
      fetchStudents();
      if (view === 'revenue') fetchRevenue();
    },
    [supabaseUserId, bulkRows, fetchStudents, fetchRevenue, view]
  );

  // Promote past-batch students to the CURRENT batch. Reuses the set-year route with
  // academicYear = the current code, which makes it re-enroll them into the live
  // classroom (isCurrentBatch path) and so restores their Nexus access.
  const handlePromoteToCurrent = useCallback(
    async (rows: StudentRow[]) => {
      if (!supabaseUserId) {
        setError('Admin session not ready, try again in a moment.');
        return;
      }
      const code = currentBatch?.code || currentAcademicYear();
      const ids = rows.map((s) => s.id);
      if (!ids.length) return;
      try {
        const res = await fetch('/api/crm/alumni/set-year', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ids, academicYear: code, adminId: supabaseUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to promote');
        bumpReset();
        setNotice({
          type: 'success',
          text: `Promoted ${data.updated} student(s) to ${code}. Nexus access restored for ${data.classroomEnrolled ?? 0}.`,
        });
        fetchStudents();
        if (view === 'revenue') fetchRevenue();
      } catch (err: any) {
        setError(err.message || 'Failed to promote');
      }
    },
    [supabaseUserId, currentBatch, fetchStudents, fetchRevenue, view]
  );

  // Rows handed to the grid: narrowed to past-batch actives when the banner filter is on.
  const visibleStudents = useMemo(
    () => (pastBatchFilter ? students.filter((s) => s.past_batch) : students),
    [students, pastBatchFilter]
  );

  // Bulk: move to the Software course program (leaves the architecture list).
  const moveToSoftware = useCallback(
    async (rows: StudentRow[]) => {
      const ids = rows.map((s) => s.id);
      if (!ids.length) return;
      if (!supabaseUserId) {
        setError('Admin session not ready, try again in a moment.');
        return;
      }
      try {
        const res = await fetch('/api/crm/alumni/set-program', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds: ids, program: 'software', adminId: supabaseUserId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to move students');
        const moved = new Set(ids);
        setStudents((prev) => prev.filter((s) => !moved.has(s.id)));
        bumpReset();
        setNotice({ type: 'success', text: `Moved ${data.updated} student(s) to the Software course.` });
      } catch (err: any) {
        setError(err.message || 'Failed to move students');
      }
    },
    [supabaseUserId]
  );

  // Bulk: reclassify mis-tagged students as staff (teacher/admin).
  const markAsStaff = useCallback(
    async (role: 'teacher' | 'admin') => {
      const people = markStaff || [];
      const ids = people.map((s) => s.id);
      if (!ids.length) return;
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const res = await fetch('/api/crm/alumni/set-role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids, role, adminId: supabaseUserId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update role');
      const moved = new Set(ids);
      setStudents((prev) => prev.filter((s) => !moved.has(s.id)));
      bumpReset();
      const noun = data.updated === 1 ? 'person' : 'people';
      setNotice({ type: 'success', text: `Marked ${data.updated} ${noun} as ${role === 'admin' ? 'admin' : 'staff'}.` });
    },
    [markStaff, supabaseUserId]
  );

  // Bulk: graduate the selected cohort. They become alumni (Nexus access revoked)
  // and re-bucket under their academic year, leaving the active list.
  const handleGraduate = useCallback(
    async (opts: { academicYear: string; reason: string; offboardMicrosoft: boolean }) => {
      if (!supabaseUserId) throw new Error('Admin session not ready, try again in a moment.');
      const graduatedIds = bulkRows.map((s) => s.id);
      const res = await fetch('/api/crm/alumni/graduate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: graduatedIds, adminId: supabaseUserId, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to graduate students');
      const graduated = new Set(graduatedIds);
      setStudents((prev) => prev.filter((s) => !graduated.has(s.id)));
      bumpReset();
      if (view === 'revenue') fetchRevenue();
      return data;
    },
    [supabaseUserId, bulkRows, view, fetchRevenue]
  );

  const closeGraduate = useCallback(() => {
    setGraduateOpen(false);
    fetchStudents();
  }, [fetchStudents]);

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

  // Pull the CURRENT Microsoft UPN for every linked student and write it back to
  // the DB (matched by ms_oid), so a recent Entra rename (…onmicrosoft.com ->
  // @neramclasses.com) is reflected here and in Nexus.
  const handleRefreshEntra = async () => {
    setRefreshingEntra(true);
    setNotice(null);
    setError('');
    try {
      const res = await fetch('/api/students/refresh-entra', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const { checked = 0, updated = 0 } = data.summary || {};
      setNotice({
        type: updated > 0 ? 'success' : 'info',
        text:
          updated > 0
            ? `Refreshed ${updated} of ${checked} student email(s) from Entra.`
            : `Checked ${checked} student(s). All emails already up to date.`,
      });
      await fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Failed to refresh from Entra');
    } finally {
      setRefreshingEntra(false);
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
        // When the picker found an existing student (their Google row), link this
        // Entra account onto it explicitly instead of creating a duplicate.
        linkUserId: s.suggestedMatch?.id,
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

  const handleOpenBatchSync = async () => {
    setShowBatchSync(true);
    setBatchSyncPreview(null);
    setBatchSyncProgress(null);
    try {
      const res = await fetch('/api/students/sync-current-batch');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBatchSyncPreview(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load current batch');
    }
  };

  const handleRunBatchSync = async () => {
    setBatchSyncing(true);
    let processed = 0, succeeded = 0, failed = 0;
    try {
      // Chunked loop: keep calling until the server reports 0 remaining. The
      // iteration cap is a safety backstop against an unexpected non-converging loop.
      for (let i = 0; i < 200; i++) {
        const res = await fetch('/api/students/sync-current-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: 40 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const s = data.summary || {};
        processed += s.processed || 0;
        succeeded += s.succeeded || 0;
        failed += s.failed || 0;
        setBatchSyncProgress({ processed, succeeded, failed });
        if ((s.remaining ?? 0) <= 0 || (s.processed ?? 0) === 0) break;
      }
      const pre = await fetch('/api/students/sync-current-batch').then((r) => r.json()).catch(() => null);
      if (pre) setBatchSyncPreview(pre);
      fetchStudents();
      setNotice({ type: 'success', text: `Current batch synced: ${succeeded} enrolled, ${failed} failed.` });
    } catch (err: any) {
      setError(err.message || 'Sync failed');
    } finally {
      setBatchSyncing(false);
    }
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
              {loading
                ? 'Loading...'
                : `${stats.totalStudents} students · ${
                    year === 'current'
                      ? `Current cohort (${currentAcademicYear()})`
                      : year === 'all'
                      ? 'All years'
                      : year === 'none'
                      ? 'No year set'
                      : `Batch ${year}`
                  }${year === 'current' && (stats.pastBatchActive ?? 0) > 0 ? ` (incl. ${stats.pastBatchActive} past-batch)` : ''}`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            variant={view === 'revenue' ? 'contained' : 'outlined'}
            startIcon={view === 'revenue' ? <ArrowBackIcon /> : <InsightsIcon />}
            onClick={() => setView(view === 'revenue' ? 'list' : 'revenue')}
            sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
          >
            {view === 'revenue' ? 'Back to students' : 'Revenue overview'}
          </Button>
          {view === 'list' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<SyncIcon />}
              onClick={() => { setShowEntraSync(true); handleFetchEntra(); }}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Sync from Entra
            </Button>
          )}
          {view === 'list' && (
            <Tooltip title="Pull the latest Microsoft email for each student (fixes accounts renamed to @neramclasses.com)">
              <span>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={refreshingEntra ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
                  onClick={handleRefreshEntra}
                  disabled={refreshingEntra}
                  sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
                >
                  Refresh from Entra
                </Button>
              </span>
            </Tooltip>
          )}
          {view === 'list' && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<PeopleAltIcon sx={{ fontSize: 18 }} />}
              onClick={handleOpenBatchSync}
              sx={{ textTransform: 'none', fontWeight: 600, fontSize: 12 }}
            >
              Sync current batch
            </Button>
          )}
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={() => { fetchStudents(); if (view === 'revenue') fetchRevenue(); }} disabled={loading}>
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
      {notice && (
        <Alert severity={notice.type} sx={{ mb: 2, borderRadius: 1 }} onClose={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      {/* Revenue overview view */}
      {view === 'revenue' && (
        <RevenueOverview
          revenue={revenue}
          loading={revenueLoading}
          onPickYear={(y) => { setYear(y); setView('list'); }}
        />
      )}

      {/* List view: current cohort / selected year roster + operations */}
      {view === 'list' && (
        <>
      {/* Stats Cards (scoped to the selected year) */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <StatCard
          title="Students"
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
          title="Collected"
          value={formatCurrency(stats.totalRevenue)}
          icon={<CurrencyRupeeIcon sx={{ color: '#2e7d32', fontSize: 24 }} />}
          color="#2e7d32"
          loading={loading}
        />
        <StatCard
          title="Pending Fees"
          value={formatCurrency(stats.totalPending)}
          icon={<AccountBalanceWalletIcon sx={{ color: '#ed6c02', fontSize: 24 }} />}
          color="#ed6c02"
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

      {/* Past-batch actives banner: non-graduated students still tagged to an older
          exam batch. They are included in the current view (red "Past" chip) so they
          can be promoted to the current batch (restores Nexus access) or graduated. */}
      {year === 'current' && (stats.pastBatchActive ?? 0) > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2, borderRadius: 1 }}
          action={
            pastBatchFilter ? (
              <Button color="warning" size="small" variant="text" onClick={() => setPastBatchFilter(false)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Show all
              </Button>
            ) : (
              <Button color="warning" size="small" variant="contained" onClick={() => setPastBatchFilter(true)} sx={{ textTransform: 'none', fontWeight: 600 }}>
                Show them
              </Button>
            )
          }
        >
          <strong>{stats.pastBatchActive} active students</strong> are still on a past batch.
          Promote them to the current batch ({currentBatch?.code || currentAcademicYear()}) or graduate them.
          {(stats.pastBatchNoAccess ?? 0) > 0 && ` ${stats.pastBatchNoAccess} have lost Nexus access.`}
        </Alert>
      )}

      {/* Active exam-batch scope. The switch is GLOBAL (profile menu, bottom-left);
          this chip just shows what you're viewing. Columns filter client-side. */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <Chip
          label={`Exam Batch: ${year === 'current' ? (currentBatch?.code || 'current') : year === 'all' ? 'All batches' : year === 'none' ? 'No batch set' : year}`}
          color="primary"
          variant="outlined"
          size="small"
        />
        {pastBatchFilter && (
          <Chip
            label="Showing past-batch students"
            color="warning"
            variant="filled"
            size="small"
            onDelete={() => setPastBatchFilter(false)}
          />
        )}
        <Typography variant="caption" color="text.secondary">
          Switch batch from the profile menu (bottom-left). Filter any column from the box under its header; click a student for full details.
        </Typography>
      </Box>

      {/* Student grid: per-column filters, selection-bar bulk actions, row-click drawer */}
      <StudentHubTable
        students={visibleStudents}
        loading={loading}
        selectionResetKey={selectionResetKey}
        currentBatchCode={currentBatch?.code || currentAcademicYear()}
        onRowClick={(row) => setDrawerStudent(row)}
        onDelete={(row) => setDeleteTarget(row)}
        onSetYear={(rows) => { setBulkRows(rows); setSetYearOpen(true); }}
        onMoveSoftware={(rows) => moveToSoftware(rows)}
        onMarkStaff={(rows) => setMarkStaff(rows)}
        onGraduate={(rows) => { setBulkRows(rows); setGraduateOpen(true); }}
        onPromote={(rows) => handlePromoteToCurrent(rows)}
      />
        </>
      )}

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

      {/* Sync Current Batch Dialog */}
      <Dialog open={showBatchSync} onClose={() => !batchSyncing && setShowBatchSync(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
          <SyncIcon color="primary" /> Sync current batch to classroom
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enrolls every active student in the current batch into the single Nexus
            classroom and adds them to the linked Microsoft Team and group chat. Runs
            in chunks, so it is safe to run repeatedly.
          </Typography>
          {batchSyncPreview ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1 }}>
              <Typography variant="body2">
                <strong>Classroom:</strong> {batchSyncPreview.classroom?.name || 'not set'}
                {batchSyncPreview.classroom?.batchCode ? ` (${batchSyncPreview.classroom.batchCode})` : ''}
              </Typography>
              <Typography variant="body2"><strong>Current batch students:</strong> {batchSyncPreview.rosterTotal ?? 0}</Typography>
              <Typography variant="body2"><strong>Already enrolled:</strong> {batchSyncPreview.alreadyEnrolled ?? 0}</Typography>
              <Typography variant="body2"><strong>Remaining to enroll:</strong> {batchSyncPreview.remaining ?? 0}</Typography>
            </Box>
          ) : (
            <CircularProgress size={20} />
          )}
          {batchSyncProgress && (
            <Alert severity={batchSyncProgress.failed > 0 ? 'warning' : 'success'} sx={{ mt: 1 }}>
              Processed {batchSyncProgress.processed} · Enrolled {batchSyncProgress.succeeded} · Failed {batchSyncProgress.failed}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setShowBatchSync(false)} disabled={batchSyncing} sx={{ textTransform: 'none' }}>
            Close
          </Button>
          <Button
            variant="contained"
            onClick={handleRunBatchSync}
            disabled={batchSyncing || !batchSyncPreview || (batchSyncPreview?.remaining ?? 0) === 0}
            startIcon={batchSyncing ? <CircularProgress size={16} color="inherit" /> : <SyncIcon />}
            sx={{ textTransform: 'none' }}
          >
            {batchSyncing ? 'Syncing...' : 'Sync now'}
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
                          {s.suggestedMatch && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'success.main', fontWeight: 600 }}>
                              Links to existing student: {s.suggestedMatch.name || s.suggestedMatch.email} (matched by {s.suggestedMatch.matchedBy})
                            </Typography>
                          )}
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

      {/* Set academic year (bulk) */}
      <SetAcademicYearDialog
        open={setYearOpen}
        count={bulkRows.length}
        defaultYear={selectedYearDefault}
        onClose={() => setSetYearOpen(false)}
        onConfirm={handleSetYear}
      />

      {/* Graduate (bulk) -> they re-bucket under their academic year */}
      <GraduateDialog
        open={graduateOpen}
        students={bulkRows.map((s) => ({
          id: s.id,
          name: s.name || [s.first_name, s.last_name].filter(Boolean).join(' ') || null,
          email: s.classroom_email || s.personal_email || s.email,
          avatar_url: s.avatar_url,
          academic_year: s.academic_year,
        }))}
        defaultYear={graduateDefaultYear}
        onClose={closeGraduate}
        onConfirm={handleGraduate}
      />

      {/* Mark as staff (reclassify a mis-tagged student) */}
      <MarkStaffDialog
        open={!!markStaff}
        people={(markStaff || []).map((s) => ({
          id: s.id,
          name: s.name || [s.first_name, s.last_name].filter(Boolean).join(' ') || null,
          email: s.classroom_email || s.personal_email || s.email,
          avatar_url: s.avatar_url,
        }))}
        onClose={() => setMarkStaff(null)}
        onConfirm={markAsStaff}
      />

      {/* Row-click detail drawer: full application detail + editable personal fields */}
      <StudentDetailDrawer
        open={!!drawerStudent}
        student={
          drawerStudent
            ? {
                id: drawerStudent.id,
                name: drawerStudent.name || [drawerStudent.first_name, drawerStudent.last_name].filter(Boolean).join(' ') || null,
                email: drawerStudent.classroom_email || drawerStudent.personal_email || drawerStudent.email || null,
                avatar_url: drawerStudent.avatar_url,
                academic_year: drawerStudent.academic_year,
                last_login_at: drawerStudent.last_login_at,
                nexus_first_login_at: drawerStudent.nexus_first_login_at,
                nexus_last_login_at: drawerStudent.nexus_last_login_at,
                submission_count: 0,
                ms_teams_email: drawerStudent.ms_teams_email,
                has_nexus_access: drawerStudent.has_nexus_access,
              }
            : null
        }
        adminId={supabaseUserId}
        onChanged={fetchStudents}
        onClose={() => setDrawerStudent(null)}
        onGraduate={() => {
          if (drawerStudent) {
            setBulkRows([drawerStudent]);
            setGraduateOpen(true);
          }
          setDrawerStudent(null);
        }}
        moveAction={{
          label: 'Move to Software course',
          icon: <LaptopMacIcon fontSize="small" />,
          onClick: () => {
            if (drawerStudent) moveToSoftware([drawerStudent]);
            setDrawerStudent(null);
          },
        }}
        staffAction={{
          label: 'Mark as staff',
          icon: <BadgeOutlinedIcon fontSize="small" />,
          onClick: () => {
            if (drawerStudent) setMarkStaff([drawerStudent]);
            setDrawerStudent(null);
          },
        }}
        setYearAction={{
          label: 'Change batch',
          icon: <EventOutlinedIcon fontSize="small" />,
          onClick: () => {
            if (drawerStudent) {
              setBulkRows([drawerStudent]);
              setSetYearOpen(true);
            }
            setDrawerStudent(null);
          },
        }}
        promoteAction={
          drawerStudent?.past_batch
            ? {
                label: `Promote to current (${currentBatch?.code || currentAcademicYear()})`,
                icon: <EventOutlinedIcon fontSize="small" />,
                onClick: () => {
                  if (drawerStudent) handlePromoteToCurrent([drawerStudent]);
                  setDrawerStudent(null);
                },
              }
            : undefined
        }
      />
    </Box>
  );
}
