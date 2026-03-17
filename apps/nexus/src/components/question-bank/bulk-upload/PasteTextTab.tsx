'use client';

import { useState } from 'react';
import { Box, Typography, TextField, Button, Alert } from '@neram/ui';
import { parseNTAAnswerSheet } from '@/lib/nta-parser';
import { ntaParsedToReviewQuestions, type ReviewQuestion } from '@/lib/bulk-upload-schema';

interface PasteTextTabProps {
  onQuestionsReady: (questions: ReviewQuestion[], warnings: string[]) => void;
}

export default function PasteTextTab({ onQuestionsReady }: PasteTextTabProps) {
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');

  const handleParse = () => {
    setError('');
    const result = parseNTAAnswerSheet(rawText);
    if (result.total === 0) {
      setError('No questions found. Check that you pasted the correct NTA answer sheet text.');
      return;
    }
    const reviewQuestions = ntaParsedToReviewQuestions(result);
    onQuestionsReady(reviewQuestions, result.warnings);
  };

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Open the NTA answer sheet PDF, select all text (Ctrl+A), copy (Ctrl+C), and paste below.
        The parser will extract question IDs and option IDs.
      </Typography>

      <Alert severity="warning" sx={{ mb: 2 }}>
        The &quot;Chosen Option&quot; field is the student&apos;s answer, NOT the correct answer.
        It will be ignored during import.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <TextField
        multiline
        minRows={8}
        maxRows={16}
        fullWidth
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        placeholder="Paste NTA answer sheet text here..."
        sx={{ mb: 2 }}
      />

      <Button
        variant="contained"
        onClick={handleParse}
        disabled={!rawText.trim()}
      >
        Parse & Preview
      </Button>
    </Box>
  );
}
