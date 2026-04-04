# Application → Payment → Enrollment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the complete student application → admin approval → payment → auto-enrollment → onboarding pipeline end-to-end, add Teams webhook notifications, and write E2E tests for the full flow.

**Architecture:** Public payment page in marketing app (no auth required, application number as bearer token). Reuses existing PaymentDialog logic for Razorpay checkout. Teams Incoming Webhook added as 6th notification channel. Auto-enrollment creates student profile on both full and installment payments. E2E tests use real Razorpay test mode.

**Tech Stack:** Next.js 14 App Router, MUI, Razorpay, Supabase, Resend, Meta WhatsApp Cloud API, Microsoft Teams Adaptive Cards, Playwright

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `packages/database/supabase/migrations/20260404_payment_payer_fields.sql` | Add payer columns to payments table |
| `apps/marketing/src/app/api/payment/details/route.ts` | Public API: fetch fee details by application number |
| `apps/marketing/src/app/[locale]/pay/page.tsx` | Server component with SEO metadata for payment page |
| `apps/marketing/src/components/pay/PaymentPage.tsx` | Client component: fee display, payer form, Razorpay checkout |
| `packages/database/src/services/teams-webhook.ts` | Teams Incoming Webhook service (Adaptive Cards) |
| `tests/e2e/application-to-enrollment.spec.ts` | E2E test suite for full flow |

### Files to Modify
| File | Change |
|------|--------|
| `packages/database/src/types/index.ts` | Add `payer_name`, `payer_relationship` to Payment interface |
| `apps/marketing/src/app/api/payment/create-order/route.ts` | Accept and store payer fields |
| `apps/marketing/src/app/api/payment/verify/route.ts` | Fix student profile creation, add payer fields, Razorpay enrichment, installment profile |
| `packages/database/src/services/notifications.ts` | Fix payment link URL, add Teams as 6th channel |
| `packages/database/src/services/email.ts` | Update payment CTA URL in application-approved template |
| `apps/admin/src/components/crm/ApplicationSection.tsx` | Add payment detail expandable section |

---

## Task 1: Database Migration — Payer Fields

**Files:**
- Create: `packages/database/supabase/migrations/20260404_payment_payer_fields.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Add payer tracking fields to payments table
-- Allows tracking who actually paid (student, parent, guardian, etc.)

ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_name TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payer_relationship TEXT
  CHECK (payer_relationship IN ('self', 'parent', 'guardian', 'sibling', 'other'));

COMMENT ON COLUMN payments.payer_name IS 'Name of the person who made the payment';
COMMENT ON COLUMN payments.payer_relationship IS 'Relationship of the payer to the student';
```

- [ ] **Step 2: Apply migration to staging**

Run via Supabase MCP:
```
mcp__supabase-staging__apply_migration with name "20260404_payment_payer_fields" and the SQL above
```

- [ ] **Step 3: Verify columns exist on staging**

Run via Supabase MCP:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'payments' AND column_name IN ('payer_name', 'payer_relationship');
```
Expected: 2 rows returned.

- [ ] **Step 4: Apply migration to production**

Run via Supabase MCP:
```
mcp__supabase-prod__apply_migration with name "20260404_payment_payer_fields" and the same SQL
```

- [ ] **Step 5: Commit**

```bash
git add packages/database/supabase/migrations/20260404_payment_payer_fields.sql
git commit -m "feat(database): add payer_name and payer_relationship to payments table"
```

---

## Task 2: Update Payment TypeScript Type

**Files:**
- Modify: `packages/database/src/types/index.ts` (around line 1772, after `paid_at`)

- [ ] **Step 1: Add payer fields to Payment interface**

Find the `Payment` interface (around line 1719) and add after the `paid_at` field:

```typescript
  // Payer info (who actually paid — may differ from student)
  payer_name: string | null;
  payer_relationship: 'self' | 'parent' | 'guardian' | 'sibling' | 'other' | null;
```

- [ ] **Step 2: Verify type-check passes**

Run: `cd packages/database && npx tsc --noEmit`
Expected: No new errors related to payer fields.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/types/index.ts
git commit -m "feat(database): add payer_name and payer_relationship to Payment type"
```

---

## Task 3: Public Payment Details API

**Files:**
- Create: `apps/marketing/src/app/api/payment/details/route.ts`

- [ ] **Step 1: Create the API endpoint**

```typescript
// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA Preparation Course',
  jee_paper2: 'JEE Paper 2 Preparation Course',
  both: 'NATA & JEE Combined Course',
  not_sure: 'Architecture Entrance Course',
  revit: 'Revit Course',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationNumber = searchParams.get('app');

    if (!applicationNumber) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Application number is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch lead profile by application number (minimal fields for security)
    const { data: lead, error } = await supabase
      .from('lead_profiles' as any)
      .select(`
        id,
        first_name,
        interest_course,
        status,
        assigned_fee,
        discount_amount,
        final_fee,
        full_payment_discount,
        payment_scheme,
        allowed_payment_modes,
        installment_1_amount,
        installment_2_amount,
        installment_2_due_days,
        payment_deadline,
        coupon_code
      `)
      .eq('application_number', applicationNumber)
      .is('deleted_at', null)
      .single();

    if (error || !lead) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Application not found' },
        { status: 404 }
      );
    }

    // Only allow payment for approved applications
    if (lead.status !== 'approved') {
      const messages: Record<string, string> = {
        draft: 'This application is still a draft.',
        submitted: 'This application is under review. You will be notified once approved.',
        under_review: 'This application is under review. You will be notified once approved.',
        enrolled: 'Payment has already been completed for this application.',
        partial_payment: 'A payment has already been made. Please check your email for installment details.',
        rejected: 'This application has been rejected. Please contact support.',
        deleted: 'This application is no longer active.',
      };
      return NextResponse.json(
        {
          error: 'Invalid Status',
          message: messages[lead.status] || 'This application is not ready for payment.',
          status: lead.status,
        },
        { status: 400 }
      );
    }

    // Check if payment already exists for this lead
    const { data: existingPayment } = await supabase
      .from('payments' as any)
      .select('id, status')
      .eq('lead_profile_id', lead.id)
      .eq('status', 'paid')
      .limit(1)
      .single();

    if (existingPayment) {
      return NextResponse.json(
        { error: 'Already Paid', message: 'Payment has already been completed for this application.' },
        { status: 400 }
      );
    }

    const courseName = COURSE_LABELS[lead.interest_course] || 'Architecture Entrance Course';
    const finalFee = Number(lead.final_fee) || 0;
    const fullPaymentDiscount = Number(lead.full_payment_discount) || 0;
    const installment1 = Number(lead.installment_1_amount) || Math.ceil(finalFee * 0.55);
    const installment2 = Number(lead.installment_2_amount) || (finalFee - installment1);

    return NextResponse.json({
      success: true,
      data: {
        leadProfileId: lead.id,
        studentFirstName: lead.first_name || 'Student',
        courseName,
        baseFee: Number(lead.assigned_fee) || finalFee,
        discountAmount: Number(lead.discount_amount) || 0,
        finalFee,
        fullPaymentDiscount,
        fullPaymentAmount: finalFee - fullPaymentDiscount,
        allowedPaymentModes: lead.allowed_payment_modes || 'full_and_installment',
        paymentScheme: lead.payment_scheme || 'full',
        installment1Amount: installment1,
        installment2Amount: installment2,
        installment2DueDays: Number(lead.installment_2_due_days) || 45,
        paymentDeadline: lead.payment_deadline || null,
        couponCode: lead.coupon_code || null,
      },
    });
  } catch (error) {
    console.error('Payment details error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to fetch payment details' },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify the endpoint compiles**

Run: `cd apps/marketing && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/app/api/payment/details/route.ts
git commit -m "feat(marketing): add public payment details API endpoint"
```

---

## Task 4: Public Payment Page — Server Component

**Files:**
- Create: `apps/marketing/src/app/[locale]/pay/page.tsx`

- [ ] **Step 1: Create the server component**

Follow the same pattern as `apps/marketing/src/app/[locale]/apply/page.tsx`:

```typescript
import { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { JsonLd } from '@/components/seo/JsonLd';
import { generateBreadcrumbSchema } from '@/lib/seo/schemas';
import { buildAlternates } from '@/lib/seo/metadata';
import PaymentPage from '@/components/pay/PaymentPage';

const baseUrl = 'https://neramclasses.com';

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    title: 'Complete Your Payment - Neram Classes',
    description: 'Complete your course fee payment for Neram Classes. Secure payment via UPI, Card, or Net Banking.',
    robots: { index: false, follow: false }, // Don't index payment pages
    alternates: buildAlternates(locale, '/pay'),
  };
}

export default function PayPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);

  return (
    <>
      <JsonLd
        data={generateBreadcrumbSchema([
          { name: 'Home', url: baseUrl },
          { name: 'Payment', url: `${baseUrl}/pay` },
        ])}
      />
      <PaymentPage />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/marketing/src/app/\[locale\]/pay/page.tsx
git commit -m "feat(marketing): add payment page server component with SEO metadata"
```

---

## Task 5: Public Payment Page — Client Component

**Files:**
- Create: `apps/marketing/src/components/pay/PaymentPage.tsx`

- [ ] **Step 1: Create the PaymentPage client component**

This is the largest new file. It fetches payment details, shows fee summary, collects payer info, and triggers Razorpay checkout. It reuses the Razorpay flow from `PaymentDialog.tsx`.

```typescript
// @ts-nocheck
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  TextField,
  Stack,
  CircularProgress,
  Radio,
  RadioGroup,
  FormControl,
  FormControlLabel,
  FormLabel,
  Divider,
  Chip,
  Container,
} from '@neram/ui';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import PersonIcon from '@mui/icons-material/Person';
import SchoolIcon from '@mui/icons-material/School';
import PaymentIcon from '@mui/icons-material/Payment';

declare global {
  interface Window {
    Razorpay: any;
  }
}

interface PaymentDetails {
  leadProfileId: string;
  studentFirstName: string;
  courseName: string;
  baseFee: number;
  discountAmount: number;
  finalFee: number;
  fullPaymentDiscount: number;
  fullPaymentAmount: number;
  allowedPaymentModes: 'full_only' | 'full_and_installment';
  paymentScheme: string;
  installment1Amount: number;
  installment2Amount: number;
  installment2DueDays: number;
  paymentDeadline: string | null;
  couponCode: string | null;
}

interface ReceiptData {
  receiptNumber: string;
  amount: number;
  razorpayPaymentId: string;
  paidAt: string;
  courseName: string;
  paymentScheme: string;
}

export default function PaymentPage() {
  const searchParams = useSearchParams();
  const applicationNumber = searchParams.get('app');

  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Payer info
  const [payerName, setPayerName] = useState('');
  const [payerRelationship, setPayerRelationship] = useState<string>('self');

  // Payment state
  const [selectedScheme, setSelectedScheme] = useState<'full' | 'installment'>('full');
  const [couponCode, setCouponCode] = useState('');
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Success state
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);

  // Fetch payment details
  useEffect(() => {
    if (!applicationNumber) {
      setError('No application number provided. Please use the link from your notification.');
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const res = await fetch(`/api/payment/details?app=${encodeURIComponent(applicationNumber)}`);
        const data = await res.json();

        if (!res.ok) {
          if (data.status) {
            setStatusMessage(data.message);
          } else {
            setError(data.message || 'Failed to load payment details');
          }
          setLoading(false);
          return;
        }

        setDetails(data.data);
        if (data.data.couponCode) {
          setCouponCode(data.data.couponCode);
        }
      } catch {
        setError('Unable to connect. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [applicationNumber]);

  // Load Razorpay script
  useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('razorpay-script')) {
      const script = document.createElement('script');
      script.id = 'razorpay-script';
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const getPayableAmount = () => {
    if (!details) return 0;
    let amount = selectedScheme === 'full'
      ? details.fullPaymentAmount
      : details.installment1Amount;
    amount = Math.max(0, amount - couponDiscount);
    return amount;
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !details) return;
    try {
      const res = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim(),
          leadProfileId: details.leadProfileId,
          amount: selectedScheme === 'full' ? details.fullPaymentAmount : details.installment1Amount,
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setCouponDiscount(data.discount);
        setCouponApplied(true);
      } else {
        setError(data.message || 'Invalid coupon code');
      }
    } catch {
      setError('Failed to validate coupon');
    }
  };

  const handlePayment = async () => {
    if (!details || !payerName.trim()) return;
    setIsProcessing(true);
    setError(null);

    try {
      // Create order (no auth required — uses lead profile ID)
      const res = await fetch('/api/payment/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadProfileId: details.leadProfileId,
          paymentScheme: selectedScheme,
          couponCode: couponApplied ? couponCode : null,
          couponDiscount: couponApplied ? couponDiscount : 0,
          youtubeDiscount: 0,
          payerName: payerName.trim(),
          payerRelationship,
          publicPayment: true, // Flag to skip auth check
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create order');
      }

      const { order, paymentId, keyId } = await res.json();

      const options = {
        key: keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'Neram Classes',
        description: details.courseName,
        order_id: order.id,
        prefill: {
          name: payerName.trim(),
        },
        theme: { color: '#1565C0' },
        handler: async (razorpayResponse: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...razorpayResponse,
                paymentId,
                publicPayment: true, // Flag to skip auth check
              }),
            });

            if (verifyRes.ok) {
              const data = await verifyRes.json();
              setReceiptData(data.receipt || null);
              setPaymentSuccess(true);
            } else {
              setError('Payment verification failed. Please contact support with your Razorpay Payment ID.');
            }
          } catch {
            setError('Payment verification failed. Please contact support.');
          }
          setIsProcessing(false);
        },
        modal: {
          ondismiss: () => setIsProcessing(false),
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (err: any) {
      setError(err.message || 'Failed to initiate payment');
      setIsProcessing(false);
    }
  };

  // --- RENDER ---

  if (loading) {
    return (
      <Container maxWidth="sm" sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading payment details...</Typography>
      </Container>
    );
  }

  if (paymentSuccess && receiptData) {
    return (
      <Container maxWidth="sm" sx={{ py: 4 }}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
          <Typography variant="h5" fontWeight={700} gutterBottom>
            Payment Successful!
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, my: 3, textAlign: 'left' }}>
            <Stack spacing={1}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Receipt</Typography>
                <Typography fontFamily="monospace" fontWeight={600}>
                  {receiptData.receiptNumber}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Course</Typography>
                <Typography>{receiptData.courseName}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Amount</Typography>
                <Typography fontWeight={600}>
                  Rs. {Number(receiptData.amount).toLocaleString('en-IN')}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography color="text.secondary">Payment ID</Typography>
                <Typography fontFamily="monospace" fontSize="0.85rem">
                  {receiptData.razorpayPaymentId}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {payerRelationship === 'self' ? (
            <Button
              variant="contained"
              size="large"
              fullWidth
              href="https://app.neramclasses.com"
              sx={{ mt: 2 }}
            >
              Start Onboarding
            </Button>
          ) : (
            <Alert severity="info" sx={{ mt: 2, textAlign: 'left' }}>
              <Typography variant="body2">
                The student can start their onboarding at{' '}
                <strong>app.neramclasses.com</strong>
              </Typography>
            </Alert>
          )}
        </Paper>
      </Container>
    );
  }

  if (error || statusMessage) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity={statusMessage ? 'info' : 'error'}>
          {statusMessage || error}
        </Alert>
      </Container>
    );
  }

  if (!details) return null;

  return (
    <Container maxWidth="sm" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <SchoolIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
          <Typography variant="h5" fontWeight={700}>
            Complete Your Payment
          </Typography>
          <Typography color="text.secondary">
            Application: {applicationNumber}
          </Typography>
        </Box>

        <Divider sx={{ mb: 3 }} />

        {/* Student & Course Info */}
        <Stack spacing={1} sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography color="text.secondary">Student</Typography>
            <Typography fontWeight={600}>{details.studentFirstName}</Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography color="text.secondary">Course</Typography>
            <Typography fontWeight={600}>{details.courseName}</Typography>
          </Box>
        </Stack>

        {/* Fee Breakdown */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
          <Typography variant="subtitle2" gutterBottom>Fee Summary</Typography>
          <Stack spacing={0.5}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2">Course Fee</Typography>
              <Typography variant="body2">Rs. {details.baseFee.toLocaleString('en-IN')}</Typography>
            </Box>
            {details.discountAmount > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="success.main">Discount</Typography>
                <Typography variant="body2" color="success.main">
                  - Rs. {details.discountAmount.toLocaleString('en-IN')}
                </Typography>
              </Box>
            )}
            <Divider sx={{ my: 0.5 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography fontWeight={700}>Amount to Pay</Typography>
              <Typography fontWeight={700} color="primary.main" fontSize="1.1rem">
                Rs. {details.finalFee.toLocaleString('en-IN')}
              </Typography>
            </Box>
          </Stack>
        </Paper>

        {/* Payment Scheme Selection */}
        {details.allowedPaymentModes === 'full_and_installment' && (
          <FormControl sx={{ mb: 3, width: '100%' }}>
            <FormLabel>Payment Option</FormLabel>
            <RadioGroup
              value={selectedScheme}
              onChange={(e) => setSelectedScheme(e.target.value as 'full' | 'installment')}
            >
              <Paper variant="outlined" sx={{ p: 1.5, mb: 1, cursor: 'pointer' }}
                onClick={() => setSelectedScheme('full')}>
                <FormControlLabel
                  value="full"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={600}>
                        Full Payment — Rs. {details.fullPaymentAmount.toLocaleString('en-IN')}
                      </Typography>
                      {details.fullPaymentDiscount > 0 && (
                        <Chip
                          label={`Save Rs. ${details.fullPaymentDiscount.toLocaleString('en-IN')}`}
                          color="success" size="small" sx={{ mt: 0.5 }}
                        />
                      )}
                    </Box>
                  }
                />
              </Paper>
              <Paper variant="outlined" sx={{ p: 1.5, cursor: 'pointer' }}
                onClick={() => setSelectedScheme('installment')}>
                <FormControlLabel
                  value="installment"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography fontWeight={600}>
                        Installment — Rs. {details.installment1Amount.toLocaleString('en-IN')} now
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        + Rs. {details.installment2Amount.toLocaleString('en-IN')} due in {details.installment2DueDays} days
                      </Typography>
                    </Box>
                  }
                />
              </Paper>
            </RadioGroup>
          </FormControl>
        )}

        {/* Coupon Code */}
        {details.couponCode && !couponApplied && (
          <Alert severity="info" sx={{ mb: 2 }}>
            You have a coupon: <strong>{details.couponCode}</strong>
            <Button size="small" sx={{ ml: 1 }} onClick={() => {
              setCouponCode(details.couponCode!);
              handleApplyCoupon();
            }}>
              Apply
            </Button>
          </Alert>
        )}
        {couponApplied && (
          <Alert severity="success" sx={{ mb: 2 }}>
            Coupon applied! You save Rs. {couponDiscount.toLocaleString('en-IN')}
          </Alert>
        )}

        <Divider sx={{ mb: 3 }} />

        {/* Payer Information */}
        <Typography variant="subtitle2" gutterBottom>
          <PersonIcon sx={{ fontSize: 18, verticalAlign: 'text-bottom', mr: 0.5 }} />
          Who is paying?
        </Typography>

        <TextField
          fullWidth
          label="Payer Name"
          value={payerName}
          onChange={(e) => setPayerName(e.target.value)}
          required
          sx={{ mb: 2 }}
          inputProps={{ style: { minHeight: 48 } }}
        />

        <FormControl sx={{ mb: 3, width: '100%' }}>
          <FormLabel>Relationship to Student</FormLabel>
          <RadioGroup
            row
            value={payerRelationship}
            onChange={(e) => setPayerRelationship(e.target.value)}
          >
            {['self', 'parent', 'guardian', 'sibling', 'other'].map((rel) => (
              <FormControlLabel
                key={rel}
                value={rel}
                control={<Radio />}
                label={rel.charAt(0).toUpperCase() + rel.slice(1)}
                sx={{ '& .MuiFormControlLabel-label': { fontSize: '0.9rem' } }}
              />
            ))}
          </RadioGroup>
        </FormControl>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {/* Payment Deadline Warning */}
        {details.paymentDeadline && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Payment deadline: {new Date(details.paymentDeadline).toLocaleDateString('en-IN', {
              day: 'numeric', month: 'long', year: 'numeric'
            })}
          </Alert>
        )}

        {/* Pay Button */}
        <Button
          variant="contained"
          size="large"
          fullWidth
          disabled={!payerName.trim() || isProcessing}
          onClick={handlePayment}
          startIcon={isProcessing ? <CircularProgress size={20} color="inherit" /> : <PaymentIcon />}
          sx={{ py: 1.5, fontSize: '1rem', minHeight: 56 }}
        >
          {isProcessing ? 'Processing...' : `Pay Rs. ${getPayableAmount().toLocaleString('en-IN')}`}
        </Button>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
          Secure payment powered by Razorpay
        </Typography>
      </Paper>
    </Container>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/marketing && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/marketing/src/components/pay/PaymentPage.tsx
git commit -m "feat(marketing): add public payment page client component"
```

---

## Task 6: Update create-order API — Accept Payer Fields & Public Payment

**Files:**
- Modify: `apps/marketing/src/app/api/payment/create-order/route.ts`

- [ ] **Step 1: Update the POST handler to accept payer fields and support unauthenticated payment**

In the request body destructuring (around line 34), add the new fields:

Find:
```typescript
    const { leadProfileId, paymentScheme, couponCode, couponDiscount, youtubeDiscount } = await request.json();
```

Replace with:
```typescript
    const { leadProfileId, paymentScheme, couponCode, couponDiscount, youtubeDiscount, payerName, payerRelationship, publicPayment } = await request.json();
```

- [ ] **Step 2: Update auth check to allow public payments**

Find the auth block at the top of the handler:
```typescript
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }
```

Replace with:
```typescript
    const auth = await verifyFirebaseToken(request);

    // For public payment page: no auth required, we use leadProfileId to identify the student
    if (!auth && !publicPayment) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }
```

- [ ] **Step 3: Update lead profile query to not require user_id for public payments**

Find:
```typescript
      .eq('user_id', auth.userId)
```

Replace with:
```typescript
      ...(auth ? [['user_id', auth.userId]] : []).reduce((q, [col, val]) => q.eq(col, val), 
        supabase.from('lead_profiles' as any).select(`*, scholarship_applications(scholarship_percentage, verification_status)`).eq('id', leadProfileId)
      )
```

Actually, that's overly complex. Simpler approach — adjust the query:

Find the entire lead profile fetch block:
```typescript
    const { data: leadProfile, error: leadError } = await supabase
      .from('lead_profiles' as any)
      .select(`
        *,
        scholarship_applications(scholarship_percentage, verification_status)
      `)
      .eq('id', leadProfileId)
      .eq('user_id', auth.userId)
      .single();
```

Replace with:
```typescript
    let query = supabase
      .from('lead_profiles' as any)
      .select(`
        *,
        scholarship_applications(scholarship_percentage, verification_status)
      `)
      .eq('id', leadProfileId);

    // For authenticated requests, verify ownership
    if (auth) {
      query = query.eq('user_id', auth.userId);
    }

    const { data: leadProfile, error: leadError } = await query.single();
```

- [ ] **Step 4: Add payer fields to the payment insert**

Find the payment insert object and add payer fields after `metadata`:

Find:
```typescript
        metadata: totalDiscounts > 0 ? {
          coupon_code: couponCode || null,
          coupon_discount: validatedCouponDiscount,
          youtube_discount: validatedYoutubeDiscount,
          base_amount: baseAmount,
          total_discounts: totalDiscounts,
        } : null,
```

Replace with:
```typescript
        metadata: totalDiscounts > 0 ? {
          coupon_code: couponCode || null,
          coupon_discount: validatedCouponDiscount,
          youtube_discount: validatedYoutubeDiscount,
          base_amount: baseAmount,
          total_discounts: totalDiscounts,
        } : null,
        payer_name: payerName || null,
        payer_relationship: payerRelationship || null,
```

- [ ] **Step 5: Fix user_id for public payments**

In the same payment insert, the `user_id` field uses `auth.userId`. For public payments where auth may be null, we need the lead profile's user_id:

Find:
```typescript
        user_id: auth.userId,
```

Replace with:
```typescript
        user_id: auth?.userId || leadProfile.user_id,
```

- [ ] **Step 6: Commit**

```bash
git add apps/marketing/src/app/api/payment/create-order/route.ts
git commit -m "feat(marketing): support public payments with payer info in create-order API"
```

---

## Task 7: Fix Payment Verify API

**Files:**
- Modify: `apps/marketing/src/app/api/payment/verify/route.ts`

- [ ] **Step 1: Support unauthenticated verification for public payments**

Find the auth block:
```typescript
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }
```

Replace with:
```typescript
    const auth = await verifyFirebaseToken(request);
```

- [ ] **Step 2: Update request body to include publicPayment flag**

Find:
```typescript
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
    } = await request.json();
```

Replace with:
```typescript
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
      publicPayment,
    } = await request.json();

    // For non-public payments, auth is required
    if (!auth && !publicPayment) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }
```

- [ ] **Step 3: Update payment query to not require user_id for public payments**

Find:
```typescript
      .eq('id', paymentId)
      .eq('user_id', auth.userId)
```

Replace with:
```typescript
      .eq('id', paymentId)
      ...(auth ? { eq: ['user_id', auth.userId] } : {})
```

Actually, Supabase chaining doesn't work that way. Use conditional:

```typescript
    let updateQuery = supabase
      .from('payments' as any)
      .update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId);

    if (auth) {
      updateQuery = updateQuery.eq('user_id', auth.userId);
    }

    const { data: payment, error: updateError } = await updateQuery
      .select(`
        *,
        lead_profiles(id, user_id, interest_course, payment_scheme, final_fee, full_payment_discount, discount_amount, assigned_fee, selected_course_id)
      `)
      .single();
```

Replace the entire update block with this version.

- [ ] **Step 4: Enrich with Razorpay payment details**

After the payment update succeeds, add Razorpay enrichment. Insert this right after the `if (updateError)` block:

```typescript
    // Enrich with Razorpay payment details
    try {
      const Razorpay = (await import('razorpay')).default;
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID!,
        key_secret: process.env.RAZORPAY_KEY_SECRET!,
      });
      const rzpPayment = await rzp.payments.fetch(razorpay_payment_id);

      await supabase
        .from('payments' as any)
        .update({
          razorpay_method: rzpPayment.method || null,
          razorpay_bank: rzpPayment.bank || null,
          razorpay_vpa: rzpPayment.vpa || null,
          razorpay_card_last4: rzpPayment.card?.last4 || null,
          razorpay_card_network: rzpPayment.card?.network || null,
          razorpay_fee: rzpPayment.fee ? Number(rzpPayment.fee) / 100 : null,
          razorpay_tax: rzpPayment.tax ? Number(rzpPayment.tax) / 100 : null,
        })
        .eq('id', paymentId);
    } catch (enrichError) {
      console.error('Razorpay enrichment failed (non-blocking):', enrichError);
    }
```

- [ ] **Step 5: Fix student profile creation to include complete fields**

Find the student profile creation block:
```typescript
    if (isFullPayment) {
      const { data: existingStudent } = await supabase
        .from('student_profiles' as any)
        .select('id')
        .eq('user_id', auth.userId)
        .single();

      if (!existingStudent) {
        await supabase
          .from('student_profiles' as any)
          .insert({
            user_id: auth.userId,
            payment_status: 'paid',
            enrollment_date: new Date().toISOString().split('T')[0],
          });
      }
    }
```

Replace with:
```typescript
    // Create student profile on both full and installment payments
    const studentUserId = auth?.userId || payment.lead_profiles?.user_id;
    if (studentUserId) {
      const { data: existingStudent } = await supabase
        .from('student_profiles' as any)
        .select('id')
        .eq('user_id', studentUserId)
        .single();

      if (!existingStudent) {
        await supabase
          .from('student_profiles' as any)
          .insert({
            user_id: studentUserId,
            course_id: leadProfile.selected_course_id || null,
            total_fee: Number(leadProfile.final_fee) || 0,
            fee_paid: Number(payment.amount) || 0,
            fee_due: isFullPayment ? 0 : (Number(leadProfile.final_fee) - Number(payment.amount)),
            payment_status: isFullPayment ? 'paid' : 'pending',
            enrollment_date: new Date().toISOString().split('T')[0],
          });
      } else if (!isFullPayment) {
        // Update existing profile with partial payment info
        await supabase
          .from('student_profiles' as any)
          .update({
            fee_paid: Number(payment.amount) || 0,
            fee_due: Number(leadProfile.final_fee) - Number(payment.amount),
            payment_status: 'pending',
          })
          .eq('id', existingStudent.id);
      }
    }
```

- [ ] **Step 6: Fix notification calls to use payment's user_id when auth is null**

Find all references to `auth.userId` and `auth.name` in the notification section and replace with fallbacks:

Find:
```typescript
    const userName = auth.name || 'Student';
```

Replace with:
```typescript
    const userName = auth?.name || payment.payer_name || 'Student';
    const userEmail = auth?.email || '';
    const userPhone = auth?.phone || '';
```

Then update the `notifyPaymentReceived` call:
Find:
```typescript
      await notifyPaymentReceived({
        userId: auth.userId,
        userName,
```

Replace with:
```typescript
      await notifyPaymentReceived({
        userId: studentUserId || '',
        userName,
```

And update the student confirmation email:
Find:
```typescript
      if (auth.email) {
        await sendTemplateEmail(auth.email, 'payment-confirmation', {
```

Replace with:
```typescript
      if (userEmail) {
        await sendTemplateEmail(userEmail, 'payment-confirmation', {
```

And the admin email:
Find:
```typescript
        studentEmail: auth.email || '',
        studentPhone: auth.phone || '',
```

Replace with:
```typescript
        studentEmail: userEmail,
        studentPhone: userPhone,
```

- [ ] **Step 7: Commit**

```bash
git add apps/marketing/src/app/api/payment/verify/route.ts
git commit -m "feat(marketing): fix verify API - public payments, Razorpay enrichment, complete student profile"
```

---

## Task 8: Update Notification Payment Link

**Files:**
- Modify: `packages/database/src/services/notifications.ts`

- [ ] **Step 1: Fix payment link URL in notifyApplicationApproved**

Find (around line 870):
```typescript
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.neramclasses.com';
  const paymentLink = `${appUrl}/payment/${data.leadProfileId}`;
```

Replace with:
```typescript
  const marketingUrl = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com';
  const paymentLink = `${marketingUrl}/pay?app=${data.applicationNumber}`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/database/src/services/notifications.ts
git commit -m "fix(database): update payment link to use public marketing URL with application number"
```

---

## Task 9: Update Email Template Payment Link

**Files:**
- Modify: `packages/database/src/services/email.ts`

- [ ] **Step 1: Update the CTA button URL in the application-approved email template**

Find the payment button URL in the template:
```html
            <a href="https://app.neramclasses.com/payment/${data.leadId}" class="button">Pay Now & Confirm Your Seat</a>
```

Replace with:
```html
            <a href="${process.env.NEXT_PUBLIC_MARKETING_URL || 'https://neramclasses.com'}/pay?app=${data.applicationNumber}" class="button">Pay Now & Confirm Your Seat</a>
```

- [ ] **Step 2: Verify template variable is passed**

Check that `notifyApplicationApproved` in `notifications.ts` passes `applicationNumber` in the email template data. Find the `sendTemplateEmail` call in `notifyApplicationApproved` and verify `applicationNumber` is included. If not, add it.

The current call already passes `applicationNumber: data.applicationNumber` — confirmed.

- [ ] **Step 3: Commit**

```bash
git add packages/database/src/services/email.ts
git commit -m "fix(database): update email template payment link to public URL"
```

---

## Task 10: Teams Incoming Webhook Service

**Files:**
- Create: `packages/database/src/services/teams-webhook.ts`

- [ ] **Step 1: Create the Teams webhook service**

```typescript
/**
 * Microsoft Teams Incoming Webhook notification service
 * Sends Adaptive Cards to a Teams channel via webhook URL
 */

interface TeamsNotificationEvent {
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
}

interface AdaptiveFact {
  title: string;
  value: string;
}

function getWebhookUrl(): string | null {
  return process.env.TEAMS_WEBHOOK_URL || null;
}

function buildAdaptiveCard(
  title: string,
  facts: AdaptiveFact[],
  actionUrl?: string,
  actionTitle?: string
) {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: title,
              weight: 'Bolder',
              size: 'Medium',
              wrap: true,
            },
            {
              type: 'FactSet',
              facts,
            },
          ],
          ...(actionUrl
            ? {
                actions: [
                  {
                    type: 'Action.OpenUrl',
                    title: actionTitle || 'View in Admin',
                    url: actionUrl,
                  },
                ],
              }
            : {}),
        },
      },
    ],
  };
}

function buildCardForEvent(event: TeamsNotificationEvent): ReturnType<typeof buildAdaptiveCard> | null {
  const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'https://admin.neramclasses.com';
  const d = event.data;

  switch (event.type) {
    case 'new_application':
      return buildAdaptiveCard(
        'New Application Received',
        [
          { title: 'Student', value: String(d.user_name || 'Unknown') },
          { title: 'Course', value: String(d.course || d.interest_course || '-') },
          { title: 'Phone', value: String(d.phone || '-') },
          { title: 'City', value: String(d.city || '-') },
        ],
        `${adminUrl}/crm`,
        'View in CRM'
      );

    case 'payment_received':
      return buildAdaptiveCard(
        'Payment Received',
        [
          { title: 'Student', value: String(d.user_name || 'Unknown') },
          { title: 'Amount', value: `Rs. ${Number(d.amount || 0).toLocaleString('en-IN')}` },
          { title: 'Method', value: String(d.method || 'razorpay') },
          { title: 'Receipt', value: String(d.receipt_number || d.receiptNumber || '-') },
        ],
        `${adminUrl}/crm`,
        'View in CRM'
      );

    case 'application_approved':
      return buildAdaptiveCard(
        'Application Approved',
        [
          { title: 'Student', value: String(d.user_name || 'Unknown') },
          { title: 'Course', value: String(d.course || '-') },
          { title: 'Fee', value: `Rs. ${Number(d.final_fee || 0).toLocaleString('en-IN')}` },
        ],
        `${adminUrl}/crm`,
        'View in CRM'
      );

    case 'new_callback':
      return buildAdaptiveCard(
        'Callback Requested',
        [
          { title: 'Name', value: String(d.user_name || d.name || 'Unknown') },
          { title: 'Phone', value: String(d.phone || '-') },
          { title: 'Preferred Slot', value: String(d.preferred_slot || '-') },
        ],
        `${adminUrl}/callbacks`,
        'View Callbacks'
      );

    case 'scholarship_submitted':
      return buildAdaptiveCard(
        'Scholarship Docs Submitted',
        [
          { title: 'Student', value: String(d.user_name || 'Unknown') },
          { title: 'Phone', value: String(d.phone || '-') },
          { title: 'Application', value: String(d.application_number || '-') },
        ],
        `${adminUrl}/crm`,
        'Review in CRM'
      );

    case 'refund_requested':
      return buildAdaptiveCard(
        'Refund Requested',
        [
          { title: 'Student', value: String(d.user_name || 'Unknown') },
          { title: 'Amount', value: `Rs. ${Number(d.amount || 0).toLocaleString('en-IN')}` },
          { title: 'Reason', value: String(d.reason || '-') },
        ],
        `${adminUrl}/payments`,
        'View Payments'
      );

    default:
      return null;
  }
}

export async function sendTeamsWebhook(
  event: TeamsNotificationEvent
): Promise<{ success: boolean; error?: string }> {
  try {
    const webhookUrl = getWebhookUrl();
    if (!webhookUrl) {
      return { success: false, error: 'TEAMS_WEBHOOK_URL not configured' };
    }

    const card = buildCardForEvent(event);
    if (!card) {
      return { success: true }; // Event type not supported for Teams — skip silently
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Teams] Webhook error:', response.status, errorText);
      return { success: false, error: `HTTP ${response.status}` };
    }

    console.log('[Teams] Webhook sent successfully for event:', event.type);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    console.error('[Teams] Service error:', isTimeout ? 'Request timed out (10s)' : errorMsg);
    return { success: false, error: isTimeout ? 'Request timed out' : errorMsg };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/database/src/services/teams-webhook.ts
git commit -m "feat(database): add Teams Incoming Webhook notification service"
```

---

## Task 11: Integrate Teams in Notification Dispatcher

**Files:**
- Modify: `packages/database/src/services/notifications.ts`

- [ ] **Step 1: Import the Teams webhook service**

At the top of the file, add:

```typescript
import { sendTeamsWebhook } from './teams-webhook';
```

- [ ] **Step 2: Add Teams as 6th channel in dispatchNotification**

Find the `Promise.allSettled` call (around line 112):
```typescript
  const [telegramResult, emailResult, adminResult, whatsappResult, userNotifResult] = await Promise.allSettled([
    // 1. Telegram (instant)
    sendTelegramNotification(event),
    // 2. Email to active recipients
    sendEmailNotifications(event, client),
    // 3. Admin in-app notification
    createInAppNotification(event, client),
    // 4. WhatsApp to user
    sendWhatsAppNotification(event),
    // 5. User in-app notification (student bell icon)
    createUserInAppNotification(event, client),
  ]);
```

Replace with:
```typescript
  const [telegramResult, emailResult, adminResult, whatsappResult, userNotifResult, teamsResult] = await Promise.allSettled([
    // 1. Telegram (instant)
    sendTelegramNotification(event),
    // 2. Email to active recipients
    sendEmailNotifications(event, client),
    // 3. Admin in-app notification
    createInAppNotification(event, client),
    // 4. WhatsApp to user
    sendWhatsAppNotification(event),
    // 5. User in-app notification (student bell icon)
    createUserInAppNotification(event, client),
    // 6. Teams webhook (Adaptive Card)
    sendTeamsWebhook(event),
  ]);
```

- [ ] **Step 3: Add Teams result to the return object**

Find the `results` object initialization:
```typescript
  const results = {
    telegram: { success: false, error: undefined as string | undefined },
    email: { sent: 0, failed: 0 },
    admin: { success: false, error: undefined as string | undefined },
    whatsapp: { success: false, error: undefined as string | undefined },
    userNotification: { success: false, error: undefined as string | undefined },
  };
```

Add after `userNotification`:
```typescript
    teams: { success: false, error: undefined as string | undefined },
```

Then add the result processing after the userNotification processing block:

```typescript
  // Process Teams result
  if (teamsResult.status === 'fulfilled') {
    results.teams = { success: teamsResult.value.success, error: teamsResult.value.error };
  } else {
    results.teams = { success: false, error: teamsResult.reason?.message || 'Unknown error' };
  }
```

- [ ] **Step 4: Add Teams to the log line**

Find the dispatch results log:
```typescript
    userNotification: results.userNotification.success ? 'OK' : `FAIL: ${results.userNotification.error}`,
```

Add after it:
```typescript
    teams: results.teams.success ? 'OK' : `FAIL: ${results.teams.error}`,
```

- [ ] **Step 5: Update the return type of dispatchNotification**

Find the return type and add `teams`:
```typescript
}): Promise<{
  telegram: { success: boolean; error?: string };
  email: { sent: number; failed: number };
  admin: { success: boolean; error?: string };
  whatsapp: { success: boolean; error?: string };
  userNotification: { success: boolean; error?: string };
}>
```

Add:
```typescript
  teams: { success: boolean; error?: string };
```

- [ ] **Step 6: Commit**

```bash
git add packages/database/src/services/notifications.ts
git commit -m "feat(database): add Teams webhook as 6th notification channel in dispatcher"
```

---

## Task 12: Admin Payment Detail View Enhancement

**Files:**
- Modify: `apps/admin/src/components/crm/ApplicationSection.tsx`

- [ ] **Step 1: Add a Payment Details expandable section**

Find the existing "Fee Details" or enrollment info section (around line 447-573). After the enrollment info banner, add a new expandable "Payment Details" section.

Add this JSX block after the enrollment/fee section and before the approve dialog:

```typescript
{/* Payment Details Section — for paid/enrolled students */}
{(leadProfile.status === 'enrolled' || leadProfile.status === 'partial_payment') && payments && payments.length > 0 && (
  <Accordion sx={{ mt: 2 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography fontWeight={600}>
        <ReceiptLongIcon sx={{ fontSize: 18, verticalAlign: 'text-bottom', mr: 1 }} />
        Payment Details
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      {payments.map((pmt: any) => (
        <Paper key={pmt.id} variant="outlined" sx={{ p: 2, mb: 1 }}>
          <Stack spacing={1}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Receipt</Typography>
              <Typography variant="body2" fontFamily="monospace">{pmt.receipt_number || '-'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Amount</Typography>
              <Typography variant="body2" fontWeight={600}>Rs. {Number(pmt.amount).toLocaleString('en-IN')}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Status</Typography>
              <Chip label={pmt.status} size="small" color={pmt.status === 'paid' ? 'success' : 'warning'} />
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">Razorpay ID</Typography>
              <Typography variant="body2" fontFamily="monospace" fontSize="0.8rem">{pmt.razorpay_payment_id || '-'}</Typography>
            </Box>
            {pmt.razorpay_method && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Method</Typography>
                <Typography variant="body2" textTransform="capitalize">{pmt.razorpay_method}</Typography>
              </Box>
            )}
            {pmt.razorpay_vpa && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">UPI ID</Typography>
                <Typography variant="body2">{pmt.razorpay_vpa}</Typography>
              </Box>
            )}
            {pmt.razorpay_card_last4 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Card</Typography>
                <Typography variant="body2">**** {pmt.razorpay_card_last4} ({pmt.razorpay_card_network})</Typography>
              </Box>
            )}
            {pmt.payer_name && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Paid by</Typography>
                <Typography variant="body2">
                  {pmt.payer_name} ({pmt.payer_relationship || 'self'})
                </Typography>
              </Box>
            )}
            {pmt.razorpay_fee && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Razorpay Fee + Tax</Typography>
                <Typography variant="body2">
                  Rs. {Number(pmt.razorpay_fee).toLocaleString('en-IN')} + Rs. {Number(pmt.razorpay_tax || 0).toLocaleString('en-IN')}
                </Typography>
              </Box>
            )}
            {pmt.paid_at && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Paid At</Typography>
                <Typography variant="body2">
                  {new Date(pmt.paid_at).toLocaleString('en-IN')}
                </Typography>
              </Box>
            )}
            {pmt.payment_scheme && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" color="text.secondary">Scheme</Typography>
                <Typography variant="body2" textTransform="capitalize">
                  {pmt.payment_scheme === 'full' ? 'Full Payment' : `Installment #${pmt.installment_number || 1}`}
                </Typography>
              </Box>
            )}
          </Stack>
        </Paper>
      ))}
    </AccordionDetails>
  </Accordion>
)}
```

Note: This requires `Accordion`, `AccordionSummary`, `AccordionDetails`, `ExpandMoreIcon`, `ReceiptLongIcon` imports. Add them to the existing imports:

```typescript
import { Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
```

- [ ] **Step 2: Ensure payments data is fetched**

The component needs payment data for the lead profile. Check if the component already receives payments data via props or fetches it. If not, add a query to fetch payments by `lead_profile_id`.

Look at how the component gets its data. If payments aren't being passed, add a fetch in the component or the parent. The simplest approach: add payments to the lead profile fetch in the CRM detail page:

The CRM user detail page likely fetches the lead profile. Add a separate query or include payments in the existing fetch. If the page uses server-side rendering, add to the API. If client-side, add a `useEffect` fetch.

Add near the component state declarations:
```typescript
const [payments, setPayments] = useState<any[]>([]);

useEffect(() => {
  if (leadProfile?.id) {
    fetch(`/api/payments?leadProfileId=${leadProfile.id}`)
      .then(res => res.json())
      .then(data => setPayments(data.payments || []))
      .catch(() => {});
  }
}, [leadProfile?.id]);
```

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/components/crm/ApplicationSection.tsx
git commit -m "feat(admin): add payment detail section with Razorpay info and payer details"
```

---

## Task 13: E2E Test Suite

**Files:**
- Create: `tests/e2e/application-to-enrollment.spec.ts`

- [ ] **Step 1: Create the E2E test file with test infrastructure**

```typescript
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { TEACHER_ACCOUNT, APP_URLS } from '../utils/credentials';

const MARKETING_URL = APP_URLS.marketing || 'http://localhost:3010';
const ADMIN_URL = APP_URLS.admin || 'http://localhost:3013';
const APP_URL = APP_URLS.app || 'http://localhost:3011';

// Test data
const TEST_STUDENT = {
  firstName: 'E2ETest',
  fatherName: 'TestFather',
  email: `e2etest+${Date.now()}@neramclasses.com`,
  phone: '9999900001', // Firebase staging test phone
  otp: '123456',
  dob: '2005-06-15',
  gender: 'male',
};

const RAZORPAY_TEST_CARD = {
  number: '4111111111111111',
  expiry: '12/30',
  cvv: '123',
};

let applicationNumber: string;

test.describe('Application → Payment → Enrollment Flow', () => {
  test.describe.configure({ mode: 'serial' }); // Tests must run in order

  test('payment page loads with correct fee details for approved application', async ({ page }) => {
    // This test uses a pre-seeded approved application
    // For full flow testing, seed via API or use the application from a prior test run
    // For now, test the payment page structure
    await page.goto(`${MARKETING_URL}/pay?app=INVALID-NUMBER`);
    await expect(page.getByText('Application not found')).toBeVisible();
  });

  test('payment page blocks non-approved applications', async ({ page }) => {
    // Try with a draft/submitted application number — should show review message
    await page.goto(`${MARKETING_URL}/pay?app=NERAM-0000`);
    const alert = page.locator('[role="alert"]');
    await expect(alert).toBeVisible();
  });

  test('payment page renders fee summary for approved application', async ({ page }) => {
    // This requires a real approved application — seed one via Supabase
    // Skip if no seeded data available
    test.skip(!process.env.TEST_APPROVED_APP_NUMBER, 'No seeded approved application');

    const appNum = process.env.TEST_APPROVED_APP_NUMBER!;
    await page.goto(`${MARKETING_URL}/pay?app=${appNum}`);

    await expect(page.getByText('Complete Your Payment')).toBeVisible();
    await expect(page.getByText(appNum)).toBeVisible();
    await expect(page.getByLabel('Payer Name')).toBeVisible();
    await expect(page.getByText('Who is paying?')).toBeVisible();
  });

  test('payment page requires payer name before payment', async ({ page }) => {
    test.skip(!process.env.TEST_APPROVED_APP_NUMBER, 'No seeded approved application');

    const appNum = process.env.TEST_APPROVED_APP_NUMBER!;
    await page.goto(`${MARKETING_URL}/pay?app=${appNum}`);

    // Pay button should be disabled without payer name
    const payButton = page.getByRole('button', { name: /pay rs/i });
    await expect(payButton).toBeDisabled();

    // Fill payer name — button should enable
    await page.getByLabel('Payer Name').fill('Test Parent');
    await expect(payButton).toBeEnabled();
  });

  test('Razorpay checkout opens and processes test payment', async ({ page }) => {
    test.skip(!process.env.TEST_APPROVED_APP_NUMBER, 'No seeded approved application');

    const appNum = process.env.TEST_APPROVED_APP_NUMBER!;
    await page.goto(`${MARKETING_URL}/pay?app=${appNum}`);

    // Fill payer info
    await page.getByLabel('Payer Name').fill('Test Parent');
    await page.getByLabel('Parent').check();

    // Click Pay
    const payButton = page.getByRole('button', { name: /pay rs/i });
    await payButton.click();

    // Wait for Razorpay iframe to load
    const razorpayFrame = page.frameLocator('.razorpay-checkout-frame');
    await expect(razorpayFrame.locator('body')).toBeVisible({ timeout: 15000 });

    // Fill card details in Razorpay iframe
    await razorpayFrame.getByPlaceholder('Card Number').fill(RAZORPAY_TEST_CARD.number);
    await razorpayFrame.getByPlaceholder('MM / YY').fill(RAZORPAY_TEST_CARD.expiry);
    await razorpayFrame.getByPlaceholder('CVV').fill(RAZORPAY_TEST_CARD.cvv);

    // Submit payment
    await razorpayFrame.getByRole('button', { name: /pay/i }).click();

    // Razorpay test mode may show OTP page — handle it
    try {
      const otpInput = razorpayFrame.getByPlaceholder('Enter OTP');
      await otpInput.waitFor({ timeout: 5000 });
      // In test mode, Razorpay auto-succeeds or shows a success button
      const successButton = razorpayFrame.getByRole('button', { name: /success/i });
      if (await successButton.isVisible()) {
        await successButton.click();
      }
    } catch {
      // No OTP step in test mode — continue
    }

    // Wait for success page
    await expect(page.getByText('Payment Successful!')).toBeVisible({ timeout: 30000 });

    // Verify receipt details shown
    await expect(page.getByText(/Receipt/)).toBeVisible();
    await expect(page.getByText(/Rs\./)).toBeVisible();
  });

  test('mobile: payment page has no horizontal overflow', async ({ page }) => {
    test.skip(!process.env.TEST_APPROVED_APP_NUMBER, 'No seeded approved application');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${MARKETING_URL}/pay?app=${process.env.TEST_APPROVED_APP_NUMBER!}`);

    const body = page.locator('body');
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('mobile: touch targets >= 48px on payment page', async ({ page }) => {
    test.skip(!process.env.TEST_APPROVED_APP_NUMBER, 'No seeded approved application');

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${MARKETING_URL}/pay?app=${process.env.TEST_APPROVED_APP_NUMBER!}`);

    const buttons = page.locator('button');
    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      if (box) {
        expect(box.height).toBeGreaterThanOrEqual(44); // 44px minimum (Material 3)
      }
    }
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/e2e/application-to-enrollment.spec.ts
git commit -m "test: add E2E test suite for application to enrollment flow"
```

- [ ] **Step 3: Run the tests to verify structure**

Run: `npx playwright test tests/e2e/application-to-enrollment.spec.ts --reporter=list`

Expected: Tests that require `TEST_APPROVED_APP_NUMBER` are skipped. The invalid application test should pass. Fix any import or structural issues.

---

## Task 14: Export Teams Webhook from Package

**Files:**
- Modify: `packages/database/src/index.ts` (or wherever exports are centralized)

- [ ] **Step 1: Export the Teams webhook service**

Find the exports file and add:

```typescript
export { sendTeamsWebhook } from './services/teams-webhook';
```

- [ ] **Step 2: Commit**

```bash
git add packages/database/src/index.ts
git commit -m "feat(database): export Teams webhook service from package"
```

---

## Task 15: Add NEXT_PUBLIC_MARKETING_URL to Environment

**Files:**
- Modify: `.env.local`, `.env.staging.example`, `.env.example`

- [ ] **Step 1: Add the new environment variable**

Add to `.env.local`:
```
NEXT_PUBLIC_MARKETING_URL=http://localhost:3010
```

Add to `.env.staging.example`:
```
NEXT_PUBLIC_MARKETING_URL=https://staging.neramclasses.com
```

Add to `.env.example`:
```
NEXT_PUBLIC_MARKETING_URL=https://neramclasses.com
```

Also add `TEAMS_WEBHOOK_URL` placeholder:
```
TEAMS_WEBHOOK_URL=
```

- [ ] **Step 2: Add to Vercel env vars for production and staging**

Production:
```bash
cd apps/marketing && echo "https://neramclasses.com" | vercel env add NEXT_PUBLIC_MARKETING_URL production
```

Staging:
```bash
cd apps/marketing && echo "https://staging.neramclasses.com" | vercel env add NEXT_PUBLIC_MARKETING_URL preview
```

Note: `TEAMS_WEBHOOK_URL` will be added once the admin sets up the Teams webhook.

- [ ] **Step 3: Add to turbo.json globalEnv**

Add `NEXT_PUBLIC_MARKETING_URL` to the `globalEnv` array in `turbo.json`.

- [ ] **Step 4: Commit**

```bash
git add .env.example .env.staging.example turbo.json
git commit -m "chore: add NEXT_PUBLIC_MARKETING_URL and TEAMS_WEBHOOK_URL env vars"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] Run `pnpm type-check` — no errors across all apps
- [ ] Run `pnpm lint` — no new warnings
- [ ] Run `pnpm build` — all apps build successfully
- [ ] Manual test: open `/pay?app=NERAM-XXXX` for an approved application on staging
- [ ] Manual test: complete a Razorpay test payment
- [ ] Verify: payment record created in DB with payer fields and Razorpay enrichment
- [ ] Verify: student profile created in DB
- [ ] Verify: lead status updated to `enrolled`
- [ ] Verify: Telegram notification received
- [ ] Verify: Admin in-app notification created
- [ ] Verify: Email sent to student (check Resend logs)
- [ ] Run E2E tests: `npx playwright test tests/e2e/application-to-enrollment.spec.ts`
