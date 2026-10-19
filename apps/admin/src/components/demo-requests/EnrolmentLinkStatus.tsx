'use client';

import { Alert, Box, Button, Paper, Typography } from '@neram/ui';
import SchoolIcon from '@mui/icons-material/School';
import LinkIcon from '@mui/icons-material/Link';
import { formatDueDate, formatRupees } from '@neram/database/fee-plan';
import { offerFromLink } from '@neram/database/student-pay';
import VerifyPaymentCard, { type VerifyDecision } from '@/components/direct-enrollment/VerifyPaymentCard';
import type { DeskEnrolmentLink } from './types';

function shortDate(value: string): string {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
}

type MoneyLink = Pick<DeskEnrolmentLink, 'final_fee' | 'amount_paid' | 'installment_2_due_date'> &
  Partial<
    Pick<
      DeskEnrolmentLink,
      'status' | 'payment_mode' | 'total_fee' | 'discount_amount' | 'offer_full_amount' | 'offer_installment_1' | 'offer_installment_2'
    >
  >;

/** A student-pays link the student has not been verified on yet: it carries an offer, not a payment. */
export function isUnpaidStudentPays(link: MoneyLink): boolean {
  return link.payment_mode === 'student_pays' && link.status !== 'used';
}

/** "₹25,000 in full, or ₹16,500 + ₹13,500" for a student-pays link. */
export function linkOfferLine(link: MoneyLink): string {
  const offer = offerFromLink({
    total_fee: link.total_fee ?? null,
    discount_amount: link.discount_amount ?? null,
    offer_full_amount: link.offer_full_amount ?? null,
    offer_installment_1: link.offer_installment_1 ?? null,
    offer_installment_2: link.offer_installment_2 ?? null,
  });
  return offer.allowsInstallments && offer.installment1 !== null && offer.installment2 !== null
    ? `${formatRupees(offer.fullAmount)} in full, or ${formatRupees(offer.installment1)} + ${formatRupees(offer.installment2)}`
    : `${formatRupees(offer.fullAmount)} in full`;
}

/** One line for a link's money: "₹15,000 of ₹30,000 paid, ₹15,000 due by 30 Nov 2026". */
export function linkMoneyLine(link: MoneyLink): string {
  if (isUnpaidStudentPays(link)) {
    return `Student pays online: ${linkOfferLine(link)}`;
  }
  const fee = Number(link.final_fee) || 0;
  const paid = Number(link.amount_paid) || 0;
  const balance = Math.max(0, fee - paid);
  if (balance <= 0.01) return `${formatRupees(paid)} paid in full`;
  return `${formatRupees(paid)} of ${formatRupees(fee)} paid, ${formatRupees(balance)} due${
    link.installment_2_due_date ? ` by ${formatDueDate(link.installment_2_due_date)}` : ', date not set'
  }`;
}

/**
 * The desk's enrolment-link slot: the student's link when one exists (made here
 * or anywhere else), otherwise the button that makes one. A payment the student
 * submitted comes first, with the card that verifies it.
 */
export default function EnrolmentLinkStatus({
  link,
  disabled,
  onOpen,
  adminId,
  onPaymentDecided,
  notice,
  onDismissNotice,
}: {
  link: DeskEnrolmentLink | null | undefined;
  disabled?: boolean;
  onOpen: () => void;
  adminId?: string | null;
  /** After Verify or Reject, so the panel refreshes and logs it. */
  onPaymentDecided?: (decision: VerifyDecision, message: string) => void;
  /** The result of the last Verify or Reject, shown above the link. */
  notice?: { kind: VerifyDecision; text: string } | null;
  onDismissNotice?: () => void;
}) {
  const note = notice ? (
    <Alert severity={notice.kind === 'verify' ? 'success' : 'info'} role="status" onClose={onDismissNotice}>
      {notice.text}
    </Alert>
  ) : null;

  if (link?.status === 'payment_submitted') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <VerifyPaymentCard linkId={link.id} adminId={adminId} onChanged={onPaymentDecided} />
        <Box>
          <Button onClick={onOpen} disabled={disabled} sx={{ minHeight: 44, textTransform: 'none' }}>
            View the link
          </Button>
        </Box>
      </Box>
    );
  }

  if (!link || link.status === 'cancelled' || link.status === 'expired') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, alignItems: 'flex-start' }}>
        {note}
        <Button variant="contained" startIcon={<SchoolIcon />} onClick={onOpen} disabled={disabled} sx={{ minHeight: 44 }}>
          Send enrolment link
        </Button>
        {link && (
          <Typography variant="caption" color="text.secondary">
            The last link {link.status === 'expired' ? 'expired' : 'was cancelled'} on {shortDate(link.expires_at || link.created_at)}.
          </Typography>
        )}
      </Box>
    );
  }

  const used = link.status === 'used';
  const rejected = !used && link.payment_mode === 'student_pays' && link.rejection_reason;
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {note}
      {rejected && !notice && (
        <Alert severity="warning" sx={{ py: 0.5 }}>
          Payment rejected: {String(link.rejection_reason).replace(/[.\s]+$/, '')}. Waiting for the student to pay again.
        </Alert>
      )}
      <Paper variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', borderRadius: 2 }}>
        <LinkIcon color={used ? 'info' : 'success'} aria-hidden />
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography variant="body2" fontWeight={700}>
            {used ? 'Enrolled with the link' : 'Enrolment link active'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {linkMoneyLine(link)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Made by {link.created_by_name || 'staff'} on {shortDate(link.created_at)}
            {!used ? (link.share_count ? `, shared ${link.share_count} times` : ', not shared yet') : ''}
          </Typography>
        </Box>
        <Button variant={used ? 'outlined' : 'contained'} onClick={onOpen} disabled={disabled} sx={{ minHeight: 44 }}>
          {used ? 'View' : 'View and share'}
        </Button>
      </Paper>
    </Box>
  );
}
