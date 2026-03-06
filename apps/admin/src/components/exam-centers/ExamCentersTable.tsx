'use client';

import { useMemo } from 'react';
import {
  MaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row,
  type MRT_TableOptions,
} from 'material-react-table';
import {
  Box,
  Chip,
  IconButton,
  Tooltip,
  Typography,
  MenuItem,
  Select,
} from '@neram/ui';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import FiberNewIcon from '@mui/icons-material/FiberNew';
import type { NataExamCenter } from '@neram/database';

interface ExamCentersTableProps {
  data: NataExamCenter[];
  loading: boolean;
  onUpdate: (id: string, updates: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string, label: string) => Promise<void>;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: '#4CAF50',
  MEDIUM: '#FF9800',
  LOW: '#F44336',
};

const BoolIcon = ({ value }: { value: boolean }) =>
  value ? (
    <CheckIcon sx={{ color: 'success.main', fontSize: 16 }} />
  ) : (
    <CloseIcon sx={{ color: 'text.disabled', fontSize: 16 }} />
  );

export default function ExamCentersTable({
  data,
  loading,
  onUpdate,
  onDelete,
}: ExamCentersTableProps) {
  const columns = useMemo<MRT_ColumnDef<NataExamCenter>[]>(
    () => [
      {
        accessorKey: 'state',
        header: 'State',
        size: 160,
        enableEditing: true,
      },
      {
        accessorKey: 'city_brochure',
        header: 'City',
        size: 180,
        enableEditing: true,
        Cell: ({ row }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={600}>
              {row.original.city_brochure}
            </Typography>
            {row.original.is_new_2025 && (
              <FiberNewIcon sx={{ color: '#7B1FA2', fontSize: 16 }} />
            )}
          </Box>
        ),
      },
      {
        accessorKey: 'brochure_ref',
        header: 'Ref',
        size: 70,
        enableEditing: true,
      },
      {
        accessorKey: 'confidence',
        header: 'Confidence',
        size: 110,
        filterVariant: 'select',
        filterSelectOptions: ['HIGH', 'MEDIUM', 'LOW'],
        enableEditing: true,
        Edit: ({ cell, column, row, table }) => (
          <Select
            size="small"
            value={cell.getValue<string>()}
            onChange={(e) => {
              row._valuesCache[column.id] = e.target.value;
            }}
            sx={{ minWidth: 90 }}
          >
            <MenuItem value="HIGH">HIGH</MenuItem>
            <MenuItem value="MEDIUM">MEDIUM</MenuItem>
            <MenuItem value="LOW">LOW</MenuItem>
          </Select>
        ),
        Cell: ({ cell }) => {
          const val = cell.getValue<string>();
          return (
            <Chip
              label={val}
              size="small"
              sx={{
                bgcolor: `${CONFIDENCE_COLORS[val] || '#9E9E9E'}14`,
                color: CONFIDENCE_COLORS[val] || '#9E9E9E',
                fontWeight: 600,
                fontSize: 11,
                border: '1px solid',
                borderColor: `${CONFIDENCE_COLORS[val] || '#9E9E9E'}30`,
                height: 24,
              }}
            />
          );
        },
      },
      {
        accessorKey: 'city_population_tier',
        header: 'Tier',
        size: 100,
        filterVariant: 'select',
        filterSelectOptions: ['Metro', 'Tier-1', 'Tier-2', 'Tier-3', 'International'],
        enableEditing: true,
        Edit: ({ cell, column, row }) => (
          <Select
            size="small"
            value={cell.getValue<string>() || ''}
            onChange={(e) => {
              row._valuesCache[column.id] = e.target.value;
            }}
            sx={{ minWidth: 90 }}
          >
            <MenuItem value="">None</MenuItem>
            <MenuItem value="Metro">Metro</MenuItem>
            <MenuItem value="Tier-1">Tier-1</MenuItem>
            <MenuItem value="Tier-2">Tier-2</MenuItem>
            <MenuItem value="Tier-3">Tier-3</MenuItem>
            <MenuItem value="International">International</MenuItem>
          </Select>
        ),
        Cell: ({ cell }) => {
          const val = cell.getValue<string>();
          return val ? (
            <Chip label={val} size="small" variant="outlined" sx={{ height: 22, fontSize: 11 }} />
          ) : (
            <Typography variant="caption" color="text.disabled">—</Typography>
          );
        },
      },
      {
        accessorKey: 'probable_center_1',
        header: 'Primary Center',
        size: 250,
        enableEditing: true,
        Cell: ({ cell }) => (
          <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>
            {cell.getValue<string>() || '—'}
          </Typography>
        ),
      },
      {
        accessorKey: 'center_1_address',
        header: 'Primary Address',
        size: 220,
        enableEditing: true,
        enableHiding: true,
        Cell: ({ cell }) => (
          <Typography variant="caption" noWrap sx={{ maxWidth: 200 }}>
            {cell.getValue<string>() || '—'}
          </Typography>
        ),
      },
      {
        accessorKey: 'center_1_evidence',
        header: 'Evidence',
        size: 180,
        enableEditing: true,
        enableHiding: true,
        Cell: ({ cell }) => (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 170 }}>
            {cell.getValue<string>() || '—'}
          </Typography>
        ),
      },
      {
        accessorKey: 'probable_center_2',
        header: 'Alternate Center',
        size: 200,
        enableEditing: true,
        enableHiding: true,
      },
      {
        accessorKey: 'center_2_address',
        header: 'Alt Address',
        size: 200,
        enableEditing: true,
        enableHiding: true,
      },
      {
        accessorKey: 'center_2_evidence',
        header: 'Alt Evidence',
        size: 180,
        enableEditing: true,
        enableHiding: true,
      },
      {
        accessorKey: 'tcs_ion_confirmed',
        header: 'TCS iON',
        size: 80,
        filterVariant: 'checkbox',
        enableEditing: false,
        Cell: ({ cell }) => <BoolIcon value={cell.getValue<boolean>()} />,
      },
      {
        accessorKey: 'has_barch_college',
        header: 'B.Arch',
        size: 70,
        filterVariant: 'checkbox',
        enableEditing: false,
        Cell: ({ cell }) => <BoolIcon value={cell.getValue<boolean>()} />,
      },
      {
        accessorKey: 'is_new_2025',
        header: 'New',
        size: 60,
        filterVariant: 'checkbox',
        enableEditing: false,
        Cell: ({ cell }) => <BoolIcon value={cell.getValue<boolean>()} />,
      },
      {
        accessorKey: 'was_in_2024',
        header: 'Prev Yr',
        size: 70,
        filterVariant: 'checkbox',
        enableEditing: false,
        Cell: ({ cell }) => <BoolIcon value={cell.getValue<boolean>()} />,
      },
      {
        accessorKey: 'latitude',
        header: 'Lat',
        size: 90,
        enableEditing: true,
        enableHiding: true,
      },
      {
        accessorKey: 'longitude',
        header: 'Lng',
        size: 90,
        enableEditing: true,
        enableHiding: true,
      },
      {
        accessorKey: 'notes',
        header: 'Notes',
        size: 200,
        enableEditing: true,
        Cell: ({ cell }) => (
          <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 190 }}>
            {cell.getValue<string>() || '—'}
          </Typography>
        ),
      },
    ],
    []
  );

  const handleSaveRow: MRT_TableOptions<NataExamCenter>['onEditingRowSave'] = async ({
    exitEditingMode,
    row,
    values,
  }) => {
    // Only send changed fields
    const updates: Record<string, unknown> = {};
    for (const [key, newVal] of Object.entries(values)) {
      const original = row.original[key as keyof NataExamCenter];
      if (String(newVal) !== String(original ?? '')) {
        updates[key] = newVal;
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        await onUpdate(row.original.id, updates);
      } catch {
        // Error is handled in parent
        return;
      }
    }
    exitEditingMode();
  };

  return (
    <MaterialReactTable
      columns={columns}
      data={data}
      // State
      state={{ isLoading: loading }}
      // Features
      enableEditing
      editDisplayMode="row"
      enableColumnFilters
      enableGlobalFilter
      enableSorting
      enableColumnResizing
      enableHiding
      enableDensityToggle={false}
      enableFullScreenToggle={false}
      // Pagination (client-side, ~100-200 rows)
      enablePagination
      initialState={{
        density: 'compact',
        sorting: [{ id: 'state', desc: false }],
        columnVisibility: {
          center_1_address: false,
          center_1_evidence: false,
          center_2_address: false,
          center_2_evidence: false,
          probable_center_2: false,
          latitude: false,
          longitude: false,
          was_in_2024: false,
        },
        pagination: { pageSize: 50, pageIndex: 0 },
      }}
      // Editing
      onEditingRowSave={handleSaveRow}
      onEditingRowCancel={() => {}}
      // Row actions
      enableRowActions
      positionActionsColumn="last"
      renderRowActions={({ row, table }) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Edit row">
            <IconButton size="small" onClick={() => table.setEditingRow(row)}>
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete">
            <IconButton
              size="small"
              color="error"
              onClick={() =>
                onDelete(row.original.id, `${row.original.city_brochure}, ${row.original.state}`)
              }
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      // Styling
      muiTableContainerProps={{
        sx: { maxHeight: 'calc(100vh - 380px)' },
      }}
      muiTableHeadCellProps={{
        sx: {
          fontSize: 12,
          fontWeight: 600,
          py: 1,
          bgcolor: 'grey.50',
        },
      }}
      muiTableBodyCellProps={{
        sx: {
          fontSize: 12,
          py: 0.5,
        },
      }}
      muiTablePaperProps={{
        elevation: 0,
        sx: {
          border: '1px solid',
          borderColor: 'grey.200',
          borderRadius: 1,
        },
      }}
    />
  );
}
