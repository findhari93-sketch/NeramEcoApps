'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Box,
  Typography,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  Divider,
} from '@neram/ui';
import CourseContent from '@/components/CourseContent';

interface Lesson {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  type: 'video' | 'reading' | 'quiz' | 'assignment';
}

interface CourseDetail {
  id: string;
  title: string;
  subject: string;
  description: string;
  instructor: string;
  lessons: Lesson[];
}

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;

  const [selectedLesson, setSelectedLesson] = useState<string | null>(null);

  // Mock course data
  const course: CourseDetail = {
    id: courseId,
    title: 'Advanced Calculus',
    subject: 'Mathematics',
    description: 'Master differentiation, integration, and their applications in real-world scenarios',
    instructor: 'Dr. Smith',
    lessons: [
      {
        id: '1',
        title: 'Introduction to Calculus',
        duration: '15 min',
        completed: true,
        type: 'video',
      },
      {
        id: '2',
        title: 'Limits and Continuity',
        duration: '20 min',
        completed: true,
        type: 'video',
      },
      {
        id: '3',
        title: 'Reading: Fundamental Theorem',
        duration: '10 min',
        completed: true,
        type: 'reading',
      },
      {
        id: '4',
        title: 'Differentiation Basics',
        duration: '25 min',
        completed: false,
        type: 'video',
      },
      {
        id: '5',
        title: 'Quiz: Differentiation',
        duration: '15 min',
        completed: false,
        type: 'quiz',
      },
      {
        id: '6',
        title: 'Integration Techniques',
        duration: '30 min',
        completed: false,
        type: 'video',
      },
      {
        id: '7',
        title: 'Assignment: Applications',
        duration: '45 min',
        completed: false,
        type: 'assignment',
      },
    ],
  };

  const currentLesson = course.lessons.find((l) => l.id === selectedLesson) || course.lessons[0];

  const getTypeColor = (type: Lesson['type']) => {
    switch (type) {
      case 'video':
        return 'primary';
      case 'reading':
        return 'secondary';
      case 'quiz':
        return 'warning';
      case 'assignment':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Chip label={course.subject} color="primary" sx={{ mb: 2 }} />
        <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: 700 }}>
          {course.title}
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
          {course.description}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Instructor: {course.instructor}
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Lesson List */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
              Course Content
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <List sx={{ p: 0 }}>
              {course.lessons.map((lesson, index) => (
                <ListItem
                  key={lesson.id}
                  disablePadding
                  sx={{ mb: 1 }}
                >
                  <ListItemButton
                    selected={selectedLesson === lesson.id || (selectedLesson === null && index === 0)}
                    onClick={() => setSelectedLesson(lesson.id)}
                    sx={{
                      borderRadius: 1,
                      '&.Mui-selected': {
                        backgroundColor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': {
                          backgroundColor: 'primary.dark',
                        },
                      },
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          {lesson.completed && <span>✓</span>}
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {lesson.title}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                          <Chip
                            label={lesson.type}
                            size="small"
                            color={getTypeColor(lesson.type)}
                            sx={{ height: 20, fontSize: '0.7rem' }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              color: selectedLesson === lesson.id || (selectedLesson === null && index === 0)
                                ? 'inherit'
                                : 'text.secondary',
                            }}
                          >
                            {lesson.duration}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItemButton>
                </ListItem>
              ))}
            </List>
          </Paper>
        </Grid>

        {/* Content Display */}
        <Grid item xs={12} md={8}>
          <CourseContent lesson={currentLesson} courseTitle={course.title} />
        </Grid>
      </Grid>
    </Box>
  );
}
