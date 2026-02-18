'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Switch,
  FormControlLabel,
  IconButton,
  Alert,
  Snackbar,
} from '@neram/ui';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import DataTable from '@/components/DataTable';

interface NotificationPreferences {
  new_onboarding: boolean;
  onboarding_skipped: boolean;
  new_application: boolean;
  payment_received: boolean;
  demo_registration: boolean;
  daily_summary: boolean;
  // Scholarship events
  scholarship_opened: boolean;
  scholarship_submitted: boolean;
  scholarship_approved: boolean;
  scholarship_rejected: boolean;
  scholarship_revision_requested: boolean;
}

interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
  role: string;
  notification_preferences: NotificationPreferences;
  is_active: boolean;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'team_lead', label: 'Team Lead' },
  { value: 'team_member', label: 'Team Member' },
];

const PREFERENCE_LABELS: Record<keyof NotificationPreferences, string> = {
  new_onboarding: 'New Onboarding',
  onboarding_skipped: 'Onboarding Skipped',
  new_application: 'New Application',
  payment_received: 'Payment Received',
  demo_registration: 'Demo Registration',
  daily_summary: 'Daily Summary',
  // Scholarship events
  scholarship_opened: 'Scholarship Opened',
  scholarship_submitted: 'Scholarship Submitted',
  scholarship_approved: 'Scholarship Approved',
  scholarship_rejected: 'Scholarship Rejected',
  scholarship_revision_requested: 'Scholarship Revision',
};

const PREFERENCE_COLORS: Record<keyof NotificationPreferences, 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  new_onboarding: 'success',
  onboarding_skipped: 'warning',
  new_application: 'primary',
  payment_received: 'secondary',
  demo_registration: 'info',
  daily_summary: 'default',
  // Scholarship events
  scholarship_opened: 'info',
  scholarship_submitted: 'primary',
  scholarship_approved: 'success',
  scholarship_rejected: 'error',
  scholarship_revision_requested: 'warning',
};

const defaultPreferences: NotificationPreferences = {
  new_onboarding: true,
  onboarding_skipped: false,
  new_application: true,
  payment_received: true,
  demo_registration: true,
  daily_summary: true,
  // Scholarship events
  scholarship_opened: true,
  scholarship_submitted: true,
  scholarship_approved: true,
  scholarship_rejected: true,
  scholarship_revision_requested: true,
};

const emptyForm = {
  name: '',
  email: '',
  role: 'team_member',
  preferences: { ...defaultPreferences },
};

export default function NotificationRecipientsPage() {
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<NotificationRecipient | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchRecipients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications/recipients');
      const json = await res.json();
      setRecipients(json.data || []);
    } catch (error) {
      console.error('Error fetching recipients:', error);
      setSnackbar({ open: true, message: 'Failed to load recipients', severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecipients();
  }, [fetchRecipients]);

  const handleOpenDialog = (recipient?: NotificationRecipient) => {
    if (recipient) {
      setEditingRecipient(recipient);
      setForm({
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        preferences: {
          ...defaultPreferences,
          ...recipient.notification_preferences,
        },
      });
    } else {
      setEditingRecipient(null);
      setForm(emptyForm);
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingRecipient(null);
    setForm(emptyForm);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      if (editingRecipient) {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          notification_preferences: form.preferences,
        };

        const res = await fetch(`/api/notifications/recipients/${editingRecipient.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to update');
        setSnackbar({ open: true, message: 'Recipient updated successfully', severity: 'success' });
      } else {
        const payload = {
          name: form.name,
          email: form.email,
          role: form.role,
          notification_preferences: form.preferences,
        };

        const res = await fetch('/api/notifications/recipients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to create');
        setSnackbar({ open: true, message: 'Recipient created successfully', severity: 'success' });
      }

      handleCloseDialog();
      fetchRecipients();
    } catch (error) {
      console.error('Error saving recipient:', error);
      setSnackbar({ open: true, message: 'Failed to save recipient', severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Are you sure you want to deactivate this recipient?')) return;

    try {
      const res = await fetch(`/api/notifications/recipients/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to deactivate');
      setSnackbar({ open: true, message: 'Recipient deactivated successfully', severity: 'success' });
      fetchRecipients();
    } catch (error) {
      console.error('Error deactivating recipient:', error);
      setSnackbar({ open: true, message: 'Failed to deactivate recipient', severity: 'error' });
    }
  };

  const columns = [
    { field: 'name', headerName: 'Name', width: 180 },
    { field: 'email', headerName: 'Email', width: 220 },
    {
      field: 'role',
      headerName: 'Role',
      width: 130,
      renderCell: (params: any) => (
        <Chip
          label={
            params.value === 'admin'
              ? 'Admin'
              : params.value === 'team_lead'
              ? 'Team Lead'
              : 'Team Member'
          }
          size="small"
          color={
            params.value === 'admin'
              ? 'error'
              : params.value === 'team_lead'
              ? 'warning'
              : 'default'
          }
          variant="outlined"
        />
      ),
    },
    {
      field: 'is_active',
      headerName: 'Active',
      width: 90,
      renderCell: (params: any) => (
        <Chip
          label={params.value ? 'Active' : 'Inactive'}
          size="small"
          color={params.value ? 'success' : 'default'}
        />
      ),
    },
    {
      field: 'notification_preferences',
      headerName: 'Preferences',
      width: 420,
      renderCell: (params: any) => {
        const prefs = params.value as NotificationPreferences;
        if (!prefs) return '-';
        const activePrefs = (Object.keys(prefs) as Array<keyof NotificationPreferences>).filter(
          (key) => prefs[key]
        );
        return (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', py: 0.5 }}>
            {activePrefs.map((key) => (
              <Chip
                key={key}
                label={PREFERENCE_LABELS[key]}
                size="small"
                color={PREFERENCE_COLORS[key]}
                variant="outlined"
                sx={{ fontSize: '0.65rem', height: 20 }}
              />
            ))}
          </Box>
        );
      },
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 120,
      renderCell: (params: any) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            color="primary"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenDialog(params.row);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          {params.row.is_active && (
            <IconButton
              size="small"
              color="error"
              onClick={(e) => {
                e.stopPropagation();
                handleDeactivate(params.row.id);
              }}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
            Notification Recipients
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage team members who receive notifications
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Recipient
        </Button>
      </Box>

      <DataTable rows={recipients} columns={columns} loading={loading} />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingRecipient ? 'Edit Recipient' : 'Add Recipient'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              fullWidth
              required
            />
            <TextField
              select
              label="Role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              fullWidth
            >
              {ROLES.map((role) => (
                <MenuItem key={role.value} value={role.value}>
                  {role.label}
                </MenuItem>
              ))}
            </TextField>

            <Typography variant="subtitle2" sx={{ mt: 1 }}>
              General Notifications
            </Typography>
            {(['new_onboarding', 'onboarding_skipped', 'new_application', 'payment_received', 'demo_registration', 'daily_summary'] as Array<keyof NotificationPreferences>).map((key) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    checked={form.preferences[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        preferences: { ...form.preferences, [key]: e.target.checked },
                      })
                    }
                  />
                }
                label={PREFERENCE_LABELS[key]}
              />
            ))}

            <Typography variant="subtitle2" sx={{ mt: 2 }}>
              Scholarship Notifications
            </Typography>
            {(['scholarship_opened', 'scholarship_submitted', 'scholarship_approved', 'scholarship_rejected', 'scholarship_revision_requested'] as Array<keyof NotificationPreferences>).map((key) => (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    checked={form.preferences[key]}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        preferences: { ...form.preferences, [key]: e.target.checked },
                      })
                    }
                  />
                }
                label={PREFERENCE_LABELS[key]}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving || !form.name || !form.email}
          >
            {saving ? 'Saving...' : editingRecipient ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          severity={snackbar.severity}
          variant="filled"
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
