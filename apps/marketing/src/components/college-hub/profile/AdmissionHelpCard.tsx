'use client';

import { Alert, Box, Typography } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import { useCollegeLead } from '../useCollegeLead';
import { ctaButtonSx } from '../directory/hub-styles';

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
  borderColor: 'grey.400',
  borderRadius: 1.5,
  font: 'inherit',
  fontSize: '1rem',
  color: 'text.primary',
  bgcolor: 'background.paper',
  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 0 },
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
        bgcolor: 'background.paper',
        border: { md: '1px solid' },
        borderColor: { md: 'divider' },
        borderRadius: { xs: 0, md: 2 },
        boxShadow: { md: '0 8px 24px rgba(15, 27, 45, 0.06)' },
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
          <Typography sx={{ m: 0, fontSize: '0.9rem', lineHeight: 1.5, color: 'text.secondary' }}>
            Share your name and number and the college&apos;s admissions team will call you about fees, seats and documents. Free.
          </Typography>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: 'text.secondary' }}>
            Your name
            <Box component="input" type="text" autoComplete="name" value={lead.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setName(e.target.value)} sx={inputSx} />
          </Box>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: 'text.secondary' }}>
            Mobile number
            <Box sx={{ display: 'flex', height: 48, border: '1px solid', borderColor: 'grey.400', borderRadius: 1.5, overflow: 'hidden', '&:focus-within': { outline: '2px solid', outlineColor: 'primary.main' } }}>
              <Box component="span" aria-hidden sx={{ display: 'flex', alignItems: 'center', px: 1.25, bgcolor: 'action.hover', borderRight: '1px solid', borderColor: 'grey.400', fontSize: '1rem', fontWeight: 400, color: 'text.secondary' }}>
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
                sx={{ flex: '1 1 auto', minWidth: 0, border: 0, px: 1.5, font: 'inherit', fontSize: '1rem', color: 'text.primary', outline: 'none', bgcolor: 'background.paper' }}
              />
            </Box>
            <Box component="span" id="lead-phone-hint" sx={{ fontWeight: 400, fontSize: '0.78rem' }}>
              10-digit Indian mobile number
            </Box>
          </Box>
          <Box component="label" sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: '0.84rem', fontWeight: 600, color: 'text.secondary' }}>
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
          <Box component="label" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.25, fontSize: '0.84rem', lineHeight: 1.45, color: 'text.secondary', cursor: 'pointer' }}>
            <Box
              component="input"
              type="checkbox"
              checked={lead.consent}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => lead.setConsent(e.target.checked)}
              sx={{ width: 20, height: 20, m: 0, mt: '1px', flex: '0 0 auto', accentColor: (t) => t.palette.primary.main }}
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
            sx={{ ...ctaButtonSx, height: 48, border: 0, borderRadius: 1.5, font: 'inherit', fontSize: '1rem', cursor: lead.submitting ? 'progress' : 'pointer', opacity: lead.submitting ? 0.75 : 1, '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } }}
          >
            {lead.submitting ? 'Sending' : 'Request a call back'}
          </Box>
          <Typography sx={{ m: 0, fontSize: '0.8rem', color: 'text.secondary' }}>Used only for admission enquiries. No spam.</Typography>
        </Box>
      )}
    </Box>
  );
}
