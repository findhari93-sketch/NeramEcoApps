'use client';

import { useState, useEffect } from 'react';
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
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import TawkToChat from './TawkToChat';
import WhatsAppChatBubble from './WhatsAppChatBubble';
import type { OfflineCenter } from '@neram/database';

interface CenterData {
  headquarters: OfflineCenter | null;
  subOffices: OfflineCenter[];
}

export default function ContactPageContent() {
  const params = useParams();
  const locale = (params.locale as string) || 'en';

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

      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          py: { xs: 6, md: 8 },
        }}
      >
        <Container maxWidth="lg">
          <Typography
            variant="h2"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '2rem', md: '3rem' } }}
          >
            Contact Us
          </Typography>
          <Typography
            variant="h5"
            sx={{
              maxWidth: '700px',
              opacity: 0.9,
              fontSize: { xs: '1.1rem', md: '1.4rem' },
            }}
          >
            Have questions about NATA coaching? We would love to hear from you. Reach out to us and
            we will respond as soon as possible.
          </Typography>
        </Container>
      </Box>

      {/* Headquarters Section */}
      {hq && (
        <Box sx={{ py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              gutterBottom
              sx={{ fontWeight: 700, mb: { xs: 3, md: 4 }, fontSize: { xs: '1.5rem', md: '2rem' } }}
            >
              Our Headquarters
            </Typography>
            <Grid container spacing={{ xs: 3, md: 4 }}>
              {/* HQ Info */}
              <Grid item xs={12} md={5}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                    <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                      {hq.name}
                    </Typography>
                    {hq.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {hq.description}
                      </Typography>
                    )}

                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                      <LocationOnIcon color="primary" sx={{ mt: 0.3, flexShrink: 0 }} />
                      <Typography variant="body1">
                        {hq.address}
                        <br />
                        {hq.city}, {hq.state} {hq.pincode && `- ${hq.pincode}`}
                        <br />
                        {hq.country}
                      </Typography>
                    </Box>

                    {hq.contact_phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                        <PhoneIcon color="primary" sx={{ flexShrink: 0 }} />
                        <MuiLink href={`tel:${hq.contact_phone}`} color="inherit" underline="hover">
                          {hq.contact_phone}
                        </MuiLink>
                      </Box>
                    )}

                    {hq.contact_email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                        <EmailIcon color="primary" sx={{ flexShrink: 0 }} />
                        <MuiLink href={`mailto:${hq.contact_email}`} color="inherit" underline="hover">
                          {hq.contact_email}
                        </MuiLink>
                      </Box>
                    )}

                    {hq.operating_hours && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2 }}>
                        <AccessTimeIcon color="primary" sx={{ mt: 0.3, flexShrink: 0 }} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Office Hours
                          </Typography>
                          {Object.entries(hq.operating_hours).map(([day, hours]) => (
                            <Typography key={day} variant="body2" color="text.secondary">
                              {day}: {hours ? `${hours.open} - ${hours.close}` : 'Closed'}
                            </Typography>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {hq.facilities && hq.facilities.length > 0 && (
                      <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        {hq.facilities.map((facility) => (
                          <Chip
                            key={facility}
                            label={facility}
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    )}

                    {hq.seo_slug && (
                      <Box sx={{ mt: 3 }}>
                        <Button
                          component={Link}
                          href={`/${locale}/contact/${hq.seo_slug}`}
                          variant="outlined"
                          size="small"
                          endIcon={<ArrowForwardIcon />}
                        >
                          View Full Details
                        </Button>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              {/* HQ Map */}
              <Grid item xs={12} md={7}>
                <Box
                  sx={{
                    width: '100%',
                    height: { xs: 300, md: 400 },
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <iframe
                    title="Neram Classes Headquarters - Bangalore"
                    src={`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3889.0!2d${hq.longitude || 77.6603}!3d${hq.latitude || 12.8456}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUwJzQ0LjIiTiA3N8KwMzknMzcuMSJF!5e0!3m2!1sen!2sin!4v1`}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </Box>
              </Grid>
            </Grid>
          </Container>
        </Box>
      )}

      {/* Sub-offices Section */}
      {!centersLoading && centers.subOffices.length > 0 && (
        <Box sx={{ bgcolor: 'grey.50', py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              gutterBottom
              sx={{ fontWeight: 700, mb: { xs: 3, md: 4 }, fontSize: { xs: '1.5rem', md: '2rem' } }}
            >
              Our Centers Across India
            </Typography>
            <Grid container spacing={{ xs: 2, md: 3 }}>
              {centers.subOffices.map((center) => (
                <Grid item xs={12} sm={6} md={4} key={center.id}>
                  <Card
                    sx={{
                      height: '100%',
                      transition: 'box-shadow 0.2s',
                      '&:hover': { boxShadow: 4 },
                    }}
                  >
                    <CardContent sx={{ p: { xs: 2, md: 2.5 } }}>
                      <Typography variant="h6" gutterBottom sx={{ fontWeight: 700 }}>
                        {center.city}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        {center.address}
                        <br />
                        {center.city}, {center.state}
                      </Typography>

                      {center.contact_phone && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <PhoneIcon fontSize="small" color="action" />
                          <MuiLink
                            href={`tel:${center.contact_phone}`}
                            variant="body2"
                            color="inherit"
                            underline="hover"
                          >
                            {center.contact_phone}
                          </MuiLink>
                        </Box>
                      )}

                      {center.seo_slug && (
                        <Button
                          component={Link}
                          href={`/${locale}/contact/${center.seo_slug}`}
                          size="small"
                          endIcon={<ArrowForwardIcon />}
                          sx={{ mt: 1 }}
                        >
                          View Details
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Container>
        </Box>
      )}

      {/* Contact Form Section */}
      <Box sx={{ py: { xs: 5, md: 8 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={{ xs: 4, md: 6 }}>
            {/* Contact Information Sidebar */}
            <Grid item xs={12} md={4}>
              <Box sx={{ mb: 4 }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                  Get in Touch
                </Typography>
                <Typography variant="body1" color="text.secondary" paragraph>
                  Feel free to reach out to us through any of these channels
                </Typography>
              </Box>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary">
                    Phone
                  </Typography>
                  <MuiLink
                    href="tel:+919176137043"
                    color="inherit"
                    underline="hover"
                    variant="body2"
                  >
                    +91-9176137043
                  </MuiLink>
                </CardContent>
              </Card>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary">
                    Email
                  </Typography>
                  <Typography variant="body2">
                    <MuiLink href="mailto:info@neramclasses.com" color="inherit" underline="hover">
                      info@neramclasses.com
                    </MuiLink>
                    <br />
                    <MuiLink
                      href="mailto:admissions@neramclasses.com"
                      color="inherit"
                      underline="hover"
                    >
                      admissions@neramclasses.com
                    </MuiLink>
                  </Typography>
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary">
                    Office Hours
                  </Typography>
                  <Typography variant="body2">
                    Monday - Saturday
                    <br />
                    9:00 AM - 6:00 PM
                    <br />
                    <br />
                    Sunday: Closed
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            {/* Contact Form */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent sx={{ p: { xs: 2.5, md: 4 } }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    Send us a Message
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                    Fill out the form below and we will get back to you within 24 hours
                  </Typography>

                  {submitResult && (
                    <Alert severity={submitResult.type} sx={{ mb: 3 }}>
                      {submitResult.message}
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit}>
                    <Grid container spacing={2.5}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Full Name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          variant="outlined"
                          disabled={submitting}
                          inputProps={{ minLength: 2 }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
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
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Phone Number"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          variant="outlined"
                          disabled={submitting}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
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
                      </Grid>
                      <Grid item xs={12}>
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
                      </Grid>
                      <Grid item xs={12}>
                        <Button
                          type="submit"
                          variant="contained"
                          size="large"
                          fullWidth
                          disabled={submitting}
                          sx={{ py: 1.5, minHeight: 48 }}
                        >
                          {submitting ? (
                            <CircularProgress size={24} color="inherit" />
                          ) : (
                            'Send Message'
                          )}
                        </Button>
                      </Grid>
                    </Grid>
                  </form>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Map Section - HQ */}
      {hq && (
        <Box sx={{ bgcolor: 'grey.100', py: { xs: 5, md: 8 } }}>
          <Container maxWidth="lg">
            <Typography
              variant="h4"
              align="center"
              gutterBottom
              sx={{ fontWeight: 700, fontSize: { xs: '1.5rem', md: '2rem' } }}
            >
              Find Us on Map
            </Typography>
            <Typography
              variant="body1"
              align="center"
              color="text.secondary"
              sx={{ mb: 4 }}
            >
              {hq.address}, {hq.city}, {hq.state}
            </Typography>
            <Box
              sx={{
                width: '100%',
                height: { xs: 300, md: 450 },
                borderRadius: 1,
                overflow: 'hidden',
              }}
            >
              <iframe
                title="Neram Classes Location"
                src={`https://www.google.com/maps/embed?pb=!1m14!1m8!1m3!1d3889.0!2d${hq.longitude || 77.6603}!3d${hq.latitude || 12.8456}!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMTLCsDUwJzQ0LjIiTiA3N8KwMzknMzcuMSJF!5e0!3m2!1sen!2sin!4v1`}
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </Box>
          </Container>
        </Box>
      )}
    </Box>
  );
}
