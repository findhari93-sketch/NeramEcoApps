'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardActions,
  Button,
  Chip,
  LinearProgress,
  TextField,
  InputAdornment,
} from '@neram/ui';

interface Course {
  id: string;
  title: string;
  subject: string;
  description: string;
  progress: number;
  totalLessons: number;
  completedLessons: number;
  instructor: string;
}

export default function CoursesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const courses: Course[] = [
    {
      id: '1',
      title: 'Advanced Calculus',
      subject: 'Mathematics',
      description: 'Master differentiation, integration, and their applications',
      progress: 60,
      totalLessons: 20,
      completedLessons: 12,
      instructor: 'Dr. Smith',
    },
    {
      id: '2',
      title: 'Mechanics',
      subject: 'Physics',
      description: 'Study motion, forces, energy, and momentum',
      progress: 53,
      totalLessons: 15,
      completedLessons: 8,
      instructor: 'Prof. Johnson',
    },
    {
      id: '3',
      title: 'Organic Chemistry',
      subject: 'Chemistry',
      description: 'Explore carbon compounds and their reactions',
      progress: 83,
      totalLessons: 18,
      completedLessons: 15,
      instructor: 'Dr. Williams',
    },
    {
      id: '4',
      title: 'Cell Biology',
      subject: 'Biology',
      description: 'Understanding cellular structure and function',
      progress: 62,
      totalLessons: 16,
      completedLessons: 10,
      instructor: 'Prof. Brown',
    },
    {
      id: '5',
      title: 'Thermodynamics',
      subject: 'Physics',
      description: 'Laws of thermodynamics and heat transfer',
      progress: 40,
      totalLessons: 12,
      completedLessons: 5,
      instructor: 'Prof. Johnson',
    },
    {
      id: '6',
      title: 'Linear Algebra',
      subject: 'Mathematics',
      description: 'Vectors, matrices, and linear transformations',
      progress: 25,
      totalLessons: 22,
      completedLessons: 6,
      instructor: 'Dr. Smith',
    },
  ];

  const filteredCourses = courses.filter(
    (course) =>
      course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          My Courses
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Access your enrolled courses and continue learning
        </Typography>
      </Box>

      <Box sx={{ mb: 4 }}>
        <TextField
          fullWidth
          placeholder="Search courses..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <span>🔍</span>
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Grid container spacing={3}>
        {filteredCourses.map((course) => (
          <Grid item xs={12} sm={6} md={4} key={course.id}>
            <Card
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                transition: 'transform 0.2s, box-shadow 0.2s',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 4,
                },
              }}
            >
              <CardContent sx={{ flexGrow: 1 }}>
                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={course.subject}
                    size="small"
                    color="primary"
                    sx={{ mb: 1 }}
                  />
                </Box>
                <Typography variant="h6" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
                  {course.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  {course.description}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                  Instructor: {course.instructor}
                </Typography>
                <Box sx={{ mb: 1 }}>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mb: 0.5,
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      Progress
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {course.completedLessons}/{course.totalLessons} lessons
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={course.progress}
                    sx={{ height: 6, borderRadius: 1 }}
                  />
                </Box>
              </CardContent>
              <CardActions sx={{ p: 2, pt: 0 }}>
                <Button
                  component={Link}
                  href={`/courses/${course.id}`}
                  variant="contained"
                  fullWidth
                  sx={{ textTransform: 'none' }}
                >
                  Continue Learning
                </Button>
              </CardActions>
            </Card>
          </Grid>
        ))}
      </Grid>

      {filteredCourses.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography variant="h6" color="text.secondary">
            No courses found
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Try adjusting your search query
          </Typography>
        </Box>
      )}
    </Box>
  );
}
