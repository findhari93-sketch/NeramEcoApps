'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Avatar,
} from '@neram/ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import type { UserJourney } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface BulkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  users: UserJourney[];
  onConfirm: (userIds: string[]) => Promise<void>;
}

interface DeletionSummary {
  users: number;
  leadProfiles: number;
  studentProfiles: number;
  demoRegistrations: number;
  payments: number;
  onboardingSessions: number;
  documents: number;
  scholarships: number;
  cashbackClaims: number;
  adminNotes: number;
  profileHistory: number;
}

export default function BulkDeleteDialog({
  open,
  onClose,
  users,
  onConfirm,
}: BulkDeleteDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const userIds = users.map((u) => u.id);
  const expectedText = `DELETE ${users.length}`;
  const isConfirmed = confirmText.trim().toUpperCase() === expectedText;

  useEffect(() => {
    if (open && userIds.length > 0) {
      fetchSummary();
    }
    if (!open) {
      setConfirmText('');
      setError('');
      setSummary(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchSummary = async () => {
    setLoadingSummary(true);
    setError('');
    try {
      const res = await fetch('/api/crm/users/delete-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch deletion summary');
      }
      const data = await res.json();
      setSummary(data.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleConfirm = async () => {
    setDeleting(true);
    setError('');
    try {
      await onConfirm(userIds);
    } catch (err: any) {
      setError(err.message || 'Failed to delete users');
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (!deleting) onClose();
  };

  const summaryItems = summary
    ? [
        { label: 'Applications', count: summary.leadProfiles },
        { label: 'Student Profiles', count: summary.studentProfiles },
        { label: 'Demo Registrations', count: summary.demoRegistrations },
        { label: 'Payments', count: summary.payments, warn: true },
        { label: 'Onboarding Sessions', count: summary.onboardingSessions },
        { label: 'Documents', count: summary.documents },
        { label: 'Scholarships', count: summary.scholarships },
        { label: 'Cashback Claims', count: summary.cashbackClaims },
        { label: 'Admin Notes', count: summary.adminNotes },
        { label: 'Profile History', count: summary.profileHistory },
      ].filter((item) => item.count > 0)
    : [];

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <WarningAmberIcon color="error" />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Delete {users.length} User{users.length > 1 ? 's' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            This action is permanent and cannot be undone
          </Typography>
        </Box>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Alert severity="warning" sx={{ mb: 2 }}>
          All related data will be permanently deleted from the database.
        </Alert>

        {/* Deletion summary */}
        {loadingSummary && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={28} />
          </Box>
        )}

        {summaryItems.length > 0 && (
          <Box sx={{ mb: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1.5 }}>
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Related Data to be Deleted:
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75, mt: 1 }}>
              {summaryItems.map((item) => (
                <Typography
                  key={item.label}
                  variant="caption"
                  color={item.warn ? 'error.main' : 'text.secondary'}
                  sx={{ fontWeight: item.warn ? 600 : 400 }}
                >
                  {item.count} {item.label}
                </Typography>
              ))}
            </Box>
          </Box>
        )}

        {/* User list */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Users to Delete:
        </Typography>
        <Box
          sx={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 1.5,
            mb: 2,
          }}
        >
          {users.map((user, idx) => {
            const stageConfig = PIPELINE_STAGE_CONFIG[user.pipeline_stage];
            return (
              <Box
                key={user.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.25,
                  borderBottom: idx < users.length - 1 ? '1px solid' : 'none',
                  borderColor: 'grey.100',
                }}
              >
                <Avatar
                  src={user.avatar_url || undefined}
                  sx={{ width: 32, height: 32, fontSize: 13 }}
                >
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>
                    {user.name || 'Unnamed User'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {user.email || user.phone || 'No contact'}
                  </Typography>
                </Box>
                <Chip
                  label={stageConfig?.label || user.pipeline_stage}
                  size="small"
                  sx={{
                    fontSize: 10,
                    height: 22,
                    bgcolor: `${stageConfig?.color || '#9E9E9E'}14`,
                    color: stageConfig?.color || '#9E9E9E',
                    fontWeight: 600,
                  }}
                />
              </Box>
            );
          })}
        </Box>

        {/* Confirmation input */}
        <Typography variant="body2" sx={{ mb: 1 }}>
          Type <strong>{expectedText}</strong> to confirm:
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder={expectedText}
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={deleting}
          autoFocus
          sx={{
            '& .MuiOutlinedInput-root': {
              fontFamily: 'monospace',
              fontSize: 14,
            },
          }}
        />
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button
          onClick={handleClose}
          disabled={deleting}
          sx={{ textTransform: 'none' }}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          onClick={handleConfirm}
          disabled={!isConfirmed || deleting || loadingSummary}
          startIcon={
            deleting ? <CircularProgress size={16} color="inherit" /> : undefined
          }
          sx={{ textTransform: 'none', minWidth: 140 }}
        >
          {deleting ? 'Deleting...' : 'Delete Permanently'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
