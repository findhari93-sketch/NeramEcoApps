'use client';

/**
 * /centers: every classroom with a city filter, directions and a visit booking.
 * Dark PageHero, a light body (online-classes InlineCta, filter pills, centre
 * cards), and a phone bar on phones. Translated page: visible labels come from
 * the `centers` namespace.
 *
 * Journey: entered from the header, footer or contact page. Each card goes to
 * /apply (with the centre pre-selected), Google Maps, or the visit dialog.
 */
import { useState, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import {
  Box,
  Typography,
  Button,
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
import { photoUrl } from '@/lib/seo/centre-photos';
import { CtaButton, EmptyState, InlineCta, PageHero, Pill, tokens as t } from '@/design-system';

// Facility icons mapping
const facilityIcons: Record<string, React.ReactElement> = {
  AC: <AcUnitOutlined aria-hidden />,
  WiFi: <WifiOutlined aria-hidden />,
  Parking: <LocalParkingOutlined aria-hidden />,
};

/** Height of the phone bar; the page pads its bottom by this on phones. */
const PHONE_BAR_HEIGHT = 64;

const cardSx = {
  bgcolor: t.surface,
  border: `1px solid ${t.line}`,
  borderRadius: `${t.radius}px`,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box',
  color: t.ink,
  transition: 'border-color 150ms ease',
  '&:hover': { borderColor: t.gold500 },
  '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
} as const;

const gridSx = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
  gap: 3,
} as const;

function directionsUrl(center: OfflineCenter) {
  if (center.google_maps_url) return center.google_maps_url;
  if (center.latitude && center.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${center.latitude},${center.longitude}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${center.name}, ${center.address}, ${center.city}`)}`;
}

export default function CentersPageContent() {
  const t9n = useTranslations('centers');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

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

  // Get minimum date for booking (tomorrow)
  const getMinDate = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  };

  return (
    <Box sx={{ pb: { xs: `${PHONE_BAR_HEIGHT}px`, sm: 0 } }}>
      <PageHero
        title={t9n('title') || 'Visit Our Learning Centers'}
        lede={
          t9n('subtitle') ||
          'Experience our hybrid learning environment. Visit any of our centers to explore facilities and meet our faculty.'
        }
      >
        {/* Customer Care Number */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <PhoneOutlined aria-hidden fontSize="small" sx={{ color: t.gold500, mt: '3px' }} />
          <Typography component="p" sx={{ m: 0, lineHeight: 1.55, color: t.paperMuted }}>
            {t9n('customerCare') || 'Customer Care:'}{' '}
            <Box
              component="a"
              href="tel:+919176137043"
              sx={{ color: t.paper, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              +91 91761 37043 / 88074 37399
            </Box>
          </Typography>
        </Box>
      </PageHero>

      <Box sx={{ bgcolor: t.ground }}>
        <Box
          sx={{
            maxWidth: t.container.page,
            mx: 'auto',
            px: { xs: 2, sm: 3 },
            pt: { xs: 5, md: 7 },
            pb: { xs: 8, md: 10 },
            display: 'flex',
            flexDirection: 'column',
            gap: { xs: 3, md: 4 },
            boxSizing: 'content-box',
          }}
        >
          {/* Online Classes Banner */}
          <InlineCta
            icon={<LaptopOutlined />}
            title={t9n('preferOnline') || 'Prefer 100% Online Classes?'}
            body={t9n('onlineDescription') || 'No need to visit a center. Learn from anywhere with live online classes.'}
            action={<CtaButton href="/apply?mode=online">{t9n('applyOnline') || 'Apply for Online Classes'}</CtaButton>}
          />

          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* City Filter Pills */}
          {!loading && centers.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {cities.map((city) => (
                <Pill key={city} selected={selectedCity === city} onClick={() => setSelectedCity(city)}>
                  {city}
                </Pill>
              ))}
            </Box>
          )}

          {/* Centers Grid */}
          {loading ? (
            <Box sx={gridSx} aria-busy="true">
              {[1, 2, 3].map((i) => (
                <Box key={i} sx={cardSx}>
                  <Skeleton variant="rectangular" height={180} />
                  <Box sx={{ p: 2.5 }}>
                    <Skeleton variant="text" width="60%" height={32} />
                    <Skeleton variant="text" width="100%" />
                    <Skeleton variant="text" width="80%" />
                    <Skeleton variant="rectangular" height={48} sx={{ mt: 2, borderRadius: `${t.radius}px` }} />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : centers.length === 0 ? (
            <EmptyState icon={<BusinessOutlined />} title={t9n('noCenters') || 'No centers available at the moment'} />
          ) : (
            <Box sx={gridSx}>
              {filteredCenters.map((center) => (
                <Box component="article" key={center.id} sx={cardSx}>
                  {/* Center Image / Placeholder */}
                  {center.photos && center.photos.length > 0 && photoUrl(center.photos[0]) ? (
                    <Box
                      component="img"
                      src={photoUrl(center.photos[0])!}
                      alt={center.name}
                      loading="lazy"
                      sx={{ height: 180, width: '100%', objectFit: 'cover', display: 'block' }}
                    />
                  ) : (
                    <Box
                      aria-hidden
                      sx={{
                        height: 180,
                        bgcolor: t.navy900,
                        ...t.blueprint,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        color: t.paper,
                      }}
                    >
                      <BusinessOutlined sx={{ fontSize: 44, color: t.gold500 }} />
                      <Typography component="span" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                        {center.city}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {/* Center Name */}
                    <Typography component="h2" sx={{ m: 0, fontSize: '1.125rem', fontWeight: 700, lineHeight: 1.3 }}>
                      {center.name}
                    </Typography>

                    {/* Address */}
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                      <LocationOnOutlined aria-hidden fontSize="small" sx={{ color: t.inkMuted, mt: '2px' }} />
                      <Typography sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: t.inkMuted }}>
                        {center.address}
                        <br />
                        {center.city}, {center.state} {center.pincode}
                      </Typography>
                    </Box>

                    {/* Operating Hours */}
                    {center.preferred_visit_times && center.preferred_visit_times.length > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                        <ScheduleOutlined aria-hidden fontSize="small" sx={{ color: t.inkMuted, mt: '2px' }} />
                        <Typography sx={{ m: 0, fontSize: '0.9375rem', lineHeight: 1.5, color: t.inkMuted }}>
                          {t9n('visitingHours') || 'Visiting Hours:'} {center.preferred_visit_times.join(', ')}
                        </Typography>
                      </Box>
                    )}

                    {/* Facilities */}
                    {center.facilities && center.facilities.length > 0 && (
                      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                        {center.facilities.map((facility) => (
                          <Box
                            component="li"
                            key={facility}
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.5,
                              px: 1.25,
                              py: 0.5,
                              border: `1px solid ${t.line}`,
                              borderRadius: `${t.radiusPill}px`,
                              fontSize: '0.8125rem',
                              fontWeight: 500,
                              '& svg': { fontSize: 16, color: t.gold800 },
                            }}
                          >
                            {facilityIcons[facility]}
                            {facility}
                          </Box>
                        ))}
                      </Box>
                    )}

                    {/* Contact Phone */}
                    {center.contact_phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PhoneOutlined aria-hidden fontSize="small" sx={{ color: t.inkMuted }} />
                        <Box
                          component="a"
                          href={`tel:${center.contact_phone}`}
                          sx={{
                            color: t.ink,
                            fontWeight: 600,
                            fontSize: '0.9375rem',
                            textDecoration: 'underline',
                            textDecorationColor: t.lineStrong,
                            textUnderlineOffset: '3px',
                            '&:hover': { textDecorationColor: t.gold500 },
                          }}
                        >
                          {center.contact_phone}
                        </Box>
                      </Box>
                    )}
                  </Box>

                  {/* Action Buttons */}
                  <Box sx={{ px: 2.5, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Apply with this Center - Primary CTA */}
                    <CtaButton href={`/apply?center=${center.slug}`} startIcon={<SchoolOutlined aria-hidden />} endIcon={null} fullWidth size="md">
                      {t9n('applyWithCenter') || 'Apply with this Center'}
                    </CtaButton>

                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      <CtaButton
                        variant="outline"
                        href={directionsUrl(center)}
                        external
                        startIcon={<DirectionsOutlined aria-hidden />}
                        endIcon={null}
                        size="md"
                        sx={{ flex: '1 1 140px' }}
                      >
                        {t9n('getDirections') || 'Get Directions'}
                      </CtaButton>
                      <CtaButton variant="outline" onClick={() => handleBookVisit(center)} endIcon={null} size="md" sx={{ flex: '1 1 140px' }}>
                        {t9n('bookVisit') || 'Book a Visit'}
                      </CtaButton>
                    </Box>

                    {/* Google Business Link */}
                    {center.google_business_url && (
                      <Box>
                        <CtaButton variant="link" href={center.google_business_url} external size="md">
                          {t9n('viewOnGoogle') || 'View on Google Maps'}
                        </CtaButton>
                      </Box>
                    )}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* Book Visit Dialog (full screen on phones) */}
      <Dialog open={bookingOpen} onClose={() => setBookingOpen(false)} maxWidth="sm" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontWeight: 700 }}>
          {bookingSuccess ? t9n('visitBooked') || 'Visit Booked!' : t9n('bookVisitTitle') || 'Book a Center Visit'}
        </DialogTitle>
        <DialogContent>
          {bookingSuccess ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <CheckCircleOutlined aria-hidden sx={{ fontSize: 64, color: t.success, mb: 2 }} />
              <Typography component="p" sx={{ m: 0, mb: 1, fontSize: '1.25rem', fontWeight: 700 }}>
                {t9n('visitConfirmed') || 'Your visit has been scheduled!'}
              </Typography>
              <Typography sx={{ m: 0, color: t.inkMuted }}>
                {t9n('visitConfirmationMessage') || 'Our team will contact you to confirm the visit details.'}
              </Typography>
            </Box>
          ) : (
            <Box component="form" sx={{ mt: 2 }}>
              <Typography sx={{ m: 0, mb: 2, fontSize: '0.9375rem', color: t.inkMuted }}>
                {t9n('bookVisitSubtitle') || `Schedule a visit to ${selectedCenter?.name}`}
              </Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                <TextField
                  fullWidth
                  label={t9n('yourName') || 'Your Name'}
                  value={bookingForm.name}
                  onChange={(e) => setBookingForm({ ...bookingForm, name: e.target.value })}
                  required
                  inputProps={{ minLength: 2 }}
                  sx={{ gridColumn: '1 / -1' }}
                />
                <TextField
                  fullWidth
                  label={t9n('phoneNumber') || 'Phone Number'}
                  value={bookingForm.phone}
                  onChange={(e) => setBookingForm({ ...bookingForm, phone: e.target.value })}
                  required
                  inputProps={{
                    inputMode: 'numeric',
                    pattern: '[0-9]*',
                    maxLength: 10,
                  }}
                  placeholder="9876543210"
                />
                <TextField
                  fullWidth
                  label={t9n('email') || 'Email (Optional)'}
                  type="email"
                  value={bookingForm.email}
                  onChange={(e) => setBookingForm({ ...bookingForm, email: e.target.value })}
                />
                <TextField
                  fullWidth
                  label={t9n('preferredDate') || 'Preferred Date'}
                  type="date"
                  value={bookingForm.visitDate}
                  onChange={(e) => setBookingForm({ ...bookingForm, visitDate: e.target.value })}
                  required
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: getMinDate() }}
                />
                <FormControl fullWidth required>
                  <InputLabel>{t9n('preferredTime') || 'Preferred Time'}</InputLabel>
                  <Select
                    value={bookingForm.visitTimeSlot}
                    onChange={(e) => setBookingForm({ ...bookingForm, visitTimeSlot: e.target.value as string })}
                    label={t9n('preferredTime') || 'Preferred Time'}
                  >
                    {selectedCenter?.preferred_visit_times?.map((slot) => (
                      <MenuItem key={slot} value={slot}>
                        {slot}
                      </MenuItem>
                    )) || (
                      <>
                        <MenuItem value="10:00 AM - 12:00 PM">10:00 AM - 12:00 PM</MenuItem>
                        <MenuItem value="2:00 PM - 5:00 PM">2:00 PM - 5:00 PM</MenuItem>
                      </>
                    )}
                  </Select>
                </FormControl>
                <FormControl fullWidth sx={{ gridColumn: '1 / -1' }}>
                  <InputLabel>{t9n('purpose') || 'Purpose of Visit'}</InputLabel>
                  <Select
                    value={bookingForm.purpose}
                    onChange={(e) => setBookingForm({ ...bookingForm, purpose: e.target.value as string })}
                    label={t9n('purpose') || 'Purpose of Visit'}
                  >
                    <MenuItem value="Tour">{t9n('purposeTour') || 'Center Tour'}</MenuItem>
                    <MenuItem value="Demo Class">{t9n('purposeDemo') || 'Demo Class'}</MenuItem>
                    <MenuItem value="Fee Discussion">{t9n('purposeFee') || 'Fee Discussion'}</MenuItem>
                    <MenuItem value="Other">{t9n('purposeOther') || 'Other'}</MenuItem>
                  </Select>
                </FormControl>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
          {bookingSuccess ? (
            <CtaButton onClick={() => setBookingOpen(false)} endIcon={null} size="md" fullWidth={isMobile}>
              {t9n('close') || 'Close'}
            </CtaButton>
          ) : (
            <>
              <Button onClick={() => setBookingOpen(false)} sx={{ minHeight: 44, color: t.ink }}>
                {t9n('cancel') || 'Cancel'}
              </Button>
              <CtaButton
                onClick={handleBookingSubmit}
                endIcon={null}
                size="md"
                disabled={
                  bookingSubmitting || !bookingForm.name || !bookingForm.phone || !bookingForm.visitDate || !bookingForm.visitTimeSlot
                }
              >
                {bookingSubmitting ? t9n('booking') || 'Booking...' : t9n('confirmBooking') || 'Confirm Booking'}
              </CtaButton>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* Sticky phone bar (phones only) */}
      <Box
        sx={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 1100,
          display: { xs: 'flex', sm: 'none' },
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: PHONE_BAR_HEIGHT,
          px: 2,
          pb: 'env(safe-area-inset-bottom)',
          boxSizing: 'border-box',
          bgcolor: t.navy900,
          borderTop: `1px solid ${t.lineDark}`,
        }}
      >
        <Box
          component="a"
          href="tel:+919176137043"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 48,
            color: t.paper,
            fontWeight: 600,
            textDecoration: 'none',
            '& svg': { color: t.gold500 },
            '&:focus-visible': { outline: t.focusOutline, outlineOffset: '2px' },
          }}
        >
          <PhoneOutlined aria-hidden />
          {t9n('customerCare') || 'Customer Care:'} +91 91761 37043
        </Box>
      </Box>
    </Box>
  );
}
