'use client';

import {
  Paper,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  CircularProgress,
  TablePagination,
  Typography
} from '@neram/ui';
import { useState } from 'react';

interface Column {
  field: string;
  headerName: string;
  width?: number;
  renderCell?: (params: { row: any; value: any }) => React.ReactNode;
}

interface DataTableProps {
  rows: any[];
  columns: Column[];
  loading?: boolean;
  onRowClick?: (row: any) => void;
  defaultRowsPerPage?: number;
  /** Show the checkbox selection column. Defaults to true (current behaviour). */
  selectable?: boolean;
  /** Controlled selection (row ids). When provided with onSelectedChange the
   *  page owns the selection so a bulk-action toolbar can read it. */
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
}

export default function DataTable({
  rows,
  columns,
  loading = false,
  onRowClick,
  defaultRowsPerPage = 10,
  selectable = true,
  selected: controlledSelected,
  onSelectedChange,
}: DataTableProps) {
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(defaultRowsPerPage);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);

  const isControlled = controlledSelected !== undefined;
  const selected = isControlled ? (controlledSelected as string[]) : internalSelected;
  const updateSelected = (ids: string[]) => {
    if (isControlled) onSelectedChange?.(ids);
    else setInternalSelected(ids);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateSelected(event.target.checked ? rows.map((row) => row.id) : []);
  };

  const handleSelect = (id: string) => {
    updateSelected(
      selected.indexOf(id) === -1 ? [...selected, id] : selected.filter((s) => s !== id)
    );
  };

  const isSelected = (id: string) => selected.indexOf(id) !== -1;

  const paginatedRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading) {
    return (
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <CircularProgress />
        </Box>
      </Paper>
    );
  }

  if (rows.length === 0) {
    return (
      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
          <Typography color="text.secondary">No data available</Typography>
        </Box>
      </Paper>
    );
  }

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 600 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectable && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < rows.length}
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={handleSelectAll}
                  />
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={column.field}
                  style={{ width: column.width, minWidth: column.width }}
                  sx={{ py: 0.75, px: 1, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}
                >
                  {column.headerName}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedRows.map((row) => {
              const isItemSelected = isSelected(row.id);
              return (
                <TableRow
                  hover
                  onClick={() => onRowClick?.(row)}
                  role="checkbox"
                  aria-checked={isItemSelected}
                  tabIndex={-1}
                  key={row.id}
                  selected={isItemSelected}
                  sx={{ cursor: onRowClick ? 'pointer' : 'default' }}
                >
                  {selectable && (
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isItemSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleSelect(row.id)}
                      />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.field} sx={{ py: 0.5, px: 1, fontSize: 13 }}>
                      {column.renderCell
                        ? column.renderCell({ row, value: row[column.field] })
                        : row[column.field]}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={rows.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
      />
    </Paper>
  );
}
