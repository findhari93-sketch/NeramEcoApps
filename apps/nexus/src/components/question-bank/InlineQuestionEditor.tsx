'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
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
  NexusQBOriginalPaper,
  NexusQBQuestion,
  NexusQBQuestionSource,
  QBQuestionFormat,
  QBDifficulty,
  QBExamRelevance,
  QBExamType,
  NexusQBQuestionOption,
} from '@neram/database';
import {
  QB_CATEGORY_LABELS,
  groupQBCategories,
  QB_EXAM_TYPE_LABELS,
  QB_QUESTION_STATUS_LABELS,
  QB_QUESTION_STATUS_COLORS,
} from '@neram/database';
import type { QBCategory } from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import ImageUploadZone from './ImageUploadZone';
import DrawingQuestionPanel from './DrawingQuestionPanel';
import MathText from '@/components/common/MathText';

/** What a question's Source & Format panel needs when it has no source row. */
type PaperFallback = Pick<NexusQBOriginalPaper, 'exam_type' | 'year' | 'session'>;

interface InlineQuestionEditorProps {
  question: NexusQBQuestion;
  /**
   * The question's source rows, the one for the paper being viewed first.
   * Optional because a question can genuinely have none yet.
   */
  sources?: NexusQBQuestionSource[];
  /**
   * The paper this question was uploaded from, read when there is no source
   * row. Without it the panel fell back to a literal 'NATA' and the current
   * year, which labelled every paper's questions NATA whatever exam they came
   * from. A question reached through a paper can only belong to that paper.
   */
  paper?: PaperFallback;
  expanded: boolean;
  onToggle: () => void;
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  /** Zero-based index for alternating row backgrounds */
  index?: number;
}

interface FormData {
  /** Null when neither a source row nor a paper says which exam this came from. */
  exam_type: QBExamType | null;
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
  // Drawing-only. Sent to the server only when question_format is
  // DRAWING_PROMPT, so switching a question's format cannot smear drawing
  // metadata onto an MCQ.
  drawing_marks: string;
}

function createDefaultOption(idx: number): NexusQBQuestionOption {
  return { id: `opt_${idx}_${Date.now()}`, text: '' };
}

function getInitialFormData(
  question: NexusQBQuestion,
  sources?: NexusQBQuestionSource[],
  paper?: PaperFallback
): FormData {
  const source = sources?.[0];
  // Source row, then the paper, then nothing. Never a made-up exam: showing the
  // wrong exam confidently is worse than showing a blank.
  return {
    exam_type: source?.exam_type ?? paper?.exam_type ?? null,
    year: String(source?.year ?? paper?.year ?? ''),
    session: source?.session ?? paper?.session ?? '',
    question_number: String(source?.question_number ?? question.display_order ?? ''),
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
    drawing_marks: question.drawing_marks != null ? String(question.drawing_marks) : '',
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
    // A drawing has no key and never will, so send null rather than the empty
    // string this used to write. submitQBAttempt now refuses drawings on format
    // rather than on emptiness precisely because '' was reaching it, but a
    // column every other reader treats as "the key" should not hold a blank.
    correct_answer:
      form.question_format === 'DRAWING_PROMPT'
        ? null
        : form.question_format === 'MCQ'
          ? form.correct_option_id
          : form.correct_answer,
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

  if (form.question_format === 'DRAWING_PROMPT') {
    questionData.drawing_marks = form.drawing_marks ? Number(form.drawing_marks) : null;
  }

  return questionData;
}

export default function InlineQuestionEditor({
  question,
  sources,
  paper,
  expanded,
  onToggle,
  getToken,
  onSaved,
  index = 0,
}: InlineQuestionEditorProps) {
  const theme = useTheme();
  const [form, setForm] = useState<FormData>(() => getInitialFormData(question, sources, paper));
  const [optionImagesEnabled, setOptionImagesEnabled] = useState(
    () => question.options?.some((o) => !!o.image_url) ?? false
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Reset form when question changes (e.g. after save + refetch)
  useEffect(() => {
    if (!expanded) {
      setForm(getInitialFormData(question, sources, paper));
      setDirty(false);
      setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
    }
  }, [question, sources, paper, expanded]);

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
    setForm(getInitialFormData(question, sources, paper));
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
          p: { xs: 0.75, md: 1 },
          cursor: 'pointer',
          bgcolor: index % 2 === 1 ? 'action.hover' : 'background.paper',
          '&:hover': { bgcolor: 'action.selected' },
          borderColor: 'divider',
        }}
        onClick={onToggle}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Typography variant="body2" fontWeight={600} sx={{ minWidth: 28, fontSize: '0.8rem' }}>
            Q{question.display_order}
          </Typography>
          <Chip
            label={question.question_format}
            size="small"
            variant="outlined"
            sx={{ fontSize: '0.65rem', height: 20 }}
          />
          <Chip
            label={QB_QUESTION_STATUS_LABELS[question.status]}
            size="small"
            sx={{
              bgcolor: QB_QUESTION_STATUS_COLORS[question.status] + '20',
              color: QB_QUESTION_STATUS_COLORS[question.status],
              fontWeight: 600,
              fontSize: '0.65rem',
              height: 20,
            }}
          />
          <MathText
            text={question.question_text || 'No content'}
            variant="caption"
            color="text.secondary"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              ml: 0.5,
              fontSize: '0.75rem',
            }}
          />
          {question.question_image_url && (
            <Box
              component="img"
              src={question.question_image_url}
              alt=""
              sx={{
                width: 32,
                height: 32,
                objectFit: 'cover',
                borderRadius: 0.5,
                flexShrink: 0,
                border: 1,
                borderColor: 'divider',
              }}
            />
          )}
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
            {/* Grouped rather than one flat wall of 58 chips. Sections mirror
                the subject hierarchy in nexus_qb_tags. */}
            <Box sx={{ mb: 2 }}>
              {groupQBCategories().map((group) => (
                <Box key={group.label} sx={{ mb: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ display: 'block', fontWeight: 600, mb: 0.25 }}
                  >
                    {group.label}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {group.categories.map((cat) => (
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
                </Box>
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

        {/* Section 2b: Drawing setup. Only a drawing has any of this, and a
            teacher who opened a drawing came for it, so it starts open. It owns
            the solution image and video for this format, which is why the
            Solution panel below hides its copies of those two. */}
        {form.question_format === 'DRAWING_PROMPT' && (
          <Accordion defaultExpanded disableGutters variant="outlined" sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2" fontWeight={600}>Drawing setup</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <DrawingQuestionPanel
                value={{
                  drawing_marks: form.drawing_marks,
                  solution_image: form.solution_image,
                  solution_video_url: form.solution_video_url,
                }}
                onChange={(patch) => {
                  setForm((prev) => ({ ...prev, ...patch }));
                  setDirty(true);
                }}
                getToken={getToken}
                questionText={form.question_text}
                categories={form.categories}
              />
            </AccordionDetails>
          </Accordion>
        )}

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
            {/* Drawing setup owns these two for a drawing. Rendering both would
                be two controls writing one column, and the last one touched
                would silently win. */}
            {form.question_format !== 'DRAWING_PROMPT' && (
              <>
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
              </>
            )}
          </AccordionDetails>
        </Accordion>

        {/* Section 4: Source (collapsible) */}
        <Accordion defaultExpanded={false} disableGutters variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" fontWeight={600}>Source & Format</Typography>
          </AccordionSummary>
          <AccordionDetails>
            {/* Where the question came from. Read-only: this tuple lives on the
                paper and its source row, and Save has never carried these four
                fields, so an editable control here only invites a correction
                that is silently thrown away. */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
              <TextField
                label="Exam Type"
                value={
                  form.exam_type
                    ? QB_EXAM_TYPE_LABELS[form.exam_type] || form.exam_type
                    : 'Not recorded'
                }
                size="small"
                sx={{ minWidth: 140 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Year"
                value={form.year || '-'}
                size="small"
                sx={{ width: 90 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Session"
                value={form.session || '-'}
                size="small"
                sx={{ width: 110 }}
                InputProps={{ readOnly: true }}
              />
              <TextField
                label="Q#"
                value={form.question_number || '-'}
                size="small"
                sx={{ width: 70 }}
                InputProps={{ readOnly: true }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1.5, display: 'block' }}>
              Taken from the paper this question belongs to. Change it on the paper.
            </Typography>
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
