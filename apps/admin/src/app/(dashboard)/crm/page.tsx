'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Box,
  Typography,
  Alert,
  Chip,
  IconButton,
  Tooltip,
  Paper,
  CircularProgress,
  TextField,
  MenuItem,
  Button,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import { useRouter, useSearchParams } from 'next/navigation';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import RefreshIcon from '@mui/icons-material/Refresh';
import AddAPhotoIcon from '@mui/icons-material/AddAPhoto';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import FilterAltOffOutlinedIcon from '@mui/icons-material/FilterAltOffOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type {
  UserJourney,
  ExamStatus,
  LifecycleStage,
  ActivityGroup,
  PeopleBreakdownRow,
} from '@neram/database';
import { LIFECYCLE_STAGE_LABELS, activityGroupOf } from '@neram/database';
import type { MRT_PaginationState, MRT_SortingState, MRT_ColumnFiltersState } from 'material-react-table';
import PeopleSummary from '../../../components/crm/PeopleSummary';
import { summarisePeople, formatCount, type Season } from '@/lib/people-summary';
import UsersTable from '../../../components/crm/UsersTable';
import BulkDeleteDialog from '../../../components/crm/BulkDeleteDialog';
import ArchiveDialog from '../../../components/crm/ArchiveDialog';
import VerifyStatusDialog from '../../../components/crm/VerifyStatusDialog';
import { useAdminProfile } from '@/contexts/AdminProfileContext';
import { useBatches } from '@/contexts/BatchContext';

type LifecycleView = 'active' | 'archived';
type IdentityFilter = 'firebase' | 'microsoft' | 'all';
type Outcome = 'dead_lead' | 'irrelevant';

const IDENTITY_OPTIONS: Array<{ value: IdentityFilter; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'firebase', label: 'Google or phone sign-in' },
  { value: 'microsoft', label: 'Microsoft only' },
];
const OUTCOME_OPTIONS: Array<{ value: Outcome | ''; label: string }> = [
  { value: '', label: 'Any' },
  { value: 'dead_lead', label: 'Not interested (dead lead)' },
  { value: 'irrelevant', label: 'Irrelevant' },
];
const LIFECYCLE_STAGE_KEYS = Object.keys(LIFECYCLE_STAGE_LABELS) as LifecycleStage[];
const SEASONS: readonly Season[] = ['current', 'later', 'earlier', 'all'];
const ACTIVITY_KEYS: readonly ActivityGroup[] = ['recent', 'quiet', 'gone'];
const VIEW_HINTS: Record<LifecycleView, string> = {
  active: 'Leads and students you are working with now.',
  archived: 'Moved out of the working list by staff. They can still sign in, and you can restore them.',
};

/** Column filters the API supports: column id to query param. */
const COLUMN_FILTER_PARAMS: Record<string, string> = {
  application_status: 'application_status',
  interest_course: 'interest_course',
};

function readParam<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : '';
}

/** Put one query param in the address bar without a navigation. */
function replaceUrlParam(key: string, value: string | null) {
  const params = new URLSearchParams(window.location.search);
  if (value) params.set(key, value);
  else params.delete(key);
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}

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
  // Exact grouped counts for the season, activity and stage cards.
  const [breakdown, setBreakdown] = useState<PeopleBreakdownRow[] | null>(null);
  const [allAccounts, setAllAccounts] = useState<number | null>(null);
  const [archiveSuggestions, setArchiveSuggestions] = useState(0);
  const [currentExamYear, setCurrentExamYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncingPhotos, setSyncingPhotos] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [lifecycleView, setLifecycleView] = useState<LifecycleView>(
    searchParams.get('lifecycle') === 'archived' ? 'archived' : 'active'
  );
  // The season control starts from the global exam batch (profile menu) unless
  // the address already names one: 'all' there means All seasons here.
  const [season, setSeason] = useState<Season>(
    readParam(searchParams.get('season'), SEASONS) || (selectedBatch === 'all' ? 'all' : 'current')
  );
  // Older links used ?engagement= and ?dead_leads= / ?irrelevant=; map them.
  const [activity, setActivity] = useState<ActivityGroup | ''>(
    readParam(searchParams.get('activity'), ACTIVITY_KEYS) ||
      (searchParams.get('engagement') ? activityGroupOf(searchParams.get('engagement')) : '')
  );
  const [outcome, setOutcome] = useState<Outcome | ''>(
    readParam(searchParams.get('outcome'), ['dead_lead', 'irrelevant'] as const) ||
      (searchParams.get('dead_leads') === 'true'
        ? 'dead_lead'
        : searchParams.get('irrelevant') === 'true'
        ? 'irrelevant'
        : '')
  );

  // The Candidates tab moved to the Lifecycle page's archive suggestions.
  useEffect(() => {
    if (searchParams.get('lifecycle') === 'candidates') router.replace('/lifecycle?kind=archive_lead');
  }, [searchParams, router]);

  const [pagination, setPagination] = useState<MRT_PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  });
  const [sorting, setSorting] = useState<MRT_SortingState>([
    { id: 'created_at', desc: true },
  ]);
  const [globalFilter, setGlobalFilter] = useState('');

  // Everyone by default, so Microsoft-only students are counted too.
  const [identity, setIdentity] = useState<IdentityFilter>(
    readParam(searchParams.get('identity'), ['firebase', 'microsoft', 'all'] as const) || 'all'
  );
  const [lifecycleStage, setLifecycleStage] = useState<LifecycleStage | ''>(
    readParam(searchParams.get('lifecycle_stage'), LIFECYCLE_STAGE_KEYS)
  );
  const [columnFilters, setColumnFilters] = useState<MRT_ColumnFiltersState>(() =>
    Object.keys(COLUMN_FILTER_PARAMS)
      .map((id) => ({ id, value: searchParams.get(COLUMN_FILTER_PARAMS[id]) }))
      .filter((f) => !!f.value) as MRT_ColumnFiltersState
  );

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

      if (globalFilter) params.set('search', globalFilter);
      if (lifecycleView === 'archived') params.set('lifecycle_status', 'archived');
      params.set('season', season);
      params.set('identity', identity);
      if (outcome) params.set('outcome', outcome);
      if (lifecycleStage) params.set('lifecycle_stage', lifecycleStage);
      if (activity) params.set('activity', activity);
      for (const f of columnFilters) {
        const param = COLUMN_FILTER_PARAMS[f.id];
        if (param && typeof f.value === 'string' && f.value) params.set(param, f.value);
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination, sorting, globalFilter, lifecycleView, season, identity, outcome, lifecycleStage, activity, columnFilters]);

  // The counts depend only on sign-in and call outcome; season, stage and
  // activity are worked out on the page from the same breakdown.
  const fetchSummary = useCallback(async () => {
    try {
      const params = new URLSearchParams({ summary: 'only', identity });
      if (outcome) params.set('outcome', outcome);
      const res = await fetch(`/api/crm/users?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load the counts');
      const data = await res.json();
      setBreakdown(data.breakdown || []);
      setAllAccounts(data.allAccounts ?? null);
      setArchiveSuggestions(data.archiveSuggestions || 0);
      setCurrentExamYear(data.currentExamYear ?? null);
    } catch (err: any) {
      setError(err.message);
    }
  }, [identity, outcome]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  /** After a change to someone (archive, restore, mark), refresh list and counts. */
  const refreshAll = useCallback(async () => {
    await Promise.all([fetchUsers(), fetchSummary()]);
  }, [fetchUsers, fetchSummary]);

  const summary = useMemo(
    () =>
      breakdown && currentExamYear !== null
        ? summarisePeople(breakdown, {
            view: lifecycleView,
            season,
            currentExamYear,
            activity: activity || null,
            stage: lifecycleStage || null,
          })
        : null,
    [breakdown, currentExamYear, lifecycleView, season, activity, lifecycleStage]
  );

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

  const resetToFirstPage = () => setPagination((prev) => ({ ...prev, pageIndex: 0 }));

  const handleIdentityChange = (value: IdentityFilter) => {
    setIdentity(value);
    resetToFirstPage();
    replaceUrlParam('identity', value === 'all' ? null : value);
  };

  const handleLifecycleStageChange = (value: LifecycleStage | '') => {
    setLifecycleStage(value);
    resetToFirstPage();
    replaceUrlParam('lifecycle_stage', value || null);
  };

  const handleActivityChange = (value: ActivityGroup | null) => {
    setActivity(value || '');
    resetToFirstPage();
    replaceUrlParam('engagement', null);
    replaceUrlParam('activity', value);
  };

  const handleSeasonChange = (value: Season) => {
    setSeason(value);
    resetToFirstPage();
    replaceUrlParam('season', value === 'current' ? null : value);
  };

  const handleOutcomeChange = (value: Outcome | '') => {
    setOutcome(value);
    resetToFirstPage();
    replaceUrlParam('dead_leads', null);
    replaceUrlParam('irrelevant', null);
    replaceUrlParam('outcome', value || null);
  };

  const handleColumnFiltersChange = (filters: MRT_ColumnFiltersState) => {
    setColumnFilters(filters);
    resetToFirstPage();
    for (const [id, param] of Object.entries(COLUMN_FILTER_PARAMS)) {
      const f = filters.find((x) => x.id === id);
      replaceUrlParam(param, f && typeof f.value === 'string' && f.value ? f.value : null);
    }
  };

  const filtersActive =
    identity !== 'all' || !!outcome || !!lifecycleStage || !!activity || columnFilters.length > 0;
  const clearFilters = () => {
    handleIdentityChange('all');
    handleOutcomeChange('');
    handleLifecycleStageChange('');
    handleActivityChange(null);
    handleColumnFiltersChange([]);
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
      await refreshAll();
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
      await refreshAll();
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
      await refreshAll();
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
      await refreshAll();
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
    await refreshAll();
  };

  // ─── Lifecycle: archive / restore / verify ───────────────────────────
  const handleLifecycleViewChange = (view: LifecycleView) => {
    setLifecycleView(view);
    // Stages differ between the views (Archived holds archived and alumni).
    setLifecycleStage('');
    replaceUrlParam('lifecycle_stage', null);
    resetToFirstPage();
    replaceUrlParam('candidate', null);
    replaceUrlParam('lifecycle', view === 'active' ? null : view);
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
    await refreshAll();
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
      await refreshAll();
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
    await refreshAll();
  };

  const totals = summary?.totals;
  const unfiltered = identity === 'all' && !outcome;
  const headerLine = !totals
    ? 'Loading counts...'
    : unfiltered && allAccounts !== null
    ? `${formatCount(allAccounts)} accounts: ${formatCount(totals.active)} current leads and students, ${formatCount(
        totals.archived
      )} archived, ${formatCount(Math.max(0, allAccounts - totals.all))} staff and parents`
    : `${formatCount(totals.active)} current and ${formatCount(totals.archived)} archived match the sign-in and call outcome filters`;

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
              People
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: 13, md: 14 } }}>
              {headerLine}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          {/* Current / Archived */}
          <Box
            role="group"
            aria-label="Which people"
            sx={{ display: 'inline-flex', p: 0.375, gap: 0.375, borderRadius: 1.25, bgcolor: 'grey.100' }}
          >
            {([
              { key: 'active', label: 'Current', count: totals?.active },
              { key: 'archived', label: 'Archived', count: totals?.archived },
            ] as { key: LifecycleView; label: string; count?: number }[]).map((seg) => {
              const selected = lifecycleView === seg.key;
              return (
                <Tooltip key={seg.key} title={VIEW_HINTS[seg.key]} arrow>
                  <Box
                    component="button"
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleLifecycleViewChange(seg.key)}
                    sx={{
                      border: 'none',
                      cursor: 'pointer',
                      minHeight: 44,
                      px: 1.5,
                      borderRadius: 1,
                      fontSize: 14,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      bgcolor: selected ? 'background.paper' : 'transparent',
                      color: selected ? 'primary.main' : 'text.secondary',
                      boxShadow: selected ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                      transition: 'color 150ms, background-color 150ms',
                      '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                      '&:hover': { color: selected ? 'primary.main' : 'text.primary' },
                      '&:focus-visible': { outline: '3px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                    }}
                  >
                    {seg.label}
                    {seg.count !== undefined && ` · ${formatCount(seg.count)}`}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>

          {archiveSuggestions > 0 && (
            <Button
              component={Link}
              href="/lifecycle?kind=archive_lead"
              endIcon={<ArrowForwardIcon />}
              sx={{ minHeight: 44, textTransform: 'none', fontWeight: 600 }}
            >
              {formatCount(archiveSuggestions)} suggested to archive
            </Button>
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
              <IconButton size="small" onClick={refreshAll} disabled={loading} aria-label="Refresh">
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

      {/* Lifecycle filters: who (sign-in), where (stage), how active */}
      <Box
        role="group"
        aria-label="Filter people"
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          mb: { xs: 1.5, md: 2 },
          '& .MuiInputBase-root': { minHeight: 44 },
        }}
      >
        <TextField
          select
          size="small"
          label="Sign-in"
          value={identity}
          onChange={(e) => handleIdentityChange(e.target.value as IdentityFilter)}
          fullWidth={false}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: 'calc(50% - 4px)', sm: 220 } }}
        >
          {IDENTITY_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Call outcome"
          value={outcome}
          onChange={(e) => handleOutcomeChange(e.target.value as Outcome | '')}
          fullWidth={false}
          SelectProps={{ displayEmpty: true }}
          InputLabelProps={{ shrink: true }}
          sx={{ width: { xs: 'calc(50% - 4px)', sm: 230 } }}
        >
          {OUTCOME_OPTIONS.map((o) => (
            <MenuItem key={o.value || 'any'} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        {filtersActive && (
          <Button
            onClick={clearFilters}
            startIcon={<FilterAltOffOutlinedIcon />}
            sx={{ minHeight: 44, textTransform: 'none', flex: { xs: '1 1 calc(50% - 4px)', sm: '0 0 auto' } }}
          >
            Clear filters
          </Button>
        )}
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

      {/* Season, activity and stage cards (the cards are the filters); hidden in fullscreen */}
      {!isFullscreen && (
        <Box sx={{ mb: { xs: 1.5, md: 2 } }}>
          <PeopleSummary
            summary={summary}
            view={lifecycleView}
            season={season}
            currentExamYear={currentExamYear}
            activity={activity || null}
            stage={lifecycleStage || null}
            onSeasonChange={handleSeasonChange}
            onActivityChange={handleActivityChange}
            onStageChange={(value) => handleLifecycleStageChange(value || '')}
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
              People, full screen
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
          columnFilters={columnFilters}
          onColumnFiltersChange={handleColumnFiltersChange}
          peopleView
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
