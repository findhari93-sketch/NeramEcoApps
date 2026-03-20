'use client';

import { useMemo, useState } from 'react';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
  type MRT_RowSelectionState,
  useMaterialReactTable,
} from 'material-react-table';
import { Avatar, Box, Button, Chip, Typography } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import type { UserJourney, PipelineStage } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface UsersTableProps {
  data: UserJourney[];
  totalCount: number;
  loading: boolean;
  pagination: MRT_PaginationState;
  onPaginationChange: (pagination: MRT_PaginationState) => void;
  sorting: MRT_SortingState;
  onSortingChange: (sorting: MRT_SortingState) => void;
  globalFilter: string;
  onGlobalFilterChange: (filter: string) => void;
  onRowClick: (userId: string) => void;
  onBulkDeleteRequest?: (users: UserJourney[]) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getDisplayName(user: { name: string; first_name: string | null; last_name: string | null; phone: string | null }): string {
  // If name is set and not the default 'User', use it
  if (user.name && user.name !== 'User') return user.name;
  // Fall back to first_name + last_name
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  if (fullName) return fullName;
  // Fall back to phone
  if (user.phone) return user.phone;
  return 'Unnamed User';
}

function getInitial(user: { name: string; first_name: string | null; last_name: string | null; phone: string | null }): string {
  const displayName = getDisplayName(user);
  if (displayName.startsWith('+')) return '#';
  return displayName.charAt(0).toUpperCase() || '?';
}

function formatCurrency(amount: number): string {
  if (!amount) return '-';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((todayStart - dateStart) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function handleExportCsv(rows: UserJourney[]) {
  const headers = [
    'Name',
    'Email',
    'Phone',
    'Pipeline Stage',
    'Application Status',
    'Course Interest',
    'City',
    'State',
    'Total Paid',
    'Join Date',
  ];

  const csvRows = rows.map((user) => [
    getDisplayName(user),
    user.email || '',
    user.phone || '',
    (user.pipeline_stage || '').replace(/_/g, ' '),
    user.application_status || '',
    user.interest_course || '',
    user.city || '',
    user.state || '',
    user.total_paid?.toString() || '0',
    formatDate(user.created_at),
  ]);

  const csvContent = [
    headers.join(','),
    ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `crm_users_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function UsersTable({
  data,
  totalCount,
  loading,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  globalFilter,
  onGlobalFilterChange,
  onRowClick,
  onBulkDeleteRequest,
}: UsersTableProps) {
  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});

  const columns = useMemo<MRT_ColumnDef<UserJourney>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        size: 220,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0 }}>
            {(row.original.pipeline_stage === 'enrolled' || row.original.linked_classroom_email) ? (
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #FFD700, #FFA000, #FFD700)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    bgcolor: 'background.paper',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Avatar
                    src={row.original.avatar_url || undefined}
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: 11,
                      fontWeight: 600,
                      bgcolor: row.original.avatar_url ? 'transparent' : 'primary.light',
                      color: 'primary.contrastText',
                    }}
                  >
                    {getInitial(row.original)}
                  </Avatar>
                </Box>
              </Box>
            ) : (
              <Avatar
                src={row.original.avatar_url || undefined}
                sx={{
                  width: 28,
                  height: 28,
                  fontSize: 11,
                  fontWeight: 600,
                  bgcolor: row.original.avatar_url ? 'transparent' : 'primary.light',
                  color: 'primary.contrastText',
                }}
              >
                {getInitial(row.original)}
              </Avatar>
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, lineHeight: 1.3 }}
                noWrap
              >
                {getDisplayName(row.original)}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', lineHeight: 1.3 }}
                noWrap
              >
                {row.original.email || row.original.phone || 'No contact'}
              </Typography>
              {row.original.contacted_status === 'dead_lead' && (
                <Chip
                  label="Dead Lead"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: '#9E9E9E14',
                    color: '#757575',
                    borderRadius: 0.75,
                    mt: 0.25,
                  }}
                />
              )}
              {row.original.contacted_status === 'irrelevant' && (
                <Chip
                  label="Irrelevant"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: 9,
                    fontWeight: 700,
                    bgcolor: '#FF980014',
                    color: '#E65100',
                    borderRadius: 0.75,
                    mt: 0.25,
                  }}
                />
              )}
            </Box>
          </Box>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        size: 150,
        Cell: ({ row }) => {
          if (!row.original.phone) {
            return (
              <Typography variant="body2" color="text.disabled">
                --
              </Typography>
            );
          }
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 13 }}>
                {row.original.phone}
              </Typography>
              {row.original.phone_verified && (
                <VerifiedIcon sx={{ fontSize: 14, color: 'success.main' }} />
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: 'pipeline_stage',
        header: 'Pipeline',
        size: 140,
        filterVariant: 'select',
        filterSelectOptions: Object.entries(PIPELINE_STAGE_CONFIG).map(
          ([value, config]) => ({ value, text: config.label })
        ),
        Cell: ({ row }) => {
          const stage = row.original.pipeline_stage;
          const config = PIPELINE_STAGE_CONFIG[stage];
          return (
            <Chip
              label={config?.label || stage}
              size="small"
              sx={{
                bgcolor: `${config?.color || '#9E9E9E'}14`,
                color: config?.color || '#9E9E9E',
                fontWeight: 600,
                fontSize: 11,
                borderRadius: 0.75,
                border: '1px solid',
                borderColor: `${config?.color || '#9E9E9E'}30`,
                height: 26,
              }}
            />
          );
        },
      },
      {
        accessorKey: 'application_status',
        header: 'Application',
        size: 145,
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'draft', text: 'Draft' },
          { value: 'submitted', text: 'Submitted' },
          { value: 'under_review', text: 'Under Review' },
          { value: 'approved', text: 'Approved' },
          { value: 'rejected', text: 'Rejected' },
        ],
        Cell: ({ row }) => {
          const status = row.original.application_status;
          if (!status) {
            return (
              <Typography variant="caption" color="text.disabled">
                No app
              </Typography>
            );
          }
          const colorMap: Record<string, 'default' | 'warning' | 'info' | 'success' | 'error'> = {
            draft: 'default',
            pending_verification: 'warning',
            submitted: 'info',
            under_review: 'warning',
            approved: 'success',
            rejected: 'error',
          };
          return (
            <Chip
              label={status.replace(/_/g, ' ')}
              size="small"
              color={colorMap[status] || 'default'}
              variant="outlined"
              sx={{ textTransform: 'capitalize', fontSize: 11, height: 24, borderRadius: 0.75 }}
            />
          );
        },
      },
      {
        accessorKey: 'interest_course',
        header: 'Course',
        size: 110,
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'nata', text: 'NATA' },
          { value: 'jee_paper2', text: 'JEE Paper 2' },
          { value: 'both', text: 'Both' },
        ],
        Cell: ({ row }) => {
          const course = row.original.interest_course;
          if (!course) {
            return (
              <Typography variant="caption" color="text.disabled">
                --
              </Typography>
            );
          }
          const labels: Record<string, string> = {
            nata: 'NATA',
            jee_paper2: 'JEE P2',
            both: 'Both',
          };
          return (
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {labels[course] || course}
            </Typography>
          );
        },
      },
      {
        accessorKey: 'has_demo_registration',
        header: 'Demo Class',
        size: 120,
        Cell: ({ row }) => {
          if (!row.original.has_demo_registration) {
            return (
              <Typography variant="caption" color="text.disabled">
                --
              </Typography>
            );
          }
          const status = row.original.latest_demo_status;
          const statusConfig: Record<string, { label: string; bgcolor: string; color: string }> = {
            pending: { label: 'Applied', bgcolor: '#FF980014', color: '#E65100' },
            approved: { label: 'Approved', bgcolor: '#2196F314', color: '#1565C0' },
            attended: { label: 'Attended', bgcolor: '#4CAF5014', color: '#2E7D32' },
            no_show: { label: 'No Show', bgcolor: '#F4433614', color: '#C62828' },
            rejected: { label: 'Rejected', bgcolor: '#9E9E9E14', color: '#616161' },
            cancelled: { label: 'Cancelled', bgcolor: '#9E9E9E14', color: '#616161' },
          };
          const config = statusConfig[status || ''] || { label: 'Requested', bgcolor: '#2196F314', color: '#1565C0' };
          return (
            <Chip
              label={config.label}
              size="small"
              sx={{
                bgcolor: config.bgcolor,
                color: config.color,
                fontWeight: 600,
                fontSize: 11,
                height: 24,
                borderRadius: 0.75,
              }}
            />
          );
        },
      },
      {
        accessorKey: 'total_paid',
        header: 'Payment',
        size: 135,
        Cell: ({ row }) => {
          if (!row.original.payment_count) {
            return (
              <Typography variant="caption" color="text.disabled">
                --
              </Typography>
            );
          }
          return (
            <Box>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  fontSize: 13,
                  color: 'success.dark',
                }}
              >
                {formatCurrency(row.original.total_paid)}
              </Typography>
              {row.original.has_pending_payment && (
                <Chip
                  label="Pending"
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: 9,
                    fontWeight: 600,
                    bgcolor: '#FF980014',
                    color: '#E65100',
                    borderRadius: 1,
                    mt: 0.25,
                  }}
                />
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: 'city',
        header: 'Location',
        size: 130,
        Cell: ({ row }) => {
          const city = row.original.city;
          const state = row.original.state;
          if (!city && !state) {
            return (
              <Typography variant="caption" color="text.disabled">
                --
              </Typography>
            );
          }
          return (
            <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>
              {[city, state].filter(Boolean).join(', ')}
            </Typography>
          );
        },
      },
      {
        accessorKey: 'created_at',
        header: 'Joined',
        size: 110,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 500 }}>
              {timeAgo(row.original.created_at)}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
              {formatDate(row.original.created_at)}
            </Typography>
          </Box>
        ),
      },
    ],
    []
  );

  const table = useMaterialReactTable({
    columns,
    data,
    getRowId: (row) => row.id,
    rowCount: totalCount,
    state: {
      pagination,
      sorting,
      globalFilter,
      isLoading: loading,
      showProgressBars: loading,
      rowSelection,
    },
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
    onPaginationChange: (updater) => {
      const newPagination =
        typeof updater === 'function' ? updater(pagination) : updater;
      onPaginationChange(newPagination);
    },
    onSortingChange: (updater) => {
      const newSorting =
        typeof updater === 'function' ? updater(sorting) : updater;
      onSortingChange(newSorting);
    },
    onGlobalFilterChange: onGlobalFilterChange,
    onRowSelectionChange: setRowSelection,

    // Features
    enableGlobalFilter: true,
    enableColumnFilters: true,
    enableSorting: true,
    enableHiding: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableRowSelection: true,
    enableMultiRowSelection: true,
    enableSelectAll: true,
    enablePinning: false,
    enableColumnActions: true,
    enableTopToolbar: true,
    enableBottomToolbar: true,
    layoutMode: 'grid',

    // Bulk actions banner
    positionToolbarAlertBanner: 'top',
    renderToolbarAlertBannerContent: ({ table: tbl }) => {
      const selectedRows = tbl.getSelectedRowModel().rows;
      const count = selectedRows.length;
      if (count === 0) return null;

      return (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            width: '100%',
            px: 1,
          }}
        >
          <Typography variant="body2" fontWeight={600} color="primary">
            {count} user{count > 1 ? 's' : ''} selected
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            size="small"
            startIcon={<FileDownloadOutlinedIcon sx={{ fontSize: 18 }} />}
            onClick={() => handleExportCsv(selectedRows.map((r) => r.original))}
            sx={{ textTransform: 'none', borderRadius: 0.75, fontSize: 13 }}
          >
            Export CSV
          </Button>

          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteOutlineIcon sx={{ fontSize: 18 }} />}
            onClick={() => {
              if (onBulkDeleteRequest) {
                onBulkDeleteRequest(selectedRows.map((r) => r.original));
              }
            }}
            sx={{ textTransform: 'none', borderRadius: 0.75, fontSize: 13 }}
          >
            Delete
          </Button>
        </Box>
      );
    },

    // Table container - Apple-like scrollbar, show on hover
    muiTableContainerProps: {
      sx: {
        maxHeight: 'calc(100vh - 380px)',
        '&::-webkit-scrollbar': { width: 8, height: 8 },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: 'transparent',
          borderRadius: 4,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
          transition: 'background 0.3s',
        },
        '&:hover::-webkit-scrollbar-thumb': {
          background: 'rgba(0,0,0,0.2)',
          backgroundClip: 'content-box',
        },
        '&::-webkit-scrollbar-thumb:hover': {
          background: 'rgba(0,0,0,0.4)',
          backgroundClip: 'content-box',
        },
        scrollbarWidth: 'thin',
        scrollbarColor: 'transparent transparent',
        '&:hover': {
          scrollbarColor: 'rgba(0,0,0,0.2) transparent',
        },
      },
    },

    muiTablePaperProps: {
      elevation: 0,
      sx: { boxShadow: 'none', borderRadius: 0 },
    },

    // Column headers - clean, hover-reveal actions
    muiTableHeadCellProps: {
      sx: {
        bgcolor: 'grey.50',
        fontWeight: 600,
        fontSize: 13,
        textTransform: 'none',
        letterSpacing: 0.3,
        color: 'text.primary',
        borderBottom: '2px solid',
        borderBottomColor: 'grey.200',
        py: 0.75,
        px: 1.25,
        whiteSpace: 'nowrap',
        // Hide sort arrows and column menu by default
        '& .MuiTableSortLabel-icon': {
          opacity: 0,
          transition: 'opacity 0.2s ease',
        },
        '& .MuiBox-root > .MuiIconButton-root': {
          opacity: 0,
          transition: 'opacity 0.2s ease',
        },
        // Show on hover
        '&:hover .MuiTableSortLabel-icon': {
          opacity: 0.5,
        },
        '&:hover .MuiBox-root > .MuiIconButton-root': {
          opacity: 0.7,
        },
        // Always show when column is sorted
        '& .MuiTableSortLabel-root.Mui-active .MuiTableSortLabel-icon': {
          opacity: 1,
        },
      },
    },

    muiTableBodyCellProps: {
      sx: {
        borderBottom: '1px solid',
        borderBottomColor: 'grey.100',
        py: 0.5,
        px: 1.25,
        fontSize: 13,
      },
    },

    muiTableBodyRowProps: ({ row }) => {
      const isDeadLead = row.original.contacted_status === 'dead_lead';
      const isIrrelevant = row.original.contacted_status === 'irrelevant';
      const isDimmed = isDeadLead || isIrrelevant;
      return {
        onClick: (e: React.MouseEvent) => {
          const target = e.target as HTMLElement;
          if (
            target.closest('.MuiCheckbox-root') ||
            target.closest('[data-bulk-action]')
          ) {
            return;
          }
          onRowClick(row.original.id);
        },
        sx: {
          cursor: 'pointer',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          ...(isDimmed && {
            opacity: 0.5,
            bgcolor: 'grey.50',
          }),
          '&:hover': {
            bgcolor: isDimmed ? 'grey.100' : 'primary.50',
            opacity: isDimmed ? 0.7 : 1,
          },
          '&:hover td': {
            bgcolor: 'transparent',
          },
        },
      };
    },

    positionGlobalFilter: 'left',
    muiSearchTextFieldProps: {
      placeholder: 'Search by name, email, phone, or application number...',
      variant: 'outlined' as const,
      size: 'small' as const,
      sx: {
        minWidth: 400,
        '& .MuiOutlinedInput-root': {
          borderRadius: 1,
          bgcolor: 'grey.50',
          fontSize: 14,
          '&:hover': { bgcolor: 'grey.100' },
          '&.Mui-focused': {
            bgcolor: 'background.paper',
            boxShadow: '0 0 0 3px rgba(25, 118, 210, 0.08)',
          },
        },
      },
    },
    muiTopToolbarProps: {
      sx: {
        px: 3,
        py: 2,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderBottomColor: 'grey.100',
      },
    },
    muiBottomToolbarProps: {
      sx: {
        px: 3,
        py: 1.5,
        bgcolor: 'grey.50',
        borderTop: '1px solid',
        borderTopColor: 'grey.200',
      },
    },
    initialState: {
      density: 'compact',
    },
    muiPaginationProps: {
      rowsPerPageOptions: [25, 50, 100],
      showFirstButton: true,
      showLastButton: true,
    },
    muiLinearProgressProps: {
      sx: {
        height: 3,
        bgcolor: 'grey.100',
        '& .MuiLinearProgress-bar': {
          bgcolor: 'primary.main',
        },
      },
    },
  });

  return <MaterialReactTable table={table} />;
}
