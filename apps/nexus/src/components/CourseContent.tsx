'use client';

import { Box, Paper, Typography, Button, Divider } from '@neram/ui';

interface Lesson {
  id: string;
  title: string;
  duration: string;
  completed: boolean;
  type: 'video' | 'reading' | 'quiz' | 'assignment';
}

interface CourseContentProps {
  lesson: Lesson;
  courseTitle: string;
}

export default function CourseContent({ lesson, courseTitle }: CourseContentProps) {
  const renderContent = () => {
    switch (lesson.type) {
      case 'video':
        return (
          <Box>
            <Box
              sx={{
                width: '100%',
                height: { xs: 250, sm: 400 },
                backgroundColor: 'black',
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
              }}
            >
              <Typography variant="h6" sx={{ color: 'white' }}>
                Video Player Placeholder
              </Typography>
            </Box>
            <Typography variant="body1" paragraph>
              This is a video lesson covering the fundamentals of {lesson.title.toLowerCase()}.
              Watch carefully and take notes as needed.
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Duration: {lesson.duration}
            </Typography>
          </Box>
        );

      case 'reading':
        return (
          <Box>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
              Reading Material
            </Typography>
            <Typography variant="body1" paragraph>
              Welcome to this comprehensive reading material on {lesson.title}. This document
              will guide you through the key concepts and principles.
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ mt: 3, fontWeight: 600 }}>
              Introduction
            </Typography>
            <Typography variant="body1" paragraph>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
              incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
              exercitation ullamco laboris.
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ mt: 3, fontWeight: 600 }}>
              Key Concepts
            </Typography>
            <Typography variant="body1" paragraph>
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu
              fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in
              culpa qui officia deserunt mollit anim id est laborum.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Estimated reading time: {lesson.duration}
            </Typography>
          </Box>
        );

      case 'quiz':
        return (
          <Box>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
              Quiz: {lesson.title}
            </Typography>
            <Paper sx={{ p: 3, mb: 2, backgroundColor: 'info.light' }}>
              <Typography variant="body1">
                This quiz will test your understanding of the concepts covered in this module.
                You have {lesson.duration} to complete it.
              </Typography>
            </Paper>
            <Typography variant="body1" paragraph sx={{ mt: 3 }}>
              Instructions:
            </Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Read each question carefully
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Select the best answer from the options provided
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                You can review your answers before submitting
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Minimum passing score is 70%
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              sx={{ mt: 3, textTransform: 'none' }}
            >
              Start Quiz
            </Button>
          </Box>
        );

      case 'assignment':
        return (
          <Box>
            <Typography variant="h5" gutterBottom sx={{ fontWeight: 600, mb: 2 }}>
              Assignment: {lesson.title}
            </Typography>
            <Paper sx={{ p: 3, mb: 3, backgroundColor: 'warning.light' }}>
              <Typography variant="body1" sx={{ fontWeight: 600, mb: 1 }}>
                Due Date: 7 days from now
              </Typography>
              <Typography variant="body2">
                Submit your assignment before the deadline to receive full credit.
              </Typography>
            </Paper>
            <Typography variant="h6" gutterBottom sx={{ mt: 3, fontWeight: 600 }}>
              Assignment Description
            </Typography>
            <Typography variant="body1" paragraph>
              Complete the following tasks and submit your work in PDF format. Make sure to
              show all your work and explain your reasoning.
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ mt: 3, fontWeight: 600 }}>
              Requirements
            </Typography>
            <Box component="ul" sx={{ pl: 2 }}>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Answer all questions completely
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Include diagrams where necessary
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                Submit in PDF format only
              </Typography>
              <Typography component="li" variant="body2" sx={{ mb: 1 }}>
                File size should not exceed 10MB
              </Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
              Expected time to complete: {lesson.duration}
            </Typography>
            <Button
              variant="contained"
              size="large"
              sx={{ mt: 3, textTransform: 'none' }}
            >
              Upload Assignment
            </Button>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {courseTitle}
        </Typography>
        <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 600 }}>
          {lesson.title}
        </Typography>
        {lesson.completed && (
          <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 600 }}>
            ✓ Completed
          </Typography>
        )}
      </Box>

      <Divider sx={{ mb: 3 }} />

      {renderContent()}

      <Divider sx={{ my: 3 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="outlined" sx={{ textTransform: 'none' }}>
          Previous Lesson
        </Button>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {!lesson.completed && (
            <Button variant="outlined" sx={{ textTransform: 'none' }}>
              Mark as Complete
            </Button>
          )}
          <Button variant="contained" sx={{ textTransform: 'none' }}>
            Next Lesson
          </Button>
        </Box>
      </Box>
    </Paper>
  );
}
