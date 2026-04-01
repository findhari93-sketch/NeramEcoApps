'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  Button,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import PersonSearchIcon from '@mui/icons-material/PersonSearch';
import RefreshIcon from '@mui/icons-material/Refresh';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import type {
  UserJourney,
  PipelineStageCounts,
  PipelineStage,
} from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';
import type { MRT_PaginationState, MRT_SortingState } from 'material-react-table';
import PipelineFunnel from '../../../components/crm/PipelineFunnel';
import UsersTable from '../../../components/crm/UsersTable';
import BulkDeleteDialog from '../../../components/crm/BulkDeleteDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';

// Lead-only stages (no enrolled / payment_complete)
const LEAD_STAGES: PipelineStage[] = [
  'new_lead',
  'demo_requested',
  'demo_attended',
  'phone_verified',
  'application_submitted',
  'admin_approved',
];

export default function LeadsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabaseUserId } = useAdminProfile();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [users, setUsers] = useState<UserJourney[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pipelineCounts, setPipelineCounts] = useState<PipelineStageCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [studentMatchIds, setStudentMatchIds] = useState<Set<string>>(new Set());
  const [dismissing, setDismissing] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const [activeStage, setActiveStage] = useState<PipelineStage | null>(
    (searchParams.get('stage') as PipelineStage) || null
  );
  const [showDeadLeads, setShowDeadLeads] = useState(
    searchParams.get('dead_leads') === 'true'
  );
  const [showIrrelevant, setShowIrrelevant] = useState(
    searchParams.get('irrelevant') === 'true'
  );

  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [usersToDelete, setUsersToDelete] = useState<UserJourney[]>([]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams();
      params.set('limit', String(pagination.pageSize));
      params.set('offset', String(pagination.pageIndex * pagination.pageSize));

      if (activeStage) params.set('pipeline_stage', activeStage);
      if (showDeadLeads) params.set('is_dead_lead', 'true');
      if (showIrrelevant) params.set('is_irrelevant', 'true');
      if (globalFilter) params.set('search', globalFilter);

      if (sorting.length > 0) {
        params.set('order_by', sorting[0].id);
        params.set('order_dir', sorting[0].desc ? 'desc' : 'asc');
      }

      const res = await fetch(`/api/crm/leads?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch leads');

      const data = await res.json();
      setUsers(data.users);
      setTotalCount(data.total);
      setPipelineCounts(data.pipelineCounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, activeStage, globalFilter, showDeadLeads, showIrrelevant]);

  const fetchStudentMatches = useCallback(async () => {
    try {
      const res = await fetch('/api/crm/leads/student-matches');
      if (res.ok) {
        const data = await res.json();
        setStudentMatchIds(new Set(data.matchingUserIds || []));
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  useEffect(() => {
    fetchStudentMatches();
  }, [fetchStudentMatches]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    if (isFullscreen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleStageClick = (stage: PipelineStage | null) => {
    setActiveStage(stage);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams(window.location.search);
    if (stage) {
      params.set('stage', stage);
    } else {
      params.delete('stage');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleToggleDeadLeads = () => {
    const next = !showDeadLeads;
    setShowDeadLeads(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams(window.location.search);
    if (next) params.set('dead_leads', 'true');
    else params.delete('dead_leads');
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleToggleIrrelevant = () => {
    const next = !showIrrelevant;
    setShowIrrelevant(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams(window.location.search);
    if (next) params.set('irrelevant', 'true');
    else params.delete('irrelevant');
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`);
  };

  const handleRowClick = (userId: string) => {
    router.push(`/crm/${userId}`);
  };

  const [searchDebounce, setSearchDebounce] = useState<NodeJS.Timeout | null>(null);
  const handleGlobalFilterChange = (value: string) => {
    setGlobalFilter(value);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timeout = setTimeout(() => {
      setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    }, 300);
    setSearchDebounce(timeout);
  };

  const handleBulkDeleteRequest = (selectedUsers: UserJourney[]) => {
    setUsersToDelete(selectedUsers);
    setDeleteDialogOpen(true);
  };

  const handleBulkDelete = async (userIds: string[]) => {
    if (!supabaseUserId) {
      throw new Error('Admin user ID not found. Please refresh and try again.');
    }

    const res = await fetch('/api/crm/users/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, adminId: supabaseUserId }),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Failed to delete users');
    }

    setDeleteDialogOpen(false);
    setUsersToDelete([]);
    await fetchLeads();
  };

  const handleDismissStudentMatches = async () => {
    if (!supabaseUserId || studentMatchIds.size === 0) return;
    setDismissing(true);
    try {
      const res = await fetch('/api/crm/leads/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(studentMatchIds),
          adminId: supabaseUserId,
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to dismiss leads');
      }
      const data = await res.json();
      setSnackbar({
        open: true,
        message: `${data.dismissed} lead(s) dismissed as irrelevant.`,
        severity: 'success',
      });
      setStudentMatchIds(new Set());
      await fetchLeads();
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message, severity: 'error' });
    } finally {
      setDismissing(false);
    }
  };

  const activeStageConfig = activeStage ? PIPELINE_STAGE_CONFIG[activeStage] : null;

  return (
    <Box>
      {/* Page header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'flex-start', md: 'center' },
          justifyContent: 'space-between',
          gap: { xs: 1, md: 0 },
          mb: { xs: 1.5, md: 2 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {!isMobile && (
            <Box
              sx={{
                width: 42,
                height: 42,
                borderRadius: 1,
                bgcolor: '#E65100',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PersonSearchIcon sx={{ color: 'white', fontSize: 22 }} />
            </Box>
          )}
          <Box>
            <Typography
              variant={isMobile ? 'h6' : 'h5'}
              fontWeight={700}
              sx={{ lineHeight: 1.2 }}
            >
              Leads
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: 12, md: 14 } }}>
              {pipelineCounts
                ? `${pipelineCounts.total} quality leads to convert (students excluded)`
                : 'Loading...'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Chip
            label="Dead Leads"
            onClick={handleToggleDeadLeads}
            onDelete={showDeadLeads ? handleToggleDeadLeads : undefined}
            variant={showDeadLeads ? 'filled' : 'outlined'}
            size="small"
            sx={{
              fontWeight: 500,
              height: { xs: 32, md: 'auto' },
              bgcolor: showDeadLeads ? 'grey.700' : undefined,
              color: showDeadLeads ? 'common.white' : 'text.secondary',
              borderColor: showDeadLeads ? 'grey.700' : 'grey.300',
              '&:hover': { bgcolor: showDeadLeads ? 'grey.800' : 'grey.100' },
            }}
          />
          <Chip
            label="Irrelevant"
            onClick={handleToggleIrrelevant}
            onDelete={showIrrelevant ? handleToggleIrrelevant : undefined}
            variant={showIrrelevant ? 'filled' : 'outlined'}
            size="small"
            sx={{
              fontWeight: 500,
              height: { xs: 32, md: 'auto' },
              bgcolor: showIrrelevant ? '#E65100' : undefined,
              color: showIrrelevant ? 'common.white' : 'text.secondary',
              borderColor: showIrrelevant ? '#E65100' : 'grey.300',
              '&:hover': { bgcolor: showIrrelevant ? '#BF360C' : 'grey.100' },
            }}
          />
          {activeStage && (
            <Chip
              label={`Filtered: ${activeStageConfig?.label}`}
              onDelete={() => handleStageClick(null)}
              color="primary"
              variant="outlined"
              size="small"
              sx={{ fontWeight: 500, height: { xs: 32, md: 'auto' } }}
            />
          )}
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={() => { fetchLeads(); fetchStudentMatches(); }} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {!isMobile && (
            <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen table'}>
              <IconButton size="small" onClick={() => setIsFullscreen((prev) => !prev)}>
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Student match warning banner */}
      {studentMatchIds.size > 0 && (
        <Alert
          severity="warning"
          sx={{ mb: 2, borderRadius: 1 }}
          action={
            <Button
              color="warning"
              size="small"
              variant="outlined"
              startIcon={<LinkOffIcon />}
              onClick={handleDismissStudentMatches}
              disabled={dismissing}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {dismissing ? 'Dismissing...' : `Dismiss ${studentMatchIds.size} match(es)`}
            </Button>
          }
        >
          <strong>{studentMatchIds.size} lead(s)</strong> have email addresses matching existing students.
          Dismiss them to keep your leads list clean.
        </Alert>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: { xs: 1.5, md: 2 }, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Pipeline funnel — only lead stages */}
      {!isFullscreen && (
        <Box sx={{ mb: { xs: 1.5, md: 2 } }}>
          <LeadPipelineFunnel
            counts={pipelineCounts}
            activeStage={activeStage}
            onStageClick={handleStageClick}
            loading={loading && !pipelineCounts}
          />
        </Box>
      )}

      {/* Table */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          overflow: 'hidden',
          ...(isFullscreen && {
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            zIndex: 1300,
            borderRadius: 0,
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
          }),
        }}
      >
        {isFullscreen && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              px: 2,
              py: 1,
              borderBottom: '1px solid',
              borderColor: 'grey.200',
              bgcolor: 'grey.50',
            }}
          >
            <Typography variant="body2" fontWeight={600}>
              Leads — Fullscreen
            </Typography>
            <IconButton size="small" onClick={() => setIsFullscreen(false)}>
              <FullscreenExitIcon fontSize="small" />
            </IconButton>
          </Box>
        )}
        <UsersTable
          data={users}
          totalCount={totalCount}
          loading={loading}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          globalFilter={globalFilter}
          onGlobalFilterChange={handleGlobalFilterChange}
          onRowClick={handleRowClick}
          onBulkDeleteRequest={handleBulkDeleteRequest}
          isFullscreen={isFullscreen}
        />
      </Paper>

      <BulkDeleteDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setUsersToDelete([]);
        }}
        users={usersToDelete}
        onConfirm={handleBulkDelete}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Lead-only Pipeline Funnel ────────────────────────────────────────
// Same as PipelineFunnel but only shows lead stages (no enrolled/payment_complete)

import FiberNewIcon from '@mui/icons-material/FiberNew';
import VideocamIcon from '@mui/icons-material/Videocam';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import PhoneAndroidIcon from '@mui/icons-material/PhoneAndroid';
import DescriptionIcon from '@mui/icons-material/Description';
import VerifiedIcon from '@mui/icons-material/Verified';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import { Skeleton } from '@neram/ui';

const LEAD_STAGE_ICONS: Record<string, React.ElementType> = {
  new_lead: FiberNewIcon,
  demo_requested: VideocamIcon,
  demo_attended: HowToRegIcon,
  phone_verified: PhoneAndroidIcon,
  application_submitted: DescriptionIcon,
  admin_approved: VerifiedIcon,
};

function LeadPipelineFunnel({
  counts,
  activeStage,
  onStageClick,
  loading,
}: {
  counts: PipelineStageCounts | null;
  activeStage: PipelineStage | null;
  onStageClick: (stage: PipelineStage | null) => void;
  loading?: boolean;
}) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  if (loading || !counts) {
    return (
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : `repeat(${LEAD_STAGES.length}, 1fr)`,
          gap: isMobile ? 1 : 1.5,
        }}
      >
        {LEAD_STAGES.map((stage) => (
          <Skeleton key={stage} variant="rounded" sx={{ height: isMobile ? 48 : 100, borderRadius: 1.5 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, px: 0.5 }}>
        <PeopleAltIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
        <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary' }}>
          {counts.total} leads
        </Typography>
      </Box>

      <Box
        sx={
          isMobile
            ? { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.75 }
            : {
                display: 'flex',
                gap: 1.5,
                overflowX: 'auto',
                pb: 1,
                '&::-webkit-scrollbar': { height: 5 },
                '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 1 },
              }
        }
      >
        {LEAD_STAGES.map((stage) => {
          const config = PIPELINE_STAGE_CONFIG[stage];
          const count = counts[stage] || 0;
          const isActive = activeStage === stage;
          const Icon = LEAD_STAGE_ICONS[stage];
          const percentage = counts.total > 0 ? Math.round((count / counts.total) * 100) : 0;

          return (
            <Paper
              key={stage}
              elevation={0}
              onClick={() => onStageClick(isActive ? null : stage)}
              sx={{
                position: 'relative',
                minWidth: isMobile ? 0 : 130,
                flexShrink: 0,
                cursor: 'pointer',
                borderRadius: 1,
                overflow: 'hidden',
                border: '1.5px solid',
                borderColor: isActive ? config.color : 'grey.200',
                bgcolor: isActive ? `${config.color}08` : 'background.paper',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                '&:hover': {
                  borderColor: config.color,
                  bgcolor: `${config.color}06`,
                  transform: isMobile ? 'none' : 'translateY(-2px)',
                  boxShadow: `0 4px 12px ${config.color}22`,
                },
                ...(isActive && {
                  boxShadow: `0 0 0 1px ${config.color}, 0 4px 16px ${config.color}28`,
                }),
              }}
            >
              {!isMobile && (
                <Box
                  sx={{
                    height: 3,
                    background: `linear-gradient(90deg, ${config.color}, ${config.color}88)`,
                    opacity: isActive ? 1 : 0.6,
                  }}
                />
              )}
              <Box sx={{ p: isMobile ? 0.75 : 2, pt: isMobile ? 0.75 : 1.5 }}>
                {isMobile ? (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Box
                        sx={{
                          width: 22, height: 22, borderRadius: 0.75,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: `${config.color}14`, flexShrink: 0,
                        }}
                      >
                        <Icon sx={{ fontSize: 12, color: config.color }} />
                      </Box>
                      <Typography
                        sx={{
                          fontWeight: 800, fontSize: 17, lineHeight: 1,
                          color: count > 0 ? config.color : 'text.disabled',
                          fontFamily: '"Inter", "Roboto", sans-serif',
                        }}
                      >
                        {count}
                      </Typography>
                      {count > 0 && (
                        <Typography variant="caption" sx={{ ml: 'auto', color: 'text.disabled', fontSize: 9, fontWeight: 600 }}>
                          {percentage}%
                        </Typography>
                      )}
                    </Box>
                    <Typography sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 10, letterSpacing: 0.15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {config.label}
                    </Typography>
                  </>
                ) : (
                  <>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box
                        sx={{
                          width: 34, height: 34, borderRadius: 1,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          bgcolor: `${config.color}14`,
                        }}
                      >
                        <Icon sx={{ fontSize: 18, color: config.color }} />
                      </Box>
                      {count > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10, fontWeight: 600 }}>
                          {percentage}%
                        </Typography>
                      )}
                    </Box>
                    <Typography
                      sx={{
                        fontWeight: 800, fontSize: 26, lineHeight: 1.1,
                        color: count > 0 ? config.color : 'text.disabled',
                        mb: 0.25, fontFamily: '"Inter", "Roboto", sans-serif',
                      }}
                    >
                      {count}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', whiteSpace: 'nowrap', fontWeight: 500, fontSize: 11.5, letterSpacing: 0.15, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {config.label}
                    </Typography>
                  </>
                )}
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
