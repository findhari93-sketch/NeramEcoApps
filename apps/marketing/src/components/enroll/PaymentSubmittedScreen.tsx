'use client';

import { Box, Container, Typography } from '@neram/ui';
import HourglassTopOutlined from '@mui/icons-material/HourglassTopOutlined';
import { tokens as t, Timeline, CtaButton, brandColors } from '@/design-system';
import WhatsApp from '@mui/icons-material/WhatsApp';
import { buildWhatsAppLink } from '@/lib/whatsapp';
import { rupees, formatDay, type PaymentSubmission } from './student-pay-types';

const HELP = buildWhatsAppLink({ text: 'Hi Neram, I paid my enrolment fee and submitted the payment reference.' });

interface PaymentSubmittedScreenProps {
  studentName: string | null;
  submission: PaymentSubmission;
  /** Balance payments: "Balance payment" instead of the plan name. */
  planLabel?: string;
  /** The last step of the timeline, e.g. "Payment recorded". */
  doneLabel?: string;
  doneNote?: string;
}

/**
 * After a student-pays submission, and every time the link is opened until
 * staff verify it. Says what happened, what happens next and how long it takes.
 */
export default function PaymentSubmittedScreen({ studentName, submission, planLabel, doneLabel, doneNote }: PaymentSubmittedScreenProps) {
  const first = (studentName || '').trim().split(/\s+/)[0];
  const utrShown = submission.utr || (submission.utrTail ? `ending ${submission.utrTail}` : null);

  const rows: [string, string][] = [
    ['Amount', rupees(submission.amount)],
    ['Plan', planLabel || (submission.scheme === 'installment' ? 'Two installments' : 'Paid in full')],
    ['Paid by', submission.method === 'bank_transfer' ? 'Bank transfer' : 'UPI'],
  ];
  if (utrShown) rows.push(['Reference (UTR)', utrShown]);
  if (submission.paidOn) rows.push(['Paid on', formatDay(submission.paidOn)]);
  if (submission.scheme === 'installment' && submission.balance) {
    rows.push(['Second installment', `${rupees(submission.balance)}${submission.balanceDueDate ? ` by ${formatDay(submission.balanceDueDate)}` : ''}`]);
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 6 }, px: 2 }}>
      <Box sx={{ textAlign: 'center', mb: 3 }}>
        <Box
          aria-hidden
          sx={{ width: 64, height: 64, mx: 'auto', mb: 2, borderRadius: '50%', bgcolor: t.goldTintBg, display: 'grid', placeItems: 'center' }}
        >
          <HourglassTopOutlined sx={{ fontSize: 34, color: t.gold800 }} />
        </Box>
        <Typography component="h1" sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 800, color: t.ink, lineHeight: 1.25 }}>
          Payment received, we are verifying it
        </Typography>
        <Typography sx={{ fontSize: 16, color: t.inkMuted, mt: 1, lineHeight: 1.5 }}>
          {first ? `Thank you, ${first}. ` : 'Thank you. '}
          Our accounts team is matching your payment with the bank. This usually takes a few hours during working hours.
        </Typography>
      </Box>

      <Box sx={{ border: `1px solid ${t.line}`, borderRadius: `${t.radius}px`, bgcolor: t.surface, px: 2, py: 1, mb: 3 }}>
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1, borderBottom: `1px solid ${t.line}`, '&:last-of-type': { borderBottom: 'none' } }}>
            <Typography sx={{ fontSize: 15, color: t.inkMuted }}>{label}</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: t.ink, textAlign: 'right', wordBreak: 'break-all' }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, color: t.ink, mb: 1 }}>
        What happens next
      </Typography>
      <Timeline
        items={[
          { label: 'You paid and sent us the reference', date: 'Done', state: 'done' },
          { label: 'We match it with the bank', date: 'Now', state: 'now', note: submission.emailedTo ? `We emailed ${submission.emailedTo}.` : undefined },
          {
            label: doneLabel || 'You are enrolled',
            date: 'Next',
            state: 'next',
            note: doneNote || 'You get your enrolment number, receipt and app sign-in by email.',
          },
        ]}
      />

      <Box sx={{ mt: 3, display: 'grid', gap: 1.5 }}>
        <CtaButton
          variant="outline"
          href={HELP.href}
          external
          fullWidth
          startIcon={<WhatsApp aria-hidden sx={{ color: brandColors.whatsappDark }} />}
        >
          Questions? Message us on WhatsApp
        </CtaButton>
        <Typography sx={{ fontSize: 14, color: t.inkMuted, textAlign: 'center' }}>
          You can close this page. Opening your link again shows this status.
        </Typography>
      </Box>
    </Container>
  );
}
