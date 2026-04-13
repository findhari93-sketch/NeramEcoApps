'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Stack, Paper, Button, CircularProgress, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, Alert, IconButton, Tooltip,
} from '@mui/material';
import { DataGrid, GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AddIcon from '@mui/icons-material/Add';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

interface CollegeOption {
  id: string;
  name: string;
}

interface AccountRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  designation: string | null;
  role: string;
  is_active: boolean;
  college_name: string;
  college_slug: string;
  invited_at: string | null;
  created_at: string;
}

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'admin', label: 'Admin' },
  { value: 'admission_officer', label: 'Admission Officer' },
];

export default function CollegeAccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [colleges, setColleges] = useState<CollegeOption[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);

  // Form state
  const [form, setForm] = useState({
    college_id: '',
    name: '',
    email: '',
    phone: '',
    designation: '',
    role: 'admin',
  });

  const loadAccounts = useCallback(() => {
    setLoading(true);
    fetch('/api/college-hub/accounts')
      .then((r) => r.json())
      .then((j) => setRows(j.data ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const loadColleges = useCallback(() => {
    fetch('/api/college-hub/colleges?limit=500')
      .then((r) => r.json())
      .then((j) => setColleges((j.data ?? []).map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))))
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadAccounts();
    loadColleges();
  }, [loadAccounts, loadColleges]);

  const handleCreate = async () => {
    if (!form.college_id || !form.name || !form.email || !form.role) {
      setErrorMsg('College, Name, Email, and Role are required.');
      return;
    }
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/college-hub/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setCreatedCredentials({ email: form.email, password: json.temp_password });
      setSuccessMsg(json.message);
      setOpen(false);
      setForm({ college_id: '', name: '', email: '', phone: '', designation: '', role: 'admin' });
      loadAccounts();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (id: string, current: boolean) => {
    await fetch('/api/college-hub/accounts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_active: !current }),
    });
    loadAccounts();
  };

  const columns: GridColDef[] = [
    { field: 'name', headerName: 'Name', width: 150 },
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 200 },
    { field: 'college_name', headerName: 'College', flex: 1, minWidth: 180 },
    {
      field: 'role', headerName: 'Role', width: 140,
      renderCell: (p: GridRenderCellParams) => (
        <Chip label={(p.value as string).replace('_', ' ')} size="small" variant="outlined" />
      ),
    },
    { field: 'designation', headerName: 'Designation', width: 140 },
    { field: 'phone', headerName: 'Phone', width: 130 },
    {
      field: 'is_active',
      headerName: 'Status',
      width: 100,
      renderCell: (p: GridRenderCellParams) => (
        <Chip
          label={p.value ? 'Active' : 'Inactive'}
          size="small"
          color={p.value ? 'success' : 'default'}
          onClick={() => toggleActive(p.row.id as string, p.value as boolean)}
          sx={{ cursor: 'pointer' }}
        />
      ),
    },
    {
      field: 'invited_at',
      headerName: 'Invited',
      width: 110,
      renderCell: (p: GridRenderCellParams) =>
        p.value ? new Date(p.value as string).toLocaleDateString('en-IN') : 'N/A',
    },
  ];

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box
            sx={{
              width: 42, height: 42, bgcolor: '#7c3aed',
              borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <ManageAccountsIcon sx={{ color: 'white' }} />
          </Box>
          <Typography variant="h5" fontWeight={700}>
            College Accounts ({rows.length})
          </Typography>
        </Stack>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpen(true)}
          sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
        >
          Create Account
        </Button>
      </Stack>

      {successMsg && (
        <Alert severity="success" onClose={() => setSuccessMsg('')} sx={{ mb: 2 }}>
          {successMsg}
        </Alert>
      )}

      {createdCredentials && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          onClose={() => setCreatedCredentials(null)}
          action={
            <Tooltip title="Copy credentials">
              <IconButton
                size="small"
                onClick={() =>
                  navigator.clipboard.writeText(
                    `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`
                  )
                }
              >
                <ContentCopyIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          }
        >
          <Typography variant="body2" fontWeight={600}>Temporary login credentials (share with college):</Typography>
          <Typography variant="body2">Email: {createdCredentials.email}</Typography>
          <Typography variant="body2">Password: {createdCredentials.password}</Typography>
        </Alert>
      )}

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

      {/* Create Account Dialog */}
      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create College Account</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 1 }}>
            {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
            <TextField
              select
              label="College *"
              value={form.college_id}
              onChange={(e) => setForm((f) => ({ ...f, college_id: e.target.value }))}
              fullWidth
              size="small"
            >
              {colleges.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Contact Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              fullWidth
              size="small"
            />
            <TextField
              label="Email Address *"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              fullWidth
              size="small"
              type="email"
              helperText="This will be the login email for the college dashboard"
            />
            <TextField
              label="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              fullWidth
              size="small"
              inputProps={{ inputMode: 'tel' }}
            />
            <TextField
              label="Designation"
              value={form.designation}
              onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              fullWidth
              size="small"
              placeholder="e.g. Admissions Head, Principal"
            />
            <TextField
              select
              label="Role *"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              fullWidth
              size="small"
            >
              {ROLES.map((r) => (
                <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>
              ))}
            </TextField>
            <Alert severity="info" sx={{ py: 0.5 }}>
              A temporary password will be generated. Share it with the college contact so they can log in at neramclasses.com/college-dashboard/.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={saving}
            sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' } }}
          >
            {saving ? <CircularProgress size={16} /> : 'Create Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
