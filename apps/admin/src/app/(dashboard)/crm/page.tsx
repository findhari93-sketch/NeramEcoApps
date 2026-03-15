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
} from '@neram/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
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

export default function CRMPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supabaseUserId } = useAdminProfile();

  const [users, setUsers] = useState<UserJourney[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [pipelineCounts, setPipelineCounts] = useState<PipelineStageCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [usersToDelete, setUsersToDelete] = useState<UserJourney[]>([]);

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
  }, [pagination, sorting, activeStage, globalFilter, showDeadLeads, showIrrelevant]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

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

    // Close dialog and refresh
    setDeleteDialogOpen(false);
    setUsersToDelete([]);
    await fetchUsers();
  };

  const activeStageConfig = activeStage ? PIPELINE_STAGE_CONFIG[activeStage] : null;

  return (
    <Box>
      {/* Page header */}
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
            <PeopleAltIcon sx={{ color: 'white', fontSize: 22 }} />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>
              User Management
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {pipelineCounts
                ? `${pipelineCounts.total} users across all stages`
                : 'Loading...'}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label="Dead Leads"
            onClick={handleToggleDeadLeads}
            onDelete={showDeadLeads ? handleToggleDeadLeads : undefined}
            variant={showDeadLeads ? 'filled' : 'outlined'}
            size="small"
            sx={{
              fontWeight: 500,
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
              sx={{ fontWeight: 500 }}
            />
          )}
          <Tooltip title="Refresh data">
            <span>
              <IconButton size="small" onClick={fetchUsers} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: 1 }}>
          {error}
        </Alert>
      )}

      {/* Pipeline funnel */}
      <Box sx={{ mb: 2 }}>
        <PipelineFunnel
          counts={pipelineCounts}
          activeStage={activeStage}
          onStageClick={handleStageClick}
          loading={loading && !pipelineCounts}
        />
      </Box>

      {/* Table in card */}
      <Paper
        elevation={0}
        sx={{
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'grey.200',
          overflow: 'hidden',
        }}
      >
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
    </Box>
  );
}
