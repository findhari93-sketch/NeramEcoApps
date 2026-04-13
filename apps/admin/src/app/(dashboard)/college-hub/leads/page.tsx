'use client';

import { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Stack, Paper, CircularProgress, Chip } from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import PeopleIcon from '@mui/icons-material/People';

export default function CollegeLeadsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch('/api/college-hub/leads')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    { field: 'college_name', headerName: 'College', flex: 1, minWidth: 180 },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'nata_score', headerName: 'NATA', width: 90, type: 'number' },
    {
      field: 'status',
      headerName: 'Status',
      width: 110,
      renderCell: (p: GridRenderCellParams) => (
        <Chip
          label={p.value as string}
          size="small"
          color={p.value === 'new' ? 'warning' : 'default'}
        />
      ),
    },
    {
      field: 'created_at',
      headerName: 'Date',
      width: 120,
      renderCell: (p: GridRenderCellParams) =>
        new Date(p.value as string).toLocaleDateString('en-IN'),
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: '#16a34a',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PeopleIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          College Hub Leads ({rows.length})
        </Typography>
      </Stack>

      {loading && <CircularProgress />}

      {!loading && (
        <Paper variant="outlined" sx={{ height: 600 }}>
          <DataGrid
            rows={rows}
            columns={columns}
            loading={loading}
            density="compact"
            pageSizeOptions={[25, 50]}
            initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          />
        </Paper>
      )}
    </Box>
  );
}
