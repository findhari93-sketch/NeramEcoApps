'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, TextField, Chip, CircularProgress,
  Select, MenuItem, FormControl, InputLabel, Button, Dialog,
  DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';

const TIER_OPTIONS = ['free', 'silver', 'gold', 'platinum'];

const TIER_COLORS: Record<string, string> = {
  free: '#64748b',
  silver: '#64748b',
  gold: '#d97706',
  platinum: '#7c3aed',
};

export default function AdminCollegesPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editRow, setEditRow] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/colleges')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = rows.filter(
    (r) => !search || (r.name as string).toLowerCase().includes(search.toLowerCase())
  );

  const saveTier = async () => {
    if (!editRow) return;
    setSaving(true);
    await fetch('/api/college-hub/colleges', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editRow.id, neram_tier: editRow.neram_tier }),
    });
    setSaving(false);
    setEditRow(null);
    load();
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'College', flex: 2, minWidth: 200 },
    { field: 'city', headerName: 'City', width: 120 },
    { field: 'type', headerName: 'Type', width: 120 },
    {
      field: 'neram_tier',
      headerName: 'Tier',
      width: 100,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ?? 'free'}
          size="small"
          sx={{
            bgcolor: TIER_COLORS[params.value as string] ?? '#64748b',
            color: 'white',
            fontWeight: 600,
            fontSize: '0.7rem',
          }}
        />
      ),
    },
    { field: 'arch_index_score', headerName: 'ArchIndex', width: 100, type: 'number' },
    { field: 'nirf_rank_architecture', headerName: 'NIRF', width: 80, type: 'number' },
    {
      field: 'verified',
      headerName: 'Verified',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Chip
          label={params.value ? 'Yes' : 'No'}
          size="small"
          color={params.value ? 'success' : 'default'}
        />
      ),
    },
    { field: 'data_completeness', headerName: 'Data %', width: 80, type: 'number' },
    {
      field: 'actions',
      headerName: '',
      width: 90,
      renderCell: (params: GridRenderCellParams) => (
        <Button
          size="small"
          onClick={() => setEditRow(params.row as Record<string, unknown>)}
        >
          Edit Tier
        </Button>
      ),
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 3 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            bgcolor: '#2563eb',
            borderRadius: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LeaderboardIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h5" fontWeight={700}>
          Colleges ({rows.length})
        </Typography>
      </Stack>

      <TextField
        placeholder="Search colleges..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        size="small"
        sx={{ mb: 2, width: 300 }}
      />

      <Paper variant="outlined" sx={{ height: 600 }}>
        <DataGrid
          rows={filtered}
          columns={columns}
          loading={loading}
          pageSizeOptions={[25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          density="compact"
        />
      </Paper>

      {/* Edit Tier Dialog */}
      <Dialog open={!!editRow} onClose={() => setEditRow(null)}>
        <DialogTitle>Edit Tier: {editRow?.name as string}</DialogTitle>
        <DialogContent>
          <FormControl fullWidth size="small" sx={{ mt: 1 }}>
            <InputLabel>Neram Tier</InputLabel>
            <Select
              label="Neram Tier"
              value={(editRow?.neram_tier as string) ?? 'free'}
              onChange={(e) =>
                setEditRow((prev) =>
                  prev ? { ...prev, neram_tier: e.target.value } : null
                )
              }
            >
              {TIER_OPTIONS.map((t) => (
                <MenuItem key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditRow(null)}>Cancel</Button>
          <Button variant="contained" onClick={saveTier} disabled={saving}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
