'use client';

import { Alert, Box, Chip, Divider, Link, Skeleton, Typography } from '@neram/ui';
import { EmptyNote, Field, FieldGrid } from './FieldGrid';
import ProfileSection from './ProfileSection';
import {
  CASTE_CATEGORY_LABEL,
  EMPTY_SENTENCE,
  formatCurrencyINR,
  formatDateIN,
  humanise,
  labelFor,
  yesNo,
} from '@/lib/student-profile-fields';
import type { StudentFinancePayload } from '@/lib/student-profile-types';

const DUE_SOURCE_NOTE: Record<string, string> = {
  student_profile: 'Set on the student record.',
  application_deadline: 'From the payment deadline on the application.',
  derived_installment: 'Worked out from the enrolment date and the instalment window.',
};

/**
 * Fees, payments and everything commercial.
 *
 * This component only ever mounts for a caller holding coord.student.finance,
 * but that is NOT what keeps a teacher out. The gate is server side: the finance
 * route asserts the capability and is the only place the commercial columns are
 * ever selected, so a teacher's payloads do not contain these numbers at all.
 * Hiding a component would leave the values sitting in devtools.
 *
 * Only ONE total is shown. student_profiles.fee_paid and fee_due are a cache
 * that drifts, and they are never rendered: when they disagree with the truth we
 * show a reconciliation note instead of a second, contradictory figure.
 */
export default function FeeSection({
  finance,
  loading,
  error,
}: {
  finance: StudentFinancePayload | null;
  loading: boolean;
  error: string | null;
}) {
  const headline = finance
    ? finance.agreed === null
      ? 'No fee agreement on file'
      : `${formatCurrencyINR(finance.paid)} paid of ${formatCurrencyINR(finance.agreed)}`
    : null;

  return (
    <ProfileSection
      id="profile-fees"
      title="Fees and payments"
      badge="Admin and manager"
      headline={headline}
    >
      {loading && <Skeleton variant="rectangular" height={140} sx={{ borderRadius: 1 }} />}

      {error && !loading && <Alert severity="error">{error}</Alert>}

      {finance && !loading && (
        <>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
              mb: 3,
            }}
          >
            <Total label="Agreed fee" value={finance.agreed} />
            <Total label="Paid so far" value={finance.paid} />
            <Total
              label="Balance"
              value={finance.balance}
              emphasis={finance.balance !== null && finance.balance > 0}
            />
          </Box>

          {finance.agreed === null && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {EMPTY_SENTENCE.feeAgreement}
            </Alert>
          )}

          {finance.cacheDisagreement && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              These figures are being reconciled. The stored{' '}
              {finance.cacheDisagreement.fields.join(' and ')} differs from the payment
              records by about {formatCurrencyINR(finance.cacheDisagreement.deltaRupees)}. The
              figures above are computed from the payments themselves.
            </Alert>
          )}

          <FieldGrid>
            <Field
              label="Next payment due"
              value={formatDateIN(finance.nextDue.date)}
              hint={
                finance.nextDue.source ? DUE_SOURCE_NOTE[finance.nextDue.source] : null
              }
            />
            <Field
              label="Payment status"
              value={
                finance.scheme.payment_status ? humanise(finance.scheme.payment_status) : null
              }
            />
            <Field
              label="Scheme"
              value={
                finance.scheme.payment_scheme ? humanise(finance.scheme.payment_scheme) : null
              }
            />
            <Field label="Assigned fee" value={formatCurrencyINR(finance.scheme.assigned_fee)} />
            <Field label="Discount" value={formatCurrencyINR(finance.scheme.discount_amount)} />
            <Field
              label="Full-payment discount"
              value={formatCurrencyINR(finance.scheme.full_payment_discount)}
            />
            <Field label="Coupon" value={finance.scheme.coupon_code} />
            <Field
              label="Instalment 1"
              value={formatCurrencyINR(finance.scheme.installment_1_amount)}
            />
            <Field
              label="Instalment 2"
              value={formatCurrencyINR(finance.scheme.installment_2_amount)}
            />
            <Field
              label="Allowed payment modes"
              value={
                finance.scheme.allowed_payment_modes
                  ? humanise(finance.scheme.allowed_payment_modes)
                  : null
              }
            />
            <Field
              label="Cashback eligible"
              value={formatCurrencyINR(finance.cashback.eligible)}
            />
            <Field
              label="Cashback paid"
              value={formatCurrencyINR(finance.cashback.processed)}
            />
          </FieldGrid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Scholarship and category
          </Typography>
          <FieldGrid>
            <Field
              label="Caste category"
              value={
                finance.scholarship.caste_category
                  ? labelFor(CASTE_CATEGORY_LABEL, finance.scholarship.caste_category)
                  : null
              }
            />
            <Field
              label="Scholarship eligible"
              value={yesNo(finance.scholarship.eligible)}
            />
          </FieldGrid>

          <Divider sx={{ my: 3 }} />

          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
            Payments received
          </Typography>
          {finance.payments.length === 0 ? (
            <EmptyNote>{EMPTY_SENTENCE.payments}</EmptyNote>
          ) : (
            // A stacked card list, not a table. A table at 375px either scrolls
            // sideways or squeezes the amount into two characters.
            <Box sx={{ display: 'grid', gap: 1 }}>
              {finance.payments.map((p) => (
                <Box
                  key={p.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 1,
                    minHeight: 48,
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                  }}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatCurrencyINR(p.amount)}
                      {p.installment_number ? ` (instalment ${p.installment_number})` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[
                        p.paid_at ? formatDateIN(p.paid_at) : 'Not yet received',
                        p.payment_method ? humanise(p.payment_method) : null,
                        p.payer_name
                          ? `Paid by ${p.payer_name}${
                              p.payer_relationship ? ` (${p.payer_relationship})` : ''
                            }`
                          : null,
                        p.receipt_number,
                      ]
                        .filter(Boolean)
                        .join(' . ')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Chip
                      size="small"
                      label={p.status ? humanise(p.status) : 'Unknown'}
                      color={p.status === 'paid' ? 'success' : 'default'}
                      sx={{ fontWeight: 700 }}
                    />
                    {p.receipt_url && (
                      <Link
                        href={p.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="body2"
                        sx={{ minHeight: 40, display: 'inline-flex', alignItems: 'center' }}
                      >
                        Receipt
                      </Link>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}

          {finance.installments.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                Instalment plan
              </Typography>
              <Box sx={{ display: 'grid', gap: 1 }}>
                {finance.installments.map((i, idx) => (
                  <Box
                    key={`${i.installment_number ?? idx}`}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      minHeight: 48,
                      alignItems: 'center',
                      px: 1.5,
                      borderRadius: 1,
                      bgcolor: 'action.hover',
                    }}
                  >
                    <Typography variant="body2">
                      Instalment {i.installment_number ?? idx + 1}
                      {i.due_date ? `, due ${formatDateIN(i.due_date)}` : ''}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {formatCurrencyINR(i.amount)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </>
          )}

          {(finance.attribution.utm_source || finance.attribution.referral_code) && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                How they found us
              </Typography>
              <FieldGrid>
                <Field label="Source" value={finance.attribution.source} />
                <Field label="Campaign" value={finance.attribution.utm_campaign} />
                <Field label="Medium" value={finance.attribution.utm_medium} />
                <Field label="UTM source" value={finance.attribution.utm_source} />
                <Field label="Referral code" value={finance.attribution.referral_code} />
              </FieldGrid>
            </>
          )}
        </>
      )}
    </ProfileSection>
  );
}

/** One of the three headline numbers. Null renders as text, never as zero. */
function Total({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number | null;
  emphasis?: boolean;
}) {
  return (
    <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'action.hover' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '1.5rem',
          fontWeight: 800,
          lineHeight: 1.2,
          color: emphasis ? 'warning.main' : 'text.primary',
        }}
      >
        {value === null ? 'Not set' : formatCurrencyINR(value)}
      </Typography>
    </Box>
  );
}
