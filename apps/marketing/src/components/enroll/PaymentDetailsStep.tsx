'use client';

import { useState, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Paper,
  Divider,
  RadioGroup,
  FormControlLabel,
  Radio,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Alert,
} from '@neram/ui';
import {
  CloudUpload,
  Delete,
  PictureAsPdf,
  Image as ImageIcon,
  CurrencyRupee,
} from '@mui/icons-material';
import { getCurrentUser } from '@neram/auth';
import type { PaymentDetailsData } from '@/components/apply/types';

const PAYMENT_METHODS = [
  { value: 'upi_direct', label: 'UPI (GPay / PhonePe / Paytm)' },
  { value: 'bank_transfer', label: 'Bank Transfer (NEFT / IMPS)' },
  { value: 'cash', label: 'Cash' },
];

interface LinkData {
  totalFee: number;
  discountAmount: number;
  finalFee: number;
  amountPaid: number;
  paymentMethod?: string | null;
}

interface PaymentDetailsStepProps {
  payment: PaymentDetailsData;
  updatePayment: (data: Partial<PaymentDetailsData>) => void;
  linkData: LinkData;
  token: string;
}

export default function PaymentDetailsStep({
  payment,
  updatePayment,
  linkData,
  token,
}: PaymentDetailsStepProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const balanceDue = Math.max(0, linkData.finalFee - linkData.amountPaid);
  const showTransactionRef = payment.paymentMethod !== 'cash' && payment.paymentMethod !== '';

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so same file can be re-selected
    e.target.value = '';

    setUploadError(null);
    setUploading(true);

    try {
      const firebaseUser = getCurrentUser();
      const idToken = await firebaseUser?.getIdToken();

      const formData = new FormData();
      formData.append('file', file);
      formData.append('token', token);

      const res = await fetch('/api/enroll/upload-proof', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      updatePayment({
        paymentProofUrl: data.url,
        paymentProofFileName: data.fileName || file.name,
      });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveProof = () => {
    updatePayment({
      paymentProofUrl: null,
      paymentProofFileName: null,
    });
  };

  const isImage = payment.paymentProofFileName
    ? /\.(jpe?g|png|webp)$/i.test(payment.paymentProofFileName)
    : false;

  return (
    <Box>
      <Typography variant="h6" fontWeight={600} mb={2}>
        Payment Details
      </Typography>

      {/* Fee Summary */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          mb: 3,
          bgcolor: 'primary.50',
          border: '1px solid',
          borderColor: 'primary.200',
          borderRadius: 1,
        }}
      >
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <CurrencyRupee fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={600} color="primary.main">
            Fee Summary
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" py={0.5}>
          <Typography variant="body2" color="text.secondary">Total Fee</Typography>
          <Typography variant="body2" fontWeight={500}>
            ₹{Number(linkData.totalFee).toLocaleString('en-IN')}
          </Typography>
        </Box>
        {linkData.discountAmount > 0 && (
          <Box display="flex" justifyContent="space-between" py={0.5}>
            <Typography variant="body2" color="text.secondary">Discount</Typography>
            <Typography variant="body2" fontWeight={500} color="success.main">
              -₹{Number(linkData.discountAmount).toLocaleString('en-IN')}
            </Typography>
          </Box>
        )}
        <Divider sx={{ my: 1 }} />
        <Box display="flex" justifyContent="space-between" py={0.5}>
          <Typography variant="body2" fontWeight={700}>Final Fee</Typography>
          <Typography variant="body2" fontWeight={700}>
            ₹{Number(linkData.finalFee).toLocaleString('en-IN')}
          </Typography>
        </Box>
        <Box display="flex" justifyContent="space-between" py={0.5}>
          <Typography variant="body2" color="success.main" fontWeight={600}>Amount Paid</Typography>
          <Typography variant="body2" color="success.main" fontWeight={600}>
            ₹{Number(linkData.amountPaid).toLocaleString('en-IN')}
          </Typography>
        </Box>
        {balanceDue > 0 && (
          <Box display="flex" justifyContent="space-between" py={0.5}>
            <Typography variant="body2" color="error.main" fontWeight={600}>Balance Due</Typography>
            <Typography variant="body2" color="error.main" fontWeight={600}>
              ₹{Number(balanceDue).toLocaleString('en-IN')}
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Payment Date */}
      <TextField
        label="Payment Date"
        type="date"
        value={payment.paymentDate}
        onChange={(e) => updatePayment({ paymentDate: e.target.value })}
        fullWidth
        required
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: new Date().toISOString().split('T')[0] }}
        sx={{ mb: 3, '& .MuiInputBase-root': { minHeight: 48 } }}
      />

      {/* Payment Type */}
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        Payment Type
      </Typography>
      <RadioGroup
        value={payment.paymentType}
        onChange={(e) => updatePayment({
          paymentType: e.target.value as 'full' | 'installment',
          installmentNumber: e.target.value === 'full' ? 1 : payment.installmentNumber,
        })}
        sx={{ mb: 2 }}
      >
        <FormControlLabel
          value="full"
          control={<Radio />}
          label="Full Payment"
          sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.95rem' } }}
        />
        <FormControlLabel
          value="installment"
          control={<Radio />}
          label="Installment"
          sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.95rem' } }}
        />
      </RadioGroup>

      {/* Installment Number */}
      {payment.paymentType === 'installment' && (
        <FormControl fullWidth sx={{ mb: 3 }}>
          <InputLabel>Installment Number</InputLabel>
          <Select
            value={payment.installmentNumber}
            label="Installment Number"
            onChange={(e) => updatePayment({ installmentNumber: Number(e.target.value) })}
            sx={{ minHeight: 48 }}
          >
            <MenuItem value={1}>1st Installment</MenuItem>
            <MenuItem value={2}>2nd Installment</MenuItem>
          </Select>
        </FormControl>
      )}

      {/* Payment Method */}
      <FormControl fullWidth required sx={{ mb: 3 }}>
        <InputLabel>Payment Method</InputLabel>
        <Select
          value={payment.paymentMethod}
          label="Payment Method"
          onChange={(e) => updatePayment({ paymentMethod: e.target.value })}
          sx={{ minHeight: 48 }}
        >
          {PAYMENT_METHODS.map((m) => (
            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Transaction Reference */}
      {showTransactionRef && (
        <TextField
          label="Transaction Reference / UTR Number"
          value={payment.transactionReference}
          onChange={(e) => updatePayment({ transactionReference: e.target.value })}
          fullWidth
          placeholder="Enter UTR or transaction ID"
          helperText="Optional — helps us verify your payment faster"
          sx={{ mb: 3, '& .MuiInputBase-root': { minHeight: 48 } }}
        />
      )}

      {/* Payment Proof Upload */}
      <Typography variant="subtitle2" fontWeight={600} mb={1}>
        Payment Proof
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={1.5}>
        Upload a screenshot or photo of your payment receipt (JPEG, PNG, or PDF, max 5MB)
      </Typography>

      {uploadError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
          {uploadError}
        </Alert>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {!payment.paymentProofUrl ? (
        /* Upload area */
        <Box
          onClick={() => !uploading && fileInputRef.current?.click()}
          sx={{
            border: '2px dashed',
            borderColor: 'grey.400',
            borderRadius: 2,
            p: 3,
            minHeight: 120,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: uploading ? 'default' : 'pointer',
            bgcolor: 'grey.50',
            transition: 'all 0.2s',
            '&:hover': uploading ? {} : {
              borderColor: 'primary.main',
              bgcolor: 'primary.50',
            },
            '&:active': uploading ? {} : {
              transform: 'scale(0.98)',
            },
          }}
        >
          {uploading ? (
            <>
              <CircularProgress size={32} sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                Uploading...
              </Typography>
            </>
          ) : (
            <>
              <CloudUpload sx={{ fontSize: 40, color: 'grey.500', mb: 1 }} />
              <Typography variant="body2" fontWeight={500}>
                Tap to upload receipt
              </Typography>
              <Typography variant="caption" color="text.secondary">
                JPEG, PNG, or PDF (max 5MB)
              </Typography>
            </>
          )}
        </Box>
      ) : (
        /* Uploaded file preview */
        <Paper
          elevation={0}
          sx={{
            p: 2,
            border: '1px solid',
            borderColor: 'success.light',
            borderRadius: 2,
            bgcolor: 'success.50',
          }}
        >
          <Box display="flex" alignItems="center" gap={2}>
            {isImage ? (
              <Box
                component="img"
                src={payment.paymentProofUrl}
                alt="Payment proof"
                sx={{
                  width: 64,
                  height: 64,
                  objectFit: 'cover',
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: 'error.50',
                  borderRadius: 1,
                }}
              >
                <PictureAsPdf sx={{ fontSize: 32, color: 'error.main' }} />
              </Box>
            )}
            <Box flex={1} minWidth={0}>
              <Typography variant="body2" fontWeight={600} noWrap>
                {payment.paymentProofFileName || 'Payment proof'}
              </Typography>
              <Typography variant="caption" color="success.main">
                Uploaded successfully
              </Typography>
            </Box>
            <IconButton
              onClick={handleRemoveProof}
              size="small"
              sx={{ color: 'error.main' }}
            >
              <Delete />
            </IconButton>
          </Box>
        </Paper>
      )}
    </Box>
  );
}
