'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Box, Typography, TextField, Alert, CircularProgress, Skeleton } from '@neram/ui';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import TawkToChat from './TawkToChat';
import WhatsAppChatBubble from './WhatsAppChatBubble';
import type { OfflineCenter } from '@neram/database';
import { centrePagePath } from '@/lib/seo/centre-pages';
import { LeadCard, Section as BodySection } from '@/components/coaching-location/parts';
import { PageHero, AsideLayout, Section, FactsCard, CtaButton, CtaBand, tokens as t } from '@/design-system';

interface CenterData {
  headquarters: OfflineCenter | null;
  subOffices: OfflineCenter[];
}

const linkSx = {
  // 44px tap height for the phone and mail links (they stand alone in fact rows, not inside sentences).
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
  color: 'inherit',
  textDecoration: 'underline',
  textDecorationColor: t.lineStrong,
  textUnderlineOffset: '3px',
  '&:hover': { textDecorationColor: t.gold500 },
  '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
} as const;

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Box component="a" href={href} sx={linkSx}>
      {children}
    </Box>
  );
}

const bodySx = { m: 0, fontSize: '1rem', lineHeight: 1.6, color: t.inkMuted } as const;

const cardSx = {
  bgcolor: t.surface,
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  p: { xs: 2.5, sm: 3 },
  color: t.ink,
} as const;

/** The map embed for the headquarters (falls back to the Bangalore office coordinates). */
function HqMap({ hq }: { hq: OfflineCenter }) {
  return (
    <Box
      sx={{
        width: '100%',
        height: { xs: 300, md: 450 },
        borderRadius: `${t.radius}px`,
        border: `1px solid ${t.line}`,
        overflow: 'hidden',
        bgcolor: t.surface,
      }}
    >
      <iframe
        title="Neram Classes Location"
        src={`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3889.0!2d${hq.longitude || 77.6603}!3d${hq.latitude || 12.8456}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUwJzQ0LjIiTiA3N8KwMzknMzcuMSJF!5e0!3m2!1sen!2sin!4v1`}
        width="100%"
        height="100%"
        style={{ border: 0, display: 'block' }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </Box>
  );
}

/** T9 utility/company page: dark hero, contact facts + the form in a lead card, centres, map. */
export default function ContactPageContent() {
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

  const [centers, setCenters] = useState<CenterData>({
    headquarters: null,
    subOffices: [],
  });
  const [centersLoading, setCentersLoading] = useState(true);

  // Fetch centers data on mount
  useEffect(() => {
    async function fetchCenters() {
      try {
        const res = await fetch('/api/centers');
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            const allCenters = json.data as OfflineCenter[];
            const hq = allCenters.find((c) => c.center_type === 'headquarters') || null;
            const subs = allCenters.filter((c) => c.center_type === 'sub_office');
            setCenters({ headquarters: hq, subOffices: subs });
          }
        }
      } catch (err) {
        console.error('Failed to fetch centers:', err);
      } finally {
        setCentersLoading(false);
      }
    }
    fetchCenters();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    // Clear result when user starts typing again
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
          subject: formData.subject,
          message: formData.message,
          source: 'contact_page',
        }),
      });

      const json = await res.json();

      if (res.ok && json.success) {
        setSubmitResult({
          type: 'success',
          message: 'Thank you for contacting us! We will get back to you within 24 hours.',
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

  const hq = centers.headquarters;

  return (
    <Box>
      <TawkToChat />
      <WhatsAppChatBubble />

      <PageHero
        breadcrumb={[{ name: 'Home', href: '/' }, { name: 'Contact' }]}
        title="Contact Us"
        lede="Have questions about NATA coaching? We would love to hear from you. Reach out to us and we will respond as soon as possible."
        actions={
          <>
            <CtaButton href="tel:+919176137043" startIcon={<PhoneOutlinedIcon aria-hidden />} endIcon={null}>
              +91-9176137043
            </CtaButton>
            <CtaButton variant="outline" href="#message">
              Send us a Message
            </CtaButton>
          </>
        }
      />

      <Box sx={{ bgcolor: t.ground }}>
        <AsideLayout
          aside={
            <LeadCard id="message" title="Send us a Message" body="Fill out the form below and we will get back to you within 24 hours">
              {submitResult && (
                <Alert severity={submitResult.type} role={submitResult.type === 'error' ? 'alert' : 'status'}>
                  {submitResult.message}
                </Alert>
              )}

              <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
                <TextField
                  fullWidth
                  label="Full Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  variant="outlined"
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
                  variant="outlined"
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
                  variant="outlined"
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
                  required
                  variant="outlined"
                  disabled={submitting}
                  inputProps={{ minLength: 2 }}
                />
                <TextField
                  fullWidth
                  label="Message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  multiline
                  rows={5}
                  variant="outlined"
                  disabled={submitting}
                  inputProps={{ minLength: 10 }}
                />
                <CtaButton
                  type="submit"
                  fullWidth
                  disabled={submitting}
                  endIcon={submitting ? <CircularProgress size={20} color="inherit" aria-hidden /> : undefined}
                >
                  {submitting ? 'Sending...' : 'Send Message'}
                </CtaButton>
              </Box>
            </LeadCard>
          }
        >
          <BodySection id="get-in-touch" title="Get in Touch">
            <Typography component="p" sx={bodySx}>
              Feel free to reach out to us through any of these channels
            </Typography>
            <FactsCard
              items={[
                { label: 'Phone', value: <TextLink href="tel:+919176137043">+91-9176137043</TextLink> },
                {
                  label: 'Email',
                  value: (
                    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, wordBreak: 'break-word' }}>
                      <TextLink href="mailto:info@neramclasses.com">info@neramclasses.com</TextLink>
                      <TextLink href="mailto:admissions@neramclasses.com">admissions@neramclasses.com</TextLink>
                    </Box>
                  ),
                },
                {
                  label: 'Office Hours',
                  value: (
                    <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                      <span>Monday - Saturday</span>
                      <span>9:00 AM - 6:00 PM</span>
                      <span>Sunday: Closed</span>
                    </Box>
                  ),
                },
              ]}
            />
          </BodySection>

          {centersLoading && (
            <Box sx={{ ...cardSx, display: 'flex', flexDirection: 'column', gap: 1 }} aria-busy="true" aria-label="Loading our offices">
              <Skeleton variant="text" width="45%" height={32} />
              <Skeleton variant="text" width="90%" />
              <Skeleton variant="text" width="75%" />
              <Skeleton variant="text" width="60%" />
            </Box>
          )}

          {hq && (
            <BodySection id="headquarters" title="Our Headquarters">
              {hq.description && (
                <Typography component="p" sx={bodySx}>
                  {hq.description}
                </Typography>
              )}
              <FactsCard
                title={hq.name}
                titleAs="h3"
                items={[
                  {
                    label: 'Address',
                    value: (
                      <>
                        {hq.address}
                        <br />
                        {hq.city}, {hq.state} {hq.pincode && `- ${hq.pincode}`}
                        <br />
                        {hq.country}
                      </>
                    ),
                  },
                  ...(hq.contact_phone
                    ? [{ label: 'Phone', value: <TextLink href={`tel:${hq.contact_phone}`}>{hq.contact_phone}</TextLink> }]
                    : []),
                  ...(hq.contact_email
                    ? [
                        {
                          label: 'Email',
                          value: (
                            <Box component="span" sx={{ wordBreak: 'break-word' }}>
                              <TextLink href={`mailto:${hq.contact_email}`}>{hq.contact_email}</TextLink>
                            </Box>
                          ),
                        },
                      ]
                    : []),
                  ...(hq.operating_hours
                    ? [
                        {
                          label: 'Office Hours',
                          value: (
                            <Box component="span" sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                              {Object.entries(hq.operating_hours).map(([day, hours]) => (
                                <span key={day}>
                                  {day}: {hours ? `${hours.open} - ${hours.close}` : 'Closed'}
                                </span>
                              ))}
                            </Box>
                          ),
                        },
                      ]
                    : []),
                ]}
              />

              {hq.facilities && hq.facilities.length > 0 && (
                <Box component="ul" aria-label="Facilities" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {hq.facilities.map((facility) => (
                    <Box
                      component="li"
                      key={facility}
                      sx={{
                        border: `1px solid ${t.line}`,
                        borderRadius: `${t.radiusPill}px`,
                        bgcolor: t.surface,
                        px: 1.5,
                        py: 0.5,
                        fontSize: '0.875rem',
                        fontWeight: 500,
                        color: t.ink,
                      }}
                    >
                      {facility}
                    </Box>
                  ))}
                </Box>
              )}

              {hq.seo_slug && (
                <Box>
                  <CtaButton variant="outline" size="md" href={centrePagePath(hq.seo_slug)}>
                    View Full Details
                  </CtaButton>
                </Box>
              )}
            </BodySection>
          )}
        </AsideLayout>
      </Box>

      {!centersLoading && centers.subOffices.length > 0 && (
        <Section id="centres" tone="white" gap={3.5} header={{ align: 'start', title: 'Our Centers Across India' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: 2 }}>
            {centers.subOffices.map((center) => (
              <Box
                key={center.id}
                component="article"
                sx={{
                  ...cardSx,
                  bgcolor: t.ground,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.25,
                  transition: 'border-color 150ms ease',
                  '&:hover': { borderColor: t.gold500 },
                }}
              >
                <Typography component="h3" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
                  {center.city}
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <LocationOnOutlinedIcon aria-hidden sx={{ fontSize: 20, color: t.gold800, flexShrink: 0, mt: '2px' }} />
                  <Typography component="p" sx={{ ...bodySx, fontSize: '0.9375rem' }}>
                    {center.address}
                    <br />
                    {center.city}, {center.state}
                  </Typography>
                </Box>

                {center.contact_phone && (
                  <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', fontSize: '0.9375rem' }}>
                    <PhoneOutlinedIcon aria-hidden sx={{ fontSize: 20, color: t.gold800, flexShrink: 0 }} />
                    <TextLink href={`tel:${center.contact_phone}`}>{center.contact_phone}</TextLink>
                  </Box>
                )}

                {center.seo_slug && (
                  <Box sx={{ mt: 'auto', pt: 0.5 }}>
                    <CtaButton variant="link" size="md" href={centrePagePath(center.seo_slug)} endIcon={undefined}>
                      View Details
                    </CtaButton>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Section>
      )}

      {hq && (
        <Section
          id="map"
          gap={3}
          header={{ align: 'start', title: 'Find Us on Map', lede: `${hq.address}, ${hq.city}, ${hq.state}`, ledeWidth: 720 }}
        >
          <HqMap hq={hq} />
        </Section>
      )}

      <CtaBand
        eyebrow="Free demo class"
        title="See how we teach before you decide"
        lede="Join a free live demo class with our architecture faculty, or talk to us about fees and batches."
        actions={
          <>
            <CtaButton href="/demo-class">Book a free demo class</CtaButton>
            <CtaButton variant="link" href="/fees">
              View fees
            </CtaButton>
          </>
        }
      />
    </Box>
  );
}
