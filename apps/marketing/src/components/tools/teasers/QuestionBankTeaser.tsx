'use client';

import { useState } from 'react';
import { FormControl, InputLabel, MenuItem, Select } from '@neram/ui';
import { CtaButton, QuickCheck, QuickCheckResult } from '@/design-system';

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
    <QuickCheck title="Quick subject check" headingId="question-bank-quick-check">
      <FormControl fullWidth>
        <InputLabel id="question-bank-subject-label">Select a subject</InputLabel>
        <Select
          labelId="question-bank-subject-label"
          value={subject}
          label="Select a subject"
          onChange={(e) => setSubject(e.target.value as string)}
          sx={{ minHeight: 48, fontSize: '1rem' }}
        >
          {Object.keys(QUESTIONS_BY_SUBJECT).map((s) => (
            <MenuItem key={s} value={s}>
              {s}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {questionCount !== null ? (
        <QuickCheckResult value={questionCount} label="Practice questions" summary={`Available in ${subject}`} />
      ) : (
        <QuickCheckResult label="Practice questions" summary="Pick a subject to see the count" />
      )}

      <CtaButton href={APP_URL} external fullWidth>
        Start practicing with detailed solutions
      </CtaButton>
    </QuickCheck>
  );
}
