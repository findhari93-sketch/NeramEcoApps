'use client';

import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Typography } from '@neram/ui';
import EditOutlined from '@mui/icons-material/EditOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import { useTranslations } from 'next-intl';
import { useFormContext } from '../FormContext';
import PaymentPanel from '../PaymentPanel';

const COURSE_KEYS: Record<string, string> = {
  nata: 'yourCourse.nata',
  jee_paper2: 'yourCourse.jee',
  both: 'yourCourse.both',
  not_sure: 'yourCourse.notSure',
};

/**
 * Step 4. The application is already written; this shows what is being
 * bought, what happens after paying, and the payment panel inline. The panel
 * owns the fee table, the scheme toggle, the coupon field and the pay button.
 */
export default function PayAndEnrolStep() {
  const t = useTranslations('apply');
  const { formData, submittedApplication, refreshApplications, setActiveStep, forgetDraft } = useFormContext();
  // Once the payment is under way or done, going back would only confuse.
  const [paymentLocked, setPaymentLocked] = useState(false);
  const { course } = formData;

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        {t('pay.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
        {t('pay.subtitle')}
      </Typography>
      {submittedApplication?.applicationNumber && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3, fontFamily: 'monospace' }}>
          {t('pay.applicationNumber', { number: submittedApplication.applicationNumber })}
        </Typography>
      )}
      {!paymentLocked && (
        <Button
          variant="text"
          startIcon={<EditOutlined />}
          onClick={() => setActiveStep(2)}
          sx={{ minHeight: 44, mb: 2, ml: -1 }}
        >
          {t('pay.changeDetails')}
        </Button>
      )}

      <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom component="h2">
          {t('pay.yourEnrolment')}
        </Typography>
        <Stack spacing={0.5}>
          <Typography variant="body2">{course.interestCourse ? t(COURSE_KEYS[course.interestCourse]) : ''}</Typography>
          {course.feeStructureLabel && <Typography variant="body2">{course.feeStructureLabel}</Typography>}
          <Typography variant="body2">
            {course.learningMode === 'online_only' ? t('yourCourse.online') : t('yourCourse.hybrid')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('pay.included')}
          </Typography>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" fontWeight={600} gutterBottom component="h2">
          {t('pay.whatHappensTitle')}
        </Typography>
        <Stack spacing={1}>
          {(['pay.whatHappens1', 'pay.whatHappens2', 'pay.whatHappens3', 'pay.whatHappens4'] as const).map((key) => (
            <Box key={key} sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <CheckCircleOutlined fontSize="small" color="primary" aria-hidden sx={{ mt: 0.25 }} />
              <Typography variant="body2">{t(key)}</Typography>
            </Box>
          ))}
        </Stack>
      </Paper>

      {submittedApplication ? (
        <PaymentPanel
          leadId={submittedApplication.id}
          active
          onStateChange={({ paymentSuccess, isProcessing }: { paymentSuccess: boolean; isProcessing: boolean }) =>
            setPaymentLocked(paymentSuccess || isProcessing)
          }
          onPaymentComplete={() => {
            forgetDraft();
            return refreshApplications();
          }}
        />
      ) : (
        <Alert severity="error" role="alert">
          {t('pay.submitFailed')}
        </Alert>
      )}
    </Box>
  );
}
