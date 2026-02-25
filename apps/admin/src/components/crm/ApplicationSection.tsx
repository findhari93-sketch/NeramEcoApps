'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  FormControlLabel,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Switch,
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
import LocalOfferIcon from '@mui/icons-material/LocalOffer';
import ConfirmationNumberIcon from '@mui/icons-material/ConfirmationNumber';
import SchoolIcon from '@mui/icons-material/School';
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
  enrolled: { color: '#1B5E20', bgColor: '#1B5E2014', label: 'Enrolled' },
  partial_payment: { color: '#E65100', bgColor: '#E6510014', label: 'Partial Payment' },
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
      <Typography variant="body2" component="div" sx={{ flex: 1, fontSize: 13 }}>
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

  // Allowed payment modes state
  const [allowedPaymentModes, setAllowedPaymentModes] = useState<'full_only' | 'full_and_installment'>('full_and_installment');

  // Installment configuration state
  const [installment1Amount, setInstallment1Amount] = useState(0);
  const [installment2Amount, setInstallment2Amount] = useState(0);
  const [installment2DueDays, setInstallment2DueDays] = useState(45);

  // Coupon generation state
  const [generateCoupon, setGenerateCoupon] = useState(false);
  const [couponDiscountType, setCouponDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [couponDiscountValue, setCouponDiscountValue] = useState(0);
  const [couponExpiresInDays, setCouponExpiresInDays] = useState(30);
  const [couponDescription, setCouponDescription] = useState('');

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
    if (allowedPaymentModes === 'full_only') {
      // Full payment only: bake the discount into the final fee
      const discount = selectedFeeStructure.single_payment_discount || 0;
      setDiscountAmount(discount);
      setFinalFee(baseFee - discount);
    } else {
      // Both options: finalFee is the full amount (discount is an incentive via fullPaymentDiscount)
      setDiscountAmount(0);
      setFinalFee(baseFee);
    }
  }, [selectedFeeStructure, allowedPaymentModes, customOverride]);

  // Auto-calculate installment amounts from the FULL fee (no discount — discount is only for full payment)
  useEffect(() => {
    if (!selectedFeeStructure) return;
    const baseFee = selectedFeeStructure.fee_amount;
    if (selectedFeeStructure.installment_1_amount) {
      setInstallment1Amount(selectedFeeStructure.installment_1_amount);
      setInstallment2Amount(baseFee - selectedFeeStructure.installment_1_amount);
    } else {
      const inst1 = Math.ceil(baseFee * 0.55);
      setInstallment1Amount(inst1);
      setInstallment2Amount(baseFee - inst1);
    }
  }, [selectedFeeStructure]);

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

  // Compute effective status: enrolled/partial_payment are derived from payment + student profile data
  const effectiveStatus = (() => {
    if (!leadProfile) return 'draft';
    if (detail.studentProfile) return 'enrolled';
    if (leadProfile.status === 'approved' && detail.payments.length > 0) {
      const totalPaid = detail.payments
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      if (totalPaid > 0) {
        if (leadProfile.final_fee && totalPaid < Number(leadProfile.final_fee)) return 'partial_payment';
        return 'enrolled';
      }
    }
    return leadProfile.status;
  })();

  const totalPaid = detail.payments
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const balanceDue = leadProfile.final_fee ? Number(leadProfile.final_fee) - totalPaid : 0;

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
          allowedPaymentModes,
          installment1Amount: allowedPaymentModes === 'full_and_installment' ? installment1Amount : undefined,
          installment2Amount: allowedPaymentModes === 'full_and_installment' ? installment2Amount : undefined,
          installment2DueDays: allowedPaymentModes === 'full_and_installment' ? installment2DueDays : undefined,
          couponData: generateCoupon ? {
            discountType: couponDiscountType,
            discountValue: couponDiscountValue,
            expiresInDays: couponExpiresInDays,
            description: couponDescription || undefined,
          } : undefined,
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
    setAllowedPaymentModes('full_and_installment');
    setInstallment1Amount(0);
    setInstallment2Amount(0);
    setInstallment2DueDays(45);
    setGenerateCoupon(false);
    setCouponDiscountType('fixed');
    setCouponDiscountValue(0);
    setCouponExpiresInDays(30);
    setCouponDescription('');
    setActionError('');
  };

  const handleFeeStructureChange = (feeId: string) => {
    setSelectedFeeStructureId(feeId);
    setCustomOverride(false);
  };

  const canReview = ['submitted', 'under_review', 'pending_verification'].includes(leadProfile.status);
  const statusConfig = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.draft;

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

        {/* Enrollment Info Banner */}
        {['enrolled', 'partial_payment'].includes(effectiveStatus) && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Box
              sx={{
                p: 2,
                borderRadius: 1.5,
                bgcolor: effectiveStatus === 'enrolled' ? '#E8F5E9' : '#FFF3E0',
                border: '1px solid',
                borderColor: effectiveStatus === 'enrolled' ? '#C8E6C9' : '#FFE0B2',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <SchoolIcon sx={{ fontSize: 18, color: effectiveStatus === 'enrolled' ? '#1B5E20' : '#E65100' }} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: 13, color: effectiveStatus === 'enrolled' ? '#1B5E20' : '#E65100' }}>
                  {effectiveStatus === 'enrolled' ? 'Enrollment Confirmed' : 'Partial Payment — Enrollment Pending'}
                </Typography>
              </Box>

              {detail.studentProfile?.enrollment_date && (
                <InfoRow
                  label="Enrolled On"
                  icon={<CalendarTodayIcon sx={{ fontSize: 14, color: '#2E7D32' }} />}
                  value={formatTimestamp(detail.studentProfile.enrollment_date)}
                />
              )}

              {totalPaid > 0 && (
                <>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1, mb: 0.5 }}>
                    <Typography variant="caption" color="text.secondary">
                      Paid: <strong>{formatCurrency(totalPaid)}</strong>
                    </Typography>
                    {balanceDue > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Balance: <strong style={{ color: '#E65100' }}>{formatCurrency(balanceDue)}</strong>
                      </Typography>
                    )}
                  </Box>
                  {leadProfile.final_fee && Number(leadProfile.final_fee) > 0 && (
                    <LinearProgress
                      variant="determinate"
                      value={(totalPaid / Number(leadProfile.final_fee)) * 100}
                      sx={{
                        height: 8,
                        borderRadius: 4,
                        bgcolor: effectiveStatus === 'enrolled' ? '#C8E6C9' : '#FFE0B2',
                        '& .MuiLinearProgress-bar': {
                          bgcolor: effectiveStatus === 'enrolled' ? '#2E7D32' : '#F57C00',
                        },
                      }}
                    />
                  )}
                </>
              )}

              <InfoRow
                label="Payment Scheme"
                value={
                  leadProfile.payment_scheme
                    ? <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{leadProfile.payment_scheme}</span>
                    : null
                }
              />

              {detail.installments.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', fontSize: 10.5, letterSpacing: 0.5 }}>
                    INSTALLMENT SCHEDULE
                  </Typography>
                  {detail.installments.map((inst, i) => (
                    <Box key={inst.id} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
                      <Typography variant="caption">
                        Installment {i + 1}
                        {inst.due_date ? ` (due ${new Date(inst.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                        {formatCurrency(Number(inst.amount))}
                        {' '}
                        <span style={{ color: inst.status === 'paid' ? '#2E7D32' : '#F57C00', fontSize: 10 }}>
                          {inst.status === 'paid' ? 'PAID' : inst.status === 'overdue' ? 'OVERDUE' : 'PENDING'}
                        </span>
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
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
            {actionError && !approveDialogOpen && !rejectDialogOpen && !deleteDialogOpen && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 1.5, fontSize: 12.5 }}>{actionError}</Alert>}
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

                {allowedPaymentModes === 'full_only' && (selectedFeeStructure.single_payment_discount || 0) > 0 && (
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

            {/* Student Payment Options (replaces old Payment Scheme) */}
            <TextField
              select
              label="Student Payment Options"
              value={allowedPaymentModes}
              onChange={(e) => {
                const mode = e.target.value as 'full_only' | 'full_and_installment';
                setAllowedPaymentModes(mode);
                // Keep paymentScheme in sync for backward compatibility
                setPaymentScheme(mode === 'full_only' ? 'full' : 'installment');
              }}
              fullWidth
              size="small"
              helperText={
                allowedPaymentModes === 'full_only'
                  ? 'Student can only pay the full amount at once'
                  : 'Student can choose between full payment or installments'
              }
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
            >
              <MenuItem value="full_only">Full Payment Only</MenuItem>
              <MenuItem value="full_and_installment">Both Options (Full + Installment)</MenuItem>
            </TextField>

            {/* Installment Configuration - shown when both options allowed */}
            <Collapse in={allowedPaymentModes === 'full_and_installment'}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: '#F5F5F5', mb: 0 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <ReceiptLongIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  Installment Configuration
                </Typography>
                <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                  <TextField
                    label="1st Installment (Rs.)"
                    type="number"
                    value={installment1Amount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setInstallment1Amount(val);
                      setInstallment2Amount(assignedFee - val);
                    }}
                    fullWidth
                    size="small"
                    helperText={selectedFeeStructure?.installment_1_amount
                      ? `Fee structure default: ${formatCurrency(selectedFeeStructure.installment_1_amount)}`
                      : 'Auto: 55% of final fee'}
                    InputProps={{ startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />
                  <TextField
                    label="2nd Installment (Rs.)"
                    type="number"
                    value={installment2Amount || ''}
                    onChange={(e) => {
                      const val = Number(e.target.value) || 0;
                      setInstallment2Amount(val);
                    }}
                    fullWidth
                    size="small"
                    helperText="Remainder of the final fee"
                    InputProps={{ startAdornment: <InputAdornment position="start">Rs.</InputAdornment> }}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />
                </Box>
                <TextField
                  label="2nd Installment Due (Days)"
                  type="number"
                  value={installment2DueDays}
                  onChange={(e) => setInstallment2DueDays(Number(e.target.value) || 0)}
                  fullWidth
                  size="small"
                  helperText="Number of days after enrollment for the 2nd installment"
                  sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                />
              </Paper>
            </Collapse>

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

            {/* Inline Coupon Generation */}
            <Divider />
            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: generateCoupon ? 'primary.main' : 'grey.300' }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={generateCoupon}
                    onChange={(e) => setGenerateCoupon(e.target.checked)}
                    size="small"
                    color="primary"
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <LocalOfferIcon sx={{ fontSize: 16, color: generateCoupon ? 'primary.main' : 'text.disabled' }} />
                    <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 600 }}>
                      Generate Student-Specific Coupon
                    </Typography>
                  </Box>
                }
                sx={{ ml: 0, mb: generateCoupon ? 1.5 : 0 }}
              />
              <Collapse in={generateCoupon}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1, bgcolor: '#F3E5F5', borderRadius: 1.5 }}>
                    <ConfirmationNumberIcon sx={{ fontSize: 16, color: '#7B1FA2' }} />
                    <Typography variant="body2" sx={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600 }}>
                      Coupon code will be auto-generated on approval
                    </Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField
                      select
                      label="Discount Type"
                      value={couponDiscountType}
                      onChange={(e) => setCouponDiscountType(e.target.value as 'fixed' | 'percentage')}
                      fullWidth
                      size="small"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                    >
                      <MenuItem value="fixed">Fixed Amount (Rs.)</MenuItem>
                      <MenuItem value="percentage">Percentage (%)</MenuItem>
                    </TextField>
                    <TextField
                      label={couponDiscountType === 'fixed' ? 'Discount Amount' : 'Discount %'}
                      type="number"
                      value={couponDiscountValue || ''}
                      onChange={(e) => setCouponDiscountValue(Number(e.target.value) || 0)}
                      fullWidth
                      size="small"
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            {couponDiscountType === 'fixed' ? 'Rs.' : '%'}
                          </InputAdornment>
                        ),
                      }}
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                    />
                  </Box>

                  <TextField
                    label="Expires In (Days)"
                    type="number"
                    value={couponExpiresInDays}
                    onChange={(e) => setCouponExpiresInDays(Number(e.target.value) || 0)}
                    fullWidth
                    size="small"
                    helperText="Coupon expires after this many days from creation"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />

                  <TextField
                    label="Description (optional)"
                    value={couponDescription}
                    onChange={(e) => setCouponDescription(e.target.value)}
                    fullWidth
                    size="small"
                    placeholder="e.g., Special discount for early enrollment"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
                  />

                  {couponDiscountValue > 0 && (
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#FFF3E0', borderRadius: 1.5, border: '1px solid #FFE0B2' }}>
                      <Typography variant="body2" sx={{ fontSize: 12, color: '#E65100', fontWeight: 600 }}>
                        Coupon Preview: {couponDiscountType === 'fixed'
                          ? `${formatCurrency(couponDiscountValue)} off`
                          : `${couponDiscountValue}% off${finalFee > 0 ? ` (approx. ${formatCurrency(Math.round(finalFee * couponDiscountValue / 100))})` : ''}`
                        }
                        {couponExpiresInDays > 0 ? ` - Valid for ${couponExpiresInDays} days` : ''}
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Collapse>
            </Paper>

            {/* Student-Facing Preview */}
            {finalFee > 0 && (
              <Paper variant="outlined" sx={{ p: 2, bgcolor: '#E8F5E9', borderRadius: 2, border: '1px solid #C8E6C9' }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 700, fontSize: 12, color: '#1B5E20', letterSpacing: 0.5 }}>
                  STUDENT WILL SEE
                </Typography>
                {/* Full Payment Option */}
                {fullPaymentDiscount > 0 ? (
                  <Box sx={{ mb: allowedPaymentModes === 'full_and_installment' ? 1 : 0 }}>
                    <Typography variant="body2" sx={{ fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>
                      Full Payment: Pay {formatCurrency(finalFee - fullPaymentDiscount)} and save {formatCurrency(fullPaymentDiscount)}!
                    </Typography>
                  </Box>
                ) : (
                  <Box sx={{ mb: allowedPaymentModes === 'full_and_installment' ? 1 : 0 }}>
                    <Typography variant="body2" sx={{ fontSize: 13, color: '#2E7D32', fontWeight: 600 }}>
                      Full Payment: {formatCurrency(finalFee)}
                    </Typography>
                  </Box>
                )}
                {/* Installment Option */}
                {allowedPaymentModes === 'full_and_installment' && installment1Amount > 0 && (
                  <Typography variant="body2" sx={{ fontSize: 12.5, color: '#558B2F' }}>
                    Installments: {formatCurrency(installment1Amount)} now + {formatCurrency(installment2Amount)} in {installment2DueDays} days
                  </Typography>
                )}
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
        onClose={() => { setRejectDialogOpen(false); setRejectionReason(''); setActionError(''); }}
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
        onClose={() => { setDeleteDialogOpen(false); setDeletionReason(''); setActionError(''); }}
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
