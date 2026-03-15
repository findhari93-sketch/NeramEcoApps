'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Checkbox,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@neram/ui';

interface Student {
  enrollmentId: string;
  userId: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  currentBatch: { id: string; name: string } | null;
}

interface Batch {
  id: string;
  name: string;
}

interface BatchAssignDialogProps {
  open: boolean;
  onClose: () => void;
  students: Student[];
  batches: Batch[];
  onAssign: (enrollmentIds: string[], batchId: string | null) => Promise<void>;
}

export default function BatchAssignDialog({
  open,
  onClose,
  students,
  batches,
  onAssign,
}: BatchAssignDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetBatchId, setTargetBatchId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const toggleStudent = (enrollmentId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(enrollmentId)) next.delete(enrollmentId);
      else next.add(enrollmentId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === students.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(students.map((s) => s.enrollmentId)));
    }
  };

  const handleAssign = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      await onAssign(
        Array.from(selected),
        targetBatchId === 'unassigned' ? null : targetBatchId || null
      );
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          mx: { xs: 1 },
          width: { xs: 'calc(100% - 16px)' },
          maxHeight: { xs: '90vh' },
        },
      }}
    >
      <DialogTitle>Assign Students to Batch</DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 } }}>
        <FormControl fullWidth size="small" sx={{ mb: 2, mt: 1 }}>
          <InputLabel>Target Batch</InputLabel>
          <Select
            value={targetBatchId}
            label="Target Batch"
            onChange={(e) => setTargetBatchId(e.target.value)}
          >
            <MenuItem value="unassigned">
              <em>Unassigned</em>
            </MenuItem>
            {batches.map((b) => (
              <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {selected.size} of {students.length} selected
          </Typography>
          <Button size="small" onClick={toggleAll}>
            {selected.size === students.length ? 'Deselect All' : 'Select All'}
          </Button>
        </Box>

        <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
          {students.map((student) => (
            <ListItem
              key={student.enrollmentId}
              onClick={() => toggleStudent(student.enrollmentId)}
              sx={{
                cursor: 'pointer',
                borderRadius: 1,
                mb: 0.5,
                minHeight: 48,
                '&:hover': { backgroundColor: 'action.hover' },
              }}
              secondaryAction={
                student.currentBatch && (
                  <Typography variant="caption" color="text.secondary">
                    {student.currentBatch.name}
                  </Typography>
                )
              }
            >
              <Checkbox
                checked={selected.has(student.enrollmentId)}
                sx={{ mr: 1 }}
              />
              <ListItemAvatar>
                <Avatar src={student.avatar_url || undefined} sx={{ width: 36, height: 36 }}>
                  {getInitials(student.name)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={student.name}
                primaryTypographyProps={{ noWrap: true, variant: 'body2' }}
              />
            </ListItem>
          ))}
        </List>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleAssign}
          disabled={selected.size === 0 || !targetBatchId || submitting}
        >
          {submitting ? 'Assigning...' : `Assign ${selected.size} Student${selected.size !== 1 ? 's' : ''}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
