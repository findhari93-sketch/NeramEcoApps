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
  ListItemIcon,
  ListItemText,
  Button,
  Divider,
} from '@neram/ui';
import { Link } from '@neram/ui';

// Mock course data (in real app, this would come from API/database)
const coursesData: Record<string, any> = {
  'neet-preparation': {
    id: 1,
    title: 'NEET Preparation',
    description:
      'Comprehensive NEET coaching with experienced faculty, regular mock tests, and proven results.',
    longDescription:
      'Our NEET preparation course is designed to help aspiring medical students crack the National Eligibility cum Entrance Test with flying colors. With over 95% success rate, our proven methodology combines conceptual clarity, regular practice, and personalized attention to ensure you achieve your dream rank.',
    duration: '1 Year',
    level: 'Advanced',
    category: 'Medical Entrance',
    image: '/images/courses/neet.jpg',
    price: '60,000',
    curriculum: [
      {
        title: 'Physics',
        topics: [
          'Mechanics',
          'Thermodynamics',
          'Electrodynamics',
          'Optics',
          'Modern Physics',
        ],
      },
      {
        title: 'Chemistry',
        topics: [
          'Physical Chemistry',
          'Organic Chemistry',
          'Inorganic Chemistry',
          'Environmental Chemistry',
        ],
      },
      {
        title: 'Biology',
        topics: [
          'Cell Biology',
          'Genetics',
          'Human Physiology',
          'Plant Biology',
          'Ecology',
        ],
      },
    ],
    features: [
      'Daily Practice Tests',
      'Doubt Clearing Sessions',
      'Comprehensive Study Material',
      'Previous Year Papers Analysis',
      'Weekly Performance Tracking',
      'Parent-Teacher Meetings',
      'Online Test Portal Access',
      'Mobile App for Learning',
    ],
    faculty: [
      {
        name: 'Dr. Ramesh Kumar',
        subject: 'Physics',
        qualification: 'Ph.D. IIT Delhi, 15+ years experience',
      },
      {
        name: 'Dr. Priya Sharma',
        subject: 'Chemistry',
        qualification: 'Ph.D. Chemistry, Former IIT Faculty',
      },
      {
        name: 'Dr. Lakshmi Iyer',
        subject: 'Biology',
        qualification: 'Ph.D. Molecular Biology, NEET Expert',
      },
    ],
    batchDetails: {
      batchSize: '30 students',
      timing: 'Morning & Evening Batches Available',
      startDate: 'June 1st, 2025',
      classType: 'Offline & Online Options',
    },
  },
  'jee-main-advanced': {
    id: 2,
    title: 'JEE Main & Advanced',
    description:
      'Complete JEE preparation covering Mathematics, Physics, and Chemistry with personalized guidance.',
    longDescription:
      'Prepare for JEE Main and Advanced with India\'s best faculty. Our comprehensive program covers the entire syllabus with in-depth concept building, problem-solving techniques, and extensive practice.',
    duration: '2 Years',
    level: 'Advanced',
    category: 'Engineering Entrance',
    image: '/images/courses/jee.jpg',
    price: '1,20,000',
    curriculum: [
      {
        title: 'Mathematics',
        topics: [
          'Algebra',
          'Calculus',
          'Trigonometry',
          'Coordinate Geometry',
          'Vectors & 3D',
        ],
      },
      {
        title: 'Physics',
        topics: [
          'Mechanics',
          'Waves & Thermodynamics',
          'Electromagnetism',
          'Modern Physics',
        ],
      },
      {
        title: 'Chemistry',
        topics: [
          'Physical Chemistry',
          'Organic Chemistry',
          'Inorganic Chemistry',
        ],
      },
    ],
    features: [
      'IIT Alumni Faculty',
      'Weekly Mock Tests',
      'Problem Solving Sessions',
      'Online Test Portal',
      'Video Lectures',
      'Personal Mentor',
      'Study Material',
      'Revision Classes',
    ],
    faculty: [
      {
        name: 'Prof. Vikram Singh',
        subject: 'Mathematics',
        qualification: 'IIT Bombay, 20+ years experience',
      },
      {
        name: 'Prof. Anjali Menon',
        subject: 'Physics',
        qualification: 'Former IIT Faculty',
      },
    ],
    batchDetails: {
      batchSize: '25 students',
      timing: 'Full Day Classes',
      startDate: 'April 15th, 2025',
      classType: 'Hybrid Mode',
    },
  },
  // Add more courses as needed
};

export default function CourseDetailPage({
  params,
}: {
  params: { slug: string; locale: string };
}) {
  const course = coursesData[params.slug];

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
                  <Typography variant="h6">₹{course.price}</Typography>
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
                {course.curriculum.map((section: any, index: number) => (
                  <Card key={index} sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        {section.title}
                      </Typography>
                      <List dense>
                        {section.topics.map((topic: string, idx: number) => (
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
                  {course.features.map((feature: string, index: number) => (
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
                {course.faculty.map((member: any, index: number) => (
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
                      ₹{course.price}
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

                  <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    sx={{ mb: 2 }}
                    component={Link}
                    href={`/${params.locale}/apply?course=${params.slug}`}
                  >
                    Apply Now
                  </Button>

                  <Button
                    variant="outlined"
                    size="large"
                    fullWidth
                    component={Link}
                    href={`/${params.locale}/contact`}
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
