'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@neram/ui';

interface SwapRequest {
  id: string;
  device_category: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
}

interface DeviceSwapDialogProps {
  open: boolean;
  onClose: () => void;
  getToken: () => Promise<string | null>;
  hasDesktop: boolean;
  hasMobile: boolean;
  onSwapRequested: () => void;
}

export default function DeviceSwapDialog({
  open,
  onClose,
  getToken,
  hasDesktop,
  hasMobile,
  onSwapRequested,
}: DeviceSwapDialogProps) {
  const [category, setCategory] = useState<'desktop' | 'mobile'>('desktop');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [swapRequests, setSwapRequests] = useState<SwapRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);

  // Set default category based on what's registered
  useEffect(() => {
    if (open) {
      if (hasDesktop && !hasMobile) setCategory('desktop');
      else if (hasMobile && !hasDesktop) setCategory('mobile');
      setReason('');
      setError(null);
      setSuccess(false);
    }
  }, [open, hasDesktop, hasMobile]);

  // Fetch existing swap requests
  useEffect(() => {
    if (!open) return;
    async function fetchRequests() {
      setLoadingRequests(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch('/api/devices/swap-request', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSwapRequests(data.requests || []);
        }
      } catch {
        // Ignore
      } finally {
        setLoadingRequests(false);
      }
    }
    fetchRequests();
  }, [open, getToken]);

  const pendingRequest = swapRequests.find(r => r.status === 'pending');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please provide a reason for the device swap.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        setError('Authentication failed. Please try again.');
        return;
      }

      const res = await fetch('/api/devices/swap-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceCategory: category, reason: reason.trim() }),
      });

      if (res.ok) {
        setSuccess(true);
        onSwapRequested();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit swap request.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColor = (status: string) => {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'error';
    return 'warning';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Request Device Change</DialogTitle>
      <DialogContent>
        {success ? (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="h6" color="success.main" sx={{ mb: 1 }}>
              Request Submitted
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Your device swap request has been sent to your teacher for approval.
              You&apos;ll be able to register a new device once approved.
            </Typography>
          </Box>
        ) : pendingRequest ? (
          <Box sx={{ py: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              You already have a pending swap request:
            </Typography>
            <Box
              sx={{
                p: 2,
                borderRadius: 2,
                border: '1px solid',
                borderColor: 'warning.light',
                bgcolor: 'warning.50',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                  {pendingRequest.device_category}
                </Typography>
                <Chip label="Pending" color="warning" size="small" sx={{ height: 20, fontSize: 11 }} />
              </Box>
              <Typography variant="caption" color="text.secondary">
                {pendingRequest.reason}
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select the device category you want to change and provide a reason.
              Your teacher will review and approve the request.
            </Typography>

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Device Category</InputLabel>
              <Select
                value={category}
                label="Device Category"
                onChange={(e) => setCategory(e.target.value as 'desktop' | 'mobile')}
              >
                {hasDesktop && <MenuItem value="desktop">Desktop / Laptop</MenuItem>}
                {hasMobile && <MenuItem value="mobile">Mobile Phone</MenuItem>}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              multiline
              rows={3}
              label="Reason for device change"
              placeholder="e.g., I got a new phone, my laptop was repaired..."
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              helperText={`${reason.length}/500`}
              error={!!error}
            />

            {error && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                {error}
              </Typography>
            )}
          </Box>
        )}

        {/* Recent swap history */}
        {!loadingRequests && swapRequests.length > 0 && !success && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, mb: 1, display: 'block' }}>
              Recent Requests
            </Typography>
            {swapRequests.slice(0, 5).map((req) => (
              <Box
                key={req.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  py: 0.5,
                }}
              >
                <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                  {req.device_category} — {new Date(req.created_at).toLocaleDateString()}
                </Typography>
                <Chip
                  label={req.status}
                  color={statusColor(req.status) as any}
                  size="small"
                  sx={{ height: 18, fontSize: 10, textTransform: 'capitalize' }}
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          {success ? 'Close' : 'Cancel'}
        </Button>
        {!success && !pendingRequest && (
          <Button
            onClick={handleSubmit}
            variant="contained"
            disabled={submitting || (!hasDesktop && !hasMobile)}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            Submit Request
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
