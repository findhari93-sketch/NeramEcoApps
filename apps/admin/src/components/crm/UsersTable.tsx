'use client';

import { useMemo } from 'react';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_PaginationState,
  type MRT_SortingState,
  useMaterialReactTable,
} from 'material-react-table';
import { Avatar, Box, Chip, Typography } from '@neram/ui';
import VerifiedIcon from '@mui/icons-material/Verified';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
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
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
}: UsersTableProps) {
  const columns = useMemo<MRT_ColumnDef<UserJourney>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'User',
        size: 260,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.5 }}>
            <Avatar
              src={row.original.avatar_url || undefined}
              sx={{
                width: 38,
                height: 38,
                fontSize: 14,
                fontWeight: 600,
                bgcolor: row.original.avatar_url ? 'transparent' : 'primary.light',
                color: 'primary.contrastText',
              }}
            >
              {row.original.name?.charAt(0)?.toUpperCase() || '?'}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, lineHeight: 1.3 }}
                noWrap
              >
                {row.original.name || 'Unnamed User'}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', lineHeight: 1.3 }}
                noWrap
              >
                {row.original.email || row.original.phone || 'No contact'}
              </Typography>
            </Box>
          </Box>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        size: 160,
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
        header: 'Stage',
        size: 155,
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
                borderRadius: 1.5,
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
        size: 135,
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
              sx={{ textTransform: 'capitalize', fontSize: 11, height: 24, borderRadius: 1.5 }}
            />
          );
        },
      },
      {
        accessorKey: 'interest_course',
        header: 'Course',
        size: 100,
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
        header: 'Demo',
        size: 110,
        Cell: ({ row }) => {
          if (!row.original.has_demo_registration) {
            return (
              <Typography variant="caption" color="text.disabled">
                --
              </Typography>
            );
          }
          if (row.original.demo_attended) {
            return (
              <Chip
                label="Attended"
                size="small"
                sx={{
                  bgcolor: '#4CAF5014',
                  color: '#2E7D32',
                  fontWeight: 600,
                  fontSize: 11,
                  height: 24,
                  borderRadius: 1.5,
                }}
              />
            );
          }
          return (
            <Chip
              label="Requested"
              size="small"
              sx={{
                bgcolor: '#2196F314',
                color: '#1565C0',
                fontWeight: 600,
                fontSize: 11,
                height: 24,
                borderRadius: 1.5,
              }}
            />
          );
        },
      },
      {
        accessorKey: 'total_paid',
        header: 'Payment',
        size: 130,
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
        size: 140,
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
        size: 100,
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
    rowCount: totalCount,
    state: {
      pagination,
      sorting,
      globalFilter,
      isLoading: loading,
      showProgressBars: loading,
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
    enableGlobalFilter: true,
    enableColumnFilters: true,
    enableSorting: true,
    enableHiding: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableRowSelection: false,
    enablePinning: false,
    enableTopToolbar: true,
    enableBottomToolbar: true,
    layoutMode: 'grid',
    muiTableContainerProps: {
      sx: {
        maxHeight: 'calc(100vh - 380px)',
        '&::-webkit-scrollbar': { width: 6 },
        '&::-webkit-scrollbar-thumb': { bgcolor: 'grey.300', borderRadius: 2 },
      },
    },
    muiTablePaperProps: {
      elevation: 0,
      sx: { boxShadow: 'none' },
    },
    muiTableHeadCellProps: {
      sx: {
        bgcolor: 'grey.50',
        fontWeight: 600,
        fontSize: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: 'text.secondary',
        borderBottom: '2px solid',
        borderBottomColor: 'grey.200',
        py: 1.5,
      },
    },
    muiTableBodyCellProps: {
      sx: {
        borderBottom: '1px solid',
        borderBottomColor: 'grey.100',
        py: 1,
      },
    },
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => onRowClick(row.original.id),
      sx: {
        cursor: 'pointer',
        transition: 'background-color 0.15s',
        '&:hover': {
          bgcolor: 'primary.50',
        },
        '&:hover td': {
          bgcolor: 'transparent',
        },
      },
    }),
    positionGlobalFilter: 'left',
    muiSearchTextFieldProps: {
      placeholder: 'Search users by name, email, phone, or application #...',
      variant: 'outlined',
      size: 'small',
      sx: {
        minWidth: 360,
        '& .MuiOutlinedInput-root': {
          borderRadius: 2,
          bgcolor: 'grey.50',
          '&:hover': { bgcolor: 'grey.100' },
          '&.Mui-focused': { bgcolor: 'background.paper' },
        },
      },
    },
    muiTopToolbarProps: {
      sx: {
        px: 2,
        py: 1.5,
        bgcolor: 'background.paper',
        borderBottom: '1px solid',
        borderBottomColor: 'grey.100',
      },
    },
    muiBottomToolbarProps: {
      sx: {
        px: 2,
        bgcolor: 'grey.50',
        borderTop: '1px solid',
        borderTopColor: 'grey.200',
      },
    },
    muiPaginationProps: {
      rowsPerPageOptions: [10, 25, 50, 100],
      showFirstButton: true,
      showLastButton: true,
    },
  });

  return <MaterialReactTable table={table} />;
}
