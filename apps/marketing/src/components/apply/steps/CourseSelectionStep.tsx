'use client';

import { useState, useEffect, useMemo } from 'react';
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
} from '@neram/ui';
import {
  ArchitectureOutlined,
  SchoolOutlined,
  CheckCircleOutlined,
  LocationOnOutlined,
  PhoneCallbackOutlined,
  InfoOutlined,
  ComputerOutlined,
  LaptopOutlined,
  HelpOutlineOutlined,
} from '@mui/icons-material';
import { useFormContext } from '../FormContext';
import type { CourseType, OfflineCenter } from '@neram/database';
import Link from 'next/link';

// Course options
const COURSE_OPTIONS: { value: CourseType; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'nata',
    label: 'NATA',
    description: 'National Aptitude Test in Architecture',
    icon: <ArchitectureOutlined sx={{ fontSize: 40 }} />,
  },
  {
    value: 'jee_paper2',
    label: 'JEE Paper 2',
    description: 'Joint Entrance Exam - Architecture',
    icon: <SchoolOutlined sx={{ fontSize: 40 }} />,
  },
  {
    value: 'both',
    label: 'Both NATA & JEE',
    description: 'Comprehensive preparation for both exams',
    icon: (
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        <ArchitectureOutlined sx={{ fontSize: 32 }} />
        <SchoolOutlined sx={{ fontSize: 32 }} />
      </Box>
    ),
  },
  {
    value: 'not_sure',
    label: 'Not Sure Yet',
    description: 'I need guidance on which exam to prepare for',
    icon: <HelpOutlineOutlined sx={{ fontSize: 40 }} />,
  },
];

export default function CourseSelectionStep() {
  const { formData, updateFormData } = useFormContext();
  const { course } = formData;

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [centersLoading, setCentersLoading] = useState(true);
  const [centerCityFilter, setCenterCityFilter] = useState('all');

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
    updateFormData('course', { interestCourse: courseType });
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

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Course Selection
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the exam you want to prepare for and select your preferred learning mode.
      </Typography>

      {/* Government School Scholarship Alert */}
      {formData.academic.applicantCategory === 'school_student' &&
        formData.academic.schoolType === 'government_school' && (
          <Alert
            severity="info"
            icon={<InfoOutlined />}
            sx={{ mb: 3, borderRadius: 2 }}
          >
            <Typography variant="body2" fontWeight={600} gutterBottom>
              Scholarship Opportunity
            </Typography>
            <Typography variant="body2">
              Government school students may qualify for our scholarship program. Submit your
              application and we will evaluate your eligibility. Fee details will be shared
              after verification.
            </Typography>
          </Alert>
        )}

      {/* Course Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Which exam are you preparing for? *
        </Typography>
        <Grid container spacing={2}>
          {COURSE_OPTIONS.map((option) => (
            <Grid item xs={12} sm={6} md={3} key={option.value}>
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
                  sx={{ height: '100%', p: 3, textAlign: 'center' }}
                >
                  <Box
                    sx={{
                      color:
                        course.interestCourse === option.value ? 'primary.main' : 'text.secondary',
                      mb: 2,
                    }}
                  >
                    {option.icon}
                  </Box>
                  <Typography
                    variant="h6"
                    fontWeight={course.interestCourse === option.value ? 700 : 600}
                  >
                    {option.label}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {option.description}
                  </Typography>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* Learning Mode Toggle */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          How would you like to learn? *
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose between our hybrid model with offline center access or 100% online classes.
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
                  Hybrid (Online + Offline)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Live online classes + weekly offline sessions at a center near you
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
                  100% Online
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Learn from anywhere with live interactive online classes
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Hybrid learning info box */}
        {course.learningMode === 'hybrid' && (
          <Card variant="outlined" sx={{ bgcolor: 'info.50', borderColor: 'info.main', mt: 2 }}>
            <CardContent>
              <Box display="flex" alignItems="flex-start" gap={2}>
                <InfoOutlined color="info" sx={{ mt: 0.5 }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                    AI-Powered Hybrid Learning Platform
                  </Typography>
                  <Typography variant="body2" color="text.secondary" paragraph>
                    We offer a unique blend of online and offline learning that adapts to your
                    schedule and learning style:
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2">
                        <strong>Online Classes:</strong>
                      </Typography>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        <li>Live interactive sessions</li>
                        <li>Recorded lectures for revision</li>
                        <li>AI-powered doubt solving</li>
                        <li>Practice tests & assessments</li>
                      </ul>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2">
                        <strong>Offline Classes:</strong>
                      </Typography>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        <li>Hands-on drawing practice</li>
                        <li>Model making sessions</li>
                        <li>Portfolio development</li>
                        <li>Peer learning environment</li>
                      </ul>
                    </Grid>
                  </Grid>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Online only info box */}
        {course.learningMode === 'online_only' && (
          <Alert severity="success" sx={{ mt: 2 }}>
            <Typography variant="body2">
              You&apos;ve selected 100% online learning. You&apos;ll get access to live interactive
              sessions, recorded lectures, AI-powered doubt solving, and practice tests — all from
              the comfort of your home.
            </Typography>
          </Alert>
        )}
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
                <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 1, mb: 2 }} />
                <Grid container spacing={2}>
                  {[1, 2, 3].map((i) => (
                    <Grid item xs={12} sm={6} key={i}>
                      <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
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
                component={Link}
                href="/centers"
                variant="text"
                startIcon={<LocationOnOutlined />}
              >
                View all centers with details
              </Button>
            </Box>
          </Box>
        </>
      )}

      <Divider sx={{ my: 4 }} />

      {/* Callback Request Option */}
      <Box
        sx={{
          p: 3,
          bgcolor: 'grey.50',
          borderRadius: 2,
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
        <Button variant="outlined" startIcon={<PhoneCallbackOutlined />} href="/apply/callback">
          Request Callback
        </Button>
      </Box>
    </Box>
  );
}
