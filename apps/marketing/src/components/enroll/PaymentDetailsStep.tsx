'use client';

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
  ImageUploadField,
} from '@neram/ui';
import { CurrencyRupee } from '@mui/icons-material';
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
  const balanceDue = Math.max(0, linkData.finalFee - linkData.amountPaid);
  const showTransactionRef = payment.paymentMethod !== 'cash' && payment.paymentMethod !== '';

  // Injected uploader: same endpoint/auth (Firebase idToken) + enroll token as before.
  const uploadProof = async (file: File): Promise<{ url: string }> => {
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

    // Keep the file name alongside the url (used elsewhere in the wizard).
    updatePayment({ paymentProofFileName: data.fileName || file.name });
    return { url: data.url };
  };

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
          helperText="Optional. Helps us verify your payment faster"
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

      <ImageUploadField
        value={payment.paymentProofUrl || null}
        onChange={(url) =>
          url
            ? updatePayment({ paymentProofUrl: url })
            : updatePayment({ paymentProofUrl: null, paymentProofFileName: null })
        }
        upload={uploadProof}
        accept="image/*,.pdf"
        maxSizeMB={5}
        helperText="Tap to upload receipt"
      />
    </Box>
  );
}
