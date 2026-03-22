'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@neram/ui';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

interface BulkApproveBarProps {
  selectedCount: number;
  onApprove: () => Promise<void>;
  onClear: () => void;
}

export default function BulkApproveBar({ selectedCount, onApprove, onClear }: BulkApproveBarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);

  if (selectedCount === 0) return null;

  const handleConfirmApprove = async () => {
    setApproving(true);
    try {
      await onApprove();
    } finally {
      setApproving(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Box
        sx={{
          position: 'fixed',
          bottom: { xs: 56, md: 0 },
          left: 0,
          right: 0,
          bgcolor: 'background.paper',
          borderTop: '1px solid',
          borderColor: 'divider',
          px: { xs: 2, sm: 3 },
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          zIndex: 1200,
          boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {selectedCount} video{selectedCount > 1 ? 's' : ''} selected
          </Typography>
          <Button
            size="small"
            onClick={onClear}
            sx={{ textTransform: 'none', fontSize: '0.75rem' }}
          >
            Clear
          </Button>
        </Box>
        <Button
          variant="contained"
          color="success"
          size="small"
          startIcon={<CheckCircleOutlineIcon sx={{ fontSize: '1rem !important' }} />}
          onClick={() => setConfirmOpen(true)}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            borderRadius: 2,
            px: 2.5,
          }}
        >
          Approve All
        </Button>
      </Box>

      <Dialog open={confirmOpen} onClose={() => !approving && setConfirmOpen(false)}>
        <DialogTitle sx={{ fontWeight: 700 }}>Confirm Bulk Approve</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Are you sure you want to approve {selectedCount} video{selectedCount > 1 ? 's' : ''}?
            They will be published and visible to students.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmOpen(false)}
            disabled={approving}
            sx={{ textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleConfirmApprove}
            disabled={approving}
            startIcon={approving ? <CircularProgress size={16} /> : undefined}
            sx={{ textTransform: 'none', fontWeight: 600 }}
          >
            {approving ? 'Approving...' : 'Approve'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
