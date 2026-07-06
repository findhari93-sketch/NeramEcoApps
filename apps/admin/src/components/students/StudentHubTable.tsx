'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_RowSelectionState,
  useMaterialReactTable,
} from 'material-react-table';
import {
  UserAvatar,
  Box,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@neram/ui';
import EventIcon from '@mui/icons-material/Event';
import LaptopMacIcon from '@mui/icons-material/LaptopMac';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import HistoryEduIcon from '@mui/icons-material/HistoryEdu';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CopyablePhone from '@/components/CopyablePhone';

export interface StudentRow {
  id: string;
  user_id: string;
  student_id: string | null;
  name: string | null;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  email: string;
  classroom_email: string | null;
  personal_email: string | null;
  ms_teams_email: string | null;
  phone: string;
  interest_course: string | null;
  source: string | null;
  payment_status: string | null;
  total_fee: number;
  fee_paid: number;
  fee_due: number;
  final_fee: number | null;
  full_payment_discount: number | null;
  discount_amount: number | null;
  academic_year: string | null;
  is_alumni: boolean;
  enrollment_date: string | null;
  last_login_at: string | null;
  student_profile_id: string | null;
  application_number: string | null;
  application_complete: boolean;
  application_status: string | null;
  application_missing: 'no_application' | 'incomplete' | null;
}

interface StudentHubTableProps {
  students: StudentRow[];
  loading?: boolean;
  /** Bumping this clears the row selection (e.g. after a bulk action reloads data). */
  selectionResetKey?: number;
  /** Current cohort code (e.g. '2026-27'); a future-coded year chip is accented. */
  currentBatchCode?: string | null;
  onRowClick: (row: StudentRow) => void;
  onDelete: (row: StudentRow) => void;
  onSetYear: (rows: StudentRow[]) => void;
  onMoveSoftware: (rows: StudentRow[]) => void;
  onMarkStaff: (rows: StudentRow[]) => void;
  onGraduate: (rows: StudentRow[]) => void;
}

const ACCENT = '#B45309';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'Both',
  not_sure: 'Not sure',
};

const PAYMENT_LABELS: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' }> = {
  paid: { label: 'Paid', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
  refunded: { label: 'Refunded', color: 'default' },
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The /students working-hub grid. AG-Grid-style per-column filtering via
 * material-react-table's subheader filter row: free-text columns get a text box,
 * enumerated columns a dropdown, money a numeric range. Filtering / sorting /
 * paging are client-side because the page loads the whole year cohort at once;
 * the year selector on the page is the only server-side scope. Bulk actions live
 * in the selection banner; row click opens the detail drawer.
 */
export default function StudentHubTable({
  students,
  loading = false,
  selectionResetKey = 0,
  currentBatchCode,
  onRowClick,
  onDelete,
  onSetYear,
  onMoveSoftware,
  onMarkStaff,
  onGraduate,
}: StudentHubTableProps) {
  const [rowSelection, setRowSelection] = useState<MRT_RowSelectionState>({});

  // Clear selection when the page signals a reload after a bulk action.
  useEffect(() => {
    setRowSelection({});
  }, [selectionResetKey]);

  // Year filter options from the cohorts actually present.
  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) if (s.academic_year) set.add(s.academic_year);
    return [...set].sort((a, b) => b.localeCompare(a)).map((y) => ({ value: y, text: y }));
  }, [students]);

  const columns = useMemo<MRT_ColumnDef<StudentRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Student',
        size: 210,
        Cell: ({ row }) => {
          const s = row.original;
          const display = s.name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Unnamed';
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
              <UserAvatar src={s.avatar_url} name={display} size={28} tapToView={false} />
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
                  {display}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {s.student_id ? (
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: 10 }}>
                      {s.student_id}
                    </Typography>
                  ) : (
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 10 }}>
                      No student ID
                    </Typography>
                  )}
                  {s.is_alumni && (
                    <Chip label="Alumni" size="small" sx={{ height: 16, fontSize: 9, fontWeight: 700, bgcolor: 'rgba(180,83,9,0.10)', color: ACCENT }} />
                  )}
                </Box>
              </Box>
            </Box>
          );
        },
      },
      {
        accessorKey: 'classroom_email',
        header: 'Classroom ID',
        size: 220,
        Cell: ({ row }) => {
          const email = row.original.classroom_email;
          if (!email) {
            return (
              <Tooltip title="Microsoft classroom account not provisioned yet" arrow>
                <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                  Not assigned
                </Typography>
              </Tooltip>
            );
          }
          return (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 12.5 }} noWrap>
              {email}
            </Typography>
          );
        },
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        size: 160,
        Cell: ({ row }) =>
          row.original.phone ? (
            <CopyablePhone phone={row.original.phone} variant="body2" mono showOnHover noWrap />
          ) : (
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              No phone
            </Typography>
          ),
      },
      {
        accessorKey: 'interest_course',
        header: 'Course',
        size: 120,
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'nata', text: 'NATA' },
          { value: 'jee_paper2', text: 'JEE Paper 2' },
          { value: 'both', text: 'Both' },
          { value: 'not_sure', text: 'Not sure' },
        ],
        Cell: ({ row }) => {
          const c = row.original.interest_course;
          if (!c) return <Typography variant="caption" sx={{ color: 'text.disabled' }}>-</Typography>;
          return <Chip label={COURSE_LABELS[c] || c} size="small" variant="outlined" sx={{ height: 22, fontSize: 11, fontWeight: 600 }} />;
        },
      },
      {
        id: 'application',
        header: 'Application',
        size: 150,
        accessorFn: (row) => (row.application_complete ? 'Complete' : 'Incomplete'),
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'Complete', text: 'Complete' },
          { value: 'Incomplete', text: 'Incomplete' },
        ],
        Cell: ({ row }) => {
          const s = row.original;
          if (s.application_complete) {
            return (
              <Chip
                icon={<CheckCircleIcon sx={{ fontSize: '14px !important' }} />}
                label="Complete"
                size="small"
                sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: 'rgba(22,163,74,0.10)', color: '#15803D' }}
              />
            );
          }
          const tip = s.application_missing === 'no_application'
            ? 'No application form filled, basic details and course are missing'
            : 'Basic application form not fully filled';
          return (
            <Tooltip title={tip} arrow>
              <Chip
                icon={<ErrorOutlineIcon sx={{ fontSize: '14px !important' }} />}
                label="Incomplete"
                size="small"
                sx={{ height: 22, fontSize: 11, fontWeight: 600, bgcolor: 'rgba(217,119,6,0.12)', color: '#B45309' }}
              />
            </Tooltip>
          );
        },
      },
      {
        id: 'join_method',
        header: 'Join method',
        size: 120,
        accessorFn: (row) => (row.source === 'direct_link' ? 'Direct' : 'Application'),
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'Direct', text: 'Direct' },
          { value: 'Application', text: 'Application' },
        ],
        Cell: ({ row }) => {
          const direct = row.original.source === 'direct_link';
          return (
            <Chip
              label={direct ? 'Direct' : 'Application'}
              size="small"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: direct ? 'rgba(37,99,235,0.10)' : 'rgba(100,116,139,0.12)',
                color: direct ? '#1D4ED8' : '#475569',
              }}
            />
          );
        },
      },
      {
        accessorKey: 'payment_status',
        header: 'Payment',
        size: 130,
        filterVariant: 'select',
        filterSelectOptions: [
          { value: 'paid', text: 'Paid' },
          { value: 'pending', text: 'Pending' },
          { value: 'failed', text: 'Failed' },
          { value: 'refunded', text: 'Refunded' },
        ],
        Cell: ({ row }) => {
          const s = row.original;
          if (!s.student_profile_id) {
            return (
              <Typography variant="caption" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                No fee record
              </Typography>
            );
          }
          const cfg = PAYMENT_LABELS[s.payment_status || ''] || { label: s.payment_status || '-', color: 'default' as const };
          const isPartial = s.payment_status === 'pending' && (s.fee_paid || 0) > 0;
          return (
            <Chip
              label={isPartial ? 'Partial' : cfg.label}
              size="small"
              color={cfg.color}
              variant="outlined"
              sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
            />
          );
        },
      },
      {
        accessorKey: 'fee_paid',
        header: 'Total Paid',
        size: 120,
        filterVariant: 'range',
        Cell: ({ row }) => (
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12.5, color: row.original.fee_paid > 0 ? 'success.dark' : 'text.disabled' }}>
            {row.original.fee_paid > 0 ? formatCurrency(row.original.fee_paid) : '-'}
          </Typography>
        ),
      },
      {
        accessorKey: 'fee_due',
        header: 'Fee Due',
        size: 120,
        filterVariant: 'range',
        Cell: ({ row }) => (
          <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: 12.5, color: row.original.fee_due > 0 ? 'error.main' : 'text.disabled' }}>
            {row.original.fee_due > 0 ? formatCurrency(row.original.fee_due) : '-'}
          </Typography>
        ),
      },
      {
        accessorKey: 'academic_year',
        header: 'Year',
        size: 110,
        filterVariant: 'select',
        filterSelectOptions: yearOptions,
        Cell: ({ row }) => {
          const y = row.original.academic_year;
          if (!y) return <Typography variant="caption" sx={{ color: 'text.disabled' }}>No year</Typography>;
          // Future-coded cohort (a junior attending this year's classes): accent it
          // so staff notice they are not part of the current exam batch.
          const isFuture = !!currentBatchCode && y > currentBatchCode;
          return (
            <Tooltip title={isFuture ? 'Future exam batch, also attending the current cohort' : ''} disableHoverListener={!isFuture}>
              <Chip
                label={y}
                size="small"
                sx={{
                  height: 22,
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  bgcolor: isFuture ? 'rgba(180,83,9,0.12)' : 'grey.100',
                  color: isFuture ? ACCENT : 'text.secondary',
                }}
              />
            </Tooltip>
          );
        },
      },
      {
        accessorKey: 'enrollment_date',
        header: 'Enrolled',
        size: 110,
        enableColumnFilter: false,
        Cell: ({ row }) => (
          <Typography variant="body2" sx={{ fontSize: 12, color: 'text.secondary' }}>
            {formatDate(row.original.enrollment_date)}
          </Typography>
        ),
      },
      {
        // Hidden, search-only: keeps the personal Gmail findable via global search
        // even though it no longer has its own visible column.
        accessorKey: 'personal_email',
        header: 'Personal email',
        enableColumnFilter: false,
        enableHiding: true,
      },
    ],
    [yearOptions, currentBatchCode]
  );

  const table = useMaterialReactTable({
    columns,
    data: students,
    getRowId: (row) => row.id,
    state: { rowSelection, isLoading: loading, showProgressBars: loading },
    onRowSelectionChange: setRowSelection,

    enableGlobalFilter: true,
    enableColumnFilters: true,
    columnFilterDisplayMode: 'subheader',
    enableSorting: true,
    enableHiding: true,
    enableDensityToggle: false,
    enableFullScreenToggle: false,
    enableRowSelection: true,
    enableMultiRowSelection: true,
    enableSelectAll: true,
    enableColumnActions: false,
    enableRowActions: true,
    positionActionsColumn: 'last',
    layoutMode: 'grid',
    initialState: {
      density: 'compact',
      columnVisibility: { personal_email: false },
      pagination: { pageIndex: 0, pageSize: 25 },
    },

    renderRowActions: ({ row }) => (
      <Tooltip title="Delete student">
        <IconButton
          size="small"
          color="error"
          data-row-action
          onClick={(e) => {
            e.stopPropagation();
            onDelete(row.original);
          }}
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    ),
    displayColumnDefOptions: {
      'mrt-row-actions': { header: '', size: 50 },
    },

    positionToolbarAlertBanner: 'top',
    renderToolbarAlertBannerContent: ({ table: tbl }) => {
      const rows = tbl.getSelectedRowModel().rows.map((r) => r.original);
      const count = rows.length;
      if (count === 0) return null;
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%', px: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" fontWeight={700} color="primary">
            {count} selected
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Button size="small" variant="outlined" startIcon={<EventIcon sx={{ fontSize: 18 }} />} onClick={() => onSetYear(rows)} sx={{ textTransform: 'none', borderRadius: 0.75 }}>
            Set year
          </Button>
          <Button size="small" variant="outlined" startIcon={<LaptopMacIcon sx={{ fontSize: 18 }} />} onClick={() => onMoveSoftware(rows)} sx={{ textTransform: 'none', borderRadius: 0.75 }}>
            Move to Software
          </Button>
          <Button size="small" variant="outlined" startIcon={<BadgeOutlinedIcon sx={{ fontSize: 18 }} />} onClick={() => onMarkStaff(rows)} sx={{ textTransform: 'none', borderRadius: 0.75 }}>
            Mark as staff
          </Button>
          <Button size="small" variant="outlined" color="warning" startIcon={<HistoryEduIcon sx={{ fontSize: 18 }} />} onClick={() => onGraduate(rows)} sx={{ textTransform: 'none', borderRadius: 0.75 }}>
            Graduate
          </Button>
        </Box>
      );
    },

    muiTableBodyRowProps: ({ row }) => ({
      onClick: (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('.MuiCheckbox-root') || target.closest('[data-row-action]')) return;
        onRowClick(row.original);
      },
      sx: { cursor: 'pointer', '&:hover': { bgcolor: 'primary.50' } },
    }),

    muiTableContainerProps: { sx: { maxHeight: 'calc(100vh - 360px)' } },
    muiTablePaperProps: { elevation: 0, sx: { borderRadius: 2, border: '1px solid', borderColor: 'grey.200' } },
    muiTableHeadCellProps: { sx: { bgcolor: 'grey.50', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' } },
    muiTableBodyCellProps: { sx: { py: 0.5, fontSize: 13 } },
    muiSearchTextFieldProps: {
      placeholder: 'Search name, classroom ID, email, or phone...',
      variant: 'outlined',
      size: 'small',
      sx: { minWidth: 340 },
    },
    muiPaginationProps: { rowsPerPageOptions: [25, 50, 100], showFirstButton: true, showLastButton: true },
  });

  return <MaterialReactTable table={table} />;
}
