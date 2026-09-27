'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  Button,
  Chip,
  Skeleton,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  Stack,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@neram/ui';
import ArchitectureOutlined from '@mui/icons-material/ArchitectureOutlined';
import SchoolOutlined from '@mui/icons-material/SchoolOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PhoneCallbackOutlined from '@mui/icons-material/PhoneCallbackOutlined';
import LaptopOutlined from '@mui/icons-material/LaptopOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import CloseOutlined from '@mui/icons-material/CloseOutlined';
import DirectionsOutlined from '@mui/icons-material/DirectionsOutlined';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import AccessTimeOutlined from '@mui/icons-material/AccessTimeOutlined';
import { useTranslations } from 'next-intl';
import { useFirebaseAuth, getFirebaseAuth } from '@neram/auth';
import { useFormContext } from '../FormContext';
import type { CourseType, OfflineCenter } from '@neram/database';
import { leadAttribution } from '@/lib/attribution';
import { trackTaxonomyEvent } from '@/lib/funnel-tracker';
import ProgrammePicker, { type ProgrammePick } from '../ProgrammePicker';
import FeeSummaryCard from '../FeeSummaryCard';
import YourStudiesBlock from './YourStudiesBlock';

// Course options
const COURSE_OPTIONS: { value: CourseType; labelKey: string; bodyKey: string; icon: React.ReactNode }[] = [
  {
    value: 'nata',
    labelKey: 'yourCourse.nata',
    bodyKey: 'yourCourse.nataBody',
    icon: <ArchitectureOutlined sx={{ fontSize: 32 }} />,
  },
  {
    value: 'jee_paper2',
    labelKey: 'yourCourse.jee',
    bodyKey: 'yourCourse.jeeBody',
    icon: <SchoolOutlined sx={{ fontSize: 32 }} />,
  },
  {
    value: 'both',
    labelKey: 'yourCourse.both',
    bodyKey: 'yourCourse.bothBody',
    icon: (
      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
        <ArchitectureOutlined sx={{ fontSize: 28 }} />
        <SchoolOutlined sx={{ fontSize: 28 }} />
      </Box>
    ),
  },
  {
    value: 'not_sure',
    labelKey: 'yourCourse.notSure',
    bodyKey: 'yourCourse.notSureBody',
    icon: <HelpOutlineOutlined sx={{ fontSize: 32 }} />,
  },
];

type TimeSlot = 'morning' | 'afternoon' | 'evening';

/**
 * Step 2, Your course: the exam, the programme (with its standard fee on the
 * card), how to learn, an optional centre, then Your studies. The fee card is
 * inline, never floating.
 */
export default function YourCourseStep() {
  const t = useTranslations('apply');
  const { formData, updateFormData } = useFormContext();
  const [pickedFee, setPickedFee] = useState<{ amount: number; combo: number } | null>(null);
  const { course } = formData;
  const { user } = useFirebaseAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [centersLoading, setCentersLoading] = useState(true);
  const [centerCityFilter, setCenterCityFilter] = useState('all');

  // Dialog state
  const [centersDialogOpen, setCentersDialogOpen] = useState(false);
  const [callbackDialogOpen, setCallbackDialogOpen] = useState(false);

  // Callback form state
  const [callbackSlot, setCallbackSlot] = useState<TimeSlot | null>(null);
  const [callbackNotes, setCallbackNotes] = useState('');
  const [callbackSubmitting, setCallbackSubmitting] = useState(false);
  const [callbackSuccess, setCallbackSuccess] = useState(false);
  const [callbackError, setCallbackError] = useState<string | null>(null);

  // Fetch centers on mount
  useEffect(() => {
    fetchCenters();
  }, []);

  const fetchCenters = async () => {
    try {
      const response = await fetch('/api/centers');
      const data = await response.json();
      if (data.success) {
        setCenters(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch centers:', error);
    } finally {
      setCentersLoading(false);
    }
  };

  // Derive unique cities from centers
  const uniqueCities = useMemo(() => {
    const citySet = new Set(centers.map((c) => c.city));
    return Array.from(citySet).sort();
  }, [centers]);

  // Filter centers by selected city
  const filteredCenters = useMemo(() => {
    if (centerCityFilter === 'all') return centers;
    return centers.filter((c) => c.city === centerCityFilter);
  }, [centers, centerCityFilter]);

  // Auto-set city filter when center is pre-selected (from URL param)
  useEffect(() => {
    if (course.selectedCenterId && centers.length > 0) {
      const selectedCenter = centers.find((c) => c.id === course.selectedCenterId);
      if (selectedCenter) {
        setCenterCityFilter(selectedCenter.city);
      }
    }
  }, [course.selectedCenterId, centers]);

  const handleCourseSelect = (courseType: CourseType) => {
    updateFormData('course', {
      interestCourse: courseType,
      feeStructureId: null,
      feeStructureLabel: null,
      programType: null,
    });
    setPickedFee(null);
  };

  const handleProgrammePick = (pick: ProgrammePick | null) => {
    updateFormData('course', {
      feeStructureId: pick?.id ?? null,
      feeStructureLabel: pick?.label ?? null,
      programType: pick?.programType ?? null,
    });
    setPickedFee(pick ? { amount: pick.feeAmount, combo: pick.comboExtraFee } : null);
    if (pick) trackTaxonomyEvent('course_selected', { course: course.interestCourse, fee_structure_id: pick.id });
  };

  const handleLearningModeSelect = (mode: 'hybrid' | 'online_only') => {
    if (mode === 'online_only') {
      updateFormData('course', {
        learningMode: 'online_only',
        selectedCenterId: null,
        selectedCenterName: null,
        hybridLearningAccepted: false,
      });
    } else {
      updateFormData('course', {
        learningMode: 'hybrid',
        hybridLearningAccepted: true,
      });
    }
  };

  const handleCenterSelect = (center: OfflineCenter) => {
    if (course.selectedCenterId === center.id) {
      // Deselect
      updateFormData('course', {
        selectedCenterId: null,
        selectedCenterName: null,
      });
    } else {
      updateFormData('course', {
        selectedCenterId: center.id,
        selectedCenterName: center.name,
      });
    }
  };

  const handleSelectCenterFromDialog = (center: OfflineCenter) => {
    handleCenterSelect(center);
    setCentersDialogOpen(false);
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

  const handleCallbackSubmit = useCallback(async () => {
    if (!user) return;

    setCallbackSubmitting(true);
    setCallbackError(null);

    try {
      const auth = getFirebaseAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');

      const idToken = await currentUser.getIdToken();
      const userName = formData.personal.firstName || user.name || '';
      const userPhone = (formData.personal.phone || user.phone || '').replace(/^\+91/, '');

      const response = await fetch('/api/callback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: userName,
          phone: userPhone,
          email: user.email || undefined,
          preferred_slot: callbackSlot || undefined,
          notes: callbackNotes.trim() || undefined,
          ...leadAttribution(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 400 && data.error?.includes('already requested')) {
          setCallbackError('You have already requested a callback. Our team will reach out soon.');
        } else {
          setCallbackError(data.error || 'Failed to submit callback request. Please try again.');
        }
        return;
      }

      setCallbackSuccess(true);
      trackTaxonomyEvent('callback_requested', { source: 'application_form' });
      // Auto-close after 3 seconds
      setTimeout(() => {
        setCallbackDialogOpen(false);
        setCallbackSuccess(false);
        setCallbackSlot(null);
        setCallbackNotes('');
      }, 3000);
    } catch (err) {
      console.error('Callback request error:', err);
      setCallbackError('Something went wrong. Please try again.');
    } finally {
      setCallbackSubmitting(false);
    }
  }, [user, formData.personal, callbackSlot, callbackNotes]);

  const isPhoneVerified = formData.personal.phoneVerified;

  return (
    <Box>
      <Typography variant="h5" component="h1" gutterBottom fontWeight={700}>
        {t('yourCourse.title')}
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        {t('yourCourse.subtitle')}
      </Typography>

      {/* Course Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('yourCourse.courseQuestion')}
        </Typography>
        <Grid container spacing={2}>
          {COURSE_OPTIONS.map((option) => (
            <Grid item xs={6} md={3} key={option.value}>
              <Card
                variant={course.interestCourse === option.value ? 'elevation' : 'outlined'}
                sx={{
                  height: '100%',
                  borderColor: course.interestCourse === option.value ? 'primary.main' : 'divider',
                  borderWidth: course.interestCourse === option.value ? 2 : 1,
                  bgcolor:
                    course.interestCourse === option.value ? 'primary.50' : 'background.paper',
                  position: 'relative',
                }}
              >
                {course.interestCourse === option.value && (
                  <CheckCircleOutlined
                    color="primary"
                    sx={{ position: 'absolute', top: 8, right: 8 }}
                  />
                )}
                <CardActionArea
                  onClick={() => handleCourseSelect(option.value)}
                  sx={{ height: '100%', minHeight: 48, p: 2, textAlign: 'center' }}
                >
                  <Box
                    sx={{
                      color:
                        course.interestCourse === option.value ? 'primary.main' : 'text.secondary',
                      mb: 1,
                    }}
                  >
                    {option.icon}
                  </Box>
                  <Typography
                    variant="subtitle1"
                    fontWeight={course.interestCourse === option.value ? 700 : 600}
                  >
                    {t(option.labelKey)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t(option.bodyKey)}
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      {course.interestCourse && course.interestCourse !== 'not_sure' && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="subtitle1" fontWeight={600} gutterBottom>
            {t('yourCourse.programmeQuestion')} *
          </Typography>
          <ProgrammePicker courseType={course.interestCourse} value={course.feeStructureId} onChange={handleProgrammePick} />
        </Box>
      )}

      {course.interestCourse === 'not_sure' && (
        <Alert
          severity="info"
          sx={{ mb: 4 }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => {
                setCallbackError(null);
                setCallbackSuccess(false);
                setCallbackDialogOpen(true);
              }}
              sx={{ minHeight: 44 }}
            >
              {t('yourCourse.askUsToCall')}
            </Button>
          }
        >
          {t('yourCourse.notSureFee')}
        </Alert>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Learning Mode Toggle */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          {t('yourCourse.modeQuestion')}
        </Typography>

        <Grid container spacing={2}>
          {/* Hybrid Option */}
          <Grid item xs={12} sm={6}>
            <Card
              variant={course.learningMode === 'hybrid' ? 'elevation' : 'outlined'}
              sx={{
                height: '100%',
                borderColor: course.learningMode === 'hybrid' ? 'primary.main' : 'divider',
                borderWidth: course.learningMode === 'hybrid' ? 2 : 1,
                bgcolor: course.learningMode === 'hybrid' ? 'primary.50' : 'background.paper',
                cursor: 'pointer',
                position: 'relative',
              }}
              onClick={() => handleLearningModeSelect('hybrid')}
            >
              {course.learningMode === 'hybrid' && (
                <CheckCircleOutlined
                  color="primary"
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                />
              )}
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <SchoolOutlined
                  sx={{
                    fontSize: 40,
                    color: course.learningMode === 'hybrid' ? 'primary.main' : 'text.secondary',
                  }}
                />
                <Typography variant="subtitle1" fontWeight={600} mt={1}>
                  {t('yourCourse.hybrid')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('yourCourse.hybridBody')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Online Only Option */}
          <Grid item xs={12} sm={6}>
            <Card
              variant={course.learningMode === 'online_only' ? 'elevation' : 'outlined'}
              sx={{
                height: '100%',
                borderColor: course.learningMode === 'online_only' ? 'success.main' : 'divider',
                borderWidth: course.learningMode === 'online_only' ? 2 : 1,
                bgcolor:
                  course.learningMode === 'online_only' ? 'success.50' : 'background.paper',
                cursor: 'pointer',
                position: 'relative',
              }}
              onClick={() => handleLearningModeSelect('online_only')}
            >
              {course.learningMode === 'online_only' && (
                <CheckCircleOutlined
                  color="success"
                  sx={{ position: 'absolute', top: 8, right: 8 }}
                />
              )}
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <LaptopOutlined
                  sx={{
                    fontSize: 40,
                    color:
                      course.learningMode === 'online_only' ? 'success.main' : 'text.secondary',
                  }}
                />
                <Typography variant="subtitle1" fontWeight={600} mt={1}>
                  {t('yourCourse.online')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t('yourCourse.onlineBody')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

      </Box>

      {/* Center Selection (only for hybrid mode) */}
      {course.learningMode === 'hybrid' && (
        <>
          <Divider sx={{ my: 4 }} />

          <Box sx={{ mb: 4 }}>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Select Your Preferred Center (Optional)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Choose a center near you for offline classes. You can also select later.
            </Typography>

            {centersLoading ? (
              <Box>
                <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 0.75, mb: 2 }} />
                <Grid container spacing={2}>
                  {[1, 2, 3].map((i) => (
                    <Grid item xs={12} sm={6} key={i}>
                      <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 0.75 }} />
                    </Grid>
                  ))}
                </Grid>
              </Box>
            ) : centers.length === 0 ? (
              <Alert severity="info">
                No offline centers available at the moment. You can still proceed with online
                classes.
              </Alert>
            ) : (
              <>
                {/* City Dropdown Filter */}
                <FormControl fullWidth sx={{ mb: 2 }} size="small">
                  <InputLabel>Filter by City</InputLabel>
                  <Select
                    value={centerCityFilter}
                    onChange={(e) => setCenterCityFilter(e.target.value as string)}
                    label="Filter by City"
                  >
                    <MenuItem value="all">All Cities</MenuItem>
                    {uniqueCities.map((city) => (
                      <MenuItem key={city} value={city}>
                        {city}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Center Cards Grid */}
                <Grid container spacing={2}>
                  {filteredCenters.map((center) => (
                    <Grid item xs={12} sm={6} key={center.id}>
                      <Card
                        variant={
                          course.selectedCenterId === center.id ? 'elevation' : 'outlined'
                        }
                        sx={{
                          height: '100%',
                          borderColor:
                            course.selectedCenterId === center.id ? 'primary.main' : 'divider',
                          borderWidth: course.selectedCenterId === center.id ? 2 : 1,
                          cursor: 'pointer',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                          '&:hover': {
                            borderColor: 'primary.light',
                          },
                        }}
                        onClick={() => handleCenterSelect(center)}
                      >
                        <CardContent>
                          <Box
                            display="flex"
                            alignItems="flex-start"
                            justifyContent="space-between"
                          >
                            <Box flex={1}>
                              <Typography variant="subtitle2" fontWeight={600}>
                                {center.name}
                              </Typography>
                              <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                                <LocationOnOutlined fontSize="small" color="action" />
                                <Typography variant="body2" color="text.secondary">
                                  {center.city}, {center.state}
                                </Typography>
                              </Box>
                              {center.address && (
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{ display: 'block', mt: 0.5 }}
                                >
                                  {center.address}
                                </Typography>
                              )}
                            </Box>
                            {course.selectedCenterId === center.id && (
                              <CheckCircleOutlined color="primary" />
                            )}
                          </Box>
                          {center.facilities && center.facilities.length > 0 && (
                            <Box display="flex" flexWrap="wrap" gap={0.5} mt={1.5}>
                              {center.facilities.slice(0, 4).map((facility) => (
                                <Chip
                                  key={facility}
                                  label={facility}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </>
            )}

            <Box mt={2}>
              <Button
                variant="text"
                startIcon={<LocationOnOutlined />}
                onClick={() => setCentersDialogOpen(true)}
              >
                View all centers with details
              </Button>
            </Box>
          </Box>
        </>
      )}

      <Divider sx={{ my: 4 }} />
      <YourStudiesBlock />

      {course.feeStructureLabel && (
        <Box sx={{ mt: 4 }}>
          <FeeSummaryCard
            label={course.feeStructureLabel}
            feeAmount={pickedFee?.amount ?? null}
            comboExtraFee={course.interestCourse === 'both' ? pickedFee?.combo ?? 0 : 0}
            scholarship={
              formData.academic.applicantCategory === 'school_student' &&
              formData.academic.schoolType === 'government_school'
            }
          />
        </Box>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Callback Request Option */}
      <Box
        sx={{
          p: 3,
          bgcolor: 'grey.50',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={600}>
            Need more information?
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Our counselors can help you choose the right course and answer your questions.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<PhoneCallbackOutlined />}
          onClick={() => {
            setCallbackError(null);
            setCallbackSuccess(false);
            setCallbackDialogOpen(true);
          }}
        >
          {t('yourCourse.askUsToCall')}
        </Button>
      </Box>

      {/* ============================================ */}
      {/* CENTERS DETAIL DIALOG */}
      {/* ============================================ */}
      <Dialog
        open={centersDialogOpen}
        onClose={() => setCentersDialogOpen(false)}
        fullScreen={isMobile}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pr: 1,
          }}
        >
          <Typography variant="h6" fontWeight={700}>
            Our Learning Centers
          </Typography>
          <IconButton onClick={() => setCentersDialogOpen(false)} edge="end">
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* City filter chips */}
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              pb: 1,
              mb: 2,
              '&::-webkit-scrollbar': { display: 'none' },
              msOverflowStyle: 'none',
              scrollbarWidth: 'none',
            }}
          >
            <Chip
              label="All Cities"
              onClick={() => setCenterCityFilter('all')}
              color={centerCityFilter === 'all' ? 'primary' : 'default'}
              variant={centerCityFilter === 'all' ? 'filled' : 'outlined'}
              sx={{ minHeight: 40, flexShrink: 0 }}
            />
            {uniqueCities.map((city) => (
              <Chip
                key={city}
                label={city}
                onClick={() => setCenterCityFilter(city)}
                color={centerCityFilter === city ? 'primary' : 'default'}
                variant={centerCityFilter === city ? 'filled' : 'outlined'}
                sx={{ minHeight: 40, flexShrink: 0 }}
              />
            ))}
          </Box>

          {/* Center cards */}
          <Grid container spacing={2}>
            {filteredCenters.map((center) => (
              <Grid item xs={12} sm={6} key={center.id}>
                <Card
                  variant={course.selectedCenterId === center.id ? 'elevation' : 'outlined'}
                  sx={{
                    height: '100%',
                    borderColor:
                      course.selectedCenterId === center.id ? 'primary.main' : 'divider',
                    borderWidth: course.selectedCenterId === center.id ? 2 : 1,
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                  }}
                >
                  <CardContent>
                    {/* Center Name */}
                    <Box
                      display="flex"
                      alignItems="flex-start"
                      justifyContent="space-between"
                    >
                      <Typography variant="subtitle1" fontWeight={700}>
                        {center.name}
                      </Typography>
                      {course.selectedCenterId === center.id && (
                        <CheckCircleOutlined color="primary" />
                      )}
                    </Box>

                    {/* Address */}
                    <Box display="flex" alignItems="flex-start" gap={1} mt={1}>
                      <LocationOnOutlined fontSize="small" color="action" sx={{ mt: 0.3 }} />
                      <Typography variant="body2" color="text.secondary">
                        {center.address}
                        <br />
                        {center.city}, {center.state} {center.pincode}
                      </Typography>
                    </Box>

                    {/* Visiting Hours */}
                    {center.preferred_visit_times &&
                      center.preferred_visit_times.length > 0 && (
                        <Box display="flex" alignItems="center" gap={1} mt={1}>
                          <ScheduleOutlined fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            Visiting: {center.preferred_visit_times.join(', ')}
                          </Typography>
                        </Box>
                      )}

                    {/* Contact Phone */}
                    {center.contact_phone && (
                      <Box display="flex" alignItems="center" gap={1} mt={1}>
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

                    {/* Facilities */}
                    {center.facilities && center.facilities.length > 0 && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1.5}>
                        {center.facilities.map((facility) => (
                          <Chip
                            key={facility}
                            label={facility}
                            size="small"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                    )}
                  </CardContent>

                  {/* Action Buttons */}
                  <Box sx={{ px: 2, pb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      variant={course.selectedCenterId === center.id ? 'contained' : 'outlined'}
                      size="small"
                      onClick={() => handleSelectCenterFromDialog(center)}
                      sx={{ minHeight: 40 }}
                    >
                      {course.selectedCenterId === center.id ? 'Selected' : 'Select this Center'}
                    </Button>
                    <Button
                      variant="text"
                      size="small"
                      startIcon={<DirectionsOutlined />}
                      onClick={() => handleGetDirections(center)}
                      sx={{ minHeight: 40 }}
                    >
                      Directions
                    </Button>
                  </Box>
                </Card>
              </Grid>
            ))}
          </Grid>

          {filteredCenters.length === 0 && (
            <Box textAlign="center" py={4}>
              <Typography variant="body1" color="text.secondary">
                No centers found in this city.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCentersDialogOpen(false)} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>

      {/* ============================================ */}
      {/* CALLBACK REQUEST DIALOG */}
      {/* ============================================ */}
      <Dialog
        open={callbackDialogOpen}
        onClose={() => setCallbackDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            pr: 1,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <PhoneCallbackOutlined color="primary" />
            <Typography variant="h6" fontWeight={700}>
              Request a Callback
            </Typography>
          </Box>
          <IconButton onClick={() => setCallbackDialogOpen(false)} edge="end">
            <CloseOutlined />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {/* Success State */}
          {callbackSuccess ? (
            <Box textAlign="center" py={4}>
              <CheckCircleOutlined sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" gutterBottom fontWeight={600}>
                Callback Requested!
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
                Our counselors will call you soon to help with your queries.
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="center" gap={1} mt={2}>
                <AccessTimeOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">
                  Usually within 2-4 hours during business hours
                </Typography>
              </Box>
            </Box>
          ) : !user ? (
            /* Not Authenticated */
            <Box textAlign="center" py={3}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                Please complete the login and phone verification in the application form first, then request a callback.
              </Typography>
              <Button
                variant="contained"
                onClick={() => setCallbackDialogOpen(false)}
                sx={{ minHeight: 48 }}
              >
                Go Back to Form
              </Button>
            </Box>
          ) : !isPhoneVerified ? (
            /* Phone Not Verified */
            <Box textAlign="center" py={3}>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                Please verify your phone number in Step 1 (Personal Information) first. We need a verified phone number to call you back.
              </Typography>
              <Button
                variant="contained"
                onClick={() => setCallbackDialogOpen(false)}
                sx={{ minHeight: 48 }}
              >
                Go Back to Form
              </Button>
            </Box>
          ) : (
            /* Phone Verified - Show Callback Form */
            <Stack spacing={3} sx={{ mt: 1 }}>
              {callbackError && (
                <Alert severity="error" onClose={() => setCallbackError(null)}>
                  {callbackError}
                </Alert>
              )}

              {/* Pre-filled info */}
              <Stack spacing={2}>
                <TextField
                  label="Your Name"
                  value={formData.personal.firstName || ''}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  size="medium"
                />
                <TextField
                  label="Your Phone"
                  value={formData.personal.phone?.replace(/^\+91/, '') || ''}
                  InputProps={{ readOnly: true }}
                  fullWidth
                  size="medium"
                />
              </Stack>

              {/* Preferred Time Slot */}
              <Box>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                  Preferred time for callback (optional)
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {(['morning', 'afternoon', 'evening'] as TimeSlot[]).map((slot) => (
                    <Chip
                      key={slot}
                      label={slot.charAt(0).toUpperCase() + slot.slice(1)}
                      onClick={() => setCallbackSlot(callbackSlot === slot ? null : slot)}
                      color={callbackSlot === slot ? 'primary' : 'default'}
                      variant={callbackSlot === slot ? 'filled' : 'outlined'}
                      sx={{ minHeight: 40 }}
                    />
                  ))}
                </Stack>
              </Box>

              {/* Notes */}
              <TextField
                label="Any specific questions? (optional)"
                placeholder="E.g., fee structure, batch timings, center facilities..."
                value={callbackNotes}
                onChange={(e) => setCallbackNotes(e.target.value)}
                multiline
                rows={3}
                fullWidth
              />
            </Stack>
          )}
        </DialogContent>
        {!callbackSuccess && user && isPhoneVerified && (
          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={() => setCallbackDialogOpen(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={handleCallbackSubmit}
              disabled={callbackSubmitting}
              startIcon={
                callbackSubmitting ? (
                  <CircularProgress size={20} color="inherit" />
                ) : (
                  <PhoneCallbackOutlined />
                )
              }
              sx={{ minHeight: 48 }}
            >
              {callbackSubmitting ? 'Submitting...' : 'Request Callback'}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}
