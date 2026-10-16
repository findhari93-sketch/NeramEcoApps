'use client';

import { Alert, Box, Typography } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import { useCollegeLead } from '../useCollegeLead';
import { ctaButtonSx } from '../directory/hub-styles';
import { tokens } from '@/design-system';

interface Props {
  collegeId: string;
  collegeName: string;
  shortName: string;
}

const inputSx = {
  height: 48,
  px: 1.5,
  boxSizing: 'border-box' as const,
  width: '100%',
  border: '1px solid',
  borderColor: tokens.lineStrong,
  borderRadius: 1,
  font: 'inherit',
  fontSize: '1rem',
  color: tokens.ink,
  bgcolor: tokens.surface,
  '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 0 },
};

/**
 * Inline admission enquiry (canvas: right-rail "Get admission help" form).
 * Same request and consent as the LeadCaptureButton dialog: the details go to
 * the college's admissions team.
 */
export default function AdmissionHelpCard({ collegeId, collegeName, shortName }: Props) {
  const lead = useCollegeLead(collegeId);

  return (
    <Box
      component="section"
      id="admission-help"
      aria-labelledby="admission-help-heading"
      sx={{
        scrollMarginTop: 'calc(var(--broadcast-banner-height, 0px) + 72px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
        p: { xs: 2, md: 3 },
        bgcolor: tokens.surface,
        border: { md: '1px solid' },
        borderColor: { md: tokens.line },
        borderRadius: { xs: 0, md: 1 },
        boxShadow: 'none',
      }}
    >
      <Typography id="admission-help-heading" variant="h2" sx={{ m: 0, fontSize: { xs: '1.15rem', md: 18 }, fontWeight: 700, lineHeight: 1.3 }}>
        Get admission help for {shortName}
      </Typography>
      {lead.success ? (
        <Alert severity="success" icon={<SchoolIcon />}>
          Thanks. {collegeName}&apos;s admissions team will contact you soon.
        </Alert>
      ) : (
        <Box
          component="form"
          noValidate
          onSubmit={(e: React.FormEvent) => {
            e.preventDefault();
            void lead.submit();
          }}
          sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
        >
          <Typography sx={{ m: 0, fontSize: '0.9rem', lineHeight: 1.5, color: tokens.inkMuted }}>
            Share your name and number and the college&apos;s admissions team will call you about fees, seats and documents. Free.
          </Typography>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: tokens.inkMuted }}>
            Your name
            <Box component="input" type="text" autoComplete="name" value={lead.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setName(e.target.value)} sx={inputSx} />
          </Box>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: tokens.inkMuted }}>
            Mobile number
            <Box sx={{ display: 'flex', height: 48, border: '1px solid', borderColor: tokens.lineStrong, borderRadius: 1, overflow: 'hidden', '&:focus-within': { outline: tokens.focusOutline, outlineOffset: 2 } }}>
              <Box component="span" aria-hidden sx={{ display: 'flex', alignItems: 'center', px: 1.25, bgcolor: tokens.surfaceHover, borderRight: '1px solid', borderColor: tokens.lineStrong, fontSize: '1rem', fontWeight: 400, color: tokens.inkMuted }}>
                +91
              </Box>
              <Box
                component="input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                aria-describedby="lead-phone-hint"
                value={lead.phone}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setPhone(e.target.value)}
                sx={{ flex: '1 1 auto', minWidth: 0, border: 0, px: 1.5, font: 'inherit', fontSize: '1rem', color: tokens.ink, outline: 'none', bgcolor: tokens.surface }}
              />
            </Box>
            <Box component="span" id="lead-phone-hint" sx={{ fontWeight: 400, fontSize: '0.78rem' }}>
              10-digit Indian mobile number
            </Box>
          </Box>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: tokens.inkMuted }}>
            Parent&apos;s mobile (optional)
            <Box
              component="input"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              aria-describedby="lead-parent-hint"
              value={lead.parentPhone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setParentPhone(e.target.value)}
              sx={inputSx}
            />
            <Box component="span" id="lead-parent-hint" sx={{ fontWeight: 400, fontSize: '0.78rem' }}>
              Under 18? The college can talk to your parent too.
            </Box>
          </Box>
          <Box component="label" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, fontSize: '0.84rem', lineHeight: 1.45, color: tokens.inkMuted, cursor: 'pointer' }}>
            <Box
              component="input"
              type="checkbox"
              checked={lead.consent}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setConsent(e.target.checked)}
              sx={{ width: 20, height: 20, m: 0, mt: '1px', flex: '0 0 auto', accentColor: tokens.navy900 }}
            />
            I agree to share my details with {collegeName} so their admissions team can contact me.
          </Box>
          {lead.error && (
            <Alert severity="error" role="alert" sx={{ py: 0.25 }}>
              {lead.error}
            </Alert>
          )}
          <Box
            component="button"
            type="submit"
            disabled={lead.submitting}
            aria-busy={lead.submitting}
            sx={{ ...ctaButtonSx, height: 48, border: 0, borderRadius: 1, font: 'inherit', fontSize: '1rem', cursor: lead.submitting ? 'progress' : 'pointer', opacity: lead.submitting ? 0.75 : 1, '&:focus-visible': { outline: tokens.focusOutline, outlineOffset: 2 } }}
          >
            {lead.submitting ? 'Sending' : 'Request a call back'}
          </Box>
          <Typography sx={{ m: 0, fontSize: '0.8rem', color: tokens.inkMuted }}>Used only for admission enquiries. No spam.</Typography>
        </Box>
      )}
    </Box>
  );
}
