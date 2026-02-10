'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardMedia,
  Button,
  Grid,
  Chip,
  IconButton,
  Skeleton,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import {
  LocationOnOutlined,
  PhoneOutlined,
  DirectionsOutlined,
  ScheduleOutlined,
  BusinessOutlined,
  WifiOutlined,
  LocalParkingOutlined,
  AcUnitOutlined,
  CheckCircleOutlined,
} from '@mui/icons-material';
import type { OfflineCenter } from '@neram/database';

// Facility icons mapping
const facilityIcons: Record<string, React.ReactNode> = {
  AC: <AcUnitOutlined fontSize="small" />,
  WiFi: <WifiOutlined fontSize="small" />,
  Parking: <LocalParkingOutlined fontSize="small" />,
};

export default function CentersPage() {
  const t = useTranslations('centers');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Visit booking modal state
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState<OfflineCenter | null>(null);
  const [bookingForm, setBookingForm] = useState({
    name: '',
    phone: '',
    email: '',
    visitDate: '',
    visitTimeSlot: '',
    purpose: 'Tour',
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    try {
      const response = await fetch('/api/centers');
      const data = await response.json();

      if (data.success) {
        setCenters(data.data);
      } else {
        setError(data.error || 'Failed to load centers');
      }
    } catch {
      setError('Failed to load learning centers. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleBookVisit = (center: OfflineCenter) => {
    setSelectedCenter(center);
    setBookingOpen(true);
    setBookingSuccess(false);
  };

  const handleBookingSubmit = async () => {
    if (!selectedCenter) return;

    setBookingSubmitting(true);

    try {
      const response = await fetch('/api/centers/visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          center_id: selectedCenter.id,
          visitor_name: bookingForm.name,
          visitor_phone: bookingForm.phone,
          visitor_email: bookingForm.email,
          visit_date: bookingForm.visitDate,
          visit_time_slot: bookingForm.visitTimeSlot,
          purpose: bookingForm.purpose,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setBookingSuccess(true);
        // Reset form
        setBookingForm({
          name: '',
          phone: '',
          email: '',
          visitDate: '',
          visitTimeSlot: '',
          purpose: 'Tour',
        });
      } else {
        setError(data.error || 'Failed to book visit');
      }
    } catch {
      setError('Failed to book visit. Please try again.');
    } finally {
      setBookingSubmitting(false);
    }
  };

  const handleGetDirections = (center: OfflineCenter) => {
    if (center.google_maps_url) {
      window.open(center.google_maps_url, '_blank');
    } else if (center.latitude && center.longitude) {
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`,
        '_blank'
      );
    } else {
      window.open(
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${center.name}, ${center.address}, ${center.city}`
        )}`,
        '_blank'
      );
    }
  };

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  // Get minimum date for booking (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <Box sx={{ py: 4 }}>
      <Container maxWidth="lg">
        {/* Hero Section */}
        <Box textAlign="center" mb={6}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700 }}
          >
            {t('title') || 'Visit Our Learning Centers'}
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{ maxWidth: 600, mx: 'auto', mb: 3 }}
          >
            {t('subtitle') ||
              'Experience our hybrid learning environment. Visit any of our centers to explore facilities and meet our faculty.'}
          </Typography>

          {/* Customer Care Number */}
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              bgcolor: 'primary.light',
              color: 'primary.contrastText',
              px: 3,
              py: 1.5,
              borderRadius: 2,
            }}
          >
            <PhoneOutlined />
            <Typography variant="h6" component="span">
              {t('customerCare') || 'Customer Care:'}{' '}
              <Box
                component="a"
                href="tel:+919876543210"
                sx={{ color: 'inherit', fontWeight: 700 }}
              >
                +91 98765 43210
              </Box>
            </Typography>
          </Box>
        </Box>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Centers Grid */}
        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} md={6} lg={4} key={i}>
                <Card>
                  <Skeleton variant="rectangular" height={200} />
                  <CardContent>
                    <Skeleton variant="text" width="60%" height={32} />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="80%" />
                    <Box display="flex" gap={1} mt={2}>
                      <Skeleton variant="rectangular" width={100} height={36} />
                      <Skeleton variant="rectangular" width={100} height={36} />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : centers.length === 0 ? (
          <Box textAlign="center" py={8}>
            <BusinessOutlined sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {t('noCenters') || 'No centers available at the moment'}
            </Typography>
          </Box>
        ) : (
          <Grid container spacing={3}>
            {centers.map((center) => (
              <Grid item xs={12} md={6} lg={4} key={center.id}>
                <Card
                  sx={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 6,
                    },
                  }}
                >
                  {/* Center Image */}
                  {center.photos && center.photos.length > 0 ? (
                    <CardMedia
                      component="img"
                      height="200"
                      image={center.photos[0]}
                      alt={center.name}
                      sx={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: 200,
                        bgcolor: 'grey.200',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <BusinessOutlined sx={{ fontSize: 64, color: 'grey.400' }} />
                    </Box>
                  )}

                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* Center Name */}
                    <Typography variant="h6" gutterBottom fontWeight={600}>
                      {center.name}
                    </Typography>

                    {/* Address */}
                    <Box display="flex" alignItems="flex-start" gap={1} mb={2}>
                      <LocationOnOutlined
                        fontSize="small"
                        color="action"
                        sx={{ mt: 0.5 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {center.address}
                        <br />
                        {center.city}, {center.state} {center.pincode}
                      </Typography>
                    </Box>

                    {/* Operating Hours */}
                    {center.preferred_visit_times && center.preferred_visit_times.length > 0 && (
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <ScheduleOutlined fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {t('visitingHours') || 'Visiting Hours:'}{' '}
                          {center.preferred_visit_times.join(', ')}
                        </Typography>
                      </Box>
                    )}

                    {/* Facilities */}
                    {center.facilities && center.facilities.length > 0 && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mb={2}>
                        {center.facilities.map((facility) => (
                          <Chip
                            key={facility}
                            label={facility}
                            size="small"
                            icon={facilityIcons[facility] || undefined}
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    )}

                    {/* Contact Phone */}
                    {center.contact_phone && (
                      <Box display="flex" alignItems="center" gap={1} mb={2}>
                        <PhoneOutlined fontSize="small" color="action" />
                        <Typography
                          variant="body2"
                          component="a"
                          href={`tel:${center.contact_phone}`}
                          sx={{ color: 'primary.main', textDecoration: 'none' }}
                        >
                          {center.contact_phone}
                        </Typography>
                      </Box>
                    )}
                  </CardContent>

                  {/* Action Buttons */}
                  <Box
                    sx={{
                      p: 2,
                      pt: 0,
                      display: 'flex',
                      gap: 1,
                      flexDirection: isMobile ? 'column' : 'row',
                    }}
                  >
                    <Button
                      variant="contained"
                      startIcon={<DirectionsOutlined />}
                      onClick={() => handleGetDirections(center)}
                      fullWidth={isMobile}
                      sx={{ minHeight: 48 }}
                    >
                      {t('getDirections') || 'Get Directions'}
                    </Button>
                    <Button
                      variant="outlined"
                      onClick={() => handleBookVisit(center)}
                      fullWidth={isMobile}
                      sx={{ minHeight: 48 }}
                    >
                      {t('bookVisit') || 'Book a Visit'}
                    </Button>
                  </Box>

                  {/* Google Business Link */}
                  {center.google_business_url && (
                    <Box px={2} pb={2}>
                      <Button
                        variant="text"
                        size="small"
                        href={center.google_business_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{ fontSize: '0.75rem' }}
                      >
                        {t('viewOnGoogle') || 'View on Google Maps'}
                      </Button>
                    </Box>
                  )}
                </Card>
              </Grid>
            ))}
          </Grid>
        )}

        {/* Book Visit Dialog */}
        <Dialog
          open={bookingOpen}
          onClose={() => setBookingOpen(false)}
          maxWidth="sm"
          fullWidth
          fullScreen={isMobile}
        >
          <DialogTitle>
            {bookingSuccess
              ? t('visitBooked') || 'Visit Booked!'
              : t('bookVisitTitle') || 'Book a Center Visit'}
          </DialogTitle>
          <DialogContent>
            {bookingSuccess ? (
              <Box textAlign="center" py={4}>
                <CheckCircleOutlined
                  sx={{ fontSize: 64, color: 'success.main', mb: 2 }}
                />
                <Typography variant="h6" gutterBottom>
                  {t('visitConfirmed') || 'Your visit has been scheduled!'}
                </Typography>
                <Typography color="text.secondary">
                  {t('visitConfirmationMessage') ||
                    'Our team will contact you to confirm the visit details.'}
                </Typography>
              </Box>
            ) : (
              <Box component="form" sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary" mb={2}>
                  {t('bookVisitSubtitle') ||
                    `Schedule a visit to ${selectedCenter?.name}`}
                </Typography>

                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label={t('yourName') || 'Your Name'}
                      value={bookingForm.name}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, name: e.target.value })
                      }
                      required
                      inputProps={{ minLength: 2 }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={t('phoneNumber') || 'Phone Number'}
                      value={bookingForm.phone}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, phone: e.target.value })
                      }
                      required
                      inputProps={{
                        inputMode: 'numeric',
                        pattern: '[0-9]*',
                        maxLength: 10,
                      }}
                      placeholder="9876543210"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={t('email') || 'Email (Optional)'}
                      type="email"
                      value={bookingForm.email}
                      onChange={(e) =>
                        setBookingForm({ ...bookingForm, email: e.target.value })
                      }
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label={t('preferredDate') || 'Preferred Date'}
                      type="date"
                      value={bookingForm.visitDate}
                      onChange={(e) =>
                        setBookingForm({
                          ...bookingForm,
                          visitDate: e.target.value,
                        })
                      }
                      required
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ min: getMinDate() }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required>
                      <InputLabel>{t('preferredTime') || 'Preferred Time'}</InputLabel>
                      <Select
                        value={bookingForm.visitTimeSlot}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            visitTimeSlot: e.target.value as string,
                          })
                        }
                        label={t('preferredTime') || 'Preferred Time'}
                      >
                        {selectedCenter?.preferred_visit_times?.map((slot) => (
                          <MenuItem key={slot} value={slot}>
                            {slot}
                          </MenuItem>
                        )) || (
                          <>
                            <MenuItem value="10:00 AM - 12:00 PM">
                              10:00 AM - 12:00 PM
                            </MenuItem>
                            <MenuItem value="2:00 PM - 5:00 PM">
                              2:00 PM - 5:00 PM
                            </MenuItem>
                          </>
                        )}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <FormControl fullWidth>
                      <InputLabel>{t('purpose') || 'Purpose of Visit'}</InputLabel>
                      <Select
                        value={bookingForm.purpose}
                        onChange={(e) =>
                          setBookingForm({
                            ...bookingForm,
                            purpose: e.target.value as string,
                          })
                        }
                        label={t('purpose') || 'Purpose of Visit'}
                      >
                        <MenuItem value="Tour">
                          {t('purposeTour') || 'Center Tour'}
                        </MenuItem>
                        <MenuItem value="Demo Class">
                          {t('purposeDemo') || 'Demo Class'}
                        </MenuItem>
                        <MenuItem value="Fee Discussion">
                          {t('purposeFee') || 'Fee Discussion'}
                        </MenuItem>
                        <MenuItem value="Other">
                          {t('purposeOther') || 'Other'}
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}>
            {bookingSuccess ? (
              <Button
                variant="contained"
                onClick={() => setBookingOpen(false)}
                fullWidth={isMobile}
              >
                {t('close') || 'Close'}
              </Button>
            ) : (
              <>
                <Button onClick={() => setBookingOpen(false)}>
                  {t('cancel') || 'Cancel'}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleBookingSubmit}
                  disabled={
                    bookingSubmitting ||
                    !bookingForm.name ||
                    !bookingForm.phone ||
                    !bookingForm.visitDate ||
                    !bookingForm.visitTimeSlot
                  }
                >
                  {bookingSubmitting
                    ? t('booking') || 'Booking...'
                    : t('confirmBooking') || 'Confirm Booking'}
                </Button>
              </>
            )}
          </DialogActions>
        </Dialog>
      </Container>
    </Box>
  );
}
