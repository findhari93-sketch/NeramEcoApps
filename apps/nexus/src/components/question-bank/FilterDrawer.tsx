'use client';

import { useState, useMemo } from 'react';
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
import type {
  QBFilterState,
  NexusQBTopic,
  QBDifficulty,
  QBQuestionFormat,
  QBExamTree,
  QBExamType,
  QBConfidenceTier,
} from '@neram/database';
import { QB_CATEGORY_LABELS, QB_EXAM_TYPE_LABELS, QB_CONFIDENCE_TIER_LABELS, type QBCategory } from '@neram/database';
import SubjectTree from './SubjectTree';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  filters: QBFilterState;
  onApply: (filters: QBFilterState) => void;
  topics: NexusQBTopic[];
  contextLabel?: string;
  examTree?: QBExamTree | null;
  matchCount?: number;
  topicCounts?: Map<string, number>;
  categoryCounts?: Record<string, number>;
}

const DIFFICULTY_OPTIONS: { value: QBDifficulty; label: string }[] = [
  { value: 'EASY', label: 'Easy' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HARD', label: 'Hard' },
];

const FORMAT_OPTIONS: { value: QBQuestionFormat; label: string }[] = [
  { value: 'MCQ', label: 'MCQ' },
  { value: 'NUMERICAL', label: 'Numerical' },
  { value: 'DRAWING_PROMPT', label: 'Drawing' },
  { value: 'IMAGE_BASED', label: 'Image Based' },
];

const STATUS_OPTIONS: { value: NonNullable<QBFilterState['attempt_status']>; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unattempted', label: 'Unattempted' },
  { value: 'correct', label: 'Correct' },
  { value: 'incorrect', label: 'Incorrect' },
];

const CATEGORY_GROUPS: { key: string; label: string; categories: QBCategory[]; exams: (QBExamType | 'ALL')[] }[] = [
  {
    key: 'broad',
    label: 'General',
    categories: ['mathematics', 'aptitude', 'drawing'],
    exams: ['ALL', 'JEE_PAPER_2', 'NATA'],
  },
  {
    key: 'nata',
    label: 'NATA Topics',
    categories: ['history_of_architecture', 'general_knowledge', 'puzzle', 'perspective', 'building_materials', 'building_services', 'planning', 'sustainability', 'famous_architects', 'current_affairs', 'visualization_3d'],
    exams: ['NATA'],
  },
  {
    key: 'jee_aptitude',
    label: 'Aptitude Topics',
    categories: ['spatial_visualization', 'orthographic_projection', 'pattern_recognition', 'analogy', 'counting_figures', 'odd_one_out', 'surface_counting', 'mirror_image', 'embedded_figure', 'architecture_gk', 'building_science', 'building_materials', 'building_services', 'design_fundamentals'],
    exams: ['JEE_PAPER_2'],
  },
  {
    key: 'jee_math',
    label: 'Math Topics',
    categories: ['trigonometry', 'probability', 'statistics', 'matrices', 'determinants', 'complex_numbers', 'vectors', '3d_geometry', 'conic_sections', 'circles', 'straight_lines', 'sequences_and_series', 'binomial_theorem', 'permutations_combinations', 'definite_integrals', 'indefinite_integrals', 'differential_equations', 'applications_of_derivatives', 'differentiability', 'continuity', 'mean_value_theorems', 'quadratic_equations', 'functions', 'sets_and_relations', 'mathematical_logic'],
    exams: ['JEE_PAPER_2'],
  },
];

const EXAM_TYPE_OPTIONS: { value: QBExamType | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'JEE_PAPER_2', label: QB_EXAM_TYPE_LABELS.JEE_PAPER_2 },
  { value: 'NATA', label: QB_EXAM_TYPE_LABELS.NATA },
];

export default function FilterDrawer({
  open,
  onClose,
  filters,
  onApply,
  topics,
  contextLabel,
  examTree,
  matchCount,
  topicCounts,
  categoryCounts,
}: FilterDrawerProps) {
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

  // Derive available years from the exam tree based on selected exam type
  const availableYears = useMemo(() => {
    if (!examTree) return [];
    const selectedExamType = draft.exam_type;
    const yearsSet = new Set<number>();

    for (const exam of examTree.exams) {
      if (!selectedExamType || exam.exam_type === selectedExamType) {
        for (const yr of exam.years) {
          yearsSet.add(yr.year);
        }
      }
    }

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [examTree, draft.exam_type]);

  const handleExamTypeChange = (value: QBExamType | 'ALL') => {
    setDraft((prev) => ({
      ...prev,
      exam_type: value === 'ALL' ? undefined : value,
      // Reset year selection when exam type changes
      exam_years: undefined,
    }));
  };

  const handleTopicSelectionChange = (ids: string[]) => {
    setDraft((prev) => ({
      ...prev,
      topic_ids: ids.length > 0 ? ids : undefined,
    }));
  };

  const handleApply = () => {
    const cleaned: QBFilterState = {};
    if (draft.exam_type) cleaned.exam_type = draft.exam_type;
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

  const applyLabel =
    matchCount !== undefined ? `Apply (${matchCount} Qs)` : 'Apply Filters';

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
      {/* Header */}
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

      {/* Scrollable content */}
      <Box sx={{ flex: 1, overflowY: 'auto', pb: 10 }}>
        {/* Search text */}
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

        {contextLabel && (
          <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary">
              Filtering: {contextLabel}
            </Typography>
          </Box>
        )}

        {/* Exam Type */}
        {examTree && (
          <Accordion disableGutters elevation={0} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Exam Type</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {EXAM_TYPE_OPTIONS.map((opt) => {
                  const isSelected =
                    opt.value === 'ALL' ? !draft.exam_type : draft.exam_type === opt.value;
                  return (
                    <Chip
                      key={opt.value}
                      label={opt.label}
                      onClick={() => handleExamTypeChange(opt.value)}
                      variant={isSelected ? 'filled' : 'outlined'}
                      color={isSelected ? 'primary' : 'default'}
                      size="small"
                    />
                  );
                })}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Year */}
        {availableYears.length > 0 && (
          <Accordion disableGutters elevation={0} defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Year</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {availableYears.map((year) => (
                  <Chip
                    key={year}
                    label={String(year)}
                    onClick={() => toggleArrayValue('exam_years', year)}
                    variant={(draft.exam_years || []).includes(year) ? 'filled' : 'outlined'}
                    color={(draft.exam_years || []).includes(year) ? 'primary' : 'default'}
                    size="small"
                  />
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}

        {/* Subject / Chapter Tree — only show if a meaningful number of topics have questions */}
        {topics.length > 0 && topicCounts && topicCounts.size >= 5 && (
          <Accordion disableGutters elevation={0}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Subject &amp; Chapter</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <SubjectTree
                topics={topics}
                selectedIds={draft.topic_ids || []}
                onSelectionChange={handleTopicSelectionChange}
                topicCounts={topicCounts}
              />
            </AccordionDetails>
          </Accordion>
        )}

        {/* Category — dynamic based on actual questions */}
        <Accordion disableGutters elevation={0} defaultExpanded>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Category</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {categoryCounts && Object.keys(categoryCounts).length > 0 ? (
              // Dynamic: show ALL groups that have questions in the current context
              CATEGORY_GROUPS
                .map((group) => {
                  const availableCats = group.categories.filter(
                    (cat) => categoryCounts[cat] && categoryCounts[cat] > 0,
                  );
                  if (availableCats.length === 0) return null;
                  return (
                    <Box key={group.key} sx={{ mb: 1.5 }}>
                      <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 600 }}>
                        {group.label}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {availableCats.map((cat) => {
                          const isSelected = (draft.categories || []).includes(cat);
                          const count = categoryCounts[cat] || 0;
                          return (
                            <Chip
                              key={cat}
                              label={`${QB_CATEGORY_LABELS[cat]} (${count})`}
                              onClick={() => toggleArrayValue('categories', cat as string)}
                              variant={isSelected ? 'filled' : 'outlined'}
                              color={isSelected ? 'primary' : 'default'}
                              size="small"
                            />
                          );
                        })}
                      </Box>
                    </Box>
                  );
                })
                .filter(Boolean)
            ) : (
              // Fallback: static groups filtered by exam type
              CATEGORY_GROUPS
                .filter((group) => {
                  const selectedExam = draft.exam_type || 'ALL';
                  return group.exams.includes(selectedExam);
                })
                .map((group) => (
                  <Box key={group.key} sx={{ mb: 1.5 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block', fontWeight: 600 }}>
                      {group.label}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                      {group.categories.map((cat) => (
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
                  </Box>
                ))
            )}
          </AccordionDetails>
        </Accordion>

        {/* Difficulty */}
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

        {/* Confidence Level (recalled papers) */}
        <Accordion disableGutters elevation={0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="subtitle2">Confidence Level</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
              {([1, 2, 3] as QBConfidenceTier[]).map((tier) => (
                <Chip
                  key={tier}
                  label={QB_CONFIDENCE_TIER_LABELS[tier]}
                  onClick={() => toggleArrayValue('confidence_tier', tier)}
                  variant={(draft.confidence_tier || []).includes(tier) ? 'filled' : 'outlined'}
                  color={(draft.confidence_tier || []).includes(tier) ? 'primary' : 'default'}
                  size="small"
                />
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>

        {/* Question Format */}
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

        {/* Attempt Status */}
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
      </Box>

      {/* Bottom action bar */}
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
          {applyLabel}
        </Button>
      </Box>
    </Drawer>
  );
}
