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
  MenuItem,
  Button,
  Alert,
  CircularProgress,
  UserAvatar,
  Divider,
} from '@neram/ui';
import useMediaQuery from '@mui/material/useMediaQuery';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';

export interface MarkStaffPerson {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url?: string | null;
}

type StaffRole = 'teacher' | 'admin';

interface MarkStaffDialogProps {
  open: boolean;
  people: MarkStaffPerson[];
  onClose: () => void;
  /** Calls the set-role API with the chosen staff role. */
  onConfirm: (role: StaffRole) => Promise<void>;
}

const ROLE_OPTIONS: { value: StaffRole; label: string; hint: string }[] = [
  { value: 'teacher', label: 'Teacher (staff)', hint: 'Nexus teaching access. Cannot open the admin dashboard.' },
  { value: 'admin', label: 'Admin', hint: 'Full access, including this admin dashboard. Use sparingly.' },
];

/**
 * Reclassify people who were mis-tagged as students (e.g. staff swept in by the
 * Entra sync, which defaults imports to user_type='student') into a staff role.
 * Removes them from the Students list and grants the matching Nexus role.
 */
export default function MarkStaffDialog({ open, people, onClose, onConfirm }: MarkStaffDialogProps) {
  const fullScreen = useMediaQuery('(max-width:599px)');
  const [role, setRole] = useState<StaffRole>('teacher');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setRole('teacher');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const count = people.length;
  const canConfirm = count > 0 && !submitting;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(role);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to update role');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      maxWidth="sm"
      fullWidth
      fullScreen={fullScreen}
      PaperProps={{ sx: { borderRadius: { xs: 0, sm: 1.5 } } }}
    >
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
        <BadgeOutlinedIcon sx={{ color: '#B45309' }} />
        <Box>
          <Typography variant="h6" fontWeight={700}>
            Mark as staff
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Removes them from the Students list and gives staff access in Nexus.
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
          {count === 1 ? 'This person is' : `These ${count} people are`} not an exam student. Marking{' '}
          {count === 1 ? 'them' : 'them'} as staff sets their account type, so they leave the Students list and get the
          matching role in Nexus. To undo, change their role back from the database.
        </Alert>

        {/* Selected people */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Selected ({count})
        </Typography>
        <Box sx={{ maxHeight: 200, overflowY: 'auto', border: '1px solid', borderColor: 'grey.200', borderRadius: 0.75, mb: 2 }}>
          {people.map((p, idx) => (
            <Box
              key={p.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderBottom: idx < people.length - 1 ? '1px solid' : 'none',
                borderColor: 'grey.100',
              }}
            >
              <UserAvatar src={p.avatar_url} name={p.name} size={28} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={500} noWrap>
                  {p.name || 'Unnamed'}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {p.email || 'No email'}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Role */}
        <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
          Staff role
        </Typography>
        <TextField
          select
          fullWidth
          size="small"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRole)}
          disabled={submitting}
          helperText={ROLE_OPTIONS.find((o) => o.value === role)?.hint}
        >
          {ROLE_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>

      <Divider />
      <DialogActions sx={{ p: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={submitting} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="warning"
          onClick={handleConfirm}
          disabled={!canConfirm}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <BadgeOutlinedIcon sx={{ fontSize: 18 }} />}
          sx={{ textTransform: 'none', minWidth: 180 }}
        >
          {submitting ? 'Saving...' : count === 1 ? 'Mark as staff' : `Mark ${count} as staff`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
