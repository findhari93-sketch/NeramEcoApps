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
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import type {
  UserJourney,
  PipelineStageCounts,
  PipelineStage,
  ExamStatus,
  CandidateSegment,
} from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';
import type { MRT_PaginationState, MRT_SortingState } from 'material-react-table';
import PipelineFunnel from '../../../components/crm/PipelineFunnel';
import UsersTable from '../../../components/crm/UsersTable';
import BulkDeleteDialog from '../../../components/crm/BulkDeleteDialog';
import ArchiveDialog from '../../../components/crm/ArchiveDialog';
import VerifyStatusDialog from '../../../components/crm/VerifyStatusDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { useBatches } from '@/contexts/BatchContext';

type LifecycleView = 'active' | 'archived' | 'candidates';

export default function CRMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabaseUserId } = useAdminProfile();
  // Follow the global exam-batch switch (profile menu).
  const { selectedBatch } = useBatches();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [users, setUsers] = useState<UserJourney[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pipelineCounts, setPipelineCounts] = useState<PipelineStageCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncingPhotos, setSyncingPhotos] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [activeStage, setActiveStage] = useState<PipelineStage | null>(
    (searchParams.get('stage') as PipelineStage) || null
  );
  const [showDeadLeads, setShowDeadLeads] = useState(
    searchParams.get('dead_leads') === 'true'
  );
  const [showIrrelevant, setShowIrrelevant] = useState(
    searchParams.get('irrelevant') === 'true'
  );
  const [lifecycleView, setLifecycleView] = useState<LifecycleView>(
    (searchParams.get('lifecycle') as LifecycleView) || 'active'
  );
  const [candidateSegment, setCandidateSegment] = useState<CandidateSegment>(
    (searchParams.get('candidate') as CandidateSegment) || 'no_phone_dormant'
  );

  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [usersToDelete, setUsersToDelete] = useState<UserJourney[]>([]);

  // Archive + verify dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [usersToArchive, setUsersToArchive] = useState<UserJourney[]>([]);
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [userToVerify, setUserToVerify] = useState<UserJourney | null>(null);

  const fetchUsers = useCallback(async () => {
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

      // Lifecycle focus view
      if (lifecycleView === 'archived') {
        params.set('lifecycle_status', 'archived');
      } else if (lifecycleView === 'candidates') {
        params.set('candidate', candidateSegment);
      }

      // Global exam-batch scope. Skip in the candidates view (its 'old_cohort'
      // segment already filters by year and would conflict).
      if (lifecycleView !== 'candidates' && selectedBatch) {
        params.set('batch', selectedBatch);
      }

      if (sorting.length > 0) {
        params.set('order_by', sorting[0].id);
        params.set('order_dir', sorting[0].desc ? 'desc' : 'asc');
      }

      const res = await fetch(`/api/crm/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch users');

      const data = await res.json();
      setUsers(data.users);
      setTotalCount(data.total);
      setPipelineCounts(data.pipelineCounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, activeStage, globalFilter, showDeadLeads, showIrrelevant, lifecycleView, candidateSegment, selectedBatch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Escape key to exit fullscreen
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
    if (next) {
      params.set('dead_leads', 'true');
    } else {
      params.delete('dead_leads');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleToggleIrrelevant = () => {
    const next = !showIrrelevant;
    setShowIrrelevant(next);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams(window.location.search);
    if (next) {
      params.set('irrelevant', 'true');
    } else {
      params.delete('irrelevant');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleRowClick = (userId: string) => {
    router.push(`/crm/${userId}`);
  };

  // Pull Microsoft Graph profile photos into our DB for every user with an MS
  // account, then refresh so the new avatars show. Stored once, served from
  // avatar_url everywhere (no per-render Graph calls).
  const handleSyncMsPhotos = async () => {
    setSyncingPhotos(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/crm/sync-ms-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.configError?.message || data.error || 'Failed to sync Microsoft photos');
      }
      const failed = data.failures?.length ? `, ${data.failures.length} failed` : '';
      // permissionDenied/throttled = Microsoft blocked the app-only photo read
      // (not "no photo"); surface it so low coverage is explainable.
      const blocked = (data.permissionDenied || 0) + (data.throttled || 0);
      const blockedNote = blocked ? `, ${blocked} blocked by Microsoft` : '';
      setNotice(
        `Microsoft photos synced: ${data.synced} updated, ${data.unchanged} unchanged, ${data.noPhoto} without a photo${blockedNote}${failed}.`
      );
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncingPhotos(false);
    }
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

  const handleDisableToggle = async (user: UserJourney) => {
    if (!supabaseUserId) return;
    try {
      const res = await fetch(`/api/crm/users/${user.id}/disable`, {
        method: user.is_disabled ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: user.is_disabled ? undefined : JSON.stringify({ adminId: supabaseUserId }),
      });
      if (!res.ok) throw new Error('Failed to update user access');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkDeadLead = async (user: UserJourney) => {
    if (!supabaseUserId) return;
    try {
      const res = await fetch(`/api/crm/users/${user.id}/dead-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Marked from CRM table', adminId: supabaseUserId }),
      });
      if (!res.ok) throw new Error('Failed to mark as dead lead');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleMarkIrrelevant = async (user: UserJourney) => {
    if (!supabaseUserId) return;
    try {
      const res = await fetch(`/api/crm/users/${user.id}/irrelevant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Marked from CRM table', adminId: supabaseUserId }),
      });
      if (!res.ok) throw new Error('Failed to mark as irrelevant');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
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

    // Close dialog and refresh
    setDeleteDialogOpen(false);
    setUsersToDelete([]);
    await fetchUsers();
  };

  // ─── Lifecycle: archive / restore / verify ───────────────────────────
  const handleLifecycleViewChange = (view: LifecycleView) => {
    setLifecycleView(view);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));

    const params = new URLSearchParams(window.location.search);
    if (view === 'active') {
      params.delete('lifecycle');
      params.delete('candidate');
    } else {
      params.set('lifecycle', view);
      if (view === 'candidates') params.set('candidate', candidateSegment);
      else params.delete('candidate');
    }
    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleCandidateSegmentChange = (segment: CandidateSegment) => {
    setCandidateSegment(segment);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
    const params = new URLSearchParams(window.location.search);
    params.set('lifecycle', 'candidates');
    params.set('candidate', segment);
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', newUrl);
  };

  const handleArchiveRequest = (selectedUsers: UserJourney[]) => {
    setUsersToArchive(selectedUsers);
    setArchiveDialogOpen(true);
  };

  const handleArchiveConfirm = async (userIds: string[], reason: string) => {
    if (!supabaseUserId) throw new Error('Admin user ID not found. Please refresh and try again.');

    if (userIds.length === 1) {
      const res = await fetch(`/api/crm/users/${userIds[0]}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: supabaseUserId, reason }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to archive user');
      }
    } else {
      const res = await fetch('/api/crm/users/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, adminId: supabaseUserId, reason }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Failed to archive users');
      }
    }

    setArchiveDialogOpen(false);
    setUsersToArchive([]);
    await fetchUsers();
  };

  const handleRestore = async (user: UserJourney) => {
    if (!supabaseUserId) return;
    try {
      const res = await fetch(`/api/crm/users/${user.id}/archive`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: supabaseUserId }),
      });
      if (!res.ok) throw new Error('Failed to restore user');
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerifyRequest = (user: UserJourney) => {
    setUserToVerify(user);
    setVerifyDialogOpen(true);
  };

  const handleVerifyConfirm = async (payload: {
    examStatus: ExamStatus;
    academicYear?: string;
    archive: boolean;
    reason?: string;
  }) => {
    if (!supabaseUserId || !userToVerify) throw new Error('Admin user ID not found.');
    const res = await fetch(`/api/crm/users/${userToVerify.id}/verify-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminId: supabaseUserId, ...payload }),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error || 'Failed to record exam status');
    }
    setVerifyDialogOpen(false);
    setUserToVerify(null);
    await fetchUsers();
  };

  const activeStageConfig = activeStage ? PIPELINE_STAGE_CONFIG[activeStage] : null;

  return (
    <Box>
      {/* Page header — stacks on mobile */}
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
                bgcolor: 'primary.main',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PeopleAltIcon sx={{ color: 'white', fontSize: 22 }} />
            </Box>
          )}
          <Box>
            <Typography
              variant={isMobile ? 'h6' : 'h5'}
              fontWeight={700}
              sx={{ lineHeight: 1.2 }}
            >
              User Management
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: 12, md: 14 } }}>
              {!pipelineCounts
                ? 'Loading...'
                : lifecycleView === 'archived'
                ? `${totalCount} archived ${totalCount === 1 ? 'user' : 'users'} (hidden from the active view)`
                : lifecycleView === 'candidates'
                ? `${totalCount} suggested for review, archive the ones who are done`
                : `${pipelineCounts.total} active users across all stages`}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {/* Lifecycle focus segmented control */}
          <Box
            sx={{
              display: 'inline-flex',
              p: 0.375,
              gap: 0.375,
              borderRadius: 1.25,
              bgcolor: 'grey.100',
            }}
          >
            {([
              { key: 'active', label: 'Active' },
              { key: 'archived', label: 'Archived' },
              { key: 'candidates', label: 'Candidates' },
            ] as { key: LifecycleView; label: string }[]).map((seg) => {
              const selected = lifecycleView === seg.key;
              return (
                <Box
                  key={seg.key}
                  component="button"
                  onClick={() => handleLifecycleViewChange(seg.key)}
                  sx={{
                    border: 'none',
                    cursor: 'pointer',
                    px: 1.25,
                    py: 0.5,
                    borderRadius: 1,
                    fontSize: 13,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    bgcolor: selected ? 'background.paper' : 'transparent',
                    color: selected ? 'primary.main' : 'text.secondary',
                    boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                    transition: 'all 0.15s',
                    '&:hover': { color: selected ? 'primary.main' : 'text.primary' },
                  }}
                >
                  {seg.label}
                </Box>
              );
            })}
          </Box>

          {/* Candidate sub-segments (suggestions only) */}
          {lifecycleView === 'candidates' && (
            <>
              <Chip
                label="No phone + dormant"
                onClick={() => handleCandidateSegmentChange('no_phone_dormant')}
                variant={candidateSegment === 'no_phone_dormant' ? 'filled' : 'outlined'}
                size="small"
                color={candidateSegment === 'no_phone_dormant' ? 'primary' : 'default'}
                sx={{ fontWeight: 500, height: { xs: 32, md: 'auto' } }}
              />
              <Chip
                label="Old cohort"
                onClick={() => handleCandidateSegmentChange('old_cohort')}
                variant={candidateSegment === 'old_cohort' ? 'filled' : 'outlined'}
                size="small"
                color={candidateSegment === 'old_cohort' ? 'primary' : 'default'}
                sx={{ fontWeight: 500, height: { xs: 32, md: 'auto' } }}
              />
            </>
          )}

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
              '&:hover': {
                bgcolor: showDeadLeads ? 'grey.800' : 'grey.100',
              },
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
              '&:hover': {
                bgcolor: showIrrelevant ? '#BF360C' : 'grey.100',
              },
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
          <Tooltip title="Sync Microsoft profile photos for all staff & students">
            <span>
              <IconButton size="small" onClick={handleSyncMsPhotos} disabled={syncingPhotos}>
                {syncingPhotos ? (
                  <CircularProgress size={16} thickness={5} />
                ) : (
                  <AddAPhotoIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={fetchUsers} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {!isMobile && (
            <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen table'}>
              <IconButton size="small" onClick={() => setIsFullscreen((prev) => !prev)}>
                {isFullscreen ? (
                  <FullscreenExitIcon fontSize="small" />
                ) : (
                  <FullscreenIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: { xs: 1.5, md: 2 }, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Photo-sync result */}
      {notice && (
        <Alert severity="success" onClose={() => setNotice('')} sx={{ mb: { xs: 1.5, md: 2 }, borderRadius: 1 }}>
          {notice}
        </Alert>
      )}

      {/* Pipeline funnel — hidden in fullscreen */}
      {!isFullscreen && (
        <Box sx={{ mb: { xs: 1.5, md: 2 } }}>
          <PipelineFunnel
            counts={pipelineCounts}
            activeStage={activeStage}
            onStageClick={handleStageClick}
            loading={loading && !pipelineCounts}
          />
        </Box>
      )}

      {/* Table in card — supports fullscreen */}
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
              User Management — Fullscreen
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
          onMarkDeadLead={handleMarkDeadLead}
          onMarkIrrelevant={handleMarkIrrelevant}
          onDisableToggle={handleDisableToggle}
          onArchiveRequest={handleArchiveRequest}
          onBulkArchiveRequest={handleArchiveRequest}
          onRestore={handleRestore}
          onVerifyStatus={handleVerifyRequest}
          isFullscreen={isFullscreen}
        />
      </Paper>

      {/* Bulk delete confirmation dialog */}
      <BulkDeleteDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setUsersToDelete([]);
        }}
        users={usersToDelete}
        onConfirm={handleBulkDelete}
      />

      {/* Archive (reversible) confirmation dialog */}
      <ArchiveDialog
        open={archiveDialogOpen}
        onClose={() => {
          setArchiveDialogOpen(false);
          setUsersToArchive([]);
        }}
        users={usersToArchive}
        onConfirm={handleArchiveConfirm}
      />

      {/* Verify exam status outreach dialog */}
      <VerifyStatusDialog
        open={verifyDialogOpen}
        onClose={() => {
          setVerifyDialogOpen(false);
          setUserToVerify(null);
        }}
        user={userToVerify}
        onConfirm={handleVerifyConfirm}
      />
    </Box>
  );
}
