'use client';

import { useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Snackbar, Typography } from '@neram/ui';
import RouteOutlinedIcon from '@mui/icons-material/RouteOutlined';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import LinkIcon from '@mui/icons-material/Link';
import {
  LIFECYCLE_STAGE_LABELS,
  LIFECYCLE_STAGE_MEANINGS,
  PIPELINE_STAGE_CONFIG,
} from '@neram/database';
import type { LifecycleStage, PipelineStage } from '@neram/database';
import ApplicationSection from '@/components/crm/ApplicationSection';
import ScholarshipSection from '@/components/crm/ScholarshipSection';
import PaymentSection from '@/components/crm/PaymentSection';
import RefundSection from '@/components/crm/RefundSection';
import { ScoreCalculationsSection } from '@/components/crm/ScoreCalculationsSection';
import GenerateLinkDialog from '@/components/direct-enrollment/GenerateLinkDialog';
import ShareLinkPanel from '@/components/direct-enrollment/ShareLinkPanel';
import { formatDate, sentenceCase } from '@/lib/user360-view';
import { EmptyNote, KeyValue, SectionCard, StatusChip, TwoColumns, type User360TabProps } from '../shared';
import { LIFECYCLE_ICONS, LIFECYCLE_TONES } from '../status-icons';

/** The order in which the CRM stage CASE promotes a person (lowest first). */
const PIPELINE_ORDER: PipelineStage[] = [
  'new_lead',
  'phone_verified',
  'demo_requested',
  'demo_attended',
  'application_submitted',
  'admin_approved',
  'payment_complete',
  'enrolled',
];

function rupees(n: unknown) {
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toLocaleString('en-IN')}` : 'Not set';
}

export default function JourneyTab({ data, detail, adminId, onRefresh }: User360TabProps) {
  const p = data.person || {};
  const stage = p.lifecycle_stage as LifecycleStage | undefined;
  const crmStage = (p.crm_stage || p.pipeline_stage || detail?.pipelineStage) as PipelineStage | undefined;
  const currentIdx = crmStage ? PIPELINE_ORDER.indexOf(crmStage) : -1;
  const StageIcon = stage ? LIFECYCLE_ICONS[stage] : null;

  const [directEnrollOpen, setDirectEnrollOpen] = useState(false);
  const [shareLink, setShareLink] = useState<any>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');

  const prefill = useMemo(
    () => ({
      studentName: detail?.user.name || detail?.user.first_name || '',
      studentPhone: detail?.user.phone || '',
      studentEmail: detail?.user.email || '',
      interestCourse: detail?.leadProfile?.interest_course || '',
    }),
    [detail],
  );

  const copyPaymentLink = async () => {
    setLinkLoading(true);
    setLinkError('');
    try {
      const res = await fetch(`/api/crm/users/${data.person.id}/payment-link`, { method: 'POST' });
      if (!res.ok) throw new Error('Could not create the payment link.');
      const { link } = await res.json();
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
    } catch (e: any) {
      setLinkError(e.message || 'Could not create the payment link.');
    } finally {
      setLinkLoading(false);
    }
  };

  const latest = data.payments?.latest || [];

  return (
    <Box sx={{ minWidth: 0 }}>
      <SectionCard title="Where this person is" icon={<RouteOutlinedIcon />}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0,1fr))' }, mb: 2 }}>
          <KeyValue
            label="Lifecycle stage"
            value={
              stage && StageIcon ? (
                <Box>
                  <StatusChip icon={<StageIcon />} label={LIFECYCLE_STAGE_LABELS[stage]} tone={LIFECYCLE_TONES[stage]} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {LIFECYCLE_STAGE_MEANINGS[stage]}
                  </Typography>
                </Box>
              ) : null
            }
          />
          <KeyValue
            label="Application"
            value={
              p.application_status || detail?.leadProfile?.status
                ? `${sentenceCase(String(p.application_status || detail?.leadProfile?.status))}${
                    p.application_number || detail?.leadProfile?.application_number
                      ? `, ${p.application_number || detail?.leadProfile?.application_number}`
                      : ''
                  }`
                : 'No application'
            }
          />
          <KeyValue label="Contacted" value={p.contacted_status ? sentenceCase(String(p.contacted_status)) : 'Not yet'} />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.75 }}>
          CRM stage
        </Typography>
        {crmStage ? (
          <Box component="ol" aria-label="CRM stages" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {PIPELINE_ORDER.map((s, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx;
              const Icon = done ? CheckCircleIcon : current ? RadioButtonCheckedIcon : RadioButtonUncheckedIcon;
              return (
                <Box
                  component="li"
                  key={s}
                  aria-current={current ? 'step' : undefined}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: 1,
                    py: 0.5,
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: current ? 'primary.main' : 'grey.200',
                    bgcolor: current ? 'rgba(25,118,210,0.06)' : 'transparent',
                  }}
                >
                  <Icon sx={{ fontSize: 16, color: done ? 'success.main' : current ? 'primary.main' : 'grey.400' }} aria-hidden />
                  <Typography variant="body2" sx={{ fontWeight: current ? 700 : 400, color: done || current ? 'text.primary' : 'text.secondary' }}>
                    {PIPELINE_STAGE_CONFIG[s].label}
                    {current ? ' (now)' : ''}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        ) : (
          <EmptyNote>No CRM stage for staff accounts.</EmptyNote>
        )}
      </SectionCard>

      <TwoColumns>
        <SectionCard title="Demo class" icon={<VideocamOutlinedIcon />}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            <KeyValue label="Bookings" value={String(p.demo_registration_count ?? detail?.demoRegistrations?.length ?? 0)} />
            <KeyValue label="Attended" value={p.demo_attended ? 'Yes' : 'No'} />
            <KeyValue label="Survey" value={p.demo_survey_completed ? 'Done' : 'Not done'} />
          </Box>
          {p.latest_demo_status && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Latest booking: {sentenceCase(String(p.latest_demo_status))}
            </Typography>
          )}
        </SectionCard>

        <SectionCard title="Payments summary" icon={<PaymentsOutlinedIcon />}>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(2, minmax(0,1fr))', mb: latest.length ? 1.5 : 0 }}>
            <KeyValue label="Total paid" value={rupees(data.payments?.totalPaid ?? 0)} />
            <KeyValue label="Payments on record" value={String(data.payments?.count ?? 0)} />
          </Box>
          {latest.slice(0, 5).map((pay: any) => (
            <Box key={pay.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
              <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 90 }}>
                {rupees(pay.amount)}
              </Typography>
              <Chip
                size="small"
                label={sentenceCase(String(pay.status || 'unknown'))}
                color={pay.status === 'paid' ? 'success' : pay.status === 'failed' ? 'error' : 'default'}
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                {formatDate(pay.paid_at || pay.created_at)}
                {pay.receipt_number ? `, receipt ${pay.receipt_number}` : ''}
              </Typography>
            </Box>
          ))}
        </SectionCard>
      </TwoColumns>

      {detail ? (
        <>
          <Box id="crm-section-application">
            <ApplicationSection detail={detail} adminId={adminId} onStatusChange={onRefresh} />
          </Box>

          {(detail.user.user_type === 'lead' || detail.leadProfile?.status === 'approved') && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {detail.user.user_type === 'lead' && (
                <Button
                  variant="outlined"
                  startIcon={<PersonAddAlt1Icon />}
                  onClick={() => setDirectEnrollOpen(true)}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }}
                >
                  Generate direct enrollment link
                </Button>
              )}
              {detail.leadProfile?.status === 'approved' && (
                <Button
                  variant="outlined"
                  color="success"
                  startIcon={<LinkIcon />}
                  onClick={copyPaymentLink}
                  disabled={linkLoading}
                  sx={{ textTransform: 'none', fontWeight: 600, minHeight: 44 }}
                >
                  {linkLoading ? 'Creating link...' : 'Copy payment link'}
                </Button>
              )}
            </Box>
          )}
          {linkError && (
            <Alert severity="error" role="alert" sx={{ mb: 2 }} onClose={() => setLinkError('')}>
              {linkError}
            </Alert>
          )}

          <Box id="crm-section-scholarship">
            <ScholarshipSection detail={detail} adminId={adminId} onStatusChange={onRefresh} />
          </Box>
          <Box id="crm-section-payment">
            <PaymentSection detail={detail} />
          </Box>
          <Box id="crm-section-refund">
            <RefundSection detail={detail} adminId={adminId} onStatusChange={onRefresh} />
          </Box>
          <Box id="crm-section-score-calculations">
            <ScoreCalculationsSection userId={detail.user.id} />
          </Box>

          <GenerateLinkDialog
            open={directEnrollOpen}
            onClose={() => setDirectEnrollOpen(false)}
            onSuccess={(link: any) => {
              setDirectEnrollOpen(false);
              setShareLink(link);
            }}
            adminId={adminId}
            prefillData={prefill}
          />
          {shareLink && <ShareLinkPanel open={!!shareLink} onClose={() => setShareLink(null)} link={shareLink} />}
          <Snackbar
            open={linkCopied}
            autoHideDuration={4000}
            onClose={() => setLinkCopied(false)}
            message="Payment link copied. Valid for 7 days."
            anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          />
        </>
      ) : (
        <Alert severity="warning">The application and payment details could not be loaded. Reload the page to try again.</Alert>
      )}
    </Box>
  );
}
