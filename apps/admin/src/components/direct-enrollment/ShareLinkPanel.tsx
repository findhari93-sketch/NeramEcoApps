// @ts-nocheck
'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
  Divider,
  Snackbar,
  Paper,
  CircularProgress,
  Alert,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import { IconButton, InputAdornment } from '@neram/ui';
import type { DirectEnrollmentLink } from '@neram/database';
import InvoiceDownload from './InvoiceDownload';
import ConfirmDialog from './ConfirmDialog';

const ENROLLMENT_URL_BASE = `${process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com'}/en/enroll?token=`;

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA',
  jee_paper2: 'JEE Paper 2',
  both: 'NATA + JEE Paper 2',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  upi_direct: 'UPI Direct',
  cash: 'Cash',
};

function getStatusColor(status: string): 'success' | 'info' | 'warning' | 'error' | 'default' {
  switch (status) {
    case 'active':
      return 'success';
    case 'used':
      return 'info';
    case 'expired':
      return 'warning';
    case 'cancelled':
      return 'error';
    default:
      return 'default';
  }
}

function formatCurrency(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

interface ShareLinkPanelProps {
  open: boolean;
  onClose: () => void;
  link: DirectEnrollmentLink & { course_name?: string; batch_name?: string };
  adminId?: string;
  onRegenerated?: (newLink: DirectEnrollmentLink & { course_name?: string; batch_name?: string }) => void;
}

export default function ShareLinkPanel({ open, onClose, link, adminId, onRegenerated }: ShareLinkPanelProps) {
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });
  const [regenerateDialogOpen, setRegenerateDialogOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const enrollmentUrl = `${ENROLLMENT_URL_BASE}${link.token}`;
  const courseLabel = COURSE_LABELS[link.interest_course] || link.interest_course || 'Course';

  const canRegenerate = link.status === 'expired' || link.status === 'cancelled' || link.status === 'active';
  const showRegenerateButton = link.status !== 'used';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(enrollmentUrl);
    setSnackbar({ open: true, message: 'Link copied to clipboard!' });
  };

  const handleShareWhatsApp = () => {
    const phone = (link.student_phone || '').replace(/[^0-9]/g, '');
    const phoneWithCountryCode = phone.startsWith('91') ? phone : `91${phone}`;

    const message = `Hello ${link.student_name}! Your enrollment link for Neram Classes is ready. Please complete your enrollment here: ${enrollmentUrl}\n\nFee Details:\nCourse: ${courseLabel}\nTotal: ${formatCurrency(link.final_fee)}\nPaid: ${formatCurrency(link.amount_paid)}`;

    const encodedMessage = encodeURIComponent(message);
    const waUrl = phone
      ? `https://wa.me/${phoneWithCountryCode}?text=${encodedMessage}`
      : `https://wa.me/?text=${encodedMessage}`;

    window.open(waUrl, '_blank');
  };

  const handleRegenerate = async () => {
    if (!adminId) return;

    setRegenerating(true);
    try {
      const res = await fetch(`/api/direct-enrollment/${link.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate link');
      }

      setSnackbar({ open: true, message: 'New link generated successfully!' });
      setRegenerateDialogOpen(false);

      if (onRegenerated) {
        onRegenerated(data.data);
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: err.message || 'Failed to regenerate link' });
    } finally {
      setRegenerating(false);
    }
  };

  const balanceDue = Math.max(0, link.final_fee - link.amount_paid);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" fontWeight={700}>
              Enrollment Link
            </Typography>
            <Chip
              label={link.status.charAt(0).toUpperCase() + link.status.slice(1)}
              size="small"
              color={getStatusColor(link.status)}
              sx={{ fontWeight: 500 }}
            />
          </Box>
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ pt: 2 }}>
          {/* Used status badge */}
          {link.status === 'used' && (
            <Paper
              elevation={0}
              sx={{
                p: 2,
                mb: 2,
                borderRadius: 1,
                bgcolor: '#E3F2FD',
                border: '1px solid #90CAF9',
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
              }}
            >
              <CheckCircleIcon sx={{ color: '#1565C0', fontSize: 24 }} />
              <Box>
                <Typography variant="body2" fontWeight={600} color="#1565C0">
                  Enrollment Completed
                </Typography>
                {link.used_at && (
                  <Typography variant="caption" color="text.secondary">
                    Completed on {formatDate(link.used_at)}
                  </Typography>
                )}
              </Box>
            </Paper>
          )}

          {/* Expired/cancelled banner with regenerate option */}
          {(link.status === 'expired' || link.status === 'cancelled') && (
            <Alert
              severity={link.status === 'expired' ? 'warning' : 'error'}
              sx={{ mb: 2 }}
              action={
                showRegenerateButton && adminId ? (
                  <Button
                    color="inherit"
                    size="small"
                    startIcon={<RefreshIcon />}
                    onClick={() => setRegenerateDialogOpen(true)}
                    sx={{ textTransform: 'none', fontWeight: 600 }}
                  >
                    Regenerate
                  </Button>
                ) : undefined
              }
            >
              {link.status === 'expired'
                ? 'This link has expired. You can regenerate a new link with the same enrollment data.'
                : 'This link has been cancelled. You can regenerate a new link with the same enrollment data.'}
            </Alert>
          )}

          {/* Enrollment Link URL */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Enrollment Link
          </Typography>
          <TextField
            value={enrollmentUrl}
            fullWidth
            size="small"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={handleCopyLink}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ),
              sx: { fontFamily: 'monospace', fontSize: '0.85rem', bgcolor: 'grey.50' },
            }}
            sx={{ mb: 2 }}
          />

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={handleCopyLink}
              sx={{ borderRadius: 1, textTransform: 'none', fontWeight: 600, flex: 1, minWidth: 140 }}
            >
              Copy Link
            </Button>
            <Button
              variant="contained"
              startIcon={<WhatsAppIcon />}
              onClick={handleShareWhatsApp}
              sx={{
                borderRadius: 1,
                textTransform: 'none',
                fontWeight: 600,
                flex: 1,
                minWidth: 140,
                bgcolor: '#25D366',
                '&:hover': { bgcolor: '#1DA851' },
              }}
            >
              Share via WhatsApp
            </Button>
            <InvoiceDownload
              linkData={{
                studentName: link.student_name,
                studentPhone: link.student_phone || '',
                courseName: link.course_name || courseLabel,
                totalFee: link.total_fee,
                discountAmount: link.discount_amount,
                finalFee: link.final_fee,
                amountPaid: link.amount_paid,
                paymentMethod: PAYMENT_METHOD_LABELS[link.payment_method] || link.payment_method,
                transactionReference: link.transaction_reference || '',
                paymentDate: link.payment_date || link.created_at,
                token: link.token,
              }}
              variant="outlined"
              size="medium"
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          {/* Link Details */}
          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Student Details
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
            <DetailRow label="Name" value={link.student_name} />
            <DetailRow label="Phone" value={link.student_phone || '-'} />
            <DetailRow label="Email" value={link.student_email || '-'} />
            <DetailRow label="Learning Mode" value={link.learning_mode === 'online_only' ? 'Online' : 'Hybrid'} />
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Course & Fee
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
            <DetailRow label="Course Interest" value={courseLabel} />
            <DetailRow label="Course" value={link.course_name || '-'} />
            <DetailRow label="Batch" value={link.batch_name || '-'} />
            <DetailRow label="Total Fee" value={formatCurrency(link.total_fee)} />
            <DetailRow label="Discount" value={link.discount_amount > 0 ? formatCurrency(link.discount_amount) : '-'} />
            <DetailRow label="Final Fee" value={formatCurrency(link.final_fee)} />
            <DetailRow label="Amount Paid" value={formatCurrency(link.amount_paid)} highlight="success" />
            <DetailRow
              label="Balance Due"
              value={balanceDue > 0 ? formatCurrency(balanceDue) : 'Nil'}
              highlight={balanceDue > 0 ? 'error' : undefined}
            />
          </Box>

          <Divider sx={{ mb: 2 }} />

          <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Payment & Status
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1 }}>
            <DetailRow label="Payment Method" value={PAYMENT_METHOD_LABELS[link.payment_method] || link.payment_method} />
            <DetailRow label="Transaction Ref" value={link.transaction_reference || '-'} />
            <DetailRow label="Payment Date" value={link.payment_date ? formatDate(link.payment_date) : '-'} />
            <DetailRow label="Created" value={formatDate(link.created_at)} />
            <DetailRow label="Expires" value={formatDate(link.expires_at)} />
            <DetailRow label="Status" value={link.status.charAt(0).toUpperCase() + link.status.slice(1)} />
          </Box>

          {link.payment_proof_url && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                Payment Proof
              </Typography>
              <Box
                component="a"
                href={link.payment_proof_url}
                target="_blank"
                rel="noopener noreferrer"
                sx={{
                  display: 'block',
                  borderRadius: 1,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { borderColor: 'primary.main' },
                }}
              >
                {link.payment_proof_url.match(/\.(pdf)$/i) ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5 }}>
                    <Typography variant="body2" color="primary">View Payment Proof (PDF)</Typography>
                  </Box>
                ) : (
                  <Box
                    component="img"
                    src={link.payment_proof_url}
                    alt="Payment proof"
                    sx={{ width: '100%', maxHeight: 200, objectFit: 'contain', bgcolor: 'grey.50' }}
                  />
                )}
              </Box>
            </>
          )}

          {link.admin_notes && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5, color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                Admin Notes
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                {link.admin_notes}
              </Typography>
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between' }}>
          {showRegenerateButton && adminId ? (
            <Button
              startIcon={<RefreshIcon />}
              onClick={() => setRegenerateDialogOpen(true)}
              disabled={regenerating}
              sx={{ borderRadius: 1, textTransform: 'none' }}
            >
              Regenerate Link
            </Button>
          ) : (
            <Box />
          )}
          <Button
            onClick={onClose}
            sx={{ borderRadius: 1, textTransform: 'none' }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Regenerate Confirmation Dialog */}
      <ConfirmDialog
        open={regenerateDialogOpen}
        onClose={() => setRegenerateDialogOpen(false)}
        onConfirm={handleRegenerate}
        title="Regenerate Enrollment Link"
        message={`This will cancel the current link and create a new one with the same enrollment data for ${link.student_name}. The new link will be valid for 7 days.`}
        confirmLabel={regenerating ? 'Regenerating...' : 'Regenerate'}
        confirmColor="primary"
        loading={regenerating}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar({ open: false, message: '' })}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </>
  );
}

function DetailRow({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: 'success' | 'error';
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        fontWeight={500}
        sx={{
          color: highlight === 'success' ? '#2E7D32' : highlight === 'error' ? '#C62828' : 'text.primary',
        }}
      >
        {value}
      </Typography>
    </Box>
  );
}
