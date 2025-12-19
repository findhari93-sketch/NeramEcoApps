'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
} from '@neram/ui';

export default function ContactPage() {
  const t = useTranslations('contact');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement form submission logic
    console.log('Form submitted:', formData);
    setSubmitted(true);
    // Reset form
    setFormData({
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    });
  };

  return (
    <Box>
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
            sx={{ fontWeight: 700 }}
          >
            Contact Us
          </Typography>
          <Typography variant="h5" sx={{ maxWidth: '700px', opacity: 0.9 }}>
            Have questions? We'd love to hear from you. Send us a message and we'll
            respond as soon as possible.
          </Typography>
        </Container>
      </Box>

      {/* Contact Information & Form */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            {/* Contact Information */}
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
                    Office Address
                  </Typography>
                  <Typography variant="body2">
                    Neram Classes
                    <br />
                    123 Education Street
                    <br />
                    Bangalore, Karnataka
                    <br />
                    India - 560001
                  </Typography>
                </CardContent>
              </Card>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary">
                    Phone
                  </Typography>
                  <Typography variant="body2">
                    +91 80 1234 5678
                    <br />
                    +91 80 8765 4321
                  </Typography>
                </CardContent>
              </Card>

              <Card sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom color="primary">
                    Email
                  </Typography>
                  <Typography variant="body2">
                    info@neramclasses.com
                    <br />
                    admissions@neramclasses.com
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
                <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    Send us a Message
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                    Fill out the form below and we'll get back to you within 24 hours
                  </Typography>

                  {submitted && (
                    <Alert severity="success" sx={{ mb: 3 }}>
                      Thank you for contacting us! We'll get back to you soon.
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit}>
                    <Grid container spacing={3}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Full Name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          variant="outlined"
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
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          fullWidth
                          label="Phone Number"
                          name="phone"
                          value={formData.phone}
                          onChange={handleChange}
                          required
                          variant="outlined"
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
                          rows={6}
                          variant="outlined"
                        />
                      </Grid>
                      <Grid item xs={12}>
                        <Button
                          type="submit"
                          variant="contained"
                          size="large"
                          fullWidth
                          sx={{ py: 1.5 }}
                        >
                          Send Message
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

      {/* Map Section (Placeholder) */}
      <Box sx={{ bgcolor: 'grey.100', py: { xs: 6, md: 8 } }}>
        <Container maxWidth="lg">
          <Typography variant="h4" align="center" gutterBottom sx={{ fontWeight: 700 }}>
            Find Us on Map
          </Typography>
          <Box
            sx={{
              width: '100%',
              height: { xs: 300, md: 400 },
              bgcolor: 'grey.300',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mt: 4,
              borderRadius: 1,
            }}
          >
            <Typography variant="h6" color="text.secondary">
              Map Integration Placeholder
            </Typography>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
