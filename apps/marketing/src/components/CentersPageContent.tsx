'use client';

import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Chip,
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
  LaptopOutlined,
  SchoolOutlined,
} from '@mui/icons-material';
import type { OfflineCenter } from '@neram/database';
import Link from 'next/link';

// Facility icons mapping
const facilityIcons: Record<string, React.ReactElement> = {
  AC: <AcUnitOutlined fontSize="small" />,
  WiFi: <WifiOutlined fontSize="small" />,
  Parking: <LocalParkingOutlined fontSize="small" />,
};

// City gradient colors for placeholder images
const cityGradients: Record<string, string> = {
  Pudukkottai: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  Tiruchirapalli: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  Coimbatore: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  Chennai: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  Madurai: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  Tiruppur: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
};

const defaultGradient = 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)';

export default function CentersPageContent() {
  const t = useTranslations('centers');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const params = useParams();
  const locale = (params?.locale as string) || 'en';

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState('All');

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

  // Derive unique cities for filter
  const cities = useMemo(() => {
    const uniqueCities = [...new Set(centers.map((c) => c.city))].sort();
    return ['All', ...uniqueCities];
  }, [centers]);

  // Filter centers by city
  const filteredCenters = useMemo(() => {
    if (selectedCity === 'All') return centers;
    return centers.filter((c) => c.city === selectedCity);
  }, [centers, selectedCity]);

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

  // Get minimum date for booking (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <Box sx={{ py: 4, pb: isMobile ? 10 : 4 }}>
      <Container maxWidth="lg">
        {/* Hero Section */}
        <Box textAlign="center" mb={4}>
          <Typography
            variant="h3"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 700, fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' } }}
          >
            {t('title') || 'Visit Our Learning Centers'}
          </Typography>
          <Typography
            variant="h6"
            color="text.secondary"
            sx={{
              maxWidth: 600,
              mx: 'auto',
              mb: 3,
              fontSize: { xs: '0.95rem', sm: '1.1rem' },
            }}
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
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              px: 3,
              py: 1.5,
              borderRadius: 1,
            }}
          >
            <PhoneOutlined />
            <Typography variant="body1" component="span" fontWeight={600}>
              {t('customerCare') || 'Customer Care:'}{' '}
              <Box
                component="a"
                href="tel:+919176137043"
                sx={{ color: 'inherit', fontWeight: 700, textDecoration: 'none' }}
              >
                +91 91761 37043 / 88074 37399
              </Box>
            </Typography>
          </Box>
        </Box>

        {/* Online Classes Banner */}
        <Card
          variant="outlined"
          sx={{
            mb: 4,
            borderColor: 'success.main',
            bgcolor: 'success.50',
            borderRadius: 1,
          }}
        >
          <CardContent
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 2,
              py: { xs: 2, sm: 2.5 },
              '&:last-child': { pb: { xs: 2, sm: 2.5 } },
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <LaptopOutlined sx={{ fontSize: 36, color: 'success.main' }} />
              <Box>
                <Typography variant="subtitle1" fontWeight={600}>
                  {t('preferOnline') || 'Prefer 100% Online Classes?'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('onlineDescription') ||
                    'No need to visit a center. Learn from anywhere with live online classes.'}
                </Typography>
              </Box>
            </Box>
            <Button
              variant="contained"
              color="success"
              component={Link}
              href={`/${locale}/apply?mode=online`}
              sx={{ minHeight: 48, minWidth: 180, whiteSpace: 'nowrap' }}
            >
              {t('applyOnline') || 'Apply for Online Classes'}
            </Button>
          </CardContent>
        </Card>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* City Filter Chips */}
        {!loading && centers.length > 0 && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              pb: 1,
              mb: 3,
              '&::-webkit-scrollbar': { display: 'none' },
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
            }}
          >
            {cities.map((city) => (
              <Chip
                key={city}
                label={city}
                onClick={() => setSelectedCity(city)}
                color={selectedCity === city ? 'primary' : 'default'}
                variant={selectedCity === city ? 'filled' : 'outlined'}
                sx={{
                  minHeight: 40,
                  minWidth: 80,
                  fontWeight: selectedCity === city ? 600 : 400,
                  flexShrink: 0,
                }}
              />
            ))}
          </Box>
        )}

        {/* Centers Grid */}
        {loading ? (
          <Grid container spacing={3}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} lg={4} key={i}>
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
            {filteredCenters.map((center) => (
              <Grid item xs={12} sm={6} lg={4} key={center.id}>
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
                  {/* Center Image / Placeholder */}
                  {center.photos && center.photos.length > 0 ? (
                    <Box
                      component="img"
                      src={center.photos[0]}
                      alt={center.name}
                      sx={{
                        height: 180,
                        width: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        height: 180,
                        background: cityGradients[center.city] || defaultGradient,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        position: 'relative',
                      }}
                    >
                      <BusinessOutlined sx={{ fontSize: 48, opacity: 0.8, mb: 1 }} />
                      <Typography variant="h6" fontWeight={600} sx={{ opacity: 0.9 }}>
                        {center.city}
                      </Typography>
                    </Box>
                  )}

                  <CardContent sx={{ flexGrow: 1 }}>
                    {/* Center Name */}
                    <Typography variant="h6" gutterBottom fontWeight={700} sx={{ fontSize: '1.05rem' }}>
                      {center.name}
                    </Typography>

                    {/* Address */}
                    <Box display="flex" alignItems="flex-start" gap={1} mb={1.5}>
                      <LocationOnOutlined
                        fontSize="small"
                        color="action"
                        sx={{ mt: 0.3 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        {center.address}
                        <br />
                        {center.city}, {center.state} {center.pincode}
                      </Typography>
                    </Box>

                    {/* Operating Hours */}
                    {center.preferred_visit_times && center.preferred_visit_times.length > 0 && (
                      <Box display="flex" alignItems="center" gap={1} mb={1.5}>
                        <ScheduleOutlined fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">
                          {t('visitingHours') || 'Visiting Hours:'}{' '}
                          {center.preferred_visit_times.join(', ')}
                        </Typography>
                      </Box>
                    )}

                    {/* Facilities */}
                    {center.facilities && center.facilities.length > 0 && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mb={1.5}>
                        {center.facilities.map((facility) => (
                          <Chip
                            key={facility}
                            label={facility}
                            size="small"
                            icon={facilityIcons[facility]}
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    )}

                    {/* Contact Phone */}
                    {center.contact_phone && (
                      <Box display="flex" alignItems="center" gap={1}>
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
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    {/* Apply with this Center - Primary CTA */}
                    <Button
                      variant="contained"
                      color="secondary"
                      startIcon={<SchoolOutlined />}
                      component={Link}
                      href={`/${locale}/apply?center=${center.slug}`}
                      fullWidth
                      sx={{ minHeight: 48 }}
                    >
                      {t('applyWithCenter') || 'Apply with this Center'}
                    </Button>

                    <Box
                      sx={{
                        display: 'flex',
                        gap: 1,
                        flexDirection: isMobile ? 'column' : 'row',
                      }}
                    >
                      <Button
                        variant="outlined"
                        startIcon={<DirectionsOutlined />}
                        onClick={() => handleGetDirections(center)}
                        fullWidth
                        sx={{ minHeight: 44 }}
                      >
                        {t('getDirections') || 'Get Directions'}
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => handleBookVisit(center)}
                        fullWidth
                        sx={{ minHeight: 44 }}
                      >
                        {t('bookVisit') || 'Book a Visit'}
                      </Button>
                    </Box>
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

      {/* Sticky Mobile Phone Bar */}
      {isMobile && (
        <Box
          sx={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1100,
            bgcolor: 'primary.main',
            color: 'primary.contrastText',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            py: 1.5,
            px: 2,
            boxShadow: '0 -2px 10px rgba(0,0,0,0.15)',
          }}
        >
          <PhoneOutlined />
          <Typography variant="body1" fontWeight={600}>
            <Box
              component="a"
              href="tel:+919176137043"
              sx={{ color: 'inherit', textDecoration: 'none' }}
            >
              {t('customerCare') || 'Customer Care:'} +91 91761 37043
            </Box>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
