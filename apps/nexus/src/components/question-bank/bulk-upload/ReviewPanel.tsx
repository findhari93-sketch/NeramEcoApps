'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  Chip,
  TextField,
  alpha,
  useTheme,
  CircularProgress,
} from '@neram/ui';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SearchIcon from '@mui/icons-material/Search';
import ReviewQuestionCard from './ReviewQuestionCard';
import type { ReviewQuestion } from '@/lib/bulk-upload-schema';

interface ReviewPanelProps {
  questions: ReviewQuestion[];
  warnings: string[];
  onQuestionsChange: (questions: ReviewQuestion[]) => void;
  onImport: () => void;
  importing: boolean;
  getToken: () => Promise<string | null>;
}

type SectionFilter = 'all' | 'math_mcq' | 'math_numerical' | 'aptitude' | 'drawing';

const SECTION_LABELS: Record<string, string> = {
  all: 'All',
  math_mcq: 'Math MCQ',
  math_numerical: 'Math Numerical',
  aptitude: 'Aptitude',
  drawing: 'Drawing',
};

export default function ReviewPanel({
  questions,
  warnings,
  onQuestionsChange,
  onImport,
  importing,
  getToken,
}: ReviewPanelProps) {
  const theme = useTheme();
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all');
  const [searchText, setSearchText] = useState('');

  // Section counts
  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = { all: questions.length };
    for (const q of questions) {
      counts[q.section] = (counts[q.section] || 0) + 1;
    }
    return counts;
  }, [questions]);

  // Available sections
  const availableSections = useMemo(() => {
    const sections: SectionFilter[] = ['all'];
    if (sectionCounts.math_mcq) sections.push('math_mcq');
    if (sectionCounts.math_numerical) sections.push('math_numerical');
    if (sectionCounts.aptitude) sections.push('aptitude');
    if (sectionCounts.drawing) sections.push('drawing');
    return sections;
  }, [sectionCounts]);

  // Filtered questions
  const filteredQuestions = useMemo(() => {
    let result = questions;
    if (sectionFilter !== 'all') {
      result = result.filter((q) => q.section === sectionFilter);
    }
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (q) =>
          q.question_text.toLowerCase().includes(lower) ||
          q.nta_question_id.includes(searchText) ||
          String(q.question_number).includes(searchText)
      );
    }
    return result;
  }, [questions, sectionFilter, searchText]);

  // Format breakdown
  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const q of questions) {
      counts[q.question_format] = (counts[q.question_format] || 0) + 1;
    }
    return counts;
  }, [questions]);

  const handleQuestionChange = (updated: ReviewQuestion) => {
    onQuestionsChange(
      questions.map((q) => (q._clientId === updated._clientId ? updated : q))
    );
  };

  const modifiedCount = questions.filter((q) => q._modified).length;

  return (
    <Box>
      {/* Summary card */}
      <Paper
        variant="outlined"
        sx={{
          p: 2,
          mb: 2,
          borderRadius: 2.5,
          bgcolor: alpha(theme.palette.success.main, 0.03),
          borderColor: alpha(theme.palette.success.main, 0.2),
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h4" fontWeight={700} color="success.main">
              {questions.length}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Questions parsed
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {Object.entries(formatCounts).map(([format, count]) => (
              <Chip
                key={format}
                label={`${format}: ${count}`}
                size="small"
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
            ))}
          </Box>
          {modifiedCount > 0 && (
            <Chip
              label={`${modifiedCount} edited`}
              size="small"
              color="warning"
              sx={{ height: 22, fontSize: '0.7rem' }}
            />
          )}
        </Box>
      </Paper>

      {/* Warnings */}
      {warnings.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }} icon={<WarningAmberIcon />}>
          <Typography variant="subtitle2">{warnings.length} warning(s)</Typography>
          <Box component="ul" sx={{ m: 0, pl: 2, maxHeight: 100, overflow: 'auto' }}>
            {warnings.slice(0, 10).map((w, i) => (
              <li key={i}>
                <Typography variant="caption">{w}</Typography>
              </li>
            ))}
            {warnings.length > 10 && (
              <li>
                <Typography variant="caption">...and {warnings.length - 10} more</Typography>
              </li>
            )}
          </Box>
        </Alert>
      )}

      {/* Filter bar */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        {availableSections.map((s) => (
          <Chip
            key={s}
            label={`${SECTION_LABELS[s]} (${sectionCounts[s] || 0})`}
            size="small"
            variant={sectionFilter === s ? 'filled' : 'outlined'}
            color={sectionFilter === s ? 'primary' : 'default'}
            onClick={() => setSectionFilter(s)}
            sx={{ cursor: 'pointer', fontSize: '0.7rem' }}
          />
        ))}

        <Box sx={{ flex: 1, minWidth: 120 }}>
          <TextField
            size="small"
            placeholder="Search Q#, text, ID..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            InputProps={{
              startAdornment: <SearchIcon sx={{ fontSize: '1rem', mr: 0.5, color: 'text.disabled' }} />,
              sx: { fontSize: '0.8rem', height: 32 },
            }}
            fullWidth
          />
        </Box>
      </Box>

      {/* Question cards */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
        {filteredQuestions.map((q) => (
          <ReviewQuestionCard
            key={q._clientId}
            question={q}
            onChange={handleQuestionChange}
            getToken={getToken}
          />
        ))}
      </Box>

      {filteredQuestions.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
          No questions match your filter.
        </Typography>
      )}

      {/* Import info + button */}
      <Alert severity="info" sx={{ mb: 2 }}>
        Questions will be imported as <strong>drafts</strong> without correct answers.
        You can add the answer key on the paper detail page after import.
      </Alert>

      <Button
        variant="contained"
        size="large"
        fullWidth
        onClick={onImport}
        disabled={importing || questions.length === 0}
        startIcon={importing ? <CircularProgress size={18} /> : <CheckCircleOutlineIcon />}
        sx={{ py: 1.5 }}
      >
        {importing ? 'Importing...' : `Import ${questions.length} Questions`}
      </Button>
    </Box>
  );
}
