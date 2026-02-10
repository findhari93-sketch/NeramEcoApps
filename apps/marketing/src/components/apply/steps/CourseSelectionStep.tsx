'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActionArea,
  FormControlLabel,
  Checkbox,
  Button,
  Chip,
  Skeleton,
  Alert,
  Divider,
} from '@neram/ui';
import {
  ArchitectureOutlined,
  SchoolOutlined,
  CheckCircleOutlined,
  LocationOnOutlined,
  PhoneCallbackOutlined,
  InfoOutlined,
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
];

export default function CourseSelectionStep() {
  const { formData, updateFormData } = useFormContext();
  const { course } = formData;

  const [centers, setCenters] = useState<OfflineCenter[]>([]);
  const [centersLoading, setCentersLoading] = useState(true);

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

  const handleCourseSelect = (courseType: CourseType) => {
    updateFormData('course', { interestCourse: courseType });
  };

  const handleCenterSelect = (centerId: string) => {
    updateFormData('course', {
      selectedCenterId: course.selectedCenterId === centerId ? null : centerId,
    });
  };

  return (
    <Box>
      <Typography variant="h6" gutterBottom fontWeight={600}>
        Course Selection
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Choose the exam you want to prepare for and select your preferred learning mode.
      </Typography>

      {/* Course Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Which exam are you preparing for? *
        </Typography>
        <Grid container spacing={2}>
          {COURSE_OPTIONS.map((option) => (
            <Grid item xs={12} sm={4} key={option.value}>
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

      {/* Hybrid Learning Description */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Our Hybrid Learning Approach
        </Typography>
        <Card variant="outlined" sx={{ bgcolor: 'info.50', borderColor: 'info.main' }}>
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

        <FormControlLabel
          control={
            <Checkbox
              checked={course.hybridLearningAccepted}
              onChange={(e) =>
                updateFormData('course', { hybridLearningAccepted: e.target.checked })
              }
            />
          }
          label="I'm interested in hybrid learning (both online and offline classes)"
          sx={{ mt: 2 }}
        />
      </Box>

      {/* Offline Center Selection */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Preferred Offline Center (Optional)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          If you prefer attending offline classes, select a center near you.
        </Typography>

        {centersLoading ? (
          <Grid container spacing={2}>
            {[1, 2, 3].map((i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Skeleton variant="rectangular" height={120} sx={{ borderRadius: 1 }} />
              </Grid>
            ))}
          </Grid>
        ) : centers.length === 0 ? (
          <Alert severity="info">
            No offline centers available at the moment. You can still enroll for online classes.
          </Alert>
        ) : (
          <Grid container spacing={2}>
            {centers.map((center) => (
              <Grid item xs={12} sm={6} md={4} key={center.id}>
                <Card
                  variant={course.selectedCenterId === center.id ? 'elevation' : 'outlined'}
                  sx={{
                    height: '100%',
                    borderColor:
                      course.selectedCenterId === center.id ? 'primary.main' : 'divider',
                    borderWidth: course.selectedCenterId === center.id ? 2 : 1,
                    cursor: 'pointer',
                  }}
                  onClick={() => handleCenterSelect(center.id)}
                >
                  <CardContent>
                    <Box display="flex" alignItems="flex-start" justifyContent="space-between">
                      <Box>
                        <Typography variant="subtitle2" fontWeight={600}>
                          {center.name}
                        </Typography>
                        <Box display="flex" alignItems="center" gap={0.5} mt={0.5}>
                          <LocationOnOutlined fontSize="small" color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {center.city}, {center.state}
                          </Typography>
                        </Box>
                      </Box>
                      {course.selectedCenterId === center.id && (
                        <CheckCircleOutlined color="primary" />
                      )}
                    </Box>
                    {center.facilities && center.facilities.length > 0 && (
                      <Box display="flex" flexWrap="wrap" gap={0.5} mt={1}>
                        {center.facilities.slice(0, 3).map((facility) => (
                          <Chip key={facility} label={facility} size="small" variant="outlined" />
                        ))}
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
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
