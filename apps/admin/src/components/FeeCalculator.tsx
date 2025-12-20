'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Alert,
  Chip,
  Stack,
} from '@neram/ui';

interface FeeCalculatorProps {
  baseFee: number;
  scholarshipPercentage: number;
  scholarshipVerified: boolean;
  cashbackEligible: number;
  onChange: (feeDetails: FeeDetails) => void;
}

export interface FeeDetails {
  baseFee: number;
  discountType: 'none' | 'percentage' | 'fixed' | 'scholarship';
  discountValue: number;
  discountAmount: number;
  couponCode: string | null;
  finalFee: number;
  paymentScheme: 'full' | 'installment';
  installment1: number;
  installment2: number;
  totalCashback: number;
}

const courseBaseFees: Record<string, number> = {
  nata: 25000,
  jee_paper2: 30000,
  both: 45000,
};

export default function FeeCalculator({
  baseFee,
  scholarshipPercentage,
  scholarshipVerified,
  cashbackEligible,
  onChange,
}: FeeCalculatorProps) {
  const [feeDetails, setFeeDetails] = useState<FeeDetails>({
    baseFee,
    discountType: scholarshipVerified && scholarshipPercentage > 0 ? 'scholarship' : 'none',
    discountValue: scholarshipPercentage,
    discountAmount: 0,
    couponCode: null,
    finalFee: baseFee,
    paymentScheme: 'full',
    installment1: 0,
    installment2: 0,
    totalCashback: cashbackEligible,
  });

  const [customBaseFee, setCustomBaseFee] = useState(baseFee);
  const [customDiscount, setCustomDiscount] = useState(0);

  useEffect(() => {
    calculateFees();
  }, [feeDetails.discountType, feeDetails.discountValue, customBaseFee, feeDetails.paymentScheme]);

  const calculateFees = () => {
    let discountAmount = 0;
    const base = customBaseFee || baseFee;

    switch (feeDetails.discountType) {
      case 'scholarship':
        discountAmount = Math.round((base * scholarshipPercentage) / 100);
        break;
      case 'percentage':
        discountAmount = Math.round((base * customDiscount) / 100);
        break;
      case 'fixed':
        discountAmount = customDiscount;
        break;
      default:
        discountAmount = 0;
    }

    let finalFee = Math.max(0, base - discountAmount);

    // For installment, no discount applied (as per requirement)
    if (feeDetails.paymentScheme === 'installment') {
      finalFee = base;
      discountAmount = 0;
    }

    const installment1 = Math.ceil(finalFee / 2);
    const installment2 = finalFee - installment1;

    const newDetails: FeeDetails = {
      ...feeDetails,
      baseFee: base,
      discountAmount,
      discountValue: feeDetails.discountType === 'scholarship' ? scholarshipPercentage : customDiscount,
      finalFee,
      installment1,
      installment2,
      totalCashback: cashbackEligible,
    };

    setFeeDetails(newDetails);
    onChange(newDetails);
  };

  const handleDiscountTypeChange = (type: FeeDetails['discountType']) => {
    setFeeDetails((prev) => ({ ...prev, discountType: type }));
    if (type === 'scholarship') {
      setCustomDiscount(scholarshipPercentage);
    } else if (type === 'none') {
      setCustomDiscount(0);
    }
  };

  const handlePaymentSchemeChange = (scheme: 'full' | 'installment') => {
    setFeeDetails((prev) => ({ ...prev, paymentScheme: scheme }));
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Fee Calculator
      </Typography>

      <Grid container spacing={3}>
        {/* Base Fee */}
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Base Course Fee"
            type="number"
            value={customBaseFee}
            onChange={(e) => setCustomBaseFee(parseFloat(e.target.value) || 0)}
            InputProps={{
              startAdornment: <Typography sx={{ mr: 1 }}>Rs.</Typography>,
            }}
          />
        </Grid>

        {/* Discount Type */}
        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Discount Type</InputLabel>
            <Select
              value={feeDetails.discountType}
              label="Discount Type"
              onChange={(e) => handleDiscountTypeChange(e.target.value as FeeDetails['discountType'])}
            >
              <MenuItem value="none">No Discount</MenuItem>
              <MenuItem value="percentage">Custom Percentage</MenuItem>
              <MenuItem value="fixed">Fixed Amount</MenuItem>
              {scholarshipVerified && scholarshipPercentage > 0 && (
                <MenuItem value="scholarship">
                  Scholarship ({scholarshipPercentage}%)
                </MenuItem>
              )}
            </Select>
          </FormControl>
        </Grid>

        {/* Custom Discount Value */}
        {(feeDetails.discountType === 'percentage' || feeDetails.discountType === 'fixed') && (
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label={feeDetails.discountType === 'percentage' ? 'Discount %' : 'Discount Amount'}
              type="number"
              value={customDiscount}
              onChange={(e) => {
                setCustomDiscount(parseFloat(e.target.value) || 0);
              }}
              InputProps={{
                endAdornment: feeDetails.discountType === 'percentage' ? '%' : undefined,
                startAdornment: feeDetails.discountType === 'fixed' ? <Typography sx={{ mr: 1 }}>Rs.</Typography> : undefined,
              }}
            />
          </Grid>
        )}

        {/* Payment Scheme */}
        <Grid item xs={12}>
          <Typography variant="subtitle2" gutterBottom>
            Payment Scheme
          </Typography>
          <Stack direction="row" spacing={2}>
            <Chip
              label="Full Payment (with discount)"
              onClick={() => handlePaymentSchemeChange('full')}
              color={feeDetails.paymentScheme === 'full' ? 'primary' : 'default'}
              variant={feeDetails.paymentScheme === 'full' ? 'filled' : 'outlined'}
            />
            <Chip
              label="2 Installments (no discount)"
              onClick={() => handlePaymentSchemeChange('installment')}
              color={feeDetails.paymentScheme === 'installment' ? 'primary' : 'default'}
              variant={feeDetails.paymentScheme === 'installment' ? 'filled' : 'outlined'}
            />
          </Stack>
        </Grid>

        <Grid item xs={12}>
          <Divider sx={{ my: 2 }} />
        </Grid>

        {/* Fee Summary */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Fee Summary
            </Typography>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography>Base Fee:</Typography>
              <Typography>Rs. {customBaseFee.toLocaleString()}</Typography>
            </Box>

            {feeDetails.discountAmount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1, color: 'success.main' }}>
                <Typography>
                  Discount ({feeDetails.discountType === 'scholarship' ? `${scholarshipPercentage}% Scholarship` : `${feeDetails.discountValue}${feeDetails.discountType === 'percentage' ? '%' : ''}`}):
                </Typography>
                <Typography>- Rs. {feeDetails.discountAmount.toLocaleString()}</Typography>
              </Box>
            )}

            <Divider sx={{ my: 1 }} />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography fontWeight={600}>Final Fee:</Typography>
              <Typography fontWeight={600} color="primary">
                Rs. {feeDetails.finalFee.toLocaleString()}
              </Typography>
            </Box>

            {feeDetails.paymentScheme === 'installment' && (
              <>
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2 }}>
                  Installment Breakdown:
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">1st Installment (at enrollment):</Typography>
                  <Typography variant="body2">Rs. {feeDetails.installment1.toLocaleString()}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">2nd Installment (after 30 days):</Typography>
                  <Typography variant="body2">Rs. {feeDetails.installment2.toLocaleString()}</Typography>
                </Box>
              </>
            )}

            {cashbackEligible > 0 && (
              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  Student eligible for Rs. {cashbackEligible} cashback (to be processed after enrollment)
                </Typography>
              </Alert>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Paper>
  );
}
