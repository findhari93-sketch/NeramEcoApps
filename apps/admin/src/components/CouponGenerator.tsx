'use client';

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  IconButton,
  Tooltip,
} from '@neram/ui';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import RefreshIcon from '@mui/icons-material/Refresh';

interface CouponGeneratorProps {
  leadName: string;
  leadId: string;
  onGenerate: (couponData: CouponData) => void;
}

export interface CouponData {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  expiresAt: string;
  maxUses: number;
}

export default function CouponGenerator({
  leadName,
  leadId,
  onGenerate,
}: CouponGeneratorProps) {
  const [couponCode, setCouponCode] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState(10);
  const [expiresIn, setExpiresIn] = useState(7); // days
  const [maxUses, setMaxUses] = useState(1);
  const [copied, setCopied] = useState(false);

  const generateCode = () => {
    // Generate unique coupon code
    const prefix = leadName.substring(0, 3).toUpperCase().replace(/[^A-Z]/g, 'N');
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `${prefix}${timestamp.slice(-4)}${random}`;
    setCouponCode(code);
    return code;
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(couponCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerate = () => {
    const code = couponCode || generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresIn);

    onGenerate({
      code,
      discountType,
      discountValue,
      expiresAt: expiresAt.toISOString(),
      maxUses,
    });
  };

  return (
    <Paper sx={{ p: 3 }}>
      <Typography variant="h6" gutterBottom>
        Generate Coupon Code
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create a unique coupon code for this student to use at payment
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              label="Coupon Code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
              placeholder="Click Generate to create code"
              InputProps={{
                endAdornment: couponCode && (
                  <Tooltip title={copied ? 'Copied!' : 'Copy code'}>
                    <IconButton onClick={handleCopy} size="small">
                      <ContentCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />
            <Button
              variant="outlined"
              onClick={generateCode}
              startIcon={<RefreshIcon />}
            >
              Generate
            </Button>
          </Box>
        </Grid>

        <Grid item xs={12} sm={6}>
          <FormControl fullWidth>
            <InputLabel>Discount Type</InputLabel>
            <Select
              value={discountType}
              label="Discount Type"
              onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            >
              <MenuItem value="percentage">Percentage Off</MenuItem>
              <MenuItem value="fixed">Fixed Amount Off</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={discountType === 'percentage' ? 'Discount %' : 'Discount Amount (Rs.)'}
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
            inputProps={{
              min: 1,
              max: discountType === 'percentage' ? 100 : 50000,
            }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Expires In (Days)"
            type="number"
            value={expiresIn}
            onChange={(e) => setExpiresIn(parseInt(e.target.value) || 7)}
            inputProps={{ min: 1, max: 90 }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label="Max Uses"
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(parseInt(e.target.value) || 1)}
            inputProps={{ min: 1, max: 10 }}
            helperText="Usually 1 for individual coupons"
          />
        </Grid>

        <Grid item xs={12}>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              This coupon will give{' '}
              <strong>
                {discountType === 'percentage'
                  ? `${discountValue}% off`
                  : `Rs. ${discountValue} off`}
              </strong>
              {' '}and expire in <strong>{expiresIn} days</strong>.
            </Typography>
          </Alert>

          <Button
            variant="contained"
            onClick={handleGenerate}
            disabled={!couponCode}
            fullWidth
          >
            Save Coupon & Send to Student
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );
}
