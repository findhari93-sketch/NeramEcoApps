'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
} from '@neram/ui';
import { useNexusAuthContext } from '@/hooks/useNexusAuth';

interface BroadcastDialogProps {
  open: boolean;
  onClose: () => void;
  classroomId: string;
  examType?: string;
}

const BROADCAST_TYPES = [
  { value: 'scorecard_released', label: 'Scorecard Released' },
];

export default function BroadcastDialog({ open, onClose, classroomId, examType }: BroadcastDialogProps) {
  const { getToken } = useNexusAuthContext();
  const [selectedExamType, setSelectedExamType] = useState(examType || 'jee');
  const [broadcastType, setBroadcastType] = useState('scorecard_released');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/documents/exam-broadcasts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          classroom_id: classroomId,
          exam_type: selectedExamType,
          broadcast_type: broadcastType,
          message: message || null,
        }),
      });

      if (res.ok) {
        setSnackbar({ open: true, message: 'Broadcast sent successfully!', severity: 'success' });
        setMessage('');
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to send broadcast');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to send broadcast';
      setSnackbar({ open: true, message: errorMsg, severity: 'error' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>
          Broadcast Notification
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Notify all students in this classroom about exam updates.
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Exam Type</InputLabel>
              <Select
                value={selectedExamType}
                label="Exam Type"
                onChange={(e) => setSelectedExamType(e.target.value)}
              >
                <MenuItem value="nata">NATA</MenuItem>
                <MenuItem value="jee">JEE</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>Broadcast Type</InputLabel>
              <Select
                value={broadcastType}
                label="Broadcast Type"
                onChange={(e) => setBroadcastType(e.target.value)}
              >
                {BROADCAST_TYPES.map((bt) => (
                  <MenuItem key={bt.value} value={bt.value}>
                    {bt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Message (optional)"
              size="small"
              fullWidth
              multiline
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a custom message for students..."
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={onClose}
            sx={{ textTransform: 'none', minHeight: 48, minWidth: 80 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting}
            sx={{ textTransform: 'none', minHeight: 48, minWidth: 100, fontWeight: 600 }}
          >
            {submitting ? 'Sending...' : 'Send Broadcast'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={snackbar.severity}
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}
