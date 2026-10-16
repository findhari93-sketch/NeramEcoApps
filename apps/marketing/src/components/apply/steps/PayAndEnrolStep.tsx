'use client';

import { useState } from 'react';
import { Box, Button, Typography } from '@neram/ui';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckOutlined from '@mui/icons-material/CheckOutlined';
import { useTranslations } from 'next-intl';
import { tokens as t } from '@/design-system';
import { useFormContext } from '../FormContext';
import StepHeading from '../StepHeading';
import PaymentPanel from '../PaymentPanel';
import { inkRuleTopSx, railCardSx } from '../styles';
import { APPLY_ERROR } from '../shell/applyTheme';

const COURSE_KEYS: Record<string, string> = {
  nata: 'yourCourse.nata',
  jee_paper2: 'yourCourse.jee',
  both: 'yourCourse.both',
  not_sure: 'yourCourse.notSure',
};

/**
 * Step 4. The application is already written; this shows what is being
 * bought, what happens after paying, and the payment panel inline. The panel
 * owns the plan cards, the coupon field, the fee summary and the pay button.
 * Once the fee is paid the panel's enrolled state takes the whole step.
 */
export default function PayAndEnrolStep() {
  const tr = useTranslations('apply');
  const { formData, submittedApplication, refreshApplications, setActiveStep, forgetDraft } = useFormContext();
  // Once the payment is under way or done, going back would only confuse.
  const [paymentLocked, setPaymentLocked] = useState(false);
  // Paid (now or earlier): the panel shows its own "You're enrolled" heading.
  const [enrolled, setEnrolled] = useState(false);
  const { course } = formData;

  const courseName = course.interestCourse ? tr(COURSE_KEYS[course.interestCourse]) : '';
  const programme = course.feeStructureLabel || courseName;
  const mode = course.learningMode === 'online_only' ? tr('yourCourse.online') : tr('yourCourse.hybrid');

  return (
    <Box>
      {!enrolled && (
        <>
          <StepHeading title={tr('pay.title')} subtitle={tr('pay.subtitle')}>
            {submittedApplication?.applicationNumber && (
              <Typography component="p" sx={{ m: 0, fontFamily: t.fontMono, fontSize: 14, fontWeight: 700, color: t.inkMuted }}>
                {tr('pay.applicationNumber', { number: submittedApplication.applicationNumber })}
              </Typography>
            )}
          </StepHeading>

          {/* Enrolment row: what is being bought, with a way back to Review */}
          <Box
            sx={{
              ...inkRuleTopSx,
              pt: 2,
              mb: 3.5,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box sx={{ flex: '1 1 260px', minWidth: 0 }}>
              <Typography component="h2" sx={{ m: 0, fontSize: 13, fontWeight: 400, color: t.inkMuted }}>
                {tr('pay.yourEnrolment')}
              </Typography>
              {programme && (
                <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: 17, fontWeight: 700, color: t.ink }}>
                  {programme}
                </Typography>
              )}
              <Typography component="p" sx={{ m: 0, mt: 0.5, fontSize: 14, lineHeight: 1.5, color: t.inkMuted }}>
                {mode} · {tr('pay.included')}
              </Typography>
            </Box>
            {!paymentLocked && (
              <Button
                variant="outlined"
                startIcon={<EditOutlined sx={{ fontSize: '18px !important' }} />}
                onClick={() => setActiveStep(2)}
                sx={{
                  minHeight: 44,
                  px: 1.5,
                  flexShrink: 0,
                  borderRadius: `${t.radius}px`,
                  border: `1px solid ${t.lineStrong}`,
                  bgcolor: t.surface,
                  color: t.ink,
                  fontSize: 14,
                  fontWeight: 600,
                  textTransform: 'none',
                  '&:hover': { bgcolor: t.navy900, color: t.paper, borderColor: t.navy900 },
                  '&.Mui-focusVisible': { outline: t.focusOutline, outlineOffset: '2px' },
                }}
              >
                {tr('pay.changeDetails')}
              </Button>
            )}
          </Box>

          {/* What happens after payment */}
          <Box sx={{ mb: 3.5 }}>
            <Typography component="h2" sx={{ m: 0, mb: 1.25, fontSize: 15, fontWeight: 700, color: t.ink }}>
              {tr('pay.whatHappensTitle')}
            </Typography>
            <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1 }}>
              {(['pay.whatHappens1', 'pay.whatHappens2', 'pay.whatHappens3', 'pay.whatHappens4'] as const).map((key) => (
                <Box component="li" key={key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <CheckOutlined aria-hidden sx={{ fontSize: 18, mt: '2px', color: t.gold800, flexShrink: 0 }} />
                  <Typography component="span" sx={{ fontSize: 14, lineHeight: 1.5, color: t.ink }}>
                    {tr(key)}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </>
      )}

      {submittedApplication ? (
        <PaymentPanel
          leadId={submittedApplication.id}
          active
          variant="inline"
          onStateChange={({ paymentSuccess, isProcessing, enrolled: isEnrolled }: { paymentSuccess: boolean; isProcessing: boolean; enrolled?: boolean }) => {
            setPaymentLocked(paymentSuccess || isProcessing || !!isEnrolled);
            setEnrolled(!!isEnrolled);
          }}
          onPaymentComplete={() => {
            forgetDraft();
            return refreshApplications();
          }}
        />
      ) : (
        <Box role="alert" sx={{ ...railCardSx(APPLY_ERROR), fontSize: 15, color: t.ink }}>
          {tr('pay.submitFailed')}
        </Box>
      )}
    </Box>
  );
}
