'use client';

/**
 * The interactive top of /contact/{slug} (centres without a city page; the
 * others 301 to their city page). T6 structure: dark PageHero, then a light
 * body with the map, address, hours and facilities beside an aside that holds
 * the contact details, the apply card and the message form. The page file
 * renders the crawlable sections (about, courses, FAQ, CTA) after this.
 */
import { useState } from 'react';
import { Box, Typography, TextField, Alert, CircularProgress } from '@neram/ui';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import DirectionsOutlinedIcon from '@mui/icons-material/DirectionsOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import StarOutlineIcon from '@mui/icons-material/StarOutline';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import TawkToChat from './TawkToChat';
import WhatsAppChatBubble from './WhatsAppChatBubble';
import type { OfflineCenter } from '@neram/database';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { AsideLayout, CtaButton, FactsCard, PageHero, tokens as t } from '@/design-system';
import { FactTable, LeadCard, Section } from '@/components/coaching-location/parts';

interface CenterDetailPageContentProps {
  center: OfflineCenter;
}

const bodySx = { m: 0, fontSize: '1.0625rem', lineHeight: 1.7 } as const;

export default function CenterDetailPageContent({ center }: CenterDetailPageContentProps) {
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  // Contact form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (submitResult) setSubmitResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitResult(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject || `Enquiry about ${center.name}`,
          message: formData.message,
          center_id: center.id,
          source: 'center_detail_page',
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setSubmitResult({
          type: 'success',
          message: 'Thank you for your message! We will get back to you soon.',
        });
        setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
      } else {
        setSubmitResult({
          type: 'error',
          message: json.error || 'Something went wrong. Please try again.',
        });
      }
    } catch {
      setSubmitResult({
        type: 'error',
        message: 'Network error. Please check your connection and try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getDirectionsUrl = () => {
    return `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`;
  };

  const getShareWhatsAppUrl = () => {
    const mapsUrl = center.google_maps_url || `https://www.google.com/maps?q=${center.latitude},${center.longitude}`;
    const text = `Check out ${center.name}, ${center.address}, ${center.city}\n${mapsUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const linkSx = {
    color: t.ink,
    textDecoration: 'underline',
    textDecorationColor: t.lineStrong,
    textUnderlineOffset: '3px',
    overflowWrap: 'anywhere',
    '&:hover': { textDecorationColor: t.gold500 },
  } as const;

  const contactRows = [
    ...(center.contact_phone
      ? [
          {
            label: (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <PhoneOutlinedIcon aria-hidden fontSize="small" sx={{ color: t.gold800 }} />
                Phone
              </Box>
            ),
            value: (
              <Box component="a" href={`tel:${center.contact_phone}`} sx={linkSx}>
                {center.contact_phone}
              </Box>
            ),
          },
        ]
      : []),
    ...(center.contact_email
      ? [
          {
            label: (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <EmailOutlinedIcon aria-hidden fontSize="small" sx={{ color: t.gold800 }} />
                Email
              </Box>
            ),
            value: (
              <Box component="a" href={`mailto:${center.contact_email}`} sx={linkSx}>
                {center.contact_email}
              </Box>
            ),
          },
        ]
      : []),
    ...(center.operating_hours
      ? [
          {
            label: (
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                <AccessTimeOutlinedIcon aria-hidden fontSize="small" sx={{ color: t.gold800 }} />
                Hours
              </Box>
            ),
            value: 'Mon-Fri: 9:00 AM - 6:00 PM, Sat: 9:00 AM - 2:00 PM',
          },
        ]
      : []),
  ];

  return (
    <Box>
      <TawkToChat />
      <WhatsAppChatBubble />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Contact', href: '/contact' }, { name: center.name }]}
        pills={[center.state]}
        title={`Best NATA Coaching Center in ${center.city} | Neram Classes`}
        lede={`Expert NATA & JEE Paper 2 coaching in ${center.city}, ${center.state}`}
        actions={
          <>
            <CtaButton href="/demo-class" startIcon={<VideocamOutlinedIcon aria-hidden />} endIcon={null}>
              Book a free demo class
            </CtaButton>
            <CtaButton variant="outline" href="#message" endIcon={null}>
              Send a Message
            </CtaButton>
          </>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
            <PlaceOutlinedIcon aria-hidden fontSize="small" sx={{ color: t.gold500, mt: '3px' }} />
            <Typography component="p" sx={{ m: 0, lineHeight: 1.55, color: t.paper }}>
              <Box component="a" href="#visit" sx={{ color: t.paper, fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '3px' }}>
                {center.address}, {center.city}, {center.state}
              </Box>
            </Typography>
          </Box>
          {center.rating && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <StarOutlineIcon aria-hidden fontSize="small" sx={{ color: t.gold500 }} />
              <Typography component="p" sx={{ m: 0, fontSize: '0.9375rem', color: t.paperMuted }}>
                {center.rating} rating ({center.review_count} reviews)
              </Typography>
            </Box>
          )}
        </Box>
      </PageHero>

      <Box sx={{ bgcolor: t.ground }}>
        <AsideLayout
          aside={
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Contact Details */}
              {contactRows.length > 0 && <FactsCard title="Contact Information" items={contactRows} />}

              {/* Apply */}
              <Box
                sx={{
                  bgcolor: t.navy900,
                  color: t.paper,
                  borderRadius: `${t.radius}px`,
                  p: { xs: 2.5, sm: 3 },
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                }}
              >
                <Typography component="h2" sx={{ m: 0, fontSize: '1.1875rem', fontWeight: 700, lineHeight: 1.3, color: t.paper }}>
                  Ready to Start Your NATA Journey?
                </Typography>
                <Typography sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: t.paperMuted }}>
                  Apply now at this center and get expert coaching from IIT/NIT alumni.
                </Typography>
                {isEnrolled ? (
                  <CtaButton variant="success" onClick={goToApp} fullWidth endIcon={null}>
                    Go to App
                  </CtaButton>
                ) : (
                  <CtaButton href={`/apply?center=${center.slug}`} fullWidth>
                    Apply Now at This Center
                  </CtaButton>
                )}
              </Box>

              {/* Contact Form */}
              <LeadCard id="message" title="Send a Message" body="Have a question about this center? Send us a message.">
                {submitResult && <Alert severity={submitResult.type}>{submitResult.message}</Alert>}

                <form onSubmit={handleSubmit}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField
                      fullWidth
                      label="Full Name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      disabled={submitting}
                      autoComplete="name"
                      inputProps={{ minLength: 2 }}
                    />
                    <TextField
                      fullWidth
                      label="Email Address"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      disabled={submitting}
                      autoComplete="email"
                    />
                    <TextField
                      fullWidth
                      label="Phone Number"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      disabled={submitting}
                      autoComplete="tel"
                      inputProps={{ inputMode: 'tel' }}
                    />
                    <TextField
                      fullWidth
                      label="Subject"
                      name="subject"
                      value={formData.subject}
                      onChange={handleChange}
                      disabled={submitting}
                      placeholder={`Enquiry about ${center.name}`}
                    />
                    <TextField
                      fullWidth
                      label="Message"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      required
                      multiline
                      rows={4}
                      disabled={submitting}
                      inputProps={{ minLength: 10 }}
                    />
                    <CtaButton type="submit" fullWidth disabled={submitting} endIcon={null} sx={{ justifyContent: 'center' }}>
                      {submitting ? <CircularProgress size={22} color="inherit" aria-label="Sending" /> : 'Send Message'}
                    </CtaButton>
                  </Box>
                </form>
              </LeadCard>
            </Box>
          }
        >
          <Section id="visit">
            {/* Map */}
            {center.latitude && center.longitude && (
              <Box
                sx={{
                  width: '100%',
                  height: { xs: 250, md: 350 },
                  borderRadius: `${t.radius}px`,
                  border: `1px solid ${t.line}`,
                  overflow: 'hidden',
                  bgcolor: t.surface,
                }}
              >
                <iframe
                  title={`${center.name} map`}
                  src={`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3889.0!2d${center.longitude}!3d${center.latitude}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z!5e0!3m2!1sen!2sin!4v1`}
                  width="100%"
                  height="100%"
                  style={{ border: 0, display: 'block' }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </Box>
            )}

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {center.latitude && center.longitude && (
                <CtaButton variant="navy" href={getDirectionsUrl()} external startIcon={<DirectionsOutlinedIcon aria-hidden />} size="md">
                  Get Directions
                </CtaButton>
              )}
              <CtaButton
                variant="outline"
                href={getShareWhatsAppUrl()}
                external
                startIcon={<WhatsAppIcon aria-hidden />}
                endIcon={null}
                size="md"
                sx={{ '& svg': { color: t.success } }}
              >
                Share via WhatsApp
              </CtaButton>
              {center.google_business_url && (
                <CtaButton variant="outline" href={center.google_business_url} external startIcon={<StarOutlineIcon aria-hidden />} size="md">
                  Google Business
                </CtaButton>
              )}
            </Box>
          </Section>

          {/* Description */}
          {center.description && (
            <Section id="about-centre" title="About This Center">
              <Typography sx={bodySx}>{center.description}</Typography>
            </Section>
          )}

          {/* Address */}
          <Section id="address" title="Full Address">
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
              <PlaceOutlinedIcon aria-hidden sx={{ color: t.gold800, mt: '3px', flexShrink: 0 }} />
              <Typography component="address" sx={{ ...bodySx, fontStyle: 'normal' }}>
                {center.address}
                <br />
                {center.city}, {center.state}
                {center.pincode && `, ${center.pincode}`}
                <br />
                {center.country}
              </Typography>
            </Box>
          </Section>

          {/* Operating Hours */}
          {center.operating_hours && (
            <Section id="hours" title="Operating Hours">
              <Box sx={{ '& th': { textTransform: 'capitalize' } }}>
                <FactTable
                  caption={`Operating hours at ${center.name}`}
                  rows={Object.entries(center.operating_hours).map(([day, hours]) => ({
                    label: day,
                    value: hours ? `${(hours as { open: string; close: string }).open} - ${(hours as { open: string; close: string }).close}` : 'Closed',
                  }))}
                />
              </Box>
            </Section>
          )}

          {/* Facilities */}
          {center.facilities && center.facilities.length > 0 && (
            <Section id="facilities" title="Facilities">
              <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {center.facilities.map((facility) => (
                  <Box
                    component="li"
                    key={facility}
                    sx={{
                      px: 1.75,
                      py: 0.75,
                      bgcolor: t.surface,
                      border: `1px solid ${t.line}`,
                      borderRadius: `${t.radiusPill}px`,
                      fontSize: '0.9375rem',
                      fontWeight: 500,
                    }}
                  >
                    {facility}
                  </Box>
                ))}
              </Box>
            </Section>
          )}
        </AsideLayout>
      </Box>
    </Box>
  );
}
