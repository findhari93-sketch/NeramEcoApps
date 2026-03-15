'use client';

import { useState } from 'react';
import {
  Box,
  Drawer,
  Typography,
  Button,
  Chip,
  Divider,
  IconButton,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@neram/ui';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import type { QBFilterState, NexusQBTopic, QBDifficulty, QBExamRelevance, QBQuestionFormat } from '@neram/database/src/types';
import { QB_CATEGORY_LABELS, type QBCategory } from '@neram/database/src/types';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: QBFilterState;
  onApply: (filters: QBFilterState) => void;
  topics: NexusQBTopic[];
}

const EXAM_OPTIONS: { value: QBExamRelevance; label: string }[] = [
  { value: 'NATA', label: 'NATA' },
  { value: 'JEE_PAPER_2', label: 'JEE Paper 2' },
  { value: 'BOTH', label: 'Both' },
];

const DIFFICULTY_OPTIONS: { value: QBDifficulty; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const FORMAT_OPTIONS: { value: QBQuestionFormat; label: string }[] = [
  { value: 'MCQ', label: 'MCQ' },
  { value: 'NUMERICAL', label: 'Numerical' },
  { value: 'MSQ', label: 'Multi-Select' },
];

const STATUS_OPTIONS: { value: NonNullable<QBFilterState['attempt_status']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unattempted', label: 'Unattempted' },
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
];

const YEAR_RANGE = Array.from({ length: 15 }, (_, i) => 2026 - i);

const ALL_CATEGORIES = Object.keys(QB_CATEGORY_LABELS) as QBCategory[];

export default function FilterDrawer({ open, onClose, filters, onApply, topics }: FilterDrawerProps) {
  const [draft, setDraft] = useState<QBFilterState>(filters);

  const handleOpen = () => setDraft(filters);

  const toggleArrayValue = <T extends string | number>(
    key: keyof QBFilterState,
    value: T,
  ) => {
    setDraft((prev) => {
      const arr = (prev[key] as T[] | undefined) || [];
      const next = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
      return { ...prev, [key]: next.length > 0 ? next : undefined };
    });
  };

  const handleApply = () => {
    const cleaned: QBFilterState = {};
    if (draft.exam_relevance) cleaned.exam_relevance = draft.exam_relevance;
    if (draft.exam_years?.length) cleaned.exam_years = draft.exam_years;
    if (draft.categories?.length) cleaned.categories = draft.categories;
    if (draft.difficulty?.length) cleaned.difficulty = draft.difficulty;
    if (draft.question_format?.length) cleaned.question_format = draft.question_format;
    if (draft.attempt_status && draft.attempt_status !== 'all') cleaned.attempt_status = draft.attempt_status;
    if (draft.search_text?.trim()) cleaned.search_text = draft.search_text.trim();
    if (draft.topic_ids?.length) cleaned.topic_ids = draft.topic_ids;
    onApply(cleaned);
    onClose();
  };

  const handleReset = () => {
    setDraft({});
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      onTransitionEnter={handleOpen}
      PaperProps={{
        sx: { width: { xs: '100%', sm: 360 }, p: 0 },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          Filters
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto', pb: 10 }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search question text..."
            value={draft.search_text || ''}
            onChange={(e) => setDraft((p) => ({ ...p, search_text: e.target.value }))}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />,
            }}
          />
        </Box>

        <Divider />

        <Accordion defaultExpanded disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Exam Type</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {EXAM_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      exam_relevance: p.exam_relevance === opt.value ? undefined : opt.value,
                    }))
                  }
                  variant={draft.exam_relevance === opt.value ? 'filled' : 'outlined'}
                  color={draft.exam_relevance === opt.value ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Year</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {YEAR_RANGE.map((y) => (
                <Chip
                  key={y}
                  label={y}
                  onClick={() => toggleArrayValue('exam_years', y)}
                  variant={(draft.exam_years || []).includes(y) ? 'filled' : 'outlined'}
                  color={(draft.exam_years || []).includes(y) ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Category</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {ALL_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={QB_CATEGORY_LABELS[cat]}
                  onClick={() => toggleArrayValue('categories', cat as string)}
                  variant={(draft.categories || []).includes(cat) ? 'filled' : 'outlined'}
                  color={(draft.categories || []).includes(cat) ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Difficulty</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {DIFFICULTY_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() => toggleArrayValue('difficulty', opt.value)}
                  variant={(draft.difficulty || []).includes(opt.value) ? 'filled' : 'outlined'}
                  color={(draft.difficulty || []).includes(opt.value) ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Question Format</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {FORMAT_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() => toggleArrayValue('question_format', opt.value)}
                  variant={(draft.question_format || []).includes(opt.value) ? 'filled' : 'outlined'}
                  color={(draft.question_format || []).includes(opt.value) ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Attempt Status</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      attempt_status: p.attempt_status === opt.value ? undefined : opt.value,
                    }))
                  }
                  variant={draft.attempt_status === opt.value ? 'filled' : 'outlined'}
                  color={draft.attempt_status === opt.value ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        {topics.length > 0 && (
          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Topic</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {topics.map((topic) => (
                  <Chip
                    key={topic.id}
                    label={topic.name}
                    onClick={() => toggleArrayValue('topic_ids', topic.id)}
                    variant={(draft.topic_ids || []).includes(topic.id) ? 'filled' : 'outlined'}
                    color={(draft.topic_ids || []).includes(topic.id) ? 'primary' : 'default'}
                    size="small"
                  />
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>

      <Box
        sx={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          p: 2,
          display: 'flex',
          gap: 1,
          bgcolor: 'background.paper',
          borderTop: 1,
          borderColor: 'divider',
        }}
      >
        <Button variant="outlined" onClick={handleReset} fullWidth>
          Reset
        </Button>
        <Button variant="contained" onClick={handleApply} fullWidth>
          Apply Filters
        </Button>
      </Box>
    </Drawer>
  );
}
