'use client';

import { useState } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@neram/ui';
import Link from 'next/link';

const QUESTIONS_BY_SUBJECT: Record<string, number> = {
  'Mathematics': 450,
  'General Aptitude': 380,
  'Drawing & Design': 200,
  'Physics': 320,
  'Logical Reasoning': 250,
};

const APP_URL = 'https://app.neramclasses.com/tools/nata/question-bank';

export default function QuestionBankTeaser() {
  const [subject, setSubject] = useState('');

  const questionCount = subject ? QUESTIONS_BY_SUBJECT[subject] : null;

  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 3, sm: 4 },
        border: '1px solid #E0E0E0',
        borderRadius: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{ fontWeight: 700, fontSize: { xs: '1.25rem', sm: '1.5rem' }, mb: 2 }}
      >
        Quick Subject Check
      </Typography>

      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel id="subject-label">Select a subject</InputLabel>
        <Select
          labelId="subject-label"
          value={subject}
          label="Select a subject"
          onChange={(e) => setSubject(e.target.value as string)}
          sx={{ minHeight: 48 }}
        >
          {Object.keys(QUESTIONS_BY_SUBJECT).map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {questionCount !== null && (
        <Box>
          <Typography
            sx={{
              fontSize: { xs: '1rem', sm: '1.1rem' },
              fontWeight: 600,
              color: 'text.primary',
              mb: 2,
              p: 2,
              bgcolor: '#F3E5F5',
              borderRadius: 1,
              lineHeight: 1.6,
            }}
          >
            {questionCount} practice questions available in {subject}.
          </Typography>

          <Button
            component={Link}
            href={APP_URL}
            variant="outlined"
            fullWidth
            sx={{
              minHeight: 48,
              fontWeight: 700,
              fontSize: '0.95rem',
            }}
          >
            Start practicing with detailed solutions
          </Button>
        </Box>
      )}
    </Paper>
  );
}
