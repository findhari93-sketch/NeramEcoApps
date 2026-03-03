'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Alert,
  CircularProgress,
} from '@neram/ui';
import type { UserJourneyDetail, RefundRequest } from '@neram/database';

interface RefundSectionProps {
  detail: UserJourneyDetail;
  adminId: string;
  onStatusChange?: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  pending: { color: '#F57C00', bgColor: '#F57C0014', label: 'Pending' },
  approved: { color: '#2E7D32', bgColor: '#2E7D3214', label: 'Approved' },
  rejected: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'Rejected' },
};

export default function RefundSection({ detail, adminId, onStatusChange }: RefundSectionProps) {
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Action dialogs
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [actionTarget, setActionTarget] = useState<RefundRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Expanded reason view
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const leadProfileId = detail.leadProfile?.id;

  useEffect(() => {
    if (!leadProfileId) {
      setLoading(false);
      return;
    }

    async function fetchRefundRequests() {
      try {
        const res = await fetch(`/api/crm/users/${leadProfileId}/refund-requests`);
        if (res.ok) {
          const data = await res.json();
          setRefundRequests(data.refundRequests || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }

    fetchRefundRequests();
  }, [leadProfileId]);

  const handleAction = async () => {
    if (!actionTarget || !actionType) return;

    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/refund/${actionTarget.id}/${actionType}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          adminNotes: adminNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${actionType} refund request`);
      }

      const data = await res.json();

      // Update local state
      setRefundRequests((prev) =>
        prev.map((r) => (r.id === actionTarget.id ? data.refundRequest : r))
      );

      setActionType(null);
      setActionTarget(null);
      setAdminNotes('');
      onStatusChange?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setActionLoading(false);
    }
  };

  // Don't render if no refund requests and not loading
  if (!loading && refundRequests.length === 0) return null;

  return (
    <Paper
      elevation={0}
      sx={{ mb: 2, border: '1px solid', borderColor: 'grey.200', borderRadius: 1, overflow: 'hidden' }}
    >
      <Box
        sx={{
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'grey.100',
          bgcolor: '#FFF3E0',
        }}
      >
        <Typography sx={{ fontSize: 18 }}>💰</Typography>
        <Typography variant="subtitle1" fontWeight={700}>Refund Requests</Typography>
        <Chip
          label={`${refundRequests.length} request${refundRequests.length !== 1 ? 's' : ''}`}
          size="small"
          sx={{ height: 20, fontSize: 10, fontWeight: 700, bgcolor: '#FFE0B2', color: '#E65100', borderRadius: 1, ml: 'auto' }}
        />
      </Box>

      <Box sx={{ p: 1.5 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <TableContainer sx={{ borderRadius: 1, border: '1px solid', borderColor: 'grey.200', overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Date</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Payment</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Refund (70%)</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Fee (30%)</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'text.secondary', py: 1.25 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {refundRequests.map((rr) => {
                  const config = STATUS_CONFIG[rr.status] || STATUS_CONFIG.pending;
                  const isExpanded = expandedId === rr.id;

                  return (
                    <>
                      <TableRow
                        key={rr.id}
                        sx={{
                          '&:hover': { bgcolor: 'action.hover' },
                          cursor: 'pointer',
                        }}
                        onClick={() => setExpandedId(isExpanded ? null : rr.id)}
                      >
                        <TableCell sx={{ fontSize: 12.5, py: 1.25 }}>{formatDate(rr.created_at)}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5, py: 1.25 }}>
                          {formatCurrency(Number(rr.payment_amount))}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5, py: 1.25, color: 'success.dark' }}>
                          {formatCurrency(Number(rr.refund_amount))}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: 12.5, py: 1.25, color: 'error.main' }}>
                          {formatCurrency(Number(rr.processing_fee))}
                        </TableCell>
                        <TableCell sx={{ py: 1.25 }}>
                          <Chip
                            label={config.label}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 10,
                              fontWeight: 700,
                              bgcolor: config.bgColor,
                              color: config.color,
                              borderRadius: 1,
                              border: `1px solid ${config.color}30`,
                            }}
                          />
                        </TableCell>
                        <TableCell sx={{ py: 1.25 }}>
                          {rr.status === 'pending' && (
                            <Box sx={{ display: 'flex', gap: 0.75 }}>
                              <Button
                                size="small"
                                variant="contained"
                                color="success"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionTarget(rr);
                                  setActionType('approve');
                                  setAdminNotes('');
                                  setActionError(null);
                                }}
                                sx={{ fontSize: 10.5, fontWeight: 700, minWidth: 0, px: 1.5, py: 0.5, height: 26 }}
                              >
                                Approve
                              </Button>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionTarget(rr);
                                  setActionType('reject');
                                  setAdminNotes('');
                                  setActionError(null);
                                }}
                                sx={{ fontSize: 10.5, fontWeight: 700, minWidth: 0, px: 1.5, py: 0.5, height: 26 }}
                              >
                                Reject
                              </Button>
                            </Box>
                          )}
                          {rr.status !== 'pending' && (
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                              {rr.reviewed_at ? formatDate(rr.reviewed_at) : '--'}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded details row */}
                      {isExpanded && (
                        <TableRow key={`${rr.id}-details`}>
                          <TableCell colSpan={6} sx={{ bgcolor: 'grey.50', py: 2, px: 3 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                              <Box>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                                  Why they joined
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.25, fontSize: 13 }}>
                                  {rr.reason_for_joining}
                                </Typography>
                              </Box>
                              <Box>
                                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                                  Why they want to discontinue
                                </Typography>
                                <Typography variant="body2" sx={{ mt: 0.25, fontSize: 13 }}>
                                  {rr.reason_for_discontinuing}
                                </Typography>
                              </Box>
                              {rr.additional_notes && (
                                <Box>
                                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                                    Additional notes
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.25, fontSize: 13 }}>
                                    {rr.additional_notes}
                                  </Typography>
                                </Box>
                              )}
                              {rr.admin_notes && (
                                <Box>
                                  <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: 10 }}>
                                    Admin notes
                                  </Typography>
                                  <Typography variant="body2" sx={{ mt: 0.25, fontSize: 13, fontStyle: 'italic' }}>
                                    {rr.admin_notes}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Approve/Reject Action Dialog */}
      <Dialog
        open={!!actionType}
        onClose={() => { if (!actionLoading) { setActionType(null); setActionTarget(null); } }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {actionType === 'approve' ? 'Approve Refund Request' : 'Reject Refund Request'}
        </DialogTitle>
        <DialogContent>
          {actionTarget && (
            <>
              {/* Summary */}
              <Box sx={{
                bgcolor: actionType === 'approve' ? '#E8F5E9' : '#FFEBEE',
                borderRadius: 1,
                p: 2,
                mb: 2,
                border: '1px solid',
                borderColor: actionType === 'approve' ? '#C8E6C9' : '#FFCDD2',
              }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2">Payment Amount</Typography>
                  <Typography variant="body2" fontWeight={600}>{formatCurrency(Number(actionTarget.payment_amount))}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" color="error.main">Processing Fee (30%)</Typography>
                  <Typography variant="body2" color="error.main">- {formatCurrency(Number(actionTarget.processing_fee))}</Typography>
                </Box>
                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" fontWeight={700}>
                    {actionType === 'approve' ? 'Refund Amount' : 'Eligible Refund'}
                  </Typography>
                  <Typography variant="body2" fontWeight={700} color="success.dark">
                    {formatCurrency(Number(actionTarget.refund_amount))}
                  </Typography>
                </Box>
              </Box>

              {actionType === 'approve' && (
                <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
                  Approving will mark the payment as &quot;refunded&quot; and notify the student via Email, WhatsApp, and in-app notification.
                </Alert>
              )}

              {actionType === 'reject' && (
                <Alert severity="info" sx={{ mb: 2, fontSize: 12 }}>
                  The student will be notified with your reason for rejection. This cannot be undone — the student cannot re-request a refund for this payment.
                </Alert>
              )}

              {actionError && (
                <Alert severity="error" sx={{ mb: 2 }}>{actionError}</Alert>
              )}

              <TextField
                label={actionType === 'reject' ? 'Reason for Rejection (Required)' : 'Admin Notes (Optional)'}
                placeholder={
                  actionType === 'reject'
                    ? 'Explain why the refund request is being denied...'
                    : 'Optional notes about this approval...'
                }
                multiline
                rows={3}
                fullWidth
                required={actionType === 'reject'}
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                error={actionType === 'reject' && adminNotes.length > 0 && adminNotes.length < 5}
                helperText={
                  actionType === 'reject' && adminNotes.length > 0 && adminNotes.length < 5
                    ? 'Please provide at least 5 characters'
                    : ''
                }
              />
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setActionType(null); setActionTarget(null); }}
            disabled={actionLoading}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color={actionType === 'approve' ? 'success' : 'error'}
            onClick={handleAction}
            disabled={
              actionLoading ||
              (actionType === 'reject' && adminNotes.trim().length < 5)
            }
          >
            {actionLoading
              ? (actionType === 'approve' ? 'Approving...' : 'Rejecting...')
              : (actionType === 'approve' ? 'Confirm Approval' : 'Confirm Rejection')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}
