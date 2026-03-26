'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Paper,
  Chip,
  IconButton,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CloseIcon from '@mui/icons-material/Close';
import type {
  NexusQBQuestion,
  NexusQBQuestionSource,
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBExamType,
  NexusQBQuestionOption,
} from '@neram/database';
import {
  QB_CATEGORIES,
  QB_CATEGORY_LABELS,
  QB_EXAM_TYPE_LABELS,
  QB_QUESTION_STATUS_LABELS,
  QB_QUESTION_STATUS_COLORS,
} from '@neram/database';
import type { QBCategory } from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import ImageUploadZone from './ImageUploadZone';

interface InlineQuestionEditorProps {
  question: NexusQBQuestion;
  sources?: NexusQBQuestionSource[];
  expanded: boolean;
  onToggle: () => void;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
}

interface FormData {
  exam_type: QBExamType;
  year: string;
  session: string;
  question_number: string;
  question_format: QBQuestionFormat;
  question_text: string;
  question_text_hi: string;
  question_image?: ImageState;
  options: NexusQBQuestionOption[];
  option_images: Record<string, ImageState | undefined>;
  correct_option_id: string;
  correct_answer: string;
  answer_tolerance: string;
  categories: string[];
  difficulty: QBDifficulty;
  exam_relevance: QBExamRelevance;
  topic_id: string;
  sub_topic: string;
  explanation_brief: string;
  explanation_detailed: string;
  solution_video_url: string;
  solution_image?: ImageState;
}

function createDefaultOption(idx: number): NexusQBQuestionOption {
  return { id: `opt_${idx}_${Date.now()}`, text: '' };
}

function getInitialFormData(
  question: NexusQBQuestion,
  sources?: NexusQBQuestionSource[]
): FormData {
  const source = sources?.[0];
  return {
    exam_type: source?.exam_type ?? 'NATA',
    year: source?.year ? String(source.year) : String(new Date().getFullYear()),
    session: source?.session ?? '',
    question_number: source?.question_number ? String(source.question_number) : '',
    question_format: question.question_format ?? 'MCQ',
    question_text: question.question_text ?? '',
    question_text_hi: question.question_text_hi ?? '',
    question_image: question.question_image_url
      ? { url: question.question_image_url, uploaded: true }
      : undefined,
    options: question.options?.length
      ? question.options
      : [createDefaultOption(0), createDefaultOption(1), createDefaultOption(2), createDefaultOption(3)],
    option_images: (question.options ?? []).reduce<Record<string, ImageState | undefined>>((acc, opt) => {
      if (opt.image_url) acc[opt.id] = { url: opt.image_url, uploaded: true };
      return acc;
    }, {}),
    correct_option_id: question.correct_answer ?? '',
    correct_answer: question.correct_answer ?? '',
    answer_tolerance: question.answer_tolerance ? String(question.answer_tolerance) : '',
    categories: question.categories ?? [],
    difficulty: question.difficulty ?? 'MEDIUM',
    exam_relevance: question.exam_relevance ?? 'BOTH',
    topic_id: question.topic_id ?? '',
    sub_topic: question.sub_topic ?? '',
    explanation_brief: question.explanation_brief ?? '',
    explanation_detailed: question.explanation_detailed ?? '',
    solution_video_url: question.solution_video_url ?? '',
    solution_image: question.solution_image_url
      ? { url: question.solution_image_url, uploaded: true }
      : undefined,
  };
}

function buildSubmitPayload(form: FormData) {
  const questionData: Partial<NexusQBQuestion> = {
    question_text: form.question_text || null,
    question_text_hi: form.question_text_hi || null,
    question_image_url: form.question_image?.uploaded ? form.question_image.url : null,
    question_format: form.question_format,
    options: form.question_format === 'MCQ'
      ? form.options.map((opt) => {
          const img = form.option_images[opt.id];
          return {
            ...opt,
            image_url: img?.uploaded ? img.url : opt.image_url || undefined,
          };
        })
      : null,
    correct_answer:
      form.question_format === 'MCQ' ? form.correct_option_id : form.correct_answer,
    answer_tolerance:
      form.question_format === 'NUMERICAL' && form.answer_tolerance
        ? Number(form.answer_tolerance)
        : null,
    explanation_brief: form.explanation_brief || null,
    explanation_detailed: form.explanation_detailed || null,
    solution_video_url: form.solution_video_url || null,
    solution_image_url: form.solution_image?.uploaded ? form.solution_image.url : null,
    difficulty: form.difficulty,
    exam_relevance: form.exam_relevance,
    categories: form.categories,
    topic_id: form.topic_id || null,
    sub_topic: form.sub_topic || null,
  };
  return questionData;
}

export default function InlineQuestionEditor({
  question,
  sources,
  expanded,
  onToggle,
  getToken,
  onSaved,
}: InlineQuestionEditorProps) {
  const theme = useTheme();
  const [form, setForm] = useState<FormData>(() => getInitialFormData(question, sources));
  const [optionImagesEnabled, setOptionImagesEnabled] = useState(
    () => question.options?.some((o) => !!o.image_url) ?? false
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Reset form when question changes (e.g. after save + refetch)
  useEffect(() => {
    if (!expanded) {
      setForm(getInitialFormData(question, sources));
      setDirty(false);
      setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
    }
  }, [question, sources, expanded]);

  const updateField = useCallback(
    <K extends keyof FormData>(key: K, value: FormData[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    []
  );

  const handleOptionTextChange = useCallback((optId: string, text: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === optId ? { ...o, text } : o)),
    }));
    setDirty(true);
  }, []);

  const handleOptionTextHiChange = useCallback((optId: string, text_hi: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.map((o) => (o.id === optId ? { ...o, text_hi } : o)),
    }));
    setDirty(true);
  }, []);

  const handleOptionImageChange = useCallback((optId: string, img: ImageState | undefined) => {
    setForm((prev) => ({
      ...prev,
      option_images: { ...prev.option_images, [optId]: img },
    }));
    setDirty(true);
  }, []);

  const addOption = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      options: [...prev.options, createDefaultOption(prev.options.length)],
    }));
    setDirty(true);
  }, []);

  const removeOption = useCallback((optId: string) => {
    setForm((prev) => ({
      ...prev,
      options: prev.options.filter((o) => o.id !== optId),
      option_images: { ...prev.option_images, [optId]: undefined },
    }));
    setDirty(true);
  }, []);

  const toggleCategory = useCallback((cat: string) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
    setDirty(true);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Auth failed');

      const payload = buildSubmitPayload(form);
      const res = await fetch(`/api/question-bank/questions/${question.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Save failed');
      }

      setDirty(false);
      onSaved();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(getInitialFormData(question, sources));
    setDirty(false);
    setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
    onToggle();
  };

  // Keyboard shortcuts
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (dirty && !saving) handleSave();
      }
      if (e.key === 'Escape') {
        handleCancel();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [expanded, dirty, saving]);

  // Collapsed view
  if (!expanded) {
    return (
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 30 }}>
            Q{question.display_order}
          </Typography>
          <Chip
            label={question.question_format}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.7rem' }}
          />
          <Chip
            label={QB_QUESTION_STATUS_LABELS[question.status]}
            size="small"
            sx={{
              bgcolor: QB_QUESTION_STATUS_COLORS[question.status] + '20',
              color: QB_QUESTION_STATUS_COLORS[question.status],
              fontWeight: 600,
              fontSize: '0.7rem',
            }}
          />
          <Box sx={{ flex: 1 }} />
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: 300,
            }}
          >
            {question.question_text || 'No content'}
          </Typography>
        </Box>
      </Paper>
    );
  }

  // Expanded view — all fields inline
  return (
    <Paper
      variant="outlined"
      sx={{
        border: `2px solid ${theme.palette.primary.main}`,
        overflow: 'visible',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1.5,
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Typography variant="body2" fontWeight={700}>
          Q{question.display_order}
        </Typography>
        <Chip label={form.question_format} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
        {dirty && (
          <Chip label="Unsaved" size="small" color="warning" sx={{ fontSize: '0.65rem', height: 20 }} />
        )}
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="contained"
          startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
          onClick={handleSave}
          disabled={!dirty || saving}
          sx={{ textTransform: 'none', minHeight: 32 }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
        <IconButton size="small" onClick={handleCancel} title="Cancel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        {/* Section 1: Content (always visible) */}
        <Box sx={{ mb: 2 }}>
          <TextField
            label="Question Text"
            value={form.question_text}
            onChange={(e) => updateField('question_text', e.target.value)}
            multiline
            minRows={2}
            maxRows={6}
            fullWidth
            size="small"
            sx={{ mb: 1.5 }}
          />
          <TextField
            label="Question Text (Hindi)"
            value={form.question_text_hi}
            onChange={(e) => updateField('question_text_hi', e.target.value)}
            multiline
            minRows={1}
            maxRows={4}
            fullWidth
            size="small"
            sx={{ mb: 1.5 }}
          />

          {/* Question Image */}
          <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
            Question Image
          </Typography>
          <ImageUploadZone
            image={form.question_image}
            onChange={(img) => { updateField('question_image', img); }}
            label="Paste or drop question image"
            height={140}
            getToken={getToken}
            subfolder="questions"
          />

          {/* MCQ Options */}
          {form.question_format === 'MCQ' && (
            <Box sx={{ mt: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="caption" fontWeight={600}>
                  Options (select correct answer)
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      size="small"
                      checked={optionImagesEnabled}
                      onChange={(e) => setOptionImagesEnabled(e.target.checked)}
                    />
                  }
                  label={<Typography variant="caption" color="text.secondary">Options have images</Typography>}
                  sx={{ mr: 0 }}
                />
              </Box>
              <RadioGroup
                value={form.correct_option_id}
                onChange={(e) => updateField('correct_option_id', e.target.value)}
              >
                {form.options.map((opt, idx) => (
                  <Box key={opt.id} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'flex-start' }}>
                    <FormControlLabel
                      value={opt.id}
                      control={<Radio size="small" />}
                      label=""
                      sx={{ mr: 0, mt: 0.5 }}
                    />
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        value={opt.text}
                        onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                        placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                        size="small"
                        fullWidth
                        sx={{ mb: 0.5 }}
                      />
                      <TextField
                        value={opt.text_hi || ''}
                        onChange={(e) => handleOptionTextHiChange(opt.id, e.target.value)}
                        placeholder={`Hindi ${String.fromCharCode(65 + idx)}`}
                        size="small"
                        fullWidth
                        sx={{ fontSize: '0.8rem' }}
                      />
                      {optionImagesEnabled && (
                        <Box sx={{ mt: 0.5 }}>
                          <ImageUploadZone
                            image={form.option_images[opt.id]}
                            onChange={(img) => handleOptionImageChange(opt.id, img)}
                            label={`Option ${String.fromCharCode(65 + idx)} image`}
                            height={80}
                            getToken={getToken}
                            subfolder="options"
                          />
                        </Box>
                      )}
                    </Box>
                    {form.options.length > 2 && (
                      <IconButton size="small" onClick={() => removeOption(opt.id)} sx={{ mt: 0.5 }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                ))}
              </RadioGroup>
              <Button size="small" startIcon={<AddIcon />} onClick={addOption} sx={{ textTransform: 'none' }}>
                Add Option
              </Button>
            </Box>
          )}

          {/* NUMERICAL answer */}
          {form.question_format === 'NUMERICAL' && (
            <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
              <TextField
                label="Correct Answer"
                value={form.correct_answer}
                onChange={(e) => updateField('correct_answer', e.target.value)}
                size="small"
                sx={{ flex: 1 }}
              />
              <TextField
                label="Tolerance (±)"
                value={form.answer_tolerance}
                onChange={(e) => updateField('answer_tolerance', e.target.value)}
                size="small"
                sx={{ width: 120 }}
              />
            </Box>
          )}
        </Box>

        {/* Section 2: Classification (collapsible) */}
        <Accordion defaultExpanded={false} disableGutters variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Classification</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Categories */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Categories
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 2 }}>
              {QB_CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={QB_CATEGORY_LABELS[cat as keyof typeof QB_CATEGORY_LABELS] || cat}
                  size="small"
                  variant={form.categories.includes(cat) ? 'filled' : 'outlined'}
                  color={form.categories.includes(cat) ? 'primary' : 'default'}
                  onClick={() => toggleCategory(cat)}
                  sx={{ fontSize: '0.7rem', cursor: 'pointer' }}
                />
              ))}
            </Box>

            {/* Difficulty */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Difficulty
            </Typography>
            <RadioGroup
              row
              value={form.difficulty}
              onChange={(e) => updateField('difficulty', e.target.value as QBDifficulty)}
              sx={{ mb: 2 }}
            >
              {(['EASY', 'MEDIUM', 'HARD'] as QBDifficulty[]).map((d) => (
                <FormControlLabel key={d} value={d} control={<Radio size="small" />} label={d} />
              ))}
            </RadioGroup>

            {/* Exam Relevance */}
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Exam Relevance
            </Typography>
            <RadioGroup
              row
              value={form.exam_relevance}
              onChange={(e) => updateField('exam_relevance', e.target.value as QBExamRelevance)}
              sx={{ mb: 2 }}
            >
              {(['JEE', 'NATA', 'BOTH'] as QBExamRelevance[]).map((r) => (
                <FormControlLabel key={r} value={r} control={<Radio size="small" />} label={r} />
              ))}
            </RadioGroup>

            {/* Sub-topic */}
            <TextField
              label="Sub-topic"
              value={form.sub_topic}
              onChange={(e) => updateField('sub_topic', e.target.value)}
              size="small"
              fullWidth
            />
          </AccordionDetails>
        </Accordion>

        {/* Section 3: Solution (collapsible) */}
        <Accordion defaultExpanded={false} disableGutters variant="outlined" sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Solution</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <TextField
              label="Brief Explanation"
              value={form.explanation_brief}
              onChange={(e) => updateField('explanation_brief', e.target.value)}
              multiline
              minRows={2}
              maxRows={4}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            />
            <TextField
              label="Detailed Explanation"
              value={form.explanation_detailed}
              onChange={(e) => updateField('explanation_detailed', e.target.value)}
              multiline
              minRows={3}
              maxRows={8}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            />
            <Typography variant="caption" fontWeight={600} sx={{ mb: 0.5, display: 'block' }}>
              Solution Image
            </Typography>
            <ImageUploadZone
              image={form.solution_image}
              onChange={(img) => { updateField('solution_image', img); }}
              label="Paste or drop solution image"
              height={120}
              getToken={getToken}
              subfolder="solutions"
            />
            <TextField
              label="Solution Video URL"
              value={form.solution_video_url}
              onChange={(e) => updateField('solution_video_url', e.target.value)}
              size="small"
              fullWidth
              sx={{ mt: 1.5 }}
              placeholder="YouTube or SharePoint link"
            />
          </AccordionDetails>
        </Accordion>

        {/* Section 4: Source (collapsible) */}
        <Accordion defaultExpanded={false} disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Source & Format</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Exam Type</InputLabel>
                <Select
                  value={form.exam_type}
                  label="Exam Type"
                  onChange={(e) => updateField('exam_type', e.target.value as QBExamType)}
                >
                  {Object.entries(QB_EXAM_TYPE_LABELS).map(([k, v]) => (
                    <MenuItem key={k} value={k}>{v}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Year"
                value={form.year}
                onChange={(e) => updateField('year', e.target.value)}
                size="small"
                sx={{ width: 80 }}
              />
              <TextField
                label="Session"
                value={form.session}
                onChange={(e) => updateField('session', e.target.value)}
                size="small"
                sx={{ width: 100 }}
              />
              <TextField
                label="Q#"
                value={form.question_number}
                onChange={(e) => updateField('question_number', e.target.value)}
                size="small"
                sx={{ width: 60 }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
              Question Format
            </Typography>
            <RadioGroup
              row
              value={form.question_format}
              onChange={(e) => updateField('question_format', e.target.value as QBQuestionFormat)}
            >
              {(['MCQ', 'NUMERICAL', 'DRAWING_PROMPT', 'IMAGE_BASED'] as QBQuestionFormat[]).map((f) => (
                <FormControlLabel key={f} value={f} control={<Radio size="small" />} label={f} />
              ))}
            </RadioGroup>
          </AccordionDetails>
        </Accordion>
      </Box>

      {/* Sticky save bar at bottom */}
      {dirty && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            gap: 1,
            justifyContent: 'flex-end',
            p: 1.5,
            bgcolor: alpha(theme.palette.warning.main, 0.06),
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1, alignSelf: 'center' }}>
            Unsaved changes (Ctrl+S to save)
          </Typography>
          <Button size="small" onClick={handleCancel} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveIcon />}
            onClick={handleSave}
            disabled={saving}
            sx={{ textTransform: 'none' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      )}
    </Paper>
  );
}
