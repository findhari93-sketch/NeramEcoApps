'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  Chip,
  Divider,
} from '@neram/ui';

interface Payment {
  id: string;
  studentName: string;
  studentEmail: string;
  studentPhone: string;
  amount: number;
  course: string;
  paymentMethod: string;
  status: 'pending' | 'verified' | 'failed';
  transactionId: string;
  createdAt: string;
  screenshot?: string;
}

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [payment] = useState<Payment>({
    id: params.id,
    studentName: 'John Doe',
    studentEmail: 'john@example.com',
    studentPhone: '+91 9876543210',
    amount: 25000,
    course: 'JEE Mains',
    paymentMethod: 'UPI',
    status: 'pending',
    transactionId: 'TXN123456789',
    createdAt: '2024-01-15',
  });

  const [notes, setNotes] = useState('');

  const handleVerify = async () => {
    console.log('Verifying payment:', payment.id, notes);
    // API call to verify payment
    router.push('/payments');
  };

  const handleReject = async () => {
    console.log('Rejecting payment:', payment.id, notes);
    // API call to reject payment
    router.push('/payments');
  };

  return (
    <Box>
      <Button
        onClick={() => router.back()}
        sx={{ mb: 3 }}
        variant="outlined"
      >
        Back to Payments
      </Button>

      <Typography variant="h4" component="h1" gutterBottom fontWeight="bold">
        Payment Verification
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Review and verify payment details
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Payment Details
            </Typography>
            <Divider sx={{ my: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Transaction ID
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.transactionId}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Status
                </Typography>
                <Chip
                  label={payment.status}
                  color={
                    payment.status === 'verified'
                      ? 'success'
                      : payment.status === 'failed'
                      ? 'error'
                      : 'warning'
                  }
                  size="small"
                />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Amount
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="primary">
                  ₹{payment.amount.toLocaleString()}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Payment Method
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.paymentMethod}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Course
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.course}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Date
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.createdAt}
                </Typography>
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            <Typography variant="h6" gutterBottom>
              Student Details
            </Typography>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary">
                  Name
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.studentName}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.studentEmail}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary">
                  Phone
                </Typography>
                <Typography variant="body1" fontWeight="medium">
                  {payment.studentPhone}
                </Typography>
              </Grid>
            </Grid>

            <Divider sx={{ my: 3 }} />

            <TextField
              label="Verification Notes"
              multiline
              rows={4}
              fullWidth
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this payment verification..."
            />

            <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
              <Button
                variant="contained"
                color="success"
                onClick={handleVerify}
              >
                Verify Payment
              </Button>
              <Button
                variant="outlined"
                color="error"
                onClick={handleReject}
              >
                Reject Payment
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Payment Screenshot
            </Typography>
            <Box
              sx={{
                width: '100%',
                height: 300,
                bgcolor: 'grey.200',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 1,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                Screenshot not available
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
