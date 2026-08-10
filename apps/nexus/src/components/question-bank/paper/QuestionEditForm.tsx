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
  MenuItem,
  Select,
  alpha,
  useTheme,
} from '@neram/ui';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
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
import type { QBQuestionSection, QBDrawingFocusPoint } from '@neram/database';
import {
  QB_CATEGORY_LABELS,
  groupQBCategories,
  QB_EXAM_TYPE_LABELS,
  QB_SECTIONS,
  qbSectionLabel,
} from '@neram/database';
import type { ImageState } from '@/lib/bulk-upload-schema';
import ImageUploadZone from '../ImageUploadZone';
import DrawingQuestionPanel from '../DrawingQuestionPanel';
import MathField from '@/components/common/MathField';
// The keyword list that decides this has one home, in AnswerKeyGrid. A second
// copy here would drift the moment either changed.
import { questionNeedsImage } from '@/components/question-bank/AnswerKeyGrid';

/** What a question's Source & Format panel needs when it has no source row. */
export type PaperFallback = Pick<NexusQBOriginalPaper, 'exam_type' | 'year' | 'session'>;

export interface QuestionEditFormProps {
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
  getToken: () => Promise<string | null>;
  onSaved: () => void;
  onCancel: () => void;
  /**
   * Move this question into another section. Omitted means the control is hidden.
   *
   * Deliberately its own callback rather than a form field: a section write goes
   * to PATCH /api/question-bank/papers/[id]/sections, not the question endpoint,
   * and it saves on the spot. Folding it into the form's dirty state would let
   * Save rewrite a section a teacher only opened the menu on.
   */
  onChangeSection?: (questionId: string, section: QBQuestionSection) => Promise<void>;
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
  colour_constraint: string;
  design_principle_tested: string;
  objects_to_include: Array<{ name: string; count?: number }>;
  drawing_focus_points: QBDrawingFocusPoint[];
  drawing_reference_image?: ImageState;
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
    colour_constraint: question.colour_constraint ?? '',
    design_principle_tested: question.design_principle_tested ?? '',
    objects_to_include: question.objects_to_include ?? [],
    drawing_focus_points: question.drawing_focus_points ?? [],
    drawing_reference_image: question.drawing_reference_image_url
      ? { url: question.drawing_reference_image_url, uploaded: true }
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
    // A drawing has no key and never will, so send null rather than the empty
    // string this used to write. A column every other reader treats as "the
    // key" should not hold a blank.
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
    questionData.colour_constraint = form.colour_constraint || null;
    questionData.design_principle_tested = form.design_principle_tested || null;
    questionData.objects_to_include = form.objects_to_include.length ? form.objects_to_include : null;
    // Blank rows are what an "Add focus point" press leaves behind when a
    // teacher changes their mind, and they would render as empty bullets.
    const focus = form.drawing_focus_points.filter((f) => f.text.trim());
    questionData.drawing_focus_points = focus.length ? focus : null;
    questionData.drawing_reference_image_url = form.drawing_reference_image?.uploaded
      ? form.drawing_reference_image.url
      : null;
  }

  return questionData;
}

/**
 * The editing form for one question, extracted from InlineQuestionEditor.
 *
 * No expand and collapse machinery lives here: the detail pane owns which
 * question is open, so this component is always the open one. That is the whole
 * point of the extraction, since an accordion inside a pane that is already a
 * disclosure is one disclosure too many.
 *
 * There is exactly one Save, in the header. The editor this came from also
 * repeated Save and Cancel in a sticky footer, which meant two controls doing
 * the same thing on a form short enough to see whole.
 */
export default function QuestionEditForm({
  question,
  sources,
  paper,
  getToken,
  onSaved,
  onCancel,
  onChangeSection,
}: QuestionEditFormProps) {
  const theme = useTheme();
  const [form, setForm] = useState<FormData>(() => getInitialFormData(question, sources, paper));
  const [optionImagesEnabled, setOptionImagesEnabled] = useState(
    () => question.options?.some((o) => !!o.image_url) ?? false
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sectionSaving, setSectionSaving] = useState(false);
  /**
   * Hindi is empty on almost every paper, so it costs a field per option and one
   * for the stem to show it by default. Seeded from the question so a paper that
   * does carry Hindi never hides it behind a button nobody would think to press.
   */
  const [showHindi, setShowHindi] = useState(
    () => Boolean(question.question_text_hi) || (question.options ?? []).some((o) => o.text_hi),
  );
  /** A 140px dropzone on a question with no figure is 140px of nothing. */
  const [showImageZone, setShowImageZone] = useState(
    () => Boolean(question.question_image_url) || questionNeedsImage(question),
  );

  // Reload whenever the pane swaps in a different question, or the same one
  // comes back refetched after a save. No `expanded` guard any more: the pane
  // unmounts nothing, so this effect is the only thing that resets the form.
  useEffect(() => {
    setForm(getInitialFormData(question, sources, paper));
    setDirty(false);
    setOptionImagesEnabled(question.options?.some((o) => !!o.image_url) ?? false);
    setShowHindi(Boolean(question.question_text_hi) || (question.options ?? []).some((o) => o.text_hi));
    setShowImageZone(Boolean(question.question_image_url) || questionNeedsImage(question));
  }, [question, sources, paper]);

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
    onCancel();
  };

  // Keyboard shortcuts
  useEffect(() => {
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
  }, [dirty, saving]);

  return (
    <Paper variant="outlined" sx={{ border: 'none', overflow: 'visible' }}>
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
        {onChangeSection && (
          <Select
            size="small"
            value={question.section ?? ''}
            displayEmpty
            disabled={sectionSaving}
            SelectDisplayProps={{ 'aria-label': `Section for question ${question.display_order ?? 0}` }}
            onChange={async (e) => {
              setSectionSaving(true);
              try {
                await onChangeSection(question.id, e.target.value as QBQuestionSection);
              } finally {
                setSectionSaving(false);
              }
            }}
            sx={{ minWidth: 180, minHeight: 44 }}
          >
            <MenuItem value="" disabled><em>Unsectioned</em></MenuItem>
            {QB_SECTIONS.map((s) => (
              <MenuItem key={s} value={s} sx={{ minHeight: 44 }}>{qbSectionLabel(s)}</MenuItem>
            ))}
          </Select>
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
        <IconButton size="small" onClick={handleCancel} title="Cancel" aria-label="Cancel">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2 } }}>
        {/* Section 1: Content (always visible) */}
        <Box sx={{ mb: 2 }}>
          <MathField
            label="Question text"
            value={form.question_text}
            onChange={(next) => updateField('question_text', next)}
            minRows={2}
          />
          {showHindi ? (
            <TextField
              label="Question text (Hindi)"
              value={form.question_text_hi}
              onChange={(e) => updateField('question_text_hi', e.target.value)}
              multiline
              minRows={1}
              maxRows={4}
              fullWidth
              size="small"
              sx={{ mb: 1.5 }}
            />
          ) : (
            <Button
              size="small"
              onClick={() => setShowHindi(true)}
              sx={{ textTransform: 'none', minHeight: 36 }}
            >
              Add Hindi
            </Button>
          )}

          {/* Question Image */}
          {showImageZone ? (
            <>
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
            </>
          ) : (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setShowImageZone(true)}
              sx={{ textTransform: 'none', minHeight: 36, display: 'block' }}
            >
              Add image
            </Button>
          )}

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
              {/*
                One row per option: radio, field, delete. The stacked layout this
                replaces gave every option its own Hindi field and dropzone, so
                four options ran past a phone screen on their own.
              */}
              {form.options.map((opt, idx) => (
                <Box key={opt.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, mb: 0.5 }}>
                  <Radio
                    size="small"
                    checked={form.correct_option_id === opt.id}
                    onChange={() => updateField('correct_option_id', opt.id)}
                    inputProps={{ 'aria-label': `Mark option ${opt.id.toUpperCase()} correct` }}
                    sx={{ p: 1 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <MathField
                      label={`Option ${opt.id.toUpperCase()}`}
                      value={opt.text ?? ''}
                      onChange={(next) => handleOptionTextChange(opt.id, next)}
                      minRows={1}
                    />
                    {showHindi && (
                      <TextField
                        label={`Option ${opt.id.toUpperCase()} (Hindi)`}
                        value={opt.text_hi ?? ''}
                        onChange={(e) => handleOptionTextHiChange(opt.id, e.target.value)}
                        fullWidth
                        size="small"
                      />
                    )}
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
                  {/* Guard kept from the editor this came from: a two-option MCQ
                      is the floor, and there is no undo for a deleted option. */}
                  {form.options.length > 2 && (
                    <IconButton
                      aria-label={`Remove option ${opt.id.toUpperCase()}`}
                      onClick={() => removeOption(opt.id)}
                      sx={{ p: 1 }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  )}
                </Box>
              ))}
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
                  colour_constraint: form.colour_constraint,
                  design_principle_tested: form.design_principle_tested,
                  objects_to_include: form.objects_to_include,
                  drawing_focus_points: form.drawing_focus_points,
                  drawing_reference_image: form.drawing_reference_image,
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
            {/* Solutions are where the maths actually lives, so these two get the
                preview as well: a worked answer is exactly what you cannot check
                by reading raw LaTeX. */}
            <MathField
              label="Brief Explanation"
              value={form.explanation_brief}
              onChange={(next) => updateField('explanation_brief', next)}
              minRows={2}
            />
            <MathField
              label="Detailed Explanation"
              value={form.explanation_detailed}
              onChange={(next) => updateField('explanation_detailed', next)}
              minRows={3}
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
            <Typography variant="body2" fontWeight={600}>Source &amp; Format</Typography>
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

      {/*
        The unsaved hint, without a second Save and Cancel. The editor this came
        from repeated both here, so a dirty form showed two of each: the pane is
        short enough that the header pair is always reachable.
      */}
      {dirty && (
        <Box
          sx={{
            position: 'sticky',
            bottom: 0,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            p: 1.5,
            bgcolor: alpha(theme.palette.warning.main, 0.06),
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="caption" color="text.secondary">
            Unsaved changes (Ctrl+S to save)
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
