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
  Button,
  IconButton,
  Tooltip,
  Alert,
  MenuItem,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
  Snackbar,
} from '@neram/ui';
import LinkIcon from '@mui/icons-material/Link';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CancelIcon from '@mui/icons-material/Cancel';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TimerIcon from '@mui/icons-material/Timer';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DoNotDisturbIcon from '@mui/icons-material/DoNotDisturb';
import type { DirectEnrollmentLink, DirectEnrollmentLinkStatus } from '@neram/database';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import GenerateLinkDialog from '@/components/direct-enrollment/GenerateLinkDialog';
import ShareLinkPanel from '@/components/direct-enrollment/ShareLinkPanel';

const ENROLLMENT_URL_BASE = 'https://neramclasses.com/en/enroll?token=';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'used', label: 'Used' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
];

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA + JEE Paper 2',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  upi_direct: 'UPI Direct',
  cash: 'Cash',
};

function getStatusColor(status: DirectEnrollmentLinkStatus): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'active':
      return 'success';
    case 'used':
      return 'info';
    case 'expired':
      return 'warning';
    case 'cancelled':
      return 'error';
    default:
      return 'default';
  }
}

function formatCurrency(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface LinkStats {
  total: number;
  active: number;
  used: number;
  expired: number;
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
        minWidth: 180,
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
          <Skeleton width={60} height={32} />
        ) : (
          <Typography variant="h5" fontWeight={700}>
            {value}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

export default function DirectEnrollmentPage() {
  const { supabaseUserId } = useAdminProfile();

  const [links, setLinks] = useState<DirectEnrollmentLink[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<LinkStats>({ total: 0, active: 0, used: 0, expired: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);

  // Pagination
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  // Dialogs
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [selectedLink, setSelectedLink] = useState<(DirectEnrollmentLink & { course_name?: string; batch_name?: string }) | null>(null);

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('page', String(page + 1));
      params.set('limit', String(rowsPerPage));
      if (statusFilter) params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);

      const res = await fetch(`/api/direct-enrollment?${params.toString()}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch links (HTTP ${res.status})`);
      }

      const data = await res.json();
      setLinks(data.data || []);
      setTotalCount(data.pagination?.total || 0);

      // Compute stats from all links (fetch without filters for stats)
      if (!statusFilter && !debouncedSearch && page === 0) {
        const allLinks = data.data || [];
        const total = data.pagination?.total || 0;
        const active = allLinks.filter((l: DirectEnrollmentLink) => l.status === 'active').length;
        const used = allLinks.filter((l: DirectEnrollmentLink) => l.status === 'used').length;
        const expired = allLinks.filter((l: DirectEnrollmentLink) => l.status === 'expired').length;
        setStats({ total, active, used, expired });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch links');
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, statusFilter, debouncedSearch]);

  // Also fetch stats separately to always have up-to-date counts
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/direct-enrollment?page=1&limit=1000');
      if (!res.ok) return;
      const data = await res.json();
      const allLinks: DirectEnrollmentLink[] = data.data || [];
      const total = data.pagination?.total || allLinks.length;
      const active = allLinks.filter((l) => l.status === 'active').length;
      const used = allLinks.filter((l) => l.status === 'used').length;
      const expired = allLinks.filter((l) => l.status === 'expired').length;
      setStats({ total, active, used, expired });
    } catch {
      // Silent fail for stats
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(0);
    }, 400);
    setSearchDebounce(timeout);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(0);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleRowClick = async (link: DirectEnrollmentLink) => {
    try {
      const res = await fetch(`/api/direct-enrollment/${link.id}`);
      if (!res.ok) throw new Error('Failed to fetch link details');
      const data = await res.json();
      setSelectedLink(data.data);
      setSharePanelOpen(true);
    } catch {
      // Fall back to basic link data
      setSelectedLink(link);
      setSharePanelOpen(true);
    }
  };

  const handleCopyLink = (e: React.MouseEvent, token: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${ENROLLMENT_URL_BASE}${token}`);
    setSnackbar({ open: true, message: 'Link copied to clipboard!' });
  };

  const handleCancelLink = async (e: React.MouseEvent, linkId: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to cancel this enrollment link?')) return;

    try {
      const res = await fetch(`/api/direct-enrollment/${linkId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error('Failed to cancel link');
      setSnackbar({ open: true, message: 'Link cancelled successfully' });
      fetchLinks();
      fetchStats();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to cancel link' });
    }
  };

  const handleGenerateSuccess = (link: any) => {
    setGenerateDialogOpen(false);
    setSelectedLink(link);
    setSharePanelOpen(true);
    fetchLinks();
    fetchStats();
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
            <LinkIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              Direct Enrollment Links
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {loading ? 'Loading...' : `${totalCount} link${totalCount !== 1 ? 's' : ''} total`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={() => { fetchLinks(); fetchStats(); }} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setGenerateDialogOpen(true)}
            sx={{ borderRadius: 1, fontWeight: 600, textTransform: 'none' }}
          >
            Generate New Link
          </Button>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <StatCard
          title="Total Links"
          value={stats.total}
          icon={<LinkIcon sx={{ color: '#1565C0', fontSize: 24 }} />}
          color="#1565C0"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="Active"
          value={stats.active}
          icon={<TimerIcon sx={{ color: '#2E7D32', fontSize: 24 }} />}
          color="#2E7D32"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="Used"
          value={stats.used}
          icon={<CheckCircleIcon sx={{ color: '#0288D1', fontSize: 24 }} />}
          color="#0288D1"
          loading={loading && stats.total === 0}
        />
        <StatCard
          title="Expired"
          value={stats.expired}
          icon={<WarningAmberIcon sx={{ color: '#ED6C02', fontSize: 24 }} />}
          color="#ED6C02"
          loading={loading && stats.total === 0}
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
          placeholder="Search by student name, phone, email..."
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          sx={{ minWidth: 300, flex: 1 }}
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
        {loading && links.length === 0 ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
            <CircularProgress />
          </Box>
        ) : links.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 300, gap: 2 }}>
            <LinkIcon sx={{ fontSize: 48, color: 'grey.400' }} />
            <Typography color="text.secondary">No enrollment links found</Typography>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => setGenerateDialogOpen(true)}
              sx={{ borderRadius: 1, textTransform: 'none' }}
            >
              Generate Your First Link
            </Button>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Student Name</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Phone</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Course</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }} align="right">Amount Paid</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Created</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Expires</TableCell>
                    <TableCell sx={{ fontWeight: 600, whiteSpace: 'nowrap' }} align="center">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {links.map((link) => (
                    <TableRow
                      key={link.id}
                      hover
                      onClick={() => handleRowClick(link)}
                      sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 200 }}>
                          {link.student_name}
                        </Typography>
                        {link.student_email && (
                          <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', maxWidth: 200 }}>
                            {link.student_email}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap>
                          {link.student_phone || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={COURSE_LABELS[link.interest_course] || link.interest_course || '-'}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 500, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={600} color="success.main">
                          {formatCurrency(link.amount_paid)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={link.status.charAt(0).toUpperCase() + link.status.slice(1)}
                          size="small"
                          color={getStatusColor(link.status)}
                          sx={{ fontWeight: 500 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDate(link.created_at)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                          {formatDate(link.expires_at)}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                          <Tooltip title="View Details">
                            <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleRowClick(link); }}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {link.status === 'active' && (
                            <>
                              <Tooltip title="Copy Link">
                                <IconButton size="small" onClick={(e) => handleCopyLink(e, link.token)}>
                                  <ContentCopyIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel Link">
                                <IconButton size="small" color="error" onClick={(e) => handleCancelLink(e, link.id)}>
                                  <CancelIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 20, 50]}
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

      {/* Generate Link Dialog */}
      <GenerateLinkDialog
        open={generateDialogOpen}
        onClose={() => setGenerateDialogOpen(false)}
        onSuccess={handleGenerateSuccess}
        adminId={supabaseUserId || ''}
      />

      {/* Share Link Panel */}
      {selectedLink && (
        <ShareLinkPanel
          open={sharePanelOpen}
          onClose={() => { setSharePanelOpen(false); setSelectedLink(null); }}
          link={selectedLink}
        />
      )}

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
