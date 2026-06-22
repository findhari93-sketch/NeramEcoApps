'use client';

import { useTranslations } from 'next-intl';
import { notFound } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemText,
  Button,
  Divider,
} from '@neram/ui';
import { Link } from '@neram/ui';
import { useApplicationStatus } from '@/hooks/useApplicationStatus';
import { useGoToApp } from '@/hooks/useGoToApp';
import { coursesData } from '@/data/courses';

interface CourseDetailContentProps {
  slug: string;
  locale: string;
}

export default function CourseDetailContent({ slug, locale }: CourseDetailContentProps) {
  const course = coursesData[slug];
  const { status } = useApplicationStatus();
  const { goToApp } = useGoToApp();
  const isEnrolled = status === 'enrolled' || status === 'partial_payment';

  if (!course) {
    notFound();
  }

  const t = useTranslations('courseDetail');

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
          <Grid container spacing={4} alignItems="center">
            <Grid item xs={12} md={8}>
              <Box sx={{ mb: 2 }}>
                <Chip label={course.category} sx={{ mr: 1, mb: 1 }} />
                <Chip label={course.level} variant="outlined" sx={{ mb: 1 }} />
              </Box>
              <Typography
                variant="h2"
                component="h1"
                gutterBottom
                sx={{ fontWeight: 700 }}
              >
                {course.title}
              </Typography>
              <Typography variant="h5" sx={{ opacity: 0.9, mb: 3 }}>
                {course.description}
              </Typography>
              <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Duration
                  </Typography>
                  <Typography variant="h6">{course.duration}</Typography>
                </Box>
                <Box>
                  <Typography variant="body2" sx={{ opacity: 0.8 }}>
                    Price
                  </Typography>
                  <Typography variant="h6">{'₹'}{course.price}</Typography>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Course Details */}
      <Box sx={{ py: { xs: 6, md: 10 } }}>
        <Container maxWidth="lg">
          <Grid container spacing={6}>
            {/* Main Content */}
            <Grid item xs={12} md={8}>
              {/* About Course */}
              <Box sx={{ mb: 6 }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                  About This Course
                </Typography>
                <Typography variant="body1" paragraph>
                  {course.longDescription}
                </Typography>
              </Box>

              {/* Curriculum */}
              <Box sx={{ mb: 6 }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                  Curriculum
                </Typography>
                {course.curriculum.map((section, index) => (
                  <Card key={index} sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {section.title}
                      </Typography>
                      <List dense>
                        {section.topics.map((topic, idx) => (
                          <ListItem key={idx}>
                            <ListItemText primary={topic} />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                ))}
              </Box>

              {/* Features */}
              <Box sx={{ mb: 6 }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                  Course Features
                </Typography>
                <Grid container spacing={2}>
                  {course.features.map((feature, index) => (
                    <Grid item xs={12} sm={6} key={index}>
                      <Card variant="outlined">
                        <CardContent>
                          <Typography variant="body1">{feature}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              </Box>

              {/* Faculty */}
              <Box sx={{ mb: 6 }}>
                <Typography variant="h4" gutterBottom sx={{ fontWeight: 700 }}>
                  Expert Faculty
                </Typography>
                {course.faculty.map((member, index) => (
                  <Card key={index} sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="h6">{member.name}</Typography>
                      <Typography variant="body2" color="primary" gutterBottom>
                        {member.subject}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {member.qualification}
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            </Grid>

            {/* Sidebar */}
            <Grid item xs={12} md={4}>
              <Card sx={{ position: 'sticky', top: 20 }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography variant="h5" gutterBottom sx={{ fontWeight: 700 }}>
                    Enroll Now
                  </Typography>
                  <Divider sx={{ my: 2 }} />

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="h4" color="primary" gutterBottom>
                      {'₹'}{course.price}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      One-time fee
                    </Typography>
                  </Box>

                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Batch Details
                    </Typography>
                    <Typography variant="body2" paragraph>
                      <strong>Batch Size:</strong> {course.batchDetails.batchSize}
                    </Typography>
                    <Typography variant="body2" paragraph>
                      <strong>Timing:</strong> {course.batchDetails.timing}
                    </Typography>
                    <Typography variant="body2" paragraph>
                      <strong>Start Date:</strong> {course.batchDetails.startDate}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Mode:</strong> {course.batchDetails.classType}
                    </Typography>
                  </Box>

                  {isEnrolled ? (
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      sx={{ mb: 2, bgcolor: '#2E7D32', '&:hover': { bgcolor: '#1B5E20' } }}
                      onClick={goToApp}
                    >
                      Go to App
                    </Button>
                  ) : (
                    <Button
                      variant="contained"
                      size="large"
                      fullWidth
                      sx={{ mb: 2 }}
                      component={Link}
                      href={`/${locale}/apply?course=${slug}`}
                    >
                      Apply Now
                    </Button>
                  )}

                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    component={Link}
                    href={`/${locale}/contact`}
                  >
                    Contact Us
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Container>
      </Box>
    </Box>
  );
}
