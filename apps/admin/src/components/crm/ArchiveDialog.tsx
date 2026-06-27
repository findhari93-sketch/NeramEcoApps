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
  UserAvatar,
} from '@neram/ui';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import type { UserJourney } from '@neram/database';
import { PIPELINE_STAGE_CONFIG } from '@neram/database';

interface ArchiveDialogProps {
  open: boolean;
  onClose: () => void;
  users: UserJourney[];
  onConfirm: (userIds: string[], reason: string) => Promise<void>;
}

/**
 * Reversible archive confirmation. Unlike BulkDeleteDialog this is
 * non-destructive: archived users stay in the database, keep their login,
 * and can be restored anytime. No "type DELETE" gate, just a reason.
 */
export default function ArchiveDialog({
  open,
  onClose,
  users,
  onConfirm,
}: ArchiveDialogProps) {
  const [reason, setReason] = useState('Past batch, de-prioritized');
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState('');

  const userIds = users.map((u) => u.id);
  const isBulk = users.length > 1;

  useEffect(() => {
    if (!open) {
      setReason('Past batch, de-prioritized');
      setError('');
    }
  }, [open]);

  const handleConfirm = async () => {
    setArchiving(true);
    setError('');
    try {
      await onConfirm(userIds, reason.trim() || 'Archived from CRM');
    } catch (err: any) {
      setError(err.message || 'Failed to archive');
    } finally {
      setArchiving(false);
    }
  };

  const handleClose = () => {
    if (!archiving) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { borderRadius: 1.5 } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <Inventory2OutlinedIcon sx={{ color: 'primary.main' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Archive {users.length} User{isBulk ? 's' : ''}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Reversible. They stay in the database and can be restored anytime.
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

        <Alert severity="info" sx={{ mb: 2 }}>
          Archiving moves {isBulk ? 'these users' : 'this user'} out of the active
          view so you can focus on current cohorts. It does <strong>not</strong> delete
          their data and does <strong>not</strong> disable their login, a returning
          student can still sign in and you can restore them from the Archived view.
        </Alert>

        {/* User list */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Users to Archive:
        </Typography>
        <Box
          sx={{
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid',
            borderColor: 'grey.200',
            borderRadius: 0.75,
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
                <UserAvatar src={user.avatar_url} name={user.name} size={32} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={500} noWrap>
                    {user.name || 'Unnamed User'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {user.email || user.phone || 'No contact'}
                    {user.academic_year ? ` · ${user.academic_year}` : ''}
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

        {/* Reason */}
        <Typography variant="body2" sx={{ mb: 1 }}>
          Reason (optional):
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="e.g. Completed 2025-26 exam cycle"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={archiving}
          autoFocus
        />
      </DialogContent>

      <Divider />

      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={archiving} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={archiving}
          startIcon={
            archiving ? <CircularProgress size={16} color="inherit" /> : <Inventory2OutlinedIcon sx={{ fontSize: 18 }} />
          }
          sx={{ textTransform: 'none', minWidth: 140 }}
        >
          {archiving ? 'Archiving...' : `Archive ${users.length > 1 ? users.length : ''}`.trim()}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
