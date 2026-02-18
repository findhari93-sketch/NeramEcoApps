'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@neram/ui';
import AssignmentIcon from '@mui/icons-material/Assignment';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ClassIcon from '@mui/icons-material/Class';
import SourceIcon from '@mui/icons-material/Source';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import GavelIcon from '@mui/icons-material/Gavel';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PhoneIcon from '@mui/icons-material/Phone';
import type { UserJourneyDetail, FeeStructure, ContactedStatus, PaymentRecommendation } from '@neram/database';
import EditApplicationDialog from './EditApplicationDialog';

interface ApplicationSectionProps {
  detail: UserJourneyDetail;
  adminId: string;
  onStatusChange: () => void;
}

const STATUS_CONFIG: Record<string, { color: string; bgColor: string; label: string }> = {
  draft: { color: '#78909C', bgColor: '#78909C14', label: 'Draft' },
  pending_verification: { color: '#F57C00', bgColor: '#F57C0014', label: 'Pending Verification' },
  submitted: { color: '#1976D2', bgColor: '#1976D214', label: 'Submitted' },
  under_review: { color: '#F57C00', bgColor: '#F57C0014', label: 'Under Review' },
  approved: { color: '#2E7D32', bgColor: '#2E7D3214', label: 'Approved' },
  rejected: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'Rejected' },
  deleted: { color: '#D32F2F', bgColor: '#D32F2F14', label: 'Deleted' },
};

function InfoRow({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        py: 0.75,
        px: 1.5,
        minHeight: 34,
        borderRadius: 1,
        '&:hover': { bgcolor: 'grey.50' },
        transition: 'background-color 0.15s',
      }}
    >
      <Box sx={{ width: 160, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {icon}
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: 13, fontWeight: 500 }}>
          {label}
        </Typography>
      </Box>
      <Typography variant="body2" sx={{ flex: 1, fontSize: 13 }}>
        {value || <span style={{ color: '#bdbdbd' }}>--</span>}
      </Typography>
    </Box>
  );
}

function formatCurrency(amount: number): string {
  return `Rs. ${amount.toLocaleString('en-IN')}`;
}

function formatTimestamp(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ApplicationSection({
  detail,
  adminId,
  onStatusChange,
}: ApplicationSectionProps) {
  const { leadProfile } = detail;
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  // Approve dialog state
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [deletionReason, setDeletionReason] = useState('');

  // Contacted status state
  const [contactedLoading, setContactedLoading] = useState(false);

  // Fee assignment state
  const [feeStructures, setFeeStructures] = useState<FeeStructure[]>([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [selectedFeeStructureId, setSelectedFeeStructureId] = useState('');
  const [paymentScheme, setPaymentScheme] = useState<'full' | 'installment'>('full');
  const [assignedFee, setAssignedFee] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [finalFee, setFinalFee] = useState(0);
  const [customOverride, setCustomOverride] = useState(false);
  const [approveNotes, setApproveNotes] = useState('');
  const [fullPaymentDiscount, setFullPaymentDiscount] = useState(5000);
  const [paymentRecommendation, setPaymentRecommendation] = useState<PaymentRecommendation>('full');

  const selectedFeeStructure = feeStructures.find((f) => f.id === selectedFeeStructureId);

  const fetchFeeStructures = useCallback(async () => {
    setFeeLoading(true);
    try {
      const res = await fetch('/api/fee-structures?isActive=true');
      const json = await res.json();
      setFeeStructures(json.data || []);
    } catch (err) {
      console.error('Failed to fetch fee structures:', err);
    } finally {
      setFeeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (approveDialogOpen && feeStructures.length === 0) {
      fetchFeeStructures();
    }
  }, [approveDialogOpen, feeStructures.length, fetchFeeStructures]);

  useEffect(() => {
    if (!selectedFeeStructure || customOverride) return;
    const baseFee = selectedFeeStructure.fee_amount;
    setAssignedFee(baseFee);
    if (paymentScheme === 'full') {
      const discount = selectedFeeStructure.single_payment_discount || 0;
      setDiscountAmount(discount);
      setFinalFee(baseFee - discount);
    } else {
      setDiscountAmount(0);
      setFinalFee(baseFee);
    }
  }, [selectedFeeStructure, paymentScheme, customOverride]);

  if (!leadProfile) {
    return (
      <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
          <AssignmentIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight={700}>Application</Typography>
        </Box>
        <Box sx={{ py: 4, textAlign: 'center' }}>
          <AssignmentIcon sx={{ fontSize: 36, color: 'grey.300', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">No application submitted yet.</Typography>
        </Box>
      </Paper>
    );
  }

  const handleApproveSubmit = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          adminId,
          notes: approveNotes,
          feeStructureId: selectedFeeStructureId || undefined,
          assignedFee: assignedFee || undefined,
          paymentScheme,
          discountAmount: discountAmount || undefined,
          finalFee: finalFee || undefined,
          fullPaymentDiscount: fullPaymentDiscount || undefined,
          paymentRecommendation,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to approve application');
      }
      setApproveDialogOpen(false);
      resetApproveForm();
      onStatusChange();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          adminId,
          notes: rejectionReason,
          rejectionReason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reject application');
      }
      setRejectDialogOpen(false);
      setRejectionReason('');
      onStatusChange();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubmit = async () => {
    setActionLoading(true);
    setActionError('');
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete',
          adminId,
          deletionReason,
          notes: deletionReason,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete application');
      }
      setDeleteDialogOpen(false);
      setDeletionReason('');
      onStatusChange();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleContactedStatus = async (status: ContactedStatus) => {
    setContactedLoading(true);
    try {
      const res = await fetch(`/api/crm/users/${detail.user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId,
          leadUpdates: {
            profileId: leadProfile?.id,
            contacted_status: status,
            contacted_at: new Date().toISOString(),
            contacted_by: adminId,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to update contacted status');
      onStatusChange();
    } catch (err) {
      console.error('Contacted status error:', err);
    } finally {
      setContactedLoading(false);
    }
  };

  const resetApproveForm = () => {
    setSelectedFeeStructureId('');
    setPaymentScheme('full');
    setAssignedFee(0);
    setDiscountAmount(0);
    setFinalFee(0);
    setCustomOverride(false);
    setApproveNotes('');
    setFullPaymentDiscount(5000);
    setPaymentRecommendation('full');
    setActionError('');
  };

  const handleFeeStructureChange = (feeId: string) => {
    setSelectedFeeStructureId(feeId);
    setCustomOverride(false);
  };

  const canReview = ['submitted', 'under_review', 'pending_verification'].includes(leadProfile.status);
  const statusConfig = STATUS_CONFIG[leadProfile.status] || STATUS_CONFIG.draft;

  return (
    <Paper elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, overflow: 'hidden' }}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'grey.100', bgcolor: 'grey.50' }}>
        <AssignmentIcon sx={{ color: 'primary.main', fontSize: 20 }} />
        <Typography variant="subtitle1" fontWeight={700}>Application</Typography>
        <Chip
          label={statusConfig.label}
          size="small"
          sx={{
            height: 22,
            fontSize: 10.5,
            fontWeight: 700,
            bgcolor: statusConfig.bgColor,
            color: statusConfig.color,
            borderRadius: 1,
            border: `1px solid ${statusConfig.color}30`,
            ml: 'auto',
            letterSpacing: 0.3,
          }}
        />
      </Box>

      <Box sx={{ p: 2.5 }}>
        <InfoRow
          label="Application #"
          icon={<ReceiptLongIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
          value={
            leadProfile.application_number
              ? <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{leadProfile.application_number}</span>
              : null
          }
        />
        <InfoRow
          label="Course Interest"
          icon={<ClassIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
          value={leadProfile.interest_course?.toUpperCase()}
        />
        <InfoRow
          label="Learning Mode"
          icon={<ClassIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
          value={
            leadProfile.learning_mode
              ? <span style={{ textTransform: 'capitalize' }}>{leadProfile.learning_mode.replace(/_/g, ' ')}</span>
              : null
          }
        />
        <InfoRow
          label="Source"
          icon={<SourceIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
          value={leadProfile.source}
        />
        <InfoRow
          label="Submitted"
          icon={<CalendarTodayIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
          value={
            (leadProfile.form_completed_at || leadProfile.created_at)
              ? formatTimestamp(leadProfile.form_completed_at || leadProfile.created_at)
              : null
          }
        />

        {/* Fee Info */}
        {(leadProfile.assigned_fee || leadProfile.final_fee) && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, mt: 0.5 }}>
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Fee Details
              </Typography>
            </Box>
            <InfoRow label="Assigned Fee" value={
              leadProfile.assigned_fee
                ? <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{formatCurrency(leadProfile.assigned_fee)}</span>
                : null
            } />
            <InfoRow label="Discount" value={
              leadProfile.discount_amount
                ? <span style={{ fontFamily: 'monospace', color: '#2E7D32', fontWeight: 600 }}>- {formatCurrency(leadProfile.discount_amount)}</span>
                : null
            } />
            <InfoRow label="Coupon" value={
              leadProfile.coupon_code
                ? <Chip label={leadProfile.coupon_code} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 600, fontFamily: 'monospace', borderRadius: 1, bgcolor: '#E3F2FD', color: '#1565C0' }} />
                : null
            } />
            <InfoRow label="Final Fee" value={
              leadProfile.final_fee
                ? <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1565C0', fontSize: 14 }}>{formatCurrency(leadProfile.final_fee)}</span>
                : null
            } />
            <InfoRow label="Payment Scheme" value={
              leadProfile.payment_scheme
                ? <span style={{ textTransform: 'capitalize' }}>{leadProfile.payment_scheme}</span>
                : null
            } />
          </>
        )}

        {/* Contacted Status */}
        {canReview && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <PhoneIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Contact Status
              </Typography>
              {leadProfile.contacted_status && (
                <Chip
                  label={leadProfile.contacted_status === 'talked' ? 'Talked' : leadProfile.contacted_status === 'unreachable' ? 'Unreachable' : 'Callback Scheduled'}
                  size="small"
                  sx={{ height: 20, fontSize: 10, fontWeight: 600, borderRadius: 1, ml: 'auto',
                    bgcolor: leadProfile.contacted_status === 'talked' ? '#E8F5E9' : leadProfile.contacted_status === 'unreachable' ? '#FFF3E0' : '#E3F2FD',
                    color: leadProfile.contacted_status === 'talked' ? '#2E7D32' : leadProfile.contacted_status === 'unreachable' ? '#E65100' : '#1565C0',
                  }}
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant={leadProfile.contacted_status === 'talked' ? 'contained' : 'outlined'}
                size="small"
                color="success"
                onClick={() => handleContactedStatus('talked')}
                disabled={contactedLoading}
                sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 11, fontWeight: 600, minWidth: 0, px: 1.5 }}
              >
                Talked
              </Button>
              <Button
                variant={leadProfile.contacted_status === 'unreachable' ? 'contained' : 'outlined'}
                size="small"
                color="warning"
                onClick={() => handleContactedStatus('unreachable')}
                disabled={contactedLoading}
                sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 11, fontWeight: 600, minWidth: 0, px: 1.5 }}
              >
                Unreachable
              </Button>
              <Button
                variant={leadProfile.contacted_status === 'callback_scheduled' ? 'contained' : 'outlined'}
                size="small"
                color="info"
                onClick={() => handleContactedStatus('callback_scheduled')}
                disabled={contactedLoading}
                sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 11, fontWeight: 600, minWidth: 0, px: 1.5 }}
              >
                Callback Scheduled
              </Button>
            </Box>
          </>
        )}

        {/* Quick Actions: Edit + Delete */}
        {leadProfile && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon sx={{ fontSize: 14 }} />}
                onClick={() => setEditDialogOpen(true)}
                sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 11, fontWeight: 600, px: 1.5 }}
              >
                Edit Application
              </Button>
              {canReview && (
                <Button
                  variant="outlined"
                  size="small"
                  color="error"
                  startIcon={<DeleteIcon sx={{ fontSize: 14 }} />}
                  onClick={() => setDeleteDialogOpen(true)}
                  sx={{ borderRadius: 1.5, textTransform: 'none', fontSize: 11, fontWeight: 600, px: 1.5, ml: 'auto' }}
                >
                  Delete
                </Button>
              )}
            </Box>
          </>
        )}

        {/* Review Info */}
        {leadProfile.reviewed_by && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, mt: 0.5 }}>
              <GavelIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Review Details
              </Typography>
            </Box>
            <InfoRow label="Reviewed At" value={leadProfile.reviewed_at ? formatTimestamp(leadProfile.reviewed_at) : null} />
            <InfoRow label="Admin Notes" value={leadProfile.admin_notes} />
            {leadProfile.rejection_reason && (
              <Box sx={{ mt: 1, p: 1.5, borderRadius: 1.5, bgcolor: '#FFEBEE', border: '1px solid #FFCDD2' }}>
                <Typography variant="caption" sx={{ fontWeight: 700, color: '#C62828', fontSize: 11, letterSpacing: 0.3 }}>
                  Rejection Reason
                </Typography>
                <Typography variant="body2" sx={{ fontSize: 12.5, color: '#B71C1C', mt: 0.5 }}>
                  {leadProfile.rejection_reason}
                </Typography>
              </Box>
            )}
          </>
        )}

        {/* Action buttons */}
        {canReview && (
          <>
            <Divider sx={{ my: 2 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <GavelIcon sx={{ fontSize: 14, color: 'primary.main' }} />
              <Typography variant="overline" sx={{ fontWeight: 700, letterSpacing: 1, color: 'text.secondary', fontSize: 10.5 }}>
                Review Action
              </Typography>
            </Box>
            {actionError && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 1.5, fontSize: 12.5 }}>{actionError}</Alert>}
            <Box sx={{ display: 'flex', gap: 1.5 }}>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                onClick={() => setApproveDialogOpen(true)}
                disabled={actionLoading}
                size="small"
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 2.5, '&:hover': { boxShadow: 'none' } }}
              >
                Approve
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<CancelIcon sx={{ fontSize: 16 }} />}
                onClick={() => setRejectDialogOpen(true)}
                disabled={actionLoading}
                size="small"
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 2.5 }}
              >
                Reject
              </Button>
            </Box>
          </>
        )}
      </Box>

      {/* Approve Dialog with Fee Assignment */}
      <Dialog
        open={approveDialogOpen}
        onClose={() => { setApproveDialogOpen(false); resetApproveForm(); }}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1 }}>
          Approve Application & Assign Fee
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              select
              label="Fee Structure"
              value={selectedFeeStructureId}
              onChange={(e) => handleFeeStructureChange(e.target.value)}
              fullWidth
              size="small"
              helperText={feeLoading ? 'Loading fee structures...' : 'Select a fee structure to auto-fill pricing'}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="">
                <em>-- Select Fee Structure --</em>
              </MenuItem>
              {feeStructures.map((fs) => (
                <MenuItem key={fs.id} value={fs.id}>
                  {fs.display_name} - {formatCurrency(fs.fee_amount)}
                  {fs.is_hidden_from_public ? ' (Hidden)' : ''}
                </MenuItem>
              ))}
            </TextField>

            {selectedFeeStructure && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, fontSize: 13 }}>Fee Breakdown</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>Full Fee</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5 }}>{formatCurrency(selectedFeeStructure.fee_amount)}</Typography>
                </Box>

                {paymentScheme === 'full' && (selectedFeeStructure.single_payment_discount || 0) > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>Single Payment Discount</Typography>
                    <Typography variant="body2" sx={{ color: 'success.main', fontFamily: 'monospace', fontWeight: 600, fontSize: 12.5 }}>
                      - {formatCurrency(selectedFeeStructure.single_payment_discount)}
                    </Typography>
                  </Box>
                )}

                {paymentScheme === 'installment' && (
                  <>
                    {selectedFeeStructure.installment_1_amount && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>Installment 1</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12.5 }}>{formatCurrency(selectedFeeStructure.installment_1_amount)}</Typography>
                      </Box>
                    )}
                    {selectedFeeStructure.installment_2_amount && (
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12.5 }}>Installment 2</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12.5 }}>{formatCurrency(selectedFeeStructure.installment_2_amount)}</Typography>
                      </Box>
                    )}
                  </>
                )}

                <Divider sx={{ my: 1 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" fontWeight={700} sx={{ fontSize: 13 }}>Final Fee</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: 'primary.main', fontFamily: 'monospace', fontSize: 14 }}>
                    {formatCurrency(finalFee)}
                  </Typography>
                </Box>
              </Paper>
            )}

            <TextField
              select
              label="Payment Scheme"
              value={paymentScheme}
              onChange={(e) => setPaymentScheme(e.target.value as 'full' | 'installment')}
              fullWidth
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="full">Full Payment</MenuItem>
              <MenuItem value="installment">2 Installments</MenuItem>
            </TextField>

            <Divider />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              Custom Fee Override (optional - overrides auto-calculated values)
            </Typography>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Assigned Fee (Rs.)"
                type="number"
                value={assignedFee || ''}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setAssignedFee(val);
                  setCustomOverride(true);
                  setFinalFee(val - discountAmount);
                }}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
              />
              <TextField
                label="Discount (Rs.)"
                type="number"
                value={discountAmount || ''}
                onChange={(e) => {
                  const val = Number(e.target.value) || 0;
                  setDiscountAmount(val);
                  setCustomOverride(true);
                  setFinalFee(assignedFee - val);
                }}
                fullWidth
                size="small"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
              />
            </Box>

            <TextField
              label="Final Fee (Rs.)"
              type="number"
              value={finalFee || ''}
              onChange={(e) => {
                setFinalFee(Number(e.target.value) || 0);
                setCustomOverride(true);
              }}
              fullWidth
              size="small"
              helperText="This value will be saved as the student's fee"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />

            <Divider />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
              Student Incentive & Recommendation
            </Typography>

            <TextField
              label="Full Payment Discount (Rs.)"
              type="number"
              value={fullPaymentDiscount}
              onChange={(e) => setFullPaymentDiscount(Number(e.target.value) || 0)}
              fullWidth
              size="small"
              helperText="Discount given to student if they pay in full (default Rs. 5,000)"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />

            <TextField
              select
              label="Payment Recommendation"
              value={paymentRecommendation}
              onChange={(e) => setPaymentRecommendation(e.target.value as PaymentRecommendation)}
              fullWidth
              size="small"
              helperText="Recommend full or installment to the student"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="full">Full Payment (recommended)</MenuItem>
              <MenuItem value="installment">Installment</MenuItem>
            </TextField>

            {finalFee > 0 && fullPaymentDiscount > 0 && (
              <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#E8F5E9', borderRadius: 1.5, border: '1px solid #C8E6C9' }}>
                <Typography variant="body2" sx={{ fontSize: 12, color: '#2E7D32', fontWeight: 600 }}>
                  Student will see: Pay {formatCurrency(finalFee - fullPaymentDiscount)} in full and save {formatCurrency(fullPaymentDiscount)}!
                </Typography>
                <Typography variant="caption" sx={{ fontSize: 11, color: '#558B2F' }}>
                  Or pay in 2 installments of {formatCurrency(Math.ceil(finalFee / 2))} each
                </Typography>
              </Paper>
            )}

            <TextField
              label="Admin Notes (optional)"
              multiline
              rows={2}
              value={approveNotes}
              onChange={(e) => setApproveNotes(e.target.value)}
              fullWidth
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />

            {actionError && <Alert severity="error" sx={{ borderRadius: 1.5 }}>{actionError}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => { setApproveDialogOpen(false); resetApproveForm(); }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 500 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={handleApproveSubmit}
            disabled={actionLoading}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
          >
            {actionLoading ? 'Approving...' : 'Approve Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={rejectDialogOpen}
        onClose={() => { setRejectDialogOpen(false); setRejectionReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1, color: 'error.main' }}>
          Reject Application
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <TextField
              label="Rejection Reason"
              multiline
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              fullWidth
              required
              placeholder="Explain why the application is being rejected..."
              size="small"
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            />
            {actionError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: 1.5 }}>{actionError}</Alert>}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => { setRejectDialogOpen(false); setRejectionReason(''); }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 500 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRejectSubmit}
            disabled={actionLoading || !rejectionReason.trim()}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
          >
            {actionLoading ? 'Rejecting...' : 'Reject Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => { setDeleteDialogOpen(false); setDeletionReason(''); }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 18, pb: 1, color: 'error.main' }}>
          Delete Application
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: 13, mb: 2 }}>
            Are you sure you want to delete this application? The student will lose their application data. This action cannot be undone easily.
          </DialogContentText>
          <TextField
            label="Reason for deletion"
            multiline
            rows={2}
            value={deletionReason}
            onChange={(e) => setDeletionReason(e.target.value)}
            fullWidth
            required
            placeholder="Explain why this application is being deleted..."
            size="small"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
          />
          {actionError && <Alert severity="error" sx={{ mt: 1.5, borderRadius: 1.5 }}>{actionError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => { setDeleteDialogOpen(false); setDeletionReason(''); }}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 500 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteSubmit}
            disabled={actionLoading || !deletionReason.trim()}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, boxShadow: 'none', px: 3, '&:hover': { boxShadow: 'none' } }}
          >
            {actionLoading ? 'Deleting...' : 'Delete Application'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Application Dialog */}
      <EditApplicationDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        detail={detail}
        adminId={adminId}
        onSaved={onStatusChange}
      />
    </Paper>
  );
}
