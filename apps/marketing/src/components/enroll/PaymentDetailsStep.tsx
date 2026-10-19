'use client';

import {
  Box,
  Typography,
  TextField,
  Paper,
  Divider,
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
  /** Set by the office on the link; the student does not choose it. */
  paymentScheme?: 'full' | 'installment' | null;
  balanceDueDate?: string | null;
}

function formatDay(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
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
          <Box display="flex" justifyContent="space-between" py={0.5} gap={2}>
            <Typography variant="body2" color="error.main" fontWeight={600}>Balance Due</Typography>
            <Typography variant="body2" color="error.main" fontWeight={600} textAlign="right">
              ₹{Number(balanceDue).toLocaleString('en-IN')}
              {linkData.balanceDueDate ? ` by ${formatDay(linkData.balanceDueDate)}` : ''}
            </Typography>
          </Box>
        )}
        {balanceDue > 0 && (
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            {linkData.balanceDueDate
              ? 'You pay the balance as a second installment. We will remind you a few days before it is due.'
              : 'You pay the balance as a second installment. Our team will confirm the date with you.'}
          </Typography>
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
