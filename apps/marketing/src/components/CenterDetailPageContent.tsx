'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Chip,
  CircularProgress,
  Link as MuiLink,
} from '@neram/ui';
import { Link } from '@neram/ui';
import PhoneIcon from '@mui/icons-material/Phone';
import EmailIcon from '@mui/icons-material/Email';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import DirectionsIcon from '@mui/icons-material/Directions';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import StarIcon from '@mui/icons-material/Star';
import TawkToChat from './TawkToChat';
import WhatsAppChatBubble from './WhatsAppChatBubble';
import type { OfflineCenter } from '@neram/database';

interface CenterDetailPageContentProps {
  center: OfflineCenter;
}

export default function CenterDetailPageContent({ center }: CenterDetailPageContentProps) {
  const params = useParams();
  const locale = (params.locale as string) || 'en';

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
    const text = `Check out ${center.name} - ${center.address}, ${center.city}\n${mapsUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  return (
    <Box>
      <TawkToChat />
      <WhatsAppChatBubble />

      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 5, md: 7 },
        }}
      >
        <Container maxWidth="lg">
          <Chip
            label={center.state}
            sx={{ bgcolor: 'white', color: 'primary.main', mb: 2, fontWeight: 600 }}
          />
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.8rem', md: '2.5rem' } }}
          >
            Best NATA Coaching Center in {center.city} | Neram Classes
          </Typography>
          <Typography
            variant="h5"
            sx={{ opacity: 0.9, fontSize: { xs: '1rem', md: '1.25rem' }, mb: 1 }}
          >
            Expert NATA &amp; JEE Paper 2 coaching in {center.city}, {center.state}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.9 }}>
            <LocationOnIcon fontSize="small" />
            <Typography variant="body1">
              {center.address}, {center.city}, {center.state}
            </Typography>
          </Box>
          {center.rating && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, opacity: 0.9 }}>
              <StarIcon fontSize="small" />
              <Typography variant="body2">
                {center.rating} rating ({center.review_count} reviews)
              </Typography>
            </Box>
          )}
        </Container>
      </Box>

      {/* Main Content */}
      <Box sx={{ py: { xs: 4, md: 6 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 3, md: 4 }}>
            {/* Left Column - Map + Details */}
            <Grid item xs={12} md={7}>
              {/* Map */}
              {center.latitude && center.longitude && (
                <Box
                  sx={{
                    width: '100%',
                    height: { xs: 250, md: 350 },
                    borderRadius: 1,
                    overflow: 'hidden',
                    mb: 3,
                  }}
                >
                  <iframe
                    title={`${center.name} - Map`}
                    src={`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3889.0!2d${center.longitude}!3d${center.latitude}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2z!5e0!3m2!1sen!2sin!4v1`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </Box>
              )}

              {/* Action Buttons */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 4 }}>
                {center.latitude && center.longitude && (
                  <Button
                    variant="contained"
                    startIcon={<DirectionsIcon />}
                    href={getDirectionsUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ minHeight: 48 }}
                  >
                    Get Directions
                  </Button>
                )}
                <Button
                  variant="outlined"
                  startIcon={<WhatsAppIcon />}
                  href={getShareWhatsAppUrl()}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    minHeight: 48,
                    borderColor: '#25D366',
                    color: '#25D366',
                    '&:hover': { borderColor: '#128C7E', backgroundColor: 'rgba(37, 211, 102, 0.04)' },
                  }}
                >
                  Share via WhatsApp
                </Button>
                {center.google_business_url && (
                  <Button
                    variant="outlined"
                    startIcon={<StarIcon />}
                    href={center.google_business_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ minHeight: 48 }}
                  >
                    Google Business
                  </Button>
                )}
              </Box>

              {/* Description */}
              {center.description && (
                <Box sx={{ mb: 4 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    About This Center
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {center.description}
                  </Typography>
                </Box>
              )}

              {/* Address Card */}
              <Card sx={{ mb: 3 }}>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                    Full Address
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                    <LocationOnIcon color="primary" sx={{ mt: 0.3, flexShrink: 0 }} />
                    <Typography variant="body1">
                      {center.address}<br />
                      {center.city}, {center.state}
                      {center.pincode && ` - ${center.pincode}`}<br />
                      {center.country}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>

              {/* Operating Hours */}
              {center.operating_hours && (
                <Card sx={{ mb: 3 }}>
                  <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                      Operating Hours
                    </Typography>
                    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
                      <Box component="tbody">
                        {Object.entries(center.operating_hours).map(([day, hours]) => (
                          <Box
                            component="tr"
                            key={day}
                            sx={{ '&:not(:last-child) td': { borderBottom: '1px solid', borderColor: 'divider' } }}
                          >
                            <Box component="td" sx={{ py: 1, pr: 2, fontWeight: 600, textTransform: 'capitalize' }}>
                              {day}
                            </Box>
                            <Box component="td" sx={{ py: 1 }}>
                              {hours ? `${(hours as { open: string; close: string }).open} - ${(hours as { open: string; close: string }).close}` : 'Closed'}
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              )}

              {/* Facilities */}
              {center.facilities && center.facilities.length > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                    <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                      Facilities
                    </Typography>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                      {center.facilities.map((facility) => (
                        <Chip key={facility} label={facility} color="primary" variant="outlined" />
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              )}
            </Grid>

            {/* Right Column - Contact Info & Form */}
            <Grid item xs={12} md={5}>
              {/* Contact Details */}
              <Card sx={{ mb: 3 }}>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                    Contact Information
                  </Typography>
                  {center.contact_phone && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <PhoneIcon color="primary" />
                      <MuiLink href={`tel:${center.contact_phone}`} color="inherit" underline="hover" variant="body1">
                        {center.contact_phone}
                      </MuiLink>
                    </Box>
                  )}
                  {center.contact_email && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                      <EmailIcon color="primary" />
                      <MuiLink href={`mailto:${center.contact_email}`} color="inherit" underline="hover" variant="body1">
                        {center.contact_email}
                      </MuiLink>
                    </Box>
                  )}
                  {center.operating_hours && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <AccessTimeIcon color="primary" />
                      <Typography variant="body2" color="text.secondary">
                        Mon-Fri: 9:00 AM - 6:00 PM, Sat: 9:00 AM - 2:00 PM
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>

              {/* CTA - Apply Now */}
              <Card sx={{ mb: 3, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <CardContent sx={{ p: { xs: 2, md: 3 }, textAlign: 'center' }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                    Ready to Start Your NATA Journey?
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2, opacity: 0.9 }}>
                    Apply now at this center and get expert coaching from IIT/NIT alumni.
                  </Typography>
                  <Button
                    component={Link}
                    href={`/${locale}/apply?center=${center.slug}`}
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{
                      bgcolor: 'white',
                      color: 'primary.main',
                      '&:hover': { bgcolor: 'grey.100' },
                      minHeight: 48,
                    }}
                  >
                    Apply Now at This Center
                  </Button>
                </CardContent>
              </Card>

              {/* Contact Form */}
              <Card>
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                    Send a Message
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    Have a question about this center? Send us a message.
                  </Typography>

                  {submitResult && (
                    <Alert severity={submitResult.type} sx={{ mb: 2 }}>
                      {submitResult.message}
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <TextField
                        fullWidth label="Full Name" name="name"
                        value={formData.name} onChange={handleChange}
                        required size="small" disabled={submitting}
                        inputProps={{ minLength: 2 }}
                      />
                      <TextField
                        fullWidth label="Email Address" name="email" type="email"
                        value={formData.email} onChange={handleChange}
                        required size="small" disabled={submitting}
                      />
                      <TextField
                        fullWidth label="Phone Number" name="phone"
                        value={formData.phone} onChange={handleChange}
                        size="small" disabled={submitting}
                      />
                      <TextField
                        fullWidth label="Subject" name="subject"
                        value={formData.subject} onChange={handleChange}
                        size="small" disabled={submitting}
                        placeholder={`Enquiry about ${center.name}`}
                      />
                      <TextField
                        fullWidth label="Message" name="message"
                        value={formData.message} onChange={handleChange}
                        required multiline rows={4}
                        size="small" disabled={submitting}
                        inputProps={{ minLength: 10 }}
                      />
                      <Button
                        type="submit" variant="contained" fullWidth
                        disabled={submitting} sx={{ minHeight: 48 }}
                      >
                        {submitting ? <CircularProgress size={24} color="inherit" /> : 'Send Message'}
                      </Button>
                    </Box>
                  </form>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
